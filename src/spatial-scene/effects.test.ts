import { describe, expect, test } from "bun:test";

import { parseSpatialRenderPlan, SPATIAL_EFFECT_LIMITS, SpatialRenderPlanSchema } from "./effects";

function minimalPlan(): unknown {
  return {
    kind: "slopcamera.spatial-render-plan",
    schemaVersion: 1,
    quality: {
      tier: "preview",
      pixelBudget: 1920 * 1080,
      texturePixelBudget: 2048 * 2048,
      particleCount: 10000,
      simulationSteps: 240,
      outputBytes: 1_000_000_000,
    },
  };
}

describe("spatial render effect plan", () => {
  test("parses a minimal preview plan", () => {
    const plan = parseSpatialRenderPlan(minimalPlan());
    expect(plan.quality.tier).toBe("preview");
    expect(plan.quality.particleCount).toBe(10000);
    expect(plan.postProcess).toBeUndefined();
  });

  test("accepts a bounded post-process stack", () => {
    const raw = minimalPlan() as Record<string, unknown>;
    raw.postProcess = {
      kind: "slopcamera.spatial-post-process",
      schemaVersion: 1,
      steps: [
        { kind: "bloom", threshold: 0.8, intensity: 0.3, radius: 4 },
        { kind: "tone-map", exposure: 0.5, whitePoint: 4 },
        { kind: "vignette", intensity: 0.2, radius: 0.8 },
        { kind: "grain", intensity: 0.05, seed: 12345 },
      ],
    };
    const plan = parseSpatialRenderPlan(raw);
    expect(plan.postProcess?.steps).toHaveLength(4);
  });

  test("rejects an oversized post-process stack", () => {
    const raw = minimalPlan() as Record<string, unknown>;
    raw.postProcess = {
      kind: "slopcamera.spatial-post-process",
      schemaVersion: 1,
      steps: Array.from({ length: SPATIAL_EFFECT_LIMITS.postProcessStack + 1 }, () => ({
        kind: "grain", intensity: 0.05, seed: 12345,
      })),
    };
    expect(() => parseSpatialRenderPlan(raw)).toThrow(/<=8/);
  });

  test("rejects preview tier with too many particles", () => {
    const raw = minimalPlan() as Record<string, unknown>;
    (raw.quality as Record<string, unknown>).particleCount = 200_000;
    expect(() => parseSpatialRenderPlan(raw)).toThrow(/100,000/);
  });

  test("rejects a byte budget smaller than particle overhead", () => {
    const raw = minimalPlan() as Record<string, unknown>;
    (raw.quality as Record<string, unknown>).particleCount = 100_000;
    (raw.quality as Record<string, unknown>).outputBytes = 1_000;
    expect(() => parseSpatialRenderPlan(raw)).toThrow(/byte budget/);
  });

  test("sha256 is deterministic", () => {
    const a = parseSpatialRenderPlan(minimalPlan());
    const b = parseSpatialRenderPlan(minimalPlan());
    expect(SpatialRenderPlanSchema.parse(a)).toEqual(SpatialRenderPlanSchema.parse(b));
  });
});
