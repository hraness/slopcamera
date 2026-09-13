import {
  MusicAnalysisV1Schema,
  type AnalysisSubject,
  type MusicAnalysisV1,
} from "../contracts/analysis";

const EPSILON = 1e-12;
const MICROSECONDS_PER_SECOND = 1_000_000;
const MINIMUM_ONSET_SEPARATION_US = 120_000;
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88] as const;
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17] as const;

type SourceRange = { readonly endUs: number; readonly startUs: number };
type MusicalKey = MusicAnalysisV1["keyRegions"][number]["key"];
type KeyRegion = MusicAnalysisV1["keyRegions"][number];
type MusicRegion = MusicAnalysisV1["musicRegions"][number];
type TempoRegion = MusicAnalysisV1["tempoRegions"][number];

export interface MonoPcm {
  readonly sampleRateHz: number;
  readonly samples: readonly number[];
}

export interface PcmFrameFeatures {
  readonly chroma: readonly number[];
  readonly endSample: number;
  readonly endUs: number;
  readonly onsetStrength: number;
  readonly peak: number;
  readonly rms: number;
  readonly startSample: number;
  readonly startUs: number;
  readonly tonality: number;
  readonly zeroCrossingRate: number;
}

export interface PcmFeatureConfig {
  readonly hopSize: number;
  readonly windowSize: number;
}

export interface KeyClassification {
  readonly alternate: { readonly confidence: number; readonly key: MusicalKey } | null;
  readonly confidence: number;
  readonly key: MusicalKey;
}

export interface TempoEstimate {
  readonly alternatives: readonly { readonly bpm: number; readonly confidence: number }[];
  readonly beatTimesUs: readonly number[];
  readonly bpm: number;
  readonly confidence: number;
  readonly meter: TempoRegion["meter"];
}

export interface AnalyzeMusicInput {
  readonly analysisId: string;
  readonly config: MusicAnalysisV1["config"];
  readonly createdAt: string;
  readonly inputDigest: string;
  readonly pcm: MonoPcm;
  readonly subject: AnalysisSubject;
  readonly tool: MusicAnalysisV1["tool"];
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? ((ordered[middle - 1] ?? 0) + (ordered[middle] ?? 0)) / 2
    : ordered[middle] ?? 0;
}

function sampleToUs(sample: number, sampleRateHz: number): number {
  return Math.round(sample * MICROSECONDS_PER_SECOND / sampleRateHz);
}

function validatePcm(pcm: MonoPcm): void {
  if (!Number.isSafeInteger(pcm.sampleRateHz) || pcm.sampleRateHz < 8_000 || pcm.sampleRateHz > 192_000) {
    throw new TypeError("PCM sampleRateHz must be a safe integer from 8,000 through 192,000.");
  }
  if (pcm.samples.some(sample => !Number.isFinite(sample))) {
    throw new TypeError("PCM samples must be finite numbers.");
  }
}

export function fftPowerSpectrum(samples: readonly number[]): Float64Array {
  let size = 1;
  while (size < samples.length) size *= 2;
  const real = new Float64Array(size);
  const imaginary = new Float64Array(size);
  for (let index = 0; index < samples.length; index += 1) {
    const window = samples.length === 1
      ? 1
      : 0.5 - 0.5 * Math.cos(2 * Math.PI * index / (samples.length - 1));
    real[index] = (samples[index] ?? 0) * window;
  }
  for (let index = 1, reversed = 0; index < size; index += 1) {
    let bit = size >> 1;
    while ((reversed & bit) !== 0) {
      reversed ^= bit;
      bit >>= 1;
    }
    reversed ^= bit;
    if (index < reversed) {
      const temporary = real[index]!;
      real[index] = real[reversed]!;
      real[reversed] = temporary;
    }
  }
  for (let length = 2; length <= size; length *= 2) {
    const angle = -2 * Math.PI / length;
    const stepReal = Math.cos(angle);
    const stepImaginary = Math.sin(angle);
    for (let block = 0; block < size; block += length) {
      let twiddleReal = 1;
      let twiddleImaginary = 0;
      for (let offset = 0; offset < length / 2; offset += 1) {
        const even = block + offset;
        const odd = even + length / 2;
        const oddReal = real[odd]! * twiddleReal - imaginary[odd]! * twiddleImaginary;
        const oddImaginary = real[odd]! * twiddleImaginary + imaginary[odd]! * twiddleReal;
        const evenReal = real[even]!;
        const evenImaginary = imaginary[even]!;
        real[even] = evenReal + oddReal;
        imaginary[even] = evenImaginary + oddImaginary;
        real[odd] = evenReal - oddReal;
        imaginary[odd] = evenImaginary - oddImaginary;
        const nextReal = twiddleReal * stepReal - twiddleImaginary * stepImaginary;
        twiddleImaginary = twiddleReal * stepImaginary + twiddleImaginary * stepReal;
        twiddleReal = nextReal;
      }
    }
  }
  const power = new Float64Array(size / 2 + 1);
  const normalization = Math.max(1, samples.length * samples.length);
  for (let index = 0; index < power.length; index += 1) {
    power[index] = (real[index]! ** 2 + imaginary[index]! ** 2) / normalization;
  }
  return power;
}

export const AUDIO_REACTIVITY_PROFILE = "bands-v1" as const;
export const AUDIO_REACTIVITY_SAMPLE_RATE_HZ = 24_000;
export const AUDIO_REACTIVITY_RATE_HZ = 60;
export const AUDIO_REACTIVITY_MAX_DURATION_US = 600_000_000;

const AUDIO_REACTIVITY_WINDOW_SAMPLES = 2_048;
const AUDIO_REACTIVITY_HOP_SAMPLES = AUDIO_REACTIVITY_SAMPLE_RATE_HZ / AUDIO_REACTIVITY_RATE_HZ;
const AUDIO_REACTIVITY_MAXIMUM_SAMPLES = AUDIO_REACTIVITY_MAX_DURATION_US * AUDIO_REACTIVITY_SAMPLE_RATE_HZ / 1_000_000;
const AUDIO_REACTIVITY_MAXIMUM_PCM_AMPLITUDE = 16;
// Suppress quiet input below -80 dBFS RMS, and band leakage below 2% of the
// simultaneous broadband RMS. Subtracting the floor avoids a hard onset step.
const AUDIO_REACTIVITY_ABSOLUTE_RMS_FLOOR = 0.0001;
const AUDIO_REACTIVITY_LEAKAGE_RMS_RATIO = 0.02;
const AUDIO_REACTIVITY_FLAT_RANGE_RATIO = 0.001;
const AUDIO_REACTIVITY_ATTACK_SECONDS = 0.03;
const AUDIO_REACTIVITY_RELEASE_SECONDS = 0.18;
// The FFT already applies a symmetric Hann window and divides power by N².
// Correct its mean squared gain when recovering one-sided RMS energy.
const AUDIO_REACTIVITY_HANN_POWER_GAIN = 3 * (AUDIO_REACTIVITY_WINDOW_SAMPLES - 1) / (8 * AUDIO_REACTIVITY_WINDOW_SAMPLES);

export interface AudioReactivityBands {
  readonly bass: readonly number[];
  readonly mid: readonly number[];
  readonly treble: readonly number[];
  readonly energy: readonly number[];
}

type MutableAudioReactivityBands = { [Band in keyof AudioReactivityBands]: number[] };
const AUDIO_REACTIVITY_BAND_NAMES = ["bass", "mid", "treble", "energy"] as const;

function audioReactivityPercentile(ordered: readonly number[], fraction: number): number {
  const position = (ordered.length - 1) * fraction;
  const left = Math.floor(position);
  const a = ordered[left]!;
  return a + ((ordered[Math.min(left + 1, ordered.length - 1)] ?? a) - a) * (position - left);
}

function normalizeAndSmoothAudioReactivity(values: readonly number[], energy: readonly number[], band: boolean): readonly number[] {
  const gated = values.map((value, index) => Math.max(0, value - Math.max(
    AUDIO_REACTIVITY_ABSOLUTE_RMS_FLOOR,
    band ? energy[index]! * AUDIO_REACTIVITY_LEAKAGE_RMS_RATIO : 0,
  )));
  const ordered = [...gated].sort((left, right) => left - right);
  let low = audioReactivityPercentile(ordered, 0.05);
  let high = audioReactivityPercentile(ordered, 0.95);
  // Events occupying less than 5% of the track still have a useful range.
  if (high <= EPSILON) high = ordered.at(-1)!;
  // A sustained tone has energy even when its useful percentile span is flat.
  if (high - low <= Math.max(EPSILON, high * AUDIO_REACTIVITY_FLAT_RANGE_RATIO)) low = 0;
  const span = high - low;
  const attack = 1 - Math.exp(-1 / (AUDIO_REACTIVITY_RATE_HZ * AUDIO_REACTIVITY_ATTACK_SECONDS));
  const release = 1 - Math.exp(-1 / (AUDIO_REACTIVITY_RATE_HZ * AUDIO_REACTIVITY_RELEASE_SECONDS));
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
    || pcm.samples.length === 0 || pcm.samples.length > AUDIO_REACTIVITY_MAXIMUM_SAMPLES) {
    throw new TypeError(`Audio reactivity PCM must contain 1–${AUDIO_REACTIVITY_MAXIMUM_SAMPLES} samples.`);
  }
  let nonzero = false;
  for (let index = 0; index < pcm.samples.length; index++) {
    const sample = pcm.samples[index]!;
    if (!Number.isFinite(sample) || Math.abs(sample) > AUDIO_REACTIVITY_MAXIMUM_PCM_AMPLITUDE) {
      throw new TypeError(`Audio reactivity PCM samples must be finite numbers within ±${AUDIO_REACTIVITY_MAXIMUM_PCM_AMPLITUDE}.`);
    }
    nonzero ||= sample !== 0;
  }
  const durationUs = Math.round(pcm.samples.length * 1_000_000 / AUDIO_REACTIVITY_SAMPLE_RATE_HZ);
  const count = Math.ceil(pcm.samples.length / AUDIO_REACTIVITY_HOP_SAMPLES);
  if (!nonzero) {
    const silence = Object.freeze(Array<number>(count + 1).fill(0));
    return Object.freeze({ durationUs, bands: Object.freeze({ bass: silence, mid: silence, treble: silence, energy: silence }) });
  }
  const raw: MutableAudioReactivityBands = { bass: [], mid: [], treble: [], energy: [] };
  const window = Array<number>(AUDIO_REACTIVITY_WINDOW_SAMPLES).fill(0);
  for (let frame = 0; frame < count; frame++) {
    const start = frame * AUDIO_REACTIVITY_HOP_SAMPLES - AUDIO_REACTIVITY_WINDOW_SAMPLES / 2;
    for (let index = 0; index < AUDIO_REACTIVITY_WINDOW_SAMPLES; index++) {
      const source = start + index;
      window[index] = source < 0 || source >= pcm.samples.length ? 0 : pcm.samples[source]!;
    }
    const spectrum = fftPowerSpectrum(window);
    const power = { bass: 0, mid: 0, treble: 0, energy: 0 };
    for (let bin = 0; bin < spectrum.length; bin++) {
      const frequencyHz = bin * AUDIO_REACTIVITY_SAMPLE_RATE_HZ / AUDIO_REACTIVITY_WINDOW_SAMPLES;
      const value = spectrum[bin]! * (bin === 0 || bin === spectrum.length - 1 ? 1 : 2) / AUDIO_REACTIVITY_HANN_POWER_GAIN;
      power.energy += value;
      if (frequencyHz >= 35 && frequencyHz < 180) power.bass += value;
      else if (frequencyHz >= 180 && frequencyHz < 2_000) power.mid += value;
      else if (frequencyHz >= 2_000 && frequencyHz <= 12_000) power.treble += value;
    }
    for (const name of AUDIO_REACTIVITY_BAND_NAMES) raw[name].push(Math.sqrt(power[name]));
  }
  const bands = Object.freeze({
    bass: normalizeAndSmoothAudioReactivity(raw.bass, raw.energy, true),
    mid: normalizeAndSmoothAudioReactivity(raw.mid, raw.energy, true),
    treble: normalizeAndSmoothAudioReactivity(raw.treble, raw.energy, true),
    energy: normalizeAndSmoothAudioReactivity(raw.energy, raw.energy, false),
  });
  return Object.freeze({ durationUs, bands });
}

/** Fold pitched energy from C2 through B6 into twelve pitch classes. */
export function computeChroma(frame: readonly number[], sampleRateHz: number): readonly number[] {
  if (!Number.isSafeInteger(sampleRateHz) || sampleRateHz < 8_000 || sampleRateHz > 192_000) {
    throw new TypeError("Chroma sampleRateHz must be a safe integer from 8,000 through 192,000.");
  }
  if (frame.some(sample => !Number.isFinite(sample))) throw new TypeError("Chroma samples must be finite.");
  if (frame.length === 0) return Array.from({ length: 12 }, () => 0);
  const spectrum = fftPowerSpectrum(frame);
  const fftSize = (spectrum.length - 1) * 2;
  const chroma = Array.from({ length: 12 }, () => 0);
  for (let bin = 1; bin < spectrum.length; bin += 1) {
    const frequencyHz = bin * sampleRateHz / fftSize;
    if (frequencyHz < 65.406 || frequencyHz > Math.min(sampleRateHz * 0.475, 1_975.53)) continue;
    const midi = Math.round(69 + 12 * Math.log2(frequencyHz / 440));
    if (midi < 36 || midi > 95) continue;
    const pitchClass = ((midi % 12) + 12) % 12;
    chroma[pitchClass] = (chroma[pitchClass] ?? 0) + spectrum[bin]!;
  }
  return chroma;
}

function chromaTonality(chroma: readonly number[]): number {
  const total = chroma.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= EPSILON) return 0;
  let entropy = 0;
  for (const value of chroma) {
    const probability = Math.max(0, value) / total;
    if (probability > EPSILON) entropy -= probability * Math.log(probability);
  }
  return clamp(1 - entropy / Math.log(12));
}

/** Extract deterministic features from already-decoded mono PCM. */
export function extractPcmFrameFeatures(
  pcm: MonoPcm,
  config: PcmFeatureConfig,
): readonly PcmFrameFeatures[] {
  validatePcm(pcm);
  if (!Number.isSafeInteger(config.windowSize) || config.windowSize <= 0) {
    throw new TypeError("Feature windowSize must be a positive safe integer.");
  }
  if (!Number.isSafeInteger(config.hopSize) || config.hopSize <= 0) {
    throw new TypeError("Feature hopSize must be a positive safe integer.");
  }

  const frames: PcmFrameFeatures[] = [];
  let priorRms = 0;
  let priorCrest = 0;
  let priorNormalizedChroma = Array.from({ length: 12 }, () => 0);
  for (let startSample = 0; startSample < pcm.samples.length; startSample += config.hopSize) {
    const endSample = Math.min(pcm.samples.length, startSample + config.windowSize);
    const frame = pcm.samples.slice(startSample, endSample);
    if (frame.length === 0) break;
    let squareSum = 0;
    let peak = 0;
    let crossings = 0;
    for (let index = 0; index < frame.length; index += 1) {
      const sample = frame[index] ?? 0;
      squareSum += sample * sample;
      peak = Math.max(peak, Math.abs(sample));
      if (index > 0 && ((frame[index - 1] ?? 0) >= 0) !== (sample >= 0)) crossings += 1;
    }
    const rms = Math.sqrt(squareSum / frame.length);
    const crest = rms <= EPSILON ? 0 : peak / rms;
    const chroma = computeChroma(frame, pcm.sampleRateHz);
    const chromaTotal = chroma.reduce((sum, value) => sum + value, 0);
    const normalizedChroma = chroma.map(value => chromaTotal <= EPSILON ? 0 : value / chromaTotal);
    const spectralIncrease = normalizedChroma.reduce(
      (sum, value, index) => sum + Math.max(0, value - (priorNormalizedChroma[index] ?? 0)),
      0,
    );
    const onsetStrength = Math.max(0, rms - priorRms)
      + rms * spectralIncrease
      + Math.max(0, crest - priorCrest) * rms * 0.25;
    frames.push({
      chroma,
      endSample,
      endUs: sampleToUs(endSample, pcm.sampleRateHz),
      onsetStrength,
      peak,
      rms,
      startSample,
      startUs: sampleToUs(startSample, pcm.sampleRateHz),
      tonality: chromaTonality(chroma),
      zeroCrossingRate: frame.length <= 1 ? 0 : crossings / (frame.length - 1),
    });
    priorNormalizedChroma = normalizedChroma;
    priorRms = rms;
    priorCrest = crest;
  }
  return frames;
}

interface ScoredRange extends SourceRange {
  readonly confidence: number;
}

/** Turn frame energy and tonal concentration into ordered music-presence regions. */
export function detectMusicPresenceRegions(
  frames: readonly PcmFrameFeatures[],
  minimumMusicUs: number,
  threshold = 0.45,
): readonly MusicRegion[] {
  if (!Number.isSafeInteger(minimumMusicUs) || minimumMusicUs < 0) {
    throw new TypeError("minimumMusicUs must be a nonnegative safe integer.");
  }
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new TypeError("Music presence threshold must be between zero and one.");
  }
  const active: ScoredRange[] = [];
  for (const frame of frames) {
    const energy = clamp((frame.rms - 0.0015) / 0.025);
    const confidence = energy * (0.4 + 0.6 * frame.tonality);
    if (confidence >= threshold) active.push({ confidence, endUs: frame.endUs, startUs: frame.startUs });
  }
  const merged: { confidenceSum: number; count: number; endUs: number; startUs: number }[] = [];
  for (const range of active) {
    const prior = merged.at(-1);
    if (prior !== undefined && range.startUs <= prior.endUs) {
      prior.endUs = Math.max(prior.endUs, range.endUs);
      prior.confidenceSum += range.confidence;
      prior.count += 1;
    } else {
      merged.push({ confidenceSum: range.confidence, count: 1, endUs: range.endUs, startUs: range.startUs });
    }
  }
  return merged
    .filter(region => region.endUs - region.startUs >= minimumMusicUs)
    .map(region => ({
      confidence: clamp(region.confidenceSum / region.count),
      range: { endUs: region.endUs, startUs: region.startUs },
    }));
}

function rangesOverlap(left: SourceRange, right: SourceRange): boolean {
  return left.startUs < right.endUs && right.startUs < left.endUs;
}

function onsetTimes(frames: readonly PcmFrameFeatures[], range: SourceRange): readonly number[] {
  const candidates = frames.filter(frame => {
    const centerUs = Math.round((frame.startUs + frame.endUs) / 2);
    return centerUs >= range.startUs && centerUs < range.endUs;
  });
  if (candidates.length < 3) return [];
  const strengths = candidates.map(frame => frame.onsetStrength);
  const center = median(strengths);
  const deviation = median(strengths.map(value => Math.abs(value - center)));
  const threshold = Math.max(1e-5, center + 2.5 * deviation);
  const peaks: { strength: number; timeUs: number }[] = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const frame = candidates[index]!;
    if (
      frame.onsetStrength < threshold
      || frame.onsetStrength < (candidates[index - 1]?.onsetStrength ?? -1)
      || frame.onsetStrength <= (candidates[index + 1]?.onsetStrength ?? -1)
    ) continue;
    const peak = { strength: frame.onsetStrength, timeUs: Math.round((frame.startUs + frame.endUs) / 2) };
    const prior = peaks.at(-1);
    if (prior !== undefined && peak.timeUs - prior.timeUs < MINIMUM_ONSET_SEPARATION_US) {
      if (peak.strength > prior.strength) peaks[peaks.length - 1] = peak;
    } else {
      peaks.push(peak);
    }
  }
  return peaks.map(peak => peak.timeUs);
}

/** Estimate tempo from a frame-onset sequence inside one source interval. */
export function estimateTempo(
  frames: readonly PcmFrameFeatures[],
  range: SourceRange,
): TempoEstimate | null {
  const beats = onsetTimes(frames, range);
  const intervals = beats.slice(1).map((timeUs, index) => timeUs - (beats[index] ?? timeUs))
    .filter(intervalUs => intervalUs >= 150_000 && intervalUs <= 3_000_000);
  if (intervals.length < 2) return null;
  const medianIntervalUs = median(intervals);
  let bpm = 60 * MICROSECONDS_PER_SECOND / medianIntervalUs;
  while (bpm > 220) bpm /= 2;
  while (bpm < 40) bpm *= 2;
  const deviation = median(intervals.map(interval => Math.abs(interval - medianIntervalUs)));
  const regularity = clamp(1 - deviation / Math.max(1, medianIntervalUs * 0.2));
  const confidence = clamp(regularity * Math.min(1, intervals.length / 4));
  const alternatives = [bpm / 2, bpm * 2]
    .filter(alternative => alternative >= 20 && alternative <= 400)
    .map((alternative, index) => ({ bpm: alternative, confidence: confidence * (index === 0 ? 0.55 : 0.45) }));
  return {
    alternatives,
    beatTimesUs: beats.filter(timeUs => timeUs >= range.startUs && timeUs < range.endUs),
    bpm,
    confidence,
    meter: "unknown",
  };
}

function profileCorrelation(chroma: readonly number[], profile: readonly number[], tonic: number): number {
  const leftMean = chroma.reduce((sum, value) => sum + value, 0) / 12;
  const rotated = Array.from({ length: 12 }, (_, pitchClass) => profile[(pitchClass - tonic + 12) % 12] ?? 0);
  const rightMean = rotated.reduce((sum, value) => sum + value, 0) / 12;
  let covariance = 0;
  let leftEnergy = 0;
  let rightEnergy = 0;
  for (let pitchClass = 0; pitchClass < 12; pitchClass += 1) {
    const left = (chroma[pitchClass] ?? 0) - leftMean;
    const right = (rotated[pitchClass] ?? 0) - rightMean;
    covariance += left * right;
    leftEnergy += left * left;
    rightEnergy += right * right;
  }
  const denominator = Math.sqrt(leftEnergy * rightEnergy);
  return denominator <= EPSILON ? -1 : clamp(covariance / denominator, -1, 1);
}

/** Classify an aggregate twelve-bin chromagram using major/minor key profiles. */
export function classifyChroma(chroma: readonly number[]): KeyClassification {
  if (chroma.length !== 12 || chroma.some(value => !Number.isFinite(value) || value < 0)) {
    throw new TypeError("A chromagram must contain twelve finite nonnegative bins.");
  }
  if (chroma.reduce((sum, value) => sum + value, 0) <= EPSILON) {
    return { alternate: null, confidence: 0, key: { kind: "unknown" } };
  }
  const candidates: { key: MusicalKey; score: number }[] = [];
  for (let tonic = 0; tonic < 12; tonic += 1) {
    candidates.push(
      { key: { kind: "key", mode: "major", pitchClass: tonic }, score: profileCorrelation(chroma, MAJOR_PROFILE, tonic) },
      { key: { kind: "key", mode: "minor", pitchClass: tonic }, score: profileCorrelation(chroma, MINOR_PROFILE, tonic) },
    );
  }
  candidates.sort((left, right) => right.score - left.score
    || (left.key.kind === "key" ? left.key.pitchClass : 0) - (right.key.kind === "key" ? right.key.pitchClass : 0)
    || String(left.key.kind === "key" ? left.key.mode : "").localeCompare(String(right.key.kind === "key" ? right.key.mode : "")));
  const best = candidates[0]!;
  const alternate = candidates[1]!;
  const absolute = clamp((best.score + 1) / 2);
  const separation = clamp((best.score - alternate.score) / 0.35);
  const confidence = clamp(0.65 * absolute + 0.35 * separation);
  return {
    alternate: { confidence: clamp((alternate.score + 1) / 2), key: alternate.key },
    confidence,
    key: best.score < 0.05 ? { kind: "unknown" } : best.key,
  };
}

function aggregateChroma(frames: readonly PcmFrameFeatures[], range: SourceRange): readonly number[] {
  const aggregate = Array.from({ length: 12 }, () => 0);
  for (const frame of frames) {
    if (!rangesOverlap(range, { endUs: frame.endUs, startUs: frame.startUs })) continue;
    for (let pitchClass = 0; pitchClass < 12; pitchClass += 1) {
      aggregate[pitchClass] = (aggregate[pitchClass] ?? 0) + (frame.chroma[pitchClass] ?? 0);
    }
  }
  return aggregate;
}

function sameKey(left: MusicalKey, right: MusicalKey): boolean {
  return left.kind === "unknown"
    ? right.kind === "unknown"
    : right.kind === "key" && left.mode === right.mode && left.pitchClass === right.pitchClass;
}

export function detectTempoRegions(
  features: readonly PcmFrameFeatures[],
  musicRegions: readonly MusicRegion[],
  durationUs: number,
  windowUs: number,
): readonly TempoRegion[] {
  if (!Number.isSafeInteger(windowUs) || windowUs <= 0) {
    throw new TypeError("Tempo windowUs must be a positive safe integer.");
  }
  const raw: TempoRegion[] = [];
  for (let startUs = 0; startUs < durationUs; startUs += windowUs) {
    const range = { endUs: Math.min(durationUs, startUs + windowUs), startUs };
    if (!musicRegions.some(region => rangesOverlap(range, region.range))) continue;
    const estimate = estimateTempo(features, range);
    if (estimate === null) continue;
    raw.push({ ...estimate, changeFromPrevious: null, range });
  }
  const merged: TempoRegion[] = [];
  for (const region of raw) {
    const prior = merged.at(-1);
    if (
      prior !== undefined
      && prior.range.endUs === region.range.startUs
      && Math.abs(prior.bpm - region.bpm) <= Math.max(3, prior.bpm * 0.04)
    ) {
      const priorDuration = prior.range.endUs - prior.range.startUs;
      const duration = region.range.endUs - region.range.startUs;
      const totalDuration = priorDuration + duration;
      merged[merged.length - 1] = {
        ...prior,
        beatTimesUs: [...new Set([...prior.beatTimesUs, ...region.beatTimesUs])].sort((left, right) => left - right),
        bpm: (prior.bpm * priorDuration + region.bpm * duration) / totalDuration,
        confidence: (prior.confidence * priorDuration + region.confidence * duration) / totalDuration,
        range: { endUs: region.range.endUs, startUs: prior.range.startUs },
      };
    } else {
      merged.push(region);
    }
  }
  return merged.map((region, index) => {
    const prior = merged[index - 1];
    return {
      ...region,
      changeFromPrevious: prior === undefined ? null : {
        confidence: clamp(Math.min(prior.confidence, region.confidence)
          * Math.abs(region.bpm - prior.bpm) / Math.max(4, prior.bpm * 0.08)),
        deltaBpm: region.bpm - prior.bpm,
      },
    };
  });
}

export function detectKeyRegions(
  features: readonly PcmFrameFeatures[],
  musicRegions: readonly MusicRegion[],
  windowUs: number,
): readonly KeyRegion[] {
  if (!Number.isSafeInteger(windowUs) || windowUs <= 0) {
    throw new TypeError("Key windowUs must be a positive safe integer.");
  }
  const raw: KeyRegion[] = [];
  for (const music of musicRegions) {
    for (let startUs = music.range.startUs; startUs < music.range.endUs; startUs += windowUs) {
      const range = { endUs: Math.min(music.range.endUs, startUs + windowUs), startUs };
      const classification = classifyChroma(aggregateChroma(features, range));
      raw.push({ ...classification, changeConfidence: null, range });
    }
  }
  const merged: KeyRegion[] = [];
  for (const region of raw) {
    const prior = merged.at(-1);
    if (prior !== undefined && prior.range.endUs === region.range.startUs && sameKey(prior.key, region.key)) {
      merged[merged.length - 1] = {
        ...prior,
        confidence: (prior.confidence + region.confidence) / 2,
        range: { endUs: region.range.endUs, startUs: prior.range.startUs },
      };
    } else {
      merged.push(region);
    }
  }
  return merged.map((region, index) => ({
    ...region,
    changeConfidence: index === 0 ? null : clamp(Math.min(region.confidence, merged[index - 1]?.confidence ?? 0)),
  }));
}

/** Analyze decoded PCM into the persisted, provenance-bearing music contract. */
export function analyzeMusic(input: AnalyzeMusicInput): MusicAnalysisV1 {
  validatePcm(input.pcm);
  if (input.pcm.sampleRateHz !== input.config.sampleRateHz) {
    throw new TypeError("PCM and analysis config sample rates must match.");
  }
  const features = extractPcmFrameFeatures(input.pcm, input.config);
  const durationUs = sampleToUs(input.pcm.samples.length, input.pcm.sampleRateHz);
  const musicRegions = detectMusicPresenceRegions(features, input.config.minimumMusicUs);
  return MusicAnalysisV1Schema.parse({
    analysisId: input.analysisId,
    config: input.config,
    createdAt: input.createdAt,
    durationUs,
    inputDigest: input.inputDigest,
    keyRegions: detectKeyRegions(features, musicRegions, input.config.tempoWindowUs),
    kind: "slopcamera.music-analysis",
    musicRegions,
    schemaVersion: 1,
    subject: input.subject,
    tempoRegions: detectTempoRegions(features, musicRegions, durationUs, input.config.tempoWindowUs),
    tool: input.tool,
  });
}
