import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import {
  AuthenticationError,
  BadInputError,
  NotEnoughCreditsError,
  ValidationError,
} from "@higgsfield/client";
import {
  resolveModelInput,
  validateModel,
  readPath,
  type ModelProfile,
} from "./higgsfield-models";
import { submitGeneration, generationStatus } from "./higgsfield-server";
import { filmCallbackUrl } from "./higgsfield-security";
import {
  makeFilmPlan,
  validateFilmPlan,
  type FilmPlan,
  type FilmShot,
} from "./property-film-plan";
import { filmDependencies, ownedFilmImages } from "./property-film-worker";
import {
  normalizeGeneratedClip,
  editGeneratedClip,
  assembleFilm,
} from "./property-film-render";
import { downloadVideo } from "./video-download";
import { safeFilmDiagnostic } from "./film-diagnostics";
import {
  bytePlusBudgetSettings,
  walkthroughShotLimit,
  timeWalkthrough,
  budgetForPlan,
  assertFilmBudget,
  VideoBudgetError,
  bytePlusSourceSeconds,
} from "./byteplus-budget";
import {
  submitBytePlusGeneration,
  bytePlusGenerationStatus,
  BytePlusRejectedError,
} from "./byteplus-video";

type Job = {
  order_id: string;
  property_id: string;
  owner_id: string;
  attempts: number;
  lease_token: string;
  source: Record<string, unknown>;
  montage_generation: string;
  montage_plan: FilmPlan | null;
  montage_next_shot: number;
  montage_edited_shots: number;
  byteplus_parallel?: boolean;
  model_config: { engine: "higgsfield-montage-v1"; profile: ModelProfile };
};
type Scene = {
  submit: boolean;
  request_id: string | null;
  model_config: ModelProfile;
  model_input: Record<string, unknown>;
};
export const aiFilmDependencies = {
  submitBytePlusGeneration,
  bytePlusGenerationStatus,
  submitGeneration,
  generationStatus,
  downloadVideo,
  normalizeGeneratedClip,
  editGeneratedClip,
  assembleFilm,
};
export function sceneGenerationInput(model: ModelProfile, shot: FilmShot) {
  const motion = shot.aerial
    ? "A stable, cinematic aerial glide, staying within the elevated viewpoint and visible surroundings of this supplied aerial photograph."
    : shot.motion === "pull"
      ? "A controlled, cinematic pull-back along the existing camera axis, keeping the original view and composition."
      : shot.motion.includes("glide")
        ? `A steady, small lateral camera glide ${shot.motion === "glide-left" ? "left" : "right"}, keeping the photographed space and original composition.`
        : "A smooth, cinematic forward camera push along the existing camera axis, with visible but controlled movement.";
  const prompt = [
    "Animate this ONE supplied property photograph into a realistic real-estate cinematography shot.",
    motion,
    "Stable gimbal camera, continuous natural movement, no shake, no jitter, no wobble, no jump cuts. The editor will add speed ramps and transitions later.",
    "Preserve the original geometry, proportions, architecture, materials, furnishings, windows, fixtures, landscaping and actual view. No morphing, object movement, invented rooms, windows, amenities, horizons or room connections.",
    "Do not fly through walls, doors or windows. Do not reveal unseen areas or simulate travel into another room. Do not add people, vehicles, voice, music, text, prices, addresses, logos or slogans.",
    shot.evening
      ? "Preserve the existing evening lighting in the supplied photo."
      : "Preserve the existing daylight and lighting; do not turn this scene into dusk or night.",
  ].join(" ");
  const input = resolveModelInput(model, {
    prompt,
    images: [shot.image],
    image_objects: [{ type: "image_url", image_url: shot.image }],
    property: {},
  });
  if (model.provider === "byteplus" && shot.seconds !== undefined)
    input.duration = bytePlusSourceSeconds(shot.seconds);
  if (!JSON.stringify(input).includes(shot.image))
    throw new Error("The model must accept the selected property photograph.");
  const duration = Number(input.duration);
  if (
    model.provider === "byteplus" &&
    (input.frames !== undefined || duration < 4)
  )
    throw new VideoBudgetError(
      "Seedance source generation requires at least four seconds; frame overrides are not budgeted.",
    );
  if (!Number.isFinite(duration) || duration < 2 || duration > 15)
    throw new Error("Configure the model's duration between 2 and 15 seconds.");
  return input;
}
const path = (job: Job, index: number, kind: "raw" | "shot") =>
  `${job.owner_id}/${job.order_id}/generation-${job.montage_generation}/${kind}-${index}.mp4`;
async function checkpoint(
  admin: SupabaseClient,
  job: Job,
  fields: Record<string, unknown> = {},
) {
  const { data, error } = await admin.rpc("checkpoint_property_ai_film", {
    p_order: job.order_id,
    p_lease: job.lease_token,
    p_attempt: job.attempts,
    ...fields,
  });
  if (error) throw new Error("Film progress could not be saved.");
  return Boolean(data);
}
async function savedClip(
  admin: SupabaseClient,
  job: Job,
  index: number,
  kind: "raw" | "shot",
) {
  const { data, error } = await admin.storage
    .from("property-video-work")
    .download(path(job, index, kind));
  if (error || !data || data.size > 12 * 1024 * 1024)
    throw new Error("A saved scene is unavailable.");
  return Buffer.from(await data.arrayBuffer());
}
async function storeClip(
  admin: SupabaseClient,
  job: Job,
  index: number,
  kind: "raw" | "shot",
  bytes: Buffer,
) {
  const { error } = await admin.storage
    .from("property-video-work")
    .upload(path(job, index, kind), bytes, {
      upsert: true,
      contentType: "video/mp4",
    });
  if (error) throw new Error("A scene could not be saved.");
}
export async function runHiggsfieldFilm(
  admin: SupabaseClient,
  order: string,
  model: ModelProfile | null = null,
): Promise<string> {
  const { data, error } = await admin.rpc("claim_property_ai_film", {
    p_order: order,
    p_lease: crypto.randomUUID(),
    p_model: model,
  });
  if (error) throw new Error("The Higgsfield film upgrade is not installed.");
  if (!data) return "not_claimed";
  const job = data as Job;
  let stage = "planning",
    unboundSubmission = false,
    submitting = false,
    activeIndex = job.montage_next_shot;
  try {
    stage = "photo_validation";
    const images = ownedFilmImages(job);
    const profile = validateModel(job.model_config.profile);
    if (profile.provider === "byteplus" && !job.montage_plan)
      bytePlusBudgetSettings(profile);
    if (!job.montage_generation) throw new Error("Missing film generation.");
    if (!job.montage_plan) {
      const signal = AbortSignal.timeout(60000),
        fingerprints: string[] = [];
      for (const image of images) {
        stage = "photo_download";
        const bytes = await filmDependencies.downloadPhoto(image, signal);
        stage = "photo_decoding";
        fingerprints.push(await filmDependencies.photoFingerprint(bytes));
        if (signal.aborted) throw new Error("Photo preparation timed out.");
      }
      stage = "photo_analysis";
      const observations = await filmDependencies.analyzeFilmPhotos(images);
      stage = "planning";
      let plan: FilmPlan = {
        ...makeFilmPlan(
          images,
          observations,
          fingerprints,
          profile.provider === "byteplus"
            ? walkthroughShotLimit(new Set(fingerprints).size, profile)
            : undefined,
        ),
        engine: "higgsfield-montage-v1",
      };
      if (profile.provider === "byteplus") {
        plan = timeWalkthrough(plan, new Set(fingerprints).size, profile);
        plan.generationBudget = budgetForPlan(plan, profile);
      }
      for (const shot of plan.shots) sceneGenerationInput(profile, shot);
      stage = "plan_storage";
      return (await checkpoint(admin, job, { p_plan: plan }))
        ? "ai_film_planned"
        : "revoked";
    }
    stage = "plan_validation";
    const plan = validateFilmPlan(job.montage_plan);
    if (
      plan.engine !== "higgsfield-montage-v1" ||
      plan.shots.some((shot) => !images.includes(shot.image))
    )
      throw new Error("Film photographs do not match.");
    if (job.montage_next_shot < plan.shots.length) {
      if (profile.provider === "byteplus") assertFilmBudget(plan, profile);
      const index = job.montage_next_shot,
        shot = plan.shots[index];
      const input = sceneGenerationInput(
        validateModel(job.model_config.profile),
        shot,
      );
      stage = "scene_reservation";
      // Verify current photo bytes before reserving/submitting any new scene.
      const photo = await filmDependencies.downloadPhoto(shot.image);
      if ((await filmDependencies.photoFingerprint(photo)) !== shot.fingerprint)
        throw new Error("A photograph changed after planning.");
      const reserved = await admin.rpc("reserve_property_film_scene", {
        p_order: order,
        p_lease: job.lease_token,
        p_attempt: job.attempts,
        p_input: input,
      });
      if (reserved.error) throw new Error("Scene reservation failed.");
      if (!reserved.data) {
        return (await checkpoint(admin, job))
          ? "waiting_for_capacity"
          : "revoked";
      }
      const scene = reserved.data as Scene;
      let result;
      if (scene.submit) {
        stage = "scene_submission";
        submitting = true;
        unboundSubmission = true;
        result =
          scene.model_config.provider === "byteplus"
            ? await aiFilmDependencies.submitBytePlusGeneration(
                scene.model_config.endpoint,
                scene.model_input,
              )
            : await aiFilmDependencies.submitGeneration(
                scene.model_config.endpoint,
                scene.model_input,
                filmCallbackUrl(order, job.montage_generation, index),
              );
        submitting = false;
        const bound = await admin.rpc("bind_property_film_scene", {
          p_order: order,
          p_generation: job.montage_generation,
          p_index: index,
          p_request: result.request_id,
        });
        if (bound.error) throw new Error("Scene request could not be bound.");
        if (!bound.data) return "revoked";
        unboundSubmission = false;
      } else {
        stage = "scene_status";
        if (!scene.request_id)
          throw new Error("Scene request needs reconciliation.");
        result =
          scene.model_config.provider === "byteplus"
            ? await aiFilmDependencies.bytePlusGenerationStatus(
                scene.request_id,
              )
            : await aiFilmDependencies.generationStatus(scene.request_id);
      }
      if (["failed", "nsfw", "cancelled", "canceled"].includes(result.status)) {
        await checkpoint(admin, job, {
          p_error:
            "The video provider could not generate this scene. Review the request in your API dashboard before requesting a new film.",
          p_failure: "failed",
        });
        return "provider_failed";
      }
      if (result.status !== "completed") {
        console.info(
          JSON.stringify({
            event: "property_film_provider_wait",
            order_id: job.order_id,
            scene: job.montage_next_shot + 1,
            provider: scene.model_config.provider || "higgsfield",
            status: result.status,
          }),
        );
        // Reserve and bind at most ONE lookahead request. Generation overlaps at
        // the provider, while delivery/checkpointing remains in shot order.
        // The database flag is absent until the parallel upgrade is installed.
        const ahead = index + 1;
        if (
          profile.provider === "byteplus" &&
          job.byteplus_parallel &&
          ahead < plan.shots.length
        ) {
          activeIndex = ahead;
          stage = "lookahead_lookup";
          const { data: existing, error: lookupError } = await admin
            .from("property_film_scenes")
            .select("request_id")
            .eq("order_id", order)
            .eq("generation", job.montage_generation)
            .eq("shot_index", ahead)
            .maybeSingle();
          if (lookupError) throw new Error("Scene reservation failed.");
          if (existing && !existing.request_id) {
            unboundSubmission = true;
            throw new Error("Scene request needs reconciliation.");
          }
          if (!existing) {
            assertFilmBudget(plan, profile);
            const nextShot = plan.shots[ahead];
            const nextInput = sceneGenerationInput(profile, nextShot);
            stage = "lookahead_photo";
            const nextPhoto = await filmDependencies.downloadPhoto(
              nextShot.image,
            );
            if (
              (await filmDependencies.photoFingerprint(nextPhoto)) !==
              nextShot.fingerprint
            )
              throw new Error("A photograph changed after planning.");
            stage = "lookahead_reservation";
            const reservedAhead = await admin.rpc(
              "reserve_byteplus_lookahead",
              {
                p_order: order,
                p_lease: job.lease_token,
                p_attempt: job.attempts,
                p_index: ahead,
                p_input: nextInput,
              },
            );
            if (reservedAhead.error)
              throw new Error("Scene reservation failed.");
            if (!reservedAhead.data) {
              await checkpoint(admin, job);
              return "generating";
            }
            const next = reservedAhead.data as Scene;
            if (next.submit) {
              stage = "lookahead_submission";
              submitting = unboundSubmission = true;
              const accepted =
                await aiFilmDependencies.submitBytePlusGeneration(
                  next.model_config.endpoint,
                  next.model_input,
                );
              submitting = false;
              const boundAhead = await admin.rpc("bind_property_film_scene", {
                p_order: order,
                p_generation: job.montage_generation,
                p_index: ahead,
                p_request: accepted.request_id,
              });
              if (boundAhead.error)
                throw new Error("Scene request could not be bound.");
              if (!boundAhead.data) return "revoked";
              unboundSubmission = false;
            }
          }
        }
        await checkpoint(admin, job);
        return "generating";
      }
      if (
        scene.model_config.provider === "byteplus" &&
        (result.duration !== Number(scene.model_input.duration) ||
          (result.resolution !== undefined &&
            result.resolution !== scene.model_input.resolution))
      ) {
        throw new VideoBudgetError(
          "BytePlus returned different duration or resolution than requested. Generation is stopped for cost review; no additional scenes will be requested.",
        );
      }
      stage = "scene_delivery";
      const url = readPath(
        result,
        validateModel(scene.model_config).output.path,
      );
      if (typeof url !== "string")
        throw new Error("Missing configured scene output.");
      const media = await aiFilmDependencies.downloadVideo(url);
      stage = "scene_normalization";
      const clip = await aiFilmDependencies.normalizeGeneratedClip(
        media.bytes,
        Number(scene.model_input.duration),
        shot.seconds,
      );
      stage = "scene_storage";
      await storeClip(admin, job, index, "raw", clip);
      return (await checkpoint(admin, job, { p_scene: index }))
        ? "ai_scene_saved"
        : "revoked";
    }
    if (job.montage_edited_shots < plan.shots.length) {
      stage = "scene_editing";
      const index = job.montage_edited_shots;
      const current = await savedClip(admin, job, index, "raw");
      const previous =
        index > 0 ? await savedClip(admin, job, index - 1, "raw") : undefined;
      const next =
        index + 1 < plan.shots.length
          ? await savedClip(admin, job, index + 1, "raw")
          : undefined;
      await storeClip(
        admin,
        job,
        index,
        "shot",
        await aiFilmDependencies.editGeneratedClip(current, previous, next, {
          seconds: plan.shots[index].seconds,
          previousSeconds: plan.shots[index - 1]?.seconds,
        }),
      );
      return (await checkpoint(admin, job, { p_edit: index }))
        ? "ai_scene_edited"
        : "revoked";
    }
    stage = "film_assembly";
    const clips: Buffer[] = [];
    for (let i = 0; i < plan.shots.length; i++)
      clips.push(await savedClip(admin, job, i, "shot"));
    const film = await aiFilmDependencies.assembleFilm(
      clips,
      2,
      plan.timing === "variable-v1"
        ? plan.shots.map((shot) => shot.seconds!)
        : undefined,
    );
    const digest = createHash("sha256").update(film).digest("hex").slice(0, 24);
    const publicPath = `${job.owner_id}/${order}/higgsfield-${job.montage_generation}-${digest}.mp4`;
    stage = "film_delivery";
    const upload = await admin.storage
      .from("property-videos")
      .upload(publicPath, film, {
        upsert: true,
        contentType: "video/mp4",
        cacheControl: "31536000",
      });
    if (upload.error) throw new Error("Film delivery failed.");
    const url = admin.storage.from("property-videos").getPublicUrl(publicPath)
      .data.publicUrl;
    if (!(await checkpoint(admin, job, { p_url: url }))) return "revoked";
    try {
      await admin.storage
        .from("property-video-work")
        .remove(
          plan.shots.flatMap((_, i) => [
            path(job, i, "raw"),
            path(job, i, "shot"),
          ]),
        );
    } catch {
      /* delivered film remains valid */
    }
    return "completed";
  } catch (error) {
    const rejected =
      submitting &&
      (error instanceof BytePlusRejectedError ||
        error instanceof AuthenticationError ||
        error instanceof BadInputError ||
        error instanceof NotEnoughCreditsError ||
        error instanceof ValidationError);
    if (
      rejected &&
      error instanceof BytePlusRejectedError &&
      error.httpStatus
    ) {
      const deferred = await admin.rpc("reject_byteplus_scene", {
        p_order: order,
        p_lease: job.lease_token,
        p_attempt: job.attempts,
        p_generation: job.montage_generation,
        p_index: activeIndex,
        p_http: error.httpStatus,
      });
      if (!deferred.error && deferred.data && error.httpStatus === 429)
        return "waiting_for_provider_capacity";
    }
    const budgetBlocked = error instanceof VideoBudgetError;
    const failure =
      rejected || budgetBlocked
        ? "failed"
        : unboundSubmission
          ? "uncertain"
          : "delayed";
    console.warn(
      JSON.stringify({
        event: "higgsfield_film_step_deferred",
        stage,
        failure,
        order_id: job.order_id,
        generation: job.montage_generation,
        scene: activeIndex,
        diagnostic: safeFilmDiagnostic(error),
        ...(error instanceof BytePlusRejectedError
          ? {
              http_status: error.httpStatus,
              provider_code: error.providerCode,
              requested_seconds: job.montage_plan
                ? bytePlusSourceSeconds(
                    job.montage_plan.shots[activeIndex].seconds!,
                  )
                : undefined,
            }
          : {}),
      }),
    );
    await checkpoint(admin, job, {
      p_failure: failure,
      p_error: budgetBlocked
        ? error.message
        : rejected
          ? error instanceof BytePlusRejectedError && error.httpStatus
            ? `BytePlus rejected scene ${activeIndex + 1} (HTTP ${error.httpStatus}${error.providerCode ? `; code ${error.providerCode}` : ""}; duration ${job.montage_plan ? bytePlusSourceSeconds(job.montage_plan.shots[activeIndex].seconds!) : "unknown"}s). ${error.providerDetail ? `${error.providerDetail} ` : ""}Saved scenes are retained. No automatic resubmission.`
            : "The video provider rejected this scene. Check API credentials, API credits and model settings. No new generation will be submitted automatically."
          : unboundSubmission
            ? "Scene generation confirmation is delayed. We will not resubmit it automatically; reconcile this request in the provider dashboard."
            : `Film processing stopped at ${stage}. ${safeFilmDiagnostic(error)} Saved requests and scenes are retained. Do not rebuild while this issue is being investigated.`,
    });
    return failure;
  }
}
