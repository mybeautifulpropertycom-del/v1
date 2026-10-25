// Server-only live purchase handling. Sandbox orders cannot grant these rights.
import type Stripe from "stripe";
import {
  billingDatabase,
  BillingError,
  billingJson,
  livePaymentsEnabled,
  PROPERTY_PACKAGE_CENTS,
  PROPERTY_PACKAGE_CURRENCY,
  stripeClient,
  stripeConfiguration,
  UUID,
} from "./stripe-server";
type Config = ReturnType<typeof stripeConfiguration>;
type Admin = ReturnType<typeof billingDatabase>;
const APP = "mbp_property_purchase";
const reference = (value: string | { id: string } | null) =>
  typeof value === "string" ? value : value?.id;

async function activate(admin: Admin) {
  if (!livePaymentsEnabled()) return;
  const { error } = await admin.rpc("activate_property_billing");
  if (error)
    throw new BillingError("The live billing database setup is incomplete.");
}
export async function liveBillingStatus(
  config: Config,
  propertyId: string,
  ownerId: string,
) {
  const admin = billingDatabase(config);
  await activate(admin);
  const [
    { data: settings, error: settingsError },
    { data: allowed, error: accessError },
    { data: order, error: orderError },
  ] = await Promise.all([
    admin
      .from("property_billing_settings")
      .select("enabled")
      .eq("singleton", true)
      .single(),
    admin.rpc("property_has_live_access", {
      listing_id: propertyId,
      agent_id: ownerId,
    }),
    admin
      .from("property_orders")
      .select("status,video_status")
      .eq("property_id", propertyId)
      .eq("owner_id", ownerId)
      .maybeSingle(),
  ]);
  if (settingsError || accessError || orderError)
    throw new BillingError("The live billing database setup is incomplete.");
  return billingJson({
    enabled: true,
    mode: "live",
    canPurchase: livePaymentsEnabled(),
    requiresPayment: settings.enabled,
    paid: order?.status === "paid",
    allowed: Boolean(allowed),
    status: order?.status ?? "unpaid",
    videoStatus: order?.video_status ?? null,
  });
}

export async function createLiveCheckout(
  config: Config,
  propertyId: string,
  ownerId: string,
) {
  if (!livePaymentsEnabled())
    throw new BillingError(
      "Purchases will open when the presentation-video service launches.",
    );
  const admin = billingDatabase(config);
  await activate(admin);
  const { data: allowed, error: accessError } = await admin.rpc(
    "property_has_live_access",
    { listing_id: propertyId, agent_id: ownerId },
  );
  if (accessError)
    throw new BillingError("The live billing database setup is incomplete.");
  if (allowed) return billingJson({ paid: true, allowed: true });
  const { data: order, error } = await admin.rpc("reserve_property_order", {
    listing_id: propertyId,
    agent_id: ownerId,
  });
  if (error || !order)
    throw new BillingError(
      "Your purchase could not be prepared. Please try again.",
    );
  if (order.status === "refunded" || order.status === "disputed")
    throw new BillingError(
      "Please contact support about this property's payment before purchasing again.",
      409,
    );
  if (order.status === "paid")
    return billingJson({ paid: true, allowed: true });
  const stripe = stripeClient(config.key);
  if (order.checkout_session_id) {
    const previous = await stripe.checkout.sessions.retrieve(
      order.checkout_session_id,
    );
    if (!previous.livemode)
      throw new BillingError("The checkout mode does not match this purchase.");
    if (previous.payment_status === "paid") {
      // Stripe retrieval, never a browser return URL, can also reconcile a late webhook.
      await recordLiveSession(config, previous, 0);
      return billingJson({ processing: true });
    }
    if (previous.status === "complete")
      return billingJson({ processing: true });
    if (
      previous.status === "open" &&
      previous.url &&
      new URL(previous.url).origin === "https://checkout.stripe.com"
    )
      return billingJson({ url: previous.url });
  }
  const metadata = {
    application: APP,
    order_id: order.id,
    property_id: propertyId,
    owner_id: ownerId,
  };
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
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
              description:
                "One property website and one presentation video. One-time payment of $97 USD; no subscription.",
            },
          },
        },
      ],
      metadata,
      client_reference_id: order.id,
      payment_intent_data: { metadata },
      expires_at: Math.floor(new Date(order.expires_at).getTime() / 1000),
      success_url: `${config.origin}/dashboard/properties/${propertyId}?checkout=success`,
      cancel_url: `${config.origin}/dashboard/properties/${propertyId}?checkout=cancelled`,
    },
    { idempotencyKey: `mbp-live-${order.id}-${order.attempt}` },
  );
  if (!session.livemode)
    throw new BillingError("A live checkout could not be created.");
  if (session.status === "complete") return billingJson({ processing: true });
  if (
    !session.url ||
    new URL(session.url).origin !== "https://checkout.stripe.com"
  )
    throw new BillingError("A secure checkout address could not be created.");
  const { error: saveError } = await admin
    .from("property_orders")
    .update({ checkout_session_id: session.id })
    .eq("id", order.id)
    .eq("attempt", order.attempt)
    .eq("status", "pending");
  if (saveError)
    throw new BillingError(
      "Your checkout could not be saved. Please try again.",
    );
  return billingJson({ url: session.url });
}

// Always inspect current Stripe payment/refund/dispute state, not just the
// possibly delayed event snapshot. Database fulfilment is atomic and ordered.
export async function synchronizeLiveIntent(
  config: Config,
  intentId: string,
  eventCreated: number,
) {
  const stripe = stripeClient(config.key);
  const intent = await stripe.paymentIntents.retrieve(intentId);
  if (intent.metadata.application !== APP) return;
  const { order_id, property_id, owner_id } = intent.metadata;
  if (
    !intent.livemode ||
    intent.amount !== PROPERTY_PACKAGE_CENTS ||
    intent.currency !== PROPERTY_PACKAGE_CURRENCY ||
    !UUID.test(order_id || "") ||
    !UUID.test(property_id || "") ||
    !UUID.test(owner_id || "")
  )
    throw new BillingError("Unexpected live payment details.", 400);
  if (intent.status !== "succeeded") return;
  const chargeId = reference(intent.latest_charge);
  if (!chargeId)
    throw new BillingError(
      "The payment charge is not available; retry delivery.",
    );
  const charge = await stripe.charges.retrieve(chargeId);
  if (
    !charge.livemode ||
    reference(charge.payment_intent) !== intentId ||
    !charge.paid ||
    charge.amount !== PROPERTY_PACKAGE_CENTS ||
    charge.currency !== PROPERTY_PACKAGE_CURRENCY
  )
    throw new BillingError("The charge does not match this purchase.", 400);
  let status = charge.amount_refunded >= charge.amount ? "refunded" : "paid";
  if (status !== "refunded" && charge.disputed) {
    const disputes = await stripe.disputes.list({
      charge: charge.id,
      limit: 100,
    });
    if (
      disputes.has_more ||
      !disputes.data.length ||
      disputes.data.some(
        (d) => d.status !== "won" && d.status !== "warning_closed",
      )
    )
      status = "disputed";
  }
  const admin = billingDatabase(config);
  const { data: order, error } = await admin
    .from("property_orders")
    .select("*")
    .eq("id", order_id)
    .single();
  if (error || !order)
    throw new BillingError(
      "The purchase record is not available; retry delivery.",
    );
  if (
    (order.property_id && order.property_id !== property_id) ||
    (order.owner_id && order.owner_id !== owner_id)
  )
    throw new BillingError("The payment does not match this purchase.", 400);
  // Reconciliation has no event timestamp; retain the current ordering marker.
  const { error: saveError } = await admin.rpc("apply_property_payment", {
    order_id,
    intent_id: intentId,
    new_status: status,
    event_created: eventCreated || order.last_event_created,
  });
  if (saveError)
    throw new BillingError("The payment could not be saved; retry delivery.");
}
export async function recordLiveSession(
  config: Config,
  session: Stripe.Checkout.Session,
  eventCreated: number,
) {
  if (
    session.metadata?.application !== APP ||
    session.payment_status !== "paid"
  )
    return;
  const intentId = reference(session.payment_intent);
  if (
    !session.livemode ||
    session.mode !== "payment" ||
    session.amount_total !== PROPERTY_PACKAGE_CENTS ||
    session.currency !== PROPERTY_PACKAGE_CURRENCY ||
    session.client_reference_id !== session.metadata.order_id ||
    !intentId
  )
    throw new BillingError("Unexpected live checkout details.", 400);
  await synchronizeLiveIntent(config, intentId, eventCreated);
}
export async function handleLiveWebhook(config: Config, event: Stripe.Event) {
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  )
    await recordLiveSession(config, event.data.object, event.created);
  else if (event.type === "charge.refunded") {
    const intentId = reference(event.data.object.payment_intent);
    if (intentId) await synchronizeLiveIntent(config, intentId, event.created);
  } else if (
    event.type === "charge.dispute.created" ||
    event.type === "charge.dispute.updated" ||
    event.type === "charge.dispute.closed"
  ) {
    const intentId = reference(event.data.object.payment_intent);
    if (intentId) await synchronizeLiveIntent(config, intentId, event.created);
  }
  return billingJson({ received: true });
}
