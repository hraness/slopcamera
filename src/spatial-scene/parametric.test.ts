import { expect, test } from "bun:test"
import { emitSpatialParametric, estimateSpatialParametric, mergeSpatialParametricOutput } from "./parametric.js"
import { inspectSpatialDesign } from "./design.js"
import { parseSpatialGlb } from "./gltf.js"
import { spatialAssetManifestSha256 } from "./identity.js"

const material = { kind: "standard", color: "#bcb1a0", opacity: 1, metalness: 0, roughness: 0.6 }
const fixtures = [
  { kind: "wall", length: 6, height: 3, thickness: 0.25, material },
  { kind: "floor", width: 6, depth: 5, thickness: 0.25, material },
  { kind: "stairs", width: 2, risers: 8, riserHeight: 0.2, treadDepth: 0.3, material },
  { kind: "arch", width: 2, height: 3.2, springline: 2, depth: 0.3, material },
  { kind: "column", height: 3, radius: 0.25, segments: 8, material },
  { kind: "window", width: 2, height: 3, frameWidth: 0.1, depth: 0.2, material },
  { kind: "roof", style: "gable", width: 6, depth: 5, rise: 2, material },
  { kind: "pipe", radius: 0.1, segments: 8, path: [[0, 0, 0], [0, 2, 0], [1, 3, 0]], material },
  { kind: "trim", length: 3, size: 0.1, profile: "square", material },
  { kind: "scatter", count: 12, area: { width: 10, depth: 10 }, seed: 17, subject: { shape: "box", size: [0.2, 0.3, 0.2] }, material },
]

for (const spec of fixtures) test(`retained ${spec.kind} output remains admissible, deterministic and below its static budget`, () => {
  const estimate = estimateSpatialParametric(spec)
  const request = { kind: "slopcamera.spatial-parametric-request", schemaVersion: 1, generatorId: `generator_${spec.kind}`, spec }
  const output = emitSpatialParametric(request)
  expect(emitSpatialParametric(request).receiptSha256).toBe(output.receiptSha256)
  expect(output.artifacts.reduce((sum, artifact) => sum + artifact.bytes.length, 0)).toBeLessThanOrEqual(estimate.bytes)
  const scene = mergeSpatialParametricOutput(undefined, output)
  expect(scene.assets).toHaveLength(estimate.assets)
  for (const artifact of output.artifacts.filter(artifact => artifact.path.endsWith(".glb"))) expect(() => parseSpatialGlb(artifact.bytes)).not.toThrow()
  for (const fact of output.facts) {
    const manifest = output.manifests.find(item => item.payload.sha256 === fact.facts.subject.sha256)!
    expect(fact.facts.subjectManifestSha256).toBe(spatialAssetManifestSha256(manifest))
  }
})

test("semantic invalid dimensions and unavailable retained materials fail preflight", () => {
  expect(() => estimateSpatialParametric({ kind: "arch", width: 2, height: 3, springline: 3, depth: 0.3, material })).toThrow("springline")
  expect(() => estimateSpatialParametric({ kind: "arch", width: 2, height: 3, springline: 2, depth: 0.3, material })).toThrow("positive material")
  expect(() => estimateSpatialParametric({ kind: "window", width: 1, height: 1, frameWidth: 1, depth: 0.1, material })).toThrow()
  expect(() => estimateSpatialParametric({ kind: "wall", length: 1, height: 1, thickness: 0.2, material, openings: [{ kind: "rect", center: [1, 0], width: 2, height: 2 }] })).toThrow("inside")
  for (const unsupported of [{ ...material, map: "asset_image" }, { ...material, kind: "pbr" }]) {
    const spec = { kind: "floor", width: 1, depth: 1, thickness: 0.1, material: unsupported }
    expect(() => estimateSpatialParametric(spec)).toThrow("untextured standard or unlit")
    expect(() => inspectSpatialDesign({ kind: "slopcamera.spatial-design", schemaVersion: 1, designId: "floor", parameters: [], stages: [{ kind: "parametric", stageId: "floor", spec }] })).toThrow("untextured standard or unlit")
  }
  const spec = { kind: "geometry", graph: { kind: "slopcamera.spatial-geometry-graph", schemaVersion: 1,
    nodes: [{ id: "box", kind: "box", size: [1, 1, 1] }, { id: "slot", kind: "material-slot", input: "box", slot: 1 }], output: "slot" }, materials: [material] }
  expect(() => estimateSpatialParametric(spec)).toThrow("no declared material")
})
