// Server-only deterministic rendering. FFmpeg receives local files and fixed filters only.
import { spawn } from "node:child_process";
import { join } from "node:path";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import sharp from "sharp";
import {
  FILM_FPS,
  SHOT_FRAMES,
  SHOT_SECONDS,
  MAX_FILM_SHOTS,
  type FilmShot,
} from "./property-film-plan";

export function filmBinary() {
  // Optional Linux package is bundled explicitly by Next for Vercel. Local
  // development on other systems can supply a trusted absolute binary path.
  return (
    process.env.PROPERTY_FILM_FFMPEG ||
    join(
      process.cwd(),
      "node_modules",
      "@ffmpeg-installer",
      "linux-x64",
      "ffmpeg",
    )
  );
}
export async function executeFilmCommand(args: string[], timeout = 60000) {
  await new Promise<void>((resolve, reject) => {
    // The binary is explicitly included in next.config.ts. Do not trace a
    // runtime binary override as the whole project (including private files).
    const child = spawn(
      /* turbopackIgnore: true */ filmBinary(),
      ["-nostdin", "-hide_banner", "-loglevel", "error", "-y", ...args],
      {
        stdio: ["ignore", "ignore", "pipe"],
        shell: false,
      },
    );
    // Never expose filenames, raw image data or upstream details in errors.
    child.stderr.resume();
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, timeout);
    child.once("error", () => {
      clearTimeout(timer);
      reject(new Error("The film renderer is unavailable."));
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error("The film renderer could not finish this step."));
    });
  });
}

export async function photoFingerprint(bytes: Buffer) {
  const image = sharp(bytes, { limitInputPixels: 40000000, animated: false });
  const metadata = await image.metadata();
  if (
    !["jpeg", "png", "webp"].includes(metadata.format || "") ||
    !metadata.width ||
    !metadata.height ||
    (metadata.pages || 1) > 1
  )
    throw new Error("Use a still photograph for the film.");
  // Hash decoded, oriented pixels, not the filename or EXIF/container bytes.
  const { data, info } = await image
    .rotate()
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  return createHash("sha256")
    .update(`${info.width}:${info.height}:`)
    .update(data)
    .digest("hex");
}

export function motionFilter(shot: FilmShot) {
  // Vary acceleration, never perspective or room geometry. Each shot remains
  // exactly 102 frames. Discrete cuts avoid suggesting a physical room route.
  const progress = `(0.75*on/${SHOT_FRAMES - 1}+0.25*pow(on/${SHOT_FRAMES - 1},3))`;
  const zoom =
    shot.motion === "pull"
      ? `1.065-0.055*${progress}`
      : `1.01+0.055*${progress}`;
  const glide =
    shot.motion === "glide-left"
      ? `0.7-0.4*${progress}`
      : `0.3+0.4*${progress}`;
  const x = shot.motion.includes("glide")
    ? `(iw-iw/zoom)*(${glide})`
    : "(iw-iw/zoom)/2";
  const y =
    shot.motion === "aerial-glide"
      ? `(ih-ih/zoom)*(0.65-0.3*${progress})`
      : "(ih-ih/zoom)/2";
  return `zoompan=z='${zoom}':x='${x}':y='${y}':d=${SHOT_FRAMES}:s=1280x720:fps=${FILM_FPS},setsar=1,format=yuv420p,fade=t=in:st=0:d=0.1,fade=t=out:st=3.3:d=0.1`;
}

export async function renderFilmShot(
  bytes: Buffer,
  shot: FilmShot,
): Promise<Buffer> {
  const directory = await mkdtemp(join(tmpdir(), "mbp-shot-"));
  try {
    const input = join(directory, "photo.png"),
      output = join(directory, "shot.mp4");
    // Fit without stretching or filling unseen content. Portrait photos retain
    // neutral letterboxing. Only a small camera crop is animated afterward.
    await sharp(bytes, { limitInputPixels: 40000000, animated: false })
      .rotate()
      .resize(2560, 1440, { fit: "contain", background: "#111916" })
      .png()
      .toFile(input);
    await executeFilmCommand([
      "-protocol_whitelist",
      "file,pipe",
      "-threads",
      "2",
      "-i",
      input,
      "-vf",
      motionFilter(shot),
      "-frames:v",
      String(SHOT_FRAMES),
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-maxrate",
      "3M",
      "-bufsize",
      "6M",
      "-threads",
      "2",
      "-r",
      String(FILM_FPS),
      "-video_track_timescale",
      "15360",
      "-movflags",
      "+faststart",
      output,
    ]);
    return await readFile(output);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** Original synthetic instrumental composition; no samples or third-party song.
 * Four beats per 3.4-second shot = 70.588235 BPM. Beat one coincides with each cut.
 * Written specifically for this application; see docs/PROPERTY-FILMS.md.
 */
export function originalFilmScore(shots: number): Buffer {
  if (!Number.isInteger(shots) || shots < 1 || shots > MAX_FILM_SHOTS)
    throw new Error("Invalid score duration.");
  const rate = 24000,
    seconds = shots * SHOT_SECONDS,
    count = Math.round(seconds * rate);
  const wav = Buffer.alloc(44 + count * 2);
  wav.write("RIFF");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(count * 2, 40);
  const chords = [
    [48, 55, 60, 64],
    [45, 52, 57, 60],
    [41, 48, 53, 57],
    [43, 50, 55, 59],
  ];
  const freq = (note: number) => 440 * 2 ** ((note - 69) / 12);
  let previous = 0;
  for (let i = 0; i < count; i++) {
    const t = i / rate,
      bar = Math.floor(t / SHOT_SECONDS),
      within = t % SHOT_SECONDS;
    const beat = Math.floor(within / 0.85),
      since = within % 0.85,
      chord = chords[bar % chords.length];
    const pluckNote = chord[[0, 2, 1, 3][beat]] + 12;
    const attack = Math.min(1, since / 0.012),
      decay = Math.exp(-since * 4);
    const pluck =
      Math.sin(2 * Math.PI * freq(pluckNote) * since) +
      0.2 * Math.sin(4 * Math.PI * freq(pluckNote) * since);
    const padEnvelope =
      Math.min(1, within / 0.18) * Math.min(1, (SHOT_SECONDS - within) / 0.25);
    const pad =
      chord
        .slice(1)
        .reduce(
          (sum, note) => sum + Math.sin(2 * Math.PI * freq(note) * t),
          0,
        ) / 3;
    const kick =
      Math.sin(2 * Math.PI * (48 * since + 1.4 * (1 - Math.exp(-since * 25)))) *
      Math.exp(-since * 14);
    const fade = Math.min(1, t / 0.35, (seconds - t) / 0.8);
    const sample =
      (0.19 * pluck * attack * decay + 0.1 * pad * padEnvelope + 0.11 * kick) *
      fade;
    previous = 0.25 * previous + 0.75 * sample;
    wav.writeInt16LE(
      Math.round(Math.max(-0.85, Math.min(0.85, previous)) * 32767),
      44 + i * 2,
    );
  }
  return wav;
}

export async function assembleFilm(segments: Buffer[]): Promise<Buffer> {
  if (!segments.length || segments.length > MAX_FILM_SHOTS)
    throw new Error("Invalid film length.");
  const directory = await mkdtemp(join(tmpdir(), "mbp-film-"));
  try {
    for (let i = 0; i < segments.length; i++)
      await writeFile(join(directory, `shot-${i}.mp4`), segments[i]);
    const list = join(directory, "shots.txt"),
      music = join(directory, "score.wav"),
      output = join(directory, "film.mp4");
    await writeFile(
      list,
      segments.map((_, i) => `file 'shot-${i}.mp4'`).join("\n"),
    );
    await writeFile(music, originalFilmScore(segments.length));
    await executeFilmCommand([
      "-protocol_whitelist",
      "file,pipe",
      "-f",
      "concat",
      "-safe",
      "1",
      "-i",
      list,
      "-i",
      music,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-t",
      String(Number((segments.length * SHOT_SECONDS).toFixed(1))),
      "-movflags",
      "+faststart",
      output,
    ]);
    const result = await readFile(output);
    if (result.length > 50 * 1024 * 1024)
      throw new Error("The film exceeds the video storage limit.");
    return result;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
