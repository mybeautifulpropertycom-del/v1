import type { ModelProfile } from "./higgsfield-models";
import type { FilmPlan } from "./property-film-plan";
import { MAX_FILM_SHOTS } from "./property-film-plan";

export class VideoBudgetError extends Error {}
export type FilmBudget = {
  version: 1;
  model: string;
  resolution: "720p";
  sourceSeconds: number;
  usdPerSecond: number;
  maxUsd: number;
  plannedScenes: number;
  estimatedGenerationUsd: number;
  reserveUsd: number;
};
/** A conservative configured estimate, not a provider-enforced dollar limit. */
export function bytePlusBudgetSettings(model: ModelProfile) {
  const rate = Number(process.env.BYTEPLUS_VIDEO_USD_PER_SECOND);
  const maxUsd = Number(process.env.PROPERTY_VIDEO_MAX_COST_USD || "15");
  if (!Number.isFinite(rate) || rate <= 0 || rate > 100)
    throw new VideoBudgetError(
      "Video generation is paused: configure the verified BytePlus 720p price in BYTEPLUS_VIDEO_USD_PER_SECOND.",
    );
  if (!Number.isFinite(maxUsd) || maxUsd <= 0 || maxUsd > 15)
    throw new VideoBudgetError(
      "PROPERTY_VIDEO_MAX_COST_USD must be greater than zero and at most $15.",
    );
  if (
    model.endpoint !==
      (process.env.BYTEPLUS_VIDEO_MODEL?.trim() ||
        "dreamina-seedance-2-5-260628") ||
    model.input.resolution !== "720p" ||
    model.input.generate_audio !== false
  )
    throw new VideoBudgetError(
      "Video generation is paused: the saved model or settings do not match the configured BytePlus price.",
    );
  const seconds = Number(model.input.duration);
  if (!Number.isInteger(seconds) || seconds < 4 || seconds > 15)
    throw new VideoBudgetError("The scene duration cannot be costed safely.");
  const capCents = Math.floor(maxUsd * 100 * 0.8); // Keep 20% outside the generation estimate.
  const sceneCents = Math.ceil(rate * seconds * 100);
  const affordableScenes = Math.min(
    MAX_FILM_SHOTS,
    Math.floor(capCents / sceneCents),
  );
  if (affordableScenes < 1)
    throw new VideoBudgetError(
      "The configured budget cannot cover one generated scene.",
    );
  return { rate, maxUsd, seconds, capCents, sceneCents, affordableScenes };
}
export function walkthroughShotLimit(
  uniquePhotos: number,
  model: ModelProfile,
) {
  const { affordableScenes } = bytePlusBudgetSettings(model);
  // 15 unique photos -> 9 scenes / 30.6s; 30 -> 18 / 61.2s; 40 -> 23 / 78.2s,
  // provided the estimated budget can cover them. Never repeat photos to fill time.
  const target = Math.min(
    MAX_FILM_SHOTS,
    uniquePhotos,
    Math.max(2, Math.round(uniquePhotos * 0.6)),
  );
  return Math.min(target, affordableScenes);
}
export function budgetForPlan(plan: FilmPlan, model: ModelProfile): FilmBudget {
  const settings = bytePlusBudgetSettings(model);
  if (plan.shots.length > settings.affordableScenes)
    throw new VideoBudgetError(
      "The film exceeds the configured generation budget.",
    );
  return {
    version: 1,
    model: model.endpoint,
    resolution: "720p",
    sourceSeconds: settings.seconds,
    usdPerSecond: settings.rate,
    maxUsd: settings.maxUsd,
    plannedScenes: plan.shots.length,
    estimatedGenerationUsd: (plan.shots.length * settings.sceneCents) / 100,
    reserveUsd: settings.maxUsd - settings.capCents / 100,
  };
}
export function assertFilmBudget(plan: FilmPlan, model: ModelProfile) {
  const saved = plan.generationBudget;
  const current = budgetForPlan(plan, model);
  if (
    !saved ||
    saved.version !== 1 ||
    saved.model !== model.endpoint ||
    saved.resolution !== "720p" ||
    saved.sourceSeconds !== current.sourceSeconds ||
    saved.plannedScenes !== plan.shots.length ||
    !Number.isFinite(saved.usdPerSecond) ||
    saved.usdPerSecond <= 0 ||
    !Number.isFinite(saved.maxUsd) ||
    saved.maxUsd <= 0 ||
    saved.maxUsd > 15
  )
    throw new VideoBudgetError(
      "This film has no matching budget approval. Review it before generating more scenes.",
    );
  const savedEstimate =
    (plan.shots.length *
      Math.ceil(saved.usdPerSecond * saved.sourceSeconds * 100)) /
    100;
  const savedCap = Math.floor(saved.maxUsd * 100 * 0.8) / 100;
  if (
    saved.estimatedGenerationUsd !== savedEstimate ||
    Math.max(savedEstimate, current.estimatedGenerationUsd) > savedCap
  )
    throw new VideoBudgetError(
      "The updated price exceeds this film's approved budget. No more scenes will be generated.",
    );
}
