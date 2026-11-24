import { supportedPackage } from "./stripe-server";
import { requireRomanianOrder } from "./stripe-server";
// Server-only live purchase handling. Sandbox orders cannot grant these rights.
import type Stripe from "stripe";
import { checkoutPackage } from "./checkout-package";
import {
  orderPackage,
  publicationPackages,
  type PublicationPackage,
} from "./publication-packages";
import {
  billingDatabase,
  BillingError,
  billingJson,
  livePaymentsEnabled,
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
  admin: Admin,
  propertyId: string,
  ownerId: string,
) {
  let canPurchase = livePaymentsEnabled();
  if (canPurchase) {
    try {
      stripeConfiguration();
    } catch (error) {
      if (!(error instanceof BillingError)) throw error;
      canPurchase = false;
    }
  }
  if (canPurchase) await activate(admin);
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
      .select("status,video_status,includes_video")
      .eq("property_id", propertyId)
      .eq("owner_id", ownerId)
      .maybeSingle(),
  ]);
  if (settingsError || accessError || orderError)
    throw new BillingError("The live billing database setup is incomplete.");
  return billingJson({
    enabled: true,
    mode: "live",
    canPurchase,
    requiresPayment: settings.enabled,
    paid: order?.status === "paid",
    allowed: Boolean(allowed),
    status: order?.status ?? "unpaid",
    package: order ? orderPackage(order) : null,
    videoIncluded: order?.includes_video ?? true,
    videoStatus:
      order?.includes_video === false ? null : (order?.video_status ?? null),
  });
}

export async function createLiveCheckout(
  config: Config,
  propertyId: string,
  ownerId: string,
  selected: PublicationPackage = "video",
) {
  if (!livePaymentsEnabled())
    throw new BillingError(
      "Plățile vor fi disponibile după activarea serviciului de filme de prezentare.",
    );
  const admin = billingDatabase(config);
  await activate(admin);
  const { data: allowed, error: accessError } = await admin.rpc(
    "property_has_live_access",
    { listing_id: propertyId, agent_id: ownerId },
  );
  if (accessError)
    throw new BillingError("The live billing database setup is incomplete.");
  if (allowed) return liveBillingStatus(admin, propertyId, ownerId);
  const { data: reserved, error } = await admin.rpc("reserve_property_order", {
    listing_id: propertyId,
    agent_id: ownerId,
    include_video: publicationPackages[selected].includesVideo,
  });
  if (error || !reserved)
    throw new BillingError("Plata nu a putut fi pregătită. Încearcă din nou.");
  // The complimentary grant may have committed between the initial access
  // read and the reservation lock. Recheck after reserving; a later grant
  // rotates the attempt and is caught by the session-save fence below.
  const { data: nowAllowed, error: recheckError } = await admin.rpc(
    "property_has_live_access",
    {
      listing_id: propertyId,
      agent_id: ownerId,
    },
  );
  if (recheckError)
    throw new BillingError("Publication access could not be checked.");
  if (nowAllowed) return liveBillingStatus(admin, propertyId, ownerId);
  if (reserved.status === "refunded" || reserved.status === "disputed")
    throw new BillingError(
      "Contactează asistența despre plata acestei proprietăți înainte de a plăti din nou.",
      409,
    );
  if (reserved.status === "paid")
    return billingJson({ paid: true, allowed: true });
  const prepared = await checkoutPackage(
    config,
    propertyId,
    ownerId,
    reserved,
    selected,
  );
  if (prepared.processing) return billingJson({ processing: true });
  const order = prepared.order;
  requireRomanianOrder(order);
  const offer = publicationPackages[orderPackage(order)];
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
    publication_package: offer.id,
  };
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      locale: "ro",
      allowed_payment_method_types: ["card"],
      adaptive_pricing: { enabled: false },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: PROPERTY_PACKAGE_CURRENCY,
            unit_amount: offer.amount,
            product_data: {
              name: offer.name,
              description: `${offer.description} Plată unică de ${offer.price} RON; fără abonament.`,
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
  const { data: saved, error: saveError } = await admin
    .from("property_orders")
    .update({ checkout_session_id: session.id })
    .eq("id", order.id)
    .eq("attempt", order.attempt)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (saveError)
    throw new BillingError("Plata nu a putut fi salvată. Încearcă din nou.");
  if (!saved) {
    // An administrator may have granted publication while Stripe was creating
    // this session. Never return a payable URL after the attempt was fenced.
    if (session.status === "open")
      await stripe.checkout.sessions.expire(session.id);
    return billingJson({ processing: true });
  }
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
    !supportedPackage(intent.amount, intent.currency) ||
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
    charge.amount !== intent.amount ||
    charge.currency !== intent.currency
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
    !supportedPackage(
      order.amount,
      order.currency,
      order.includes_video ?? true,
    ) ||
    order.amount !== intent.amount ||
    order.currency !== intent.currency ||
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
    !supportedPackage(session.amount_total, session.currency) ||
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
