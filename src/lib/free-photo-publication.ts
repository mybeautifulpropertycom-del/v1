import { recordLiveSession } from "./stripe-live";
import {
  billingDatabase,
  BillingError,
  stripeClient,
  stripeConfiguration,
} from "./stripe-server";

export async function publishPropertyPhotos(
  propertyId: string,
  ownerId: string,
) {
  const admin = billingDatabase();
  const { data: order, error: orderError } = await admin
    .from("property_orders")
    .select("status,attempt,checkout_session_id")
    .eq("property_id", propertyId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (orderError)
    throw new BillingError("Starea publicării nu a putut fi verificată.");

  if (order?.status === "pending" && order.checkout_session_id) {
    const config = stripeConfiguration();
    if (!config.live)
      throw new BillingError(
        "Există o sesiune de plată care trebuie verificată.",
        409,
      );
    const stripe = stripeClient(config.key);
    const session = await stripe.checkout.sessions.retrieve(
      order.checkout_session_id,
    );
    if (!session.livemode)
      throw new BillingError(
        "Există o sesiune de plată care trebuie verificată.",
        409,
      );
    if (session.payment_status === "paid")
      await recordLiveSession(config, session, 0);
    else if (session.status === "complete") return { processing: true };
    else if (session.status === "open")
      await stripe.checkout.sessions.expire(session.id);
  }

  const { data, error } = await admin.rpc("publish_property_photos", {
    listing_id: propertyId,
    agent_id: ownerId,
    expected_attempt: order?.attempt ?? null,
    expected_session: order?.checkout_session_id ?? null,
  });
  if (error?.code === "P0409")
    throw new BillingError(
      "Starea unei plăți anterioare necesită verificare. Reîncarcă pagina și încearcă din nou.",
      409,
    );
  if (error?.code === "P0404")
    throw new BillingError(
      "Proprietatea nu este disponibilă în contul tău.",
      404,
    );
  if (error?.code === "P0422")
    throw new BillingError(
      "Verifică detaliile proprietății și datele de contact.",
      400,
    );
  if (error || !data?.published)
    throw new BillingError(
      "Publicarea gratuită nu a putut fi confirmată. Încearcă din nou.",
    );
  return data;
}
