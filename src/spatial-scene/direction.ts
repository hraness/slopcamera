import { z } from "zod"

import { deepFreezeJson } from "../code/json-snapshot.js"
import { SpatialDigestSchema, SpatialTimeUsSchema } from "./contracts.js"
import { parseSpatialValue, SpatialSceneError, spatialValueSha256 } from "./identity.js"

/**
 * Strict agent direction documents for Phase 8.
 * Every proposal is marked and never auto-applied; it emits inspectable
 * scene/cinema patches and receipts for human or agent review.
 */

export const SPATIAL_DIRECTION_LIMITS = Object.freeze({
  actions: 256,
  beats: 64,
  coverage: 64,
  durationUs: 3_600_000_000,
  looks: 32,
})

const directionId = z.string().min(1).max(64).regex(/^[a-z][a-z0-9_-]*$/u)
const referenceId = z.string().min(1).max(128).regex(/^[a-z][a-z0-9_-]*$/u)
const intervalShape = {
  endUs: SpatialTimeUsSchema.max(SPATIAL_DIRECTION_LIMITS.durationUs),
  startUs: SpatialTimeUsSchema.max(SPATIAL_DIRECTION_LIMITS.durationUs),
}

export const SpatialDramaticBeatSchema = z.strictObject({
  id: directionId,
  ...intervalShape,
  intent: z.string().trim().min(1).max(256),
  emotion: z.string().trim().min(1).max(64),
  verified: z.boolean().default(false),
})

export const SpatialCharacterActionSchema = z.strictObject({
  id: directionId,
  characterId: referenceId,
  ...intervalShape,
  action: z.enum(["idle", "walk", "run", "turn", "gesture", "interact", "morph"]),
  targetId: referenceId.optional(),
  verified: z.boolean().default(false),
})

export const SpatialCameraCoverageSchema = z.strictObject({
  id: directionId,
  ...intervalShape,
  rigKind: z.enum(["chase", "crane", "dolly", "handheld", "orbit", "rail", "target-tracking", "tripod"]),
  framing: z.enum(["extreme-close-up", "close-up", "medium-close-up", "medium", "medium-wide", "wide", "extreme-wide", "over-shoulder", "insert"]),
  screenDirection: z.enum(["left", "right", "neutral"]).optional(),
  subjectId: referenceId.optional(),
  verified: z.boolean().default(false),
})

export const SpatialLookIntentSchema = z.strictObject({
  id: directionId,
  ...intervalShape,
  lighting: z.string().trim().min(1).max(128),
  atmosphere: z.string().trim().min(1).max(128),
  verified: z.boolean().default(false),
})

export const SpatialDirectionSchema = z.strictObject({
  kind: z.literal("slopcamera.spatial-direction"),
  schemaVersion: z.literal(1),
  entityId: referenceId,
  projectDigest: SpatialDigestSchema,
  beats: z.array(SpatialDramaticBeatSchema).max(SPATIAL_DIRECTION_LIMITS.beats),
  actions: z.array(SpatialCharacterActionSchema).max(SPATIAL_DIRECTION_LIMITS.actions),
  coverage: z.array(SpatialCameraCoverageSchema).max(SPATIAL_DIRECTION_LIMITS.coverage),
  looks: z.array(SpatialLookIntentSchema).max(SPATIAL_DIRECTION_LIMITS.looks),
}).superRefine((direction, context) => {
  const ids = new Set<string>()
  for (const [collectionName, values] of [
    ["beats", direction.beats],
    ["actions", direction.actions],
    ["coverage", direction.coverage],
    ["looks", direction.looks],
  ] as const) {
    let previousStartUs = -1
    let previousId = ""
    for (const [index, value] of values.entries()) {
      if (value.endUs <= value.startUs) {
        context.addIssue({ code: "custom", path: [collectionName, index, "endUs"], message: "Direction intervals must have positive duration." })
      }
      if (ids.has(value.id)) {
        context.addIssue({ code: "custom", path: [collectionName, index, "id"], message: `Direction id ${value.id} must be globally unique.` })
      }
      ids.add(value.id)
      if (value.startUs < previousStartUs || value.startUs === previousStartUs && value.id.localeCompare(previousId) <= 0) {
        context.addIssue({ code: "custom", path: [collectionName, index], message: "Direction entries must be ordered by startUs then id." })
      }
      previousStartUs = value.startUs
      previousId = value.id
    }
  }
  for (const [index, action] of direction.actions.entries()) {
    if ((action.action === "interact") !== (action.targetId !== undefined)) {
      context.addIssue({ code: "custom", path: ["actions", index, "targetId"], message: "Only interact actions require a targetId." })
    }
  }
  for (let index = 1; index < direction.coverage.length; index += 1) {
    if (direction.coverage[index]!.startUs < direction.coverage[index - 1]!.endUs) {
      context.addIssue({ code: "custom", path: ["coverage", index], message: "Camera coverage intervals must not overlap." })
    }
  }
})

export type SpatialDirection = Readonly<z.infer<typeof SpatialDirectionSchema>>

export function parseSpatialDirection(input: unknown): SpatialDirection {
  try {
    return deepFreezeJson(parseSpatialValue(SpatialDirectionSchema, input, "direction"))
  } catch (error) {
    if (error instanceof SpatialSceneError) throw error
    throw new SpatialSceneError("invalid-data", error instanceof Error ? error.message : String(error), "direction")
  }
}

export function spatialDirectionSha256(direction: SpatialDirection): string {
  return spatialValueSha256(direction)
}
