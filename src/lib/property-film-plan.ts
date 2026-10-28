import { MAX_PROPERTY_PHOTOS } from "./photo-limits";
import type { FilmBudget } from "./byteplus-budget";
// Shared ordering and timing for original-photo and Higgsfield presentation films.
export const SHOT_SECONDS = 3.4;
export const FILM_FPS = 30;
export const SHOT_FRAMES = 102;
export const MAX_FILM_SHOTS = 23; // Keep the existing scene storage limit; validate total duration separately.
export const FILM_CATEGORIES = [
  "exterior",
  "living",
  "dining",
  "kitchen",
  "bedroom",
  "bathroom",
  "other",
  "detail",
] as const;
export type FilmCategory = (typeof FILM_CATEGORIES)[number];
export type PhotoAnalysis = {
  index: number;
  category: FilmCategory;
  strength: number;
  aerial: boolean;
  evening: boolean;
};
export type FilmShot = PhotoAnalysis & {
  seconds?: number;
  image: string;
  fingerprint: string;
  motion: "push" | "pull" | "glide-left" | "glide-right" | "aerial-glide";
};
export type FilmPlan = {
  timing?: "variable-v1";
  generationBudget?: FilmBudget;
  version: 1 | 2;
  engine: "photo-montage-v1" | "higgsfield-montage-v1";
  secondsPerShot: 3.4;
  duration: number;
  shots: FilmShot[];
  music: "original-instrumental-v1" | "modern-instrumental-v2";
};

export function parsePhotoAnalysis(
  raw: unknown,
  count: number,
): PhotoAnalysis[] {
  if (!Array.isArray(raw) || raw.length !== count)
    throw new Error("The photo analysis is incomplete.");
  const seen = new Set<number>();
  return raw.map((item) => {
    if (
      !item ||
      !Number.isInteger(item.index) ||
      item.index < 0 ||
      item.index >= count ||
      seen.has(item.index) ||
      !FILM_CATEGORIES.includes(item.category) ||
      !Number.isInteger(item.strength) ||
      item.strength < 1 ||
      item.strength > 5 ||
      typeof item.aerial !== "boolean" ||
      typeof item.evening !== "boolean"
    )
      throw new Error("Invalid photo analysis.");
    seen.add(item.index);
    return {
      index: item.index,
      category: item.category,
      strength: item.strength,
      aerial: item.aerial,
      evening: item.evening,
    };
  });
}

export function makeFilmPlan(
  images: string[],
  analysis: PhotoAnalysis[],
  fingerprints: string[],
  maxShots = MAX_FILM_SHOTS,
): FilmPlan {
  if (
    !images.length ||
    images.length > MAX_PROPERTY_PHOTOS ||
    fingerprints.length !== images.length ||
    !Number.isInteger(maxShots) ||
    maxShots < 1 ||
    maxShots > MAX_FILM_SHOTS
  )
    throw new Error("Invalid film photographs.");
  const observations = parsePhotoAnalysis(analysis, images.length);
  const used = new Set<string>();
  const distinct = observations.filter((item) => {
    const key = fingerprints[item.index];
    if (!key || used.has(key)) return false;
    used.add(key);
    return true;
  });
  const rank = (a: PhotoAnalysis, b: PhotoAnalysis) =>
    b.strength - a.strength || a.index - b.index;
  const best = (items: PhotoAnalysis[]) => [...items].sort(rank)[0];
  const exteriors = distinct.filter((item) => item.category === "exterior");
  const opening = best(exteriors.length ? exteriors : distinct);
  const remaining = distinct.filter((item) => item.index !== opening.index);
  const closingExteriors = remaining.filter(
    (item) => item.category === "exterior",
  );
  const closing =
    remaining.length && maxShots > 1
      ? [...(closingExteriors.length ? closingExteriors : remaining)].sort(
          (a, b) => b.strength - a.strength || b.index - a.index,
        )[0]
      : undefined;
  const middle = remaining.filter((item) => item.index !== closing?.index);
  // Reserve a place for each available kind of room before filling by quality.
  const chosen = new Map<number, PhotoAnalysis>();
  const capacity = maxShots - 1 - (closing ? 1 : 0);
  for (const category of FILM_CATEGORIES) {
    const candidate = best(middle.filter((item) => item.category === category));
    if (candidate && chosen.size < capacity)
      chosen.set(candidate.index, candidate);
  }
  for (const item of [...middle].sort(rank)) {
    if (chosen.size >= capacity) break;
    chosen.set(item.index, item);
  }
  const ordered = [
    opening,
    ...[...chosen.values()].sort(
      (a, b) =>
        FILM_CATEGORIES.indexOf(a.category) -
          FILM_CATEGORIES.indexOf(b.category) || rank(a, b),
    ),
    ...(closing ? [closing] : []),
  ];
  return {
    version: 2,
    engine: "photo-montage-v1",
    secondsPerShot: SHOT_SECONDS,
    duration: Number((ordered.length * SHOT_SECONDS).toFixed(1)),
    music: "modern-instrumental-v2",
    shots: ordered.map((item, i) => ({
      ...item,
      image: images[item.index],
      fingerprint: fingerprints[item.index],
      motion: item.aerial
        ? "aerial-glide"
        : (["push", "glide-right", "pull", "glide-left"] as const)[i % 4],
    })),
  };
}

export function validateFilmPlan(value: unknown): FilmPlan {
  const plan = value as FilmPlan;
  if (
    !plan ||
    ![1, 2].includes(plan.version) ||
    !["photo-montage-v1", "higgsfield-montage-v1"].includes(plan.engine) ||
    plan.secondsPerShot !== SHOT_SECONDS ||
    plan.music !==
      (plan.version === 1
        ? "original-instrumental-v1"
        : "modern-instrumental-v2") ||
    !Array.isArray(plan.shots) ||
    !plan.shots.length ||
    plan.shots.length > MAX_FILM_SHOTS ||
    (plan.timing !== undefined && plan.timing !== "variable-v1") ||
    plan.duration > 80 ||
    plan.duration !==
      Number(
        (plan.timing === "variable-v1"
          ? plan.shots.reduce((sum, shot) => sum + Number(shot.seconds), 0)
          : plan.shots.length * SHOT_SECONDS
        ).toFixed(1),
      )
  )
    throw new Error("Invalid film plan.");
  const seen = new Set<string>();
  for (const shot of plan.shots) {
    if (
      typeof shot.image !== "string" ||
      (plan.timing === "variable-v1"
        ? !Number.isInteger(shot.seconds) ||
          Number(shot.seconds) < 2 ||
          Number(shot.seconds) > 5
        : shot.seconds !== undefined) ||
      !/^[a-f0-9]{64}$/.test(shot.fingerprint) ||
      seen.has(shot.image) ||
      !FILM_CATEGORIES.includes(shot.category) ||
      !["push", "pull", "glide-left", "glide-right", "aerial-glide"].includes(
        shot.motion,
      )
    )
      throw new Error("Invalid film shot.");
    seen.add(shot.image);
  }
  return plan;
}
