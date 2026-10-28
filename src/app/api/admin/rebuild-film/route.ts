import { videoEnabled } from "@/lib/video-service";
import { after } from "next/server";
import { platformAdmin, adminFailure } from "@/lib/platform-admin";
import {
  billingJson,
  BillingError,
  readLimitedBody,
  UUID,
} from "@/lib/stripe-server";
import { wakeVideoWorker } from "@/lib/higgsfield-worker";
export const runtime = "nodejs";
export const maxDuration = 180;
export async function POST(request: Request) {
  try {
    const { user, admin } = await platformAdmin(request);
    if (
      !["photo-montage", "higgsfield-montage", "byteplus-montage"].includes(
        process.env.PROPERTY_VIDEO_MODE || "",
      ) ||
      !videoEnabled()
    )
      throw new BillingError(
        "Enable the video service before rebuilding a film.",
        409,
      );
    let body;
    try {
      body = JSON.parse(await readLimitedBody(request, 1024));
    } catch {
      throw new BillingError("Choose a saved property.", 400);
    }
    if (typeof body?.propertyId !== "string" || !UUID.test(body.propertyId))
      throw new BillingError("Choose a saved property.", 400);
    const { data, error } = await admin.rpc("admin_rebuild_property_film", {
      listing_id: body.propertyId,
      actor_id: user.id,
      target_engine: ["higgsfield-montage", "byteplus-montage"].includes(
        process.env.PROPERTY_VIDEO_MODE || "",
      )
        ? "higgsfield-montage-v1"
        : "photo-montage-v1",
    });
    if (error) {
      if (error.code === "42501")
        throw new BillingError("Administrator access is required.", 403);
      if (error.code === "P0409")
        throw new BillingError(
          "Rebuilding is available for finished or failed films with publication access. A film may already be processing.",
          409,
        );
      throw new BillingError(
        "The film could not be queued. Check the Higgsfield film database upgrade.",
      );
    }
    if (data?.videoStatus !== "queued")
      throw new BillingError("The film has not been queued.");
    after(wakeVideoWorker);
    return billingJson(data);
  } catch (error) {
    return adminFailure(error);
  }
}
