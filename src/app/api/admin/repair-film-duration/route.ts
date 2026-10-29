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
import { arkCredentials, bytePlusModel } from "@/lib/byteplus-video";
import {
  bytePlusBudgetSettings,
  VideoBudgetError,
} from "@/lib/byteplus-budget";
export const runtime = "nodejs";
export const maxDuration = 180;
export async function POST(request: Request) {
  try {
    const { user, admin } = await platformAdmin(request);
    if (
      !videoEnabled() ||
      process.env.PROPERTY_VIDEO_MODE !== "byteplus-montage" ||
      bytePlusModel().endpoint !== "dreamina-seedance-2-5-260628"
    )
      throw new BillingError(
        "Enable the configured Seedance 2.5 service before repairing this film.",
        409,
      );
    arkCredentials();
    const { rate, maxUsd } = bytePlusBudgetSettings(bytePlusModel());
    let body;
    try {
      body = JSON.parse(await readLimitedBody(request, 1024));
    } catch {
      throw new BillingError("Choose a saved property.", 400);
    }
    if (typeof body?.propertyId !== "string" || !UUID.test(body.propertyId))
      throw new BillingError("Choose a saved property.", 400);
    const { data, error } = await admin.rpc("admin_repair_byteplus_duration", {
      listing_id: body.propertyId,
      actor_id: user.id,
      p_rate: rate,
      p_max: maxUsd,
    });
    if (error)
      throw new BillingError(
        error.code === "P0409"
          ? "Repair is unavailable: the scene state or approved budget needs review. Saved scenes have not changed."
          : "Install the Seedance duration database upgrade before repairing this film.",
        409,
      );
    if (data?.videoStatus !== "processing")
      throw new BillingError("Repair was not confirmed.", 409);
    after(wakeVideoWorker);
    return billingJson(data);
  } catch (error) {
    if (error instanceof VideoBudgetError)
      return billingJson({ error: error.message }, 409);
    return adminFailure(error);
  }
}
