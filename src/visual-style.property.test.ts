import { expect, test } from "bun:test"
import fc from "fast-check"
import {
  getVisualStyleProfile, sampleVisualStyleExposure, VISUAL_STYLE_IDS,
  VisualStyleIdSchema, visualStyleFrameVariation,
} from "./visual-style.ts"

const styleId = fc.constantFrom(...VISUAL_STYLE_IDS)
const timeUs = fc.integer({ min: 0, max: 3_600_000_000 })

test("visual style exposure is seek-stable, never samples the future, and is idempotent at held boundaries", () => {
  fc.assert(fc.property(styleId, timeUs, timeUs, (id, time, unrelatedTime) => {
    const sample = sampleVisualStyleExposure(time, id)
    sampleVisualStyleExposure(unrelatedTime, id)
    expect(sampleVisualStyleExposure(time, id)).toEqual(sample)
    expect(sample.exposureTimeUs).toBeLessThanOrEqual(time)
    expect(sample.cameraTimeUs).toBeLessThanOrEqual(time)
    expect(sampleVisualStyleExposure(sample.exposureTimeUs, id).exposureTimeUs).toBe(sample.exposureTimeUs)
    expect(sampleVisualStyleExposure(sample.cameraTimeUs, id).cameraTimeUs).toBe(sample.cameraTimeUs)
    const { fps, exposureFrames } = getVisualStyleProfile(id).cadence
    expect(time - sample.exposureTimeUs).toBeLessThanOrEqual(Math.ceil(exposureFrames * 1_000_000 / fps))
  }), { numRuns: 1000 })
})

test("keyed frame variation has no call-order dependency and stays inside a finite unit interval", () => {
  fc.assert(fc.property(
    fc.integer({ min: 0, max: 0xffff_ffff }), fc.integer({ min: 0, max: 432_000 }),
    fc.stringMatching(/^[a-z][a-z0-9-]{0,30}$/u),
    (seed, frame, channel) => {
      const expected = visualStyleFrameVariation(seed, frame, channel)
      visualStyleFrameVariation(seed, 432_000 - frame, "unrelated")
      expect(visualStyleFrameVariation(seed, frame, channel)).toBe(expected)
      expect(Number.isFinite(expected)).toBe(true)
      expect(expected).toBeGreaterThanOrEqual(0)
      expect(expected).toBeLessThan(1)
    },
  ), { numRuns: 1000 })
})

test("foreign style IDs are admitted only by the closed catalog", () => {
  fc.assert(fc.property(fc.anything(), input => {
    const parsed = VisualStyleIdSchema.safeParse(input)
    if (parsed.success) {
      expect(getVisualStyleProfile(input).id).toBe(parsed.data)
    } else {
      expect(() => getVisualStyleProfile(input)).toThrow()
    }
  }), { numRuns: 500 })
})
