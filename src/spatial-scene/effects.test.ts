import { describe, expect, test } from "bun:test"

import {
  parseSpatialRenderPlan,
  spatialRenderPlanAssetIds,
  spatialRenderPlanSha256,
  SPATIAL_EFFECT_LIMITS,
  SpatialRenderPlanSchema,
} from "./effects"

function minimalPlan(): Record<string, unknown> {
  return {
    kind: "slopcamera.spatial-render-plan",
    quality: {
      outputBytes: 1_000_000_000,
      particleCount: 10_000,
      pixelBudget: 1920 * 1080,
      simulationSteps: 240,
      texturePixelBudget: 2048 * 2048,
      tier: "preview",
    },
    schemaVersion: 1,
  }
}

describe("spatial render effect plan", () => {
  test("parses a minimal preview plan", () => {
    const plan = parseSpatialRenderPlan(minimalPlan())
    expect(plan.quality.tier).toBe("preview")
    expect(plan.quality.particleCount).toBe(10_000)
    expect(plan.postProcess).toBeUndefined()
  })

  test("accepts the closed beauty stack and reports LUT asset closure", () => {
    const raw = minimalPlan()
    raw.postProcess = {
      kind: "slopcamera.spatial-post-process",
      schemaVersion: 1,
      steps: [
        { kind: "bloom", threshold: 0.8, intensity: 0.3, radius: 4 },
        { kind: "tone-map", exposure: 0.5, whitePoint: 4 },
        { kind: "chromatic-aberration", offsetPixels: 1.5, radialFalloff: 0.8 },
        { kind: "flare", ghosts: 4, haloWidth: 0.2, intensity: 0.15, threshold: 0.9 },
        { kind: "grain", intensity: 0.05, seed: 12345 },
        { kind: "lut-grade", assetId: "asset_lut", intensity: 0.5 },
      ],
    }
    const plan = parseSpatialRenderPlan(raw)
    expect(plan.postProcess?.steps).toHaveLength(6)
    expect(spatialRenderPlanAssetIds(plan)).toEqual(["asset_lut"])
  })

  test("rejects oversized stacks, excess LUTs, and empty stacks", () => {
    const oversized = minimalPlan()
    oversized.postProcess = {
      kind: "slopcamera.spatial-post-process",
      schemaVersion: 1,
      steps: Array.from({ length: SPATIAL_EFFECT_LIMITS.postProcessStack + 1 }, () => ({ kind: "grain", intensity: 0.05, seed: 12345 })),
    }
    expect(() => parseSpatialRenderPlan(oversized)).toThrow(/<=8/)
    const luts = minimalPlan()
    luts.postProcess = {
      kind: "slopcamera.spatial-post-process",
      schemaVersion: 1,
      steps: Array.from({ length: SPATIAL_EFFECT_LIMITS.luts + 1 }, (_, index) => ({ kind: "lut-grade", assetId: `asset_lut_${index}`, intensity: 1 })),
    }
    expect(() => parseSpatialRenderPlan(luts)).toThrow(/at most 4 LUT/)
    expect(() => parseSpatialRenderPlan({ ...minimalPlan(), postProcess: { kind: "slopcamera.spatial-post-process", schemaVersion: 1, steps: [] } })).toThrow()
  })

  test("rejects unsafe quality budgets and preview population", () => {
    const preview = minimalPlan()
    ;(preview.quality as Record<string, unknown>).particleCount = 200_000
    expect(() => parseSpatialRenderPlan(preview)).toThrow(/100,000/)
    const bytes = minimalPlan()
    ;(bytes.quality as Record<string, unknown>).particleCount = 100_000
    ;(bytes.quality as Record<string, unknown>).outputBytes = 1_000
    expect(() => parseSpatialRenderPlan(bytes)).toThrow(/byte budget/)
    const pixels = minimalPlan()
    ;(pixels.quality as Record<string, unknown>).pixelBudget = SPATIAL_EFFECT_LIMITS.renderPixels + 1
    expect(() => parseSpatialRenderPlan(pixels)).toThrow(/67108864/)
  })

  test("sha256 is deterministic", () => {
    const first = parseSpatialRenderPlan(minimalPlan())
    const second = parseSpatialRenderPlan(minimalPlan())
    expect(SpatialRenderPlanSchema.parse(first)).toEqual(SpatialRenderPlanSchema.parse(second))
    expect(spatialRenderPlanSha256(first)).toBe(spatialRenderPlanSha256(second))
  })
})
