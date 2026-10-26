import { after } from "next/server";
import { platformAdmin, adminFailure } from "@/lib/platform-admin";
import {
  billingJson,
  BillingError,
  readLimitedBody,
  UUID,
  stripeClient,
  stripeConfiguration,
} from "@/lib/stripe-server";
import { publicationErrors, type Property, type Profile } from "@/lib/model";
import { recordLiveSession } from "@/lib/stripe-live";
import { wakeVideoWorker } from "@/lib/higgsfield-worker";
export const runtime = "nodejs";
export const maxDuration = 180;
export async function POST(request: Request) {
  try {
    const { user, admin } = await platformAdmin(request);
    let body;
    try {
      body = JSON.parse(await readLimitedBody(request, 2048));
    } catch {
      throw new BillingError("Choose a saved property.", 400);
    }
    const id = body?.propertyId;
    if (typeof id !== "string" || !UUID.test(id))
      throw new BillingError("Choose a saved property.", 400);
    const reason =
      typeof body.reason === "string"
        ? body.reason.trim()
        : "Administrator publication";
    if (!reason || reason.length > 500)
      throw new BillingError("Add a reason of up to 500 characters.", 400);
    const { data: property, error } = await admin
      .from("properties")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!property)
      throw new BillingError("This property is no longer available.", 404);
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("*")
      .eq("id", property.owner_id)
      .single();
    if (profileError || !profile)
      throw new BillingError("The agent profile is unavailable.", 400);
    const errors = publicationErrors(property as Property, profile as Profile);
    if (errors.length) throw new BillingError(errors.join(" "), 400);
    const { data: order, error: orderError } = await admin
      .from("property_orders")
      .select("id,status,checkout_session_id,attempt")
      .eq("property_id", id)
      .maybeSingle();
    if (orderError) throw orderError;
    // Stop an already-open payment form before granting publication at no cost.
    if (order?.checkout_session_id && order.status === "pending") {
      const config = stripeConfiguration();
      if (!config.live)
        throw new BillingError(
          "Review the existing live checkout before complimentary publication.",
          409,
        );
      const stripe = stripeClient(config.key);
      const session = await stripe.checkout.sessions.retrieve(
        order.checkout_session_id,
      );
      if (!session.livemode)
        throw new BillingError("The existing checkout needs review.", 409);
      if (session.payment_status === "paid")
        await recordLiveSession(config, session, 0);
      else if (session.status === "complete")
        throw new BillingError(
          "A payment is being confirmed. Refresh shortly before publishing.",
          409,
        );
      else if (session.status === "open")
        await stripe.checkout.sessions.expire(session.id);
    }
    const { data: result, error: publishError } = await admin.rpc(
      "admin_publish_property",
      {
        listing_id: id,
        actor_id: user.id,
        grant_reason: reason,
        expected_session: order?.checkout_session_id || null,
        expected_attempt: order?.attempt ?? null,
      },
    );
    if (publishError) {
      if (publishError.code === "42501")
        throw new BillingError("Administrator access is required.", 403);
      if (publishError.code === "P0409")
        throw new BillingError(
          "Checkout changed while you were publishing. Refresh and try again.",
          409,
        );
      throw new BillingError(
        "Publication could not be completed. Check the admin database upgrade and the property details.",
      );
    }
    if (!result?.published)
      throw new BillingError("Publication is not confirmed yet.");
    if (process.env.HIGGSFIELD_ENABLED === "true") after(wakeVideoWorker);
    return billingJson(result);
  } catch (error) {
    return adminFailure(error);
  }
}
