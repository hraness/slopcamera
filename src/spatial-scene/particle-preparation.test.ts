import { describe, expect, test } from "bun:test"

import { prepareSpatialParticleInstances, SPATIAL_PARTICLE_INSTANCE_STRIDE_BYTES } from "./particle-preparation"

function system(emitterOverrides: Record<string, unknown> = {}, systemOverrides: Record<string, unknown> = {}): unknown {
  return {
    countTier: "preview",
    emitters: [{
      burst: 2,
      colorOverLife: [[1, 0, 0, 1], [0, 0, 1, 0]],
      id: "emitter_01",
      lifetimeUs: [1_000_000, 1_000_000],
      opacityOverLife: { keys: [{ t: 0, value: 1 }, { t: 1, value: 0 }] },
      rate: 0,
      seed: 42,
      shape: { kind: "point" },
      sizeOverLife: { keys: [{ t: 0, value: 1 }, { t: 1, value: 0 }] },
      velocity: [1, 0, 0],
      velocitySpread: [0, 0, 0],
      ...emitterOverrides,
    }],
    entityId: "entity_00000001",
    forces: [{ acceleration: [0, -10, 0], kind: "gravity" }],
    killVolumes: [],
    kind: "slopcamera.spatial-particle-system",
    maxCount: 2,
    schemaVersion: 1,
    ...systemOverrides,
  }
}

function floats(bytes: Uint8Array): number[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return Array.from({ length: bytes.length / 4 }, (_, index) => view.getFloat32(index * 4, true))
}

describe("spatial particle CPU preparation", () => {
  test("emits a deterministic fixed-layout buffer with analytic force and curve state", () => {
    const first = prepareSpatialParticleInstances({ sampleTimeUs: 500_000, surfaces: [], system: system() })
    const second = prepareSpatialParticleInstances({ sampleTimeUs: 500_000, surfaces: [], system: system() })
    expect(first).toMatchObject({ instanceCount: 2, byteLength: 2 * SPATIAL_PARTICLE_INSTANCE_STRIDE_BYTES, strideBytes: SPATIAL_PARTICLE_INSTANCE_STRIDE_BYTES })
    expect(first.sha256).toBe(second.sha256)
    expect(first.bytes).toEqual(second.bytes)
    expect(floats(first.bytes).slice(0, 14)).toEqual([0.5, -1.25, 0, 0.5, 1, -5, 0, 1, 0.5, 0.5, 0.5, 0, 0.5, 0.5])
  })

  test("changes bytes with seed and accepts signed spline points", () => {
    const first = prepareSpatialParticleInstances({ sampleTimeUs: 500_000, system: system({ shape: { kind: "spline", controlPoints: [[-2, 0, 0], [2, 0, 0]] }, velocitySpread: [1, 1, 1] }) })
    const second = prepareSpatialParticleInstances({ sampleTimeUs: 500_000, system: system({ seed: 43, shape: { kind: "spline", controlPoints: [[-2, 0, 0], [2, 0, 0]] }, velocitySpread: [1, 1, 1] }) })
    expect(first.sha256).not.toBe(second.sha256)
  })

  test("requires exact surface preparation and rejects duplicate surfaces", () => {
    const surfaceSystem = system({ shape: { kind: "surface", assetId: "asset_surface" } })
    expect(() => prepareSpatialParticleInstances({ sampleTimeUs: 500_000, system: surfaceSystem })).toThrow(/no prepared triangle set/)
    const surface = { assetId: "asset_surface", triangles: [[[-1, 0, -1], [1, 0, -1], [0, 0, 1]]] }
    expect(prepareSpatialParticleInstances({ sampleTimeUs: 500_000, surfaces: [surface], system: surfaceSystem }).instanceCount).toBe(2)
    expect(() => prepareSpatialParticleInstances({ sampleTimeUs: 500_000, surfaces: [surface, surface], system: surfaceSystem })).toThrow(/Duplicate particle surface/)
  })

  test("applies kill volumes before retaining instances", () => {
    const prepared = prepareSpatialParticleInstances({ sampleTimeUs: 500_000, system: system({}, { killVolumes: [{ kind: "box", min: [-1, -2, -1], max: [1, 1, 1] }] }) })
    expect(prepared.instanceCount).toBe(0)
    expect(prepared.bytes).toHaveLength(0)
  })
})
