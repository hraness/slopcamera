import { z } from "zod";
import { deepFreezeJson } from "../code/json-snapshot.js";
import { parseSpatialValue, spatialValueSha256 } from "./identity.js";
import { positiveDimension } from "./effects.js";

/**
 * Strict agent direction documents for Phase 8.
 * Every proposal is marked and never auto-applied; it emits inspectable
 * scene/cinema patches and receipts for human or agent review.
 */

export const SPATIAL_DIRECTION_LIMITS = {
  beats: 64,
  actions: 256,
  coverage: 64,
  looks: 32,
} as const;

export const SpatialDramaticBeatSchema = z.strictObject({
  id: z.string().min(1).max(64),
  startUs: z.number().int().min(0),
  endUs: z.number().int().min(0),
  intent: z.string().min(1).max(256),
  emotion: z.string().min(1).max(64),
  verified: z.boolean().default(false),
});

export const SpatialCharacterActionSchema = z.strictObject({
  id: z.string().min(1).max(64),
  characterId: z.string().min(1).max(128),
  startUs: z.number().int().min(0),
  endUs: z.number().int().min(0),
  action: z.enum(["idle", "walk", "run", "turn", "gesture", "interact", "morph"]),
  targetId: z.string().min(1).max(128).optional(),
  verified: z.boolean().default(false),
});

export const SpatialCameraCoverageSchema = z.strictObject({
  id: z.string().min(1).max(64),
  startUs: z.number().int().min(0),
  endUs: z.number().int().min(0),
  rigKind: z.enum(["lockoff", "dolly", "crane", "handheld", "drone"]),
  framing: z.string().min(1).max(64),
  screenDirection: z.enum(["left", "right", "neutral"]).optional(),
  verified: z.boolean().default(false),
});

export const SpatialLookIntentSchema = z.strictObject({
  id: z.string().min(1).max(64),
  startUs: z.number().int().min(0),
  endUs: z.number().int().min(0),
  lighting: z.string().min(1).max(128),
  atmosphere: z.string().min(1).max(128),
  verified: z.boolean().default(false),
});

export const SpatialDirectionSchema = z.strictObject({
  kind: z.literal("slopcamera.spatial-direction"),
  schemaVersion: z.literal(1),
  entityId: z.string().min(1).max(128),
  projectDigest: z.string().length(64),
  beats: z.array(SpatialDramaticBeatSchema).max(SPATIAL_DIRECTION_LIMITS.beats),
  actions: z.array(SpatialCharacterActionSchema).max(SPATIAL_DIRECTION_LIMITS.actions),
  coverage: z.array(SpatialCameraCoverageSchema).max(SPATIAL_DIRECTION_LIMITS.coverage),
  looks: z.array(SpatialLookIntentSchema).max(SPATIAL_DIRECTION_LIMITS.looks),
});

export type SpatialDirection = Readonly<z.infer<typeof SpatialDirectionSchema>>;

export function parseSpatialDirection(input: unknown): SpatialDirection {
  const dir = parseSpatialValue(SpatialDirectionSchema, input, "direction");
  for (const b of dir.beats) {
    if (b.startUs > b.endUs) {
      throw new TypeError(`Beat ${b.id} has startUs > endUs.`);
    }
  }
  const budgetedSeconds = positiveDimension.parse(dir.beats.reduce((sum, b) => sum + (b.endUs - b.startUs), 0) / 1_000_000);
  if (budgetedSeconds > 3600) {
    throw new TypeError(`Direction ${dir.entityId} exceeds one-hour beat budget.`);
  }
  return deepFreezeJson(dir);
}

export function spatialDirectionSha256(dir: SpatialDirection): string {
  return spatialValueSha256(dir);
}
