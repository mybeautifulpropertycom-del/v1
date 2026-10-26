import { platformAdmin, adminFailure } from "@/lib/platform-admin";
import { billingJson, BillingError, UUID } from "@/lib/stripe-server";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const { admin } = await platformAdmin(request);
    const params = new URL(request.url).searchParams;
    const id = params.get("id");
    if (id) {
      if (!UUID.test(id)) throw new BillingError("Choose a property.", 400);
      const { data: property, error } = await admin
        .from("properties")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!property)
        throw new BillingError("This property is no longer available.", 404);
      const [
        { data: profile, error: profileError },
        { data: job, error: jobError },
        { data: grant, error: grantError },
      ] = await Promise.all([
        admin.from("profiles").select("*").eq("id", property.owner_id).single(),
        admin
          .from("property_video_jobs")
          .select(
            "status,video_url,poster_url,montage_plan,montage_next_shot,attempts,last_error",
          )
          .eq("property_id", id)
          .maybeSingle(),
        admin
          .from("property_admin_grants")
          .select("reason,granted_at")
          .eq("property_id", id)
          .maybeSingle(),
      ]);
      if (profileError || jobError || grantError)
        throw new Error("Property details unavailable.");
      return billingJson({
        property,
        profile,
        grant,
        video: job
          ? {
              status: job.status,
              attempts: job.attempts,
              completed: job.montage_next_shot,
              total: job.montage_plan?.shots?.length || 0,
              error: job.last_error,
              film:
                job.status === "completed" && job.video_url
                  ? { src: job.video_url, poster: job.poster_url }
                  : null,
            }
          : null,
      });
    }
    const owner = params.get("owner");
    if (owner && !UUID.test(owner))
      throw new BillingError("Choose an account.", 400);
    const page = Math.min(
      100000,
      Math.max(0, Math.floor(Number(params.get("page")) || 0)),
    );
    const search = (params.get("search") || "")
      .slice(0, 100)
      .replace(/[^\p{L}\p{N} ._+-]/gu, "");
    let query = admin
      .from("properties")
      .select("id,owner_id,title,location,status,slug,template,created_at", {
        count: "exact",
      })
      .order("created_at", { ascending: false })
      .order("id")
      .range(page * 25, page * 25 + 24);
    if (owner) query = query.eq("owner_id", owner);
    if (search)
      query = query.or(`title.ilike.%${search}%,location.ilike.%${search}%`);
    const { data, error, count } = await query;
    if (error) throw error;
    const owners = [
      ...new Set((data || []).map((property) => property.owner_id)),
    ];
    const { data: profiles, error: profileError } = owners.length
      ? await admin.from("profiles").select("id,name,email").in("id", owners)
      : { data: [], error: null };
    if (profileError) throw profileError;
    return billingJson({
      properties: (data || []).map((p) => ({
        ...p,
        agent: profiles?.find((a) => a.id === p.owner_id),
      })),
      total: count || 0,
      page,
    });
  } catch (error) {
    return adminFailure(error);
  }
}
