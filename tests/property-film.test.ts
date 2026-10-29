import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import {
  makeFilmPlan,
  parsePhotoAnalysis,
  validateFilmPlan,
  type PhotoAnalysis,
} from "../src/lib/property-film-plan";
import {
  renderFilmShot,
  assembleFilm,
  photoFingerprint,
  originalFilmScore,
  filmBinary,
  normalizeGeneratedClip,
  editGeneratedClip,
} from "../src/lib/property-film-render";
import { ownedFilmImages } from "../src/lib/property-film-worker";

const fingerprint = (i: number) => i.toString(16).padStart(64, "0");
const photo = (
  index: number,
  category: PhotoAnalysis["category"] = "living",
  strength = 3,
): PhotoAnalysis => ({
  index,
  category,
  strength,
  aerial: false,
  evening: false,
});

test("film respects 3.4-second slots, 80-second cap, distinct exteriors and room coverage", () => {
  const images = Array.from({ length: 40 }, (_, i) => `photo-${i}`);
  const analysis = images.map((_, i) => photo(i));
  analysis[0] = photo(0, "exterior", 5);
  analysis[39] = { ...photo(39, "exterior", 4), aerial: true, evening: true };
  analysis[25] = photo(25, "bathroom", 1);
  analysis[26] = photo(26, "kitchen", 1);
  const plan = makeFilmPlan(
    images,
    analysis,
    images.map((_, i) => fingerprint(i)),
  );
  assert.equal(plan.shots.length, 23);
  assert.equal(plan.duration, 78.2);
  assert.equal(plan.shots[0].index, 0);
  assert.equal(plan.shots.at(-1)?.index, 39);
  assert.equal(new Set(plan.shots.map((shot) => shot.image)).size, 23);
  assert.ok(plan.shots.some((shot) => shot.category === "bathroom"));
  assert.ok(plan.shots.some((shot) => shot.category === "kitchen"));
  assert.equal(plan.shots.at(-1)?.motion, "aerial-glide");
  assert.equal(plan.shots.at(-1)?.evening, true);
  assert.equal(plan.shots.filter((shot) => shot.evening).length, 1);
  assert.equal(validateFilmPlan(plan), plan);
  assert.throws(() => validateFilmPlan({ ...plan, duration: 80 }));
});
test("one exterior is never repeated and identical decoded photographs are deduplicated", async () => {
  const images = ["outside", "same-outside-another-file", "living", "bedroom"];
  const plan = makeFilmPlan(
    images,
    [photo(0, "exterior"), photo(1, "exterior"), photo(2), photo(3, "bedroom")],
    [fingerprint(0), fingerprint(0), fingerprint(2), fingerprint(3)],
  );
  assert.equal(plan.shots.length, 3);
  assert.equal(plan.shots[0].image, "outside");
  assert.notEqual(plan.shots.at(-1)?.category, "exterior");
  const one = makeFilmPlan(["only"], [photo(0)], [fingerprint(0)]);
  assert.equal(one.duration, 3.4);
  assert.equal(one.shots.length, 1);
  const raw = Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]);
  const a = await sharp(raw, { raw: { width: 2, height: 2, channels: 3 } })
    .png({ compressionLevel: 1 })
    .toBuffer();
  const b = await sharp(raw, { raw: { width: 2, height: 2, channels: 3 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  assert.equal(await photoFingerprint(a), await photoFingerprint(b));
  await assert.rejects(
    photoFingerprint(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
      ),
    ),
  );
});
test("analysis and source checks reject missing photos, duplicate indices and unowned URLs", () => {
  assert.throws(() => parsePhotoAnalysis([photo(0), photo(0)], 2));
  assert.throws(() => parsePhotoAnalysis([photo(0)], 2));
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://film-test.supabase.co";
  const job = {
    owner_id: "owner",
    property_id: "property",
    source: {
      images: [
        "https://film-test.supabase.co/storage/v1/object/public/property-images/owner/property/cover.jpg",
      ],
    },
  };
  assert.deepEqual(ownedFilmImages(job), job.source.images);
  for (const path of [
    "https://evil.example/cover.jpg",
    "https://film-test.supabase.co/storage/v1/object/public/property-images/other/property/cover.jpg",
    "https://film-test.supabase.co/storage/v1/object/public/property-images/owner/property/%2e%2e/secret.jpg",
  ])
    assert.throws(() =>
      ownedFilmImages({ ...job, source: { images: [path] } }),
    );
});
test(
  "real packaged FFmpeg renders 102-frame shots and assembles an instrumental MP4 without text or a voice track",
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "mbp-film-test-"));
    try {
      const bytes = await sharp({
        create: { width: 960, height: 540, channels: 3, background: "#648273" },
      })
        .png()
        .toBuffer();
      const plan = makeFilmPlan(
        ["photo"],
        [photo(0)],
        [await photoFingerprint(bytes)],
      );
      const segment = await renderFilmShot(bytes, plan.shots[0]);
      const single = join(directory, "single.mp4");
      await writeFile(single, segment);
      const probe = (path: string) =>
        JSON.parse(
          execFileSync(
            "ffprobe",
            [
              "-v",
              "error",
              "-show_streams",
              "-show_format",
              "-of",
              "json",
              path,
            ],
            { encoding: "utf8" },
          ),
        );
      const shot = probe(single).streams[0];
      assert.equal(Number(shot.nb_frames), 102);
      assert.equal(Number(shot.duration), 3.4);
      assert.equal(shot.width, 1280);
      assert.equal(shot.height, 720);
      const film = await assembleFilm([segment, segment, segment]);
      const final = join(directory, "final.mp4");
      await writeFile(final, film);
      const output = probe(final);
      const video = output.streams.find(
        (s: { codec_type: string }) => s.codec_type === "video",
      );
      assert.equal(Number(video.nb_frames), 306);
      assert.ok(Math.abs(Number(video.duration) - 10.2) < 0.04);
      assert.ok(
        output.streams.some(
          (s: { codec_name: string }) => s.codec_name === "aac",
        ),
      );
      const longest = await assembleFilm(
        Array.from({ length: 23 }, () => segment),
      );
      await writeFile(final, longest);
      assert.ok(Number(probe(final).format.duration) <= 80);
      assert.ok(longest.length < 50 * 1024 * 1024);
      const score = originalFilmScore(23);
      assert.equal(score.readUInt32LE(40), 78.2 * 48000 * 4);
      assert.throws(() => originalFilmScore(24));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  "fractional glides advance continuously without integer-crop jitter",
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "mbp-motion-test-"));
    try {
      const bytes = await sharp({
        create: { width: 1280, height: 720, channels: 3, background: "black" },
      })
        .composite([
          {
            input: await sharp({
              create: {
                width: 300,
                height: 720,
                channels: 3,
                background: "white",
              },
            })
              .png()
              .toBuffer(),
            left: 490,
            top: 0,
          },
        ])
        .png()
        .toBuffer();
      const plan = makeFilmPlan(
        ["photo"],
        [photo(0)],
        [await photoFingerprint(bytes)],
      );
      const shot = { ...plan.shots[0], motion: "glide-right" as const };
      const file = join(directory, "glide.mp4");
      await writeFile(file, await renderFilmShot(bytes, shot));
      const pixels = execFileSync(
        filmBinary(),
        [
          "-v",
          "error",
          "-i",
          file,
          "-vf",
          "crop=1280:2:0:360,format=gray",
          "-f",
          "rawvideo",
          "-",
        ],
        { maxBuffer: 2 * 1024 * 1024 },
      );
      const centers: number[] = [];
      for (let frame = 0; frame < 102; frame++) {
        let mass = 0,
          weighted = 0;
        for (let x = 0; x < 1280; x++) {
          const value = pixels[frame * 2560 + x];
          mass += value;
          weighted += value * x;
        }
        centers.push(weighted / mass);
      }
      const expected = (frame: number) => {
        const t = (frame + 3) / 107;
        const p = 0.35 * t + 0.65 * (4 * (t - 0.5) ** 3 + 0.5);
        return -204.8 * (0.08 + 0.84 * p);
      };
      let worst = 0;
      for (let frame = 1; frame < 102; frame++) {
        assert.ok(
          centers[frame] < centers[frame - 1] - 0.1,
          "No stuck or reversing frames",
        );
        worst = Math.max(
          worst,
          Math.abs(
            centers[frame] - centers[0] - (expected(frame) - expected(0)),
          ),
        );
      }
      assert.ok(worst < 0.25, `Subpixel trajectory error ${worst}`);
      assert.ok(centers[0] - centers[101] > 145, "Motion is clearly visible");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  "six-frame transitions have no black dip and preserve exact shot slots",
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "mbp-transition-test-"));
    try {
      const red = await sharp({
        create: {
          width: 1280,
          height: 720,
          channels: 3,
          background: "#e84a38",
        },
      })
        .png()
        .toBuffer();
      const blue = await sharp({
        create: {
          width: 1280,
          height: 720,
          channels: 3,
          background: "#2846e8",
        },
      })
        .png()
        .toBuffer();
      const plan = makeFilmPlan(
        ["red", "blue"],
        [photo(0), photo(1)],
        [await photoFingerprint(red), await photoFingerprint(blue)],
      );
      const a = await renderFilmShot(red, plan.shots[0], {
        next: { bytes: blue, shot: plan.shots[1] },
      });
      const b = await renderFilmShot(blue, plan.shots[1], {
        previous: { bytes: red, shot: plan.shots[0] },
      });
      const file = join(directory, "transition.mp4");
      await writeFile(file, await assembleFilm([a, b]));
      const rgb = execFileSync(
        filmBinary(),
        [
          "-v",
          "error",
          "-i",
          file,
          "-vf",
          "scale=1:1,format=rgb24",
          "-f",
          "rawvideo",
          "-",
        ],
        { maxBuffer: 10000 },
      );
      assert.equal(rgb.length, 204 * 3);
      for (let f = 99; f <= 104; f++) {
        assert.ok(
          rgb[f * 3] + rgb[f * 3 + 2] > 180,
          "Transition never fades to black",
        );
        if (f > 99) {
          assert.ok(
            rgb[f * 3] < rgb[(f - 1) * 3],
            "Red fades continuously across the scene boundary",
          );
          assert.ok(
            rgb[f * 3 + 2] > rgb[(f - 1) * 3 + 2],
            "Blue enters continuously",
          );
        }
      }
      const score = originalFilmScore(2);
      assert.equal(score.readUInt16LE(22), 2);
      assert.equal(score.readUInt32LE(24), 48000);
      let peak = 0,
        energy = 0,
        stereo = 0;
      for (let i = 44; i < score.length; i += 4) {
        const l = score.readInt16LE(i) / 32768,
          r = score.readInt16LE(i + 2) / 32768;
        peak = Math.max(peak, Math.abs(l), Math.abs(r));
        energy += l * l + r * r;
        stereo += Math.abs(l - r);
      }
      assert.ok(peak < 0.9);
      assert.ok(Math.sqrt(energy / ((score.length - 44) / 2)) > 0.06);
      assert.ok(stereo > 100, "Real stereo arrangement");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  "six-second generated footage retains movement and becomes exact 3.4-second edited slots",
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "mbp-provider-edit-test-"));
    try {
      const input = join(directory, "generated.mp4");
      execFileSync(filmBinary(), [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=320x180:rate=30:duration=6",
        "-c:v",
        "libx264",
        "-threads",
        "2",
        "-pix_fmt",
        "yuv420p",
        input,
      ]);
      const { readFile } = await import("node:fs/promises");
      const normalized = await normalizeGeneratedClip(await readFile(input), 6);
      const normalPath = join(directory, "normal.mp4");
      await writeFile(normalPath, normalized);
      const probe = (file: string) =>
        JSON.parse(
          execFileSync(
            "ffprobe",
            ["-v", "error", "-show_streams", "-of", "json", file],
            { encoding: "utf8" },
          ),
        ).streams;
      assert.equal(Number(probe(normalPath)[0].nb_frames), 108);
      const edited = await editGeneratedClip(
        normalized,
        normalized,
        normalized,
      );
      const output = join(directory, "edited.mp4");
      await writeFile(output, edited);
      assert.equal(Number(probe(output)[0].nb_frames), 102);
      assert.equal(Number(probe(output)[0].duration), 3.4);
      assert.equal(probe(output).length, 1, "Provider audio is removed");
      // Moving source produces changing frames, not a first-frame photo animation.
      const hashes = execFileSync(
        filmBinary(),
        ["-v", "error", "-i", output, "-f", "framemd5", "-"],
        { encoding: "utf8" },
      );
      assert.ok(
        new Set(
          hashes
            .split("\n")
            .filter((l) => l && !l.startsWith("#"))
            .map((l) => l.split(",").at(-1)),
        ).size > 98,
      );
      const short = join(directory, "short.mp4");
      execFileSync(filmBinary(), [
        "-v",
        "error",
        "-i",
        input,
        "-t",
        "2",
        "-c",
        "copy",
        short,
      ]);
      await assert.rejects(
        normalizeGeneratedClip(await readFile(short), 6),
        /shorter/,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  "variable 2/3/4/5-second scenes retain motion, exact lengths and continuous stereo music",
  { timeout: 180000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "mbp-variable-film-"));
    try {
      const { readFile } = await import("node:fs/promises");
      const durations = [2, 3, 4, 5];
      const normalized: Buffer[] = [];
      const probe = (path: string) =>
        JSON.parse(
          execFileSync(
            "ffprobe",
            ["-v", "error", "-show_streams", "-of", "json", path],
            { encoding: "utf8" },
          ),
        ).streams;
      for (const seconds of durations) {
        const sourceSeconds = Math.max(4, seconds);
        const path = join(directory, `source-${seconds}.mp4`);
        execFileSync(filmBinary(), [
          "-v",
          "error",
          "-f",
          "lavfi",
          "-i",
          `testsrc2=size=320x180:rate=30:duration=${sourceSeconds}`,
          "-c:v",
          "libx264",
          "-threads",
          "2",
          "-pix_fmt",
          "yuv420p",
          path,
        ]);
        const clip = await normalizeGeneratedClip(
          await readFile(path),
          sourceSeconds,
          seconds,
        );
        const resultPath = join(directory, `normalized-${seconds}.mp4`);
        await writeFile(resultPath, clip);
        assert.equal(Number(probe(resultPath)[0].nb_frames), seconds * 30 + 6);
        normalized.push(clip);
      }
      const edited: Buffer[] = [];
      for (let i = 0; i < durations.length; i++) {
        const clip = await editGeneratedClip(
          normalized[i],
          normalized[i - 1],
          normalized[i + 1],
          { seconds: durations[i], previousSeconds: durations[i - 1] },
        );
        const path = join(directory, `edited-${i}.mp4`);
        await writeFile(path, clip);
        const stream = probe(path)[0];
        assert.equal(Number(stream.nb_frames), durations[i] * 30);
        assert.equal(Number(stream.duration), durations[i]);
        edited.push(clip);
      }
      const path = join(directory, "walkthrough.mp4");
      await writeFile(path, await assembleFilm(edited, 2, durations));
      const streams = probe(path);
      assert.equal(
        Number(streams.find((s: any) => s.codec_type === "video").duration),
        14,
      );
      const audio = streams.find((s: any) => s.codec_type === "audio");
      assert.equal(audio.channels, 2);
      assert.ok(Math.abs(Number(audio.duration) - 14) < 0.1);
      const score = originalFilmScore(4, durations);
      assert.equal(score.readUInt32LE(40), 14 * 48000 * 4);
      await assert.rejects(() => assembleFilm(edited, 2, [2, 3]), /timeline/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
