import { createHash } from "node:crypto";
import type { FilmPlan } from "./property-film-plan";

export type FilmSoundtrack = {
  version: "property-score-v1";
  seed: string;
  mood: "warm" | "bright" | "evening";
  sceneEnergy: number[];
};

/** A generation-specific composition, pinned before any provider submission. */
export function planFilmSoundtrack(
  plan: FilmPlan,
  generation: string,
): FilmSoundtrack {
  if (!generation || !plan.shots.length)
    throw new Error("Missing film soundtrack context.");
  const quiet = (category: string) =>
    ["bedroom", "bathroom", "detail", "other"].includes(category);
  const evening =
    plan.shots.filter((s) => s.evening).length / plan.shots.length;
  const calm =
    plan.shots.filter((s) => quiet(s.category)).length / plan.shots.length;
  const average = plan.duration / plan.shots.length;
  return {
    version: "property-score-v1",
    seed: createHash("sha256")
      .update(
        JSON.stringify({
          generation,
          shots: plan.shots.map((s) => [
            s.fingerprint,
            s.category,
            s.evening,
            s.aerial,
            s.seconds,
            s.camera,
          ]),
        }),
      )
      .digest("hex"),
    mood:
      evening >= 0.4
        ? "evening"
        : calm >= 0.5 || average >= 4
          ? "warm"
          : "bright",
    sceneEnergy: plan.shots.map((s) =>
      quiet(s.category) || s.evening
        ? 0.65
        : s.aerial || s.camera === "fpv-glide"
          ? 1
          : 0.8,
    ),
  };
}

export function validateFilmSoundtrack(
  value: unknown,
  shots: number,
): FilmSoundtrack {
  const score = value as FilmSoundtrack;
  if (
    !score ||
    score.version !== "property-score-v1" ||
    typeof score.seed !== "string" ||
    !/^[a-f0-9]{64}$/.test(score.seed) ||
    !["warm", "bright", "evening"].includes(score.mood) ||
    !Array.isArray(score.sceneEnergy) ||
    score.sceneEnergy.length !== shots ||
    score.sceneEnergy.some((v) => ![0.65, 0.8, 1].includes(v))
  )
    throw new Error("Invalid film soundtrack.");
  return score;
}

/** Versioned deterministic musical decisions, independent of percussion noise. */
export function soundtrackArrangement(score: FilmSoundtrack) {
  let a =
    parseInt(score.seed.slice(0, 8), 16) ^
    parseInt(score.seed.slice(32, 40), 16);
  let b =
    parseInt(score.seed.slice(8, 16), 16) ^
    parseInt(score.seed.slice(40, 48), 16);
  let c =
    parseInt(score.seed.slice(16, 24), 16) ^
    parseInt(score.seed.slice(48, 56), 16);
  let d =
    parseInt(score.seed.slice(24, 32), 16) ^
    parseInt(score.seed.slice(56, 64), 16);
  const random = () => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (((c << 21) | (c >>> 11)) + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) random();
  const choose = <T>(items: readonly T[]) =>
    items[Math.floor(random() * items.length)];
  const tonic = 48 + choose([-2, 0, 2, 3, 5, 7]);
  const scale =
    score.mood === "evening" ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
  const progressions = [
    [0, 5, 3, 4],
    [0, 3, 5, 4],
    [5, 3, 0, 4],
    [0, 4, 5, 3],
    [3, 0, 4, 5],
    [0, 1, 3, 4],
  ];
  const progression = choose(progressions);
  const note = (degree: number) =>
    tonic + scale[degree % 7] + 12 * Math.floor(degree / 7);
  const tempo = choose(
    score.mood === "bright"
      ? [112, 120, 128]
      : score.mood === "warm"
        ? [96, 104, 112]
        : [88, 96, 104],
  );
  const motif = Array.from({ length: 16 }, () => Math.floor(random() * 4));
  // Anchor phrase endings on a chord tone; other notes and rests vary by film.
  motif[7] = 0;
  motif[15] = 2;
  return {
    tempo,
    motif,
    rests: Array.from(
      { length: 16 },
      (_, i) =>
        i % 4 !== 0 && random() < (score.mood === "bright" ? 0.12 : 0.3),
    ),
    chords: progression.map((degree) =>
      [0, 2, 4, 6].map((offset) => note(degree + offset)),
    ),
    roots: progression.map((degree) => note(degree) - 12),
    timbre: choose([0.25, 0.55, 0.85, 1.1]),
    syncopation: choose([0.25, 0.5, 0.75]),
    percussion:
      score.mood === "bright" ? 1 : score.mood === "warm" ? 0.65 : 0.45,
  };
}
