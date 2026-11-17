// Package changes must expire the previous Stripe session before rotating the
// durable attempt. A browser never supplies an amount or an entitlement.
import {
  orderPackage,
  publicationPackages,
  type PublicationPackage,
} from "./publication-packages";
import {
  billingDatabase,
  BillingError,
  stripeClient,
  stripeConfiguration,
} from "./stripe-server";
import { recordLiveSession } from "./stripe-live";

type Order = {
  id: string;
  attempt: number;
  status: string;
  checkout_session_id?: string | null;
  includes_video?: boolean;
  amount: number;
  currency: string;
  expires_at: string;
};

export async function checkoutPackage<T extends Order>(
  config: ReturnType<typeof stripeConfiguration>,
  propertyId: string,
  ownerId: string,
  order: T,
  selected: PublicationPackage,
): Promise<
  { order: T; processing?: never } | { processing: true; order?: never }
> {
  if (orderPackage(order) === selected) return { order };
  if (order.status !== "pending")
    throw new BillingError(
      "Pachetul confirmat al proprietății nu poate fi schimbat din plată.",
      409,
    );
  if (order.checkout_session_id) {
    const stripe = stripeClient(config.key);
    const previous = await stripe.checkout.sessions.retrieve(
      order.checkout_session_id,
    );
    if (previous.livemode !== config.live)
      throw new BillingError("Modul plății nu corespunde comenzii.", 409);
    if (previous.payment_status === "paid") {
      if (config.live) await recordLiveSession(config, previous, 0);
      return { processing: true };
    }
    if (previous.status === "complete") return { processing: true };
    if (previous.status === "open")
      await stripe.checkout.sessions.expire(previous.id);
  }
  const { data, error } = await billingDatabase(config).rpc(
    "change_publication_package",
    {
      listing_id: propertyId,
      agent_id: ownerId,
      include_video: publicationPackages[selected].includesVideo,
      expected_attempt: order.attempt,
      expected_session: order.checkout_session_id || null,
      test_mode: !config.live,
    },
  );
  if (error || !data)
    throw new BillingError(
      "Varianta de publicare sau sesiunea de plată s-a schimbat. Verifică starea și încearcă din nou.",
      409,
    );
  if (orderPackage(data) !== selected)
    throw new BillingError("Varianta de plată nu a fost confirmată.", 409);
  return { order: data as T };
}
