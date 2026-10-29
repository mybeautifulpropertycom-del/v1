import {
  billingUser,
  billingJson,
  BillingError,
  readLimitedBody,
  UUID,
} from "@/lib/stripe-server";
import { lifecycleDatabase } from "@/lib/account-cleanup";
import { adminFailure } from "@/lib/platform-admin";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const { user, db } = await billingUser(request);
    let body;
    try {
      body = JSON.parse(await readLimitedBody(request, 1024));
    } catch {
      throw new BillingError("Choose your property.", 400);
    }
    if (!UUID.test(body?.propertyId || ""))
      throw new BillingError("Choose your property.", 400);
    const { data: property, error } = await db
      .from("properties")
      .select("id,status")
      .eq("id", body.propertyId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (error || !property)
      throw new BillingError(
        "This property is not available in your account.",
        404,
      );
    if (property.status !== "published")
      throw new BillingError(
        "Publish this property before downloading its video.",
        409,
      );
    const admin = lifecycleDatabase();
    const { data: access, error: accessError } = await admin.rpc(
      "property_has_live_access",
      { listing_id: property.id, agent_id: user.id },
    );
    if (accessError || access !== true)
      throw new BillingError("Publication access is required.", 403);
    const { data: job, error: jobError } = await admin
      .from("property_video_jobs")
      .select("order_id,video_url,status")
      .eq("property_id", property.id)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (jobError || !job?.video_url || job.status === "cancelled")
      throw new BillingError("Your video is not ready to download yet.", 409);
    const url = new URL(job.video_url);
    const base = `/storage/v1/object/public/property-videos/`;
    const expected = `${user.id}/${job.order_id}/`;
    const path = url.pathname.slice(base.length);
    if (
      url.origin !== new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin ||
      !url.pathname.startsWith(base) ||
      !path.startsWith(expected) ||
      !/^[a-zA-Z0-9_-]+\.mp4$/.test(path.slice(expected.length)) ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    )
      throw new BillingError(
        "The saved video is not available for download.",
        409,
      );
    const { data: signed, error: signingError } = await admin.storage
      .from("property-videos")
      .createSignedUrl(path, 60, { download: "my-beautiful-property.mp4" });
    if (signingError || !signed?.signedUrl)
      throw new BillingError("Your download could not be prepared.");
    return billingJson({ url: signed.signedUrl });
  } catch (error) {
    return adminFailure(error);
  }
}
