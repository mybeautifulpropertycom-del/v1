import { after } from "next/server";
import { platformAdmin, adminFailure } from "@/lib/platform-admin";
import {
  billingJson,
  BillingError,
  readLimitedBody,
  UUID,
} from "@/lib/stripe-server";
import { videoEnabled } from "@/lib/video-service";
import { wakeVideoWorker } from "@/lib/higgsfield-worker";
import { arkCredentials } from "@/lib/byteplus-video";
export const runtime = "nodejs";
export const maxDuration = 180;
export async function POST(request: Request) {
  try {
    const { user, admin } = await platformAdmin(request);
    if (
      !videoEnabled() ||
      process.env.PROPERTY_VIDEO_MODE !== "byteplus-montage"
    )
      throw new BillingError(
        "Enable BytePlus video processing before resuming.",
        409,
      );
    arkCredentials();
    let body;
    try {
      body = JSON.parse(await readLimitedBody(request, 1024));
    } catch {
      throw new BillingError("Choose a saved property.", 400);
    }
    if (typeof body?.propertyId !== "string" || !UUID.test(body.propertyId))
      throw new BillingError("Choose a saved property.", 400);
    const { data, error } = await admin.rpc("admin_resume_byteplus_film", {
      listing_id: body.propertyId,
      actor_id: user.id,
    });
    if (error)
      throw new BillingError(
        error.code === "P0409"
          ? "Resume is unavailable. Review the original scene request; no new generation was started."
          : "Resume is unavailable. Check the BytePlus recovery database upgrade.",
        409,
      );
    if (data?.videoStatus !== "processing")
      throw new BillingError("Resume was not confirmed.", 409);
    after(wakeVideoWorker);
    return billingJson(data);
  } catch (error) {
    return adminFailure(error);
  }
}
