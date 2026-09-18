import { z } from "zod"

import { canonicalJsonSha256 } from "../code/canonical-json.js"
import { deepFreezeJson } from "../code/json-snapshot.js"
import { SpatialDigestSchema } from "./contracts.js"
import { spatialRenderPlanAssetIds, SpatialRenderPlanSchema, spatialRenderPlanSha256 } from "./effects.js"
import { parseSpatialValue, spatialValueSha256 } from "./identity.js"
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
