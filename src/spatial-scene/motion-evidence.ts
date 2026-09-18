import { z } from "zod"

import { deepFreezeJson } from "../code/json-snapshot.js"
import { SpatialDigestSchema, SpatialEntityIdSchema, SpatialTimeUsSchema } from "./contracts.js"
import { parseSpatialValue, spatialValueSha256 } from "./identity.js"
import { positiveDimension } from "./effects.js"

/**
 * Bounded motion-vector evidence for temporal effects and audits.
 * This contract is diagnostic-only and must never pass through beauty
 * post-processing modules; it is produced from renderer-per-sample motion.
 */

export const SPATIAL_MOTION_EVIDENCE_LIMITS = Object.freeze({
  dimension: 16_384,
  evidenceSamples: 64,
  exposureUs: 1_000_000,
  pixels: 4096 * 4096,
  samples: 16,
  samplesPerPixel: 16,
})

const positivePixels = z.number().int().safe().positive().max(SPATIAL_MOTION_EVIDENCE_LIMITS.dimension)

export const SpatialMotionSampleSchema = z.strictObject({
  byteLength: z.number().int().safe().positive().max(SPATIAL_MOTION_EVIDENCE_LIMITS.pixels * 8),
  encoding: z.enum(["rg16f", "rg32f"]),
  entityId: SpatialEntityIdSchema,
  exposureUs: SpatialTimeUsSchema.min(1).max(SPATIAL_MOTION_EVIDENCE_LIMITS.exposureUs),
  height: positivePixels,
  id: z.string().min(1).max(64).regex(/^[a-z][a-z0-9_-]*$/u),
  motionScale: positiveDimension,
  motionSha256: SpatialDigestSchema,
  previousTimeUs: SpatialTimeUsSchema,
  sampleTimeUs: SpatialTimeUsSchema,
  samplesPerPixel: z.number().int().min(1).max(SPATIAL_MOTION_EVIDENCE_LIMITS.samplesPerPixel),
  viewport: z.tuple([
    z.number().int().safe().nonnegative(),
    z.number().int().safe().nonnegative(),
    positivePixels,
    positivePixels,
  ]),
  width: positivePixels,
}).superRefine((sample, context) => {
  if (sample.width * sample.height > SPATIAL_MOTION_EVIDENCE_LIMITS.pixels) {
    context.addIssue({ code: "custom", path: ["width"], message: `Motion sample ${sample.id} ${sample.width}x${sample.height} exceeds pixel budget.` })
  }
  const [x, y, viewportWidth, viewportHeight] = sample.viewport
  if (x + viewportWidth > sample.width || y + viewportHeight > sample.height) {
    context.addIssue({ code: "custom", path: ["viewport"], message: `Motion sample ${sample.id} viewport escapes its ${sample.width}x${sample.height} buffer.` })
  }
  if (sample.previousTimeUs >= sample.sampleTimeUs) {
    context.addIssue({ code: "custom", path: ["previousTimeUs"], message: `Motion sample ${sample.id} requires previousTimeUs before sampleTimeUs.` })
  }
  const bytesPerPixel = sample.encoding === "rg16f" ? 4 : 8
  if (sample.byteLength !== sample.width * sample.height * bytesPerPixel) {
    context.addIssue({ code: "custom", path: ["byteLength"], message: `Motion sample ${sample.id} byteLength does not match its dimensions and encoding.` })
  }
})

export const SpatialMotionEvidenceSchema = z.strictObject({
  entityId: SpatialEntityIdSchema,
  kind: z.literal("slopcamera.spatial-motion-evidence"),
  renderRequestSha256: SpatialDigestSchema,
  rendererSha256: SpatialDigestSchema,
  samples: z.array(SpatialMotionSampleSchema).min(1).max(SPATIAL_MOTION_EVIDENCE_LIMITS.evidenceSamples),
  schemaVersion: z.literal(1),
}).superRefine((evidence, context) => {
  const ids = new Set<string>()
  let previousTimeUs = -1
  for (const [index, sample] of evidence.samples.entries()) {
    if (ids.has(sample.id)) context.addIssue({ code: "custom", path: ["samples", index, "id"], message: `Duplicate motion sample id ${sample.id}.` })
    ids.add(sample.id)
    if (sample.entityId !== evidence.entityId) context.addIssue({ code: "custom", path: ["samples", index, "entityId"], message: `Motion sample ${sample.id} belongs to a different entity.` })
    if (sample.sampleTimeUs <= previousTimeUs) context.addIssue({ code: "custom", path: ["samples", index, "sampleTimeUs"], message: "Motion samples must be strictly ordered by sampleTimeUs." })
    previousTimeUs = sample.sampleTimeUs
  }
})

export type SpatialMotionEvidence = Readonly<z.infer<typeof SpatialMotionEvidenceSchema>>

export function parseSpatialMotionEvidence(input: unknown): SpatialMotionEvidence {
  return deepFreezeJson(parseSpatialValue(SpatialMotionEvidenceSchema, input, "motion evidence"))
}

export function spatialMotionEvidenceSha256(evidence: SpatialMotionEvidence): string {
  return spatialValueSha256(evidence)
}
