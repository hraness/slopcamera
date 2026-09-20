import { expect, test } from "bun:test"
import fc from "fast-check"
import { parseSpatialGlb } from "./gltf.js"
import { spatialValueSha256 } from "./identity.js"
import { SPATIAL_GEOMETRY_PROFILE, SPATIAL_GEOMETRY_BOOLEAN_COMPILER } from "./geometry.js"
import { composeTransform, multiplyTransforms, transformPoint, type Vec3 } from "./math.js"
import { emitSpatialParametric, estimateSpatialParametric, SPATIAL_PARAMETRIC_WALL_COMPILER } from "./parametric.js"

const material = { kind: "standard", color: "#bcb1a0", opacity: 1, metalness: 0, roughness: 0.6 }
type Triangle = readonly [Vec3, Vec3, Vec3]
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** Two-sided ray/triangle intersection against the public emitter's real GLB.
 * This deliberately knows nothing about wall planner nodes or cutter placement. */
function solidAlong(triangles: readonly Triangle[], origin: Vec3, direction: Vec3 = [0, 0, -1]): boolean {
  return triangles.some(([a, b, c]) => {
    const edge1 = sub(b, a), edge2 = sub(c, a), h = cross(direction, edge2), determinant = dot(edge1, h)
    if (Math.abs(determinant) < 1e-10) return false
    const s = sub(origin, a), u = dot(s, h) / determinant
    if (u < -1e-8 || u > 1 + 1e-8) return false
    const q = cross(s, edge1), v = dot(direction, q) / determinant
    return v >= -1e-8 && u + v <= 1 + 1e-8 && dot(edge2, q) / determinant > 1e-8
  })
}

function wallTriangles(spec: Record<string, unknown>): readonly Triangle[] {
  const output = emitSpatialParametric({ kind: "slopcamera.spatial-parametric-request", schemaVersion: 1,
    generatorId: "generator_wall_openings", spec: { kind: "wall", length: 6, height: 6, thickness: 0.4, material, ...spec } })
  const artifact = output.artifacts.find(item => item.path.endsWith("-lod0.glb"))!
  const geometry = parseSpatialGlb(artifact.bytes).evaluate({ metersPerUnit: 1, sourceUp: "y", timeUs: 0 })
  const triangles: Triangle[] = [], entityTransform = composeTransform(output.entities[0]!.transform)
  for (const primitive of geometry.primitives) {
    const matrix = multiplyTransforms(entityTransform, primitive.matrix)
    const indices = primitive.indices ?? Array.from({ length: primitive.positions.length / 3 }, (_, index) => index)
    const point = (index: number): Vec3 => transformPoint(matrix, [primitive.positions[index * 3]!, primitive.positions[index * 3 + 1]!, primitive.positions[index * 3 + 2]!])
    for (let index = 0; index < indices.length; index += 3) triangles.push([point(indices[index]!), point(indices[index + 1]!), point(indices[index + 2]!)])
  }
  return triangles
}

test("emitted rectangular openings use sill heights measured from the wall base", () => {
  const solid = wallTriangles({})
  expect(solidAlong(solid, [0.1, 1.5, 2])).toBe(true)
  expect(solidAlong(solid, [3.1, 1.5, 2])).toBe(false)
  const wall = wallTriangles({ openings: [{ kind: "rect", center: [0, 0.5], width: 1, height: 2 }] })
  expect(solidAlong(wall, [0.1, 1.5, 2])).toBe(false)
  expect(solidAlong(wall, [0.1, 0.25, 2])).toBe(true)
  expect(solidAlong(wall, [0.1, 4.5, 2])).toBe(true)
  expect(solidAlong(wall, [-0.7, 1.5, 2])).toBe(true)
})

test("emitted arch openings retain curved shoulders and masonry below raised sills", () => {
  const wall = wallTriangles({ height: 8, openings: [{ kind: "arch", center: [0, 0.5], width: 2, height: 3 }] })
  expect(solidAlong(wall, [0.1, 1.5, 2])).toBe(false)
  expect(solidAlong(wall, [0.1, 3.35, 2])).toBe(false)
  expect(solidAlong(wall, [0.85, 3.35, 2])).toBe(true)
  expect(solidAlong(wall, [-0.85, 3.35, 2])).toBe(true)
  expect(solidAlong(wall, [0.1, 0.25, 2])).toBe(true)
  expect(solidAlong(wall, [0.1, 7.35, 2])).toBe(true)
})

test("a semicircular opening of height equal to its radius does not cut below its sill", () => {
  const wall = wallTriangles({ openings: [{ kind: "arch", center: [0, 1], width: 2, height: 1 }] })
  expect(solidAlong(wall, [0.1, 0.85, 2])).toBe(true)
  expect(solidAlong(wall, [0.1, 1.85, 2])).toBe(false)
  expect(solidAlong(wall, [0.85, 1.85, 2])).toBe(true)
  expect(() => estimateSpatialParametric({ kind: "wall", length: 6, height: 6, thickness: 0.4, material,
    openings: [{ kind: "arch", center: [0, 1], width: 2, height: 0.99 }] })).toThrow("rise exceeds its height")
})

test("floor-level rect and arch doorways stay open down to the base without changing adjacent feet", () => {
  const wall = wallTriangles({ openings: [
    { kind: "rect", center: [-1.5, 0], width: 1, height: 2.2 },
    { kind: "arch", center: [1.2, 0], width: 1.6, height: 2.5 },
  ] })
  for (const x of [-1.5, 1.2]) {
    expect(solidAlong(wall, [x, 0.05, 2])).toBe(false)
    expect(solidAlong(wall, [x, 1.5, 2])).toBe(false)
  }
  expect(solidAlong(wall, [0, 0.05, 2])).toBe(true)
  expect(solidAlong(wall, [0, -0.05, 2])).toBe(false)
})

test("wall placement transforms keep the authored base and opening coordinates together", () => {
  const wall = wallTriangles({ openings: [{ kind: "rect", center: [0, 0.5], width: 1, height: 2 }],
    transform: { position: [10, 2, -5], rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2], scale: [2, 1.5, 0.75] } })
  expect(solidAlong(wall, [12, 4.25, -5.2], [-1, 0, 0])).toBe(false)
  expect(solidAlong(wall, [12, 8.75, -5.2], [-1, 0, 0])).toBe(true)
  expect(solidAlong(wall, [12, 4.25, -3.6], [-1, 0, 0])).toBe(true)
  expect(solidAlong(wall, [12, 1.9, -3.6], [-1, 0, 0])).toBe(false)
})

test("short walls preserve a floor opening under a shallow lintel", () => {
  // Named regression from the occupancy property's shrunk [0, 4, 2] case.
  const wall = wallTriangles({ height: 0.6, openings: [{ kind: "rect", center: [0.3, 0], width: 1.2, height: 0.4 }] })
  expect(solidAlong(wall, [0.4, 0.2, 2])).toBe(false)
  expect(solidAlong(wall, [0.4, 0.5, 2])).toBe(true)
})

test("rectangular aperture occupancy is invariant under changes to wall height and sill elevation", () => {
  fc.assert(fc.property(
    fc.integer({ min: 0, max: 15 }), fc.integer({ min: 4, max: 20 }), fc.integer({ min: 2, max: 30 }),
    (sillTenths, openingTenths, headroomTenths) => {
      const sill = sillTenths / 10, openingHeight = openingTenths / 10, height = sill + openingHeight + headroomTenths / 10
      const wall = wallTriangles({ height, openings: [{ kind: "rect", center: [0.3, sill], width: 1.2, height: openingHeight }] })
      expect(solidAlong(wall, [0.4, sill + openingHeight / 2, 2])).toBe(false)
      expect(solidAlong(wall, [0.4, sill + openingHeight + 0.1, 2])).toBe(true)
      expect(solidAlong(wall, [-0.5, sill + openingHeight / 2, 2])).toBe(true)
      if (sill > 0) expect(solidAlong(wall, [0.4, sill / 2, 2])).toBe(true)
  }), { numRuns: 40, seed: 7021309 })
})

test("arch crowns retain symmetric solid shoulders across sill and jamb dimensions", () => {
  fc.assert(fc.property(
    fc.integer({ min: 4, max: 10 }), fc.integer({ min: 0, max: 15 }), fc.integer({ min: 1, max: 12 }),
    (radiusTenths, stemTenths, sillTenths) => {
      const radius = radiusTenths / 10, stem = stemTenths / 10, sill = sillTenths / 10
      const wall = wallTriangles({ height: sill + stem + radius + 0.5,
        openings: [{ kind: "arch", center: [0, sill], width: radius * 2, height: radius + stem }] })
      expect(solidAlong(wall, [radius * 0.1, sill + stem + radius * 0.9, 2])).toBe(false)
      for (const side of [-1, 1]) expect(solidAlong(wall, [side * radius * 0.9, sill + stem + radius * 0.9, 2])).toBe(true)
      expect(solidAlong(wall, [radius * 0.1, sill / 2, 2])).toBe(true)
    }), { numRuns: 24, seed: 7021310 })
})

test("wall planner revision preserves retained entity identity and unrelated generator receipts", () => {
  const request = { kind: "slopcamera.spatial-parametric-request", schemaVersion: 1, generatorId: "generator_identity_fixture", seed: 17,
    spec: { kind: "wall", length: 6, height: 3, thickness: 0.25, material } }
  const wall = emitSpatialParametric(request)
  expect(wall.receipt.compiler).toBe(SPATIAL_PARAMETRIC_WALL_COMPILER)
  expect(wall.generator.sourceSha256).not.toBe(spatialValueSha256({ domain: "slopcamera.parametric-source.v1", profile: SPATIAL_GEOMETRY_PROFILE, kind: "wall" }))
  expect(wall.generator.execution.kind).toBe("attempt")
  expect(wall.generator.execution.runtimeSha256).not.toBe(spatialValueSha256({ domain: "slopcamera.parametric-runtime.v1", profile: SPATIAL_GEOMETRY_PROFILE }))
  expect(wall.entities[0]!.entityId).toBe("entity_261d4f440455d2b093f6402fc4863438e5888c7f375eeb7b8359eae318da93e4")
  expect(emitSpatialParametric(request).receiptSha256).toBe(wall.receiptSha256)
  const { seed: _seed, ...defaultSeedRequest } = request
  expect(emitSpatialParametric(defaultSeedRequest).receiptSha256).toBe(emitSpatialParametric(defaultSeedRequest).receiptSha256)
  const floor = emitSpatialParametric({ ...request, spec: { kind: "floor", width: 6, depth: 5, thickness: 0.25, material } })
  expect(floor.receipt).not.toHaveProperty("compiler")
  expect(floor.receipt).not.toHaveProperty("booleanCompiler")
  expect(floor.generator.sourceSha256).toBe("1f71ef95378e890d712d59775c225ccb2854dbfb4f34c462a91df89c67ca4b3b")
  expect(floor.receiptSha256).toBe("9608cc50b5ad3d9600dbf0bb232afe4ae2e35a80892f77d72db09b04e0204d70")
})

test("boolean compiler identity is bound only when a retained stage uses the changed kernel", () => {
  const request = { kind: "slopcamera.spatial-parametric-request", schemaVersion: 1, generatorId: "generator_boolean_identity", seed: 17 }
  const graph = { kind: "slopcamera.spatial-geometry-graph", schemaVersion: 1, nodes: [
    { id: "body", kind: "box", size: [3, 3, 0.3] },
    { id: "opening", kind: "box", size: [1, 1, 1] },
    { id: "cut", kind: "boolean", operation: "difference", a: "body", cutters: ["opening"] },
  ], output: "cut" }
  const output = emitSpatialParametric({ ...request, spec: { kind: "geometry", graph, materials: [material] } })
  expect(output.receipt).not.toHaveProperty("compiler")
  expect(output.receipt.booleanCompiler).toBe(SPATIAL_GEOMETRY_BOOLEAN_COMPILER)
  expect(output.generator.sourceSha256).not.toBe(spatialValueSha256({ domain: "slopcamera.parametric-source.v1", profile: SPATIAL_GEOMETRY_PROFILE, kind: "geometry" }))
  const plain = emitSpatialParametric({ ...request, spec: { kind: "geometry", graph: { ...graph, nodes: [graph.nodes[0]], output: "body" }, materials: [material] } })
  expect(plain.receipt).not.toHaveProperty("booleanCompiler")
  expect(plain.generator.sourceSha256).toBe(spatialValueSha256({ domain: "slopcamera.parametric-source.v1", profile: SPATIAL_GEOMETRY_PROFILE, kind: "geometry" }))
  const wall = emitSpatialParametric({ ...request, spec: { kind: "wall", length: 4, height: 3, thickness: 0.3, material,
    openings: [{ kind: "rect", center: [0, 0], width: 1, height: 2 }] } })
  expect(wall.receipt.compiler).toBe(SPATIAL_PARAMETRIC_WALL_COMPILER)
  expect(wall.receipt.booleanCompiler).toBe(SPATIAL_GEOMETRY_BOOLEAN_COMPILER)
})
