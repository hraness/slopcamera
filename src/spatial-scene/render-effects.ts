import { z } from "zod"

import { canonicalJsonSha256 } from "../code/canonical-json.js"
import { deepFreezeJson } from "../code/json-snapshot.js"
import { SpatialDigestSchema, SpatialSceneV1Schema } from "./contracts.js"
import { spatialRenderPlanAssetIds, SpatialRenderPlanSchema, spatialRenderPlanSha256 } from "./effects.js"
import { parseSpatialValue, SpatialSceneError, spatialValueSha256 } from "./identity.js"
import { spatialParticleAssetIds, SpatialParticleSystemSchema, spatialParticleSystemSha256 } from "./particle.js"
import { SpatialSimulationBakeReceiptSchema } from "./simulation.js"

export const SPATIAL_RENDER_EFFECTS_LIMITS = Object.freeze({
  particleSystems: 64,
  simulationBakes: 64,
})

const particleBindingSchema = z.strictObject({
  system: SpatialParticleSystemSchema,
  systemSha256: SpatialDigestSchema,
})

export const SpatialRenderEffectsDocumentSchema = z.strictObject({
  kind: z.literal("slopcamera.spatial-render-effects"),
  particleSystems: z.array(particleBindingSchema).max(SPATIAL_RENDER_EFFECTS_LIMITS.particleSystems),
  renderPlan: SpatialRenderPlanSchema,
  renderPlanSha256: SpatialDigestSchema,
  sceneSha256: SpatialDigestSchema,
  schemaVersion: z.literal(1),
  simulationBakes: z.array(SpatialSimulationBakeReceiptSchema).max(SPATIAL_RENDER_EFFECTS_LIMITS.simulationBakes),
}).superRefine((document, context) => {
  if (spatialRenderPlanSha256(document.renderPlan) !== document.renderPlanSha256) {
    context.addIssue({ code: "custom", path: ["renderPlanSha256"], message: "Render-plan digest does not match the canonical render plan." })
  }
  const particleEntities = new Set<string>()
  for (const [index, binding] of document.particleSystems.entries()) {
    if (spatialParticleSystemSha256(binding.system) !== binding.systemSha256) {
      context.addIssue({ code: "custom", path: ["particleSystems", index, "systemSha256"], message: "Particle-system digest does not match its canonical system." })
    }
    if (particleEntities.has(binding.system.entityId)) {
      context.addIssue({ code: "custom", path: ["particleSystems", index, "system", "entityId"], message: `Duplicate particle-system entity ${binding.system.entityId}.` })
    }
    particleEntities.add(binding.system.entityId)
  }
  const caches = new Set<string>()
  for (const [index, receipt] of document.simulationBakes.entries()) {
    const { receiptSha256, ...body } = receipt
    if (canonicalJsonSha256(body) !== receiptSha256) {
      context.addIssue({ code: "custom", path: ["simulationBakes", index, "receiptSha256"], message: "Simulation bake receipt digest does not match its canonical body." })
    }
    if (receipt.sourceDigest !== document.sceneSha256) {
      context.addIssue({ code: "custom", path: ["simulationBakes", index, "sourceDigest"], message: "Simulation bake receipt belongs to a different scene source." })
    }
    if (caches.has(receipt.cacheId)) {
      context.addIssue({ code: "custom", path: ["simulationBakes", index, "cacheId"], message: `Duplicate simulation cache ${receipt.cacheId}.` })
    }
    caches.add(receipt.cacheId)
  }
  const particleCount = document.particleSystems.reduce((sum, binding) => sum + binding.system.maxCount, 0)
  if (document.renderPlan.quality.particleCount !== particleCount) {
    context.addIssue({ code: "custom", path: ["renderPlan", "quality", "particleCount"], message: "Render quality must declare the exact aggregate particle-state count." })
  }
  const simulationSteps = document.simulationBakes.reduce((sum, receipt) => sum + receipt.stepCount, 0)
  if (document.renderPlan.quality.simulationSteps !== simulationSteps) {
    context.addIssue({ code: "custom", path: ["renderPlan", "quality", "simulationSteps"], message: "Render quality must declare the exact aggregate simulation-step count." })
  }
})

export const SpatialRenderEffectsBindingSchema = z.strictObject({
  document: SpatialRenderEffectsDocumentSchema,
  documentSha256: SpatialDigestSchema,
}).superRefine((binding, context) => {
  if (spatialRenderEffectsSha256(binding.document) !== binding.documentSha256) {
    context.addIssue({ code: "custom", path: ["documentSha256"], message: "Render-effects digest does not match the canonical document." })
  }
})

export type SpatialRenderEffectsDocument = Readonly<z.infer<typeof SpatialRenderEffectsDocumentSchema>>
export type SpatialRenderEffectsBinding = Readonly<z.infer<typeof SpatialRenderEffectsBindingSchema>>

export function parseSpatialRenderEffectsDocument(input: unknown): SpatialRenderEffectsDocument {
  return deepFreezeJson(parseSpatialValue(SpatialRenderEffectsDocumentSchema, input, "render effects"))
}

export function spatialRenderEffectsAssetIds(document: SpatialRenderEffectsDocument): readonly string[] {
  return Object.freeze([...new Set([
    ...spatialRenderPlanAssetIds(document.renderPlan),
    ...document.particleSystems.flatMap(binding => spatialParticleAssetIds(binding.system)),
  ])].sort())
}

export function spatialRenderEffectsSha256(document: SpatialRenderEffectsDocument): string {
  return spatialValueSha256(document)
}

export const SPATIAL_EFFECTS_CHECK_LIMITS = Object.freeze({
  findings: 256,
})

export const SpatialEffectsCheckFindingSchema = z.strictObject({
  code: z.enum(["stale-scene", "unresolved-entity", "unresolved-asset"]),
  severity: z.enum(["error", "warning"]),
  referenceId: z.string().min(1).max(128).optional(),
  detail: z.string().min(1).max(240),
})
export type SpatialEffectsCheckFinding = Readonly<z.infer<typeof SpatialEffectsCheckFindingSchema>>

export const SpatialEffectsCheckReportSchema = z.strictObject({
  kind: z.literal("slopcamera.spatial-render-effects-check"),
  schemaVersion: z.literal(1),
  documentSha256: SpatialDigestSchema,
  sceneSha256: SpatialDigestSchema,
  findings: z.array(SpatialEffectsCheckFindingSchema).max(SPATIAL_EFFECTS_CHECK_LIMITS.findings),
  counts: z.strictObject({
    particleSystems: z.number().int().min(0),
    simulationBakes: z.number().int().min(0),
    postProcessSteps: z.number().int().min(0),
    errors: z.number().int().min(0),
    warnings: z.number().int().min(0),
  }),
})
export type SpatialEffectsCheckReport = Readonly<z.infer<typeof SpatialEffectsCheckReportSchema>>

const effectsCheckInputSchema = z.strictObject({
  effects: z.unknown(),
  scene: z.unknown(),
})

const parseEffectsInput = (input: unknown): { document: SpatialRenderEffectsDocument; documentSha256: string } => {
  if (input !== null && typeof input === "object" && "document" in input) {
    const binding = parseSpatialValue(SpatialRenderEffectsBindingSchema, input, "render effects binding")
    return { document: binding.document, documentSha256: binding.documentSha256 }
  }
  const document = parseSpatialRenderEffectsDocument(input)
  return { document, documentSha256: spatialRenderEffectsSha256(document) }
}

/**
 * Validates an effects document or {document, documentSha256} binding against
 * one scene: stale scene digests and unresolved entity/asset references report
 * as errors before any host work begins.
 */
export function checkSpatialRenderEffects(input: unknown): SpatialEffectsCheckReport {
  const options = parseSpatialValue(effectsCheckInputSchema, input, "render effects check")
  const scene = parseSpatialValue(SpatialSceneV1Schema, options.scene, "scene")
  const sceneSha256 = spatialValueSha256(scene)
  const { document, documentSha256 } = parseEffectsInput(options.effects)
  const findings: SpatialEffectsCheckFinding[] = []
  const finding = (code: SpatialEffectsCheckFinding["code"], detail: string, referenceId?: string): void => {
    findings.push(deepFreezeJson(referenceId === undefined
      ? { code, severity: "error", detail }
      : { code, severity: "error", referenceId, detail }))
  }

  if (document.sceneSha256 !== sceneSha256) {
    finding("stale-scene", `Effects document binds scene ${document.sceneSha256} but the checked scene digests to ${sceneSha256}.`)
  }
  const entityIds = new Set(scene.entities.map((entity) => entity.entityId))
  for (const binding of document.particleSystems) {
    if (!entityIds.has(binding.system.entityId)) {
      finding("unresolved-entity", `Particle system on ${binding.system.entityId} does not resolve to a scene entity.`, binding.system.entityId)
    }
  }
  const assetIds = new Set(scene.assets.map((asset) => asset.assetId))
  for (const assetId of spatialRenderEffectsAssetIds(document)) {
    if (!assetIds.has(assetId)) {
      finding("unresolved-asset", `Effects document references asset ${assetId} absent from the scene manifest.`, assetId)
    }
  }

  const errors = findings.filter((item) => item.severity === "error").length
  return deepFreezeJson(SpatialEffectsCheckReportSchema.parse({
    kind: "slopcamera.spatial-render-effects-check",
    schemaVersion: 1,
    documentSha256,
    sceneSha256,
    findings,
    counts: {
      particleSystems: document.particleSystems.length,
      simulationBakes: document.simulationBakes.length,
      postProcessSteps: document.renderPlan.postProcess?.steps.length ?? 0,
      errors,
      warnings: findings.length - errors,
    },
  }))
}

const effectsPlanInputSchema = z.strictObject({
  scene: z.unknown(),
  renderPlan: z.unknown(),
  particleSystems: z.array(z.unknown()).max(SPATIAL_RENDER_EFFECTS_LIMITS.particleSystems).default([]),
  simulationBakes: z.array(z.unknown()).max(SPATIAL_RENDER_EFFECTS_LIMITS.simulationBakes).default([]),
})

/**
 * Assembles a canonical {document, documentSha256} effects binding for one
 * scene. Entity and asset closure reject before the document is formed; the
 * scene digest binds here, never by caller assertion.
 */
export function planSpatialRenderEffects(input: unknown): SpatialRenderEffectsBinding {
  const options = parseSpatialValue(effectsPlanInputSchema, input, "render effects plan")
  const scene = parseSpatialValue(SpatialSceneV1Schema, options.scene, "scene")
  const sceneSha256 = spatialValueSha256(scene)
  const renderPlan = parseSpatialValue(SpatialRenderPlanSchema, options.renderPlan, "render plan")
  const particleSystems = options.particleSystems.map((system) =>
    parseSpatialValue(SpatialParticleSystemSchema, system, "particle system"))
  const simulationBakes = options.simulationBakes.map((receipt) =>
    parseSpatialValue(SpatialSimulationBakeReceiptSchema, receipt, "simulation bake receipt"))

  const entityIds = new Set(scene.entities.map((entity) => entity.entityId))
  for (const system of particleSystems) {
    if (!entityIds.has(system.entityId)) {
      throw new SpatialSceneError("invalid-data", `Particle system on ${system.entityId} does not resolve to a scene entity.`, "particleSystems")
    }
  }
  const assetIds = new Set(scene.assets.map((asset) => asset.assetId))
  const referenced = [...spatialRenderPlanAssetIds(renderPlan), ...particleSystems.flatMap((system) => spatialParticleAssetIds(system))]
  for (const assetId of new Set(referenced)) {
    if (!assetIds.has(assetId)) {
      throw new SpatialSceneError("invalid-data", `Effects input references asset ${assetId} absent from the scene manifest.`, "effects")
    }
  }
  for (const receipt of simulationBakes) {
    if (receipt.sourceDigest !== sceneSha256) {
      throw new SpatialSceneError("invalid-data", `Simulation bake ${receipt.cacheId} belongs to scene ${receipt.sourceDigest}, not ${sceneSha256}.`, "simulationBakes")
    }
  }

  const document = parseSpatialRenderEffectsDocument({
    kind: "slopcamera.spatial-render-effects",
    schemaVersion: 1,
    sceneSha256,
    renderPlan,
    renderPlanSha256: spatialRenderPlanSha256(renderPlan),
    particleSystems: particleSystems.map((system) => ({ system, systemSha256: spatialParticleSystemSha256(system) })),
    simulationBakes,
  })
  return deepFreezeJson(SpatialRenderEffectsBindingSchema.parse({
    document,
    documentSha256: spatialRenderEffectsSha256(document),
  }))
}
