import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  makeFilmPlan,
  directCinematicWalkthrough,
  validateFilmPlan,
  type FilmPlan,
} from "../src/lib/property-film-plan";
import { bytePlusModel } from "../src/lib/byteplus-video";
import { sceneGenerationInput } from "../src/lib/higgsfield-film-worker";
import {
  normalizeGeneratedClip,
  editGeneratedClip,
  assembleFilm,
  filmBinary,
  originalFilmScore,
} from "../src/lib/property-film-render";

function plan(): FilmPlan {
  const categories = [
    "exterior",
    "living",
    "dining",
    "kitchen",
    "bedroom",
    "bathroom",
    "detail",
    "exterior",
  ] as const;
  const base = makeFilmPlan(
    categories.map((_, i) => `photo-${i}`),
    categories.map((category, index) => ({
      index,
      category,
      strength: 5,
      aerial: index === 7,
      evening: index === 7,
    })),
    categories.map((_, i) => i.toString(16).padStart(64, "0")),
  );
  return {
    ...base,
    engine: "higgsfield-montage-v1",
    timing: "variable-v1",
    duration: base.shots.length * 3,
    shots: base.shots.map((s) => ({ ...s, seconds: 3 })),
  };
}

test("new direction preserves photos and timing, reserves FPV for principal views, and keeps detail transitions calm", () => {
  const old = plan();
  const directed = directCinematicWalkthrough(old);
  assert.equal(validateFilmPlan(directed), directed);
  assert.equal(old.style, undefined);
  assert.equal(directed.shots[0].camera, "wide-push");
  assert.equal(directed.shots.at(-1)?.camera, "fpv-glide");
  assert.equal(directed.shots.at(-1)?.aerial, true);
  assert.equal(directed.shots.at(-1)?.evening, true);
  assert.equal(directed.duration, old.duration);
  assert.deepEqual(
    directed.shots.map(({ image, fingerprint, seconds }) => ({
      image,
      fingerprint,
      seconds,
    })),
    old.shots.map(({ image, fingerprint, seconds }) => ({
      image,
      fingerprint,
      seconds,
    })),
  );
  assert.ok(directed.shots.some((s) => s.transition === "speed"));
  for (const shot of directed.shots.filter((s) =>
    ["bedroom", "bathroom", "detail"].includes(s.category),
  )) {
    assert.equal(shot.camera, "steady-glide");
    assert.equal(shot.transition, "soft");
  }
  assert.equal(validateFilmPlan(old), old, "Saved legacy plans remain valid");
  assert.throws(() => validateFilmPlan({ ...directed, style: "untrusted" }));
  assert.throws(() =>
    validateFilmPlan({
      ...directed,
      shots: directed.shots.map((s) => ({ ...s, camera: "fly-through-wall" })),
    }),
  );
});

test("prompts specify controlled wide push and FPV without changing budgeted duration or inventing room connections", () => {
  const directed = directCinematicWalkthrough(plan());
  const model = bytePlusModel();
  const text = (index: number) =>
    JSON.stringify(sceneGenerationInput(model, directed.shots[index]));
  assert.match(text(0), /Wide push/);
  assert.match(text(1), /FPV-inspired/);
  assert.match(text(1), /original ground-level camera height/);
  assert.match(text(directed.shots.length - 1), /genuine aerial photograph/);
  for (let i = 0; i < directed.shots.length; i++) {
    const input = sceneGenerationInput(model, directed.shots[i]);
    assert.equal(input.duration, 4);
    assert.equal(input.generate_audio, false);
    assert.match(
      JSON.stringify(input),
      /Do not fly through walls, doors or windows/,
    );
    assert.match(JSON.stringify(input), /No morphing/);
  }
  assert.doesNotMatch(
    JSON.stringify(sceneGenerationInput(model, plan().shots[0])),
    /Wide push|FPV-inspired/,
    "Previously saved plans retain their original prompt",
  );
});

test("cinematic score is deterministic stereo without clipping and matches the exact montage duration", () => {
  const score = originalFilmScore(4, [2, 3, 4, 5], "cinematic-walkthrough-v3");
  assert.deepEqual(
    score,
    originalFilmScore(4, [2, 3, 4, 5], "cinematic-walkthrough-v3"),
  );
  assert.equal(score.readUInt16LE(22), 2);
  assert.equal(score.readUInt32LE(40), 14 * 48000 * 4);
  assert.notDeepEqual(score, originalFilmScore(4, [2, 3, 4, 5]));
  let peak = 0,
    stereo = false;
  for (let i = 44; i < score.length; i += 4) {
    peak = Math.max(
      peak,
      Math.abs(score.readInt16LE(i)),
      Math.abs(score.readInt16LE(i + 2)),
    );
    if (score.readInt16LE(i) !== score.readInt16LE(i + 2)) stereo = true;
  }
  assert.ok(peak > 1000 && peak < 30000);
  assert.ok(stereo);
});

test(
  "speed transitions render moving 720p scenes with exact timing and continuous stereo audio",
  { timeout: 180000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "mbp-cinematic-v3-"));
    try {
      const source = join(directory, "source.mp4");
      execFileSync(filmBinary(), [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=320x180:rate=30:duration=4",
        "-c:v",
        "libx264",
        "-threads",
        "2",
        "-pix_fmt",
        "yuv420p",
        source,
      ]);
      const durations = [2, 3, 4];
      const normalized: Buffer[] = [];
      for (const seconds of durations)
        normalized.push(
          await normalizeGeneratedClip(
            await readFile(source),
            4,
            seconds,
            "cinematic-walkthrough-v3",
          ),
        );
      const edited: Buffer[] = [];
      for (let i = 0; i < durations.length; i++) {
        edited.push(
          await editGeneratedClip(
            normalized[i],
            normalized[i - 1],
            normalized[i + 1],
            {
              seconds: durations[i],
              previousSeconds: durations[i - 1],
              style: "cinematic-walkthrough-v3",
              entry: "speed",
              exit: "speed",
              shotIndex: i,
            },
          ),
        );
      }
      const output = join(directory, "film.mp4");
      await writeFile(
        output,
        await assembleFilm(edited, 2, durations, "cinematic-walkthrough-v3"),
      );
      const streams = JSON.parse(
        execFileSync(
          "ffprobe",
          ["-v", "error", "-show_streams", "-of", "json", output],
          { encoding: "utf8" },
        ),
      ).streams;
      const video = streams.find((s: any) => s.codec_type === "video");
      const audio = streams.find((s: any) => s.codec_type === "audio");
      assert.equal(Number(video.nb_frames), 270);
      assert.equal(Number(video.duration), 9);
      assert.equal(video.width, 1280);
      assert.equal(video.height, 720);
      assert.equal(audio.channels, 2);
      assert.ok(Math.abs(Number(audio.duration) - 9) < 0.1);
      const pixels = execFileSync(
        filmBinary(),
        [
          "-v",
          "error",
          "-i",
          output,
          "-vf",
          "scale=16:9",
          "-pix_fmt",
          "rgb24",
          "-f",
          "rawvideo",
          "-",
        ],
        { maxBuffer: 1024 * 1024 },
      );
      const frameSize = 16 * 9 * 3;
      for (const index of [58, 59, 60, 61, 148, 149, 150, 151]) {
        const frame = pixels.subarray(
          index * frameSize,
          (index + 1) * frameSize,
        );
        assert.ok(
          frame.reduce((sum, v) => sum + v, 0) / frameSize > 30,
          "No black frames across whip transitions",
        );
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
