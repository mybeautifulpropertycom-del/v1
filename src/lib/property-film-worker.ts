import { MAX_PROPERTY_PHOTOS } from "./photo-limits";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { analyzeFilmPhotos } from "./property-film-analysis";
import {
  makeFilmPlan,
  validateFilmPlan,
  type FilmPlan,
  type FilmShot,
} from "./property-film-plan";
import {
  assembleFilm,
  photoFingerprint,
  renderFilmShot,
} from "./property-film-render";

type MontageJob = {
  order_id: string;
  owner_id: string;
  property_id: string;
  attempts: number;
  montage_generation?: string;
  lease_token: string;
  source: Record<string, unknown>;
  montage_plan: FilmPlan | null;
  montage_next_shot: number;
};
export function ownedFilmImages(
  job: Pick<MontageJob, "source" | "owner_id" | "property_id">,
): string[] {
  const images = job.source.images;
  if (
    !Array.isArray(images) ||
    !images.length ||
    images.length > MAX_PROPERTY_PHOTOS
  )
    throw new Error("The film needs saved photographs.");
  const origin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin;
  const prefix = `/storage/v1/object/public/property-images/${job.owner_id}/${job.property_id}/`;
  for (const raw of images) {
    if (typeof raw !== "string") throw new Error("Invalid property photo.");
    const url = new URL(raw);
    if (
      url.origin !== origin ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !url.pathname.startsWith(prefix) ||
      !/^[a-zA-Z0-9_-]+\.(webp|png|jpe?g)$/i.test(
        url.pathname.slice(prefix.length),
      )
    )
      throw new Error("Use this property's saved photographs.");
  }
  return images;
}
async function downloadPhoto(url: string, signal?: AbortSignal) {
  const response = await fetch(url, {
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.any([
      AbortSignal.timeout(12000),
      ...(signal ? [signal] : []),
    ]),
  });
  if (
    !response.ok ||
    Number(response.headers.get("content-length")) > 12 * 1024 * 1024
  ) {
    await response.body?.cancel();
    throw new Error("A property photograph is unavailable or too large.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing property photo.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 12 * 1024 * 1024) {
      await reader.cancel();
      throw new Error("Property photograph exceeds 12 MB.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
export const filmDependencies = {
  analyzeFilmPhotos,
  downloadPhoto,
  photoFingerprint,
  renderFilmShot,
  assembleFilm,
};
const workPath = (job: MontageJob, shot: number) =>
  `${job.owner_id}/${job.order_id}/${job.montage_generation ? `generation-${job.montage_generation}/` : ""}film-${job.attempts}/shot-${shot}.mp4`;

async function checkpoint(
  admin: SupabaseClient,
  job: MontageJob,
  fields: Record<string, unknown>,
) {
  const { data, error } = await admin.rpc("checkpoint_property_montage", {
    p_order: job.order_id,
    p_lease: job.lease_token,
    p_attempt: job.attempts,
    ...fields,
  });
  if (error) throw new Error("Film progress could not be saved.");
  return Boolean(data);
}

/** Each invocation plans, renders ONE short shot, or assembles existing shots.
 * Intermediate MP4s are private. Only the complete film is delivered publicly.
 */
export async function runPropertyFilm(
  admin: SupabaseClient,
  order: string,
): Promise<string> {
  const { data, error } = await admin.rpc("claim_property_montage", {
    p_order: order,
    p_lease: crypto.randomUUID(),
  });
  if (error) throw new Error("The property film migration is not installed.");
  if (!data) return "not_claimed";
  const job = data as MontageJob;
  let stage = "photographs";
  try {
    const images = ownedFilmImages(job);
    if (!job.montage_plan) {
      const signal = AbortSignal.timeout(60000);
      const fingerprints: string[] = [];
      // Decode sequentially to keep peak memory bounded even for large photos.
      for (const image of images) {
        const bytes = await filmDependencies.downloadPhoto(image, signal);
        fingerprints.push(await filmDependencies.photoFingerprint(bytes));
        if (signal.aborted) throw new Error("Photo preparation timed out.");
      }
      stage = "photo_ordering";
      const analysis = await filmDependencies.analyzeFilmPhotos(images);
      const plan = makeFilmPlan(images, analysis, fingerprints);
      return (await checkpoint(admin, job, { p_plan: plan }))
        ? "film_planned"
        : "revoked";
    }
    const plan = validateFilmPlan(job.montage_plan);
    if (plan.shots.some((shot) => !images.includes(shot.image)))
      throw new Error("The film plan does not match the saved photographs.");
    if (job.montage_next_shot < plan.shots.length) {
      const index = job.montage_next_shot,
        shot = plan.shots[index];
      const bytes = await filmDependencies.downloadPhoto(shot.image);
      if ((await filmDependencies.photoFingerprint(bytes)) !== shot.fingerprint)
        throw new Error("A film photograph changed after planning.");
      stage = "scene_rendering";
      const neighbour = async (item?: FilmShot) => {
        if (!item || plan.version === 1) return undefined;
        const image = await filmDependencies.downloadPhoto(item.image);
        if (
          (await filmDependencies.photoFingerprint(image)) !== item.fingerprint
        )
          throw new Error("A transition photograph changed after planning.");
        return { bytes: image, shot: item };
      };
      const previous = await neighbour(plan.shots[index - 1]);
      const next = await neighbour(plan.shots[index + 1]);
      const segment = await filmDependencies.renderFilmShot(bytes, shot, {
        version: plan.version,
        previous,
        next,
      });
      stage = "scene_storage";
      const { error: uploadError } = await admin.storage
        .from("property-video-work")
        .upload(workPath(job, index), segment, {
          upsert: true,
          contentType: "video/mp4",
        });
      if (uploadError) throw new Error("A film shot could not be saved.");
      return (await checkpoint(admin, job, { p_next: index + 1 }))
        ? "film_shot_saved"
        : "revoked";
    }
    stage = "scene_retrieval";
    const segments: Buffer[] = [];
    for (let start = 0; start < plan.shots.length; start += 4) {
      const batch = await Promise.all(
        plan.shots.slice(start, start + 4).map(async (_, offset) => {
          const { data: file, error: downloadError } = await admin.storage
            .from("property-video-work")
            .download(workPath(job, start + offset));
          if (downloadError || !file || file.size > 12 * 1024 * 1024)
            throw new Error("A saved film shot is unavailable.");
          return Buffer.from(await file.arrayBuffer());
        }),
      );
      segments.push(...batch);
    }
    stage = "film_assembly";
    const film = await filmDependencies.assembleFilm(segments, plan.version);
    // Content-addressed public name prevents a stale/refunded worker from
    // overwriting a different completed film at the same object path.
    const digest = createHash("sha256").update(film).digest("hex").slice(0, 24);
    const path = `${job.owner_id}/${job.order_id}/film-${job.attempts}-${digest}.mp4`;
    stage = "film_delivery";
    const { error: uploadError } = await admin.storage
      .from("property-videos")
      .upload(path, film, {
        upsert: true,
        contentType: "video/mp4",
        cacheControl: "31536000",
      });
    if (uploadError) throw new Error("The finished film could not be saved.");
    const url = admin.storage.from("property-videos").getPublicUrl(path)
      .data.publicUrl;
    if (!(await checkpoint(admin, job, { p_url: url }))) {
      // Do not delete here: another lease may already have committed delivery
      // of the identical content-addressed object after our lease expired.
      return "revoked";
    }
    // Delivery has committed. Cleanup failure must never undo delivery or
    // trigger a new render; private leftovers can be removed operationally.
    try {
      await admin.storage
        .from("property-video-work")
        .remove(plan.shots.map((_, i) => workPath(job, i)));
    } catch {
      /* best effort */
    }
    return "completed";
  } catch {
    console.warn(
      JSON.stringify({ event: "property_film_step_deferred", stage }),
    );
    await checkpoint(admin, job, {
      p_error:
        "Film preparation is delayed. Check photo access, photo analysis and rendering configuration. Saved progress will be resumed.",
    });
    return "film_delayed";
  }
}
