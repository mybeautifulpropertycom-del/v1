import { createClient } from "@supabase/supabase-js";
import {
  AuthenticationError,
  BadInputError,
  NotEnoughCreditsError,
  ValidationError,
} from "@higgsfield/client";
import {
  configuredModel,
  propertyVideoInput,
  readPath,
  validateModel,
  type ModelProfile,
} from "./higgsfield-models";
import {
  generationStatus,
  higgsfieldCredentials,
  submitGeneration,
  type GenerationResult,
} from "./higgsfield-server";
import { callbackUrl, workerSecret } from "./higgsfield-security";
import { downloadVideo } from "./video-download";
import { runHiggsfieldFilm } from "./higgsfield-film-worker";
import { runPropertyFilm } from "./property-film-worker";

export type VideoJob = {
  order_id: string;
  property_id: string;
  owner_id: string;
  status: string;
  attempts: number;
  source: Record<string, unknown>;
  provider_request_id: string | null;
  model_config: ModelProfile;
  model_input: Record<string, unknown>;
  lease_token: string;
};
export function videoDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Server video storage is not configured.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(15000) }),
    },
  });
}
export function videoConfiguration() {
  workerSecret();
  callbackUrl("configuration-check", 1);
  if (process.env.PROPERTY_VIDEO_MODE === "photo-montage") {
    if (!process.env.OPENAI_API_KEY?.trim())
      throw new Error("Photo ordering needs OPENAI_API_KEY.");
    return {
      endpoint: "local/photo-montage-v1",
      input: {},
      output: { kind: "video" as const, path: "film.mp4" },
    };
  }
  higgsfieldCredentials();
  if (
    process.env.PROPERTY_VIDEO_MODE === "higgsfield-montage" &&
    !process.env.OPENAI_API_KEY?.trim()
  )
    throw new Error("Photo ordering needs OPENAI_API_KEY.");
  return configuredModel();
}
export async function bindVideoRequest(
  order: string,
  attempt: number,
  request: string,
) {
  const { data, error } = await videoDatabase().rpc(
    "bind_property_video_request",
    { p_order: order, p_attempt: attempt, p_request: request },
  );
  if (error) throw new Error("The provider request could not be recorded.");
  return Boolean(data);
}
async function advance(
  job: VideoJob,
  phase: string,
  errorText: string | null = null,
  url: string | null = null,
) {
  const { data, error } = await videoDatabase().rpc("advance_property_video", {
    p_order: job.order_id,
    p_lease: job.lease_token,
    p_attempt: job.attempts,
    p_phase: phase,
    p_url: url,
    p_error: errorText,
  });
  if (error) throw new Error("The video job could not be updated.");
  return Boolean(data);
}
export const workerDependencies = {
  submitGeneration,
  generationStatus,
  downloadVideo,
};
async function processJob(job: VideoJob) {
  let requestKnown = Boolean(job.provider_request_id);
  let submitting = !requestKnown;
  try {
    let result: GenerationResult;
    if (job.provider_request_id)
      result = await workerDependencies.generationStatus(
        job.provider_request_id,
      );
    else {
      result = await workerDependencies.submitGeneration(
        job.model_config.endpoint,
        job.model_input,
        callbackUrl(job.order_id, job.attempts),
      );
      submitting = false;
      if (
        !(await bindVideoRequest(job.order_id, job.attempts, result.request_id))
      )
        return "revoked";
      requestKnown = true;
    }
    if (["failed", "nsfw", "canceled", "cancelled"].includes(result.status)) {
      await advance(
        job,
        "failed",
        "The video provider could not complete this generation.",
      );
      return "failed";
    }
    if (result.status !== "completed") {
      await advance(job, "submitted");
      return "processing";
    }
    const model = validateModel(job.model_config);
    const url = readPath(result, model.output.path);
    if (model.output.kind !== "video" || typeof url !== "string")
      throw new Error("The model result has no configured video output.");
    const media = await workerDependencies.downloadVideo(url);
    const admin = videoDatabase();
    const path = `${job.owner_id}/${job.order_id}/${job.attempts}.${media.extension}`;
    const { error } = await admin.storage
      .from("property-videos")
      .upload(path, media.bytes, {
        upsert: true,
        contentType: media.type,
        cacheControl: "31536000",
      });
    if (error)
      throw new Error("The video could not be saved to durable storage.");
    const savedUrl = admin.storage.from("property-videos").getPublicUrl(path)
      .data.publicUrl;
    return (await advance(job, "completed", null, savedUrl))
      ? "completed"
      : "revoked";
  } catch (error) {
    const rejected =
      submitting &&
      (error instanceof AuthenticationError ||
        error instanceof BadInputError ||
        error instanceof NotEnoughCreditsError ||
        error instanceof ValidationError);
    // Never retry an ambiguous POST automatically. A valid callback can recover its ID.
    const phase = rejected
      ? "failed"
      : requestKnown
        ? "submitted"
        : "uncertain";
    await advance(
      job,
      phase,
      rejected
        ? "The provider rejected this request. Review API access, credits and model settings before retrying."
        : requestKnown
          ? "Video processing or delivery is delayed. We will check this request again without submitting another generation."
          : "Generation confirmation is delayed. Support must reconcile this request before another submission.",
    );
    return phase;
  }
}
/** One short batch. The scheduler resumes jobs; no function waits for a render. */
export async function runVideoWorker(orderId?: string) {
  if (process.env.HIGGSFIELD_ENABLED !== "true")
    return { enabled: false, processed: 0 };
  workerSecret();
  callbackUrl("configuration-check", 1);
  const admin = videoDatabase();
  let query = admin
    .from("property_video_jobs")
    .select("*")
    .in("status", ["queued", "processing"])
    .neq("provider_phase", "uncertain")
    .or(`lease_until.is.null,lease_until.lt.${new Date().toISOString()}`)
    .lte("next_poll_at", new Date().toISOString())
    .order("next_poll_at")
    .limit(1);
  if (orderId) query = query.eq("order_id", orderId);
  const { data: candidates, error } = await query;
  if (error)
    throw new Error("The Higgsfield database migration is not installed.");
  const results: string[] = [];
  for (const candidate of candidates || []) {
    if (
      candidate.model_config?.engine === "higgsfield-montage-v1" ||
      (!candidate.model_config?.engine &&
        candidate.status === "queued" &&
        process.env.PROPERTY_VIDEO_MODE === "higgsfield-montage")
    ) {
      const started = Date.now();
      let model: ModelProfile | null;
      try {
        higgsfieldCredentials();
        model = candidate.status === "queued" ? configuredModel() : null;
      } catch {
        await admin
          .from("property_video_jobs")
          .update({
            last_error:
              "Higgsfield API configuration is incomplete. Check HF_KEY and HIGGSFIELD_MODEL.",
            next_poll_at: new Date(Date.now() + 300000).toISOString(),
          })
          .eq("order_id", candidate.order_id)
          .eq("status", candidate.status);
        results.push("configuration_required");
        continue;
      }
      for (let step = 0; step < 3; step++) {
        const result = await runHiggsfieldFilm(
          admin,
          candidate.order_id,
          model,
        );
        results.push(result);
        model = null;
        if (
          !["ai_film_planned", "ai_scene_saved", "ai_scene_edited"].includes(
            result,
          ) ||
          Date.now() - started > 20000
        )
          break;
      }
      continue;
    }
    if (
      candidate.model_config?.engine === "photo-montage-v1" ||
      (candidate.status === "queued" &&
        process.env.PROPERTY_VIDEO_MODE === "photo-montage")
    ) {
      results.push(await runPropertyFilm(admin, candidate.order_id));
      continue;
    }
    higgsfieldCredentials();
    let model: ModelProfile | null = null;
    let input: Record<string, unknown> | null = null;
    if (candidate.status === "queued") {
      try {
        model = configuredModel();
        input = propertyVideoInput(
          model,
          candidate.source,
          candidate.owner_id,
          candidate.property_id,
        );
      } catch {
        // Invalid input must not block other queued or already-rendering jobs.
        const { error: deferError } = await admin
          .from("property_video_jobs")
          .update({
            next_poll_at: new Date(Date.now() + 300000).toISOString(),
            last_error:
              "Video setup needs review. Check the selected model and saved photo inputs.",
          })
          .eq("order_id", candidate.order_id)
          .eq("status", "queued");
        if (deferError) throw new Error("The video job could not be deferred.");
        results.push("configuration_required");
        continue;
      }
    }
    const { data, error: claimError } = await admin.rpc(
      "claim_property_video",
      {
        p_order: candidate.order_id,
        p_lease: crypto.randomUUID(),
        p_model: candidate.status === "queued" ? model : null,
        p_input: input,
      },
    );
    if (claimError) throw new Error("The video job could not be claimed.");
    if (data) results.push(await processJob(data as VideoJob));
  }
  return { enabled: true, processed: results.length, results };
}
/** For best-effort wakeups; the scheduler is the durable recovery mechanism. */
export async function wakeVideoWorker() {
  try {
    await runVideoWorker();
  } catch {
    console.warn(JSON.stringify({ event: "higgsfield_worker_deferred" }));
  }
}
