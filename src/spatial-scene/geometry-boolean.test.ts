import { expect, test } from "bun:test"
import fc from "fast-check"
import { evaluateSpatialGeometry, estimateSpatialGeometryGraph, SPATIAL_GEOMETRY_BOOLEAN_COMPILER, type SpatialGeometryMesh } from "./geometry.js"

const transform = (position: readonly number[]) => ({ position, rotation: [0, 0, 0, 1], scale: [1, 1, 1] })
const graph = (operation: "difference" | "union" | "intersection", position = [0.6, 0, 0], size = [2, 2, 2]) => ({
  kind: "slopcamera.spatial-geometry-graph", schemaVersion: 1,
  nodes: [{ id: "a", kind: "box", size: [2, 2, 2] }, { id: "raw", kind: "box", size },
    { id: "b", kind: "transform", input: "raw", transform: transform(position) },
    operation === "difference" ? { id: "result", kind: "boolean", operation, a: "a", cutters: ["b"] }
      : { id: "result", kind: "boolean", operation, a: "a", b: "b" }], output: "result",
})
function signedVolume(mesh: SpatialGeometryMesh): number {
  let sum = 0
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i]! * 3, b = mesh.indices[i + 1]! * 3, c = mesh.indices[i + 2]! * 3, p = mesh.positions
    sum += (p[a]! * (p[b + 1]! * p[c + 2]! - p[b + 2]! * p[c + 1]!)
      + p[a + 1]! * (p[b + 2]! * p[c]! - p[b]! * p[c + 2]!)
      + p[a + 2]! * (p[b]! * p[c + 1]! - p[b + 1]! * p[c]!)) / 6
  }
  return sum
}
function normalsFollowFaces(mesh: SpatialGeometryMesh): void {
  let faces = 0
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const ids = mesh.indices.slice(i, i + 3), a = ids[0]! * 3, b = ids[1]! * 3, c = ids[2]! * 3, p = mesh.positions
    const u = [p[b]! - p[a]!, p[b + 1]! - p[a + 1]!, p[b + 2]! - p[a + 2]!]
    const v = [p[c]! - p[a]!, p[c + 1]! - p[a + 1]!, p[c + 2]! - p[a + 2]!]
    const normal = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!]
    const length = Math.hypot(...normal)
    if (length < 1e-10) continue
    faces++
    for (const id of ids) {
      const n = mesh.normals.slice(id * 3, id * 3 + 3)
      expect(Math.hypot(...n)).toBeCloseTo(1, 8)
      expect(normal.reduce((total, value, axis) => total + value / length * n[axis]!, 0)).toBeCloseTo(1, 8)
    }
  }
  expect(faces).toBeGreaterThan(0)
}

test("boolean surface normals follow three-dimensional face winding including reveals", () => {
  const mesh = evaluateSpatialGeometry(graph("difference", [0.2, -0.4, 0], [0.7, 1.1, 3])).mesh
  normalsFollowFaces(mesh)
  expect(signedVolume(mesh)).toBeCloseTo(8 - 0.7 * 1.1 * 2, 6)
})

test("coplanar box faces have one deterministic owner for union and intersection", () => {
  for (const operation of ["union", "intersection"] as const) {
    const mesh = evaluateSpatialGeometry(graph(operation)).mesh
    expect(signedVolume(mesh)).toBeCloseTo(operation === "union" ? 10.4 : 5.6, 6)
    normalsFollowFaces(mesh)
  }
  for (const operation of ["union", "intersection"] as const) {
    const mesh = evaluateSpatialGeometry(graph(operation, [0, 0, 0])).mesh
    expect(signedVolume(mesh)).toBeCloseTo(8, 6)
    expect(mesh.triangles).toBe(12)
  }
})

test("a through cutter sharing the floor plane does not duplicate coincident fragments", () => {
  const result = evaluateSpatialGeometry(graph("difference", [0, -0.5, 0], [0.8, 1, 3]))
  expect(signedVolume(result.mesh)).toBeCloseTo(8 - 0.8 * 1 * 2, 6)
  const triangles = new Set<string>()
  for (let i = 0; i < result.mesh.indices.length; i += 3) {
    const triangle = result.mesh.indices.slice(i, i + 3).map(index => result.mesh.positions.slice(index * 3, index * 3 + 3).map(value => Number(value.toFixed(9))).join(",")).sort().join("|")
    expect(triangles.has(triangle)).toBe(false); triangles.add(triangle)
  }
  normalsFollowFaces(result.mesh)
})

test("a near-aligned through cutter retains the shrunk property regression", () => {
  const mesh = evaluateSpatialGeometry(graph("difference", [0.1, 0, 0], [2, 2, 3])).mesh
  expect(signedVolume(mesh)).toBeCloseTo(0.4, 6)
  normalsFollowFaces(mesh)
})

test("overlapping cutters remove their union without internal cap surfaces", () => {
  const input = {
    kind: "slopcamera.spatial-geometry-graph", schemaVersion: 1,
    nodes: [{ id: "a", kind: "box", size: [2, 2, 2] }, { id: "cut", kind: "box", size: [0.8, 1, 3] },
      { id: "left", kind: "transform", input: "cut", transform: transform([-0.2, 0, 0]) },
      { id: "right", kind: "transform", input: "cut", transform: transform([0.2, 0, 0]) },
      { id: "result", kind: "boolean", operation: "difference", a: "a", cutters: ["left", "right"] }], output: "result",
  }
  const mesh = evaluateSpatialGeometry(input).mesh
  expect(signedVolume(mesh)).toBeCloseTo(8 - 1.2 * 1 * 2, 6)
  normalsFollowFaces(mesh)
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const center = [0, 0, 0]
    for (const index of mesh.indices.slice(i, i + 3)) {
      for (let axis = 0; axis < 3; axis++) center[axis] = center[axis]! + mesh.positions[index * 3 + axis]! / 3
    }
    const internalCap = Math.abs(center[0]!) < 0.6 - 1e-8 && Math.abs(center[1]!) < 0.5 - 1e-8 && Math.abs(center[2]!) < 1 - 1e-8
    expect(internalCap).toBe(false)
  }
})

test("boolean revision is additive while nonboolean evaluation identity is preserved", () => {
  const solid = evaluateSpatialGeometry({ kind: "slopcamera.spatial-geometry-graph", schemaVersion: 1,
    nodes: [{ id: "box", kind: "box", size: [2, 2, 2] }], output: "box" })
  expect(solid).not.toHaveProperty("booleanCompiler")
  expect(Object.keys(solid).sort()).toEqual(["estimate", "graphSha256", "mesh"])
  const cut = evaluateSpatialGeometry(graph("difference"))
  expect(cut.booleanCompiler).toBe(SPATIAL_GEOMETRY_BOOLEAN_COMPILER)
})

test("cut reveal faces retain the cutter's material slot and interpolated UVs", () => {
  const mesh = evaluateSpatialGeometry({ kind: "slopcamera.spatial-geometry-graph", schemaVersion: 1, nodes: [
    { id: "body", kind: "box", size: [2, 2, 2] }, { id: "raw", kind: "box", size: [0.8, 1, 3] },
    { id: "uv", kind: "uv-project", input: "raw", projection: { mode: "planar", axis: "z", scale: 1 } },
    { id: "cut", kind: "material-slot", input: "uv", slot: 1 },
    { id: "result", kind: "boolean", operation: "difference", a: "body", cutters: ["cut"] },
  ], output: "result" }).mesh
  expect(new Set(mesh.slots)).toEqual(new Set([0, 1]))
  expect(mesh.uvsProjected).toBe(true)
  for (let triangle = 0; triangle < mesh.triangles; triangle++) {
    if (mesh.slots[triangle] !== 1) continue
    for (const index of mesh.indices.slice(triangle * 3, triangle * 3 + 3)) {
      expect(mesh.uvs[index * 2]).toBeCloseTo(mesh.positions[index * 3]!, 8)
      expect(mesh.uvs[index * 2 + 1]).toBeCloseTo(mesh.positions[index * 3 + 1]!, 8)
    }
  }
})

test("concave inputs remain outside the closed hull boolean domain", () => {
  expect(() => evaluateSpatialGeometry({ kind: "slopcamera.spatial-geometry-graph", schemaVersion: 1, nodes: [
    { id: "profile", kind: "profile", points: [[-1, -1], [1, -1], [1, 0], [0, 0], [0, 1], [-1, 1]] },
    { id: "body", kind: "extrude", profile: "profile", depth: 1 }, { id: "cut", kind: "box", size: [0.4, 0.4, 2] },
    { id: "result", kind: "boolean", operation: "difference", a: "body", cutters: ["cut"] },
  ], output: "result" })).toThrow("closed hull meshes")
})

test("conservative plane partition budgets reject complexity before mesh evaluation", () => {
  const input = (count: number) => ({ kind: "slopcamera.spatial-geometry-graph", schemaVersion: 1,
    nodes: [{ id: "body", kind: "box", size: [20, 5, 0.4] }, { id: "raw", kind: "box", size: [1.5, 2.5, 0.5] },
      ...Array.from({ length: count }, (_, index) => ({ id: `cut_${index}`, kind: "transform", input: "raw", transform: transform([(index - (count - 1) / 2) * 2.2, 0, 0]) })),
      { id: "result", kind: "boolean", operation: "difference", a: "body", cutters: Array.from({ length: count }, (_, index) => `cut_${index}`) }], output: "result" })
  const result = evaluateSpatialGeometry(input(6))
  expect(result.mesh.vertices).toBeLessThanOrEqual(result.estimate.vertices)
  expect(result.mesh.triangles).toBeLessThanOrEqual(result.estimate.triangles)
  expect(() => estimateSpatialGeometryGraph(input(7))).toThrow("budget before evaluation")
  expect(() => evaluateSpatialGeometry(input(7))).toThrow("budget before evaluation")
})

test("bounded boolean estimates enclose translated and coplanar evaluated meshes", () => {
  fc.assert(fc.property(fc.integer({ min: 1, max: 15 }), fc.integer({ min: -12, max: 12 }),
    fc.constantFrom("difference", "union", "intersection" as const), (x, y, operation) => {
      const input = graph(operation, [x / 10, y / 20, 0], [2, 2, 3])
      const estimate = estimateSpatialGeometryGraph(input), result = evaluateSpatialGeometry(input)
      expect(result.mesh.triangles).toBeLessThanOrEqual(estimate.triangles)
      expect(result.mesh.vertices).toBeLessThanOrEqual(estimate.vertices)
      expect(result.mesh.positions.every(Number.isFinite)).toBe(true)
      normalsFollowFaces(result.mesh)
      expect(evaluateSpatialGeometry(input).mesh).toEqual(result.mesh)
    }), { numRuns: 24, seed: 732114 })
})

test("rotated boolean boundaries separate occupied and empty space with outward normals", () => {
  fc.assert(fc.property(fc.integer({ min: 1, max: 15 }), fc.constantFrom("difference", "union", "intersection" as const), (angleStep, operation) => {
    const angle = angleStep * Math.PI / 32, sine = Math.sin(angle), cosine = Math.cos(angle)
    const input = graph(operation, [0.35, 0.1, 0], [1.4, 1.2, 3])
    input.nodes[2] = { id: "b", kind: "transform", input: "raw", transform: {
      position: [0.35, 0.1, 0], rotation: [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)], scale: [1, 1, 1],
    } }
    const inside = (point: readonly number[]): boolean => {
      const a = point.every(value => Math.abs(value) < 1)
      const x = point[0]! - 0.35, y = point[1]! - 0.1
      const b = Math.abs(cosine * x + sine * y) < 0.7 && Math.abs(-sine * x + cosine * y) < 0.6 && Math.abs(point[2]!) < 1.5
      return operation === "difference" ? a && !b : operation === "union" ? a || b : a && b
    }
    const result = evaluateSpatialGeometry(input), mesh = result.mesh
    expect(mesh.vertices).toBeLessThanOrEqual(result.estimate.vertices)
    expect(mesh.triangles).toBeLessThanOrEqual(result.estimate.triangles)
    normalsFollowFaces(mesh)
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const center = [0, 0, 0], first = mesh.indices[i]! * 3
      for (const index of mesh.indices.slice(i, i + 3)) {
        for (let axis = 0; axis < 3; axis++) center[axis] = center[axis]! + mesh.positions[index * 3 + axis]! / 3
      }
      const offset = (side: number) => center.map((value, axis) => value + side * 1e-6 * mesh.normals[first + axis]!)
      expect(inside(offset(1))).toBe(false)
      expect(inside(offset(-1))).toBe(true)
    }
  }), { numRuns: 18, seed: 426930 })
})
