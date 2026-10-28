import { videoEnabled } from "@/lib/video-service";
import { after } from "next/server";
import { wakeVideoWorker } from "@/lib/higgsfield-worker";
import type Stripe from "stripe";
import { handleLiveWebhook } from "@/lib/stripe-live";
import {
  billingDatabase,
  billingFailure,
  BillingError,
  billingJson,
  PROPERTY_PACKAGE_CENTS,
  PROPERTY_PACKAGE_CURRENCY,
  readLimitedBody,
  stripeClient,
  stripeConfiguration,
  UUID,
} from "@/lib/stripe-server";

export const runtime = "nodejs";
export const maxDuration = 180;
export async function POST(request: Request) {
  try {
    const config = stripeConfiguration();
    const signature = request.headers.get("stripe-signature");
    if (!signature) throw new BillingError("Missing Stripe signature.", 400);
    const raw = await readLimitedBody(request, 256000);
    let event: Stripe.Event;
    try {
      event = stripeClient(config.key).webhooks.constructEvent(
        raw,
        signature,
        config.webhookSecret,
      );
    } catch {
      throw new BillingError("Invalid Stripe signature.", 400);
    }
    if (event.livemode !== config.live)
      throw new BillingError(
        "The Stripe event does not match the configured payment mode.",
        400,
      );
    if (config.live) {
      const response = await handleLiveWebhook(config, event);
      if (videoEnabled()) after(wakeVideoWorker);
      return response;
    }
    if (
      event.type !== "checkout.session.completed" &&
      event.type !== "checkout.session.async_payment_succeeded"
    )
      return billingJson({ received: true });
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.metadata?.application !== "mbp_test_checkout")
      return billingJson({ received: true });
    const { order_id, property_id, owner_id } = session.metadata;
    if (session.payment_status !== "paid")
      return billingJson({ received: true });
    if (
      session.livemode ||
      session.mode !== "payment" ||
      session.amount_total !== PROPERTY_PACKAGE_CENTS ||
      session.currency !== PROPERTY_PACKAGE_CURRENCY ||
      session.client_reference_id !== order_id ||
      !UUID.test(order_id || "") ||
      !UUID.test(property_id || "") ||
      !UUID.test(owner_id || "")
    )
      throw new BillingError("Unexpected test payment details.", 400);
    const admin = billingDatabase(config);
    const { data: order, error } = await admin
      .from("stripe_test_orders")
      .select("*")
      .eq("id", order_id)
      .single();
    if (error || !order)
      throw new BillingError("Test order is not available; retry delivery.");
    // A property/account may have been deleted while Checkout was open. Keep
    // the test receipt, without ever recreating or publishing that property.
    if (
      (order.property_id && order.property_id !== property_id) ||
      (order.owner_id && order.owner_id !== owner_id)
    )
      throw new BillingError("Test payment does not match its order.", 400);
    if (order.status === "paid") return billingJson({ received: true });
    const { error: updateError } = await admin
      .from("stripe_test_orders")
      .update({
        status: "paid",
        stripe_session_id: session.id,
        paid_at: new Date(event.created * 1000).toISOString(),
      })
      .eq("id", order_id)
      .eq("status", "pending");
    if (updateError)
      throw new BillingError(
        "Test payment could not be saved; retry delivery.",
      );
    return billingJson({ received: true });
  } catch (error) {
    return billingFailure(error);
  }
}
