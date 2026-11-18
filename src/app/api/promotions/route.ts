import {
  billingDatabase,
  billingFailure,
  BillingError,
  billingJson,
  billingUser,
  checkoutMode,
  livePaymentsEnabled,
  readLimitedBody,
  stripeConfiguration,
  UUID,
} from "@/lib/stripe-server";
import {
  isPromotionPackage,
  promotionKeywords,
} from "@/lib/promotion-packages";
import {
  cancelPromotion,
  promotionCheckout,
  promotionColumns,
  promotionOrder,
} from "@/lib/promotion-server";
import { publicPath, type Profile, type Property } from "@/lib/model";
import { siteUrl } from "@/lib/seo";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const { user, db } = await billingUser(request);
    const { data, error } = await db
      .from("promotion_orders")
      .select(promotionColumns)
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error)
      throw new BillingError(
        "Comenzile de promovare nu sunt încă disponibile. Încearcă din nou mai târziu.",
      );
    const mode = checkoutMode();
    let enabled = false;
    try {
      const config = stripeConfiguration();
      enabled =
        (!config.live || livePaymentsEnabled()) &&
        Boolean(
          process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim().startsWith(
            config.live ? "pk_live_" : "pk_test_",
          ),
        );
    } catch {
      /* Packages remain visible before payment activation. */
    }
    return billingJson({ orders: data, enabled, mode });
  } catch (error) {
    return billingFailure(error);
  }
}
export async function POST(request: Request) {
  try {
    const { user, db } = await billingUser(request);
    let body;
    try {
      body = JSON.parse(await readLimitedBody(request, 4000));
    } catch {
      throw new BillingError("Verifică proprietatea și pachetul ales.", 400);
    }
    if (body?.action === "request_stop") {
      if (
        !UUID.test(body.orderId || "") ||
        !["sold", "rented", "requested"].includes(body.reason)
      )
        throw new BillingError("Alege comanda și motivul opririi.", 400);
      const { error } = await db.rpc("request_promotion_stop", {
        order_id: body.orderId,
        reason: body.reason,
      });
      if (error)
        throw new BillingError(
          "Oprirea nu a putut fi solicitată. Verifică starea comenzii tale.",
          409,
        );
      return billingJson({ requested: true });
    }
    const config = stripeConfiguration();
    if (body?.action === "cancel" || body?.action === "resume") {
      if (!UUID.test(body.orderId || ""))
        throw new BillingError("Alege comanda ta.", 400);
      if (body.action === "cancel")
        return await cancelPromotion(config, body.orderId, user.id);
      const order = await promotionOrder(config, body.orderId, user.id);
      const { data: property } = await db
        .from("properties")
        .select("id")
        .eq("id", order.property_id)
        .eq("owner_id", user.id)
        .eq("status", "published")
        .maybeSingle();
      if (!property)
        throw new BillingError(
          "Proprietatea trebuie să fie publicată pentru promovare.",
          409,
        );
      const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      if (profileError || !profile)
        throw new BillingError("Completează profilul de agent.", 400);
      return await promotionCheckout(config, order, {
        ...profile,
        email: user.email || profile.email,
      });
    }
    if (config.live && !livePaymentsEnabled())
      throw new BillingError("Plățile reale nu sunt încă activate.");
    if (
      !UUID.test(body?.propertyId || "") ||
      !isPromotionPackage(body?.package) ||
      typeof body.targetArea !== "string" ||
      body.targetArea.trim().length < 2 ||
      body.targetArea.length > 160 ||
      typeof body.notes !== "string" ||
      body.notes.length > 1000
    )
      throw new BillingError(
        "Alege proprietatea, pachetul și zona de promovare.",
        400,
      );
    const [{ data: property, error }, { data: profile, error: profileError }] =
      await Promise.all([
        db
          .from("properties")
          .select("*")
          .eq("id", body.propertyId)
          .eq("owner_id", user.id)
          .eq("status", "published")
          .single(),
        db.from("profiles").select("*").eq("id", user.id).single(),
      ]);
    if (error || !property)
      throw new BillingError(
        "Alege o proprietate publicată din contul tău.",
        404,
      );
    if (profileError || !profile)
      throw new BillingError("Completează profilul de agent.", 400);
    const p = property as Property,
      contact = profile as Profile;
    const area = body.targetArea.trim(),
      notes = body.notes.trim();
    const { data: reserved, error: reserveError } = await billingDatabase(
      config,
    ).rpc("reserve_promotion_order", {
      listing_id: p.id,
      agent_id: user.id,
      offer: body.package,
      is_live: config.live,
      area,
      brief: notes,
      listing_snapshot: {
        title: p.title,
        location: p.location,
        public_url: siteUrl(publicPath(p)),
        name: contact.name,
        email: user.email || contact.email,
        phone: contact.phone,
        keywords: promotionKeywords(p, area),
      },
    });
    if (reserveError || !reserved)
      throw new BillingError(
        "Comanda nu a putut fi pregătită. Încearcă din nou.",
      );
    if (
      reserved.package !== body.package ||
      reserved.target_area !== area ||
      reserved.notes !== notes
    )
      throw new BillingError(
        "Ai deja o plată în așteptare pentru această proprietate. Continuă sau anulează acea plată din comenzile tale înainte de a alege alt pachet.",
        409,
      );
    return await promotionCheckout(config, reserved, {
      ...contact,
      email: user.email || contact.email,
    });
  } catch (error) {
    return billingFailure(error);
  }
}
