import { fftPowerSpectrum } from "./music-analysis";

export const AUDIO_REACTIVITY_PROFILE = "bands-v1" as const;
export const AUDIO_REACTIVITY_SAMPLE_RATE_HZ = 24_000;
export const AUDIO_REACTIVITY_RATE_HZ = 60;
export const AUDIO_REACTIVITY_MAX_DURATION_US = 600_000_000;

const WINDOW_SAMPLES = 2_048;
const HOP_SAMPLES = AUDIO_REACTIVITY_SAMPLE_RATE_HZ / AUDIO_REACTIVITY_RATE_HZ;
const MAXIMUM_SAMPLES = AUDIO_REACTIVITY_MAX_DURATION_US * AUDIO_REACTIVITY_SAMPLE_RATE_HZ / 1_000_000;
const MAXIMUM_PCM_AMPLITUDE = 16;
// Suppress quiet input below -80 dBFS RMS, and band leakage below 2% of the
// simultaneous broadband RMS. Subtracting the floor avoids a hard onset step.
const ABSOLUTE_RMS_FLOOR = 0.0001;
const LEAKAGE_RMS_RATIO = 0.02;
const FLAT_RANGE_RATIO = 0.001;
const EPSILON = 1e-12;
const ATTACK_SECONDS = 0.03;
const RELEASE_SECONDS = 0.18;
// The FFT already applies a symmetric Hann window and divides power by N².
// Correct its mean squared gain when recovering one-sided RMS energy.
const HANN_POWER_GAIN = 3 * (WINDOW_SAMPLES - 1) / (8 * WINDOW_SAMPLES);

export interface AudioReactivityBands {
  readonly bass: readonly number[];
  readonly mid: readonly number[];
  readonly treble: readonly number[];
  readonly energy: readonly number[];
}

type MutableBands = { [Band in keyof AudioReactivityBands]: number[] };
const BAND_NAMES = ["bass", "mid", "treble", "energy"] as const;

function percentile(ordered: readonly number[], fraction: number): number {
  const position = (ordered.length - 1) * fraction;
  const left = Math.floor(position);
  const a = ordered[left]!;
  return a + ((ordered[Math.min(left + 1, ordered.length - 1)] ?? a) - a) * (position - left);
}

function normalizeAndSmooth(values: readonly number[], energy: readonly number[], band: boolean): readonly number[] {
  const gated = values.map((value, index) => Math.max(0, value - Math.max(
    ABSOLUTE_RMS_FLOOR,
    band ? energy[index]! * LEAKAGE_RMS_RATIO : 0,
  )));
  const ordered = [...gated].sort((left, right) => left - right);
  let low = percentile(ordered, 0.05);
  let high = percentile(ordered, 0.95);
  // Events occupying less than 5% of the track still have a useful range.
  if (high <= EPSILON) high = ordered.at(-1)!;
  // A sustained tone has energy even when its useful percentile span is flat.
  if (high - low <= Math.max(EPSILON, high * FLAT_RANGE_RATIO)) low = 0;
  const span = high - low;
  const attack = 1 - Math.exp(-1 / (AUDIO_REACTIVITY_RATE_HZ * ATTACK_SECONDS));
  const release = 1 - Math.exp(-1 / (AUDIO_REACTIVITY_RATE_HZ * RELEASE_SECONDS));
  let previous = 0;
  const result = gated.map(value => {
    const target = span <= EPSILON ? 0 : Math.min(1, Math.max(0, (value - low) / span));
    previous += (target - previous) * (target > previous ? attack : release);
    return Math.min(1, Math.max(0, previous));
  });
  // This endpoint is at the exact PCM duration, not the next regular grid tick.
  result.push(0);
  return Object.freeze(result);
}

/**
 * Analyze already-decoded mono PCM on a fixed absolute timeline. Each band has
 * ceil(sampleCount / 400) samples at i / 60 seconds, then a zero endpoint at
 * durationUs. Windows are centered with zero padding; their 42.7 ms lookahead
 * and offline normalization are intentional. This detects energy, not beats.
 */
export function analyzeAudioReactivity(pcm: {
  readonly sampleRateHz: number;
  readonly samples: readonly number[] | Float32Array;
}): { readonly durationUs: number; readonly bands: AudioReactivityBands } {
  if (pcm.sampleRateHz !== AUDIO_REACTIVITY_SAMPLE_RATE_HZ) {
    throw new TypeError(`Audio reactivity PCM must use exactly ${AUDIO_REACTIVITY_SAMPLE_RATE_HZ} Hz.`);
  }
  if ((!Array.isArray(pcm.samples) && !(pcm.samples instanceof Float32Array))
    || pcm.samples.length === 0 || pcm.samples.length > MAXIMUM_SAMPLES) {
    throw new TypeError(`Audio reactivity PCM must contain 1–${MAXIMUM_SAMPLES} samples.`);
  }
  let nonzero = false;
  for (let index = 0; index < pcm.samples.length; index++) {
    const sample = pcm.samples[index]!;
    if (!Number.isFinite(sample) || Math.abs(sample) > MAXIMUM_PCM_AMPLITUDE) {
      throw new TypeError(`Audio reactivity PCM samples must be finite numbers within ±${MAXIMUM_PCM_AMPLITUDE}.`);
    }
    nonzero ||= sample !== 0;
  }
  const durationUs = Math.round(pcm.samples.length * 1_000_000 / AUDIO_REACTIVITY_SAMPLE_RATE_HZ);
  const count = Math.ceil(pcm.samples.length / HOP_SAMPLES);
  if (!nonzero) {
    const silence = Object.freeze(Array<number>(count + 1).fill(0));
    return Object.freeze({ durationUs, bands: Object.freeze({ bass: silence, mid: silence, treble: silence, energy: silence }) });
  }
  const raw: MutableBands = { bass: [], mid: [], treble: [], energy: [] };
  const window = Array<number>(WINDOW_SAMPLES).fill(0);
  for (let frame = 0; frame < count; frame++) {
    const start = frame * HOP_SAMPLES - WINDOW_SAMPLES / 2;
    for (let index = 0; index < WINDOW_SAMPLES; index++) {
      const source = start + index;
      window[index] = source < 0 || source >= pcm.samples.length ? 0 : pcm.samples[source]!;
    }
    const spectrum = fftPowerSpectrum(window);
    const power = { bass: 0, mid: 0, treble: 0, energy: 0 };
    for (let bin = 0; bin < spectrum.length; bin++) {
      const frequencyHz = bin * AUDIO_REACTIVITY_SAMPLE_RATE_HZ / WINDOW_SAMPLES;
      const value = spectrum[bin]! * (bin === 0 || bin === spectrum.length - 1 ? 1 : 2) / HANN_POWER_GAIN;
      power.energy += value;
      if (frequencyHz >= 35 && frequencyHz < 180) power.bass += value;
      else if (frequencyHz >= 180 && frequencyHz < 2_000) power.mid += value;
      else if (frequencyHz >= 2_000 && frequencyHz <= 12_000) power.treble += value;
    }
    for (const name of BAND_NAMES) raw[name].push(Math.sqrt(power[name]));
  }
  const bands = Object.freeze({
    bass: normalizeAndSmooth(raw.bass, raw.energy, true),
    mid: normalizeAndSmooth(raw.mid, raw.energy, true),
    treble: normalizeAndSmooth(raw.treble, raw.energy, true),
    energy: normalizeAndSmooth(raw.energy, raw.energy, false),
  });
  return Object.freeze({ durationUs, bands });
}
