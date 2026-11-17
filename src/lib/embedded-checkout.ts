import { requireRomanianOrder } from "./stripe-server";
import type Stripe from "stripe";
import type { Profile } from "./model";
import {
  billingDatabase,
  billingJson,
  BillingError,
  livePaymentsEnabled,
  PROPERTY_PACKAGE_CURRENCY,
  stripeClient,
  stripeConfiguration,
} from "./stripe-server";
import { recordLiveSession } from "./stripe-live";
import { checkoutPackage } from "./checkout-package";
import {
  orderPackage,
  publicationPackages,
  type PublicationPackage,
} from "./publication-packages";

export async function embeddedCheckout(
  config: ReturnType<typeof stripeConfiguration>,
  propertyId: string,
  ownerId: string,
  profile: Profile,
  selected: PublicationPackage = "video",
) {
  const billingDetails = {
    name: profile.name.trim(),
    email: profile.email.trim(),
    phone: profile.phone.trim(),
  };
  if (config.live && !livePaymentsEnabled())
    throw new BillingError(
      "Publicarea proprietăților va fi disponibilă după activarea serviciului video.",
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
        include_video: publicationPackages[selected].includesVideo,
      })
    : await admin.rpc("reserve_stripe_test_order", {
        listing_id: propertyId,
        agent_id: ownerId,
        include_video: publicationPackages[selected].includesVideo,
      });
  if (error || !reservation)
    throw new BillingError(
      "Configurarea publicării este incompletă. Contactează asistența.",
    );
  if (config.live && (reservation.published || reservation.paid))
    return billingJson(reservation);
  let order = config.live ? reservation.order : reservation;
  if (!config.live && order.status === "paid")
    return billingJson({ testPaid: true });
  const prepared = await checkoutPackage(
    config,
    propertyId,
    ownerId,
    order,
    selected,
  );
  if (prepared.processing) return billingJson({ processing: true });
  order = prepared.order;
  requireRomanianOrder(order);
  const offer = publicationPackages[orderPackage(order)];
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();
  if (!publishableKey?.startsWith(config.live ? "pk_live_" : "pk_test_"))
    throw new BillingError(
      "Formularul securizat de plată nu este configurat. Contactează asistența.",
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
      previous.ui_mode === "elements" &&
      previous.client_secret &&
      previous.customer
    ) {
      await stripe.customers.update(
        typeof previous.customer === "string"
          ? previous.customer
          : previous.customer.id,
        billingDetails,
      );
      return billingJson({
        clientSecret: previous.client_secret,
        publishableKey,
        mode: config.live ? "live" : "test",
        billingDetails,
        package: offer.id,
        amount: offer.amount,
      });
    }
    // Close an old hosted/embedded-page session before replacing it, so two payable
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
        "Sesiunea de plată se actualizează. Încearcă din nou în câteva momente.",
      );
    order = rotated;
  }
  const metadata = {
    application: config.live ? "mbp_property_purchase" : "mbp_test_checkout",
    order_id: order.id,
    property_id: propertyId,
    owner_id: ownerId,
    publication_package: offer.id,
  };
  // A customer supplies the saved profile's name and contact details without
  // collecting them again. Creating a customer does not save the payment method.
  const customer = await stripe.customers.create(
    { ...billingDetails, metadata: { owner_id: ownerId, order_id: order.id } },
    { idempotencyKey: `mbp-card-customer-${order.id}-${order.attempt}` },
  );
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    locale: "ro",
    ui_mode: "elements",
    customer: customer.id,
    return_url: `${config.origin}/preview/${propertyId}`,
    wallet_options: { link: { display: "never" } },
    saved_payment_method_options: { payment_method_save: "disabled" },
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
            description: config.live
              ? `${offer.description} Plată unică de ${offer.price} RON, fără abonament.`
              : "Doar plată de test. Fără plată reală, publicare sau generare video.",
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
    idempotencyKey: `mbp-card-${config.live ? "live" : "test"}-${order.id}-${order.attempt}`,
  });
  if (session.livemode !== config.live)
    throw new BillingError("The payment mode does not match.");
  if (session.status === "complete") return billingJson({ processing: true });
  if (!session.client_secret)
    throw new BillingError(
      "Formularul securizat de plată nu a putut fi deschis.",
    );
  const { data: saved, error: saveError } = await admin
    .from(table)
    .update({ checkout_session_id: session.id })
    .eq("id", order.id)
    .eq("attempt", order.attempt)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (saveError)
    throw new BillingError(
      "Sesiunea de plată nu a putut fi salvată. Încearcă din nou.",
    );
  if (!saved) {
    if (session.status === "open")
      await stripe.checkout.sessions.expire(session.id);
    return billingJson({ processing: true });
  }
  return billingJson({
    clientSecret: session.client_secret,
    publishableKey,
    mode: config.live ? "live" : "test",
    billingDetails,
    package: offer.id,
    amount: offer.amount,
  });
}
