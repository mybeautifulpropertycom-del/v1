// Local demonstration only: no provider calls, payments or publishing.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  makeFilmPlan,
  type PhotoAnalysis,
} from "../src/lib/property-film-plan";
import {
  renderFilmShot,
  assembleFilm,
  photoFingerprint,
} from "../src/lib/property-film-render";

async function main() {
  const files = ["villa", "interior", "kitchen", "bedroom"].map(
    (name) => `public/images/${name}.jpg`,
  );
  const bytes = await Promise.all(files.map((file) => readFile(file)));
  const analysis: PhotoAnalysis[] = [
    "exterior",
    "living",
    "kitchen",
    "bedroom",
  ].map((category, index) => ({
    index,
    category: category as PhotoAnalysis["category"],
    strength: index === 0 ? 5 : 3,
    aerial: false,
    evening: false,
  }));
  const plan = makeFilmPlan(
    files,
    analysis,
    await Promise.all(bytes.map(photoFingerprint)),
  );
  const segments: Buffer[] = [];
  for (let i = 0; i < plan.shots.length; i++) {
    const shot = plan.shots[i],
      previous = plan.shots[i - 1],
      next = plan.shots[i + 1];
    segments.push(
      await renderFilmShot(bytes[shot.index], shot, {
        version: plan.version,
        previous: previous
          ? { bytes: bytes[previous.index], shot: previous }
          : undefined,
        next: next ? { bytes: bytes[next.index], shot: next } : undefined,
      }),
    );
  }
  const output =
    process.argv[2] || join(tmpdir(), "mbp-property-film-preview.mp4");
  await writeFile(output, await assembleFilm(segments));
  console.log(
    `Local demo saved: ${output} (${plan.duration} seconds). Uses sample photos, not one verified property. Nothing was published.`,
  );
}
main().catch(() => {
  console.error("The local film preview could not be rendered.");
  process.exitCode = 1;
});
