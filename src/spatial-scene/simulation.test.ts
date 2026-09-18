import { describe, expect, test } from "bun:test"

import {
  createSpatialSimulationBakeReceipt,
  parseSpatialSimulationPlan,
  reconcileSpatialSimulationBakeReceipt,
  spatialSimulationPlanSha256,
} from "./simulation"

const ENGINE_SHA256 = "1".repeat(64)
const SOURCE_SHA256 = "2".repeat(64)
const ANIMATION_SHA256 = "3".repeat(64)

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    entityId: "entity_00000002",
    friction: 0.1,
    id: "body_01",
    initialAngularVelocity: [0, 0, 0],
    initialOrientation: [0, 0, 0, 1],
    initialPosition: [0, 1, 0],
    initialVelocity: [0, 0, 0],
    mass: 1,
    restitution: 0.5,
    shape: { kind: "sphere", radius: 0.5 },
    ...overrides,
  }
}

function plan(overrides: Record<string, unknown> = {}): unknown {
  return {
    bodies: [body()],
    cacheId: "cache_00000001",
    constraints: [],
    engine: { identitySha256: ENGINE_SHA256, profile: "slopcamera-rigid-body-reference-v1" },
    entityId: "entity_00000001",
    gravity: [0, -9.8, 0],
    kind: "slopcamera.spatial-simulation-plan",
    maxSubsteps: 4,
    schemaVersion: 1,
    seed: 1,
    sourceDigest: SOURCE_SHA256,
    stepCount: 1000,
    timeStepUs: 16_666,
    ...overrides,
  }
}

describe("spatial simulation plan", () => {
  test("parses a minimal deterministic rigid-body plan", () => {
    const parsed = parseSpatialSimulationPlan(plan())
    expect(parsed.bodies[0]!.shape.kind).toBe("sphere")
    expect(parsed.stepCount).toBe(1000)
    expect(parsed.simulationKind).toBe("rigid-body")
  })

  test("rejects invalid bodies, clocks, engines, and constraints", () => {
    expect(() => parseSpatialSimulationPlan(plan({ bodies: [body({ mass: 0 })] }))).toThrow(/positive mass/)
    expect(() => parseSpatialSimulationPlan(plan({ bodies: [body({ initialOrientation: [0, 0, 0, 0.5] })] }))).toThrow(/unit quaternion/)
    expect(() => parseSpatialSimulationPlan(plan({ timeStepUs: 1_000_000, stepCount: 4_000 }))).toThrow(/one hour/)
    expect(() => parseSpatialSimulationPlan(plan({ simulationKind: "secondary-motion" }))).toThrow(/engine profile/)
    expect(() => parseSpatialSimulationPlan(plan({ constraints: [{ constraintId: "constraint_01", kind: "fixed", bodyA: "body_01", bodyB: "body_02", localA: [0, 0, 0], localB: [0, 0, 0] }] }))).toThrow(/body_02/)
    expect(() => parseSpatialSimulationPlan(plan({ constraints: [{ constraintId: "constraint_01", kind: "hinge", bodyA: "body_01", bodyB: "body_01", axis: [0, 0, 0] }] }))).toThrow(/itself/)
  })

  test("rejects duplicate body identities and an oversized bake estimate", () => {
    expect(() => parseSpatialSimulationPlan(plan({ bodies: [body(), body()] }))).toThrow(/Duplicate rigid-body/)
    const bodies = Array.from({ length: 256 }, (_, index) => body({
      entityId: `entity_${String(index + 2).padStart(8, "0")}`,
      id: `body_${index}`,
    }))
    expect(() => parseSpatialSimulationPlan(plan({ bodies, stepCount: 100_000 }))).toThrow(/exceed maximumOutputBytes/)
  })

  test("content-addresses plans and reconciles exact bake custody", () => {
    const parsed = parseSpatialSimulationPlan(plan())
    const receipt = createSpatialSimulationBakeReceipt({
      cacheId: parsed.cacheId,
      engine: parsed.engine,
      kind: "slopcamera.spatial-simulation-bake-receipt",
      output: { animationSha256: ANIMATION_SHA256, bytes: 80_000, channelCount: 2, keyCount: 2_000 },
      planSha256: spatialSimulationPlanSha256(parsed),
      schemaVersion: 1,
      seed: parsed.seed,
      sourceDigest: parsed.sourceDigest,
      stepCount: parsed.stepCount,
      timeStepUs: parsed.timeStepUs,
    })
    expect(reconcileSpatialSimulationBakeReceipt(parsed, receipt)).toEqual(receipt)
    expect(() => reconcileSpatialSimulationBakeReceipt(parsed, { ...receipt, receiptSha256: "f".repeat(64) })).toThrow(/digest/)
    const otherPlan = parseSpatialSimulationPlan(plan({ seed: 2 }))
    expect(() => reconcileSpatialSimulationBakeReceipt(otherPlan, receipt)).toThrow(/stale/)
  })
})
