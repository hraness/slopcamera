import { describe, expect, test } from "bun:test"
import {
  createVisualStyleDirection, getVisualStyleProfile, sampleVisualStyleExposure,
  VISUAL_STYLE_IDS, VISUAL_STYLE_PROFILES, VisualStyleProfileSchema,
  visualStyleFrameVariation,
} from "./visual-style.ts"

describe("visual style foundations", () => {
  test("covers every discoverable style with deeply immutable, bounded production direction", () => {
    expect(VISUAL_STYLE_IDS).toHaveLength(17)
    expect(VISUAL_STYLE_PROFILES.map(style => style.id)).toEqual([...VISUAL_STYLE_IDS])
    expect(new Set(VISUAL_STYLE_PROFILES.map(style => style.id)).size).toBe(17)
    expect(Object.isFrozen(VISUAL_STYLE_PROFILES)).toBe(true)
    for (const style of VISUAL_STYLE_PROFILES) {
      expect(getVisualStyleProfile(style.id)).toBe(style)
      expect(VisualStyleProfileSchema.parse(JSON.parse(JSON.stringify(style)))).toEqual(style)
      for (const value of [style, style.palette, style.cadence, style.delivery, style.finishing,
        style.shape, style.material, style.camera, style.avoid, style.acceptance]) {
        expect(Object.isFrozen(value)).toBe(true)
      }
      expect(Math.min(style.delivery.width, style.delivery.height)).toBeGreaterThanOrEqual(1080)
      expect(createVisualStyleDirection(style.id)).toContain(style.acceptance[0]!)
    }
  })

  test("separates photographic foundations, cel exposure, explanatory clarity, and pixel geometry", () => {
    const film = getVisualStyleProfile("documentary-16mm")
    expect(film.family).toBe("historical-film")
    expect(film.shape.join(" ")).toContain("period street furniture")
    expect(film.acceptance.join(" ")).toContain("untreated scene")
    expect(film.finishing.grain).toBeGreaterThan(0)
    const cel = getVisualStyleProfile("theatrical-cel")
    expect(cel.cadence.exposureFrames).toBe(2)
    expect(cel.cadence.cameraExposureFrames).toBe(1)
    expect(cel.material.join(" ")).toContain("shadow shapes")
    const math = getVisualStyleProfile("math-explainer")
    expect(math.finishing.grain).toBe(0)
    expect(math.acceptance.join(" ")).toContain("checked from the authored geometry")
    const pixel = getVisualStyleProfile("pixel-art")
    expect(pixel.delivery.logicalGrid).toEqual({ width: 320, height: 180 })
    expect(pixel.delivery.width / pixel.delivery.logicalGrid!.width).toBe(12)
    expect(pixel.delivery.height / pixel.delivery.logicalGrid!.height).toBe(12)
    expect(pixel.delivery.sampling).toBe("nearest")
    expect(pixel.finishing.grain).toBe(0)
    expect(Object.isFrozen(pixel.delivery.logicalGrid)).toBe(true)
  })

  test("rejects anisotropic or fractional pixel enlargement and undeclared controls", () => {
    const pixel = getVisualStyleProfile("pixel-art")
    for (const delivery of [
      { ...pixel.delivery, width: 3838 },
      { ...pixel.delivery, height: 1980 },
      { ...pixel.delivery, sampling: "smooth" },
      { width: 1920, height: 1080, sampling: "nearest" },
      { ...pixel.delivery, logicalGrid: { width: 0, height: 180 } },
    ]) {
      expect(VisualStyleProfileSchema.safeParse({ ...pixel, delivery }).success).toBe(false)
    }
    expect(VisualStyleProfileSchema.safeParse({ ...pixel, shaderUrl: "https://example.invalid/effect.js" }).success).toBe(false)
    expect(VisualStyleProfileSchema.safeParse({ ...pixel, finishing: { ...pixel.finishing, grain: NaN } }).success).toBe(false)
    expect(VisualStyleProfileSchema.safeParse({ ...pixel, cadence: { ...pixel.cadence, exposureFrames: 0 } }).success).toBe(false)
  })

  test("round-trips nonintegral 24 fps exposure boundaries without slipping into a prior drawing", () => {
    const sampled = sampleVisualStyleExposure(83_334, "theatrical-cel")
    expect(sampled).toEqual({ frame: 2, exposureIndex: 1, exposureTimeUs: 83_334, cameraTimeUs: 83_334 })
    expect(sampleVisualStyleExposure(sampled.exposureTimeUs, "theatrical-cel").exposureIndex).toBe(1)
    const nextDisplayFrame = sampleVisualStyleExposure(125_000, "theatrical-cel")
    expect(nextDisplayFrame.exposureTimeUs).toBe(83_334)
    expect(nextDisplayFrame.cameraTimeUs).toBe(125_000)
    expect(Object.is(sampleVisualStyleExposure(-0, "theatrical-cel").frame, -0)).toBe(false)
  })

  test("preserves the version-one keyed variation sequence across SDK upgrades", () => {
    expect(visualStyleFrameVariation(0, 0, "grain")).toBe(0.7710088782478124)
    expect(visualStyleFrameVariation(8888, 144, "gate/x")).toBe(0.3105465534608811)
    expect(visualStyleFrameVariation(0xffff_ffff, 432_000, "ink-redraw")).toBe(0.0616628082934767)
  })

  test("rejects clocks, entropy inputs, and style identifiers outside the explicit boundary", () => {
    for (const timeUs of [-1, 0.25, Infinity, NaN, 3_600_000_001]) {
      expect(() => sampleVisualStyleExposure(timeUs, "theatrical-cel")).toThrow()
    }
    for (const id of [undefined, null, "", "akira", {}, ["pixel-art"], "__proto__"]) {
      expect(() => getVisualStyleProfile(id)).toThrow()
    }
    for (const [seed, frame, channel] of [
      [-1, 0, "grain"], [0x1_0000_0000, 0, "grain"], [1, -1, "grain"],
      [1, 432_001, "grain"], [1, 0.5, "grain"], [1, 0, ""],
      [1, 0, "grain\n"], [1, 0, "☀"], [1, 0, "a".repeat(129)],
    ] as const) {
      expect(() => visualStyleFrameVariation(seed, frame, channel)).toThrow()
    }
  })
})
