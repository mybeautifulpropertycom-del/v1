// Server-only deterministic rendering. FFmpeg receives local files and fixed filters only.
import { spawn } from "node:child_process";
import { join } from "node:path";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { originalFilmScore } from "./property-film-score";
export { originalFilmScore } from "./property-film-score";
import {
  FILM_FPS,
  SHOT_FRAMES,
  SHOT_SECONDS,
  MAX_FILM_SHOTS,
  type FilmShot,
  type FilmPlan,
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

function legacyMotionFilter(shot: FilmShot) {
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

async function renderLegacyFilmShot(
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
      legacyMotionFilter(shot),
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

/** Rectangular crop sampled at fractional coordinates. Unlike zoompan's integer
 * crop, cubic RGB/4:4:4 resampling retains subpixel motion at architectural edges.
 * All four corners use the SAME scale: no perspective warp or invented depth.
 */
export function motionFilter(shot: FilmShot, offset = 3) {
  const t = `min(1,max(0,(in-1+${offset})/107))`;
  // Fast arrival, steady middle glide, fast departure; continuous velocity.
  const p = `(0.35*${t}+0.65*(4*pow(${t}-0.5,3)+0.5))`;
  const z =
    shot.motion === "pull"
      ? `(1.20-0.175*${p})`
      : shot.motion === "push"
        ? `(1.025+0.175*${p})`
        : shot.motion === "aerial-glide"
          ? `(1.20-0.10*${p})`
          : "1.16";
  const cx =
    shot.motion === "glide-left"
      ? `(0.92-0.84*${p})`
      : shot.motion === "glide-right"
        ? `(0.08+0.84*${p})`
        : "0.5";
  const cy = shot.motion === "aerial-glide" ? `(0.82-0.64*${p})` : "0.5";
  const x = `W*(1-1/${z})*${cx}`,
    y = `H*(1-1/${z})*${cy}`;
  return `format=yuv444p,perspective=x0='${x}':y0='${y}':x1='${x}+W/${z}':y1='${y}':x2='${x}':y2='${y}+H/${z}':x3='${x}+W/${z}':y3='${y}+H/${z}':sense=source:eval=frame:interpolation=cubic,scale=1280:720:flags=lanczos,setsar=1`;
}
export type FilmNeighbour = { bytes: Buffer; shot: FilmShot };
export type ShotRenderOptions = {
  version?: 1 | 2;
  previous?: FilmNeighbour;
  next?: FilmNeighbour;
};
export async function renderFilmShot(
  bytes: Buffer,
  shot: FilmShot,
  options: ShotRenderOptions = {},
): Promise<Buffer> {
  if (options.version === 1) return renderLegacyFilmShot(bytes, shot);
  const directory = await mkdtemp(join(tmpdir(), "mbp-cinematic-shot-"));
  try {
    const inputs = [
      { bytes, shot },
      ...(options.previous ? [options.previous] : []),
      ...(options.next ? [options.next] : []),
    ];
    const args: string[] = ["-filter_complex_threads", "2"];
    for (let i = 0; i < inputs.length; i++) {
      const path = join(directory, `photo-${i}.png`);
      await sharp(inputs[i].bytes, {
        limitInputPixels: 40000000,
        animated: false,
      })
        .rotate()
        .resize(1920, 1080, { fit: "contain", background: "#111916" })
        .png()
        .toFile(path);
      args.push(
        "-protocol_whitelist",
        "file,pipe",
        "-threads",
        "1",
        "-loop",
        "1",
        "-framerate",
        String(FILM_FPS),
        "-i",
        path,
      );
    }
    const filters = [
      `[0:v]${motionFilter(shot)},trim=end_frame=102,setpts=PTS-STARTPTS[main]`,
    ];
    let output = "main",
      input = 1;
    if (options.previous) {
      filters.push(
        `[${input++}:v]${motionFilter(options.previous.shot, 105)},trim=end_frame=3,setpts=PTS-STARTPTS,tpad=stop=99:stop_mode=clone[previous]`,
      );
      filters.push(
        `[${output}][previous]blend=all_expr='if(lt(N,4),A*(N+2.5)/6+B*(3.5-N)/6,A)':shortest=1[incoming]`,
      );
      output = "incoming";
    }
    if (options.next) {
      filters.push(
        `[${input}:v]${motionFilter(options.next.shot, 0)},trim=end_frame=3,setpts=PTS-STARTPTS,tpad=start=99:start_mode=clone[next]`,
      );
      filters.push(
        `[${output}][next]blend=all_expr='if(gt(N,99),A*(1-(N-99.5)/6)+B*(N-99.5)/6,A)':shortest=1[outgoing]`,
      );
      output = "outgoing";
    }
    filters.push(`[${output}]format=yuv420p[video]`);
    const path = join(directory, "shot.mp4");
    await executeFilmCommand([
      ...args,
      "-filter_complex",
      filters.join(";"),
      "-map",
      "[video]",
      "-frames:v",
      String(SHOT_FRAMES),
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "18",
      "-maxrate",
      "4M",
      "-bufsize",
      "8M",
      "-threads",
      "2",
      "-r",
      String(FILM_FPS),
      "-video_track_timescale",
      "15360",
      "-movflags",
      "+faststart",
      path,
    ]);
    return await readFile(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** Original synthetic instrumental composition; no samples or third-party song.
 * Four beats per 3.4-second shot = 70.588235 BPM. Beat one coincides with each cut.
 * Written specifically for this application; see docs/PROPERTY-FILMS.md.
 */
export function legacyFilmScore(shots: number): Buffer {
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

export async function assembleFilm(
  segments: Buffer[],
  version: 1 | 2 = 2,
  durations?: number[],
  style?: FilmPlan["style"],
): Promise<Buffer> {
  if (!segments.length || segments.length > MAX_FILM_SHOTS)
    throw new Error("Invalid film length.");
  const seconds = durations || segments.map(() => SHOT_SECONDS);
  const totalSeconds = Number(
    seconds.reduce((sum, value) => sum + value, 0).toFixed(1),
  );
  if (
    seconds.length !== segments.length ||
    seconds.some(
      (value) => !Number.isFinite(value) || value < 2 || value > 5,
    ) ||
    totalSeconds > 80
  )
    throw new Error("Invalid film timeline.");
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
    await writeFile(
      music,
      version === 1
        ? legacyFilmScore(segments.length)
        : originalFilmScore(segments.length, durations, style),
    );
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
      String(totalSeconds),
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

/** Preserve provider motion and add six edit-handle frames around the chosen duration.
 * Monotone time mapping accelerates edges and gives the middle more screen time.
 * Provider audio is deliberately removed: the final film uses the chosen score.
 */
export async function normalizeGeneratedClip(
  bytes: Buffer,
  sourceSeconds: number,
  targetSeconds: number = SHOT_SECONDS,
  style?: FilmPlan["style"],
): Promise<Buffer> {
  if (
    !Number.isFinite(sourceSeconds) ||
    sourceSeconds < 2 ||
    sourceSeconds > 15 ||
    !Number.isFinite(targetSeconds) ||
    targetSeconds < 2 ||
    targetSeconds > 5
  )
    throw new Error(
      "Configure a generated clip duration between 2 and 15 seconds.",
    );
  const frames = Math.round(targetSeconds * FILM_FPS) + 6;
  const normalizedSeconds = frames / FILM_FPS;
  const directory = await mkdtemp(join(tmpdir(), "mbp-generated-scene-"));
  try {
    const input = join(directory, "provider.mp4"),
      output = join(directory, "normalized.mp4");
    await writeFile(input, bytes);
    const t = `(T/${sourceSeconds})`;
    await executeFilmCommand([
      "-protocol_whitelist",
      "file,pipe",
      "-threads",
      "2",
      "-i",
      input,
      "-vf",
      `trim=duration=${sourceSeconds},setpts=PTS-STARTPTS,setpts='${normalizedSeconds}*(${t}-${style === "cinematic-walkthrough-v3" ? "0.72" : "0.65"}*sin(2*PI*${t})/(2*PI))/TB',fps=30,scale=1280:720:force_original_aspect_ratio=decrease:flags=lanczos,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x111916,setsar=1,format=yuv420p`,
      "-frames:v",
      String(frames),
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "18",
      "-maxrate",
      "4M",
      "-bufsize",
      "8M",
      "-threads",
      "2",
      "-video_track_timescale",
      "15360",
      "-movflags",
      "+faststart",
      output,
    ]);
    // A truncated provider clip must not be silently padded into a static shot.
    await verifyFilmFrames(output, frames);
    return await readFile(output);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
async function verifyFilmFrames(path: string, expected: number) {
  const count = await new Promise<number>((resolve, reject) => {
    const child = spawn(
      /* turbopackIgnore: true */ filmBinary(),
      [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-protocol_whitelist",
        "file,pipe",
        "-threads",
        "2",
        "-i",
        path,
        "-map",
        "0:v:0",
        "-an",
        "-progress",
        "pipe:1",
        "-f",
        "null",
        "-",
      ],
      { stdio: ["ignore", "pipe", "ignore"], shell: false },
    );
    let output = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 15000);
    child.stdout.on("data", (chunk) => {
      output = (output + String(chunk)).slice(-16000);
    });
    child.once("error", () => {
      clearTimeout(timer);
      reject(new Error("Film validation unavailable."));
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      const frames = [...output.matchAll(/^frame=(\d+)$/gm)];
      if (code !== 0 || !frames.length)
        reject(new Error("Film validation failed."));
      else resolve(Number(frames.at(-1)![1]));
    });
  });
  if (count !== expected)
    throw new Error(
      "The provider clip is shorter than the configured scene duration.",
    );
}
export async function editGeneratedClip(
  current: Buffer,
  previous?: Buffer,
  next?: Buffer,
  timing: {
    seconds?: number;
    previousSeconds?: number;
    style?: FilmPlan["style"];
    entry?: FilmShot["transition"];
    exit?: FilmShot["transition"];
    shotIndex?: number;
  } = {},
): Promise<Buffer> {
  const seconds = timing.seconds ?? SHOT_SECONDS;
  const previousSeconds = timing.previousSeconds ?? SHOT_SECONDS;
  if (
    ![seconds, previousSeconds].every(
      (value) => Number.isFinite(value) && value >= 2 && value <= 5,
    )
  )
    throw new Error("Invalid scene timing.");
  const frames = Math.round(seconds * FILM_FPS);
  const previousFrames = Math.round(previousSeconds * FILM_FPS);
  const directory = await mkdtemp(join(tmpdir(), "mbp-film-edit-"));
  try {
    const inputs = [
      current,
      ...(previous ? [previous] : []),
      ...(next ? [next] : []),
    ];
    const args: string[] = ["-filter_complex_threads", "2"];
    for (let i = 0; i < inputs.length; i++) {
      const path = join(directory, `clip-${i}.mp4`);
      await writeFile(path, inputs[i]);
      args.push(
        "-protocol_whitelist",
        "file,pipe",
        "-threads",
        "1",
        "-i",
        path,
      );
    }
    const filters = [
      `[0:v]trim=start_frame=3:end_frame=${frames + 3},setpts=PTS-STARTPTS,format=yuv444p[main]`,
    ];
    let output = "main",
      index = 1;
    if (previous) {
      filters.push(
        `[${index++}:v]trim=start_frame=${previousFrames + 3}:end_frame=${previousFrames + 6},setpts=PTS-STARTPTS,format=yuv444p,tpad=stop=${frames - 3}:stop_mode=clone[previous]`,
      );
      filters.push(
        `[${output}][previous]blend=all_expr='if(lt(N,4),A*(N+2.5)/6+B*(3.5-N)/6,A)':shortest=1[incoming]`,
      );
      output = "incoming";
    }
    if (next) {
      filters.push(
        `[${index}:v]trim=end_frame=3,setpts=PTS-STARTPTS,format=yuv444p,tpad=start=${frames - 3}:start_mode=clone[next]`,
      );
      filters.push(
        `[${output}][next]blend=all_expr='if(gt(N,${frames - 3}),A*(1-(N-${frames - 2.5})/6)+B*(N-${frames - 2.5})/6,A)':shortest=1[outgoing]`,
      );
      output = "outgoing";
    }
    const speedIn =
      Boolean(previous) &&
      timing.style === "cinematic-walkthrough-v3" &&
      timing.entry === "speed";
    const speedOut =
      Boolean(next) &&
      timing.style === "cinematic-walkthrough-v3" &&
      timing.exit === "speed";
    if (speedIn || speedOut) {
      const shotIndex = timing.shotIndex ?? 0;
      if (
        !Number.isInteger(shotIndex) ||
        shotIndex < 0 ||
        shotIndex >= MAX_FILM_SHOTS
      )
        throw new Error("Invalid scene index.");
      const directionIn = (shotIndex - 1) % 2 === 0 ? 1 : -1;
      const directionOut = shotIndex % 2 === 0 ? 1 : -1;
      const incoming = speedIn ? "max(0,1-n/5)" : "0";
      const outgoing = speedOut ? `max(0,(n-${frames - 6})/5)` : "0";
      const weight = `${speedIn ? "max(0,(6-N)/5)" : "0"}+${speedOut ? `max(0,(N-${frames - 5})/5)` : "0"}`;
      const edges = `${speedIn ? "lt(n,6)" : "0"}+${speedOut ? `gte(n,${frames - 6})` : "0"}`;
      // Five-percent overscan keeps every edge covered during a short whip.
      // The middle stays sharp; blur is confined to six frames on each chosen cut.
      filters.push(
        `[${output}]scale=1344:756:flags=bicubic,crop=1280:720:x='32+32*(-${directionIn}*${incoming}+${directionOut}*${outgoing})':y=18,split[clean][smear]`,
      );
      filters.push(
        `[smear]gblur=sigma=8:sigmaV=0.5:steps=2:enable='${edges}'[blurred]`,
      );
      filters.push(
        `[clean][blurred]blend=all_expr='A*(1-0.55*(${weight}))+B*0.55*(${weight})':shortest=1:enable='${edges}'[speed]`,
      );
      output = "speed";
    }
    filters.push(`[${output}]format=yuv420p[video]`);
    const path = join(directory, "edited.mp4");
    await executeFilmCommand([
      ...args,
      "-filter_complex",
      filters.join(";"),
      "-map",
      "[video]",
      "-frames:v",
      String(frames),
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "18",
      "-maxrate",
      "4M",
      "-bufsize",
      "8M",
      "-threads",
      "2",
      "-video_track_timescale",
      "15360",
      "-movflags",
      "+faststart",
      path,
    ]);
    await verifyFilmFrames(path, frames);
    return await readFile(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
