import { test, expect } from "bun:test";

import { assertProperty, fc } from "../testing/property";
import { AUDIO_REACTIVITY_SAMPLE_RATE_HZ, analyzeAudioReactivity } from "./audio-reactivity";

test("audio reactivity is bounded, deterministic and invariant to PCM polarity", () => {
  assertProperty(fc.property(
    fc.array(fc.float({ min: -16, max: 16, noNaN: true, noDefaultInfinity: true }), { minLength: 1, maxLength: 1_201 }),
    (samples: readonly number[]) => {
      const input = { sampleRateHz: AUDIO_REACTIVITY_SAMPLE_RATE_HZ, samples };
      const result = analyzeAudioReactivity(input);
      expect(result).toEqual(analyzeAudioReactivity(input));
      expect(result).toEqual(analyzeAudioReactivity({ ...input, samples: samples.map(sample => -sample) }));
      expect(result.durationUs).toBe(Math.round(samples.length * 1_000_000 / AUDIO_REACTIVITY_SAMPLE_RATE_HZ));
      for (const values of Object.values(result.bands) as readonly (readonly number[])[]) {
        expect(values.length).toBe(Math.ceil(samples.length / 400) + 1);
        expect(values.at(-1)).toBe(0);
        expect(values.every((value: number) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
      }
    },
  ), { numRuns: 80 });
});
