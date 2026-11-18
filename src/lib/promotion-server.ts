// Server only. Promotion payments never grant publication or launch campaigns.
import type Stripe from "stripe";
import type { Profile } from "./model";
import {
  billingDatabase,
  BillingError,
  billingJson,
  livePaymentsEnabled,
  stripeClient,
  stripeConfiguration,
  UUID,
} from "./stripe-server";
import {
  isPromotionPackage,
  promotionPackages,
  type PromotionOrder,
} from "./promotion-packages";

export const PROMOTION_APPLICATION = "up_google_search_promotion";
type Config = ReturnType<typeof stripeConfiguration>;
const ref = (value: string | { id: string } | null) =>
  typeof value === "string" ? value : value?.id;
export const promotionColumns =
  "id,owner_id,property_id,package,amount,currency,livemode,payment_status,campaign_status,target_area,notes,snapshot,created_at,paid_at,updated_at,spent_amount,impressions,clicks,report,campaign_id,stop_required,stop_reason,refunded_amount";
export async function promotionOrder(
  config: Config,
  id: string,
  ownerId?: string,
) {
  const admin = billingDatabase(config);
  let query = admin.from("promotion_orders").select("*").eq("id", id);
  if (ownerId) query = query.eq("owner_id", ownerId);
  const { data, error } = await query.single();
  if (error || !data)
    throw new BillingError("Comanda de promovare nu este disponibilă.", 404);
  return data as PromotionOrder & {
    checkout_session_id: string | null;
    payment_intent_id: string | null;
    expires_at: string;
    last_event_created: number;
  };
}

async function synchronizeIntent(
  config: Config,
  intentId: string,
  eventCreated: number,
) {
  const stripe = stripeClient(config.key);
  const intent = await stripe.paymentIntents.retrieve(intentId);
  if (intent.metadata.application !== PROMOTION_APPLICATION) return false;
  const { order_id, property_id, owner_id, promotion_package } =
    intent.metadata;
  if (
    !UUID.test(order_id || "") ||
    !UUID.test(property_id || "") ||
    !UUID.test(owner_id || "") ||
    !isPromotionPackage(promotion_package) ||
    intent.livemode !== config.live ||
    intent.currency !== "ron" ||
    intent.amount !== promotionPackages[promotion_package].amount
  )
    throw new BillingError(
      "Datele plății de promovare nu corespund comenzii.",
      400,
    );
  if (intent.status !== "succeeded") return true;
  const chargeId = ref(intent.latest_charge);
  if (!chargeId)
    throw new BillingError("Confirmarea plății nu este încă disponibilă.");
  const charge = await stripe.charges.retrieve(chargeId);
  if (
    charge.livemode !== config.live ||
    !charge.paid ||
    ref(charge.payment_intent) !== intent.id ||
    charge.amount !== intent.amount ||
    charge.currency !== intent.currency
  )
    throw new BillingError("Confirmarea plății nu corespunde comenzii.", 400);
  let status = charge.amount_refunded > 0 ? "refunded" : "paid";
  if (status === "paid" && charge.disputed) {
    const disputes = await stripe.disputes.list({
      charge: charge.id,
      limit: 100,
    });
    if (
      disputes.has_more ||
      !disputes.data.length ||
      disputes.data.some(
        (item) => !["won", "warning_closed"].includes(item.status),
      )
    )
      status = "disputed";
  }
  const order = await promotionOrder(config, order_id);
  if (
    order.livemode !== config.live ||
    order.package !== promotion_package ||
    order.amount !== intent.amount ||
    order.currency !== intent.currency ||
    (order.owner_id && order.owner_id !== owner_id) ||
    (order.property_id && order.property_id !== property_id)
  )
    throw new BillingError("Plata nu corespunde comenzii salvate.", 400);
  const { error } = await billingDatabase(config).rpc(
    "apply_promotion_payment",
    {
      order_id,
      intent_id: intent.id,
      new_status: status,
      refund_amount: charge.amount_refunded,
      event_created: eventCreated || order.last_event_created,
    },
  );
  if (error)
    throw new BillingError(
      "Confirmarea promovării nu a putut fi salvată. Reîncearcă livrarea.",
    );
  return true;
}
async function recordSession(
  config: Config,
  session: Stripe.Checkout.Session,
  eventCreated: number,
) {
  if (session.metadata?.application !== PROMOTION_APPLICATION) return false;
  if (session.payment_status !== "paid") return true;
  const offer = session.metadata.promotion_package;
  const intentId = ref(session.payment_intent);
  if (
    session.livemode !== config.live ||
    session.mode !== "payment" ||
    !isPromotionPackage(offer) ||
    session.amount_total !== promotionPackages[offer].amount ||
    session.currency !== "ron" ||
    session.client_reference_id !== session.metadata.order_id ||
    !intentId
  )
    throw new BillingError("Datele Stripe nu corespund promovării.", 400);
  await synchronizeIntent(config, intentId, eventCreated);
  return true;
}
export async function promotionWebhook(config: Config, event: Stripe.Event) {
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  )
    return recordSession(config, event.data.object, event.created);
  if (
    event.type === "charge.refunded" ||
    event.type === "charge.dispute.created" ||
    event.type === "charge.dispute.updated" ||
    event.type === "charge.dispute.closed"
  ) {
    const intentId = ref(event.data.object.payment_intent);
    if (intentId) return synchronizeIntent(config, intentId, event.created);
  }
  return false;
}

export async function cancelPromotion(
  config: Config,
  orderId: string,
  ownerId: string,
) {
  const order = await promotionOrder(config, orderId, ownerId);
  if (order.livemode !== config.live)
    throw new BillingError("Modul de plată al comenzii este diferit.", 409);
  if (order.payment_status !== "pending")
    throw new BillingError("Poți anula doar o plată nefinalizată.", 409);
  if (order.checkout_session_id) {
    const stripe = stripeClient(config.key);
    const session = await stripe.checkout.sessions.retrieve(
      order.checkout_session_id,
    );
    if (
      session.livemode !== config.live ||
      session.metadata?.application !== PROMOTION_APPLICATION ||
      session.metadata.order_id !== order.id ||
      session.client_reference_id !== order.id
    )
      throw new BillingError("Sesiunea Stripe nu corespunde comenzii.", 409);
    if (session.payment_status === "paid" || session.status === "complete") {
      await recordSession(config, session, 0);
      return billingJson({ processing: true });
    }
    if (session.status === "open")
      await stripe.checkout.sessions.expire(session.id);
  }
  const { error } = await billingDatabase(config)
    .from("promotion_orders")
    .update({
      payment_status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id)
    .eq("owner_id", ownerId)
    .eq("payment_status", "pending");
  if (error)
    throw new BillingError("Plata în așteptare nu a putut fi anulată.");
  return billingJson({ cancelled: true });
}

export async function promotionCheckout(
  config: Config,
  order: Awaited<ReturnType<typeof promotionOrder>>,
  profile: Pick<Profile, "name" | "email" | "phone">,
) {
  if (config.live && !livePaymentsEnabled())
    throw new BillingError("Plățile reale nu sunt încă activate.", 503);
  if (
    order.livemode !== config.live ||
    !isPromotionPackage(order.package) ||
    order.amount !== promotionPackages[order.package].amount ||
    order.currency !== "ron"
  )
    throw new BillingError("Comanda nu corespunde pachetului ales.", 409);
  if (order.payment_status !== "pending")
    return billingJson({ processing: true, orderId: order.id });
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();
  if (!publishableKey?.startsWith(config.live ? "pk_live_" : "pk_test_"))
    throw new BillingError(
      "Formularul securizat de plată nu este configurat. Contactează asistența.",
    );
  const billingDetails = {
    name: profile.name.trim(),
    email: profile.email.trim(),
    phone: profile.phone.trim(),
  };
  const paymentResponse = (clientSecret: string) =>
    billingJson({
      orderId: order.id,
      clientSecret,
      publishableKey,
      billingDetails,
      amount: order.amount,
      mode: config.live ? "live" : "test",
    });
  const stripe = stripeClient(config.key);
  // A single card session replaces a legacy hosted session. The distinct,
  // durable idempotency key avoids requiring a schema migration or opening
  // two payable sessions. Expired card sessions are cancelled, never rotated.
  const previousId = order.checkout_session_id;
  if (previousId) {
    const existing = await stripe.checkout.sessions.retrieve(previousId);
    if (
      existing.livemode !== config.live ||
      existing.metadata?.application !== PROMOTION_APPLICATION ||
      existing.metadata.order_id !== order.id ||
      existing.metadata.owner_id !== order.owner_id ||
      existing.metadata.property_id !== order.property_id ||
      existing.metadata.promotion_package !== order.package ||
      existing.client_reference_id !== order.id ||
      existing.amount_total !== order.amount ||
      existing.currency !== order.currency
    )
      throw new BillingError(
        "Sesiunea Stripe nu corespunde comenzii salvate.",
        409,
      );
    if (existing.payment_status === "paid" || existing.status === "complete") {
      await recordSession(config, existing, 0);
      return billingJson({ processing: true, orderId: order.id });
    }
    if (
      existing.status === "open" &&
      existing.ui_mode === "elements" &&
      existing.client_secret &&
      existing.customer
    ) {
      await stripe.customers.update(ref(existing.customer)!, billingDetails);
      return paymentResponse(existing.client_secret);
    }
    if (
      existing.ui_mode !== "elements" &&
      Date.parse(order.expires_at) > Date.now() + 31 * 60000
    ) {
      if (existing.status === "open")
        await stripe.checkout.sessions.expire(existing.id);
    } else {
      if (existing.status === "open")
        await stripe.checkout.sessions.expire(existing.id);
      const { error } = await billingDatabase(config)
        .from("promotion_orders")
        .update({
          payment_status: "cancelled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id)
        .eq("payment_status", "pending")
        .eq("checkout_session_id", previousId);
      if (error)
        throw new BillingError("Starea comenzii nu a putut fi actualizată.");
      throw new BillingError(
        "Sesiunea a expirat. Alege din nou pachetul de promovare.",
        409,
      );
    }
  }
  const offer = promotionPackages[order.package];
  const metadata = {
    application: PROMOTION_APPLICATION,
    order_id: order.id,
    property_id: order.property_id!,
    owner_id: order.owner_id!,
    promotion_package: offer.id,
  };
  const customer = await stripe.customers.create(
    {
      ...billingDetails,
      metadata: { owner_id: order.owner_id!, order_id: order.id },
    },
    { idempotencyKey: `up-promotion-card-customer-${order.id}` },
  );
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      locale: "ro",
      ui_mode: "elements",
      customer: customer.id,
      wallet_options: { link: { display: "never" } },
      saved_payment_method_options: { payment_method_save: "disabled" },
      allowed_payment_method_types: ["card"],
      adaptive_pricing: { enabled: false },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "ron",
            unit_amount: offer.amount,
            product_data: {
              name: `Promovare Google Search — ${offer.name}`,
              description: `${offer.price} RON buget publicitar pentru ${order.snapshot.title.slice(0, 120)}. Configurare și administrare incluse. Lansare manuală după confirmare.`,
            },
          },
        },
      ],
      client_reference_id: order.id,
      metadata,
      payment_intent_data: { metadata },
      expires_at: Math.floor(Date.parse(order.expires_at) / 1000),
      return_url: `${config.origin}/panou/promovare?payment=success&order=${order.id}`,
    },
    {
      idempotencyKey: `up-promotion-card-${config.live ? "live" : "test"}-${order.id}`,
    },
  );
  if (
    session.livemode === config.live &&
    (session.payment_status === "paid" || session.status === "complete")
  ) {
    await recordSession(config, session, 0);
    return billingJson({ processing: true, orderId: order.id });
  }
  if (
    session.livemode !== config.live ||
    session.status !== "open" ||
    session.ui_mode !== "elements" ||
    !session.client_secret
  )
    throw new BillingError("Formularul securizat de plată nu este disponibil.");
  const admin = billingDatabase(config);
  let save = admin
    .from("promotion_orders")
    .update({ checkout_session_id: session.id })
    .eq("id", order.id)
    .eq("payment_status", "pending");
  save = previousId
    ? save.eq("checkout_session_id", previousId)
    : save.is("checkout_session_id", null);
  const { data: saved, error } = await save.select("id").maybeSingle();
  if (error)
    throw new BillingError(
      "Sesiunea nu a putut fi salvată. Poți reîncerca fără o comandă nouă.",
    );
  if (!saved) {
    const current = await promotionOrder(config, order.id);
    if (
      current.checkout_session_id === session.id &&
      current.payment_status === "pending"
    )
      return paymentResponse(session.client_secret!);
    await stripe.checkout.sessions.expire(session.id);
    return billingJson({ processing: true, orderId: order.id });
  }
  return paymentResponse(session.client_secret!);
}
