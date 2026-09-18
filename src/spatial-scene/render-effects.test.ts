import { describe, expect, test } from "bun:test"

import { parseSpatialRenderPlan, spatialRenderPlanSha256 } from "./effects"
import { parseSpatialParticleSystem, spatialParticleSystemSha256 } from "./particle"
import {
  parseSpatialRenderEffectsDocument,
  spatialRenderEffectsAssetIds,
  spatialRenderEffectsSha256,
} from "./render-effects"

const SCENE_SHA256 = "a".repeat(64)

function particleSystem(): Record<string, unknown> {
  return {
    countTier: "preview",
    emitters: [{
      colorOverLife: [[1, 0.5, 0.1, 1], [1, 0, 0, 0]],
      id: "emitter_01",
      lifetimeUs: [100_000, 1_000_000],
      opacityOverLife: { keys: [{ t: 0, value: 1 }, { t: 1, value: 0 }] },
      rate: 100,
      seed: 42,
      shape: { kind: "point" },
      sizeOverLife: { keys: [{ t: 0, value: 1 }, { t: 1, value: 0 }] },
      velocity: [0, 1, 0],
      velocitySpread: [0.1, 0.1, 0.1],
    }],
    entityId: "entity_00000001",
    forces: [],
    killVolumes: [],
    kind: "slopcamera.spatial-particle-system",
    maxCount: 100,
    renderer: { assetId: "asset_particle", billboard: true, kind: "sprite" },
    schemaVersion: 1,
  }
}

function renderPlan(): Record<string, unknown> {
  return {
    kind: "slopcamera.spatial-render-plan",
    postProcess: {
      kind: "slopcamera.spatial-post-process",
      schemaVersion: 1,
      steps: [{ assetId: "asset_lut", intensity: 0.5, kind: "lut-grade" }],
    },
    quality: {
      outputBytes: 64_000_000,
      particleCount: 100,
      pixelBudget: 1920 * 1080,
      simulationSteps: 0,
      texturePixelBudget: 4096 * 4096,
      tier: "preview",
    },
    schemaVersion: 1,
  }
}

function document(overrides: Record<string, unknown> = {}): unknown {
  const system = parseSpatialParticleSystem(particleSystem())
  const plan = parseSpatialRenderPlan(renderPlan())
  return {
    kind: "slopcamera.spatial-render-effects",
    particleSystems: [{ system, systemSha256: spatialParticleSystemSha256(system) }],
    renderPlan: plan,
    renderPlanSha256: spatialRenderPlanSha256(plan),
    sceneSha256: SCENE_SHA256,
    schemaVersion: 1,
    simulationBakes: [],
    ...overrides,
  }
}

describe("spatial render effects document", () => {
  test("binds render, particle, scene, and asset identities deterministically", () => {
    const parsed = parseSpatialRenderEffectsDocument(document())
    expect(spatialRenderEffectsAssetIds(parsed)).toEqual(["asset_lut", "asset_particle"])
    expect(spatialRenderEffectsSha256(parsed)).toBe(spatialRenderEffectsSha256(parseSpatialRenderEffectsDocument(document())))
    expect(Object.isFrozen(parsed.particleSystems[0]?.system)).toBe(true)
  })

  test("rejects tampered nested digests and dishonest aggregate costs", () => {
    const base = document() as { particleSystems: { system: unknown; systemSha256: string }[]; renderPlan: Record<string, unknown> }
    expect(() => parseSpatialRenderEffectsDocument({ ...base, renderPlanSha256: "f".repeat(64) })).toThrow(/Render-plan digest/)
    expect(() => parseSpatialRenderEffectsDocument({ ...base, particleSystems: [{ ...base.particleSystems[0]!, systemSha256: "f".repeat(64) }] })).toThrow(/Particle-system digest/)
    const dishonestPlan = parseSpatialRenderPlan({ ...base.renderPlan, quality: { ...(base.renderPlan.quality as object), particleCount: 99 } })
    expect(() => parseSpatialRenderEffectsDocument({ ...base, renderPlan: dishonestPlan, renderPlanSha256: spatialRenderPlanSha256(dishonestPlan) })).toThrow(/exact aggregate particle/)
  })

  test("rejects duplicate particle targets", () => {
    const base = document() as { particleSystems: unknown[] }
    expect(() => parseSpatialRenderEffectsDocument({ ...base, particleSystems: [base.particleSystems[0], base.particleSystems[0]] })).toThrow(/Duplicate particle-system entity/)
  })
})
