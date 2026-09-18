import { describe, expect, test } from "bun:test";

import { parseSpatialParticleSystem, SPATIAL_PARTICLE_LIMITS, SpatialParticleSystemSchema } from "./particle";

function system(overrides: Record<string, unknown> = {}): unknown {
  return {
    kind: "slopcamera.spatial-particle-system",
    schemaVersion: 1,
    entityId: "entity_00000001",
    countTier: "preview",
    maxCount: 1000,
    emitters: [{
      id: "emitter_01",
      seed: 12345,
      rate: 100,
      lifetimeUs: [0, 1_000_000],
      shape: { kind: "point" },
      velocity: [0, 1, 0],
      velocitySpread: [0.1, 0.1, 0.1],
      sizeOverLife: { keys: [{ t: 0, value: 0.1 }, { t: 1, value: 0 }] },
      colorOverLife: [[1, 1, 1, 1]],
      opacityOverLife: { keys: [{ t: 0, value: 1 }, { t: 1, value: 0 }] },
    }],
    forces: [],
    killVolumes: [],
    ...overrides,
  };
}

describe("spatial particle system", () => {
  test("parses a minimal seeded point emitter", () => {
    const s = parseSpatialParticleSystem(system());
    expect(s.emitters[0]!.shape.kind).toBe("point");
    expect(s.emitters[0]!.seed).toBe(12345);
  });

  test("rejects a final-tier count inside a preview request", () => {
    expect(() => parseSpatialParticleSystem(system({ maxCount: 200_000 }))).toThrow(/exceeding the preview/);
  });

  test("rejects a peak rate above maxCount", () => {
    const base = system() as unknown as { emitters: Record<string, unknown>[] };
    expect(() => parseSpatialParticleSystem(system({ emitters: [{ ...base.emitters[0]!, rate: 5000, burst: 10000 }] }))).toThrow(/peak emission/);
  });

  test("rejects too many emitters", () => {
    const emitters = Array.from({ length: SPATIAL_PARTICLE_LIMITS.emitters + 1 }, (_, i) => ({
      id: `emitter_${i}`,
      seed: i,
      rate: 1,
      lifetimeUs: [0, 1],
      shape: { kind: "point" },
      velocity: [0, 0, 0],
      velocitySpread: [0, 0, 0],
      sizeOverLife: { keys: [{ t: 0, value: 1 }] },
      colorOverLife: [[1, 1, 1, 1]],
      opacityOverLife: { keys: [{ t: 0, value: 1 }] },
    }));
    expect(() => parseSpatialParticleSystem(system({ emitters }))).toThrow(/64/);
  });

  test("sha256 is deterministic", () => {
    const a = parseSpatialParticleSystem(system());
    const b = parseSpatialParticleSystem(system());
    expect(SpatialParticleSystemSchema.parse(a)).toEqual(SpatialParticleSystemSchema.parse(b));
  });
});
