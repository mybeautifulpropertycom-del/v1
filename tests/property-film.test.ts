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
  const images = Array.from({ length: 30 }, (_, i) => `photo-${i}`);
  const analysis = images.map((_, i) => photo(i));
  analysis[0] = photo(0, "exterior", 5);
  analysis[29] = { ...photo(29, "exterior", 4), aerial: true, evening: true };
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
  assert.equal(plan.shots.at(-1)?.index, 29);
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
      assert.equal(score.readUInt32LE(40), 78.2 * 24000 * 2);
      assert.throws(() => originalFilmScore(24));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
