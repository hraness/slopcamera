import { z } from "zod"
import { deepFreezeJson } from "../code/json-snapshot.js"
import {
  SPATIAL_SCENE_LIMITS, SpatialAnimationSchema, SpatialPoseSchema, SpatialProjectionSchema, SpatialQuaternionSchema,
  SpatialTimeUsSchema, SpatialTransformSchema, SpatialVec3Schema,
  type SpatialAnimation, type SpatialPose, type SpatialProjection, type SpatialTransform,
} from "./contracts.js"
import { parseSpatialValue } from "./identity.js"
import {
  composeTransform, normalizeQuaternion, slerpQuaternion, transformBounds,
  type Bounds, type Quaternion, type Transform, type Vec3,
} from "./math.js"

/**
 * Pure spatial authoring helpers. Every emitted value is parsed through the v1
 * contract schemas before it is returned; nothing here reads files, executes
 * authored source, or touches a renderer. Conventions: right-handed Y-up meters,
 * camera-local -Z forward, XYZW unit quaternions, integer-microsecond times.
 * `perspectiveFromFov` treats fovDeg as the HORIZONTAL field of view and derives
 * square-pixel fx = fy = (width/2) / tan(fov/2); the vertical field of view
 * follows from the aspect ratio. `easeKeys` defaults to ~6 segments per second
 * clamped to [16, 64] segments (25 baked keys on a 4 s span). Measured maximum
 * eased-parameter error vs the true curve on a 4 s ease-in-out/ease-out span:
 * 16 keys 0.32%, 25 keys 0.13%, 33 keys 0.07%, 65 keys 0.02%; 9 keys already
 * fails the ~1% bar at 1.10%, so 25 keys is the smallest in-band default.
 */

export type SpatialAxis = "x" | "y" | "z"
export type SpatialEasing = "linear" | "ease-in" | "ease-out" | "ease-in-out"
export interface SpatialBakedKey<Value> { readonly timeUs: number; readonly value: Value }
export interface SpatialLayoutEntry {
  readonly entityId: string
  readonly transform: Transform
  readonly bounds?: Bounds
}

const AXIS_INDEX: Record<SpatialAxis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 }
const WORLD_UP: Vec3 = [0, 1, 0]
const DEG = Math.PI / 180
const SCATTER_MAX_ATTEMPTS = 128

const scalarKeySchema = z.strictObject({ timeUs: SpatialTimeUsSchema, value: z.number().finite().min(0).max(1) })
const vec3KeySchema = z.strictObject({ timeUs: SpatialTimeUsSchema, value: SpatialVec3Schema })
const quaternionKeySchema = z.strictObject({ timeUs: SpatialTimeUsSchema, value: SpatialQuaternionSchema })

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`)
  return value
}

function vec3(value: Vec3, label: string): Vec3 {
  if (!Array.isArray(value) || value.length !== 3) throw new RangeError(`${label} must have 3 components`)
  for (let index = 0; index < 3; index++) finite(value[index]!, `${label}[${index}]`)
  return value
}

function quaternion(value: Quaternion, label: string): Quaternion {
  if (!Array.isArray(value) || value.length !== 4) throw new RangeError(`${label} must have 4 components`)
  for (let index = 0; index < 4; index++) finite(value[index]!, `${label}[${index}]`)
  return value
}

function timeUs(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > SPATIAL_SCENE_LIMITS.durationUs) {
    throw new RangeError(`${label} must be an integer microsecond within [0, ${SPATIAL_SCENE_LIMITS.durationUs}]`)
  }
  return value
}

function segments(value: number | undefined, durationUs: number): number {
  if (value === undefined) return Math.min(64, Math.max(16, Math.ceil(durationUs / 166_667)))
  if (!Number.isSafeInteger(value) || value < 1 || value > SPATIAL_SCENE_LIMITS.keysPerChannel - 1) {
    throw new RangeError(`segments must be an integer within [1, ${SPATIAL_SCENE_LIMITS.keysPerChannel - 1}]`)
  }
  return value
}

function bounds(value: Bounds, label: string): Bounds {
  vec3(value.min, `${label}.min`); vec3(value.max, `${label}.max`)
  if (value.min.some((part, index) => part > value.max[index]!)) throw new RangeError(`${label} requires min <= max`)
  return value
}

function transform(value: Transform, label: string): Transform {
  vec3(value.position, `${label}.position`); quaternion(value.rotation, `${label}.rotation`); vec3(value.scale, `${label}.scale`)
  return value
}

/** Normalize, then clamp components into [-1, 1] for the contract's per-component bound. */
function unitQuaternion(value: Quaternion): Quaternion {
  return normalizeQuaternion(value).map(component => Math.min(1, Math.max(-1, component))) as unknown as Quaternion
}

function emitTransform(input: Transform): SpatialTransform {
  return deepFreezeJson(parseSpatialValue(SpatialTransformSchema, {
    position: [...input.position], rotation: unitQuaternion(input.rotation), scale: [...input.scale],
  }, "transform"))
}

function emitPose(position: Vec3, rotation: Quaternion): SpatialPose {
  return deepFreezeJson(parseSpatialValue(SpatialPoseSchema, { position: [...position], rotation }, "pose"))
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

/** Orthonormal basis (columns x, y, z) to a contract-safe unit quaternion. */
function quaternionFromBasis(xAxis: Vec3, yAxis: Vec3, zAxis: Vec3): Quaternion {
  const [m00, m01, m02] = [xAxis[0], yAxis[0], zAxis[0]]
  const [m10, m11, m12] = [xAxis[1], yAxis[1], zAxis[1]]
  const [m20, m21, m22] = [xAxis[2], yAxis[2], zAxis[2]]
  const trace = m00 + m11 + m22
  let q: number[]
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2
    q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4]
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2
    q = [s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2
    q = [(m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 - m20) / s]
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2
    q = [(m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s]
  }
  return unitQuaternion(q as unknown as Quaternion)
}

/** Rotation whose local -Z points from position toward target; local +Y stays near `up`. */
function lookRotation(position: Vec3, target: Vec3, up: Vec3): Quaternion {
  const back = subtract(position, target)
  const backLength = Math.hypot(...back)
  if (backLength === 0) throw new RangeError("position and target must differ")
  const zAxis = back.map(component => component / backLength) as unknown as Vec3
  const right = cross(up, zAxis)
  const rightLength = Math.hypot(...right)
  let xAxis: Vec3
  if (rightLength < 1e-12) {
    const candidates: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
    const fallback = candidates.reduce((best, axis) =>
      Math.abs(axis[0] * zAxis[0] + axis[1] * zAxis[1] + axis[2] * zAxis[2])
      < Math.abs(best[0] * zAxis[0] + best[1] * zAxis[1] + best[2] * zAxis[2]) ? axis : best)
    const retry = cross(fallback, zAxis)
    const retryLength = Math.hypot(...retry)
    xAxis = retry.map(component => component / retryLength) as unknown as Vec3
  } else {
    xAxis = right.map(component => component / rightLength) as unknown as Vec3
  }
  return quaternionFromBasis(xAxis, cross(zAxis, xAxis), zAxis)
}

const EASINGS: Record<SpatialEasing, (t: number) => number> = {
  "linear": t => t,
  "ease-in": t => t * t * t,
  "ease-out": t => 1 - (1 - t) * (1 - t) * (1 - t),
  "ease-in-out": t => t * t * (3 - 2 * t),
}

/** [time, t] pairs: t stays the exact span fraction even when rounded times collapse. */
function keyTimes(startUs: number, durationUs: number, spans: number): [number, number][] {
  const times: [number, number][] = []
  for (let index = 0; index <= spans; index++) {
    const time = Math.round(startUs + (index / spans) * durationUs)
    if (times.length === 0 || time > times[times.length - 1]![0]) times.push([time, index / spans])
  }
  return times
}

export function perspectiveFromFov(input: {
  readonly fovDeg: number
  readonly width: number
  readonly height: number
  readonly near: number
  readonly far: number
  readonly cx?: number
  readonly cy?: number
}): SpatialProjection {
  const fov = finite(input.fovDeg, "fovDeg")
  if (fov <= 0 || fov >= 180) throw new RangeError("fovDeg must lie within (0, 180)")
  finite(input.near, "near"); finite(input.far, "far")
  const cx = input.cx ?? input.width / 2
  const cy = input.cy ?? input.height / 2
  const focal = input.width / 2 / Math.tan(fov / 2 * DEG)
  return deepFreezeJson(parseSpatialValue(SpatialProjectionSchema, {
    kind: "perspective", width: input.width, height: input.height,
    near: input.near, far: input.far, fx: focal, fy: focal, cx, cy,
  }, "projection"))
}

/** Camera pose looking down local -Z at target; default up is world +Y. */
export function lookAtPose(position: Vec3, target: Vec3, up: Vec3 = WORLD_UP): SpatialPose {
  vec3(position, "position"); vec3(target, "target"); vec3(up, "up")
  if (Math.hypot(...up) === 0) throw new RangeError("up must be nonzero")
  return emitPose(position, lookRotation(position, target, up))
}

export interface SpatialEaseInput<Value> {
  readonly from: Value
  readonly to: Value
  readonly durationUs: number
  readonly startUs?: number
  readonly easing: SpatialEasing
  readonly segments?: number
}

export function easeKeys(input: SpatialEaseInput<number>): readonly SpatialBakedKey<number>[]
export function easeKeys(input: SpatialEaseInput<Vec3>): readonly SpatialBakedKey<Vec3>[]
export function easeKeys(input: SpatialEaseInput<Quaternion>): readonly SpatialBakedKey<Quaternion>[]
export function easeKeys(input: SpatialEaseInput<number | Vec3 | Quaternion>): readonly SpatialBakedKey<number | Vec3 | Quaternion>[] {
  return bakeKeys(input)
}

function bakeKeys(input: SpatialEaseInput<number | Vec3 | Quaternion>): readonly SpatialBakedKey<number | Vec3 | Quaternion>[] {
  const startUs = timeUs(input.startUs ?? 0, "startUs")
  const duration = timeUs(input.durationUs, "durationUs")
  if (duration === 0) throw new RangeError("durationUs must be positive")
  timeUs(startUs + duration, "startUs + durationUs")
  const easing = EASINGS[input.easing]
  if (easing === undefined) throw new RangeError(`unsupported easing ${String(input.easing)}`)
  const spans = segments(input.segments, duration)
  const times = keyTimes(startUs, duration, spans)
  const from = input.from, to = input.to
  if (typeof from === "number" && typeof to === "number") {
    finite(from, "from"); finite(to, "to")
    return deepFreezeJson(times.map(([time, t]) => parseSpatialValue(scalarKeySchema, {
      timeUs: time, value: t === 0 ? from : t === 1 ? to : from + (to - from) * easing(t),
    }, "opacity key")))
  }
  if (Array.isArray(from) && Array.isArray(to) && from.length === 3 && to.length === 3) {
    const a = vec3(from as Vec3, "from"), b = vec3(to as Vec3, "to")
    return deepFreezeJson(times.map(([time, t]) => {
      const eased = easing(t)
      return parseSpatialValue(vec3KeySchema, {
        timeUs: time,
        value: t === 0 ? [...a] : t === 1 ? [...b]
          : [a[0] + (b[0] - a[0]) * eased, a[1] + (b[1] - a[1]) * eased, a[2] + (b[2] - a[2]) * eased],
      }, "vec3 key")
    }))
  }
  if (Array.isArray(from) && Array.isArray(to) && from.length === 4 && to.length === 4) {
    const a = quaternion(from as Quaternion, "from"), b = quaternion(to as Quaternion, "to")
    return deepFreezeJson(times.map(([time, t]) => parseSpatialValue(quaternionKeySchema, {
      timeUs: time,
      value: t === 0 ? unitQuaternion(a) : t === 1 ? unitQuaternion(b) : unitQuaternion(slerpQuaternion(a, b, easing(t))),
    }, "rotation key")))
  }
  throw new RangeError("from and to must share one shape: scalar opacity, vec3, or quaternion")
}

export type SpatialEaseChannelInput = {
  readonly channelId: string
  readonly targetId: string
  readonly interpolation?: "step" | "linear" | "slerp"
  readonly durationUs: number
  readonly startUs?: number
  readonly easing: SpatialEasing
  readonly segments?: number
} & (
  | { readonly property: "position" | "scale"; readonly from: Vec3; readonly to: Vec3 }
  | { readonly property: "rotation"; readonly from: Quaternion; readonly to: Quaternion }
  | { readonly property: "opacity"; readonly from: number; readonly to: number }
)

/** Bakes eased keys directly into a validated animation channel. */
export function easeChannel(input: SpatialEaseChannelInput): SpatialAnimation {
  const keys = bakeKeys(input)
  const interpolation = input.interpolation ?? (input.property === "rotation" ? "slerp" : "linear")
  return deepFreezeJson(parseSpatialValue(SpatialAnimationSchema, {
    channelId: input.channelId, targetId: input.targetId,
    property: input.property, interpolation, keys,
  }, "animation channel"))
}

function worldBounds(entry: SpatialLayoutEntry): Bounds {
  if (entry.bounds === undefined) {
    const p = entry.transform.position
    return { min: [p[0], p[1], p[2]], max: [p[0], p[1], p[2]] }
  }
  return transformBounds(composeTransform(entry.transform), entry.bounds)
}

function moved(transformValue: Transform, axis: 0 | 1 | 2, position: number): SpatialTransform {
  const next = [transformValue.position[0], transformValue.position[1], transformValue.position[2]]
  next[axis] = position
  return emitTransform({ position: next as unknown as Vec3, rotation: transformValue.rotation, scale: transformValue.scale })
}

function shifted(transformValue: Transform, delta: Vec3): SpatialTransform {
  const p = transformValue.position
  return emitTransform({ position: [p[0] + delta[0], p[1] + delta[1], p[2] + delta[2]], rotation: transformValue.rotation, scale: transformValue.scale })
}

/**
 * Aligns each entry's world bounds edge on `axis` to a shared reference: the
 * minimum min-edge ("min"), the maximum max-edge ("max"), or the midpoint of
 * the aggregate span ("center"). Entries without bounds align by position.
 */
export function align(items: readonly SpatialLayoutEntry[], axis: SpatialAxis, edge: "min" | "center" | "max"): readonly SpatialTransform[] {
  const index = AXIS_INDEX[axis]
  if (items.length === 0) return deepFreezeJson([])
  for (const entry of items) transform(entry.transform, "transform")
  const enclosed = items.map(worldBounds)
  const lows = enclosed.map(item => item.min[index]!)
  const highs = enclosed.map(item => item.max[index]!)
  const target = edge === "min" ? Math.min(...lows) : edge === "max" ? Math.max(...highs)
    : (Math.min(...lows) + Math.max(...highs)) / 2
  return deepFreezeJson(items.map((item, itemIndex) => {
    const current = edge === "min" ? lows[itemIndex]! : edge === "max" ? highs[itemIndex]!
      : (lows[itemIndex]! + highs[itemIndex]!) / 2
    return moved(item.transform, index, item.transform.position[index]! + target - current)
  }))
}

/**
 * Evenly spaces entries along `axis` in their current order. `{gap}` anchors the
 * first entry and places each next bounds edge exactly `gap` meters past the
 * previous max edge (position delta for boundless entries). `{span}` keeps the
 * first entry and stretches the aggregate min-to-max extent to `span` meters.
 */
export function distribute(
  items: readonly SpatialLayoutEntry[],
  axis: SpatialAxis,
  mode: { readonly gap: number } | { readonly span: number },
): readonly SpatialTransform[] {
  const index = AXIS_INDEX[axis]
  if (items.length < 2) return deepFreezeJson(items.map(item => emitTransform(item.transform)))
  for (const entry of items) transform(entry.transform, "transform")
  const enclosed = items.map(worldBounds)
  const order = items.map((_, itemIndex) => itemIndex)
    .sort((a, b) => (items[a]!.transform.position[index]! - items[b]!.transform.position[index]!) || a - b)
  const positions = new Array<number>(items.length)
  const first = order[0]!
  positions[first] = items[first]!.transform.position[index]!
  let edge = enclosed[first]!.max[index]!
  const gap = "gap" in mode ? finite(mode.gap, "gap")
    : (finite(mode.span, "span") - order.reduce((total, itemIndex) => total + enclosed[itemIndex]!.max[index]! - enclosed[itemIndex]!.min[index]!, 0)) / (items.length - 1)
  for (let place = 1; place < order.length; place++) {
    const itemIndex = order[place]!
    const offset = enclosed[itemIndex]!.min[index]! - items[itemIndex]!.transform.position[index]!
    positions[itemIndex] = edge + gap - offset
    edge = edge + gap + enclosed[itemIndex]!.max[index]! - enclosed[itemIndex]!.min[index]!
  }
  return deepFreezeJson(items.map((item, itemIndex) => moved(item.transform, index, positions[itemIndex]!)))
}

export function row(items: readonly SpatialLayoutEntry[], mode: { readonly gap: number } | { readonly span: number }): readonly SpatialTransform[] {
  return distribute(items, "x", mode)
}
export function column(items: readonly SpatialLayoutEntry[], mode: { readonly gap: number } | { readonly span: number }): readonly SpatialTransform[] {
  return distribute(items, "y", mode)
}
export function stack(items: readonly SpatialLayoutEntry[], mode: { readonly gap: number } | { readonly span: number }): readonly SpatialTransform[] {
  return distribute(items, "z", mode)
}

/**
 * Row-major positions on the ground plane: `origin` is the first cell, columns
 * advance +X and rows advance +Z by `cellSize` (scalar or [x, z] spacing).
 */
export function grid(input: {
  readonly rows: number
  readonly columns: number
  readonly cellSize: number | readonly [number, number]
  readonly origin?: Vec3
}): readonly Vec3[] {
  if (!Number.isSafeInteger(input.rows) || input.rows < 1) throw new RangeError("rows must be a positive integer")
  if (!Number.isSafeInteger(input.columns) || input.columns < 1) throw new RangeError("columns must be a positive integer")
  if (input.rows * input.columns > SPATIAL_SCENE_LIMITS.entities) throw new RangeError("grid exceeds the entity limit")
  const spacing = typeof input.cellSize === "number" ? [input.cellSize, input.cellSize] : input.cellSize
  if (!Array.isArray(spacing) || spacing.length !== 2) throw new RangeError("cellSize must be a scalar or [x, z] pair")
  const [sx, sz] = [finite(spacing[0]!, "cellSize[0]"), finite(spacing[1]!, "cellSize[1]")]
  const origin = input.origin === undefined ? [0, 0, 0] : vec3(input.origin, "origin")
  return deepFreezeJson(parseSpatialValue(z.array(SpatialVec3Schema),
    Array.from({ length: input.rows * input.columns }, (_, cell) =>
      [origin[0] + (cell % input.columns) * sx, origin[1], origin[2] + Math.floor(cell / input.columns) * sz]),
    "grid"))
}

/** Places the transform so its underside (halfHeight below the origin) rests on floorY. */
export function groundSnap(transformValue: Transform, halfHeight: number, floorY = 0): SpatialTransform {
  finite(halfHeight, "halfHeight"); finite(floorY, "floorY")
  if (halfHeight < 0) throw new RangeError("halfHeight must be nonnegative")
  transform(transformValue, "transform")
  return emitTransform({
    position: [transformValue.position[0], floorY + halfHeight, transformValue.position[2]],
    rotation: transformValue.rotation, scale: transformValue.scale,
  })
}

/** mulberry32: checked-in deterministic RNG; identical seeds produce identical streams. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000
  }
}

/**
 * Deterministic XZ-plane positions at y = 0. With `minSpacing`, each point keeps
 * that Euclidean distance from every earlier accepted point; failure to place a
 * point within bounded attempts raises rather than silently relaxing spacing.
 */
export function scatter(input: {
  readonly seed: number
  readonly count: number
  readonly region: { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number }
  readonly minSpacing?: number
}): readonly Vec3[] {
  if (!Number.isSafeInteger(input.seed) || input.seed < 0 || input.seed > 0xffff_ffff) {
    throw new RangeError("seed must be an integer within [0, 2^32 - 1]")
  }
  if (!Number.isSafeInteger(input.count) || input.count < 0 || input.count > SPATIAL_SCENE_LIMITS.entities) {
    throw new RangeError(`count must be an integer within [0, ${SPATIAL_SCENE_LIMITS.entities}]`)
  }
  const region = input.region
  for (const [value, label] of [[region.minX, "minX"], [region.maxX, "maxX"], [region.minZ, "minZ"], [region.maxZ, "maxZ"]] as const) finite(value, `region.${label}`)
  if (region.minX > region.maxX || region.minZ > region.maxZ) throw new RangeError("region requires min <= max")
  const spacing = input.minSpacing === undefined ? 0 : finite(input.minSpacing, "minSpacing")
  if (spacing < 0) throw new RangeError("minSpacing must be nonnegative")
  const random = mulberry32(input.seed)
  const accepted: number[][] = []
  for (let placed = 0; placed < input.count; placed++) {
    let done = false
    for (let attempt = 0; attempt < SCATTER_MAX_ATTEMPTS && !done; attempt++) {
      const x = region.minX + random() * (region.maxX - region.minX)
      const z = region.minZ + random() * (region.maxZ - region.minZ)
      if (spacing === 0 || accepted.every(([px, , pz]) => (px! - x) * (px! - x) + (pz! - z) * (pz! - z) >= spacing * spacing)) {
        accepted.push([x, 0, z])
        done = true
      }
    }
    if (!done) throw new RangeError("scatter could not satisfy minSpacing within the region")
  }
  return deepFreezeJson(parseSpatialValue(z.array(SpatialVec3Schema), accepted, "scatter"))
}

/** Recenters the mover horizontally on the target and rests its min-Y on the target's max-Y. */
export function onTopOf(moverBounds: Bounds, moverTransform: Transform, targetBounds: Bounds, targetTransform: Transform): SpatialTransform {
  const mover = transformBounds(composeTransform(transform(moverTransform, "moverTransform")), bounds(moverBounds, "moverBounds"))
  const target = transformBounds(composeTransform(transform(targetTransform, "targetTransform")), bounds(targetBounds, "targetBounds"))
  return shifted(moverTransform, [
    (target.min[0] + target.max[0]) / 2 - (mover.min[0] + mover.max[0]) / 2,
    target.max[1] - mover.min[1],
    (target.min[2] + target.max[2]) / 2 - (mover.min[2] + mover.max[2]) / 2,
  ])
}

/**
 * Places the mover adjacent to the target along `axis` ("after" puts the mover's
 * min edge `gap` past the target's max edge; "before" mirrors it) and
 * center-aligns the mover on the other two axes.
 */
export function nextTo(
  moverBounds: Bounds,
  moverTransform: Transform,
  targetBounds: Bounds,
  targetTransform: Transform,
  options?: { readonly axis?: SpatialAxis; readonly side?: "before" | "after"; readonly gap?: number },
): SpatialTransform {
  const index = AXIS_INDEX[options?.axis ?? "x"]
  const side = options?.side ?? "after"
  const gap = finite(options?.gap ?? 0, "gap")
  const mover = transformBounds(composeTransform(transform(moverTransform, "moverTransform")), bounds(moverBounds, "moverBounds"))
  const target = transformBounds(composeTransform(transform(targetTransform, "targetTransform")), bounds(targetBounds, "targetBounds"))
  const delta: number[] = [0, 0, 0]
  delta[index] = side === "after"
    ? target.max[index]! + gap - mover.min[index]!
    : target.min[index]! - gap - mover.max[index]!
  for (const other of [0, 1, 2] as const) {
    if (other === index) continue
    delta[other] = (target.min[other]! + target.max[other]!) / 2 - (mover.min[other]! + mover.max[other]!) / 2
  }
  return shifted(moverTransform, delta as unknown as Vec3)
}

/** Rotates the transform in place so local -Z faces `target`; position and scale are kept. */
export function facing(transformValue: Transform, target: Vec3, up: Vec3 = WORLD_UP): SpatialTransform {
  transform(transformValue, "transform"); vec3(target, "target"); vec3(up, "up")
  if (Math.hypot(...up) === 0) throw new RangeError("up must be nonzero")
  return emitTransform({
    position: transformValue.position,
    rotation: lookRotation(transformValue.position, target, up),
    scale: transformValue.scale,
  })
}

/**
 * Bakes a horizontal orbit: key i sits at angle 2*pi*revolutions*i/segments
 * measured from +X in the XZ plane, at world height `height` (default center's
 * y), always looking at `center`. Position and rotation keys share key times.
 */
export function orbitKeys(input: {
  readonly center: Vec3
  readonly radius: number
  readonly height?: number
  readonly durationUs: number
  readonly revolutions?: number
  readonly startUs?: number
  readonly segments?: number
  readonly up?: Vec3
}): { readonly position: readonly SpatialBakedKey<Vec3>[]; readonly rotation: readonly SpatialBakedKey<Quaternion>[] } {
  const center = vec3(input.center, "center")
  const radius = finite(input.radius, "radius")
  if (radius < 0) throw new RangeError("radius must be nonnegative")
  const height = input.height === undefined ? center[1] : finite(input.height, "height")
  const revolutions = finite(input.revolutions ?? 1, "revolutions")
  const up = input.up === undefined ? WORLD_UP : vec3(input.up, "up")
  if (Math.hypot(...up) === 0) throw new RangeError("up must be nonzero")
  const startUs = timeUs(input.startUs ?? 0, "startUs")
  const duration = timeUs(input.durationUs, "durationUs")
  if (duration === 0) throw new RangeError("durationUs must be positive")
  timeUs(startUs + duration, "startUs + durationUs")
  const times = keyTimes(startUs, duration, segments(input.segments, duration))
  const position: SpatialBakedKey<Vec3>[] = []
  const rotation: SpatialBakedKey<Quaternion>[] = []
  for (const [time, t] of times) {
    const angle = (2 * Math.PI * revolutions * t) % (2 * Math.PI)
    const at: Vec3 = [center[0] + radius * Math.cos(angle), height, center[2] + radius * Math.sin(angle)]
    position.push(parseSpatialValue(vec3KeySchema, { timeUs: time, value: at }, "orbit position key"))
    rotation.push(parseSpatialValue(quaternionKeySchema, { timeUs: time, value: lookRotation(at, center, up) }, "orbit rotation key"))
  }
  return deepFreezeJson({ position, rotation })
}

/**
 * Pose on the world +Z side of the bounds center, looking down -Z with world +Y
 * up. `margin` (fraction in [0, 1), default 0.1) is the border kept free on
 * every side. Perspective distance grows until every bounds corner projects
 * inside the shrunken image; orthographic projections cannot zoom, so bounds
 * that exceed the shrunken extents raise instead.
 */
export function frameFitPose(boundsInput: Bounds, projectionInput: SpatialProjection, marginInput = 0.1): SpatialPose {
  const box = bounds(boundsInput, "bounds")
  const projection = parseSpatialValue(SpatialProjectionSchema, projectionInput, "projection")
  const margin = finite(marginInput, "margin")
  if (margin < 0 || margin >= 1) throw new RangeError("margin must lie within [0, 1)")
  const center: Vec3 = [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2]
  const half: Vec3 = [(box.max[0] - box.min[0]) / 2, (box.max[1] - box.min[1]) / 2, (box.max[2] - box.min[2]) / 2]
  const pad = Math.max(1e-9, projection.near * 1e-9)
  if (projection.kind === "perspective") {
    const roomX = Math.min(projection.cx, projection.width - projection.cx) * (1 - margin)
    const roomY = Math.min(projection.cy, projection.height - projection.cy) * (1 - margin)
    if (roomX <= 0 || roomY <= 0) throw new RangeError("projection has no image room around its principal point")
    const distance = Math.max(
      projection.fx * half[0] / roomX + half[2],
      projection.fy * half[1] / roomY + half[2],
      projection.near + half[2],
    ) + pad
    if (distance + half[2] > projection.far) throw new RangeError("bounds exceed the projection's far clipping distance")
    return emitPose([center[0], center[1], center[2] + distance], [0, 0, 0, 1])
  }
  const roomX = (projection.right - projection.left) / 2 * (1 - margin)
  const roomY = (projection.top - projection.bottom) / 2 * (1 - margin)
  if (half[0] > roomX || half[1] > roomY) throw new RangeError("bounds exceed the shrunken orthographic extents")
  return emitPose([
    center[0] - (projection.left + projection.right) / 2,
    center[1] - (projection.top + projection.bottom) / 2,
    center[2] + projection.near + half[2] + pad,
  ], [0, 0, 0, 1])
}
