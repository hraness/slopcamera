import { describe, expect, test } from "bun:test"
import fc from "fast-check"
import { facing, nextTo, onTopOf } from "./build.js"
import { SpatialScenePatchV1Schema } from "./contracts.js"
import { parseSpatialValue } from "./identity.js"
import { composeTransform, transformBounds, type Bounds, type Transform, type Vec3 } from "./math.js"
import {
  solveSpatialRelations, SPATIAL_SOLVE_PENDING_SCENE_SHA256, SpatialSolveError,
  type SpatialSolveRequest,
} from "./solve.js"
import { fixtureTransform } from "./test-fixture.js"

const UNIT_BOX: Bounds = { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] }
const FLAT_BOX: Bounds = { min: [-1, -0.25, -1], max: [1, 0.25, 1] }

function base(position: Vec3, bounds?: Bounds, transform?: Partial<Transform>) {
  const value = { ...fixtureTransform, position, ...transform }
  return bounds === undefined ? { transform: value } : { transform: value, bounds }
}

function worldBounds(transform: Transform, bounds: Bounds): Bounds {
  return transformBounds(composeTransform(transform), bounds)
}

function solveError(request: SpatialSolveRequest): SpatialSolveError {
  try {
    solveSpatialRelations(request)
  } catch (error) {
    expect(error).toBeInstanceOf(SpatialSolveError)
    return error as SpatialSolveError
  }
  throw new Error("solveSpatialRelations did not reject")
}

describe("solveSpatialRelations", () => {
  test("a three-entity chain matches hand-applied primitives in dependency order", () => {
    const bases = {
      entity_a: base([5, 0, 5], UNIT_BOX),
      entity_b: base([0, 0, 0], UNIT_BOX),
      entity_c: base([0, 0, -4], FLAT_BOX),
      camera_hero: base([0, 2, 8]),
    }
    const result = solveSpatialRelations({
      goals: [
        { entityKey: "entity_a", relations: [{ kind: "onTopOf", target: "entity_b" }] },
        { entityKey: "entity_b", relations: [{ kind: "nextTo", target: "entity_c", gap: 1 }] },
        { entityKey: "entity_c", relations: [{ kind: "at", position: [10, 0, 0] }, { kind: "facing", target: "camera_hero" }] },
      ],
      bases,
    })
    // entity_c solves first (entity_b depends on it) even though declared last:
    // `at` relocates it, then facing rotates it about the relocated position.
    const cSolved = facing({ ...fixtureTransform, position: [10, 0, 0] }, [0, 2, 8])
    // entity_b's nextTo sees entity_c's solved (relocated, rotated) transform.
    const bSolved = nextTo(UNIT_BOX, fixtureTransform, FLAT_BOX, cSolved, { gap: 1 })
    const aSolved = onTopOf(UNIT_BOX, { ...fixtureTransform, position: [5, 0, 5] }, UNIT_BOX, bSolved)
    expect(result.transforms.entity_c).toEqual(cSolved)
    expect(result.transforms.entity_b).toEqual(bSolved)
    expect(result.transforms.entity_a).toEqual(aSolved)
    // A declared-order pass would have placed B next to C's authored spot.
    expect(bSolved.position).not.toEqual(nextTo(UNIT_BOX, fixtureTransform, FLAT_BOX, { ...fixtureTransform, position: [0, 0, -4] }, { gap: 1 }).position)
    expect(result.patch.operations.map(operation => operation.kind)).toEqual(["set-transform", "set-transform", "set-transform"])
    expect(result.patch.expectedSceneSha256).toBe(SPATIAL_SOLVE_PENDING_SCENE_SHA256)
  })

  test("relations within one goal apply in declared order and see earlier results", () => {
    const result = solveSpatialRelations({
      goals: [{
        entityKey: "entity_a",
        relations: [
          { kind: "at", position: [4, 0, 0] },
          { kind: "nextTo", target: "entity_b", axis: "y", side: "after", gap: 2 },
        ],
      }],
      bases: { entity_a: base([9, 9, 9], UNIT_BOX), entity_b: base([0, 0, 0], UNIT_BOX) },
    })
    // The nextTo ran against the post-`at` position, not the authored one:
    // x/z recentered on entity_b while A's min-y sits 2 above B's max-y (0.5).
    expect(result.transforms.entity_a!.position).toEqual([0, 3, 0])
  })

  test("align places the mover's edge on the target's same edge without moving the target", () => {
    for (const edge of ["min", "center", "max"] as const) {
      const result = solveSpatialRelations({
        goals: [{ entityKey: "entity_a", relations: [{ kind: "align", target: "entity_b", axis: "x", edge }] }],
        bases: {
          entity_a: base([10, 0, 0], UNIT_BOX),
          entity_b: base([3, 5, -2], FLAT_BOX),
        },
      })
      const mover = result.transforms.entity_a!
      const moverWorld = worldBounds({ position: mover.position, rotation: mover.rotation, scale: mover.scale }, UNIT_BOX)
      const targetWorld = worldBounds({ ...fixtureTransform, position: [3, 5, -2] }, FLAT_BOX)
      const moverEdge = edge === "min" ? moverWorld.min[0] : edge === "max" ? moverWorld.max[0] : (moverWorld.min[0] + moverWorld.max[0]) / 2
      const targetEdge = edge === "min" ? targetWorld.min[0] : edge === "max" ? targetWorld.max[0] : (targetWorld.min[0] + targetWorld.max[0]) / 2
      expect(moverEdge).toBeCloseTo(targetEdge, 9)
      // Untouched axes keep the mover's coordinates.
      expect(mover.position[1]).toBe(0)
      expect(mover.position[2]).toBe(0)
    }
  })

  test("at and groundSnap set absolute components and rest the underside on the floor", () => {
    const result = solveSpatialRelations({
      goals: [
        { entityKey: "entity_a", relations: [{ kind: "at", position: [1, 9, 2], scale: [2, 2, 2] }] },
        { entityKey: "entity_b", relations: [{ kind: "groundSnap", floorY: -1 }] },
      ],
      bases: { entity_a: base([0, 0, 0]), entity_b: base([4, 8, 4], UNIT_BOX) },
    })
    expect(result.transforms.entity_a!.position).toEqual([1, 9, 2])
    expect(result.transforms.entity_a!.scale).toEqual([2, 2, 2])
    // Underside (0.5 below the origin) rests on floorY -1.
    expect(result.transforms.entity_b!.position).toEqual([4, -0.5, 4])
  })

  test("facing accepts a caller up vector and keeps position", () => {
    const result = solveSpatialRelations({
      goals: [{ entityKey: "entity_a", relations: [{ kind: "facing", target: "entity_b", up: [0, 0, 1] }] }],
      bases: { entity_a: base([5, 0, 0]), entity_b: base([0, 0, 0]) },
    })
    const solved = result.transforms.entity_a!
    expect(solved.position).toEqual([5, 0, 0])
    expect(Math.hypot(...solved.rotation)).toBeCloseTo(1, 6)
  })

  test("cyclic goals reject naming the concrete cycle", () => {
    const bases = {
      entity_a: base([0, 0, 0], UNIT_BOX),
      entity_b: base([0, 0, 0], UNIT_BOX),
      entity_c: base([0, 0, 0], UNIT_BOX),
    }
    const two = solveError({
      goals: [
        { entityKey: "entity_a", relations: [{ kind: "onTopOf", target: "entity_b" }] },
        { entityKey: "entity_b", relations: [{ kind: "onTopOf", target: "entity_a" }] },
        { entityKey: "entity_c", relations: [{ kind: "at", position: [1, 1, 1] }] },
      ],
      bases,
    })
    expect(two.code).toBe("relation-cycle")
    expect(two.message).toContain("entity_a")
    expect(two.message).toContain("entity_b")
    const self = solveError({
      goals: [{ entityKey: "entity_a", relations: [{ kind: "facing", target: "entity_a" }] }],
      bases,
    })
    expect(self.code).toBe("relation-cycle")
    expect(self.message).toContain("entity_a → entity_a")
    const three = solveError({
      goals: [
        { entityKey: "entity_a", relations: [{ kind: "onTopOf", target: "entity_b" }] },
        { entityKey: "entity_b", relations: [{ kind: "onTopOf", target: "entity_c" }] },
        { entityKey: "entity_c", relations: [{ kind: "onTopOf", target: "entity_a" }] },
      ],
      bases,
    })
    expect(three.code).toBe("relation-cycle")
    expect(three.message).toContain("entity_a")
    expect(three.message).toContain("entity_c")
  })

  test("unknown keys and missing bounds reject with typed errors naming the entity", () => {
    const missingTarget = solveError({
      goals: [{ entityKey: "entity_a", relations: [{ kind: "onTopOf", target: "entity_ghost" }] }],
      bases: { entity_a: base([0, 0, 0], UNIT_BOX) },
    })
    expect(missingTarget.code).toBe("unknown-entity")
    expect(missingTarget.message).toContain("entity_ghost")
    expect(missingTarget.path).toContain("relations[0]")

    const missingGoalBase = solveError({
      goals: [{ entityKey: "entity_a", relations: [{ kind: "at", position: [0, 0, 0] }] }],
      bases: {},
    })
    expect(missingGoalBase.code).toBe("unknown-entity")
    expect(missingGoalBase.message).toContain("entity_a")

    const missingMoverBounds = solveError({
      goals: [{ entityKey: "entity_a", relations: [{ kind: "onTopOf", target: "entity_b" }] }],
      bases: { entity_a: base([0, 0, 0]), entity_b: base([0, 0, 0], UNIT_BOX) },
    })
    expect(missingMoverBounds.code).toBe("bounds-unknown")
    expect(missingMoverBounds.message).toContain("entity_a")

    const missingTargetBounds = solveError({
      goals: [{ entityKey: "entity_a", relations: [{ kind: "nextTo", target: "entity_b" }] }],
      bases: { entity_a: base([0, 0, 0], UNIT_BOX), entity_b: base([0, 0, 0]) },
    })
    expect(missingTargetBounds.code).toBe("bounds-unknown")
    expect(missingTargetBounds.message).toContain("entity_b")

    const duplicate = solveError({
      goals: [
        { entityKey: "entity_a", relations: [{ kind: "at", position: [0, 0, 0] }] },
        { entityKey: "entity_a", relations: [{ kind: "at", position: [1, 1, 1] }] },
      ],
      bases: { entity_a: base([0, 0, 0]) },
    })
    expect(duplicate.code).toBe("duplicate-goal")

    const impossible = solveError({
      goals: [{ entityKey: "entity_a", relations: [{ kind: "facing", target: "entity_b" }] }],
      bases: { entity_a: base([0, 0, 0]), entity_b: base([0, 0, 0]) },
    })
    expect(impossible.code).toBe("relation-failed")
    expect(impossible.message).toContain("facing")
  })

  test("the emitted patch parses the contract schema and carries set-transform ops", () => {
    const result = solveSpatialRelations({
      goals: [{ entityKey: "entity_a", relations: [{ kind: "groundSnap" }] }],
      bases: { entity_a: base([0, 3, 0], UNIT_BOX) },
    })
    const patch = parseSpatialValue(SpatialScenePatchV1Schema, result.patch, "patch")
    expect(patch.operations).toHaveLength(1)
    expect(patch.operations[0]).toMatchObject({ kind: "set-transform", entityId: "entity_a" })
    expect(patch.expectedSceneSha256).toMatch(/^[a-f0-9]{64}$/u)
  })

  test("schema bounds cap goals, relations, and malformed input", () => {
    const goal = { entityKey: "entity_a", relations: [{ kind: "at" as const, position: [0, 0, 0] }] }
    expect(() => solveSpatialRelations({
      goals: Array.from({ length: 65 }, () => goal),
      bases: { entity_a: base([0, 0, 0]) },
    })).toThrow(SpatialSolveError)
    expect(() => solveSpatialRelations({
      goals: [{ entityKey: "entity_a", relations: Array.from({ length: 9 }, () => ({ kind: "at", position: [0, 0, 0] })) }],
      bases: { entity_a: base([0, 0, 0]) },
    })).toThrow(SpatialSolveError)
    for (const bad of [null, 42, { goals: [] }, { goals: [{ entityKey: "not-an-entity", relations: [{ kind: "at", position: [0, 0, 0] }] }], bases: {} }]) {
      const error = solveError(bad as SpatialSolveRequest)
      expect(error.code).toBe("invalid-data")
    }
  })

  test("identical inputs produce byte-identical output under bases permutation", () => {
    fc.assert(fc.property(
      fc.integer({ min: 0, max: 0xffff_ffff }),
      fc.integer({ min: -50, max: 50 }),
      (seed, gap) => {
        const bases: Record<string, unknown> = {}
        // Permute base insertion order deterministically from the seed.
        const keys = ["entity_a", "entity_b", "entity_c", "camera_hero"]
        for (const key of [...keys].sort((a, b) => ((a.charCodeAt(7) + seed) % 5) - ((b.charCodeAt(7) + seed) % 5))) {
          bases[key] = base([seed % 7, 0, 0], key === "camera_hero" ? undefined : UNIT_BOX)
        }
        const request = {
          goals: [
            { entityKey: "entity_a", relations: [{ kind: "onTopOf" as const, target: "entity_b" }] },
            { entityKey: "entity_b", relations: [{ kind: "nextTo" as const, target: "entity_c", gap }] },
            { entityKey: "entity_c", relations: [{ kind: "facing" as const, target: "camera_hero" }] },
          ],
          bases,
        }
        // Deterministic equivalence covers both success and typed failure.
        const attempt = (input: unknown): string => {
          try {
            return `ok:${JSON.stringify(solveSpatialRelations(input))}`
          } catch (error) {
            const failure = error as SpatialSolveError
            return `err:${failure.code}:${failure.path}:${failure.message}`
          }
        }
        expect(attempt(request)).toBe(attempt(JSON.parse(JSON.stringify(request))))
      },
    ), { numRuns: 40, seed: 7413 })
  })

  test("transforms record preserves declared goal order", () => {
    const result = solveSpatialRelations({
      goals: [
        { entityKey: "entity_z", relations: [{ kind: "at", position: [0, 0, 0] }] },
        { entityKey: "entity_a", relations: [{ kind: "at", position: [1, 1, 1] }] },
      ],
      bases: { entity_z: base([9, 9, 9]), entity_a: base([8, 8, 8]) },
    })
    expect(Object.keys(result.transforms)).toEqual(["entity_z", "entity_a"])
    expect(result.patch.operations.map(operation => operation.kind === "set-transform" ? operation.entityId : operation.kind)).toEqual(["entity_z", "entity_a"])
  })
})
