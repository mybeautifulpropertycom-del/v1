import { platformAdmin, adminFailure } from "@/lib/platform-admin";
import {
  billingJson,
  BillingError,
  readLimitedBody,
  UUID,
} from "@/lib/stripe-server";
import { campaignLabels } from "@/lib/promotion-packages";
import { promotionColumns } from "@/lib/promotion-server";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const { admin } = await platformAdmin(request);
    const params = new URL(request.url).searchParams;
    const page = Math.floor(
      Math.max(0, Math.min(10000, Number(params.get("page")) || 0)),
    );
    let query = admin
      .from("promotion_orders")
      .select(promotionColumns, { count: "exact" })
      .order("created_at", { ascending: false });
    if (params.get("mode") !== "all") query = query.eq("livemode", true);
    if (params.get("status") === "attention")
      query = query.eq("stop_required", true);
    else if (params.get("status") === "paid")
      query = query.eq("payment_status", "paid");
    const { data, error, count } = await query.range(page * 20, page * 20 + 19);
    if (error)
      throw new BillingError(
        "Comenzile de promovare nu sunt încă disponibile. Verifică actualizarea bazei de date.",
      );
    return billingJson({ orders: data, total: count ?? 0 });
  } catch (error) {
    return adminFailure(error);
  }
}
export async function POST(request: Request) {
  try {
    const { admin } = await platformAdmin(request);
    let body;
    try {
      body = JSON.parse(await readLimitedBody(request, 5000));
    } catch {
      throw new BillingError("Verifică datele raportului.", 400);
    }
    if (
      !UUID.test(body?.orderId || "") ||
      typeof body.status !== "string" ||
      !Object.hasOwn(campaignLabels, body.status) ||
      !Number.isInteger(body.spentAmount) ||
      body.spentAmount < 0 ||
      !Number.isInteger(body.impressions) ||
      body.impressions < 0 ||
      body.impressions > 2147483647 ||
      !Number.isInteger(body.clicks) ||
      body.clicks < 0 ||
      body.clicks > 2147483647 ||
      typeof body.report !== "string" ||
      body.report.length > 2000 ||
      typeof body.campaignId !== "string" ||
      body.campaignId.length > 128
    )
      throw new BillingError(
        "Verifică starea campaniei, bugetul și datele raportului.",
        400,
      );
    if (body.status === "active" && !body.campaignId.trim())
      throw new BillingError(
        "Adaugă ID-ul campaniei Google Ads înainte de activare.",
        400,
      );
    if (body.status === "completed" && !body.report.trim())
      throw new BillingError(
        "Adaugă raportul campaniei înainte de încheiere.",
        400,
      );
    const { data, error } = await admin.rpc("update_promotion_campaign", {
      order_id: body.orderId,
      new_status: body.status,
      spent: body.spentAmount,
      views: body.impressions,
      visits: body.clicks,
      summary: body.report.trim(),
      google_campaign: body.campaignId.trim(),
    });
    if (error)
      throw new BillingError(
        "Actualizarea nu este permisă. Verifică plata reală confirmată, bugetul și disponibilitatea proprietății.",
        409,
      );
    return billingJson({ order: data });
  } catch (error) {
    return adminFailure(error);
  }
}
