import { publicationErrors, type Profile, type Property } from "@/lib/model";
import { embeddedCheckout } from "@/lib/embedded-checkout";
import { createLiveCheckout, liveBillingStatus } from "@/lib/stripe-live";
import {
  billingDatabase,
  billingFailure,
  BillingError,
  billingJson,
  billingUser,
  PROPERTY_PACKAGE_CENTS,
  PROPERTY_PACKAGE_CURRENCY,
  readLimitedBody,
  stripeClient,
  stripeConfiguration,
  checkoutMode,
  UUID,
} from "@/lib/stripe-server";

export const runtime = "nodejs";
export const maxDuration = 60;
type VideoBillingState = {
  status: string;
  video_url: string | null;
  poster_url: string | null;
  attempts: number;
  updated_at: string;
  provider_phase?: string;
  last_error?: string | null;
  montage_plan?: { shots?: unknown[] } | null;
  montage_next_shot?: number;
};

export async function GET(request: Request) {
  try {
    if (checkoutMode() === "off") return billingJson({ enabled: false });
    const { user, db } = await billingUser(request);
    const config = stripeConfiguration();
    const id = new URL(request.url).searchParams.get("propertyId");
    if (!id || !UUID.test(id))
      throw new BillingError("Choose a property.", 400);
    const { data: property, error } = await db
      .from("properties")
      .select("id,status,slug")
      .eq("id", id)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (config.live) {
      const response = await liveBillingStatus(config, id, user.id);
      if (new URL(request.url).searchParams.get("workflow") !== "publish")
        return response;
      const admin = billingDatabase(config);
      const [
        { data: job, error: jobError },
        { data: order, error: orderError },
      ] = await Promise.all([
        admin
          .from("property_video_jobs")
          .select(
            process.env.HIGGSFIELD_ENABLED === "true"
              ? "status,video_url,poster_url,provider_phase,attempts,updated_at,last_error" +
                  (["photo-montage", "higgsfield-montage"].includes(
                    process.env.PROPERTY_VIDEO_MODE || "",
                  )
                    ? ",montage_plan,montage_next_shot"
                    : "")
              : "status,video_url,poster_url,attempts,updated_at",
          )
          .eq("property_id", id)
          .eq("owner_id", user.id)
          .maybeSingle()
          .overrideTypes<VideoBillingState | null, { merge: false }>(),
        admin
          .from("property_orders")
          .select("publication_error")
          .eq("property_id", id)
          .eq("owner_id", user.id)
          .maybeSingle(),
      ]);
      if (jobError || orderError)
        throw new BillingError(
          "Publication setup is incomplete. Please contact support.",
        );
      const state = await response.json();
      return billingJson({
        ...state,
        published: property?.status === "published",
        publicPath: property ? `/p/${property.slug}` : null,
        publicationError: order?.publication_error ?? null,
        videoStatus: job?.status ?? null,
        videoNeedsReview: ["uncertain", "provider_failed"].includes(
          job?.provider_phase || "",
        ),
        videoAttempts: job?.attempts ?? 0,
        videoError: job?.last_error ?? null,
        videoProgress: job?.montage_plan?.shots?.length
          ? {
              completed: job.montage_next_shot ?? 0,
              total: job.montage_plan.shots.length,
            }
          : null,
        canRetryVideo:
          job?.status === "failed" &&
          !["uncertain", "provider_failed"].includes(
            job?.provider_phase || "",
          ) &&
          job.attempts < 3 &&
          Date.now() - Date.parse(job.updated_at) >= 60000,
        film:
          state.allowed && job?.video_url
            ? { src: job.video_url, poster: job.poster_url }
            : null,
      });
    }
    if (!property) return billingJson({ enabled: true, paid: false });
    const { data: order, error: orderError } = await billingDatabase(config)
      .from("stripe_test_orders")
      .select("status")
      .eq("property_id", id)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (orderError)
      throw new BillingError("The Stripe test database setup is incomplete.");
    return billingJson({ enabled: true, paid: order?.status === "paid" });
  } catch (error) {
    return billingFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user, db } = await billingUser(request);
    const config = stripeConfiguration();
    let id: unknown;
    let embedded = false;
    const body = await readLimitedBody(request, 1024);
    try {
      const parsed = JSON.parse(body);
      id = parsed?.propertyId;
      embedded = parsed?.embedded === true;
    } catch {
      throw new BillingError("Choose a saved property.", 400);
    }
    if (typeof id !== "string" || !UUID.test(id))
      throw new BillingError("Choose a saved property.", 400);
    const [{ data: property, error }, { data: profile, error: profileError }] =
      await Promise.all([
        db
          .from("properties")
          .select("*")
          .eq("id", id)
          .eq("owner_id", user.id)
          .single(),
        db.from("profiles").select("*").eq("id", user.id).single(),
      ]);
    if (error || !property)
      throw new BillingError(
        "This property is not available in your workspace.",
        404,
      );
    if (profileError || !profile)
      throw new BillingError("Complete your agent profile first.", 400);
    const errors = publicationErrors(property as Property, profile as Profile);
    if (errors.length) throw new BillingError(errors.join(" "), 400);
    if (embedded) return await embeddedCheckout(config, id, user.id);
    if (config.live) return await createLiveCheckout(config, id, user.id);
    const admin = billingDatabase(config);
    const { data: order, error: reservationError } = await admin.rpc(
      "reserve_stripe_test_order",
      { listing_id: id, agent_id: user.id },
    );
    if (reservationError || !order)
      throw new BillingError("The Stripe test database setup is incomplete.");
    if (order.status === "paid") return billingJson({ paid: true });
    const stripe = stripeClient(config.key);
    // A paid session may arrive before its webhook. Do not offer another charge.
    if (order.checkout_session_id) {
      const previous = await stripe.checkout.sessions.retrieve(
        order.checkout_session_id,
      );
      if (previous.livemode)
        throw new BillingError("Only test sessions are accepted.");
      if (previous.payment_status === "paid" || previous.status === "complete")
        return billingJson({ processing: true });
      if (
        previous.status === "open" &&
        previous.url &&
        new URL(previous.url).origin === "https://checkout.stripe.com"
      )
        return billingJson({ url: previous.url });
    }
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
                  "One property. One-time payment of $97 USD. Test checkout only; no real payment or video order.",
              },
            },
          },
        ],
        client_reference_id: order.id,
        metadata: {
          application: "mbp_test_checkout",
          order_id: order.id,
          property_id: id,
          owner_id: user.id,
        },
        expires_at: Math.floor(new Date(order.expires_at).getTime() / 1000),
        success_url: `${config.origin}/dashboard/properties/${id}?checkout=success`,
        cancel_url: `${config.origin}/dashboard/properties/${id}?checkout=cancelled`,
      },
      { idempotencyKey: `mbp-test-${order.id}-${order.attempt}` },
    );
    if (
      session.livemode ||
      !session.url ||
      new URL(session.url).origin !== "https://checkout.stripe.com"
    )
      throw new BillingError(
        "A valid Stripe test checkout could not be created.",
      );
    if (session.status === "complete") return billingJson({ processing: true });
    const { error: saveError } = await admin
      .from("stripe_test_orders")
      .update({ checkout_session_id: session.id })
      .eq("id", order.id)
      .eq("attempt", order.attempt)
      .eq("status", "pending");
    if (saveError)
      throw new BillingError(
        "Your test checkout could not be saved. Please try again.",
      );
    return billingJson({ url: session.url });
  } catch (error) {
    return billingFailure(error);
  }
}
