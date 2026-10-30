import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  filmBinary,
  normalizeGeneratedClip,
  editGeneratedClip,
  assembleFilm,
} from "../src/lib/property-film-render";

function streams(path: string) {
  return JSON.parse(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-show_streams", "-of", "json", path],
      { encoding: "utf8" },
    ),
  ).streams;
}

// Decode pixels: lossy H.264 can give repeated pictures different MD5 hashes.
function heldFrames(path: string) {
  const pixels = execFileSync(
    filmBinary(),
    [
      "-v",
      "error",
      "-i",
      path,
      "-vf",
      "scale=160:90",
      "-pix_fmt",
      "gray",
      "-f",
      "rawvideo",
      "-",
    ],
    { maxBuffer: 10 * 1024 * 1024 },
  );
  const size = 160 * 90;
  let held = 0;
  // Exclude edit handles and tail used only for interpolation look-ahead.
  for (let f = 8; f < pixels.length / size - 8; f++) {
    let difference = 0;
    for (let p = 0; p < size; p++)
      difference += Math.abs(pixels[f * size + p] - pixels[(f - 1) * size + p]);
    if (difference / size < 0.15) held++;
  }
  return held;
}

test(
  "24/30fps motion is interpolated without changing ramp, length, transitions or soundtrack",
  { timeout: 180000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "mbp-fluidity-test-"));
    try {
      const edited: Buffer[] = [];
      const durations = [3, 5];
      const normalized: Buffer[] = [];
      for (const [index, fps] of [24, 30].entries()) {
        const seconds = durations[index];
        const sourceSeconds = Math.max(4, seconds);
        const source = join(directory, `source-${fps}.mp4`);
        execFileSync(filmBinary(), [
          "-v",
          "error",
          "-f",
          "lavfi",
          "-i",
          `testsrc2=size=320x180:rate=${fps}:duration=${sourceSeconds}`,
          "-c:v",
          "libx264",
          "-threads",
          "2",
          "-pix_fmt",
          "yuv420p",
          source,
        ]);
        const bytes = await readFile(source);
        const legacy = join(directory, `legacy-${fps}.mp4`);
        await writeFile(
          legacy,
          await normalizeGeneratedClip(
            bytes,
            sourceSeconds,
            seconds,
            "cinematic-walkthrough-v3",
          ),
        );
        const smooth = join(directory, `smooth-${fps}.mp4`);
        const clip = await normalizeGeneratedClip(
          bytes,
          sourceSeconds,
          seconds,
          "cinematic-walkthrough-v3",
          "smooth-v1",
        );
        await writeFile(smooth, clip);
        normalized.push(clip);
        const [video] = streams(smooth);
        assert.equal(Number(video.nb_frames), seconds * 30 + 6);
        assert.equal(video.avg_frame_rate, "30/1");
        assert.equal(video.width, 1280);
        assert.equal(video.height, 720);
        const before = heldFrames(legacy),
          after = heldFrames(smooth);
        assert.ok(
          before >= 8,
          `Fixture must reproduce repeated frames (${before})`,
        );
        assert.ok(
          after < before / 3,
          `Held frames should fall substantially: ${before} -> ${after}`,
        );
        console.log(
          `${fps}fps / ${seconds}s: held frames ${before} -> ${after}`,
        );
        await assert.rejects(
          normalizeGeneratedClip(
            bytes,
            sourceSeconds + 1,
            seconds,
            "cinematic-walkthrough-v3",
            "smooth-v1",
          ),
          /shorter/,
        );
      }
      for (let index = 0; index < normalized.length; index++) {
        edited.push(
          await editGeneratedClip(
            normalized[index],
            normalized[index - 1],
            normalized[index + 1],
            {
              seconds: durations[index],
              previousSeconds: durations[index - 1],
              style: "cinematic-walkthrough-v3",
              entry: "speed",
              exit: "speed",
              shotIndex: index,
            },
          ),
        );
      }
      const output = join(directory, "film.mp4");
      await writeFile(
        output,
        await assembleFilm(edited, 2, durations, "cinematic-walkthrough-v3"),
      );
      const [video, audio] = streams(output);
      assert.equal(Number(video.nb_frames), 240);
      assert.equal(Number(video.duration), 8);
      assert.equal(audio.channels, 2);
      assert.ok(Math.abs(Number(audio.duration) - 8) < 0.1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
