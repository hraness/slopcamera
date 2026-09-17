import { describe, expect, test } from "bun:test"
import fc from "fast-check"
import {
  align, column, distribute, easeChannel, easeKeys, facing, frameFitPose, grid, groundSnap,
  lookAtPose, nextTo, onTopOf, orbitKeys, perspectiveFromFov, row, scatter, stack,
  type SpatialLayoutEntry,
} from "./build.js"
import { SpatialAnimationSchema, type SpatialEntity } from "./contracts.js"
import { evaluateSpatialScene } from "./evaluate.js"
import { parseSpatialScene, parseSpatialValue } from "./identity.js"
import {
  cameraMathView, composeTransform, projectPoint, slerpQuaternion,
  type Bounds, type Quaternion, type Transform, type Vec3,
} from "./math.js"
import { fixtureTransform } from "./test-fixture.js"

const PROJECTION = { kind: "perspective", width: 640, height: 480, fx: 500, fy: 500, cx: 320, cy: 240, near: 0.1, far: 100 } as const

function viewOf(pose: { position: Vec3; rotation: Quaternion }) {
  return { projection: PROJECTION, cameraToWorld: composeTransform({ ...pose, scale: [1, 1, 1] }) }
}

function entry(entityId: string, position: Vec3, bounds?: Bounds): SpatialLayoutEntry {
  const transform: Transform = { ...fixtureTransform, position }
  return bounds === undefined ? { entityId, transform } : { entityId, transform, bounds }
}

const UNIT_BOX: Bounds = { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] }

describe("perspectiveFromFov", () => {
  test("horizontal fov derives square-pixel intrinsics centered by default", () => {
    const p = perspectiveFromFov({ fovDeg: 90, width: 960, height: 540, near: 0.1, far: 100 })
    if (p.kind !== "perspective") throw new Error("expected a perspective projection")
    expect(p).toMatchObject({ kind: "perspective", width: 960, height: 540, cx: 480, cy: 270, near: 0.1, far: 100 })
    expect(p.fx).toBeCloseTo(480, 10)
    expect(p.fy).toBe(p.fx)
    const narrow = perspectiveFromFov({ fovDeg: 60, width: 960, height: 540, near: 0.1, far: 100 })
    if (narrow.kind !== "perspective") throw new Error("expected a perspective projection")
    expect(narrow.fx).toBeCloseTo(480 / Math.tan(Math.PI / 6), 9)
    const offset = perspectiveFromFov({ fovDeg: 50, width: 640, height: 480, near: 0.1, far: 100, cx: 100, cy: 400 })
    expect(offset).toMatchObject({ cx: 100, cy: 400 })
    for (const bad of [0, -10, 180, 270, NaN]) {
      expect(() => perspectiveFromFov({ fovDeg: bad, width: 960, height: 540, near: 0.1, far: 100 })).toThrow(RangeError)
    }
  })
})

describe("lookAtPose", () => {
  test("seeded positions keep the target on the principal point", () => {
    fc.assert(fc.property(
      fc.tuple(
        fc.tuple(fc.double({ min: -20, max: 20, noNaN: true }), fc.double({ min: -20, max: 20, noNaN: true }), fc.double({ min: -20, max: 20, noNaN: true })),
        fc.tuple(fc.double({ min: -20, max: 20, noNaN: true }), fc.double({ min: -20, max: 20, noNaN: true }), fc.double({ min: -20, max: 20, noNaN: true })),
      ),
      ([position, target]) => {
        fc.pre(Math.hypot(position[0] - target[0], position[1] - target[1], position[2] - target[2]) > 0.5)
        fc.pre(Math.abs(position[1] - target[1]) < 0.95 * Math.hypot(position[0] - target[0], position[1] - target[1], position[2] - target[2]))
        const pose = lookAtPose(position as Vec3, target as Vec3)
        const projected = projectPoint(viewOf(pose), target as Vec3)
        expect(projected).not.toBeNull()
        expect(projected!.pixel[0]).toBeCloseTo(320, 5)
        expect(projected!.pixel[1]).toBeCloseTo(240, 5)
      },
    ), { numRuns: 200, seed: 7411 })
  })

  test("straight-down and straight-up views fall back to the least-aligned axis", () => {
    for (const position of [[0, 5, 0], [0, -5, 0]] as const) {
      const pose = lookAtPose(position as unknown as Vec3, [0, 0, 0])
      const projected = projectPoint(viewOf(pose), [0, 0, 0])
      expect(projected).not.toBeNull()
      expect(projected!.pixel[0]).toBeCloseTo(320, 6)
      expect(projected!.pixel[1]).toBeCloseTo(240, 6)
    }
    expect(lookAtPose([0, 0, 5], [0, 0, 0]).rotation).toEqual([0, 0, 0, 1])
    const turned = lookAtPose([5, 0, 0], [0, 0, 0])
    expect(turned.rotation[1]).toBeCloseTo(Math.SQRT1_2, 9)
    expect(turned.rotation[3]).toBeCloseTo(Math.SQRT1_2, 9)
    expect(() => lookAtPose([1, 1, 1], [1, 1, 1])).toThrow(RangeError)
    expect(() => lookAtPose([0, 0, 5], [0, 0, 0], [0, 0, 0])).toThrow(RangeError)
  })
})

describe("easeKeys", () => {
  test("bakes 25 monotone keys on a 4s span with exact endpoints", () => {
    const keys = easeKeys({ from: 0.2, to: 0.9, durationUs: 4_000_000, easing: "ease-in-out" })
    expect(keys).toHaveLength(25)
    expect(keys[0]).toEqual({ timeUs: 0, value: 0.2 })
    expect(keys.at(-1)).toEqual({ timeUs: 4_000_000, value: 0.9 })
    for (let index = 1; index < keys.length; index++) {
      expect(keys[index]!.timeUs).toBeGreaterThan(keys[index - 1]!.timeUs)
      expect(keys[index]!.value).toBeGreaterThanOrEqual(keys[index - 1]!.value)
    }
    expect(keys.find(key => key.timeUs === 2_000_000)!.value).toBeCloseTo(0.55, 9)
    const reversed = easeKeys({ from: 0.9, to: 0.2, durationUs: 4_000_000, easing: "ease-in" })
    for (let index = 1; index < reversed.length; index++) {
      expect(reversed[index]!.value).toBeLessThanOrEqual(reversed[index - 1]!.value)
    }
  })

  test("piecewise-linear playback stays under one percent of the true eased parameter", () => {
    fc.assert(fc.property(
      fc.constantFrom("ease-in", "ease-out", "ease-in-out"),
      (easingName) => {
        const keys = easeKeys({ from: 0, to: 1, durationUs: 4_000_000, easing: easingName })
        const curve = easingName === "ease-in" ? (t: number) => t * t * t
          : easingName === "ease-out" ? (t: number) => 1 - (1 - t) ** 3
          : (t: number) => t * t * (3 - 2 * t)
        for (let index = 1; index < keys.length; index++) {
          const a = keys[index - 1]!, b = keys[index]!
          for (const fraction of [0.25, 0.5, 0.75]) {
            const time = a.timeUs + (b.timeUs - a.timeUs) * fraction
            const sampled = a.value + (b.value - a.value) * fraction
            expect(Math.abs(sampled - curve(time / 4_000_000))).toBeLessThan(0.005)
          }
        }
      },
    ), { numRuns: 9, seed: 7412 })
  })

  test("vec3 and quaternion variants lerp and slerp the eased parameter", () => {
    const vec = easeKeys({ from: [0, 0, 0], to: [10, -4, 2], durationUs: 1_000_000, easing: "ease-out" })
    expect(vec[0]!.value).toEqual([0, 0, 0])
    expect(vec.at(-1)!.value).toEqual([10, -4, 2])
    expect(vec[0]!.timeUs).toBe(0)
    expect(vec.at(-1)!.timeUs).toBe(1_000_000)
    const rotations = easeKeys({ from: [0, 0, 0, 1], to: [0, 1, 0, 0], durationUs: 1_000_000, easing: "linear", segments: 4 })
    expect(rotations).toHaveLength(5)
    expect(rotations[0]!.value).toEqual([0, 0, 0, 1])
    expect(rotations.at(-1)!.value).toEqual([0, 1, 0, 0])
    for (const key of rotations) expect(Math.hypot(...key.value)).toBeCloseTo(1, 6)
    expect(rotations[2]!.value[1]).toBeCloseTo(Math.SQRT1_2, 9)
    expect(rotations[2]!.value[3]).toBeCloseTo(Math.SQRT1_2, 9)
  })

  test("sub-segment durations still emit strictly ordered keys with exact endpoints", () => {
    const keys = easeKeys({ from: 0, to: 1, durationUs: 10, easing: "linear" })
    expect(keys[0]).toEqual({ timeUs: 0, value: 0 })
    expect(keys.at(-1)).toEqual({ timeUs: 10, value: 1 })
    for (let index = 1; index < keys.length; index++) expect(keys[index]!.timeUs).toBeGreaterThan(keys[index - 1]!.timeUs)
    expect(keys.length).toBeLessThanOrEqual(11)
  })

  test("round-trips through SpatialAnimationSchema for every property kind", () => {
    const channels = [
      easeChannel({ channelId: "channel_opacity", targetId: "entity_box", property: "opacity", from: 0, to: 1, durationUs: 2_000_000, easing: "ease-in-out" }),
      easeChannel({ channelId: "channel_move", targetId: "entity_box", property: "position", from: [0, 0, 0], to: [3, 1, -2], durationUs: 2_000_000, easing: "ease-out" }),
      easeChannel({ channelId: "channel_grow", targetId: "entity_box", property: "scale", from: [1, 1, 1], to: [2, 2, 2], durationUs: 2_000_000, easing: "linear" }),
      easeChannel({ channelId: "channel_turn", targetId: "entity_box", property: "rotation", from: [0, 0, 0, 1], to: [0, Math.SQRT1_2, 0, Math.SQRT1_2], durationUs: 2_000_000, easing: "ease-in-out" }),
    ]
    expect(channels.map(channel => channel.interpolation)).toEqual(["linear", "linear", "linear", "slerp"])
    for (const channel of channels) {
      const parsed = parseSpatialValue(SpatialAnimationSchema, channel, "channel")
      expect(parsed.keys.length).toBeGreaterThanOrEqual(17)
    }
  })

  test("rejects invalid input shapes and out-of-contract ranges", () => {
    expect(() => easeKeys({ from: 0, to: 1, durationUs: 0, easing: "linear" })).toThrow(RangeError)
    expect(() => easeKeys({ from: 0, to: 1, durationUs: 1_000, easing: "linear", segments: 0 })).toThrow(RangeError)
    expect(() => easeKeys({ from: 0, to: 1, durationUs: 1_000, easing: "bounce" as never })).toThrow(RangeError)
    expect(() => easeKeys({ from: -0.5, to: 1, durationUs: 1_000, easing: "linear" })).toThrow()
    expect(() => easeKeys({ from: [0, 0, 0] as Vec3, to: [0, 0, 0, 1] as unknown as Vec3, durationUs: 1_000, easing: "linear" })).toThrow(RangeError)
    expect(() => easeKeys({ from: 0, to: 1, durationUs: 3_600_000_001, easing: "linear" })).toThrow(RangeError)
  })
})

describe("layout helpers", () => {
  test("align places bounds edges on shared min, max, and center references", () => {
    const items = [entry("entity_a", [1, 0, 0], UNIT_BOX), entry("entity_b", [3, 0, 0], UNIT_BOX), entry("entity_c", [5, 0, 0], UNIT_BOX)]
    expect(align(items, "x", "min").map(item => item.position[0])).toEqual([1, 1, 1])
    expect(align(items, "x", "max").map(item => item.position[0])).toEqual([5, 5, 5])
    expect(align(items, "x", "center").map(item => item.position[0])).toEqual([3, 3, 3])
    expect(align([entry("entity_a", [1, 0, 0]), entry("entity_b", [4, 0, 0])], "x", "min").map(item => item.position[0])).toEqual([1, 1])
    expect(align([], "x", "min")).toEqual([])
  })

  test("distribute gap anchors the first entry and preserves bounds-aware spacing", () => {
    const items = [entry("entity_a", [10, 0, 0], UNIT_BOX), entry("entity_b", [0, 0, 0], UNIT_BOX), entry("entity_c", [2, 0, 0], UNIT_BOX)]
    const spaced = distribute(items, "x", { gap: 1 })
    expect(spaced[0]!.position[0]).toBeCloseTo(4, 9)
    expect(spaced[1]!.position[0]).toBeCloseTo(0, 9)
    expect(spaced[2]!.position[0]).toBeCloseTo(2, 9)
    const points = distribute([entry("entity_a", [0, 0, 0]), entry("entity_b", [9, 0, 0]), entry("entity_c", [3, 0, 0])], "x", { gap: 2 })
    expect(points.map(item => item.position[0])).toEqual([0, 4, 2])
    const stretched = distribute(items, "x", { span: 8 })
    expect(stretched[1]!.position[0]).toBeCloseTo(0, 9)
    expect(stretched[2]!.position[0]).toBeCloseTo(3.5, 9)
    expect(stretched[0]!.position[0]).toBeCloseTo(7, 9)
    expect(distribute([entry("entity_a", [5, 0, 0])], "x", { gap: 1 })[0]!.position[0]).toBe(5)
  })

  test("row, column and stack distribute on x, y and z", () => {
    const items = [entry("entity_a", [0, 0, 0]), entry("entity_b", [5, 5, 5])]
    expect(row(items, { gap: 3 })[1]!.position).toEqual([3, 5, 5])
    expect(column(items, { gap: 3 })[1]!.position).toEqual([5, 3, 5])
    expect(stack(items, { gap: 3 })[1]!.position).toEqual([5, 5, 3])
  })

  test("grid emits row-major ground-plane positions with exact spacing", () => {
    expect(grid({ rows: 2, columns: 3, cellSize: 2, origin: [1, 0, 5] })).toEqual([
      [1, 0, 5], [3, 0, 5], [5, 0, 5], [1, 0, 7], [3, 0, 7], [5, 0, 7],
    ])
    expect(grid({ rows: 1, columns: 3, cellSize: [1, 3] })).toEqual([[0, 0, 0], [1, 0, 0], [2, 0, 0]])
    expect(grid({ rows: 3, columns: 1, cellSize: [1, 2] })).toEqual([[0, 0, 0], [0, 0, 2], [0, 0, 4]])
    expect(() => grid({ rows: 0, columns: 2, cellSize: 1 })).toThrow(RangeError)
    expect(() => grid({ rows: 100, columns: 100, cellSize: 1 })).toThrow(RangeError)
  })
})

describe("placement helpers", () => {
  test("groundSnap rests the underside on the floor plane", () => {
    const snapped = groundSnap({ ...fixtureTransform, position: [1, 9, 2] }, 0.5, -1)
    expect(snapped.position).toEqual([1, -0.5, 2])
    expect(groundSnap({ ...fixtureTransform, position: [1, 9, 2] }, 0.5).position[1]).toBe(0.5)
    expect(() => groundSnap(fixtureTransform, -0.5)).toThrow(RangeError)
  })

  test("scatter is deterministic per seed and honors minimum spacing", () => {
    const region = { minX: -4, maxX: 4, minZ: -2, maxZ: 2 }
    const first = scatter({ seed: 42, count: 24, region, minSpacing: 0.75 })
    const second = scatter({ seed: 42, count: 24, region, minSpacing: 0.75 })
    expect(first).toEqual(second)
    expect(first).toHaveLength(24)
    for (let a = 0; a < first.length; a++) {
      for (let b = a + 1; b < first.length; b++) {
        const distance = Math.hypot(first[a]![0] - first[b]![0], first[a]![2] - first[b]![2])
        expect(distance).toBeGreaterThanOrEqual(0.75 - 1e-9)
      }
      expect(first[a]![0]).toBeGreaterThanOrEqual(-4)
      expect(first[a]![0]).toBeLessThanOrEqual(4)
      expect(first[a]![1]).toBe(0)
    }
    expect(scatter({ seed: 7, count: 8, region })).not.toEqual(scatter({ seed: 8, count: 8, region }))
    expect(scatter({ seed: 0, count: 0, region })).toEqual([])
    expect(() => scatter({ seed: 1, count: 50, region: { minX: 0, maxX: 0.1, minZ: 0, maxZ: 0.1 }, minSpacing: 1 })).toThrow(RangeError)
    const instanced = scatter({
      seed: 42, count: 3, region,
      instanced: true,
      entity: { entityId: "entity_scattered", name: "Scattered", geometry: { kind: "box", size: [1, 1, 1] }, material: { kind: "unlit", color: "#ffffff", opacity: 1 } },
    }) as Extract<SpatialEntity, { kind: "mesh" }>
    expect(instanced.kind).toBe("mesh")
    expect(instanced.instances).toHaveLength(3)
    expect(instanced.instances).toEqual(scatter({ seed: 42, count: 3, region }).map(([x, , z]) => ({ position: [x, 0, z], rotation: [0, 0, 0, 1], scale: [1, 1, 1] })))
  })

  test("onTopOf stacks centers horizontally and rests min-Y on the target's top", () => {
    const target: Bounds = { min: [-1, 0, -1], max: [1, 1, 1] }
    const placed = onTopOf(UNIT_BOX, { ...fixtureTransform, position: [5, 0, 5] }, target, fixtureTransform)
    expect(placed.position).toEqual([0, 1.5, 0])
    const elevated = onTopOf(UNIT_BOX, fixtureTransform, target, { ...fixtureTransform, position: [0, 0, 0], scale: [2, 2, 2] })
    expect(elevated.position[1]).toBeCloseTo(2.5, 9)
  })

  test("nextTo sits the mover beside the target with the remaining axes centered", () => {
    const target: Bounds = { min: [-1, 0, -1], max: [1, 1, 1] }
    const after = nextTo(UNIT_BOX, { ...fixtureTransform, position: [5, 0, 5] }, target, fixtureTransform, { axis: "x", gap: 0.5 })
    expect(after.position).toEqual([2, 0.5, 0])
    const before = nextTo(UNIT_BOX, { ...fixtureTransform, position: [0, 0, 0] }, target, fixtureTransform, { axis: "z", side: "before", gap: 0 })
    expect(before.position).toEqual([0, 0.5, -1.5])
  })

  test("facing turns local -Z toward the target without moving the origin", () => {
    const turned = facing({ ...fixtureTransform, position: [5, 0, 0] }, [0, 0, 0])
    expect(turned.position).toEqual([5, 0, 0])
    const projected = projectPoint({ projection: PROJECTION, cameraToWorld: composeTransform({ position: turned.position, rotation: turned.rotation, scale: [1, 1, 1] }) }, [0, 0, 0])
    expect(projected!.pixel[0]).toBeCloseTo(320, 6)
    expect(projected!.pixel[1]).toBeCloseTo(240, 6)
    expect(() => facing(fixtureTransform, [0, 0, 0])).toThrow(RangeError)
  })
})

describe("camera rigs", () => {
  test("orbitKeys closes a revolution and keeps the center on the principal point", () => {
    const orbit = orbitKeys({ center: [0, 0, 0], radius: 2, height: 1, durationUs: 4_000_000, revolutions: 1, segments: 4 })
    expect(orbit.position).toHaveLength(5)
    expect(orbit.rotation).toHaveLength(5)
    expect(orbit.position.map(key => key.timeUs)).toEqual([0, 1_000_000, 2_000_000, 3_000_000, 4_000_000])
    expect(orbit.position[0]!.value).toEqual([2, 1, 0])
    expect(orbit.position[1]!.value[0]).toBeCloseTo(0, 9)
    expect(orbit.position[1]!.value[2]).toBeCloseTo(2, 9)
    expect(orbit.position[2]!.value[0]).toBeCloseTo(-2, 9)
    expect(orbit.position[4]!.value).toEqual(orbit.position[0]!.value)
    for (const [index, key] of orbit.rotation.entries()) {
      const projected = projectPoint(viewOf({ position: orbit.position[index]!.value, rotation: key.value }), [0, 0, 0])
      expect(projected).not.toBeNull()
      expect(projected!.pixel[0]).toBeCloseTo(320, 5)
      expect(projected!.pixel[1]).toBeCloseTo(240, 5)
    }
    expect(() => orbitKeys({ center: [0, 0, 0], radius: -1, durationUs: 1_000 })).toThrow(RangeError)
    expect(() => orbitKeys({ center: [0, 0, 0], radius: 0, durationUs: 1_000 })).toThrow(RangeError)
  })

  test("frameFitPose frames every bounds corner inside the margin-shrunken image", () => {
    const projection = perspectiveFromFov({ fovDeg: 60, width: 960, height: 540, near: 0.1, far: 100 })
    const bounds: Bounds = { min: [-1, -0.5, -1], max: [1, 0.5, 1] }
    const pose = frameFitPose(bounds, projection, 0.1)
    expect(pose.position[0]).toBeCloseTo(0, 9)
    expect(pose.position[1]).toBeCloseTo(0, 9)
    const camera = { projection, cameraToWorld: composeTransform({ ...pose, scale: [1, 1, 1] }) }
    for (let mask = 0; mask < 8; mask++) {
      const corner: Vec3 = [mask & 1 ? bounds.max[0] : bounds.min[0], mask & 2 ? bounds.max[1] : bounds.min[1], mask & 4 ? bounds.max[2] : bounds.min[2]]
      const projected = projectPoint(camera, corner)!
      expect(projected.insideImage).toBe(true)
      expect(projected.insideClip).toBe(true)
      expect(projected.pixel[0]).toBeGreaterThanOrEqual(48 - 1e-6)
      expect(projected.pixel[0]).toBeLessThanOrEqual(960 - 48 + 1e-6)
      expect(projected.pixel[1]).toBeGreaterThanOrEqual(27 - 1e-6)
      expect(projected.pixel[1]).toBeLessThanOrEqual(540 - 27 + 1e-6)
    }
    const rotated = frameFitPose({ min: [-2, -1, -3], max: [0, 1, -1] }, projection)
    expect(rotated.position[2]).toBeGreaterThan(-1)
    const orthographic = { kind: "orthographic", width: 640, height: 480, left: -4, right: 4, bottom: -3, top: 3, near: 0.5, far: 50 } as const
    const fitted = frameFitPose({ min: [-1, -1, -1], max: [1, 1, 1] }, orthographic)
    expect(fitted.position[2]).toBeCloseTo(1 + 0.5, 6)
    expect(() => frameFitPose({ min: [-10, 0, 0], max: [10, 0, 0] }, orthographic)).toThrow(RangeError)
    expect(() => frameFitPose(bounds, projection, 1.5)).toThrow(RangeError)
  })
})

describe("hybrid-scene replacement", () => {
  test("helper-built lookAt plus eased camera move parses and evaluates in a real scene", () => {
    const projection = perspectiveFromFov({ fovDeg: 62, width: 720, height: 1280, near: 0.03, far: 100 })
    const start = lookAtPose([2.3, 1.47, 1.2255], [2.3, 1.47, -0.837])
    const end = lookAtPose([4.5, 2.7, 4.4], [1.95, 1.57, -0.837])
    const scene = parseSpatialScene({
      kind: "slopcamera.spatial-scene", schemaVersion: 1, sceneId: "scene_helper_reveal",
      coordinates: "right-handed-y-up-meters", durationUs: 4_000_000,
      entities: [{
        entityId: "entity_panel", name: "Panel", kind: "mesh", parentId: null,
        placement: { kind: "world" }, origin: { kind: "authored" }, visible: true,
        transform: { position: [2.3, 1.47, -0.837], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
        geometry: { kind: "box", size: [1.35, 2.4, 0.07] }, material: { kind: "unlit", color: "#091723", opacity: 1 },
      }],
      cameras: [{ cameraId: "camera_hero", name: "Hero", pose: start, projection }],
      animations: [
        easeChannel({ channelId: "channel_reveal_position", targetId: "camera_hero", property: "position", from: start.position, to: end.position, durationUs: 4_000_000, easing: "ease-in-out" }),
        easeChannel({ channelId: "channel_reveal_rotation", targetId: "camera_hero", property: "rotation", from: start.rotation, to: end.rotation, durationUs: 4_000_000, easing: "ease-in-out" }),
      ],
      assets: [], generators: [], overrides: [],
    })
    expect(scene.animations[0]!.keys).toHaveLength(25)
    const atStart = evaluateSpatialScene(scene, { timeUs: 0, cameraId: "camera_hero" })
    const atMid = evaluateSpatialScene(scene, { timeUs: 2_000_000, cameraId: "camera_hero" })
    const atEnd = evaluateSpatialScene(scene, { timeUs: 4_000_000, cameraId: "camera_hero" })
    atStart.camera.pose.position.forEach((component, index) => expect(component).toBeCloseTo(start.position[index]!, 12))
    atStart.camera.pose.rotation.forEach((component, index) => expect(component).toBeCloseTo(start.rotation[index]!, 12))
    atEnd.camera.pose.position.forEach((component, index) => expect(component).toBeCloseTo(end.position[index]!, 12))
    atEnd.camera.pose.rotation.forEach((component, index) => expect(component).toBeCloseTo(end.rotation[index]!, 12))
    const midPosition = start.position.map((component, index) => component + (end.position[index]! - component) / 2)
    atMid.camera.pose.position.forEach((component, index) => expect(component).toBeCloseTo(midPosition[index]!, 9))
    const midRotation = slerpQuaternion(start.rotation, end.rotation, 0.5)
    atMid.camera.pose.rotation.forEach((component, index) => expect(component).toBeCloseTo(midRotation[index]!, 9))
    const startView = cameraMathView(atStart.camera)
    const projected = projectPoint(startView, [2.3, 1.47, -0.837])!
    expect(projected.pixel[0]).toBeCloseTo(360, 6)
    expect(projected.pixel[1]).toBeCloseTo(640, 6)
    const endView = cameraMathView(atEnd.camera)
    const projectedEnd = projectPoint(endView, [1.95, 1.57, -0.837])!
    expect(projectedEnd.pixel[0]).toBeCloseTo(360, 6)
    expect(projectedEnd.pixel[1]).toBeCloseTo(640, 6)
  })
})
