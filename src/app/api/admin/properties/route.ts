import { platformAdmin, adminFailure } from "@/lib/platform-admin";
import { billingJson, BillingError, UUID } from "@/lib/stripe-server";
import { repairedDurationBudget } from "@/lib/byteplus-budget";
import { validateFilmPlan } from "@/lib/property-film-plan";
import { validateModel } from "@/lib/higgsfield-models";
import {
  savedVideoProvider,
  configuredVideoProvider,
} from "@/lib/video-service";
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
            "order_id,status,provider_phase,video_url,poster_url,model_config,provider_request_id,montage_generation,montage_plan,montage_next_shot,attempts,last_error",
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
      let activeScenes: number | undefined;
      if (
        job?.status === "processing" &&
        job.montage_generation &&
        job.model_config?.profile?.provider === "byteplus"
      ) {
        const { count, error: countError } = await admin
          .from("property_film_scenes")
          .select("shot_index", { count: "exact", head: true })
          .eq("order_id", job.order_id)
          .eq("generation", job.montage_generation)
          .eq("status", "submitted");
        if (!countError) activeScenes = count ?? 0;
      }
      const needsDurationRepair =
        job?.model_config?.profile?.provider === "byteplus" &&
        job?.montage_plan?.generationBudget?.version === 2;
      let durationRepair: {
        usd: number;
        generatedSeconds: number;
        error?: string;
      } | null = null;
      if (
        needsDurationRepair &&
        job.status === "failed" &&
        job.provider_phase === "provider_failed" &&
        /^BytePlus rejected scene \d+ \(HTTP 400; code InvalidParameter[^;]*; duration [23]s\)/.test(
          job.last_error || "",
        )
      ) {
        try {
          const budget = repairedDurationBudget(
            validateFilmPlan(job.montage_plan),
            validateModel(job.model_config.profile),
          );
          durationRepair = {
            usd: budget.estimatedGenerationUsd,
            generatedSeconds: budget.generatedSeconds,
          };
        } catch {
          durationRepair = {
            usd: 0,
            generatedSeconds: 0,
            error:
              "The corrected duration budget needs review before this film can resume.",
          };
        }
      }
      return billingJson({
        property,
        profile,
        grant,
        video: job
          ? {
              status: job.status,
              activeScenes,
              provider: savedVideoProvider(job.model_config),
              nextProvider: configuredVideoProvider(),
              attempts: job.attempts,
              durationRepair,
              canRebuild: ["completed", "failed"].includes(job.status),
              canResume:
                !needsDurationRepair &&
                job.status === "failed" &&
                job.provider_phase === "provider_failed" &&
                job.model_config?.profile?.provider === "byteplus" &&
                job.attempts < 3 &&
                (job.last_error?.startsWith("BytePlus rejected scene ") ||
                  job.last_error ===
                    "The video provider rejected this scene. Check API credentials, API credits and model settings. No new generation will be submitted automatically."),
              rebuildUsesCredits: [
                "higgsfield-montage",
                "byteplus-montage",
              ].includes(process.env.PROPERTY_VIDEO_MODE || ""),
              completed: job.montage_next_shot,
              total: job.montage_plan?.shots?.length || 0,
              costEstimate: job.montage_plan?.generationBudget
                ? {
                    usd: job.montage_plan.generationBudget
                      .estimatedGenerationUsd,
                    limitUsd: job.montage_plan.generationBudget.maxUsd,
                    generatedSeconds:
                      job.montage_plan.generationBudget.generatedSeconds ??
                      job.montage_plan.shots.length *
                        job.montage_plan.generationBudget.sourceSeconds,
                    finalSeconds: job.montage_plan.duration,
                  }
                : null,
              error: job.last_error,
              film: job.video_url
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
