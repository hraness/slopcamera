import { describe, expect, test } from "bun:test"

import {
  parseSpatialParticleSystem,
  spatialParticleAssetIds,
  spatialParticleSystemSha256,
  SPATIAL_PARTICLE_LIMITS,
  SpatialParticleSystemSchema,
} from "./particle"

function emitter(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    colorOverLife: [[1, 1, 1, 1], [1, 0.5, 0.1, 0]],
    id: "emitter_01",
    lifetimeUs: [1, 1_000_000],
    opacityOverLife: { keys: [{ t: 0, value: 1 }, { t: 1, value: 0 }] },
    rate: 100,
    seed: 12345,
    shape: { kind: "point" },
    sizeOverLife: { keys: [{ t: 0, value: 0.1 }, { t: 1, value: 0 }] },
    velocity: [0, 1, 0],
    velocitySpread: [0.1, 0.1, 0.1],
    ...overrides,
  }
}

function system(overrides: Record<string, unknown> = {}): unknown {
  return {
    countTier: "preview",
    emitters: [emitter()],
    entityId: "entity_00000001",
    forces: [],
    killVolumes: [],
    kind: "slopcamera.spatial-particle-system",
    maxCount: 1000,
    schemaVersion: 1,
    ...overrides,
  }
}

describe("spatial particle system", () => {
  test("parses and canonicalizes a minimal seeded point emitter", () => {
    const parsed = parseSpatialParticleSystem(system())
    expect(parsed.emitters[0]!.shape.kind).toBe("point")
    expect(parsed.emitters[0]!.seed).toBe(12345)
    expect(parsed.emitters[0]!.colorOverLife).toEqual([
      { t: 0, color: [1, 1, 1, 1] },
      { t: 1, color: [1, 0.5, 0.1, 0] },
    ])
    expect(parsed.renderer).toEqual({ billboard: true, kind: "sprite" })
  })

  test("rejects final-tier count in preview and a simultaneous population above maxCount", () => {
    expect(() => parseSpatialParticleSystem(system({ maxCount: 200_000 }))).toThrow(/exceeding the preview/)
    expect(() => parseSpatialParticleSystem(system({ emitters: [emitter({ rate: 5_000, burst: 10_000 })] }))).toThrow(/simultaneous bound/)
  })

  test("rejects malformed lifetimes, curves, volumes, forces, and duplicate emitter IDs", () => {
    expect(() => parseSpatialParticleSystem(system({ emitters: [emitter({ lifetimeUs: [20, 10] })] }))).toThrow(/Maximum particle lifetime/)
    expect(() => parseSpatialParticleSystem(system({ emitters: [emitter({ sizeOverLife: { keys: [{ t: 0.2, value: 1 }, { t: 1, value: 0 }] } })] }))).toThrow(/cover normalized time/)
    expect(() => parseSpatialParticleSystem(system({ killVolumes: [{ kind: "box", min: [1, 0, 0], max: [0, 1, 1] }] }))).toThrow(/minimum coordinates/)
    expect(() => parseSpatialParticleSystem(system({ forces: [{ kind: "vortex", axis: [0, 0, 0], strength: 1 }] }))).toThrow(/nonzero/)
    expect(() => parseSpatialParticleSystem(system({ emitters: [emitter(), emitter()] }))).toThrow(/duplicate emitter/)
  })

  test("accepts negative spline coordinates and reports exact asset closure", () => {
    const parsed = parseSpatialParticleSystem(system({
      emitters: [emitter({ shape: { kind: "spline", controlPoints: [[-1, 0, 0], [1, 0, 0]] } })],
      renderer: { kind: "sprite", assetId: "asset_sprite" },
    }))
    expect(parsed.emitters[0]!.shape).toMatchObject({ kind: "spline", controlPoints: [[-1, 0, 0], [1, 0, 0]] })
    expect(spatialParticleAssetIds(parsed)).toEqual(["asset_sprite"])
  })

  test("rejects too many emitters", () => {
    const emitters = Array.from({ length: SPATIAL_PARTICLE_LIMITS.emitters + 1 }, (_, index) => emitter({ id: `emitter_${index}`, seed: index, rate: 1, lifetimeUs: [1, 1] }))
    expect(() => parseSpatialParticleSystem(system({ emitters }))).toThrow(/64/)
  })

  test("sha256 is deterministic", () => {
    const first = parseSpatialParticleSystem(system())
    const second = parseSpatialParticleSystem(system())
    expect(SpatialParticleSystemSchema.parse(first)).toEqual(SpatialParticleSystemSchema.parse(second))
    expect(spatialParticleSystemSha256(first)).toBe(spatialParticleSystemSha256(second))
  })
})
