import assert from "node:assert/strict";
import { test } from "node:test";
import {
  makeFilmPlan,
  validateFilmPlan,
  type FilmPlan,
} from "../src/lib/property-film-plan";
import {
  planFilmSoundtrack,
  validateFilmSoundtrack,
} from "../src/lib/film-soundtrack";
import { originalFilmScore } from "../src/lib/property-film-score";

function plan(): FilmPlan {
  return makeFilmPlan(
    ["exterior.jpg", "living.jpg"],
    [
      {
        index: 0,
        category: "exterior",
        strength: 5,
        aerial: true,
        evening: false,
      },
      {
        index: 1,
        category: "living",
        strength: 4,
        aerial: false,
        evening: false,
      },
    ],
    ["a".repeat(64), "b".repeat(64)],
  );
}

test("music follows observed evening light, quieter rooms and montage pace", () => {
  const film = plan();
  const bright = planFilmSoundtrack(film, "generation-1");
  assert.equal(bright.mood, "bright");
  assert.deepEqual(bright.sceneEnergy, [1, 0.8]);
  const evening = planFilmSoundtrack(
    { ...film, shots: film.shots.map((s) => ({ ...s, evening: true })) },
    "generation-1",
  );
  assert.equal(evening.mood, "evening");
  assert.deepEqual(evening.sceneEnergy, [0.65, 0.65]);
  assert.equal(
    planFilmSoundtrack({ ...film, duration: 10 }, "generation-1").mood,
    "warm",
  );
  assert.equal(
    planFilmSoundtrack(
      {
        ...film,
        shots: film.shots.map((s) => ({ ...s, category: "bedroom" })),
      },
      "generation-1",
    ).mood,
    "warm",
  );
});

test("each generation has reproducible distinct audible music, with stereo, exact length, fades and no clipping", () => {
  const film = plan();
  const first = planFilmSoundtrack(film, "generation-a");
  const second = planFilmSoundtrack(film, "generation-b");
  const a = originalFilmScore(2, [3, 4], "cinematic-walkthrough-v3", first);
  const b = originalFilmScore(2, [3, 4], "cinematic-walkthrough-v3", second);
  assert.deepEqual(
    a,
    originalFilmScore(
      2,
      [3, 4],
      "cinematic-walkthrough-v3",
      JSON.parse(JSON.stringify(first)),
    ),
  );
  assert.notDeepEqual(a, b);
  let lowA = 0,
    lowB = 0,
    cross = 0,
    aa = 0,
    bb = 0;
  for (let i = 44; i < a.length; i += 4) {
    // Low-pass the PCM to compare pitched music rather than different hi-hat noise.
    lowA += 0.06 * (a.readInt16LE(i) - lowA);
    lowB += 0.06 * (b.readInt16LE(i) - lowB);
    cross += lowA * lowB;
    aa += lowA ** 2;
    bb += lowB ** 2;
  }
  assert.ok(
    Math.abs(cross / Math.sqrt(aa * bb)) < 0.8,
    "Different generations must not merely change percussion noise",
  );
  for (const wav of [a, b]) {
    assert.equal(wav.readUInt16LE(22), 2);
    assert.equal(wav.readUInt32LE(24), 48000);
    assert.equal(wav.readUInt32LE(40), 7 * 48000 * 4);
    let energy = 0,
      peak = 0,
      stereo = false;
    for (let i = 44; i < wav.length; i += 4) {
      const l = wav.readInt16LE(i),
        r = wav.readInt16LE(i + 2);
      peak = Math.max(peak, Math.abs(l), Math.abs(r));
      energy += l * l + r * r;
      stereo ||= l !== r;
    }
    assert.ok(peak < 0.88 * 32768);
    assert.ok(Math.sqrt(energy / ((wav.length - 44) / 2)) / 32768 > 0.06);
    assert.ok(stereo);
    assert.equal(wav.readInt16LE(44), 0);
    assert.ok(Math.abs(wav.readInt16LE(wav.length - 4)) < 30);
  }
});

test("saved legacy plans remain valid; corrupt or unknown score versions are rejected", () => {
  const film = plan();
  assert.equal(validateFilmPlan(film).soundtrack, undefined);
  film.soundtrack = planFilmSoundtrack(film, "test");
  assert.deepEqual(validateFilmPlan(film).soundtrack, film.soundtrack);
  for (const patch of [
    { version: "unknown" },
    { seed: "not-a-seed" },
    { mood: "unknown" },
    { sceneEnergy: [NaN, 1] },
    { sceneEnergy: [0.8] },
  ]) {
    assert.throws(() =>
      validateFilmSoundtrack({ ...film.soundtrack, ...patch }, 2),
    );
    assert.throws(() =>
      originalFilmScore(2, undefined, undefined, {
        ...film.soundtrack!,
        ...patch,
      } as any),
    );
  }
});
