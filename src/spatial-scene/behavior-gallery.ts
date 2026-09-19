import { z } from "zod"

import { deepFreezeJson } from "../code/json-snapshot.js"
import {
  parseSpatialBehavior,
  spatialBehaviorSha256,
  type SpatialBehavior,
} from "./behavior.js"
import { bakeSpatialBehavior } from "./behavior-bake.js"
import {
  parseSpatialBehaviorChannelMap,
  SpatialBehaviorBakeSchema,
} from "./behavior-trace.js"
import {
  SpatialDigestSchema,
  SpatialSceneV1Schema,
} from "./contracts.js"
import { parseSpatialValue, spatialValueSha256 } from "./identity.js"

/**
 * Seeded behavior galleries: one admitted behavior document baked under
 * deterministic seed variants produces content-addressed bake candidates.
 * Behaviors that never consume the document seed collapse to fewer
 * candidates — deduplication keeps the first, so the plan honestly reports
 * how much diversity the organism actually admits. `selection` is never
 * populated by the planner; selection stays an explicit downstream act.
 */

const BEHAVIOR_GALLERY_SEED_STRIDE = [0, 1, 2, 5, 11, 23] as const
const SEED_MODULUS = 0x1_0000_0000

export const SPATIAL_BEHAVIOR_GALLERY_LIMITS = Object.freeze({
  candidates: 6,
})

export const SpatialBehaviorGalleryCandidateSchema = z.strictObject({
  candidateId: z.string().min(1).max(96).regex(/^cand_[a-f0-9]{16}$/u),
  label: z.string().min(1).max(128),
  parameter: z.string().min(1).max(64),
  documentKind: z.literal("slopcamera.spatial-behavior-bake"),
  documentSha256: SpatialDigestSchema,
  document: z.unknown(),
})
export type SpatialBehaviorGalleryCandidate = Readonly<z.infer<typeof SpatialBehaviorGalleryCandidateSchema>>

export const SpatialBehaviorGalleryPlanSchema = z.strictObject({
  kind: z.literal("slopcamera.spatial-behavior-gallery"),
  schemaVersion: z.literal(1),
  behaviorSha256: SpatialDigestSchema,
  sceneSha256: SpatialDigestSchema,
  entry: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  candidates: z.array(SpatialBehaviorGalleryCandidateSchema).max(SPATIAL_BEHAVIOR_GALLERY_LIMITS.candidates),
})
export type SpatialBehaviorGalleryPlan = Readonly<z.infer<typeof SpatialBehaviorGalleryPlanSchema>>

export function spatialBehaviorGalleryPlanSha256(plan: SpatialBehaviorGalleryPlan): string {
  return spatialValueSha256(plan)
}

const galleryOptionsSchema = z.strictObject({
  behavior: z.unknown(),
  scene: z.unknown(),
  channelMap: z.unknown().optional(),
})

const candidateId = (parameter: string, behaviorSha256: string): string =>
  `cand_${spatialValueSha256({ domain: "slopcamera.behavior-gallery-candidate.v1", parameter, behaviorSha256 }).slice(0, 16)}`

export async function planSpatialBehaviorGallery(input: unknown): Promise<SpatialBehaviorGalleryPlan> {
  const options = parseSpatialValue(galleryOptionsSchema, input, "behavior gallery")
  const behavior = parseSpatialBehavior(options.behavior)
  const scene = parseSpatialValue(SpatialSceneV1Schema, options.scene, "scene")
  const channelMap = options.channelMap === undefined ? undefined : parseSpatialBehaviorChannelMap(options.channelMap)

  const seen = new Set<string>()
  const candidates: SpatialBehaviorGalleryCandidate[] = []
  for (const stride of BEHAVIOR_GALLERY_SEED_STRIDE) {
    const seed = (behavior.seed + stride) % SEED_MODULUS
    const variant: SpatialBehavior = parseSpatialBehavior({ ...behavior, seed })
    const { bake } = await bakeSpatialBehavior({
      behavior: variant,
      scene,
      ...(channelMap === undefined ? {} : { channelMap }),
    })
    // Dedup on the emitted trace, not the receipt-bound bake: seed-agnostic
    // organisms emit identical records under every variant and must collapse.
    const documentSha256 = spatialValueSha256(bake)
    if (seen.has(bake.receipt.emittedSha256)) continue
    seen.add(bake.receipt.emittedSha256)
    const parameter = `seed:${seed}`
    candidates.push(deepFreezeJson({
      candidateId: candidateId(parameter, bake.behaviorSha256),
      label: `seed ${seed}`,
      parameter,
      documentKind: "slopcamera.spatial-behavior-bake",
      documentSha256,
      document: SpatialBehaviorBakeSchema.parse(bake),
    }))
  }

  return deepFreezeJson(SpatialBehaviorGalleryPlanSchema.parse({
    kind: "slopcamera.spatial-behavior-gallery",
    schemaVersion: 1,
    behaviorSha256: spatialBehaviorSha256(behavior),
    sceneSha256: spatialValueSha256(scene),
    entry: behavior.entry,
    candidates,
  }))
}
