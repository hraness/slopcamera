import { describe, expect, test } from "bun:test";

import {
  AUDIO_REACTIVITY_MAX_DURATION_US,
  AUDIO_REACTIVITY_PROFILE,
  AUDIO_REACTIVITY_RATE_HZ,
  AUDIO_REACTIVITY_SAMPLE_RATE_HZ,
  analyzeAudioReactivity,
  type AudioReactivityBands,
} from "./audio-reactivity";

const RATE = AUDIO_REACTIVITY_SAMPLE_RATE_HZ;
const BAND_NAMES = ["bass", "mid", "treble", "energy"] as const;

function tone(frequency: number, seconds: number, amplitude = 0.5): Float32Array {
  return Float32Array.from({ length: Math.round(seconds * RATE) }, (_, index) =>
    amplitude * Math.sin(2 * Math.PI * frequency * index / RATE));
}

function sample(bands: AudioReactivityBands, name: keyof AudioReactivityBands, seconds: number): number {
  return bands[name][Math.round(seconds * AUDIO_REACTIVITY_RATE_HZ)]!;
}

function assertBounded(bands: AudioReactivityBands, length: number): void {
  for (const name of BAND_NAMES) {
    expect(bands[name]).toHaveLength(length);
    expect(bands[name].at(-1)).toBe(0);
    expect(bands[name].every(value => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
    expect(Object.isFrozen(bands[name])).toBe(true);
  }
}

describe("offline audio reactivity", () => {
  test("identifies separated bass, mid and treble bursts after normalization without amplifying leakage", () => {
    const seconds = 7;
    const samples = new Float32Array(seconds * RATE);
    const bursts = [
      { start: 0.5, end: 1.5, frequency: 93.75, band: "bass" },
      { start: 2.5, end: 3.5, frequency: 750, band: "mid" },
      { start: 4.5, end: 5.5, frequency: 6_000, band: "treble" },
    ] as const;
    for (const burst of bursts) {
      for (let index = burst.start * RATE; index < burst.end * RATE; index++) {
        const time = index / RATE;
        const ramp = Math.min(1, (time - burst.start) / 0.03, (burst.end - time) / 0.03);
        samples[index] = 0.5 * ramp * Math.sin(2 * Math.PI * burst.frequency * time);
      }
    }
    const result = analyzeAudioReactivity({ sampleRateHz: RATE, samples });
    expect(result.durationUs).toBe(7_000_000);
    assertBounded(result.bands, seconds * AUDIO_REACTIVITY_RATE_HZ + 1);
    for (const burst of bursts) {
      const center = (burst.start + burst.end) / 2;
      expect(sample(result.bands, burst.band, center)).toBeGreaterThan(0.98);
      expect(sample(result.bands, "energy", center)).toBeGreaterThan(0.98);
      for (const name of ["bass", "mid", "treble"] as const) {
        if (name !== burst.band) expect(sample(result.bands, name, center)).toBeLessThan(0.005);
      }
    }
  });

  test("retains sustained active tones when the percentile range is flat", () => {
    for (const [frequency, band] of [[93.75, "bass"], [750, "mid"], [10_500, "treble"]] as const) {
      const result = analyzeAudioReactivity({ sampleRateHz: RATE, samples: tone(frequency, 2) });
      expect(sample(result.bands, band, 1)).toBeGreaterThan(0.98);
      expect(sample(result.bands, "energy", 1)).toBeGreaterThan(0.98);
      for (const other of ["bass", "mid", "treble"] as const) {
        if (other !== band) expect(sample(result.bands, other, 1)).toBeLessThan(0.005);
      }
      assertBounded(result.bands, 121);
    }
  });

  test("keeps silence and tiny tones silent without normalization gain", () => {
    for (const samples of [new Float32Array(RATE), tone(93.75, 1, 1e-6), tone(6_000, 1, 1e-6)]) {
      const result = analyzeAudioReactivity({ sampleRateHz: RATE, samples });
      for (const name of BAND_NAMES) expect(result.bands[name].every(value => value === 0)).toBe(true);
    }
  });

  test("retains a sparse transient even when the 95th percentile is silent", () => {
    const samples = new Float32Array(4 * RATE);
    samples[2 * RATE] = 1;
    const result = analyzeAudioReactivity({ sampleRateHz: RATE, samples });
    expect(Math.max(...result.bands.energy)).toBeGreaterThan(0.2);
    expect(sample(result.bands, "energy", 1.8)).toBe(0);
    expect(sample(result.bands, "energy", 2.25)).toBeGreaterThan(0);
    expect(sample(result.bands, "energy", 3.5)).toBeLessThan(0.001);
  });

  test("bounds the normalized attack and release on the regular grid", () => {
    const samples = new Float32Array(3 * RATE);
    samples.set(tone(750, 1), RATE);
    const { bands } = analyzeAudioReactivity({ sampleRateHz: RATE, samples });
    const attack = 1 - Math.exp(-1 / (AUDIO_REACTIVITY_RATE_HZ * 0.03));
    const release = 1 - Math.exp(-1 / (AUDIO_REACTIVITY_RATE_HZ * 0.18));
    for (const name of BAND_NAMES) {
      let previous = 0;
      for (const value of bands[name].slice(0, -1)) {
        expect(value - previous).toBeLessThanOrEqual(attack + 1e-12);
        expect(previous - value).toBeLessThanOrEqual(release + 1e-12);
        previous = value;
      }
    }
  });

  test("retains partial windows and exact-duration zero endpoints at every hop boundary", () => {
    for (const length of [1, 399, 400, 401, 799, 800, 801, 2_047, 2_048, 2_049]) {
      const samples = Float32Array.from({ length }, (_, index) => index % 2 === 0 ? 16 : -16);
      const result = analyzeAudioReactivity({ sampleRateHz: RATE, samples });
      expect(result.durationUs).toBe(Math.round(length * 1_000_000 / RATE));
      assertBounded(result.bands, Math.ceil(length / 400) + 1);
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.bands)).toBe(true);
    }
  });

  test("accepts the complete ten-minute bound and rejects one additional sample before analysis", () => {
    const maximum = AUDIO_REACTIVITY_MAX_DURATION_US * RATE / 1_000_000;
    const result = analyzeAudioReactivity({ sampleRateHz: RATE, samples: new Float32Array(maximum) });
    expect(result.durationUs).toBe(AUDIO_REACTIVITY_MAX_DURATION_US);
    assertBounded(result.bands, 36_001);
    expect(() => analyzeAudioReactivity({ sampleRateHz: RATE, samples: Array<number>(maximum + 1) })).toThrow(/samples/u);
  });

  test("rejects empty, foreign, sparse, non-finite or out-of-range PCM", () => {
    for (const sampleRateHz of [0, 8_000, 23_999, 24_000.1, 48_000, Number.NaN, Infinity]) {
      expect(() => analyzeAudioReactivity({ sampleRateHz, samples: [0] })).toThrow(/Hz/u);
    }
    for (const samples of [
      [], Array<number>(1), [Number.NaN], [Infinity], [-Infinity], [16.0001], [-16.0001],
      ["0"], new Float64Array([0]), {}, null,
    ]) {
      expect(() => analyzeAudioReactivity({ sampleRateHz: RATE, samples: samples as readonly number[] })).toThrow();
    }
  });

  test("the fixed profile accepts readonly arrays without mutating input", () => {
    const samples = Object.freeze(Array.from(tone(750, 0.1)));
    const snapshot = [...samples];
    const result = analyzeAudioReactivity({ sampleRateHz: RATE, samples });
    expect(AUDIO_REACTIVITY_PROFILE).toBe("bands-v1");
    expect(result).toEqual(analyzeAudioReactivity({ sampleRateHz: RATE, samples: Float32Array.from(samples) }));
    expect(samples).toEqual(snapshot);
  });
});
