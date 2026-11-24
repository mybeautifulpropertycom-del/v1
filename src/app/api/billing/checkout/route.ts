import { requireRomanianOrder } from "@/lib/stripe-server";
import { videoEnabled } from "@/lib/video-service";
import {
  publicPath,
  publicationErrors,
  type Profile,
  type Property,
} from "@/lib/model";
import { embeddedCheckout } from "@/lib/embedded-checkout";
import { publishPropertyPhotos } from "@/lib/free-photo-publication";
import { checkoutPackage } from "@/lib/checkout-package";
import {
  orderPackage,
  publicationPackages,
  type PublicationPackage,
} from "@/lib/publication-packages";
import { createLiveCheckout, liveBillingStatus } from "@/lib/stripe-live";
import {
  billingDatabase,
  billingFailure,
  BillingError,
  billingJson,
  billingUser,
  PROPERTY_PACKAGE_CURRENCY,
  readLimitedBody,
  stripeClient,
  stripeConfiguration,
  checkoutMode,
  UUID,
  selectedPublicationPackage,
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
    const params = new URL(request.url).searchParams;
    const workflow = params.get("workflow") === "publish";
    const mode = checkoutMode();
    if (mode === "off" && !workflow) return billingJson({ enabled: false });
    const { user, db } = await billingUser(request);
    const id = params.get("propertyId");
    if (!id || !UUID.test(id))
      throw new BillingError("Alege o proprietate.", 400);
    const { data: property, error } = await db
      .from("properties")
      .select("*")
      .eq("id", id)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (workflow && mode !== "live" && property) {
      const { data: order, error: orderError } = await billingDatabase()
        .from("property_orders")
        .select("amount,includes_video")
        .eq("property_id", id)
        .eq("owner_id", user.id)
        .maybeSingle();
      if (orderError)
        throw new BillingError("Starea publicării nu a putut fi verificată.");
      if (order?.amount === 0 && order.includes_video === false)
        return billingJson({
          enabled: mode !== "off",
          mode,
          allowed: true,
          paid: false,
          published: property.status === "published",
          package: "photos",
          videoIncluded: false,
          publicPath: publicPath(property),
        });
    }
    if (mode === "off") return billingJson({ enabled: false });
    if (mode === "live") {
      const admin = billingDatabase();
      const response = await liveBillingStatus(admin, id, user.id);
      if (!workflow) return response;
      const [
        { data: job, error: jobError },
        { data: order, error: orderError },
      ] = await Promise.all([
        admin
          .from("property_video_jobs")
          .select(
            videoEnabled()
              ? "status,video_url,poster_url,provider_phase,attempts,updated_at,last_error" +
                  ([
                    "photo-montage",
                    "higgsfield-montage",
                    "byteplus-montage",
                  ].includes(process.env.PROPERTY_VIDEO_MODE || "")
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
          "Configurarea publicării este incompletă. Contactează asistența.",
        );
      const state = await response.json();
      return billingJson({
        ...state,
        published: property?.status === "published",
        publicPath: property ? publicPath(property) : null,
        publicationError: order?.publication_error ?? null,
        videoStatus:
          state.videoIncluded === false ? null : (job?.status ?? null),
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
          state.videoIncluded !== false && state.allowed && job?.video_url
            ? { src: job.video_url, poster: job.poster_url }
            : null,
      });
    }
    if (!property) return billingJson({ enabled: true, paid: false });
    const { data: order, error: orderError } = await billingDatabase()
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
    let id: unknown;
    let embedded = false;
    let publishFree = false;
    let selected: PublicationPackage = "video";
    const body = await readLimitedBody(request, 1024);
    try {
      const parsed = JSON.parse(body);
      id = parsed?.propertyId;
      embedded = parsed?.embedded === true;
      publishFree = parsed?.publishFree === true;
      selected = selectedPublicationPackage(parsed?.package);
    } catch {
      throw new BillingError("Alege o proprietate salvată.", 400);
    }
    if (typeof id !== "string" || !UUID.test(id))
      throw new BillingError("Alege o proprietate salvată.", 400);
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
        "Proprietatea nu este disponibilă în contul tău.",
        404,
      );
    if (profileError || !profile)
      throw new BillingError("Completează mai întâi profilul de agent.", 400);
    const errors = publicationErrors(property as Property, profile as Profile);
    if (errors.length) throw new BillingError(errors.join(" "), 400);
    if (selected === "photos") {
      if (!publishFree)
        throw new BillingError(
          "Prezentarea cu fotografii este acum gratuită. Reîncarcă pagina și alege «Publică proprietatea».",
          409,
        );
      return billingJson(await publishPropertyPhotos(id, user.id));
    }
    const config = stripeConfiguration();
    if (embedded)
      return await embeddedCheckout(
        config,
        id,
        user.id,
        profile as Profile,
        selected,
      );
    if (config.live)
      return await createLiveCheckout(config, id, user.id, selected);
    const admin = billingDatabase(config);
    const { data: reserved, error: reservationError } = await admin.rpc(
      "reserve_stripe_test_order",
      {
        listing_id: id,
        agent_id: user.id,
        include_video: publicationPackages[selected].includesVideo,
      },
    );
    if (reservationError || !reserved)
      throw new BillingError("The Stripe test database setup is incomplete.");
    if (reserved.status === "paid") return billingJson({ paid: true });
    const prepared = await checkoutPackage(
      config,
      id,
      user.id,
      reserved,
      selected,
    );
    if (prepared.processing) return billingJson({ processing: true });
    const order = prepared.order;
    requireRomanianOrder(order);
    const offer = publicationPackages[orderPackage(order)];
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
                description: `${offer.description} Plată de test de ${offer.price} RON; fără plată reală sau comandă video.`,
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
          publication_package: offer.id,
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
