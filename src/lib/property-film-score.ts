import {
  MAX_FILM_SHOTS,
  SHOT_SECONDS,
  type FilmPlan,
} from "./property-film-plan";

/** Original modern instrumental arrangement, synthesized without third-party
 * recordings/samples. Legacy score: 141.176 BPM; cinematic v3: 120 BPM. Stereo keys, bass,
 * four-on-the-floor drums and syncopated accents. No voice or reference audio.
 * This is a proposed house soundtrack, not a claim of a licensed studio track.
 */
export function originalFilmScore(
  shots: number,
  durations?: number[],
  style?: FilmPlan["style"],
): Buffer {
  const cinematic = style === "cinematic-walkthrough-v3";
  if (!Number.isInteger(shots) || shots < 1 || shots > MAX_FILM_SHOTS)
    throw new Error("Invalid score duration.");
  if (
    durations &&
    (durations.length !== shots ||
      durations.some(
        (value) => !Number.isFinite(value) || value < 2 || value > 5,
      ))
  )
    throw new Error("Invalid score timeline.");
  const rate = 48000,
    duration = durations
      ? durations.reduce((sum, value) => sum + value, 0)
      : shots * SHOT_SECONDS,
    count = Math.round(duration * rate);
  if (duration > 80) throw new Error("Invalid score duration.");
  const left = new Float32Array(count),
    right = new Float32Array(count);
  // 120 BPM puts every integer-length 2–5s shot boundary on a beat.
  const barSeconds = cinematic ? 4 : SHOT_SECONDS;
  const beat = barSeconds / 8,
    tau = 2 * Math.PI;
  const chords = [
    [57, 60, 64, 67],
    [53, 57, 60, 64],
    [55, 60, 64, 71],
    [55, 59, 62, 67],
  ];
  const roots = [33, 29, 36, 31];
  let seed = 419;
  const noise = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 2147483648 - 1;
  };
  function voice(
    start: number,
    length: number,
    amplitude: number,
    pan: number,
    sample: (t: number) => number,
  ) {
    const begin = Math.round(start * rate),
      end = Math.min(count, begin + Math.ceil(length * rate));
    const l = Math.sqrt((1 - pan) / 2),
      r = Math.sqrt((1 + pan) / 2);
    for (let i = Math.max(0, begin); i < end; i++) {
      const t = (i - begin) / rate;
      const envelope = Math.min(1, t / 0.005, (length - t) / 0.035);
      const value = sample(t) * amplitude * Math.max(0, envelope);
      left[i] += value * l;
      right[i] += value * r;
    }
  }
  const frequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
  for (let bar = 0; bar < Math.ceil(duration / barSeconds); bar++) {
    const chord = chords[bar % 4],
      root = roots[bar % 4],
      start = bar * barSeconds;
    // Warm struck keys with restrained FM overtones and an answering motif.
    for (let hit = 0; hit < 4; hit++)
      for (let n = 0; n < chord.length; n++) {
        const f = frequency(chord[n]);
        voice(
          start + hit * beat * 2 + n * 0.008,
          1.35,
          cinematic ? 0.045 : 0.055,
          (n - 1.5) * 0.32,
          (t) =>
            Math.sin(
              tau * f * t +
                (cinematic ? 0.55 : 1.1) *
                  Math.exp(-5 * t) *
                  Math.sin(tau * f * 2 * t),
            ) * Math.exp(-2.5 * t),
        );
      }
    for (let step = 0; step < 8; step++) {
      const f = frequency(chord[[0, 2, 1, 3, 2, 1, 3, 2][step]] + 12);
      voice(
        start + (step + 0.5) * beat,
        0.6,
        (step % 2 ? 0.019 : 0.026) * (cinematic ? 0.75 : 1),
        step % 2 ? 0.45 : -0.45,
        (t) =>
          (Math.sin(tau * f * t) + 0.18 * Math.sin(tau * f * 3 * t)) *
          Math.exp(-7 * t),
      );
    }
    for (let b = 0; b < 8; b++) {
      const at = start + b * beat;
      voice(
        at,
        0.32,
        cinematic ? 0.33 : 0.43,
        0,
        (t) =>
          Math.sin(tau * (48 * t + 2.7 * (1 - Math.exp(-32 * t)))) *
          Math.exp(-12 * t),
      );
      const bass = frequency(root + (b === 6 ? 12 : 0));
      voice(
        at + beat * 0.34,
        beat * 0.62,
        cinematic ? 0.15 : 0.19,
        0,
        (t) =>
          (Math.sin(tau * bass * t) +
            0.22 * Math.sin(tau * bass * 2 * t) +
            0.08 * Math.sin(tau * bass * 3 * t)) *
          Math.exp(-3 * t),
      );
      if (b % 2 === 1) {
        let previous = 0;
        voice(at, 0.19, cinematic ? 0.075 : 0.105, 0.04, (t) => {
          const white = noise(),
            high = white - previous;
          previous = white;
          const burst =
            Math.exp(-t * 26) +
            0.35 * Math.exp(-Math.pow((t - 0.018) / 0.006, 2));
          return (
            high * burst + 0.13 * Math.sin(tau * 185 * t) * Math.exp(-22 * t)
          );
        });
      }
      for (let half = 0; half < 2; half++) {
        let previous = 0;
        voice(
          at + (half * beat) / 2,
          half ? 0.13 : 0.07,
          (half ? 0.023 : 0.015) * (cinematic ? 0.7 : 1),
          half ? 0.38 : -0.3,
          (t) => {
            const white = noise(),
              high = white - previous;
            previous = white;
            return high * Math.exp(-t * (half ? 35 : 65));
          },
        );
      }
    }
    // Very soft sustained texture and sidechain breathing under the beat.
    for (let n = 0; n < 3; n++) {
      const f = frequency(chord[n] + 12);
      voice(start, barSeconds, 0.018, (n - 1) * 0.6, (t) => {
        const fade = Math.min(1, t / 0.4, (barSeconds - t) / 0.45);
        const duck = 0.35 + 0.65 * Math.min(1, (t % beat) / 0.16);
        return (
          (Math.sin(tau * f * t) + 0.28 * Math.sin(tau * f * 1.003 * t)) *
          fade *
          duck
        );
      });
    }
  }
  // Keep the same continuous melody and tempo. Subtle percussion accents
  // follow variable scene boundaries without restarting the score at each cut.
  if (durations) {
    let cut = 0;
    for (const length of durations.slice(0, -1)) {
      cut += length;
      if (cinematic) {
        let smooth = 0;
        // A restrained original air sweep anticipates the cut, with no voice
        // or third-party samples. The score never restarts between rooms.
        voice(cut - 0.18, 0.36, 0.035, 0.15, (t) => {
          smooth = 0.88 * smooth + 0.12 * noise();
          return smooth * Math.sin((Math.PI * t) / 0.36) ** 2;
        });
      }
      voice(
        cut,
        0.12,
        0.045,
        0,
        (t) =>
          Math.sin(tau * (70 * t + 1.5 * (1 - Math.exp(-30 * t)))) *
          Math.exp(-25 * t),
      );
    }
  }
  // Short stereo room reflections, no long smear across scene accents.
  const taps = [
    [0.037, 0.11],
    [0.073, 0.07],
    [beat * 0.75, 0.085],
  ];
  let peak = 0,
    energy = 0;
  for (let i = count - 1; i >= 0; i--) {
    let l = left[i],
      r = right[i];
    for (const [delay, gain] of taps) {
      const j = i - Math.round(delay * rate);
      if (j >= 0) {
        l += right[j] * gain;
        r += left[j] * gain;
      }
    }
    const t = i / rate,
      fade = Math.min(1, t / 0.045, (duration - t) / 0.6);
    left[i] = Math.tanh(l * 1.3) * fade;
    right[i] = Math.tanh(r * 1.3) * fade;
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
    energy += left[i] ** 2 + right[i] ** 2;
  }
  const gain = Math.min(
    0.87 / Math.max(peak, 0.001),
    0.14 / Math.max(Math.sqrt(energy / (count * 2)), 0.001),
  );
  const wav = Buffer.alloc(44 + count * 4);
  wav.write("RIFF");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 4, 28);
  wav.writeUInt16LE(4, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(count * 4, 40);
  for (let i = 0; i < count; i++) {
    wav.writeInt16LE(Math.round(left[i] * gain * 32767), 44 + i * 4);
    wav.writeInt16LE(Math.round(right[i] * gain * 32767), 46 + i * 4);
  }
  return wav;
}
