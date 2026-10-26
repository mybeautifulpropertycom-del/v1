// Shared film specification. No generative image/video operations are used.
export const SHOT_SECONDS = 3.4;
export const FILM_FPS = 30;
export const SHOT_FRAMES = 102;
export const MAX_FILM_SHOTS = 23; // 78.2 seconds; 24 shots would exceed 80.
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
  image: string;
  fingerprint: string;
  motion: "push" | "pull" | "glide-left" | "glide-right" | "aerial-glide";
};
export type FilmPlan = {
  version: 1;
  engine: "photo-montage-v1";
  secondsPerShot: 3.4;
  duration: number;
  shots: FilmShot[];
  music: "original-instrumental-v1";
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
): FilmPlan {
  if (
    !images.length ||
    images.length > 30 ||
    fingerprints.length !== images.length
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
  const closing = remaining.length
    ? [...(closingExteriors.length ? closingExteriors : remaining)].sort(
        (a, b) => b.strength - a.strength || b.index - a.index,
      )[0]
    : undefined;
  const middle = remaining.filter((item) => item.index !== closing?.index);
  // Reserve a place for each available kind of room before filling by quality.
  const chosen = new Map<number, PhotoAnalysis>();
  const capacity = MAX_FILM_SHOTS - 1 - (closing ? 1 : 0);
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
    version: 1,
    engine: "photo-montage-v1",
    secondsPerShot: SHOT_SECONDS,
    duration: Number((ordered.length * SHOT_SECONDS).toFixed(1)),
    music: "original-instrumental-v1",
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
    plan.version !== 1 ||
    plan.engine !== "photo-montage-v1" ||
    plan.secondsPerShot !== SHOT_SECONDS ||
    plan.music !== "original-instrumental-v1" ||
    !Array.isArray(plan.shots) ||
    !plan.shots.length ||
    plan.shots.length > MAX_FILM_SHOTS ||
    plan.duration !== Number((plan.shots.length * SHOT_SECONDS).toFixed(1))
  )
    throw new Error("Invalid film plan.");
  const seen = new Set<string>();
  for (const shot of plan.shots) {
    if (
      typeof shot.image !== "string" ||
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
