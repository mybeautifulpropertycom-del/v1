import type { ModelProfile } from "./higgsfield-models";
import type { FilmPlan } from "./property-film-plan";
import { MAX_FILM_SHOTS } from "./property-film-plan";

export class VideoBudgetError extends Error {}
export type FilmBudget = {
  version: 2;
  model: string;
  resolution: "720p";
  sceneSeconds: number[];
  generatedSeconds: number;
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
  const capCents = Math.floor(maxUsd * 100 * 0.8);
  const affordableScenes = Math.min(
    MAX_FILM_SHOTS,
    Math.floor(capCents / sceneCostCents(rate, 2)),
  );
  if (affordableScenes < 1)
    throw new VideoBudgetError(
      "The configured budget cannot cover one generated scene.",
    );
  return { rate, maxUsd, capCents, affordableScenes };
}
const sceneCostCents = (rate: number, seconds: number) =>
  Math.ceil(rate * seconds * 100);
const estimateCents = (rate: number, durations: number[]) =>
  durations.reduce((sum, seconds) => sum + sceneCostCents(rate, seconds), 0);
export function walkthroughShotLimit(
  uniquePhotos: number,
  model: ModelProfile,
) {
  const { affordableScenes } = bytePlusBudgetSettings(model);
  return Math.min(
    MAX_FILM_SHOTS,
    uniquePhotos,
    Math.max(2, Math.round(uniquePhotos * 0.7)),
    affordableScenes,
  );
}
/** Give the most important spaces breathing room and use short detail shots.
 * Generated seconds equal edited seconds; speed ramps use the same footage.
 */
export function timeWalkthrough(
  plan: FilmPlan,
  uniquePhotos: number,
  model: ModelProfile,
): FilmPlan {
  const settings = bytePlusBudgetSettings(model);
  const target = Math.min(80, Math.max(2, uniquePhotos * 2));
  const durations = plan.shots.map(() => 2);
  const total = () => durations.reduce((sum, seconds) => sum + seconds, 0);
  const priority = plan.shots
    .map((shot, i) => ({ shot, i }))
    .sort((a, b) => {
      const rank = (i: number) =>
        i === 0
          ? 100
          : i === plan.shots.length - 1
            ? 90
            : {
                exterior: 70,
                living: 80,
                dining: 60,
                kitchen: 65,
                bedroom: 40,
                bathroom: 20,
                detail: 10,
                other: 30,
              }[plan.shots[i].category] + plan.shots[i].strength;
      return rank(b.i) - rank(a.i) || a.i - b.i;
    });
  const addSecond = (i: number) => {
    if (total() >= target || durations[i] >= 5) return false;
    durations[i]++;
    if (estimateCents(settings.rate, durations) > settings.capCents) {
      durations[i]--;
      return false;
    }
    return true;
  };
  for (const { shot, i } of priority) {
    const preferred =
      i === 0
        ? 5
        : i === plan.shots.length - 1
          ? 4
          : shot.category === "living"
            ? 4
            : ["exterior", "kitchen", "dining"].includes(shot.category)
              ? 4
              : ["bathroom", "detail"].includes(shot.category)
                ? 2
                : 3;
    while (durations[i] < preferred && addSecond(i)) {
      /* Fill within target and budget. */
    }
  }
  while (total() < target) {
    let changed = false;
    for (const { i } of priority) if (addSecond(i)) changed = true;
    if (!changed) break;
  }
  return {
    ...plan,
    timing: "variable-v1",
    duration: total(),
    shots: plan.shots.map((shot, i) => ({ ...shot, seconds: durations[i] })),
  };
}
export function budgetForPlan(plan: FilmPlan, model: ModelProfile): FilmBudget {
  const settings = bytePlusBudgetSettings(model);
  const durations = plan.shots.map((shot) => Number(shot.seconds));
  if (
    plan.timing !== "variable-v1" ||
    durations.some(
      (seconds) => !Number.isInteger(seconds) || seconds < 2 || seconds > 5,
    )
  )
    throw new VideoBudgetError(
      "This film needs a reviewed variable-duration plan before generating scenes.",
    );
  const cost = estimateCents(settings.rate, durations);
  if (cost > settings.capCents)
    throw new VideoBudgetError(
      "The film exceeds the configured generation budget.",
    );
  return {
    version: 2,
    model: model.endpoint,
    resolution: "720p",
    sceneSeconds: durations,
    generatedSeconds: durations.reduce((sum, seconds) => sum + seconds, 0),
    usdPerSecond: settings.rate,
    maxUsd: settings.maxUsd,
    plannedScenes: plan.shots.length,
    estimatedGenerationUsd: cost / 100,
    reserveUsd: settings.maxUsd - settings.capCents / 100,
  };
}

export function assertFilmBudget(plan: FilmPlan, model: ModelProfile) {
  const saved = plan.generationBudget;
  const current = budgetForPlan(plan, model);
  if (
    !saved ||
    saved.version !== 2 ||
    saved.model !== model.endpoint ||
    saved.resolution !== "720p" ||
    JSON.stringify(saved.sceneSeconds) !==
      JSON.stringify(current.sceneSeconds) ||
    saved.generatedSeconds !== current.generatedSeconds ||
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
    estimateCents(saved.usdPerSecond, current.sceneSeconds) / 100;
  const savedCap = Math.floor(saved.maxUsd * 100 * 0.8) / 100;
  if (
    saved.estimatedGenerationUsd !== savedEstimate ||
    Math.max(savedEstimate, current.estimatedGenerationUsd) > savedCap
  )
    throw new VideoBudgetError(
      "The updated price exceeds this film's approved budget. No more scenes will be generated.",
    );
}
