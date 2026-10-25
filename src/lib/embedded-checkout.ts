import type Stripe from "stripe";
import {
  billingDatabase,
  billingJson,
  BillingError,
  livePaymentsEnabled,
  PROPERTY_PACKAGE_CENTS,
  PROPERTY_PACKAGE_CURRENCY,
  stripeClient,
  stripeConfiguration,
} from "./stripe-server";
import { recordLiveSession } from "./stripe-live";

export async function embeddedCheckout(
  config: ReturnType<typeof stripeConfiguration>,
  propertyId: string,
  ownerId: string,
) {
  if (config.live && !livePaymentsEnabled())
    throw new BillingError(
      "Property publication will open when our video service launches.",
    );
  const admin = billingDatabase(config);
  if (config.live) {
    const { error } = await admin.rpc("activate_property_billing");
    if (error) throw new BillingError("The live billing setup is incomplete.");
  }
  const { data: reservation, error } = config.live
    ? await admin.rpc("request_property_publication", {
        listing_id: propertyId,
        agent_id: ownerId,
      })
    : await admin.rpc("reserve_stripe_test_order", {
        listing_id: propertyId,
        agent_id: ownerId,
      });
  if (error || !reservation)
    throw new BillingError(
      "Publication setup is incomplete. Please contact support.",
    );
  if (config.live && (reservation.published || reservation.paid))
    return billingJson(reservation);
  let order = config.live ? reservation.order : reservation;
  if (!config.live && order.status === "paid")
    return billingJson({ testPaid: true });
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();
  if (!publishableKey?.startsWith(config.live ? "pk_live_" : "pk_test_"))
    throw new BillingError(
      "The secure payment form is not configured. Please contact support.",
    );
  const stripe = stripeClient(config.key);
  const table = config.live ? "property_orders" : "stripe_test_orders";
  if (order.checkout_session_id) {
    const previous = await stripe.checkout.sessions.retrieve(
      order.checkout_session_id,
    );
    if (previous.livemode !== config.live)
      throw new BillingError("The payment mode does not match this property.");
    if (previous.payment_status === "paid") {
      if (config.live) await recordLiveSession(config, previous, 0);
      return billingJson({ processing: true });
    }
    if (previous.status === "complete")
      return billingJson({ processing: true });
    if (
      previous.status === "open" &&
      previous.ui_mode === "embedded_page" &&
      previous.client_secret
    )
      return billingJson({
        clientSecret: previous.client_secret,
        publishableKey,
        mode: config.live ? "live" : "test",
      });
    // Close an old hosted/open session before replacing it, so two payable
    // sessions cannot remain open for the same property.
    if (previous.status === "open")
      await stripe.checkout.sessions.expire(previous.id);
    const { data: rotated, error: rotateError } = await admin
      .from(table)
      .update({
        attempt: order.attempt + 1,
        checkout_session_id: null,
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      })
      .eq("id", order.id)
      .eq("attempt", order.attempt)
      .eq("checkout_session_id", previous.id)
      .eq("status", "pending")
      .select("*")
      .single();
    if (rotateError || !rotated)
      throw new BillingError(
        "Your payment session is updating. Please try again shortly.",
      );
    order = rotated;
  }
  const metadata = {
    application: config.live ? "mbp_property_purchase" : "mbp_test_checkout",
    order_id: order.id,
    property_id: propertyId,
    owner_id: ownerId,
  };
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    ui_mode: "embedded_page",
    redirect_on_completion: "never",
    allowed_payment_method_types: ["card"],
    adaptive_pricing: { enabled: false },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: PROPERTY_PACKAGE_CURRENCY,
          unit_amount: PROPERTY_PACKAGE_CENTS,
          product_data: {
            name: "Property website + presentation video",
            description: config.live
              ? "Publish this property and receive one presentation video. One payment, no subscription."
              : "Test checkout only. No real payment, publication or video generation.",
          },
        },
      },
    ],
    client_reference_id: order.id,
    metadata,
    ...(config.live ? { payment_intent_data: { metadata } } : {}),
    expires_at: Math.floor(new Date(order.expires_at).getTime() / 1000),
  };
  const session = await stripe.checkout.sessions.create(params, {
    idempotencyKey: `mbp-embedded-${config.live ? "live" : "test"}-${order.id}-${order.attempt}`,
  });
  if (session.livemode !== config.live)
    throw new BillingError("The payment mode does not match.");
  if (session.status === "complete") return billingJson({ processing: true });
  if (!session.client_secret)
    throw new BillingError("The secure payment form could not be opened.");
  const { error: saveError } = await admin
    .from(table)
    .update({ checkout_session_id: session.id })
    .eq("id", order.id)
    .eq("attempt", order.attempt)
    .eq("status", "pending");
  if (saveError)
    throw new BillingError(
      "Your payment session could not be saved. Please try again.",
    );
  return billingJson({
    clientSecret: session.client_secret,
    publishableKey,
    mode: config.live ? "live" : "test",
  });
}
