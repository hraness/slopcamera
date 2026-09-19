import { z } from "zod"
import type { JsonValue } from "../code/contracts.js"
import { createBoundedJsonValueSnapshot, deepFreezeJson } from "../code/json-snapshot.js"
import { SPATIAL_SCENE_LIMITS, SpatialMaterialSchema, type SpatialSceneV1 } from "./contracts.js"
import { createSpatialGeneratorSceneShell } from "./generate.js"
import { applySpatialScenePatch } from "./patch.js"
import { parseSpatialScene, parseSpatialValue, SpatialSceneError, spatialTopologicalIds, spatialValueSha256 } from "./identity.js"
import {
  emitSpatialParametric, estimateSpatialParametric, SpatialParametricSpecSchema,
  type SpatialParametricEstimate, type SpatialParametricOutput, type SpatialParametricSpec,
} from "./parametric.js"

/** A portable design is inert data: scalar dependencies feed retained geometry stages. */
export const SPATIAL_DESIGN_LIMITS = Object.freeze({
  sourceBytes: 1_048_576, sourceDepth: 32, sourceValues: 100_000,
  parameters: 128, values: 256, constraints: 128, stages: 32, expressionNodes: 8_192,
  expressionDepth: 16, parts: 64, assets: 128, vertices: 262_144, triangles: 400_000,
  outputBytes: 67_108_864, scalarMagnitude: 1e12,
})
export const SPATIAL_DESIGN_COMPILER = "slopcamera.spatial-design-v1" as const

export type SpatialDesignScalarExpression = number | { readonly $param: string } | { readonly $value: string }
  | { readonly op: "add" | "sub" | "mul" | "div" | "min" | "max" | "neg" | "abs" | "sin" | "cos" | "floor" | "ceil"; readonly args: readonly SpatialDesignScalarExpression[] }

const identifier = z.string().min(1).max(64).regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/u)
const scalar = z.number().finite().min(-SPATIAL_DESIGN_LIMITS.scalarMagnitude).max(SPATIAL_DESIGN_LIMITS.scalarMagnitude)
const template = z.record(z.string(), z.json())
const parameterSchema = z.strictObject({
  name: identifier, label: z.string().min(1).max(160).optional(), value: scalar, min: scalar, max: scalar,
  step: z.number().finite().min(1e-9).max(SPATIAL_DESIGN_LIMITS.scalarMagnitude).optional(),
  unit: z.enum(["m", "rad", "count", "ratio"]).optional(),
})
const expressionSchema: z.ZodType<SpatialDesignScalarExpression> = z.lazy(() => z.union([
  scalar, z.strictObject({ $param: identifier }), z.strictObject({ $value: identifier }),
  z.strictObject({ op: z.enum(["add", "sub", "mul", "div", "min", "max", "neg", "abs", "sin", "cos", "floor", "ceil"]), args: z.array(expressionSchema).min(1).max(16) }),
]))
const stageBase = { stageId: identifier, name: z.string().min(1).max(160).optional(), seed: z.number().int().min(0).max(0xffff_ffff).optional() }
const stageSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...stageBase, kind: z.literal("parametric"), spec: template }),
  z.strictObject({ ...stageBase, kind: z.literal("geometry"), graph: template, materials: z.array(SpatialMaterialSchema).min(1).max(16),
    transform: template.optional(), editable: z.array(z.enum(["color", "opacity", "transform"])).max(3).optional(),
    castShadow: z.boolean().optional(), receiveShadow: z.boolean().optional() }),
])
export const SpatialDesignV1Schema = z.strictObject({
  kind: z.literal("slopcamera.spatial-design"), schemaVersion: z.literal(1), designId: identifier,
  name: z.string().min(1).max(160).optional(),
  parameters: z.array(parameterSchema).max(SPATIAL_DESIGN_LIMITS.parameters),
  values: z.array(z.strictObject({ name: identifier, expression: expressionSchema })).max(SPATIAL_DESIGN_LIMITS.values).optional(),
  constraints: z.array(z.strictObject({ name: identifier, left: expressionSchema, operator: z.enum(["lt", "lte", "eq", "gte", "gt"]), right: expressionSchema,
    message: z.string().min(1).max(512).optional() })).max(SPATIAL_DESIGN_LIMITS.constraints).optional(),
  stages: z.array(stageSchema).min(1).max(SPATIAL_DESIGN_LIMITS.stages),
})
export type SpatialDesignV1 = Readonly<z.infer<typeof SpatialDesignV1Schema>>
export type SpatialDesignParameter = SpatialDesignV1["parameters"][number]
export type SpatialDesignStage = SpatialDesignV1["stages"][number]
export interface SpatialDesignDependencies { readonly parameters: readonly string[]; readonly values: readonly string[] }
export interface SpatialDesignResolvedStage {
  readonly stageId: string
  readonly name?: string
  readonly kind: SpatialDesignStage["kind"]
  readonly generatorId: string
  readonly spec: SpatialParametricSpec
  readonly seed?: number
  readonly dependencies: SpatialDesignDependencies
  readonly estimate: SpatialParametricEstimate
}
export interface SpatialDesignInspection {
  readonly design: SpatialDesignV1
  readonly designSha256: string
  readonly parameters: Readonly<Record<string, number>>
  readonly values: readonly { readonly name: string; readonly value: number; readonly dependencies: SpatialDesignDependencies }[]
  readonly valueOrder: readonly string[]
  readonly constraints: readonly { readonly name: string; readonly left: number; readonly operator: string; readonly right: number; readonly passed: boolean }[]
  readonly stages: readonly SpatialDesignResolvedStage[]
  readonly estimate: SpatialParametricEstimate
}
export interface SpatialDesignReceipt {
  readonly kind: "slopcamera.spatial-design-receipt"
  readonly schemaVersion: 1
  readonly compiler: typeof SPATIAL_DESIGN_COMPILER
  readonly designId: string
  readonly designSha256: string
  readonly parametersSha256: string
  readonly inputSceneSha256: string | null
  readonly sceneSha256: string
  readonly parameters: Readonly<Record<string, number>>
  readonly stages: readonly { readonly stageId: string; readonly generatorId: string; readonly specSha256: string; readonly receiptSha256: string; readonly entities: readonly string[]; readonly dependencies: SpatialDesignDependencies; readonly changed: boolean }[]
  readonly estimate: SpatialParametricEstimate
  readonly artifactBytes: number
}
export interface SpatialDesignCompilation {
  readonly design: SpatialDesignV1
  readonly scene: SpatialSceneV1
  readonly outputs: readonly SpatialParametricOutput[]
  readonly receipt: SpatialDesignReceipt
  readonly receiptSha256: string
}

function fail(message: string, path = "design"): never { throw new SpatialSceneError("invalid-data", message, path) }
function compare(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0 }
function byName<T extends { name: string }>(items: readonly T[]): T[] { return [...items].sort((a, b) => compare(a.name, b.name)) }
function unique<T>(items: readonly T[], key: (item: T) => string, path: string): Map<string, T> {
  const result = new Map<string, T>()
  for (const item of items) {
    const name = key(item)
    if (result.has(name)) fail(`Duplicate identity ${name}.`, path)
    result.set(name, item)
  }
  return result
}
function capture(input: unknown, path: string): JsonValue {
  try {
    return createBoundedJsonValueSnapshot(input, SPATIAL_DESIGN_LIMITS.sourceBytes, path, {
      maximumDepth: SPATIAL_DESIGN_LIMITS.sourceDepth, maximumValues: SPATIAL_DESIGN_LIMITS.sourceValues,
    }).value
  } catch (error) { return fail(error instanceof Error ? error.message : "Invalid design data.", path) }
}
function readDesign(input: unknown): SpatialDesignV1 {
  const parsed = parseSpatialValue(SpatialDesignV1Schema, capture(input, "design"), "design")
  return deepFreezeJson({ ...parsed, parameters: byName(parsed.parameters),
    ...(parsed.values === undefined ? {} : { values: byName(parsed.values) }),
    ...(parsed.constraints === undefined ? {} : { constraints: byName(parsed.constraints) }),
    stages: [...parsed.stages].sort((a, b) => compare(a.stageId, b.stageId)) })
}
function validateParameter(parameter: SpatialDesignParameter, value: number): void {
  const path = `design.parameters.${parameter.name}`
  if (parameter.min > parameter.max) fail("Parameter min must not exceed max.", path)
  if (value < parameter.min || value > parameter.max) fail(`Parameter ${parameter.name} must be between ${parameter.min} and ${parameter.max}.`, path)
  if (parameter.unit === "count" && (!Number.isSafeInteger(value) || !Number.isSafeInteger(parameter.min) || !Number.isSafeInteger(parameter.max) || (parameter.step !== undefined && !Number.isSafeInteger(parameter.step)))) {
    fail(`Count parameter ${parameter.name} requires integer value, bounds and step.`, path)
  }
  if (parameter.step !== undefined) {
    const steps = (value - parameter.min) / parameter.step
    if (!Number.isFinite(steps) || Math.abs(steps - Math.round(steps)) > 1e-7) fail(`Parameter ${parameter.name} must follow step ${parameter.step} from min ${parameter.min}.`, path)
  }
}
function resolveParameters(design: SpatialDesignV1, input?: unknown): Readonly<Record<string, number>> {
  const parameters = unique(design.parameters, item => item.name, "design.parameters")
  for (const parameter of parameters.values()) validateParameter(parameter, parameter.value)
  const updates = input === undefined ? {} : parseSpatialValue(z.record(identifier, scalar), capture(input, "parameter updates"), "parameter updates")
  for (const name of Object.keys(updates)) {
    const parameter = parameters.get(name)
    if (parameter === undefined) fail(`Unknown parameter ${name}.`, "parameter updates")
    validateParameter(parameter, updates[name]!)
  }
  return Object.fromEntries([...parameters.values()].map(parameter => [parameter.name, Object.hasOwn(updates, parameter.name) ? updates[parameter.name]! : parameter.value]))
}
interface MutableDependencies { parameters: Set<string>; values: Set<string> }
function emptyDependencies(): MutableDependencies { return { parameters: new Set(), values: new Set() } }
function dependencies(value: MutableDependencies): SpatialDesignDependencies {
  return { parameters: [...value.parameters].sort(compare), values: [...value.values].sort(compare) }
}
function include(target: MutableDependencies, source: SpatialDesignDependencies): void {
  for (const name of source.parameters) target.parameters.add(name)
  for (const name of source.values) target.values.add(name)
}
interface ExpressionContext {
  parameters: Readonly<Record<string, number>>
  values: ReadonlyMap<string, { value: number; dependencies: SpatialDesignDependencies }>
  budget: { nodes: number }
}
function checkedNumber(value: number, path: string): number {
  if (!Number.isFinite(value) || Math.abs(value) > SPATIAL_DESIGN_LIMITS.scalarMagnitude) fail("Scalar arithmetic exceeded the finite magnitude bound.", path)
  return Object.is(value, -0) ? 0 : value
}
function evaluateExpression(expression: SpatialDesignScalarExpression, context: ExpressionContext, refs: MutableDependencies, path: string, depth = 0): number {
  if (++context.budget.nodes > SPATIAL_DESIGN_LIMITS.expressionNodes || depth > SPATIAL_DESIGN_LIMITS.expressionDepth) fail("Design expression budget exceeded.", path)
  if (typeof expression === "number") return checkedNumber(expression, path)
  if ("$param" in expression) {
    if (!Object.hasOwn(context.parameters, expression.$param)) fail(`Missing parameter ${expression.$param}.`, path)
    refs.parameters.add(expression.$param)
    return context.parameters[expression.$param]!
  }
  if ("$value" in expression) {
    const value = context.values.get(expression.$value)
    if (value === undefined) fail(`Missing value ${expression.$value}.`, path)
    refs.values.add(expression.$value); include(refs, value.dependencies)
    return value.value
  }
  const { op, args } = expression
  const unary = ["neg", "abs", "sin", "cos", "floor", "ceil"].includes(op)
  if (args.length !== (unary ? 1 : 2) && op !== "min" && op !== "max") fail(`Operation ${op} requires ${unary ? 1 : 2} arguments.`, path)
  if ((op === "min" || op === "max") && args.length < 2) fail(`Operation ${op} requires at least two arguments.`, path)
  const operands = args.map(arg => evaluateExpression(arg, context, refs, path, depth + 1))
  const a = operands[0]!, b = operands[1]!
  let result: number
  switch (op) {
    case "add": result = a + b; break
    case "sub": result = a - b; break
    case "mul": result = a * b; break
    case "div": if (b === 0) fail("Division by zero.", path); result = a / b; break
    case "min": result = Math.min(...operands); break
    case "max": result = Math.max(...operands); break
    case "neg": result = -a; break
    case "abs": result = Math.abs(a); break
    case "sin": result = Math.sin(a); break
    case "cos": result = Math.cos(a); break
    case "floor": result = Math.floor(a); break
    case "ceil": result = Math.ceil(a); break
  }
  return checkedNumber(result, path)
}
function valueReferences(expression: SpatialDesignScalarExpression, depth = 0): string[] {
  if (depth > SPATIAL_DESIGN_LIMITS.expressionDepth) fail("Design expression depth exceeded.", "design.values")
  if (typeof expression === "number" || "$param" in expression) return []
  if ("$value" in expression) return [expression.$value]
  return expression.args.flatMap(arg => valueReferences(arg, depth + 1))
}
function resolveTemplate(value: JsonValue, context: ExpressionContext, refs: MutableDependencies, path: string): JsonValue {
  if (value === null || typeof value !== "object") return value
  if (Array.isArray(value)) return value.map((item, index) => resolveTemplate(item, context, refs, `${path}.${index}`))
  const record = value as Readonly<Record<string, JsonValue>>
  if (Object.keys(record).some(key => key.startsWith("$"))) {
    const sentinel = Object.hasOwn(record, "$expr")
      ? parseSpatialValue(z.strictObject({ $expr: expressionSchema }), record, path).$expr
      : parseSpatialValue(expressionSchema, record, path)
    return evaluateExpression(sentinel, context, refs, path)
  }
  return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, resolveTemplate(item, context, refs, `${path}.${key}`)]))
}

function generatorPrefix(designId: string): string {
  return `generator_design_${spatialValueSha256({ domain: "slopcamera.spatial-design-owner.v1", designId }).slice(0, 16)}_`
}

/** Stable stage ownership survives parameter changes, stage reordering and relabeling. */
export function spatialDesignGeneratorId(designId: string, stageId: string): string {
  const ids = parseSpatialValue(z.strictObject({ designId: identifier, stageId: identifier }), { designId, stageId }, "design stage identity")
  return `${generatorPrefix(ids.designId)}${spatialValueSha256({ domain: "slopcamera.spatial-design-stage.v1", stageId: ids.stageId }).slice(0, 32)}`
}

/** Resolves and checks dependencies and static budgets without evaluating a mesh. */
export function inspectSpatialDesign(input: unknown, options: { readonly parameters?: unknown } = {}): SpatialDesignInspection {
  const design = readDesign(input)
  const parameters = resolveParameters(design, options.parameters)
  const definitions = unique(design.values ?? [], item => item.name, "design.values")
  unique(design.constraints ?? [], item => item.name, "design.constraints")
  unique(design.stages, item => item.stageId, "design.stages")
  const order = spatialTopologicalIds(new Map([...definitions].map(([name, definition]) => [name, [...new Set(valueReferences(definition.expression))].sort(compare)])), "design.values")
  const values = new Map<string, { value: number; dependencies: SpatialDesignDependencies }>()
  const context: ExpressionContext = { parameters, values, budget: { nodes: 0 } }
  for (const name of order) {
    const refs = emptyDependencies()
    const value = evaluateExpression(definitions.get(name)!.expression, context, refs, `design.values.${name}`)
    values.set(name, { value, dependencies: dependencies(refs) })
  }
  const constraints = (design.constraints ?? []).map(constraint => {
    const refs = emptyDependencies(), path = `design.constraints.${constraint.name}`
    const left = evaluateExpression(constraint.left, context, refs, path), right = evaluateExpression(constraint.right, context, refs, path)
    const passed = constraint.operator === "lt" ? left < right : constraint.operator === "lte" ? left <= right
      : constraint.operator === "eq" ? left === right : constraint.operator === "gte" ? left >= right : left > right
    if (!passed) fail(constraint.message ?? `Constraint ${constraint.name} failed: ${left} ${constraint.operator} ${right}.`, path)
    return { name: constraint.name, left, operator: constraint.operator, right, passed }
  })
  const estimate = { parts: 0, assets: 0, vertices: 0, triangles: 0, bytes: 0 }
  const stages = design.stages.map(stage => {
    const refs = emptyDependencies()
    const raw = stage.kind === "parametric" ? stage.spec : {
      kind: "geometry", graph: stage.graph, materials: stage.materials,
      ...(stage.transform === undefined ? {} : { transform: stage.transform }),
      ...(stage.editable === undefined ? {} : { editable: stage.editable }),
      ...(stage.castShadow === undefined ? {} : { castShadow: stage.castShadow }),
      ...(stage.receiveShadow === undefined ? {} : { receiveShadow: stage.receiveShadow }),
    }
    const spec = parseSpatialValue(SpatialParametricSpecSchema, resolveTemplate(raw as JsonValue, context, refs, `design.stages.${stage.stageId}`), `design.stages.${stage.stageId}.spec`)
    const stageEstimate = estimateSpatialParametric(spec)
    for (const key of ["parts", "assets", "vertices", "triangles", "bytes"] as const) estimate[key] += stageEstimate[key]
    if (estimate.parts > SPATIAL_DESIGN_LIMITS.parts || estimate.assets > SPATIAL_DESIGN_LIMITS.assets || estimate.vertices > SPATIAL_DESIGN_LIMITS.vertices
      || estimate.triangles > SPATIAL_DESIGN_LIMITS.triangles || estimate.bytes > SPATIAL_DESIGN_LIMITS.outputBytes) fail("Design aggregate geometry budget exceeded before emission.", "design.stages")
    return { stageId: stage.stageId, ...(stage.name === undefined ? {} : { name: stage.name }), kind: stage.kind,
      generatorId: spatialDesignGeneratorId(design.designId, stage.stageId), spec,
      ...(stage.seed === undefined ? {} : { seed: stage.seed }), dependencies: dependencies(refs), estimate: stageEstimate }
  })
  return deepFreezeJson({ design, designSha256: spatialValueSha256({ domain: "slopcamera.spatial-design.v1", design }), parameters,
    values: [...values].map(([name, value]) => ({ name, ...value })), valueOrder: order, constraints, stages, estimate })
}

/** Full authoring validation, including parameter, dependency, constraint and static geometry checks. */
export function parseSpatialDesign(input: unknown): SpatialDesignV1 { return inspectSpatialDesign(input).design }

/** Atomically updates named defaults, validating the complete dependent design before returning. */
export function editSpatialDesignParameters(input: unknown, updates: unknown): SpatialDesignV1 {
  const design = readDesign(input), parameters = resolveParameters(design, updates)
  return parseSpatialDesign({ ...design, parameters: design.parameters.map(parameter => ({ ...parameter, value: parameters[parameter.name]! })) })
}

/** Emits all validated stages and merges them through existing retained-output/override rules. */
export function compileSpatialDesign(input: unknown, options: { readonly scene?: unknown; readonly parameters?: unknown } = {}): SpatialDesignCompilation {
  const inspection = inspectSpatialDesign(options.parameters === undefined ? input : editSpatialDesignParameters(input, options.parameters))
  const base = options.scene === undefined ? undefined : parseSpatialScene(options.scene)
  const owned = new Set(inspection.stages.map(stage => stage.generatorId))
  const stale = base?.generators.find(generator => generator.generatorId.startsWith(generatorPrefix(inspection.design.designId)) && !owned.has(generator.generatorId))
  if (stale !== undefined) throw new SpatialSceneError("conflict", `Design removed a retained stage (${stale.generatorId}); explicitly remove its retained output and dependent overrides before recompiling.`, "design.stages")
  const retiredAssets = new Set(base?.generators.filter(generator => owned.has(generator.generatorId)).flatMap(generator => generator.assets ?? []) ?? [])
  const keptAssets = base?.assets.filter(asset => !retiredAssets.has(asset.assetId)).length ?? 0
  const keptEntities = base?.entities.filter(entity => entity.origin.kind !== "generated" || !owned.has(entity.origin.generatorId)).length ?? 0
  const keptGenerators = base?.generators.filter(generator => !owned.has(generator.generatorId)).length ?? 0
  if (keptAssets + inspection.estimate.assets > SPATIAL_SCENE_LIMITS.assets || keptEntities + inspection.estimate.parts > SPATIAL_SCENE_LIMITS.entities || keptGenerators + owned.size > 128) {
    fail("Design and retained scene exceed aggregate scene capacity before emission.", "scene")
  }
  const outputs = inspection.stages.map(stage => emitSpatialParametric({ kind: "slopcamera.spatial-parametric-request", schemaVersion: 1,
    generatorId: stage.generatorId, spec: stage.spec, ...(stage.seed === undefined ? {} : { seed: stage.seed }),
    ...(stage.name === undefined ? {} : { name: stage.name }) }))
  const artifactBytes = outputs.reduce((total, output) => total + output.artifacts.reduce((sum, artifact) => sum + artifact.bytes.byteLength, 0), 0)
  if (artifactBytes > SPATIAL_DESIGN_LIMITS.outputBytes) fail("Design emitted artifacts exceed the byte budget.", "design.stages")
  const original = base ?? parseSpatialScene(createSpatialGeneratorSceneShell())
  const scene = applySpatialScenePatch(original, { kind: "slopcamera.spatial-scene-patch", schemaVersion: 1,
    expectedSceneSha256: spatialValueSha256(original),
    operations: outputs.map(output => ({ kind: "replace-generator-output", generator: output.generator, entities: output.entities, assets: output.manifests })),
  }).scene
  const receipt: SpatialDesignReceipt = {
    kind: "slopcamera.spatial-design-receipt", schemaVersion: 1, compiler: SPATIAL_DESIGN_COMPILER,
    designId: inspection.design.designId, designSha256: inspection.designSha256,
    parametersSha256: spatialValueSha256({ domain: "slopcamera.spatial-design-parameters.v1", parameters: inspection.parameters }),
    inputSceneSha256: base === undefined ? null : spatialValueSha256(base), sceneSha256: spatialValueSha256(scene),
    parameters: inspection.parameters, estimate: inspection.estimate, artifactBytes,
    stages: inspection.stages.map((stage, index) => {
      const output = outputs[index]!
      const previous = base?.generators.find(generator => generator.generatorId === stage.generatorId)
      return { stageId: stage.stageId, generatorId: stage.generatorId, specSha256: output.receipt.specSha256,
        receiptSha256: output.receiptSha256, entities: output.receipt.entities, dependencies: stage.dependencies,
        changed: previous === undefined || spatialValueSha256(previous) !== spatialValueSha256(scene.generators.find(generator => generator.generatorId === stage.generatorId)!) }
    }),
  }
  const metadata = deepFreezeJson({ design: inspection.design, scene, receipt, receiptSha256: spatialValueSha256({ domain: "slopcamera.spatial-design-receipt.v1", receipt }) })
  return Object.freeze({ ...metadata, outputs: Object.freeze(outputs) })
}
