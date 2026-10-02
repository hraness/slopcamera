import { z } from "zod"
import { parseSpatialValue } from "./identity.js"
import { evaluateSpatialGlb, SPATIAL_GLB_LIMITS, SpatialGlbModel } from "./gltf.js"

/**
 * Delivery-budget measurement for one parsed GLB. The parser already enforces
 * hard safety ceilings; these checks compare an admitted model against a
 * project's own, usually much smaller, web budget and LOD plan. Measurement is
 * pure: it reads the parsed model's static pose and never decodes pixels.
 */
export interface SpatialGlbBudgetMeasurement {
  /** Triangles drawn by the default scene's static pose, counting each instance. */
  readonly triangles: number
  readonly primitives: number
  /** Embedded images referenced by any material in source-material mode. */
  readonly textures: number
  /** Sum of width × height over referenced images, before mipmaps. */
  readonly texturePixels: number
  /** Encoded bytes of referenced images; decoded GPU memory is larger. */
  readonly textureBytes: number
  /** Longest referenced image edge in pixels, or 0 without textures. */
  readonly maxTextureEdge: number
  /** Referenced images whose width or height is not a power of two. */
  readonly nonPowerOfTwoTextures: number
}

const count = (maximum: number) => z.number().int().min(0).max(maximum)

/** The measurement shape, so measurements stored in a manifest are re-validated before checking. */
export const SpatialGlbBudgetMeasurementSchema = z.strictObject({
  triangles: count(SPATIAL_GLB_LIMITS.triangles),
  primitives: count(SPATIAL_GLB_LIMITS.primitives),
  textures: count(SPATIAL_GLB_LIMITS.images),
  texturePixels: count(SPATIAL_GLB_LIMITS.imagePixels),
  textureBytes: count(SPATIAL_GLB_LIMITS.imageTotalBytes),
  maxTextureEdge: count(SPATIAL_GLB_LIMITS.imagePixels),
  nonPowerOfTwoTextures: count(SPATIAL_GLB_LIMITS.images),
})

/** A project budget. Every field is optional; an omitted field is not checked. */
export const SpatialGlbBudgetSchema = z.strictObject({
  maxTriangles: count(SPATIAL_GLB_LIMITS.triangles).optional(),
  maxPrimitives: count(SPATIAL_GLB_LIMITS.primitives).optional(),
  maxTextures: count(SPATIAL_GLB_LIMITS.images).optional(),
  maxTexturePixels: count(SPATIAL_GLB_LIMITS.imagePixels).optional(),
  maxTextureBytes: count(SPATIAL_GLB_LIMITS.imageTotalBytes).optional(),
  maxTextureEdge: count(65_535).optional(),
  requirePowerOfTwoTextures: z.boolean().optional(),
})
export type SpatialGlbBudget = Readonly<z.infer<typeof SpatialGlbBudgetSchema>>

export type SpatialGlbBudgetFindingCode =
  | "triangles-over-budget" | "primitives-over-budget" | "textures-over-budget"
  | "texture-pixels-over-budget" | "texture-bytes-over-budget" | "texture-edge-over-budget"
  | "non-power-of-two-texture" | "lod-missing-base" | "lod-level-duplicate" | "lod-level-gap"
  | "lod-triangles-not-decreasing" | "lod-texture-pixels-increased"

export interface SpatialGlbBudgetFinding {
  readonly code: SpatialGlbBudgetFindingCode
  readonly message: string
  /** LOD level the finding concerns, when the check covers a chain. */
  readonly level?: number
  readonly actual: number
  readonly limit: number
}

/** Count the static-pose cost of one parsed GLB in its source-material mode. */
export function measureSpatialGlbBudget(model: SpatialGlbModel): SpatialGlbBudgetMeasurement {
  if (!(model instanceof SpatialGlbModel)) throw new TypeError("Budget measurement requires a parsed GLB model.")
  const geometry = evaluateSpatialGlb(model, { metersPerUnit: 1, sourceUp: "y", timeUs: 0, materialMode: "source" })
  let triangles = 0, texturePixels = 0, textureBytes = 0, maxTextureEdge = 0, nonPowerOfTwoTextures = 0
  for (const primitive of geometry.primitives) {
    triangles += (primitive.indices?.length ?? primitive.positions.length / 3) / 3
  }
  for (const image of geometry.images) {
    texturePixels += image.width * image.height
    textureBytes += image.bytes.byteLength
    maxTextureEdge = Math.max(maxTextureEdge, image.width, image.height)
    if (!isPowerOfTwo(image.width) || !isPowerOfTwo(image.height)) nonPowerOfTwoTextures += 1
  }
  return Object.freeze({
    triangles, primitives: geometry.primitives.length, textures: geometry.images.length,
    texturePixels, textureBytes, maxTextureEdge, nonPowerOfTwoTextures,
  })
}

/** Compare one measurement with a project budget. An empty result means every declared limit holds. */
export function checkSpatialGlbBudget(measurement: unknown, budget: unknown, level?: number): readonly SpatialGlbBudgetFinding[] {
  const measured = parseSpatialValue(SpatialGlbBudgetMeasurementSchema, measurement, "glbMeasurement")
  const limits = parseSpatialValue(SpatialGlbBudgetSchema, budget, "glbBudget")
  return Object.freeze(budgetFindings(measured, limits, level))
}

function budgetFindings(measurement: SpatialGlbBudgetMeasurement, limits: SpatialGlbBudget, level: number | undefined): SpatialGlbBudgetFinding[] {
  const findings: SpatialGlbBudgetFinding[] = []
  const at = level === undefined ? "" : ` at LOD ${level}`
  const over = (code: SpatialGlbBudgetFindingCode, label: string, actual: number, limit: number | undefined) => {
    if (limit !== undefined && actual > limit) findings.push(finding(code, `${label} ${actual}${at} exceeds the budget of ${limit}.`, actual, limit, level))
  }
  over("triangles-over-budget", "Triangle count", measurement.triangles, limits.maxTriangles)
  over("primitives-over-budget", "Primitive count", measurement.primitives, limits.maxPrimitives)
  over("textures-over-budget", "Texture count", measurement.textures, limits.maxTextures)
  over("texture-pixels-over-budget", "Texture pixel total", measurement.texturePixels, limits.maxTexturePixels)
  over("texture-bytes-over-budget", "Encoded texture bytes", measurement.textureBytes, limits.maxTextureBytes)
  over("texture-edge-over-budget", "Longest texture edge", measurement.maxTextureEdge, limits.maxTextureEdge)
  if (limits.requirePowerOfTwoTextures === true && measurement.nonPowerOfTwoTextures > 0) {
    findings.push(finding("non-power-of-two-texture", `${measurement.nonPowerOfTwoTextures} texture(s)${at} have a non-power-of-two edge.`, measurement.nonPowerOfTwoTextures, 0, level))
  }
  return findings
}

/** One level of an LOD chain; a level without a budget is checked only for chain order. */
export const SpatialGlbLodLevelSchema = z.strictObject({
  level: z.number().int().min(0).max(7),
  measurement: SpatialGlbBudgetMeasurementSchema,
  budget: SpatialGlbBudgetSchema.optional(),
})
export type SpatialGlbLodLevel = Readonly<z.infer<typeof SpatialGlbLodLevelSchema>>
const lodChainSchema = z.array(SpatialGlbLodLevelSchema).min(1).max(8)

/**
 * Check an LOD chain of 1 to 8 levels. Levels must be unique, start at 0 and be contiguous.
 * Each coarser level must draw strictly fewer triangles than the previous one
 * and must not add texture pixels. Per-level budgets are checked as well.
 */
export function checkSpatialGlbLodChain(chain: unknown): readonly SpatialGlbBudgetFinding[] {
  const levels = parseSpatialValue(lodChainSchema, chain, "glbLodChain")
  const findings: SpatialGlbBudgetFinding[] = []
  const seen = new Set<number>()
  for (const entry of levels) {
    if (seen.has(entry.level)) findings.push(finding("lod-level-duplicate", `LOD ${entry.level} appears more than once.`, entry.level, entry.level, entry.level))
    seen.add(entry.level)
  }
  if (!seen.has(0)) findings.push(finding("lod-missing-base", "The LOD chain has no level 0.", 0, 0))
  const ordered = [...levels].sort((a, b) => a.level - b.level)
  for (const [index, entry] of ordered.entries()) {
    if (entry.budget !== undefined) findings.push(...budgetFindings(entry.measurement, entry.budget, entry.level))
    const previous = ordered[index - 1]
    if (previous === undefined || previous.level === entry.level) continue
    if (entry.level !== previous.level + 1) {
      findings.push(finding("lod-level-gap", `LOD ${entry.level} follows LOD ${previous.level}; levels must be contiguous.`, entry.level, previous.level + 1, entry.level))
    }
    if (entry.measurement.triangles >= previous.measurement.triangles) {
      findings.push(finding("lod-triangles-not-decreasing", `LOD ${entry.level} draws ${entry.measurement.triangles} triangles, not fewer than LOD ${previous.level} (${previous.measurement.triangles}).`, entry.measurement.triangles, Math.max(0, previous.measurement.triangles - 1), entry.level))
    }
    if (entry.measurement.texturePixels > previous.measurement.texturePixels) {
      findings.push(finding("lod-texture-pixels-increased", `LOD ${entry.level} uses ${entry.measurement.texturePixels} texture pixels, more than LOD ${previous.level} (${previous.measurement.texturePixels}).`, entry.measurement.texturePixels, previous.measurement.texturePixels, entry.level))
    }
  }
  return Object.freeze(findings)
}

function isPowerOfTwo(value: number): boolean {
  return Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0
}

function finding(code: SpatialGlbBudgetFindingCode, message: string, actual: number, limit: number, level?: number): SpatialGlbBudgetFinding {
  return Object.freeze({ code, message, ...(level === undefined ? {} : { level }), actual, limit })
}
