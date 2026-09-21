import { z } from "zod"
import { deepFreezeJson } from "../code/json-snapshot.js"
import {
  SpatialMaterialSchema, SpatialTransformSchema,
  type SpatialMaterial, type SpatialTransform,
} from "./contracts.js"
import { parseSpatialValue, SpatialSceneError, spatialTopologicalIds, spatialValueSha256 } from "./identity.js"
import {
  composeTransform, invertTransform, transformBounds, transformPoint,
  type Bounds, type Vec3,
} from "./math.js"

/**
 * Bounded parametric geometry graph. Authored intent is a DAG of strict-schema
 * nodes: profile sources and 2D modifiers (inset, bevel), mesh sources
 * (box, cylinder, sphere), profile consumers (extrude, revolve, sweep, loft),
 * mesh modifiers (transform, mirror, array, merge, material-slot, uv-project)
 * and a limited boolean for bounded hull inputs. Every node has a closed
 * analytic bound on vertices, triangles, support planes and extent, so node
 * count, evaluation depth, vertex, triangle and byte budgets are enforced
 * BEFORE any mesh work runs. Evaluation is deterministic and emits flat
 * positions, normals, uvs, indices and per-triangle material slots; the GLB
 * emitter produces a document inside the closed parseSpatialGlb profile so
 * generated parts reach the renderer through the identical prepared-geometry
 * path as admitted GLB assets. This module is effect-free: no files, clocks,
 * providers, or native execution.
 */
export const SPATIAL_GEOMETRY_LIMITS = Object.freeze({
  nodes: 128,
  depth: 32,
  profilePoints: 512,
  pathPoints: 256,
  mergeInputs: 64,
  arrayCount: 512,
  arcSegments: 256,
  booleanPlanes: 64,
  booleanInputTriangles: 4_096,
  vertices: 65_536,
  triangles: 100_000,
  materialSlots: 16,
  outputBytes: 33_554_432,
  coordinate: 1_000_000,
})

export const SPATIAL_GEOMETRY_GRAPH_KIND = "slopcamera.spatial-geometry-graph" as const
export const SPATIAL_GEOMETRY_PROFILE = "slopcamera.parametric-geometry-v1" as const
/** CSG algorithm identity is separate from the retained GLB/facts format. */
export const SPATIAL_GEOMETRY_BOOLEAN_COMPILER = "slopcamera.geometry-boolean-v2" as const

const finite = z.number().finite().min(-SPATIAL_GEOMETRY_LIMITS.coordinate).max(SPATIAL_GEOMETRY_LIMITS.coordinate)
const positive = z.number().finite().min(1e-9).max(SPATIAL_GEOMETRY_LIMITS.coordinate)
const segments = z.number().int().min(3).max(SPATIAL_GEOMETRY_LIMITS.arcSegments)
const vec2 = z.tuple([finite, finite])
const vec3 = z.tuple([finite, finite, finite])
const nodeId = z.string().min(1).max(64).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/u, "Geometry node ids must be safe identifiers.")
const materialSlot = z.number().int().min(0).max(SPATIAL_GEOMETRY_LIMITS.materialSlots - 1)
const axis = z.enum(["x", "y", "z"])

/** Profile nodes evaluate to a simple CCW polygon; mesh nodes evaluate to mesh data. */
export const SpatialGeometryNodeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ id: nodeId, kind: z.literal("profile"), points: z.array(vec2).min(3).max(SPATIAL_GEOMETRY_LIMITS.profilePoints) }),
  z.strictObject({ id: nodeId, kind: z.literal("rect"), width: positive, height: positive }),
  z.strictObject({ id: nodeId, kind: z.literal("ellipse"), radiusX: positive, radiusY: positive, segments }),
  z.strictObject({ id: nodeId, kind: z.literal("inset"), input: nodeId, distance: positive }),
  z.strictObject({ id: nodeId, kind: z.literal("bevel"), input: nodeId, radius: positive, segments: z.number().int().min(1).max(64) }),
  z.strictObject({ id: nodeId, kind: z.literal("box"), size: z.tuple([positive, positive, positive]) }),
  z.strictObject({ id: nodeId, kind: z.literal("cylinder"), radius: positive, height: positive, segments }),
  z.strictObject({ id: nodeId, kind: z.literal("sphere"), radius: positive, segments: z.number().int().min(4).max(SPATIAL_GEOMETRY_LIMITS.arcSegments) }),
  z.strictObject({ id: nodeId, kind: z.literal("extrude"), profile: nodeId, depth: positive, sideSlot: materialSlot.optional(), capSlot: materialSlot.optional() }),
  z.strictObject({ id: nodeId, kind: z.literal("revolve"), profile: nodeId, segments, capSlot: materialSlot.optional() }),
  z.strictObject({ id: nodeId, kind: z.literal("sweep"), profile: nodeId, path: z.array(vec3).min(2).max(SPATIAL_GEOMETRY_LIMITS.pathPoints) }),
  z.strictObject({ id: nodeId, kind: z.literal("loft"), bottom: nodeId, top: nodeId, height: positive }),
  z.strictObject({ id: nodeId, kind: z.literal("transform"), input: nodeId, transform: SpatialTransformSchema }),
  z.strictObject({ id: nodeId, kind: z.literal("mirror"), input: nodeId, axis, offset: finite }),
  z.strictObject({ id: nodeId, kind: z.literal("array"), input: nodeId, count: z.number().int().min(1).max(SPATIAL_GEOMETRY_LIMITS.arrayCount), step: vec3 }),
  z.strictObject({ id: nodeId, kind: z.literal("merge"), inputs: z.array(nodeId).min(2).max(SPATIAL_GEOMETRY_LIMITS.mergeInputs) }),
  z.discriminatedUnion("operation", [
    z.strictObject({ id: nodeId, kind: z.literal("boolean"), operation: z.literal("difference"), a: nodeId, cutters: z.array(nodeId).min(1).max(16) }),
    z.strictObject({ id: nodeId, kind: z.literal("boolean"), operation: z.enum(["union", "intersection"]), a: nodeId, b: nodeId }),
  ]),
  z.strictObject({ id: nodeId, kind: z.literal("material-slot"), input: nodeId, slot: materialSlot }),
  z.strictObject({ id: nodeId, kind: z.literal("uv-project"), input: nodeId, projection: z.discriminatedUnion("mode", [
    z.strictObject({ mode: z.literal("box"), scale: positive }),
    z.strictObject({ mode: z.literal("planar"), axis, scale: positive, offset: vec2.optional() }),
    z.strictObject({ mode: z.literal("cylindrical"), axis, scale: positive }),
  ]) }),
])
export type SpatialGeometryNode = Readonly<z.infer<typeof SpatialGeometryNodeSchema>>

export const SpatialGeometryGraphSchema = z.strictObject({
  kind: z.literal(SPATIAL_GEOMETRY_GRAPH_KIND),
  schemaVersion: z.literal(1),
  nodes: z.array(SpatialGeometryNodeSchema).min(1).max(SPATIAL_GEOMETRY_LIMITS.nodes),
  output: nodeId,
})
export type SpatialGeometryGraph = Readonly<z.infer<typeof SpatialGeometryGraphSchema>>

/** Flat evaluated mesh data; `slots` carries one material slot per triangle. */
export interface SpatialGeometryMesh {
  readonly positions: readonly number[]
  readonly normals: readonly number[]
  readonly uvs: readonly number[]
  readonly indices: readonly number[]
  readonly slots: readonly number[]
  readonly bounds: Bounds
  readonly vertices: number
  readonly triangles: number
  readonly uvsProjected: boolean
}

/** Static pre-execution bounds: every emitted mesh must fit inside this estimate. */
export interface SpatialGeometryEstimate {
  readonly nodes: number
  readonly depth: number
  readonly vertices: number
  readonly triangles: number
  readonly bytes: number
  readonly bounds: Bounds
}

export interface SpatialGeometryEvaluation {
  readonly mesh: SpatialGeometryMesh
  readonly estimate: SpatialGeometryEstimate
  readonly graphSha256: string
  readonly booleanCompiler?: typeof SPATIAL_GEOMETRY_BOOLEAN_COMPILER
}

function fail(message: string, path = "geometry"): never {
  throw new SpatialSceneError("invalid-data", `${SPATIAL_GEOMETRY_PROFILE}: ${message}`, path)
}

// ---------------------------------------------------------------------------
// Profile (2D simple polygon) evaluation
// ---------------------------------------------------------------------------

type V2 = readonly [number, number]

function polygonArea(points: readonly V2[]): number {
  let area = 0
  for (let index = 0; index < points.length; index++) {
    const a = points[index]!, b = points[(index + 1) % points.length]!
    area += a[0] * b[1] - b[0] * a[1]
  }
  return area / 2
}

function segmentsCross(a1: V2, a2: V2, b1: V2, b2: V2): boolean {
  const cross = (o: V2, p: V2, q: V2) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0])
  const d1 = cross(b1, b2, a1), d2 = cross(b1, b2, a2), d3 = cross(a1, a2, b1), d4 = cross(a1, a2, b2)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

/** Endpoint touches between non-adjacent edges also invalidate a simple polygon. */
function pointOnSegment(p: V2, a: V2, b: V2): boolean {
  const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
  const scale = Math.hypot(b[0] - a[0], b[1] - a[1]) + 1e-12
  if (Math.abs(cross) > 1e-9 * scale) return false
  return (p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1]) >= -1e-12
    && (p[0] - b[0]) * (a[0] - b[0]) + (p[1] - b[1]) * (a[1] - b[1]) >= -1e-12
}

function polygonIsSimple(points: readonly V2[]): boolean {
  const count = points.length
  for (let edge = 0; edge < count; edge++) {
    const a1 = points[edge]!, a2 = points[(edge + 1) % count]!
    for (let other = edge + 1; other < count; other++) {
      if (other === edge || (other + 1) % count === edge || (edge + 1) % count === other) continue
      const b1 = points[other]!, b2 = points[(other + 1) % count]!
      if (segmentsCross(a1, a2, b1, b2)) return false
      if (pointOnSegment(a1, b1, b2) || pointOnSegment(a2, b1, b2) || pointOnSegment(b1, a1, a2)) return false
    }
  }
  return true
}

function checkedProfile(points: readonly V2[], path: string): readonly V2[] {
  if (points.length < 3 || points.length > SPATIAL_GEOMETRY_LIMITS.profilePoints) fail("Profile requires 3–512 points.", path)
  const area = polygonArea(points)
  if (!Number.isFinite(area) || Math.abs(area) < 1e-12) fail("Profile polygon is degenerate or collinear.", path)
  const ccw = area > 0 ? [...points] : [...points].reverse()
  if (!polygonIsSimple(ccw)) fail("Profile polygon must be simple (no self-intersections).", path)
  return Object.freeze(ccw)
}

function unit2(x: number, y: number): V2 {
  const length = Math.hypot(x, y)
  return length === 0 ? [0, 0] : [x / length, y / length]
}

/** Inward offset of a simple polygon by intersecting displaced edge lines (exact for hull vertices). */
function insetProfile(points: readonly V2[], distance: number, path: string): readonly V2[] {
  const count = points.length
  const out: V2[] = []
  for (let index = 0; index < count; index++) {
    const prev = points[(index - 1 + count) % count]!, vertex = points[index]!, next = points[(index + 1) % count]!
    const e1 = unit2(vertex[0] - prev[0], vertex[1] - prev[1])
    const e2 = unit2(next[0] - vertex[0], next[1] - vertex[1])
    // For CCW winding the interior lies left of each directed edge.
    const n1: V2 = [-e1[1], e1[0]], n2: V2 = [-e2[1], e2[0]]
    const a1: V2 = [prev[0] + n1[0] * distance, prev[1] + n1[1] * distance]
    const b1: V2 = [vertex[0] + n2[0] * distance, vertex[1] + n2[1] * distance]
    const denominator = e1[0] * e2[1] - e1[1] * e2[0]
    if (Math.abs(denominator) < 1e-12) {
      out.push([vertex[0] + (n1[0] + n2[0]) / 2 * distance, vertex[1] + (n1[1] + n2[1]) / 2 * distance])
      continue
    }
    const t = ((b1[0] - a1[0]) * e2[1] - (b1[1] - a1[1]) * e2[0]) / denominator
    out.push([a1[0] + e1[0] * t, a1[1] + e1[1] * t])
  }
  return checkedProfile(out, path)
}

/** Per-corner circular fillet on hull vertices; reflex corners pass through unchanged. */
function bevelProfile(points: readonly V2[], radius: number, arcSegments: number, path: string): readonly V2[] {
  const count = points.length
  const out: V2[] = []
  for (let index = 0; index < count; index++) {
    const prev = points[(index - 1 + count) % count]!, vertex = points[index]!, next = points[(index + 1) % count]!
    const u = unit2(vertex[0] - prev[0], vertex[1] - prev[1])
    const v = unit2(next[0] - vertex[0], next[1] - vertex[1])
    const turn = u[0] * v[1] - u[1] * v[0]
    if (turn <= 1e-12) { out.push(vertex); continue } // reflex or straight
    const cosInterior = Math.min(1, Math.max(-1, -(u[0] * v[0] + u[1] * v[1])))
    const interior = Math.PI - Math.acos(cosInterior)
    if (interior <= 1e-9) { out.push(vertex); continue }
    const half = interior / 2
    const lenPrev = Math.hypot(vertex[0] - prev[0], vertex[1] - prev[1])
    const lenNext = Math.hypot(next[0] - vertex[0], next[1] - vertex[1])
    const tangent = Math.min(radius / Math.tan(half), lenPrev / 2, lenNext / 2)
    const effectiveRadius = tangent * Math.tan(half)
    const bisector = unit2(v[0] - u[0], v[1] - u[1])
    const center: V2 = [vertex[0] + bisector[0] * effectiveRadius / Math.sin(half), vertex[1] + bisector[1] * effectiveRadius / Math.sin(half)]
    const touchA: V2 = [vertex[0] - u[0] * tangent, vertex[1] - u[1] * tangent]
    const touchB: V2 = [vertex[0] + v[0] * tangent, vertex[1] + v[1] * tangent]
    const start = Math.atan2(touchA[1] - center[1], touchA[0] - center[0])
    let end = Math.atan2(touchB[1] - center[1], touchB[0] - center[0])
    while (end <= start) end += 2 * Math.PI
    out.push(touchA)
    for (let step = 1; step <= arcSegments; step++) {
      const angle = start + (end - start) * step / arcSegments
      out.push([center[0] + effectiveRadius * Math.cos(angle), center[1] + effectiveRadius * Math.sin(angle)])
    }
  }
  if (out.length > SPATIAL_GEOMETRY_LIMITS.profilePoints) fail("Bevel expands the profile beyond the point budget.", path)
  return checkedProfile(out, path)
}

// ---------------------------------------------------------------------------
// Mesh builder
// ---------------------------------------------------------------------------

interface Builder {
  positions: number[]
  normals: number[]
  uvs: number[]
  indices: number[]
  slots: number[]
  uvsSet: boolean
}

function builder(): Builder { return { positions: [], normals: [], uvs: [], indices: [], slots: [], uvsSet: false } }

function vertex(b: Builder, position: Vec3, normal: Vec3, uv: V2 = [0, 0]): number {
  const index = b.positions.length / 3
  b.positions.push(position[0], position[1], position[2])
  b.normals.push(normal[0], normal[1], normal[2])
  b.uvs.push(uv[0], uv[1])
  return index
}

const DEGENERATE_AREA2 = 1e-20

function triangle(b: Builder, a: number, c: number, d: number, slot: number): void {
  const pa = a * 3, pb = c * 3, pc = d * 3
  const ux = b.positions[pb]! - b.positions[pa]!, uy = b.positions[pb + 1]! - b.positions[pa + 1]!, uz = b.positions[pb + 2]! - b.positions[pa + 2]!
  const vx = b.positions[pc]! - b.positions[pa]!, vy = b.positions[pc + 1]! - b.positions[pa + 1]!, vz = b.positions[pc + 2]! - b.positions[pa + 2]!
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx
  if (cx * cx + cy * cy + cz * cz < DEGENERATE_AREA2) return
  b.indices.push(a, c, d)
  b.slots.push(slot)
}

/** Ear-clipping triangulation of a simple polygon; returns index triples. */
function triangulate(points: readonly V2[], path: string): number[] {
  const remaining = points.map((_, index) => index)
  const indices: number[] = []
  let guard = 0
  while (remaining.length > 3 && ++guard <= points.length * points.length) {
    let clipped = false
    for (let index = 0; index < remaining.length; index++) {
      const ia = remaining[(index - 1 + remaining.length) % remaining.length]!
      const ib = remaining[index]!
      const ic = remaining[(index + 1) % remaining.length]!
      const a = points[ia]!, b = points[ib]!, c = points[ic]!
      const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
      if (cross <= 1e-14) continue
      let empty = true
      for (const other of remaining) {
        if (other === ia || other === ib || other === ic) continue
        const p = points[other]!
        const d1 = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
        const d2 = (c[0] - b[0]) * (p[1] - b[1]) - (c[1] - b[1]) * (p[0] - b[0])
        const d3 = (a[0] - c[0]) * (p[1] - c[1]) - (a[1] - c[1]) * (p[0] - c[0])
        if (d1 >= -1e-14 && d2 >= -1e-14 && d3 >= -1e-14) { empty = false; break }
      }
      if (empty) { indices.push(ia, ib, ic); remaining.splice(index, 1); clipped = true; break }
    }
    if (!clipped) fail("Profile triangulation failed; polygon must be simple.", path)
  }
  if (remaining.length === 3) indices.push(remaining[0]!, remaining[1]!, remaining[2]!)
  return indices
}

/** Signed mesh volume; negative means the triangle soup faces inward. */
function signedVolume(b: Builder): number {
  let volume = 0
  for (let index = 0; index < b.indices.length; index += 3) {
    const a = b.indices[index]! * 3, c = b.indices[index + 1]! * 3, d = b.indices[index + 2]! * 3
    const ax = b.positions[a]!, ay = b.positions[a + 1]!, az = b.positions[a + 2]!
    const bx = b.positions[c]!, by = b.positions[c + 1]!, bz = b.positions[c + 2]!
    const cx = b.positions[d]!, cy = b.positions[d + 1]!, cz = b.positions[d + 2]!
    volume += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6
  }
  return volume
}

/** Flips winding and normals when a generator produced inward-facing topology. */
function orientOutward(b: Builder): void {
  if (b.indices.length === 0 || signedVolume(b) >= 0) return
  for (let index = 0; index < b.indices.length; index += 3) {
    const swap = b.indices[index + 1]!; b.indices[index + 1] = b.indices[index + 2]!; b.indices[index + 2] = swap
  }
  for (let index = 0; index < b.normals.length; index++) b.normals[index] = -b.normals[index]!
}

function freezeMesh(b: Builder): SpatialGeometryMesh {
  const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity]
  for (let index = 0; index < b.positions.length; index += 3) {
    for (let axisIndex = 0; axisIndex < 3; axisIndex++) {
      const value = b.positions[index + axisIndex]!
      if (!Number.isFinite(value) || Math.abs(value) > SPATIAL_GEOMETRY_LIMITS.coordinate) fail("Evaluated geometry exceeds the coordinate bound.")
      low[axisIndex] = Math.min(low[axisIndex]!, value); high[axisIndex] = Math.max(high[axisIndex]!, value)
    }
  }
  if (b.positions.length === 0) fail("Evaluated geometry produced no vertices.")
  const triangles = b.indices.length / 3
  return deepFreezeJson({
    positions: Object.freeze(b.positions), normals: Object.freeze(b.normals), uvs: Object.freeze(b.uvs),
    indices: Object.freeze(b.indices), slots: Object.freeze(b.slots),
    bounds: { min: Object.freeze(low) as unknown as Vec3, max: Object.freeze(high) as unknown as Vec3 },
    vertices: b.positions.length / 3, triangles, uvsProjected: b.uvsSet,
  })
}

// ---------------------------------------------------------------------------
// Mesh sources
// ---------------------------------------------------------------------------

function boxMesh(size: readonly [number, number, number]): Builder {
  const b = builder()
  const [hx, hy, hz] = [size[0] / 2, size[1] / 2, size[2] / 2]
  const faces: readonly [Vec3, Vec3, Vec3, Vec3, Vec3][] = [
    [[1, 0, 0], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz], [hx, -hy, hz]],
    [[-1, 0, 0], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz], [-hx, -hy, -hz]],
    [[0, 1, 0], [-hx, hy, -hz], [-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz]],
    [[0, -1, 0], [-hx, -hy, hz], [-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz]],
    [[0, 0, 1], [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]],
    [[0, 0, -1], [hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]],
  ]
  for (const [normal, ...corners] of faces) {
    const uv: readonly V2[] = [[0, 0], [1, 0], [1, 1], [0, 1]]
    const base = corners.map((corner, index) => vertex(b, corner, normal, uv[index]!))
    triangle(b, base[0]!, base[1]!, base[2]!, 0); triangle(b, base[0]!, base[2]!, base[3]!, 0)
  }
  return b
}

function cylinderMesh(radius: number, height: number, seg: number): Builder {
  const b = builder(), half = height / 2
  for (let index = 0; index <= seg; index++) {
    const angle = 2 * Math.PI * index / seg, c = Math.cos(angle), s = Math.sin(angle)
    vertex(b, [radius * c, -half, radius * s], [c, 0, s], [index / seg, 0])
    vertex(b, [radius * c, half, radius * s], [c, 0, s], [index / seg, 1])
  }
  for (let index = 0; index < seg; index++) {
    const a = index * 2, c = index * 2 + 2
    triangle(b, a, a + 1, c + 1, 0); triangle(b, a, c + 1, c, 0)
  }
  for (const [y, normal] of [[half, 1] as const, [-half, -1] as const]) {
    const center = vertex(b, [0, y, 0], [0, normal, 0], [0.5, 0.5])
    const ring: number[] = []
    for (let index = 0; index <= seg; index++) {
      const angle = 2 * Math.PI * index / seg
      ring.push(vertex(b, [radius * Math.cos(angle), y, radius * Math.sin(angle)], [0, normal, 0], [0.5 + 0.5 * Math.cos(angle), 0.5 + 0.5 * Math.sin(angle)]))
    }
    for (let index = 0; index < seg; index++) {
      if (normal === 1) triangle(b, center, ring[index + 1]!, ring[index]!, 0)
      else triangle(b, center, ring[index]!, ring[index + 1]!, 0)
    }
  }
  return b
}

function sphereMesh(radius: number, seg: number): Builder {
  const b = builder(), latitudes = Math.max(2, Math.floor(seg / 2))
  const top = vertex(b, [0, radius, 0], [0, 1, 0], [0.5, 1])
  const rings: number[][] = []
  for (let lat = 1; lat < latitudes; lat++) {
    const phi = Math.PI / 2 - Math.PI * lat / latitudes, y = radius * Math.sin(phi), ringRadius = radius * Math.cos(phi)
    const ring: number[] = []
    for (let index = 0; index <= seg; index++) {
      const angle = 2 * Math.PI * index / seg
      const position: Vec3 = [ringRadius * Math.cos(angle), y, ringRadius * Math.sin(angle)]
      ring.push(vertex(b, position, [position[0] / radius, position[1] / radius, position[2] / radius], [index / seg, lat / latitudes]))
    }
    rings.push(ring)
  }
  const bottom = vertex(b, [0, -radius, 0], [0, -1, 0], [0.5, 0])
  for (let index = 0; index < seg; index++) {
    triangle(b, top, rings[0]![index + 1]!, rings[0]![index]!, 0)
    triangle(b, bottom, rings[rings.length - 1]![index]!, rings[rings.length - 1]![index + 1]!, 0)
  }
  for (let lat = 0; lat + 1 < rings.length; lat++) {
    for (let index = 0; index < seg; index++) {
      const a = rings[lat]![index]!, c = rings[lat]![index + 1]!, d = rings[lat + 1]![index]!, e = rings[lat + 1]![index + 1]!
      triangle(b, a, c, e, 0); triangle(b, a, e, d, 0)
    }
  }
  return b
}

function extrudeMesh(profile: readonly V2[], depth: number, sideSlot: number, capSlot: number, path: string): Builder {
  const b = builder(), half = depth / 2, count = profile.length
  const tris = triangulate(profile, path)
  // Front cap (z = +half, CCW from the front) and back cap (reversed winding).
  const front = profile.map(([x, y]) => vertex(b, [x, y, half], [0, 0, 1], [x, y]))
  const back = profile.map(([x, y]) => vertex(b, [x, y, -half], [0, 0, -1], [x, y]))
  for (let index = 0; index < tris.length; index += 3) {
    triangle(b, front[tris[index]!]!, front[tris[index + 1]!]!, front[tris[index + 2]!]!, capSlot)
    triangle(b, back[tris[index]!]!, back[tris[index + 2]!]!, back[tris[index + 1]!]!, capSlot)
  }
  let perimeter = 0
  const lengths = profile.map((point, index) => {
    const next = profile[(index + 1) % count]!
    const length = Math.hypot(next[0] - point[0], next[1] - point[1])
    perimeter += length
    return length
  })
  let distance = 0
  for (let index = 0; index < count; index++) {
    const a = profile[index]!, c = profile[(index + 1) % count]!
    const edge = unit2(c[0] - a[0], c[1] - a[1])
    const normal: Vec3 = [edge[1], -edge[0], 0] // CCW interior lies left; outward is right.
    const u0 = perimeter === 0 ? 0 : distance / perimeter
    distance += lengths[index]!
    const u1 = perimeter === 0 ? 0 : distance / perimeter
    const v0 = vertex(b, [a[0], a[1], -half], normal, [u0, 0])
    const v1 = vertex(b, [c[0], c[1], -half], normal, [u1, 0])
    const v2 = vertex(b, [c[0], c[1], half], normal, [u1, 1])
    const v3 = vertex(b, [a[0], a[1], half], normal, [u0, 1])
    triangle(b, v0, v1, v2, sideSlot); triangle(b, v0, v2, v3, sideSlot)
  }
  orientOutward(b)
  return b
}

/** Closed profile revolution: every profile edge sweeps a quad strip; axis points collapse to degenerate triangles that are dropped. */
function revolveMesh(profile: readonly V2[], seg: number, capSlot: number, path: string): Builder {
  const b = builder(), count = profile.length
  if (profile.some(([r]) => r < -1e-12)) fail("Revolve profiles must stay at nonnegative radius.", path)
  const rings: number[][] = []
  for (let point = 0; point < count; point++) {
    const [r, y] = profile[point]!
    const prev = profile[(point - 1 + count) % count]!, next = profile[(point + 1) % count]!
    const tangent = unit2(next[0] - prev[0], next[1] - prev[1])
    const outward = unit2(tangent[1], -tangent[0])
    const ring: number[] = []
    for (let index = 0; index <= seg; index++) {
      const angle = 2 * Math.PI * index / seg, c = Math.cos(angle), s = Math.sin(angle)
      ring.push(vertex(b, [r * c, y, r * s], [outward[0] * c, outward[1], outward[0] * s], [index / seg, point / (count - 1)]))
    }
    rings.push(ring)
  }
  for (let point = 0; point < count; point++) {
    const next = (point + 1) % count
    for (let index = 0; index < seg; index++) {
      const a = rings[point]![index]!, c = rings[point]![index + 1]!, d = rings[next]![index]!, e = rings[next]![index + 1]!
      triangle(b, a, d, e, capSlot); triangle(b, a, e, c, capSlot)
    }
  }
  orientOutward(b)
  return b
}

function sweepMesh(profile: readonly V2[], path: readonly (readonly number[])[], slotPath: string): Builder {
  const b = builder(), count = profile.length
  const points = path.map(point => [point[0]!, point[1]!, point[2]!] as Vec3)
  for (let index = 0; index + 1 < points.length; index++) {
    const a = points[index]!, c = points[index + 1]!
    if (Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]) < 1e-9) fail("Sweep path requires distinct consecutive points.", slotPath)
  }
  const tangents = points.map((_, index) => {
    const a = points[Math.max(0, index - 1)]!, c = points[Math.min(points.length - 1, index + 1)]!
    const length = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2])
    return [(c[0] - a[0]) / length, (c[1] - a[1]) / length, (c[2] - a[2]) / length] as Vec3
  })
  // Parallel-transport frames: seed a normal least-aligned with the first tangent.
  let normal: Vec3 = Math.abs(tangents[0]![1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
  const rings: number[][] = []
  for (let station = 0; station < points.length; station++) {
    const t = tangents[station]!
    const projected = [normal[0] - t[0] * (normal[0] * t[0] + normal[1] * t[1] + normal[2] * t[2]),
      normal[1] - t[1] * (normal[0] * t[0] + normal[1] * t[1] + normal[2] * t[2]),
      normal[2] - t[2] * (normal[0] * t[0] + normal[1] * t[1] + normal[2] * t[2])] as Vec3
    const nLength = Math.hypot(...projected)
    if (nLength < 1e-9) fail("Sweep path curvature degenerates the transport frame.", slotPath)
    normal = [projected[0] / nLength, projected[1] / nLength, projected[2] / nLength]
    const binormal: Vec3 = [
      t[1] * normal[2] - t[2] * normal[1], t[2] * normal[0] - t[0] * normal[2], t[0] * normal[1] - t[1] * normal[0]]
    const ring: number[] = []
    const center = points[station]!
    for (let point = 0; point < count; point++) {
      const prev = profile[(point - 1 + count) % count]!, next = profile[(point + 1) % count]!
      const tangent2 = unit2(next[0] - prev[0], next[1] - prev[1])
      const outward = unit2(tangent2[1], -tangent2[0])
      const [px, py] = profile[point]!
      ring.push(vertex(b, [
        center[0] + normal[0] * px + binormal[0] * py,
        center[1] + normal[1] * px + binormal[1] * py,
        center[2] + normal[2] * px + binormal[2] * py,
      ], [
        normal[0] * outward[0] + binormal[0] * outward[1],
        normal[1] * outward[0] + binormal[1] * outward[1],
        normal[2] * outward[0] + binormal[2] * outward[1],
      ], [point / count, station / (points.length - 1)]))
    }
    rings.push(ring)
  }
  for (let station = 0; station + 1 < rings.length; station++) {
    for (let point = 0; point < count; point++) {
      const next = (point + 1) % count
      const a = rings[station]![point]!, c = rings[station]![next]!, d = rings[station + 1]![point]!, e = rings[station + 1]![next]!
      triangle(b, a, c, e, 0); triangle(b, a, e, d, 0)
    }
  }
  const tris = triangulate(profile, slotPath)
  for (const [station, direction] of [[0, -1] as const, [points.length - 1, 1] as const]) {
    const t = tangents[station]!
    const capNormal: Vec3 = [t[0] * direction, t[1] * direction, t[2] * direction]
    const positions = rings[station]!.map(index => b.positions.slice(index * 3, index * 3 + 3) as unknown as Vec3)
    const cap = positions.map(position => vertex(b, position, capNormal))
    // The transported frame may flip handedness; orient the cap by its first triangle.
    const pa = positions[tris[0]!]!, pb = positions[tris[1]!]!, pc = positions[tris[2]!]!
    const cx = (pb[1] - pa[1]) * (pc[2] - pa[2]) - (pb[2] - pa[2]) * (pc[1] - pa[1])
    const cy = (pb[2] - pa[2]) * (pc[0] - pa[0]) - (pb[0] - pa[0]) * (pc[2] - pa[2])
    const cz = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0])
    const flip = (cx * capNormal[0] + cy * capNormal[1] + cz * capNormal[2]) < 0
    for (let index = 0; index < tris.length; index += 3) {
      if (flip) triangle(b, cap[tris[index]!]!, cap[tris[index + 2]!]!, cap[tris[index + 1]!]!, 0)
      else triangle(b, cap[tris[index]!]!, cap[tris[index + 1]!]!, cap[tris[index + 2]!]!, 0)
    }
  }
  orientOutward(b)
  return b
}

function loftMesh(bottom: readonly V2[], top: readonly V2[], height: number, path: string): Builder {
  const b = builder(), count = bottom.length
  if (top.length !== count) fail("Loft profiles must share one point count.", path)
  const lower = bottom.map(([x, y]) => vertex(b, [x, 0, y], [0, -1, 0], [x, y]))
  const upper = top.map(([x, y]) => vertex(b, [x, height, y], [0, 1, 0], [x, y]))
  for (const [tris, ring, flip] of [[triangulate(bottom, path), lower, true] as const, [triangulate(top, path), upper, false] as const]) {
    for (let index = 0; index < tris.length; index += 3) {
      if (flip) triangle(b, ring[tris[index]!]!, ring[tris[index + 2]!]!, ring[tris[index + 1]!]!, 0)
      else triangle(b, ring[tris[index]!]!, ring[tris[index + 1]!]!, ring[tris[index + 2]!]!, 0)
    }
  }
  const centroid = bottom.reduce((acc, point) => [acc[0] + point[0] / count, acc[1] + point[1] / count] as V2, [0, 0] as V2)
  for (let index = 0; index < count; index++) {
    const next = (index + 1) % count
    const a = bottom[index]!, c = bottom[next]!, d = top[index]!, e = top[next]!
    const ux = c[0] - a[0], uz = c[1] - a[1]
    const wx = d[0] - a[0], wy = height, wz = d[1] - a[1]
    // Geometric normal of (edge x span); flipped away from the profile centroid,
    // and the winding flips with it so geometry and stored normals agree.
    let nx = -(uz * wy), ny = uz * wx - ux * wz, nz = ux * wy
    const midX = (a[0] + c[0] + d[0] + e[0]) / 4 - centroid[0], midZ = (a[1] + c[1] + d[1] + e[1]) / 4 - centroid[1]
    const inward = nx * midX + nz * midZ < 0
    if (inward) { nx = -nx; ny = -ny; nz = -nz }
    const nLength = Math.hypot(nx, ny, nz) || 1
    const normal: Vec3 = [nx / nLength, ny / nLength, nz / nLength]
    const v0 = vertex(b, [a[0], 0, a[1]], normal), v1 = vertex(b, [c[0], 0, c[1]], normal)
    const v2 = vertex(b, [e[0], height, e[1]], normal), v3 = vertex(b, [d[0], height, d[1]], normal)
    if (inward) { triangle(b, v0, v3, v2, 0); triangle(b, v0, v2, v1, 0) }
    else { triangle(b, v0, v1, v2, 0); triangle(b, v0, v2, v3, 0) }
  }
  orientOutward(b)
  return b
}

// ---------------------------------------------------------------------------
// Mesh modifiers
// ---------------------------------------------------------------------------

function transformMesh(input: Builder, transform: SpatialTransform): Builder {
  const b = builder()
  const matrix = composeTransform(transform)
  const inverse = invertTransform(matrix)
  // Normals transform by the inverse-transpose of the upper 3x3; in column-major
  // storage that is column i of M^-1 dotted with n, i.e. indices i*4+j.
  for (let index = 0; index < input.positions.length; index += 3) {
    const position = transformPoint(matrix, [input.positions[index]!, input.positions[index + 1]!, input.positions[index + 2]!])
    const n0 = input.normals[index]!, n1 = input.normals[index + 1]!, n2 = input.normals[index + 2]!
    const normal: Vec3 = [
      inverse[0]! * n0 + inverse[1]! * n1 + inverse[2]! * n2,
      inverse[4]! * n0 + inverse[5]! * n1 + inverse[6]! * n2,
      inverse[8]! * n0 + inverse[9]! * n1 + inverse[10]! * n2,
    ]
    const length = Math.hypot(normal[0], normal[1], normal[2]) || 1
    vertex(b, position, [normal[0] / length, normal[1] / length, normal[2] / length], [input.uvs[(index / 3) * 2]!, input.uvs[(index / 3) * 2 + 1]!])
  }
  b.indices.push(...input.indices); b.slots.push(...input.slots); b.uvsSet = input.uvsSet
  return b
}

function mirrorMesh(input: Builder, axisIndex: 0 | 1 | 2, offset: number): Builder {
  const b = builder()
  for (let index = 0; index < input.positions.length; index += 3) {
    const position: number[] = [input.positions[index]!, input.positions[index + 1]!, input.positions[index + 2]!]
    const normal: number[] = [input.normals[index]!, input.normals[index + 1]!, input.normals[index + 2]!]
    position[axisIndex] = 2 * offset - position[axisIndex]!
    normal[axisIndex] = -normal[axisIndex]!
    vertex(b, position as unknown as Vec3, normal as unknown as Vec3, [input.uvs[(index / 3) * 2]!, input.uvs[(index / 3) * 2 + 1]!])
  }
  for (let index = 0; index < input.indices.length; index += 3) {
    triangle(b, input.indices[index]!, input.indices[index + 2]!, input.indices[index + 1]!, input.slots[index / 3]!)
  }
  b.uvsSet = input.uvsSet
  return b
}

function arrayMesh(input: Builder, count: number, step: readonly number[]): Builder {
  const b = builder(), vertices = input.positions.length / 3
  for (let copy = 0; copy < count; copy++) {
    const offset = [copy * step[0]!, copy * step[1]!, copy * step[2]!]
    for (let index = 0; index < input.positions.length; index += 3) {
      vertex(b, [input.positions[index]! + offset[0]!, input.positions[index + 1]! + offset[1]!, input.positions[index + 2]! + offset[2]!],
        [input.normals[index]!, input.normals[index + 1]!, input.normals[index + 2]!],
        [input.uvs[(index / 3) * 2]!, input.uvs[(index / 3) * 2 + 1]!])
    }
    for (let index = 0; index < input.indices.length; index += 3) {
      triangle(b, input.indices[index]! + copy * vertices, input.indices[index + 1]! + copy * vertices, input.indices[index + 2]! + copy * vertices, input.slots[index / 3]!)
    }
  }
  b.uvsSet = input.uvsSet
  return b
}

function mergeMeshes(inputs: readonly Builder[]): Builder {
  const b = builder()
  for (const input of inputs) {
    const base = input.positions.length === 0 ? 0 : b.positions.length / 3
    for (let index = 0; index < input.positions.length; index += 3) {
      vertex(b, [input.positions[index]!, input.positions[index + 1]!, input.positions[index + 2]!],
        [input.normals[index]!, input.normals[index + 1]!, input.normals[index + 2]!],
        [input.uvs[(index / 3) * 2]!, input.uvs[(index / 3) * 2 + 1]!])
    }
    for (let index = 0; index < input.indices.length; index += 3) {
      b.indices.push(input.indices[index]! + base, input.indices[index + 1]! + base, input.indices[index + 2]! + base)
      b.slots.push(input.slots[index / 3]!)
    }
    b.uvsSet = b.uvsSet || input.uvsSet
  }
  return b
}

// ---------------------------------------------------------------------------
// Limited hull boolean
// ---------------------------------------------------------------------------

interface Plane { readonly normal: Vec3; readonly d: number }

const PLANE_EPS = 1e-9

function trianglePlane(b: Builder, index: number): Plane | null {
  const a = b.indices[index]! * 3, c = b.indices[index + 1]! * 3, d = b.indices[index + 2]! * 3
  const ux = b.positions[c]! - b.positions[a]!, uy = b.positions[c + 1]! - b.positions[a + 1]!, uz = b.positions[c + 2]! - b.positions[a + 2]!
  const vx = b.positions[d]! - b.positions[a]!, vy = b.positions[d + 1]! - b.positions[a + 1]!, vz = b.positions[d + 2]! - b.positions[a + 2]!
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
  const length = Math.hypot(nx, ny, nz)
  if (length < 1e-12) return null
  const normal: Vec3 = [nx / length, ny / length, nz / length]
  return { normal, d: normal[0] * b.positions[a]! + normal[1] * b.positions[a + 1]! + normal[2] * b.positions[a + 2]! }
}

function uniquePlanes(b: Builder, path: string): readonly Plane[] {
  const planes: Plane[] = []
  for (let index = 0; index < b.indices.length; index += 3) {
    const plane = trianglePlane(b, index)
    if (plane === null) continue
    if (!planes.some(other => Math.abs(other.d - plane.d) < 1e-7
      && Math.abs(other.normal[0] - plane.normal[0]) < 1e-7
      && Math.abs(other.normal[1] - plane.normal[1]) < 1e-7
      && Math.abs(other.normal[2] - plane.normal[2]) < 1e-7)) planes.push(plane)
    if (planes.length > SPATIAL_GEOMETRY_LIMITS.booleanPlanes) fail("Hull boolean inputs may carry at most 64 support planes.", path)
  }
  return Object.freeze(planes)
}

/** Every vertex must lie on or inside each support plane for a hull closed input. */
function assertHull(b: Builder, planes: readonly Plane[], path: string): void {
  let extent = 1
  for (let index = 0; index < b.positions.length; index++) extent = Math.max(extent, Math.abs(b.positions[index]!))
  const epsilon = 1e-7 * extent
  for (const plane of planes) {
    for (let index = 0; index < b.positions.length; index += 3) {
      const signed = plane.normal[0] * b.positions[index]! + plane.normal[1] * b.positions[index + 1]! + plane.normal[2] * b.positions[index + 2]! - plane.d
      if (signed > epsilon) fail("Boolean inputs must be closed hull meshes; a vertex lies outside a support plane.", path)
    }
  }
}

interface Fragment { readonly positions: Vec3[]; readonly uvs: V2[]; readonly slot: number }

function clipFragment(fragment: Fragment, plane: Plane, keepInside: boolean): Fragment | null {
  const output: Vec3[] = [], uvOut: V2[] = []
  const signed = fragment.positions.map(position => plane.normal[0] * position[0] + plane.normal[1] * position[1] + plane.normal[2] * position[2] - plane.d)
  const inside = signed.map(value => keepInside ? value <= PLANE_EPS : value >= -PLANE_EPS)
  for (let index = 0; index < fragment.positions.length; index++) {
    const next = (index + 1) % fragment.positions.length
    const a = fragment.positions[index]!, c = fragment.positions[next]!
    if (inside[index]) { output.push(a); uvOut.push(fragment.uvs[index]!) }
    if (inside[index] !== inside[next]) {
      const t = signed[index]! / (signed[index]! - signed[next]!)
      output.push([a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t])
      uvOut.push([fragment.uvs[index]![0] + (fragment.uvs[next]![0] - fragment.uvs[index]![0]) * t,
        fragment.uvs[index]![1] + (fragment.uvs[next]![1] - fragment.uvs[index]![1]) * t])
    }
  }
  return output.length >= 3 ? { positions: output, uvs: uvOut, slot: fragment.slot } : null
}

/** Partitions every source triangle by all planes into cells that cross none. */
function partitionTriangles(input: Builder, planes: readonly Plane[]): Fragment[] {
  const result: Fragment[] = []
  for (let index = 0; index < input.indices.length; index += 3) {
    const positions = [0, 1, 2].map(part => input.positions.slice(input.indices[index + part]! * 3, input.indices[index + part]! * 3 + 3) as unknown as Vec3)
    const uvs = [0, 1, 2].map(part => [input.uvs[input.indices[index + part]! * 2]!, input.uvs[input.indices[index + part]! * 2 + 1]!] as V2)
    let fragments: Fragment[] = [{ positions, uvs, slot: input.slots[index / 3]! }]
    for (const plane of planes) {
      const next: Fragment[] = []
      for (const fragment of fragments) {
        const signed = fragment.positions.map(point => plane.normal[0] * point[0] + plane.normal[1] * point[1] + plane.normal[2] * point[2] - plane.d)
        // A one-sided or coplanar polygon is already a single cell. Clipping
        // it into both inclusive half-spaces duplicates coplanar surfaces.
        if (!signed.some(value => value < -PLANE_EPS) || !signed.some(value => value > PLANE_EPS)) {
          next.push(fragment)
          continue
        }
        const inner = clipFragment(fragment, plane, true)
        const outer = clipFragment(fragment, plane, false)
        if (inner !== null) next.push(inner)
        if (outer !== null) next.push(outer)
      }
      fragments = next
    }
    result.push(...fragments)
  }
  return result
}

function fragmentCentroid(fragment: Fragment): Vec3 {
  const count = fragment.positions.length
  return [
    fragment.positions.reduce((sum, p) => sum + p[0], 0) / count,
    fragment.positions.reduce((sum, p) => sum + p[1], 0) / count,
    fragment.positions.reduce((sum, p) => sum + p[2], 0) / count,
  ]
}

function fragmentNormal(fragment: Fragment): Vec3 | null {
  const origin = fragment.positions[0]!, normal = [0, 0, 0]
  for (let index = 1; index + 1 < fragment.positions.length; index++) {
    const a = fragment.positions[index]!, b = fragment.positions[index + 1]!
    const u = [a[0] - origin[0], a[1] - origin[1], a[2] - origin[2]], v = [b[0] - origin[0], b[1] - origin[1], b[2] - origin[2]]
    normal[0] = normal[0]! + u[1]! * v[2]! - u[2]! * v[1]!
    normal[1] = normal[1]! + u[2]! * v[0]! - u[0]! * v[2]!
    normal[2] = normal[2]! + u[0]! * v[1]! - u[1]! * v[0]!
  }
  const length = Math.hypot(...normal)
  return length < 1e-12 ? null : [normal[0]! / length, normal[1]! / length, normal[2]! / length]
}

function planeDistance(plane: Plane, point: Vec3): number {
  return plane.normal[0] * point[0] + plane.normal[1] * point[1] + plane.normal[2] * point[2] - plane.d
}

/** Symbolic infinitesimal occupancy on each side avoids scale-dependent probe distances. */
function insideHullSide(planes: readonly Plane[], point: Vec3, normal: Vec3, side: number): boolean {
  return planes.every(plane => {
    const signed = planeDistance(plane, point)
    if (signed > PLANE_EPS) return false
    if (signed < -PLANE_EPS) return true
    return side * (plane.normal[0] * normal[0] + plane.normal[1] * normal[1] + plane.normal[2] * normal[2]) <= PLANE_EPS
  })
}

function boundsTouch(a: Bounds, b: Bounds): boolean {
  return [0, 1, 2].every(axis => a.min[axis]! <= b.max[axis]! + PLANE_EPS && b.min[axis]! <= a.max[axis]! + PLANE_EPS)
}

function builderBounds(input: Builder): Bounds {
  const low: number[] = [Infinity, Infinity, Infinity], high: number[] = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < input.positions.length; i++) {
    const axis = i % 3, value = input.positions[i]!
    low[axis] = Math.min(low[axis]!, value); high[axis] = Math.max(high[axis]!, value)
  }
  return { min: low as unknown as Vec3, max: high as unknown as Vec3 }
}

function emitFragments(b: Builder, fragments: readonly Fragment[], flip: boolean): void {
  for (const fragment of fragments) {
    const unit = fragmentNormal(fragment)
    if (unit === null) continue
    const oriented: Vec3 = flip ? [-unit[0], -unit[1], -unit[2]] : unit
    const indices = fragment.positions.map((position, index) => vertex(b, position, oriented, fragment.uvs[index]!))
    for (let index = 1; index + 1 < indices.length; index++) {
      if (flip) triangle(b, indices[0]!, indices[index + 1]!, indices[index]!, fragment.slot)
      else triangle(b, indices[0]!, indices[index]!, indices[index + 1]!, fragment.slot)
    }
  }
}

/**
 * Bounded simple CSG: union/intersection over two hull inputs, or difference
 * of one hull input against a bounded set of hull cutters (intermediate
 * results may be non-hull; recursion is still forbidden because each node is
 * a single bounded pass). Coplanar coincidences resolve by epsilon.
 */
function booleanMesh(input: Extract<SpatialGeometryNode, { kind: "boolean" }>, meshes: ReadonlyMap<string, Builder>, path: string): Builder {
  const a = meshes.get(input.a)!
  const cutters = input.operation === "difference" ? input.cutters.map(id => meshes.get(id)!) : [meshes.get(input.b)!]
  for (const [index, mesh] of [a, ...cutters].entries()) {
    if (mesh.indices.length / 3 > SPATIAL_GEOMETRY_LIMITS.booleanInputTriangles) {
      fail("Boolean inputs exceed the bounded simple-input triangle budget.", `${path}.${index}`)
    }
  }
  const inputs = [a, ...cutters], hulls = inputs.map(mesh => uniquePlanes(mesh, path)), bounds = inputs.map(builderBounds)
  inputs.forEach((mesh, index) => assertHull(mesh, hulls[index]!, path))
  const output = builder()
  for (const [owner, mesh] of inputs.entries()) {
    const planes = hulls.flatMap((hull, index) => index !== owner && boundsTouch(bounds[owner]!, bounds[index]!) ? hull : [])
    const outward: Fragment[] = [], reversed: Fragment[] = []
    for (const fragment of partitionTriangles(mesh, planes)) {
      const normal = fragmentNormal(fragment)
      if (normal === null) continue
      const point = fragmentCentroid(fragment)
      const occupied = (side: number): boolean => {
        const inside = hulls.map(hull => insideHullSide(hull, point, normal, side))
        return input.operation === "difference" ? inside[0]! && !inside.slice(1).some(Boolean)
          : input.operation === "intersection" ? inside.every(Boolean) : inside.some(Boolean)
      }
      const positive = occupied(1), negative = occupied(-1)
      if (positive === negative) continue
      // Coincident boundary faces belong to the earliest source hull. Their
      // occupancy is shared; retaining both would double area and cause z-fighting.
      const duplicate = hulls.slice(0, owner).some(hull => hull.every(plane => planeDistance(plane, point) <= PLANE_EPS)
        && hull.some(plane => Math.abs(planeDistance(plane, point)) <= PLANE_EPS
          && Math.abs(plane.normal[0] * normal[0] + plane.normal[1] * normal[1] + plane.normal[2] * normal[2]) > 1 - 1e-7))
      if (!duplicate) (positive ? reversed : outward).push(fragment)
    }
    emitFragments(output, outward, false); emitFragments(output, reversed, true)
  }
  output.uvsSet = [a, ...cutters].some(mesh => mesh.uvsSet)
  if (output.indices.length === 0) fail("Boolean result is empty; the inputs do not overlap as the operation requires.", path)
  orientOutward(output)
  return output
}

// ---------------------------------------------------------------------------
// UV projection and material slots
// ---------------------------------------------------------------------------

const AXIS_INDEX: Record<"x" | "y" | "z", 0 | 1 | 2> = { x: 0, y: 1, z: 2 }

function projectUvs(input: Builder, projection: Extract<SpatialGeometryNode, { kind: "uv-project" }>["projection"]): Builder {
  const b = builder()
  b.positions.push(...input.positions); b.normals.push(...input.normals)
  b.indices.push(...input.indices); b.slots.push(...input.slots)
  for (let index = 0; index < input.positions.length; index += 3) {
    const p: Vec3 = [input.positions[index]!, input.positions[index + 1]!, input.positions[index + 2]!]
    const n: Vec3 = [input.normals[index]!, input.normals[index + 1]!, input.normals[index + 2]!]
    let uv: V2
    if (projection.mode === "box") {
      const axisIndex = Math.abs(n[0]) >= Math.abs(n[1]) && Math.abs(n[0]) >= Math.abs(n[2]) ? 0 : Math.abs(n[1]) >= Math.abs(n[2]) ? 1 : 2
      const pair = [0, 1, 2].filter(part => part !== axisIndex)
      uv = [p[pair[0]!]! * projection.scale, p[pair[1]!]! * projection.scale]
    } else if (projection.mode === "planar") {
      const pair = [0, 1, 2].filter(part => part !== AXIS_INDEX[projection.axis])
      uv = [p[pair[0]!]! * projection.scale + (projection.offset?.[0] ?? 0), p[pair[1]!]! * projection.scale + (projection.offset?.[1] ?? 0)]
    } else {
      const axisIndex = AXIS_INDEX[projection.axis]
      const pair = [0, 1, 2].filter(part => part !== axisIndex)
      uv = [Math.atan2(p[pair[1]!]!, p[pair[0]!]!) / (2 * Math.PI) + 0.5, p[axisIndex]! * projection.scale]
    }
    b.uvs.push(uv[0], uv[1])
  }
  b.uvsSet = true
  return b
}

// ---------------------------------------------------------------------------
// Graph validation, static budget, evaluation
// ---------------------------------------------------------------------------

const PROFILE_KINDS = new Set(["profile", "rect", "ellipse", "inset", "bevel"])

function nodeDependencies(node: SpatialGeometryNode): readonly string[] {
  switch (node.kind) {
    case "inset": case "bevel": case "transform": case "mirror": case "array": case "material-slot": case "uv-project":
      return [node.input]
    case "extrude": case "revolve": case "sweep": return [node.profile]
    case "loft": return [node.bottom, node.top]
    case "merge": return node.inputs
    case "boolean": return node.operation === "difference" ? [node.a, ...node.cutters] : [node.a, node.b]
    default: return []
  }
}



/** Full DAG validation: schema, ids, reference closure, node arity kinds, cycles and depth. */
export function parseSpatialGeometryGraph(input: unknown): SpatialGeometryGraph {
  const graph = parseSpatialValue(SpatialGeometryGraphSchema, input, "geometry graph")
  const nodesById = new Map<string, SpatialGeometryNode>()
  for (const node of graph.nodes) {
    if (nodesById.has(node.id)) fail(`Duplicate geometry node ${node.id}.`, "geometry.nodes")
    nodesById.set(node.id, node)
  }
  for (const node of graph.nodes) {
    for (const dependency of nodeDependencies(node)) {
      const target = nodesById.get(dependency)
      if (target === undefined) fail(`Geometry node ${node.id} references missing ${dependency}.`, `geometry.nodes.${node.id}`)
      const expectsProfile = (node.kind === "inset" || node.kind === "bevel" || node.kind === "extrude" || node.kind === "revolve" || node.kind === "sweep" || node.kind === "loft")
      if (expectsProfile !== PROFILE_KINDS.has(target.kind)) {
        fail(`Geometry node ${node.id} wires a ${expectsProfile ? "mesh" : "profile"} output into a ${expectsProfile ? "profile" : "mesh"} input.`, `geometry.nodes.${node.id}`)
      }
    }
  }
  const order = spatialTopologicalIds(new Map(graph.nodes.map(node => [node.id, nodeDependencies(node)])), "geometry graph")
  const depth = new Map<string, number>()
  for (const id of order) {
    const node = nodesById.get(id)!
    const value = 1 + Math.max(0, ...nodeDependencies(node).map(dependency => depth.get(dependency)!))
    if (value > SPATIAL_GEOMETRY_LIMITS.depth) fail(`Geometry graph exceeds the ${SPATIAL_GEOMETRY_LIMITS.depth}-node evaluation depth bound.`, `geometry.nodes.${id}`)
    depth.set(id, value)
  }
  if (!nodesById.has(graph.output)) fail("Geometry output names a missing node.", "geometry.output")
  if (PROFILE_KINDS.has(nodesById.get(graph.output)!.kind)) fail("Geometry output must evaluate to a mesh, not a profile.", "geometry.output")
  return deepFreezeJson(graph)
}

interface NodeEstimate { readonly vertices: number; readonly triangles: number; readonly planes: number; readonly bounds: Bounds }
interface ProfileEstimate { readonly points: number; readonly bounds: Bounds }

function profileBounds(points: readonly V2[]): Bounds {
  const xs = points.map(point => point[0]), ys = points.map(point => point[1])
  return { min: [Math.min(...xs), Math.min(...ys), 0], max: [Math.max(...xs), Math.max(...ys), 0] }
}

function boundsUnion(a: Bounds, b: Bounds): Bounds {
  return { min: [Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1]), Math.min(a.min[2], b.min[2])],
    max: [Math.max(a.max[0], b.max[0]), Math.max(a.max[1], b.max[1]), Math.max(a.max[2], b.max[2])] }
}

function boundsOffset(bounds: Bounds, delta: readonly number[]): Bounds {
  return { min: [bounds.min[0] + delta[0]!, bounds.min[1] + delta[1]!, bounds.min[2] + delta[2]!],
    max: [bounds.max[0] + delta[0]!, bounds.max[1] + delta[1]!, bounds.max[2] + delta[2]!] }
}

function inflateBounds(bounds: Bounds, radius: number): Bounds {
  return { min: [bounds.min[0] - radius, bounds.min[1] - radius, bounds.min[2] - radius],
    max: [bounds.max[0] + radius, bounds.max[1] + radius, bounds.max[2] + radius] }
}

function estimateNode(node: SpatialGeometryNode, meshEstimates: ReadonlyMap<string, NodeEstimate>, profileEstimates: ReadonlyMap<string, ProfileEstimate>, _path: string): NodeEstimate | ProfileEstimate {
  const mesh = (id: string) => meshEstimates.get(id)!
  const profile = (id: string) => profileEstimates.get(id)!
  switch (node.kind) {
    case "profile": return { points: node.points.length, bounds: profileBounds(node.points) }
    case "rect": return { points: 4, bounds: { min: [-node.width / 2, -node.height / 2, 0], max: [node.width / 2, node.height / 2, 0] } }
    case "ellipse": return { points: node.segments, bounds: { min: [-node.radiusX, -node.radiusY, 0], max: [node.radiusX, node.radiusY, 0] } }
    case "inset": return { points: profile(node.input).points, bounds: profile(node.input).bounds }
    case "bevel": {
      const source = profile(node.input)
      return { points: source.points * (node.segments + 1), bounds: source.bounds }
    }
    case "box": {
      const [x, y, z] = [node.size[0] / 2, node.size[1] / 2, node.size[2] / 2]
      return { vertices: 24, triangles: 12, planes: 6, bounds: { min: [-x, -y, -z], max: [x, y, z] } }
    }
    case "cylinder": return { vertices: 4 * node.segments + 6, triangles: 4 * node.segments, planes: node.segments + 2,
      bounds: { min: [-node.radius, -node.height / 2, -node.radius], max: [node.radius, node.height / 2, node.radius] } }
    case "sphere": {
      const latitudes = Math.max(2, Math.floor(node.segments / 2))
      return { vertices: (node.segments + 1) * (latitudes - 1) + 2, triangles: 2 * node.segments * latitudes, planes: node.segments * latitudes,
        bounds: { min: [-node.radius, -node.radius, -node.radius], max: [node.radius, node.radius, node.radius] } }
    }
    case "extrude": {
      const p = profile(node.profile), count = p.points
      return { vertices: 6 * count, triangles: 4 * count, planes: count + 2,
        bounds: { min: [p.bounds.min[0], p.bounds.min[1], -node.depth / 2], max: [p.bounds.max[0], p.bounds.max[1], node.depth / 2] } }
    }
    case "revolve": {
      const p = profile(node.profile)
      const radius = Math.max(Math.abs(p.bounds.min[0]), Math.abs(p.bounds.max[0]))
      return { vertices: p.points * (node.segments + 1), triangles: 4 * p.points * node.segments, planes: p.points * node.segments + p.points,
        bounds: { min: [-radius, p.bounds.min[1], -radius], max: [radius, p.bounds.max[1], radius] } }
    }
    case "sweep": {
      const p = profile(node.profile)
      const radius = Math.hypot(Math.max(Math.abs(p.bounds.min[0]), Math.abs(p.bounds.max[0])), Math.max(Math.abs(p.bounds.min[1]), Math.abs(p.bounds.max[1])))
      const pathBounds = node.path.reduce((acc, point) => boundsUnion(acc, { min: point, max: point }), { min: node.path[0]!, max: node.path[0]! } as Bounds)
      const count = node.path.length
      return { vertices: p.points * count + 2 * p.points, triangles: 4 * p.points * count, planes: p.points * count + 2, bounds: inflateBounds(pathBounds, radius) }
    }
    case "loft": {
      const a = profile(node.bottom), c = profile(node.top), count = a.points + c.points
      const bounds = boundsUnion({ min: [a.bounds.min[0], 0, a.bounds.min[1]], max: [a.bounds.max[0], 0, a.bounds.max[1]] },
        { min: [c.bounds.min[0], node.height, c.bounds.min[1]], max: [c.bounds.max[0], node.height, c.bounds.max[1]] })
      return { vertices: 7 * count, triangles: 4 * count, planes: count + 2, bounds }
    }
    case "transform": {
      const source = mesh(node.input)
      return { ...source, bounds: transformBounds(composeTransform(node.transform), source.bounds) }
    }
    case "mirror": {
      const source = mesh(node.input), index = AXIS_INDEX[node.axis]
      const bounds = { min: [...source.bounds.min], max: [...source.bounds.max] }
      const low = 2 * node.offset - bounds.max[index]!, high = 2 * node.offset - bounds.min[index]!
      bounds.min[index] = low; bounds.max[index] = high
      return { ...source, bounds: bounds as unknown as Bounds }
    }
    case "array": {
      const source = mesh(node.input)
      let bounds = source.bounds
      for (let copy = 1; copy < node.count; copy++) bounds = boundsUnion(bounds, boundsOffset(source.bounds, [copy * node.step[0], copy * node.step[1], copy * node.step[2]]))
      return { vertices: source.vertices * node.count, triangles: source.triangles * node.count, planes: source.planes * node.count, bounds }
    }
    case "merge": {
      const inputs = node.inputs.map(mesh)
      return { vertices: inputs.reduce((sum, item) => sum + item.vertices, 0), triangles: inputs.reduce((sum, item) => sum + item.triangles, 0),
        planes: inputs.reduce((sum, item) => sum + item.planes, 0), bounds: inputs.map(input => input.bounds).reduce(boundsUnion) }
    }
    case "boolean": {
      const a = mesh(node.a)
      const cutters = node.operation === "difference" ? node.cutters.map(mesh) : [mesh(node.b)]
      const inputs = [a, ...cutters]
      // In one source triangle, n plane intersections form at most
      // 1+n(n+1)/2 cells. Each proper split adds at most two fan triangles,
      // hence 1+n(n+1) triangles per input triangle, including all cap faces.
      // Disjoint input bounds cannot cut each other's source triangles.
      const triangles = inputs.reduce((total, source, index) => {
        const planes = inputs.reduce((sum, other, otherIndex) => sum + (otherIndex !== index && boundsTouch(source.bounds, other.bounds) ? other.planes : 0), 0)
        return total + source.triangles * (1 + planes * (planes + 1))
      }, 0)
      const other = cutters[0]!
      const bounds = node.operation === "intersection"
        ? { min: [Math.max(a.bounds.min[0], other.bounds.min[0]), Math.max(a.bounds.min[1], other.bounds.min[1]), Math.max(a.bounds.min[2], other.bounds.min[2])] as unknown as Vec3,
            max: [Math.min(a.bounds.max[0], other.bounds.max[0]), Math.min(a.bounds.max[1], other.bounds.max[1]), Math.min(a.bounds.max[2], other.bounds.max[2])] as unknown as Vec3 }
        : node.operation === "union" ? boundsUnion(a.bounds, other.bounds) : a.bounds
      return { vertices: 3 * triangles, triangles, planes: a.planes + cutters.reduce((sum, cutter) => sum + cutter.planes, 0), bounds }
    }
    case "material-slot": case "uv-project": return mesh(node.input)
  }
}

/** Static pre-execution budget: every estimate is a closed over-approximation of the emitted mesh. */
export function estimateSpatialGeometryGraph(input: unknown): SpatialGeometryEstimate {
  const graph = parseSpatialGeometryGraph(input)
  const nodesById = new Map(graph.nodes.map(node => [node.id, node]))
  const order = spatialTopologicalIds(new Map(graph.nodes.map(node => [node.id, nodeDependencies(node)])), "geometry graph")
  const meshEstimates = new Map<string, NodeEstimate>(), profileEstimates = new Map<string, ProfileEstimate>()
  let depth = 0
  const depthOf = new Map<string, number>()
  for (const id of order) {
    const node = nodesById.get(id)!
    depthOf.set(id, 1 + Math.max(0, ...nodeDependencies(node).map(dependency => depthOf.get(dependency)!)))
    depth = Math.max(depth, depthOf.get(id)!)
    const estimate = estimateNode(node, meshEstimates, profileEstimates, `geometry.nodes.${id}`)
    if (PROFILE_KINDS.has(node.kind)) {
      const candidate = estimate as ProfileEstimate
      if (candidate.points > SPATIAL_GEOMETRY_LIMITS.profilePoints) fail(`Profile node ${id} exceeds the point budget before evaluation.`, `geometry.nodes.${id}`)
      profileEstimates.set(id, candidate)
    } else {
      const candidate = estimate as NodeEstimate
      if (candidate.vertices > SPATIAL_GEOMETRY_LIMITS.vertices || candidate.triangles > SPATIAL_GEOMETRY_LIMITS.triangles) {
        fail(`Geometry node ${id} exceeds the vertex/triangle budget before evaluation.`, `geometry.nodes.${id}`)
      }
      meshEstimates.set(id, candidate)
    }
  }
  const output = meshEstimates.get(graph.output)!
  const bytes = output.vertices * 32 + output.triangles * 16
  if (bytes > SPATIAL_GEOMETRY_LIMITS.outputBytes) fail("Geometry output exceeds the byte budget before evaluation.", "geometry.output")
  return deepFreezeJson({ nodes: graph.nodes.length, depth, vertices: output.vertices, triangles: output.triangles, bytes, bounds: output.bounds })
}

/** Deterministic evaluation of a validated graph into flat mesh data. */
export function evaluateSpatialGeometry(input: unknown): SpatialGeometryEvaluation {
  const graph = parseSpatialGeometryGraph(input)
  const estimate = estimateSpatialGeometryGraph(graph)
  const nodesById = new Map(graph.nodes.map(node => [node.id, node]))
  const order = spatialTopologicalIds(new Map(graph.nodes.map(node => [node.id, nodeDependencies(node)])), "geometry graph")
  const profiles = new Map<string, readonly V2[]>(), meshes = new Map<string, Builder>()
  for (const id of order) {
    const node = nodesById.get(id)!, path = `geometry.nodes.${id}`
    const profile = (key: string) => profiles.get(key)!
    const mesh = (key: string) => meshes.get(key)!
    switch (node.kind) {
      case "profile": profiles.set(id, checkedProfile(node.points, path)); break
      case "rect": profiles.set(id, checkedProfile([[-node.width / 2, -node.height / 2], [node.width / 2, -node.height / 2], [node.width / 2, node.height / 2], [-node.width / 2, node.height / 2]], path)); break
      case "ellipse": profiles.set(id, checkedProfile(Array.from({ length: node.segments }, (_, index) => {
        const angle = 2 * Math.PI * index / node.segments
        return [node.radiusX * Math.cos(angle), node.radiusY * Math.sin(angle)] as V2
      }), path)); break
      case "inset": profiles.set(id, insetProfile(profile(node.input), node.distance, path)); break
      case "bevel": profiles.set(id, bevelProfile(profile(node.input), node.radius, node.segments, path)); break
      case "box": meshes.set(id, boxMesh(node.size)); break
      case "cylinder": meshes.set(id, cylinderMesh(node.radius, node.height, node.segments)); break
      case "sphere": meshes.set(id, sphereMesh(node.radius, node.segments)); break
      case "extrude": meshes.set(id, extrudeMesh(profile(node.profile), node.depth, node.sideSlot ?? 0, node.capSlot ?? node.sideSlot ?? 0, path)); break
      case "revolve": meshes.set(id, revolveMesh(profile(node.profile), node.segments, node.capSlot ?? 0, path)); break
      case "sweep": meshes.set(id, sweepMesh(profile(node.profile), node.path, path)); break
      case "loft": meshes.set(id, loftMesh(profile(node.bottom), profile(node.top), node.height, path)); break
      case "transform": meshes.set(id, transformMesh(mesh(node.input), node.transform)); break
      case "mirror": meshes.set(id, mirrorMesh(mesh(node.input), AXIS_INDEX[node.axis], node.offset)); break
      case "array": meshes.set(id, arrayMesh(mesh(node.input), node.count, node.step)); break
      case "merge": meshes.set(id, mergeMeshes(node.inputs.map(mesh))); break
      case "boolean": meshes.set(id, booleanMesh(node, meshes, path)); break
      case "material-slot": {
        const source = mesh(node.input), copy = builder()
        copy.positions.push(...source.positions); copy.normals.push(...source.normals); copy.uvs.push(...source.uvs)
        copy.indices.push(...source.indices); copy.slots.push(...source.slots.map(() => node.slot)); copy.uvsSet = source.uvsSet
        meshes.set(id, copy); break
      }
      case "uv-project": meshes.set(id, projectUvs(mesh(node.input), node.projection)); break
    }
  }
  const mesh = freezeMesh(meshes.get(graph.output)!)
  if (mesh.vertices > estimate.vertices || mesh.triangles > estimate.triangles) {
    fail("Evaluated mesh exceeded its static budget estimate.", "geometry.output")
  }
  return deepFreezeJson({ mesh, estimate, graphSha256: spatialValueSha256({ domain: "slopcamera.spatial-geometry-graph.v1", graph }),
    ...(graph.nodes.some(node => node.kind === "boolean") ? { booleanCompiler: SPATIAL_GEOMETRY_BOOLEAN_COMPILER } : {}) })
}

// ---------------------------------------------------------------------------
// Deterministic GLB emission inside the closed parseSpatialGlb profile
// ---------------------------------------------------------------------------

const srgbToLinear = (value: number) => value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)

/**
 * Maps authored materials into the closed GLB profile: no extensions, so
 * unlit surfaces carry their color as emissive and emissive intensity is
 * clamped into the [0,1] emissiveFactor range.
 */
function materialToGlb(material: SpatialMaterial): { readonly baseColorLinear: readonly number[]; readonly metallic: number; readonly roughness: number; readonly alphaMode: "OPAQUE" | "BLEND"; readonly emissiveLinear?: readonly number[] } {
  const rgb = [1, 3, 5].map(index => srgbToLinear(Number.parseInt(material.color.slice(index, index + 2), 16) / 255))
  const baseColorLinear = [rgb[0]!, rgb[1]!, rgb[2]!, material.opacity]
  const alphaMode = material.opacity < 1 ? "BLEND" as const : "OPAQUE" as const
  if (material.kind === "unlit") {
    return { baseColorLinear, metallic: 0, roughness: 1, alphaMode, emissiveLinear: [rgb[0]!, rgb[1]!, rgb[2]!] }
  }
  const emissiveLinear = material.emissive === undefined ? undefined : (() => {
    const factor = Math.min(1, material.emissive.intensity)
    const e = [1, 3, 5].map(index => srgbToLinear(Number.parseInt(material.emissive!.color.slice(index, index + 2), 16) / 255) * factor)
    return e.every(value => value === 0) ? undefined : [e[0]!, e[1]!, e[2]!] as const
  })()
  return { baseColorLinear, metallic: material.metalness, roughness: material.roughness, alphaMode, ...(emissiveLinear === undefined ? {} : { emissiveLinear }) }
}

/**
 * Emits one bounded GLB 2.0 document: a single node and mesh with one
 * triangle primitive per used material slot, float32 POSITION/NORMAL and
 * optional TEXCOORD_0, and metallic-roughness materials resolved from the
 * declared slot table. Byte output is deterministic; the result parses under
 * the same closed profile as admitted GLB assets.
 */
export function emitSpatialGeometryGlb(mesh: SpatialGeometryMesh, materials: readonly SpatialMaterial[]): Uint8Array {
  if (materials.length < 1 || materials.length > SPATIAL_GEOMETRY_LIMITS.materialSlots) fail("GLB emission requires 1–16 material slots.")
  for (const material of materials) parseSpatialValue(SpatialMaterialSchema, material, "geometry material")
  const slotTriangles = new Map<number, number[]>()
  for (let index = 0; index < mesh.triangles; index++) {
    const slot = mesh.slots[index]!
    if (slot >= materials.length) fail(`Material slot ${slot} has no declared material.`)
    const list = slotTriangles.get(slot) ?? []
    list.push(mesh.indices[index * 3]!, mesh.indices[index * 3 + 1]!, mesh.indices[index * 3 + 2]!)
    slotTriangles.set(slot, list)
  }
  const slots = [...slotTriangles.keys()].sort((a, b) => a - b)
  const vertices = mesh.vertices
  const indexComponent = vertices <= 65_535 ? 5123 : 5125
  const indexBytes = indexComponent === 5123 ? 2 : 4
  const hasUvs = mesh.uvsProjected
  const positionBytes = vertices * 12, normalBytes = vertices * 12, uvBytes = hasUvs ? vertices * 8 : 0
  const indexRanges: { slot: number; byteOffset: number; byteLength: number; count: number }[] = []
  let binLength = positionBytes + normalBytes + uvBytes
  for (const slot of slots) {
    const count = slotTriangles.get(slot)!.length
    indexRanges.push({ slot, byteOffset: binLength, byteLength: count * indexBytes, count })
    binLength += count * indexBytes
    binLength = Math.ceil(binLength / 4) * 4
  }
  const bin = new Uint8Array(binLength), data = new DataView(bin.buffer)
  for (let index = 0; index < mesh.positions.length; index++) data.setFloat32(index * 4, mesh.positions[index]!, true)
  for (let index = 0; index < mesh.normals.length; index++) data.setFloat32(positionBytes + index * 4, mesh.normals[index]!, true)
  if (hasUvs) for (let index = 0; index < mesh.uvs.length; index++) data.setFloat32(positionBytes + normalBytes + index * 4, mesh.uvs[index]!, true)
  for (const range of indexRanges) {
    const indices = slotTriangles.get(range.slot)!
    for (let index = 0; index < indices.length; index++) {
      if (indexComponent === 5123) data.setUint16(range.byteOffset + index * 2, indices[index]!, true)
      else data.setUint32(range.byteOffset + index * 4, indices[index]!, true)
    }
  }
  const positions32 = new Float32Array(mesh.positions as number[])
  const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity]
  for (let index = 0; index < positions32.length; index += 3) {
    for (let axisIndex = 0; axisIndex < 3; axisIndex++) {
      low[axisIndex] = Math.min(low[axisIndex]!, positions32[index + axisIndex]!); high[axisIndex] = Math.max(high[axisIndex]!, positions32[index + axisIndex]!)
    }
  }
  const bufferViews = [
    { buffer: 0, byteOffset: 0, byteLength: positionBytes, target: 34962 },
    { buffer: 0, byteOffset: positionBytes, byteLength: normalBytes, target: 34962 },
    ...(hasUvs ? [{ buffer: 0, byteOffset: positionBytes + normalBytes, byteLength: uvBytes, target: 34962 }] : []),
    ...indexRanges.map(range => ({ buffer: 0, byteOffset: range.byteOffset, byteLength: range.byteLength, target: 34963 })),
  ]
  const accessors = [
    { bufferView: 0, componentType: 5126, count: vertices, type: "VEC3", min: low, max: high },
    { bufferView: 1, componentType: 5126, count: vertices, type: "VEC3" },
    ...(hasUvs ? [{ bufferView: 2, componentType: 5126, count: vertices, type: "VEC2" }] : []),
    ...indexRanges.map((range, index) => ({ bufferView: (hasUvs ? 3 : 2) + index, componentType: indexComponent, count: range.count, type: "SCALAR" })),
  ]
  const glbMaterials = slots.map(slot => {
    const resolved = materialToGlb(materials[slot]!)
    return {
      pbrMetallicRoughness: { baseColorFactor: resolved.baseColorLinear, metallicFactor: resolved.metallic, roughnessFactor: resolved.roughness },
      alphaMode: resolved.alphaMode, doubleSided: false,
      ...(resolved.emissiveLinear === undefined ? {} : { emissiveFactor: resolved.emissiveLinear }),
    }
  })
  const document = {
    asset: { version: "2.0", generator: SPATIAL_GEOMETRY_PROFILE },
    buffers: [{ byteLength: binLength }],
    bufferViews, accessors,
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: slots.map((_slot, index) => ({ attributes: { POSITION: 0, NORMAL: 1, ...(hasUvs ? { TEXCOORD_0: 2 } : {}) }, indices: (hasUvs ? 3 : 2) + index, material: index, mode: 4 })) }],
    materials: glbMaterials,
  }
  const rawJson = new TextEncoder().encode(JSON.stringify(document))
  const json = new Uint8Array(Math.ceil(rawJson.length / 4) * 4).fill(32); json.set(rawJson)
  const bytes = new Uint8Array(28 + json.length + bin.length), view = new DataView(bytes.buffer)
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, bytes.length, true)
  view.setUint32(12, json.length, true); view.setUint32(16, 0x4e4f534a, true); bytes.set(json, 20)
  view.setUint32(20 + json.length, bin.length, true); view.setUint32(24 + json.length, 0x004e4942, true); bytes.set(bin, 28 + json.length)
  return bytes
}
