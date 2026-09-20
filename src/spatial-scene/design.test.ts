import { expect, test } from "bun:test"
import fc from "fast-check"
import { canonicalJson } from "../code/canonical-json.js"
import { compileSpatialDesign, editSpatialDesignParameters, inspectSpatialDesign, parseSpatialDesign, spatialDesignGeneratorId, type SpatialDesignScalarExpression } from "./design.js"
import { parseSpatialScene, spatialValueSha256 } from "./identity.js"
import { evaluateSpatialScene } from "./evaluate.js"
import { emitSpatialParametric, estimateSpatialParametric } from "./parametric.js"

const material = { kind: "standard", color: "#d8c9ae", opacity: 1, metalness: 0, roughness: 0.7 } as const
const transform = { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } as const
function design() {
  return {
    kind: "slopcamera.spatial-design", schemaVersion: 1, designId: "colonnade",
    parameters: [{ name: "height", value: 3, min: 1, max: 10, step: 0.5, unit: "m" }, { name: "width", value: 6, min: 2, max: 20, step: 0.5, unit: "m" }],
    values: [{ name: "halfWidth", expression: { op: "div", args: [{ $param: "width" }, 2] } },
      { name: "spacing", expression: { op: "div", args: [{ $value: "halfWidth" }, 3] } }],
    constraints: [{ name: "proportion", left: { $param: "height" }, operator: "lte", right: { $param: "width" }, message: "Height must not exceed width." }],
    stages: [
      { kind: "parametric", stageId: "columns", spec: { kind: "column", height: { $param: "height" }, radius: 0.2, segments: 8, material,
        transform: { ...transform, position: [{ $value: "halfWidth" }, 0, 0] }, editable: ["transform", "color"] } },
      { kind: "geometry", stageId: "slab", graph: { kind: "slopcamera.spatial-geometry-graph", schemaVersion: 1,
        nodes: [{ id: "slab", kind: "box", size: [{ $param: "width" }, 0.2, { $expr: { op: "mul", args: [{ $value: "spacing" }, 2] } }] }], output: "slab" },
        materials: [material], castShadow: true, receiveShadow: true },
    ],
  }
}

function withExpression(expression: unknown) {
  const source = design()
  return { ...source, values: [{ name: "halfWidth", expression }, { name: "spacing", expression: 1 }] }
}

test("inspection resolves reusable scalar outputs and transitive parameter dependencies without emitting payloads", () => {
  const result = inspectSpatialDesign(design())
  expect(result.valueOrder).toEqual(["halfWidth", "spacing"])
  expect(result.values.map(value => value.value)).toEqual([3, 1])
  expect(result.stages[1]!.dependencies).toEqual({ parameters: ["width"], values: ["halfWidth", "spacing"] })
  expect(result.constraints).toEqual([{ name: "proportion", left: 3, operator: "lte", right: 6, passed: true }])
  expect(result.estimate).toMatchObject({ parts: 2, assets: 5 })
  expect(result.estimate.vertices).toBeGreaterThan(0)
  expect("outputs" in result).toBe(false)
  expect(Object.isFrozen(result.design)).toBe(true)
})

test("compilation emits deterministic retained assets, shadows and independent stage receipts", () => {
  const input = design(), before = JSON.stringify(input)
  const first = compileSpatialDesign(input), second = compileSpatialDesign(input)
  expect(first.receiptSha256).toBe(second.receiptSha256)
  expect(first.receipt.sceneSha256).toBe(spatialValueSha256(first.scene))
  expect(first.scene.entities).toHaveLength(2)
  for (const [index, output] of first.outputs.entries()) {
    for (const [artifactIndex, artifact] of output.artifacts.entries()) expect(artifact.bytes).toEqual(second.outputs[index]!.artifacts[artifactIndex]!.bytes)
  }
  const slab = first.scene.entities.find(entity => entity.origin.kind === "generated" && entity.origin.key === "geometry")!
  expect(slab).toMatchObject({ castShadow: true, receiveShadow: true })
  expect(JSON.stringify(input)).toBe(before)
})

test("parameter changes propagate only to dependent stages and preserve identity plus declared overrides", () => {
  const first = compileSpatialDesign(design())
  const column = first.outputs[0]!.entities[0]!
  const override = { entityId: column.entityId, property: "transform", value: { ...transform, position: [4, 0, 2] } } as const
  const base = parseSpatialScene({ ...first.scene, overrides: [override] })
  const second = compileSpatialDesign(design(), { scene: base, parameters: { height: 4 } })
  expect(second.receipt.stages.map(stage => stage.changed)).toEqual([true, false])
  expect(second.outputs[0]!.entities[0]!.entityId).toBe(column.entityId)
  expect(second.scene.overrides).toEqual([override])
  const effective = evaluateSpatialScene(second.scene, { cameraId: "camera_main", timeUs: 0 }).entities.find(entity => entity.entity.entityId === column.entityId)!
  expect(effective.entity.transform.position).toEqual([4, 0, 2])
  expect(first.outputs[0]!.receiptSha256).not.toBe(second.outputs[0]!.receiptSha256)
  expect(first.outputs[1]!.receiptSha256).toBe(second.outputs[1]!.receiptSha256)
  expect(second.scene.assets).toHaveLength(first.scene.assets.length)
  expect(compileSpatialDesign(second.design).outputs.map(output => output.receiptSha256)).toEqual(second.outputs.map(output => output.receiptSha256))
})

test("recompilation with identical inputs is stable and refuses a removed retained stage", () => {
  const first = compileSpatialDesign(design())
  const repeated = compileSpatialDesign(design(), { scene: first.scene })
  expect(repeated.scene).toEqual(first.scene)
  expect(repeated.receipt.stages.every(stage => !stage.changed)).toBe(true)
  const fewer = { ...design(), stages: design().stages.slice(1) }
  expect(() => compileSpatialDesign(fewer, { scene: first.scene })).toThrow("removed a retained stage")
})

test("batch edits validate bounds, step, counts and constraints atomically", () => {
  const input = design(), before = canonicalJson(input)
  expect(() => editSpatialDesignParameters(input, { height: 4, width: 2 })).toThrow("Height must not exceed width")
  expect(() => editSpatialDesignParameters(input, { width: 7.2 })).toThrow("follow step")
  expect(() => editSpatialDesignParameters(input, { width: 30 })).toThrow("between")
  expect(() => editSpatialDesignParameters(input, { missing: 3 })).toThrow("Unknown parameter")
  expect(() => editSpatialDesignParameters(input, { width: NaN })).toThrow()
  expect(() => parseSpatialDesign({ ...input, parameters: [{ name: "count", min: 0, max: 10, value: 1.5, unit: "count" }] })).toThrow("integer")
  expect(() => parseSpatialDesign({ ...input, parameters: [{ name: "count", min: 5, max: 1, value: 3 }] })).toThrow("min must not exceed max")
  const changed = editSpatialDesignParameters(input, { height: 4, width: 8 })
  expect(inspectSpatialDesign(changed).parameters).toEqual({ height: 4, width: 8 })
  expect(canonicalJson(input)).toBe(before)
})

test("rejects missing references, cycles, duplicate IDs, wrong destination types and executable expressions", () => {
  expect(() => parseSpatialDesign(withExpression({ $value: "spacing" }))).not.toThrow()
  expect(() => parseSpatialDesign(withExpression({ $value: "halfWidth" }))).toThrow("Cycle")
  expect(() => parseSpatialDesign(withExpression({ $value: "missing" }))).toThrow("Missing reference")
  expect(() => parseSpatialDesign(withExpression({ $param: "missing" }))).toThrow("Missing parameter")
  expect(() => parseSpatialDesign(withExpression({ op: "eval", args: ["1 + 1"] }))).toThrow()
  expect(() => parseSpatialDesign(withExpression({ op: "div", args: [1, 0] }))).toThrow("Division by zero")
  expect(() => parseSpatialDesign(withExpression({ op: "mul", args: [1e12, 2] }))).toThrow("finite magnitude")
  expect(() => parseSpatialDesign(withExpression({ op: "add", args: [1] }))).toThrow("requires 2 arguments")
  const source = design()
  expect(() => parseSpatialDesign({ ...source, stages: [source.stages[0], source.stages[0]] })).toThrow("Duplicate identity")
  expect(() => parseSpatialDesign({ ...source, parameters: [...source.parameters, source.parameters[0]] })).toThrow("Duplicate identity")
  expect(() => parseSpatialDesign({ ...source, stages: [{ kind: "parametric", stageId: "wrong", spec: { kind: { $param: "width" } } }] })).toThrow()
  expect(() => parseSpatialDesign({ ...source, stages: [{ kind: "parametric", stageId: "wrong", spec: { kind: "column", height: { $param: "height", fallback: 1 }, radius: 1, material } }] })).toThrow()
})

test("bounded foreign capture rejects getters and circular input without invoking accessors", () => {
  let invoked = false
  const input = { ...design(), get sneaky() { invoked = true; return 1 } }
  expect(() => parseSpatialDesign(input)).toThrow()
  expect(invoked).toBe(false)
  const circular: Record<string, unknown> = design()
  circular.self = circular
  expect(() => parseSpatialDesign(circular)).toThrow()
  const deep = (levels: number): SpatialDesignScalarExpression => levels === 0 ? 1 : { op: "abs", args: [deep(levels - 1)] }
  expect(() => parseSpatialDesign(withExpression(deep(20)))).toThrow()
})

test("aggregate budgets reject individually admissible large stages before mesh work", () => {
  const graph = { kind: "slopcamera.spatial-geometry-graph", schemaVersion: 1, nodes: [{ id: "ball", kind: "sphere", radius: 1, segments: 128 }], output: "ball" }
  expect(() => inspectSpatialDesign({ ...design(), stages: Array.from({ length: 32 }, (_, index) => ({ kind: "geometry", stageId: `sphere${index}`, graph, materials: [material] })) })).toThrow("aggregate geometry budget")
})

test("geometry-stage emission uses the same retained parametric contract and conservative estimates", () => {
  const spec = { kind: "geometry", graph: { kind: "slopcamera.spatial-geometry-graph", schemaVersion: 1,
    nodes: [{ id: "profile", kind: "ellipse", radiusX: 2, radiusY: 1, segments: 16 }, { id: "mesh", kind: "extrude", profile: "profile", depth: 0.4 }], output: "mesh" }, materials: [material] }
  const estimate = estimateSpatialParametric(spec)
  const output = emitSpatialParametric({ kind: "slopcamera.spatial-parametric-request", schemaVersion: 1, generatorId: "generator_geometry", spec })
  expect(output.artifacts.reduce((sum, artifact) => sum + artifact.bytes.length, 0)).toBeLessThanOrEqual(estimate.bytes)
  expect(output.facts[0]!.facts.generator!.parametricKind).toBe("geometry")
  expect(output.entities[0]!.origin).toMatchObject({ key: "geometry", generatorId: "generator_geometry" })
})

test("prototype-shaped valid names remain ordinary parameter keys", () => {
  const input = { ...design(), parameters: [...design().parameters, { name: "constructor", value: 3, min: 1, max: 10 }] }
  expect(inspectSpatialDesign(input).parameters.constructor as unknown).toBe(3)
  expect(inspectSpatialDesign(input, { parameters: { constructor: 4 } }).parameters.constructor as unknown).toBe(4)
})

test("property: declaration order does not change retained bytes or receipts", () => {
  fc.assert(fc.property(fc.integer({ min: 4, max: 30 }), fc.boolean(), (halfWidth, reverse) => {
    const source = editSpatialDesignParameters(design(), { width: halfWidth / 2, height: 1 })
    const reordered = { ...source, parameters: [...source.parameters].reverse(), values: [...source.values!].reverse(), stages: reverse ? [...source.stages].reverse() : source.stages }
    expect(compileSpatialDesign(reordered).receiptSha256).toBe(compileSpatialDesign(source).receiptSha256)
  }), { numRuns: 15 })
})

test("property: valid edits are idempotent, no-op recompiles retain identity, and scalar DAGs obey algebra", () => {
  fc.assert(fc.property(fc.integer({ min: 4, max: 40 }), value => {
    const width = value / 2
    const edited = editSpatialDesignParameters(design(), { width, height: 1 })
    expect(editSpatialDesignParameters(edited, { width, height: 1 })).toEqual(edited)
    const inspected = inspectSpatialDesign(edited)
    expect(inspected.values.find(item => item.name === "spacing")!.value).toBe(width / 6)
    expect(inspected.stages[0]!.generatorId).toBe(spatialDesignGeneratorId("colonnade", "columns"))
  }), { numRuns: 50 })
})


test("all-stage replacement validates final capacity atomically while preserving unrelated assets", () => {
  const floor = { kind: "floor", width: 2, depth: 2, thickness: 0.2, material }
  const column = { kind: "column", height: 2, radius: 0.2, segments: 8, material }
  const input = { kind: "slopcamera.spatial-design", schemaVersion: 1, designId: "capacity", parameters: [],
    stages: [{ kind: "parametric", stageId: "alpha", spec: floor }, { kind: "parametric", stageId: "beta", spec: column }] }
  const first = compileSpatialDesign(input)
  const unrelated = Array.from({ length: 123 }, (_, index) => ({ assetId: `asset_unrelated${index}`,
    payload: { path: `unrelated/${index}.json`, sha256: "a".repeat(64), bytes: 2 },
    interpretation: { kind: "metadata", format: "json", schema: "slopcamera.provider-metadata" }, dependencies: [],
    provenance: { source: "imported", description: "Unrelated retained metadata." } }))
  const base = parseSpatialScene({ ...first.scene, assets: [...first.scene.assets, ...unrelated] })
  expect(base.assets).toHaveLength(128)
  const source = { ...input, stages: [{ kind: "parametric", stageId: "alpha", spec: column }, { kind: "parametric", stageId: "beta", spec: floor }] }
  const second = compileSpatialDesign(source, { scene: base })
  expect(second.scene.assets).toHaveLength(128)
  expect(second.scene.assets.filter(asset => asset.assetId.startsWith("asset_unrelated"))).toEqual(base.assets.filter(asset => asset.assetId.startsWith("asset_unrelated")))
})


test("semantic relabeling updates scene names and receipts while retaining entity IDs and asset bytes", () => {
  const input = design()
  const named = { ...input, stages: input.stages.map(stage => ({ ...stage, name: stage.stageId === "columns" ? "Roof ribs" : "Raised platform" })) }
  const first = compileSpatialDesign(named)
  expect(first.outputs.map(output => output.entities[0]!.name)).toEqual(["Roof ribs", "Raised platform"])
  const renamed = { ...named, stages: named.stages.map(stage => ({ ...stage, name: stage.stageId === "columns" ? "Oak roof ribs" : stage.name })) }
  const second = compileSpatialDesign(renamed, { scene: first.scene })
  expect(second.outputs.map(output => output.entities[0]!.name)).toEqual(["Oak roof ribs", "Raised platform"])
  expect(second.outputs.map(output => output.entities[0]!.entityId)).toEqual(first.outputs.map(output => output.entities[0]!.entityId))
  expect(second.receipt.stages.map(stage => stage.changed)).toEqual([true, false])
  expect(second.outputs[0]!.generator.outputSha256).not.toBe(first.outputs[0]!.generator.outputSha256)
  expect(second.outputs[0]!.receiptSha256).not.toBe(first.outputs[0]!.receiptSha256)
  expect(second.outputs[0]!.receipt.name).toBe("Oak roof ribs")
  expect(second.outputs[1]!.receiptSha256).toBe(first.outputs[1]!.receiptSha256)
  for (const [index, output] of second.outputs.entries()) {
    expect(output.artifacts.map(artifact => artifact.assetId)).toEqual(first.outputs[index]!.artifacts.map(artifact => artifact.assetId))
    for (const [artifactIndex, artifact] of output.artifacts.entries()) expect(artifact.bytes).toEqual(first.outputs[index]!.artifacts[artifactIndex]!.bytes)
    for (const manifest of output.manifests.filter(manifest => manifest.provenance.source === "generated")) expect(manifest.provenance.receiptSha256).toBe(output.receiptSha256)
  }
  const repeated = compileSpatialDesign(renamed, { scene: second.scene })
  expect(repeated.scene).toEqual(second.scene)
  expect(repeated.receipt.stages.every(stage => !stage.changed)).toBe(true)
  expect(repeated.outputs.map(output => output.receiptSha256)).toEqual(second.outputs.map(output => output.receiptSha256))
})

test("shadow flags preserve explicit true/false and omitted scene-contract defaults", () => {
  const input = design()
  const output = compileSpatialDesign({ ...input, stages: input.stages.map(stage => stage.kind === "geometry" ? { ...stage, castShadow: false, receiveShadow: true } : stage) })
  expect(output.outputs[0]!.entities[0]).not.toHaveProperty("castShadow")
  expect(output.outputs[0]!.entities[0]).not.toHaveProperty("receiveShadow")
  expect(output.outputs[1]!.entities[0]).toMatchObject({ castShadow: false, receiveShadow: true })
})
