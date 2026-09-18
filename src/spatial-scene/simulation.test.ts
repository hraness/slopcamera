import { describe, expect, test } from "bun:test";

import { parseSpatialSimulationPlan } from "./simulation";

function plan(overrides: Record<string, unknown> = {}): unknown {
  return {
    kind: "slopcamera.spatial-simulation-plan",
    schemaVersion: 1,
    entityId: "entity_00000001",
    engine: "slopcamera-native-1",
    cacheId: "cache_00000001",
    sourceDigest: "0".repeat(64),
    seed: 1,
    timeStepUs: 16666,
    stepCount: 1000,
    maxSubsteps: 4,
    bodies: [{
      id: "body_01",
      mass: 1,
      restitution: 0.5,
      friction: 0.1,
      shape: { kind: "sphere", radius: 0.5 },
      initialPosition: [0, 1, 0],
      initialOrientation: [0, 0, 0, 1],
      initialVelocity: [0, 0, 0],
      initialAngularVelocity: [0, 0, 0],
    }],
    constraints: [],
    gravity: [0, -9.8, 0],
    ...overrides,
  };
}

describe("spatial simulation plan", () => {
  test("parses a minimal deterministic rigid-body plan", () => {
    const s = parseSpatialSimulationPlan(plan());
    expect(s.bodies[0]!.shape.kind).toBe("sphere");
    expect(s.stepCount).toBe(1000);
  });

  test("rejects a constraint that references a missing body", () => {
    expect(() => parseSpatialSimulationPlan(plan({ constraints: [{ kind: "fixed", bodyA: "body_01", bodyB: "body_02", localA: [0, 0, 0], localB: [0, 0, 0] }] }))).toThrow(/body_02/);
  });

  test("rejects an oversized cache bake estimate", () => {
    const bodies = Array.from({ length: 256 }, (_, i) => ({
      id: `body_${i}`,
      mass: 1,
      restitution: 0.5,
      friction: 0.1,
      shape: { kind: "sphere", radius: 0.5 },
      initialPosition: [0, 0, 0],
      initialOrientation: [0, 0, 0, 1],
      initialVelocity: [0, 0, 0],
      initialAngularVelocity: [0, 0, 0],
      pinned: false,
    }));
    expect(() => parseSpatialSimulationPlan(plan({ bodies, stepCount: 100_000 }))).toThrow(/exceed/);
  });
});
