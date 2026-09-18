import { z } from "zod";
import { deepFreezeJson } from "../code/json-snapshot.js";
import { parseSpatialValue, spatialValueSha256 } from "./identity.js";
import { positiveDimension } from "./effects.js";

/**
 * Bounded motion-vector evidence for temporal effects and audits.
 * This contract is diagnostic-only and must never pass through beauty
 * post-processing modules; it is produced from renderer-per-sample motion.
 */

export const SPATIAL_MOTION_EVIDENCE_LIMITS = {
  pixels: 4096 * 4096,
  samples: 16,
} as const;

export const SpatialMotionSampleSchema = z.strictObject({
  id: z.string().min(1).max(64),
  entityId: z.string().min(1).max(128),
  viewport: z.tuple([z.number().int().min(0), z.number().int().min(0), z.number().int().min(0), z.number().int().min(0)]),
  width: z.number().int().min(0).max(SPATIAL_MOTION_EVIDENCE_LIMITS.pixels),
  height: z.number().int().min(0).max(SPATIAL_MOTION_EVIDENCE_LIMITS.pixels),
  samplesPerPixel: z.number().int().min(1).max(SPATIAL_MOTION_EVIDENCE_LIMITS.samples),
  motionScale: positiveDimension,
  exposureUs: z.number().int().min(0),
});

export const SpatialMotionEvidenceSchema = z.strictObject({
  kind: z.literal("slopcamera.spatial-motion-evidence"),
  schemaVersion: z.literal(1),
  entityId: z.string().min(1).max(128),
  samples: z.array(SpatialMotionSampleSchema).max(4),
});

export type SpatialMotionEvidence = Readonly<z.infer<typeof SpatialMotionEvidenceSchema>>;

export function parseSpatialMotionEvidence(input: unknown): SpatialMotionEvidence {
  const ev = parseSpatialValue(SpatialMotionEvidenceSchema, input, "motion evidence");
  for (const s of ev.samples) {
    if (s.width * s.height > SPATIAL_MOTION_EVIDENCE_LIMITS.pixels) {
      throw new TypeError(`Motion sample ${s.id} viewport ${s.width}x${s.height} exceeds pixel budget.`);
    }
  }
  return deepFreezeJson(ev);
}

export function spatialMotionEvidenceSha256(ev: SpatialMotionEvidence): string {
  return spatialValueSha256(ev);
}
