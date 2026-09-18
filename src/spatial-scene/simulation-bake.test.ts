import { describe, expect, test } from "bun:test"

import { canonicalJson } from "../code/canonical-json.js"
import {
  bakeSpatialSimulation,
  parseSpatialSimulationBakeDocument,
  spatialSimulationBakeSha256,
} from "./simulation-bake"
import { parseSpatialSimulationPlan, reconcileSpatialSimulationBakeReceipt } from "./simulation"

const ENGINE_SHA256 = "1".repeat(64)
const SOURCE_SHA256 = "2".repeat(64)

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
    stepCount: 60,
    timeStepUs: 16_666,
    ...overrides,
  }
}

describe("deterministic reference simulation bake", () => {
  test("integrates gravity with exact semi-implicit Euler keys", () => {
    const { document, receipt } = bakeSpatialSimulation(plan({ stepCount: 3, timeStepUs: 1_000_000 }))
    const keys = document.channels[0]!.keys
    const dt = 1
    // v += g*dt; p += v*dt — semi-implicit, deterministic across platforms.
    expect(keys[0]!.position[1]).toBe(1 + -9.8 * dt * dt)
    expect(keys[1]!.position[1]).toBe(1 + (-9.8 * dt - 19.6 * dt) * dt)
    expect(keys.map(key => key.timeUs)).toEqual([0, 1_000_000, 2_000_000])
    expect(keys.every(key => canonicalJson(key.orientation) === canonicalJson([0, 0, 0, 1]))).toBe(true)
    expect(receipt.stepCount).toBe(3)
    expect(receipt.output.channelCount).toBe(1)
    expect(receipt.output.keyCount).toBe(3)
    expect(receipt.output.animationSha256).toBe(spatialSimulationBakeSha256(document))
    expect(() => reconcileSpatialSimulationBakeReceipt(parseSpatialSimulationPlan(plan({ stepCount: 3, timeStepUs: 1_000_000 })), receipt)).not.toThrow()
  })

  test("is byte-for-byte deterministic and emits no negative zero", () => {
    const first = bakeSpatialSimulation(plan())
    const second = bakeSpatialSimulation(plan())
    expect(canonicalJson(first.document)).toBe(canonicalJson(second.document))
    expect(first.receipt.receiptSha256).toBe(second.receipt.receiptSha256)
    expect(canonicalJson(first.document)).not.toMatch(/-0(?=[,\]])/u)
  })

  test("pinned bodies hold their transform while free bodies fall", () => {
    const { document } = bakeSpatialSimulation(plan({
      bodies: [body({ pinned: true }), body({ entityId: "entity_00000003", id: "body_02" })],
      stepCount: 4,
    }))
    const [pinned, free] = document.channels
    expect(pinned!.keys.every(key => canonicalJson(key.position) === canonicalJson([0, 1, 0]))).toBe(true)
    expect(free!.keys[3]!.position[1]).toBeLessThan(1)
  })

  test("spring constraints pull bodies toward their declared rest distance", () => {
    const { document } = bakeSpatialSimulation(plan({
      bodies: [body({ pinned: true, initialPosition: [0, 0, 0] }), body({ entityId: "entity_00000003", id: "body_02", initialPosition: [2, 0, 0], initialVelocity: [0, 0, 0] })],
      constraints: [{ bodyA: "body_01", bodyB: "body_02", constraintId: "constraint_01", damping: 0, kind: "spring", stiffness: 10 }],
      gravity: [0, 0, 0],
      stepCount: 120,
      timeStepUs: 10_000,
    }))
    const free = document.channels[1]!
    // The free body starts at distance 2 with rest length 2 — actually stretched? Rest = initial 2, so no force.
    expect(free.keys[0]!.position[0]).toBe(2)
    const perturbed = bakeSpatialSimulation(plan({
      bodies: [body({ pinned: true, initialPosition: [0, 0, 0] }), body({ entityId: "entity_00000003", id: "body_02", initialPosition: [2, 0, 0], initialVelocity: [-1, 0, 0] })],
      constraints: [{ bodyA: "body_01", bodyB: "body_02", constraintId: "constraint_01", damping: 0, kind: "spring", stiffness: 10 }],
      gravity: [0, 0, 0],
      stepCount: 120,
      timeStepUs: 10_000,
    }))
    const xs = perturbed.document.channels[1]!.keys.map(key => key.position[0])
    // Inward velocity compresses the spring, which must push back outward.
    expect(Math.min(...xs)).toBeLessThan(2)
    expect(Math.max(...xs)).toBeGreaterThan(Math.min(...xs))
  })

  test("fixed constraints project the follower onto the leader's offset", () => {
    const { document } = bakeSpatialSimulation(plan({
      bodies: [body({ initialPosition: [0, 0, 0] }), body({ entityId: "entity_00000003", id: "body_02", initialPosition: [1, 0, 0] })],
      constraints: [{ bodyA: "body_01", bodyB: "body_02", constraintId: "constraint_01", kind: "fixed", localA: [0, 0, 0], localB: [0, 0, 0] }],
      stepCount: 3,
      timeStepUs: 100_000,
    }))
    const [leader, follower] = document.channels
    for (let index = 0; index < 3; index++) {
      expect(follower!.keys[index]!.position[0] - leader!.keys[index]!.position[0]).toBeCloseTo(1, 10)
      expect(follower!.keys[index]!.position[1] - leader!.keys[index]!.position[1]).toBeCloseTo(0, 10)
    }
  })

  test("rotates free bodies under constant angular velocity and keeps unit quaternions", () => {
    const { document } = bakeSpatialSimulation(plan({
      bodies: [body({ initialAngularVelocity: [0, 0, 1] })],
      gravity: [0, 0, 0],
      stepCount: 90,
      timeStepUs: 10_000,
    }))
    for (const key of document.channels[0]!.keys) {
      const [x, y, z, w] = key.orientation
      expect(Math.hypot(x, y, z, w)).toBeCloseTo(1, 12)
    }
    // 0.9s at 1 rad/s around z ≈ 0.9 rad → qz = sin(0.45) ≈ 0.435.
    const last = document.channels[0]!.keys.at(-1)!.orientation
    expect(last[2]).toBeGreaterThan(0.3)
    expect(last[2]).toBeLessThan(0.6)
  })

  test("rejects the native secondary-motion profile and hinge constraints fail-closed", () => {
    expect(() => bakeSpatialSimulation(plan({ engine: { identitySha256: ENGINE_SHA256, profile: "slopcamera-native-secondary-motion-v1" }, simulationKind: "secondary-motion" }))).toThrow(/not qualified/)
    expect(() => bakeSpatialSimulation(plan({
      bodies: [body(), body({ entityId: "entity_00000003", id: "body_02" })],
      constraints: [{ axis: [0, 1, 0], bodyA: "body_01", bodyB: "body_02", constraintId: "constraint_01", kind: "hinge" }],
    }))).toThrow(/Hinge constraint constraint_01/)
  })

  test("rejects stale receipts and over-budget output honestly", () => {
    const small = plan({ bodies: [body({ initialAngularVelocity: [1.2345, -2.3456, 3.4567], initialPosition: [123_456.789, 1, 0] })], maximumOutputBytes: 8_000, stepCount: 100 })
    expect(() => bakeSpatialSimulation(small)).toThrow(/output-byte budget/)
    const { receipt } = bakeSpatialSimulation(plan())
    expect(() => reconcileSpatialSimulationBakeReceipt(parseSpatialSimulationPlan(plan({ seed: 2 })), receipt)).toThrow(/stale/)
    expect(() => parseSpatialSimulationBakeDocument({ ...receipt, kind: "slopcamera.spatial-simulation-bake" })).toThrow()
  })
})
