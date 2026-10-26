import { platformAdmin, adminFailure } from "@/lib/platform-admin";
import { billingJson } from "@/lib/stripe-server";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const { admin } = await platformAdmin(request);
    const params = new URL(request.url).searchParams;
    const page = Math.min(
      100000,
      Math.max(0, Math.floor(Number(params.get("page")) || 0)),
    );
    const search = (params.get("search") || "")
      .slice(0, 100)
      .replace(/[^\p{L}\p{N}@. _+-]/gu, "");
    let query = admin
      .from("platform_account_directory")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id")
      .range(page * 25, page * 25 + 24);
    if (search)
      query = query.or(
        `name.ilike.%${search}%,login_email.ilike.%${search}%,agency.ilike.%${search}%`,
      );
    const { data, error, count } = await query;
    if (error) throw error;
    return billingJson({ accounts: data, total: count || 0, page });
  } catch (error) {
    return adminFailure(error);
  }
}
