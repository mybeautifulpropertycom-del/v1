import { after } from "next/server";
import { wakeVideoWorker } from "@/lib/higgsfield-worker";
import {
  billingDatabase,
  billingFailure,
  BillingError,
  billingJson,
  billingUser,
  readLimitedBody,
  stripeConfiguration,
  UUID,
} from "@/lib/stripe-server";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request: Request) {
  try {
    const { user } = await billingUser(request);
    let id: unknown;
    try {
      id = JSON.parse(await readLimitedBody(request, 1024)).propertyId;
    } catch {
      throw new BillingError("Choose a saved property.", 400);
    }
    if (typeof id !== "string" || !UUID.test(id))
      throw new BillingError("Choose a saved property.", 400);
    const config = stripeConfiguration();
    if (!config.live)
      throw new BillingError("A paid property is required.", 400);
    const { data, error } = await billingDatabase(config).rpc(
      "retry_property_video",
      {
        listing_id: id,
        agent_id: user.id,
      },
    );
    if (error)
      throw new BillingError(
        "Your video could not be queued. Please try again.",
      );
    if (!data)
      throw new BillingError(
        "Retry is unavailable. Wait one minute after a failure; after three attempts, please contact support.",
        409,
      );
    if (process.env.HIGGSFIELD_ENABLED === "true") after(wakeVideoWorker);
    return billingJson({ videoStatus: "queued" });
  } catch (error) {
    return billingFailure(error);
  }
}
