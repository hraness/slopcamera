import { z } from "zod"
import { deepFreezeJson } from "../code/json-snapshot.js"
import { SpatialDigestSchema, SpatialTransformSchema } from "./contracts.js"
import { SPATIAL_GLB_LIMITS, SPATIAL_GLB_RIGGED_PROFILE, type SpatialGlbEvaluateOptions, type SpatialGlbModel } from "./gltf.js"
import { parseSpatialValue, SpatialSceneError } from "./identity.js"
import { composeTransform, multiplyTransforms, type Mat4 } from "./math.js"

export const HUMANOID_BONE_NAMES = [
  "hips", "spine", "chest", "upperChest", "neck", "head",
  "leftEye", "rightEye", "jaw",
  "leftShoulder", "leftUpperArm", "leftLowerArm", "leftHand",
  "leftUpperLeg", "leftLowerLeg", "leftFoot", "leftToes",
  "rightShoulder", "rightUpperArm", "rightLowerArm", "rightHand",
  "rightUpperLeg", "rightLowerLeg", "rightFoot", "rightToes",
  "leftThumbProximal", "leftThumbIntermediate", "leftThumbDistal",
  "leftIndexProximal", "leftIndexIntermediate", "leftIndexDistal",
  "leftMiddleProximal", "leftMiddleIntermediate", "leftMiddleDistal",
  "leftRingProximal", "leftRingIntermediate", "leftRingDistal",
  "leftLittleProximal", "leftLittleIntermediate", "leftLittleDistal",
  "rightThumbProximal", "rightThumbIntermediate", "rightThumbDistal",
  "rightIndexProximal", "rightIndexIntermediate", "rightIndexDistal",
  "rightMiddleProximal", "rightMiddleIntermediate", "rightMiddleDistal",
  "rightRingProximal", "rightRingIntermediate", "rightRingDistal",
  "rightLittleProximal", "rightLittleIntermediate", "rightLittleDistal",
] as const

export const CORE_HUMANOID_BONE_NAMES = [
  "hips", "spine", "chest", "upperChest", "neck", "head",
  "leftShoulder", "leftUpperArm", "leftLowerArm", "leftHand",
  "rightShoulder", "rightUpperArm", "rightLowerArm", "rightHand",
  "leftUpperLeg", "leftLowerLeg", "leftFoot",
  "rightUpperLeg", "rightLowerLeg", "rightFoot",
] as const

export type SpatialHumanoidBoneName = typeof HUMANOID_BONE_NAMES[number]

const humanoidBoneName = z.enum(HUMANOID_BONE_NAMES)

const humanoidBoneMappingSchema = z.strictObject({
  canonicalName: humanoidBoneName,
  sourceNodeIndex: z.number().int().min(0).max(SPATIAL_GLB_LIMITS.nodes - 1),
  restOffset: SpatialTransformSchema,
})

export const SpatialHumanoidMappingSchema = z.strictObject({
  kind: z.literal("slopcamera.spatial-humanoid-mapping"),
  schemaVersion: z.literal(1),
  sourceAssetSha256: SpatialDigestSchema,
  sourceProfile: z.literal(SPATIAL_GLB_RIGGED_PROFILE),
  bones: z.array(humanoidBoneMappingSchema).min(1).max(SPATIAL_GLB_LIMITS.jointsPerSkin),
}).superRefine((mapping, context) => {
  const names = new Set<string>()
  const nodes = new Set<number>()
  for (const [index, bone] of mapping.bones.entries()) {
    if (names.has(bone.canonicalName)) {
      context.addIssue({ code: "custom", path: ["bones", index, "canonicalName"], message: "Canonical bone name must be unique." })
    } else {
      names.add(bone.canonicalName)
    }
    if (nodes.has(bone.sourceNodeIndex)) {
      context.addIssue({ code: "custom", path: ["bones", index, "sourceNodeIndex"], message: "Source node index must be unique." })
    } else {
      nodes.add(bone.sourceNodeIndex)
    }
  }
  for (const name of CORE_HUMANOID_BONE_NAMES) {
    if (!names.has(name)) {
      context.addIssue({ code: "custom", path: ["bones"], message: `Core bone ${name} is required.` })
    }
  }
})

export const SpatialHumanoidAttachmentSchema = z.strictObject({
  kind: z.literal("slopcamera.spatial-humanoid-attachment"),
  schemaVersion: z.literal(1),
  name: z.string().min(1).max(256),
  mapping: SpatialHumanoidMappingSchema,
  bone: humanoidBoneName,
  localOffset: SpatialTransformSchema,
})

type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T
export type SpatialHumanoidMapping = DeepReadonly<z.infer<typeof SpatialHumanoidMappingSchema>>
export type SpatialHumanoidAttachment = DeepReadonly<z.infer<typeof SpatialHumanoidAttachmentSchema>>

export function parseHumanoidMapping(input: unknown): SpatialHumanoidMapping {
  const value = parseSpatialValue(SpatialHumanoidMappingSchema, input, "humanoid mapping")
  return deepFreezeJson(value) as unknown as SpatialHumanoidMapping
}

export function parseHumanoidAttachment(input: unknown): SpatialHumanoidAttachment {
  const value = parseSpatialValue(SpatialHumanoidAttachmentSchema, input, "humanoid attachment")
  return deepFreezeJson(value) as unknown as SpatialHumanoidAttachment
}

export function evaluateHumanoidAttachmentMatrix(
  attachment: SpatialHumanoidAttachment,
  model: SpatialGlbModel,
  options: SpatialGlbEvaluateOptions,
  sourceAssetSha256: string,
): Mat4 {
  if (attachment.mapping.sourceAssetSha256 !== sourceAssetSha256) {
    throw new SpatialSceneError("invalid-data", "Stale source asset digest.", "character")
  }
  if (attachment.mapping.sourceProfile !== model.profile || model.rigFacts === undefined) {
    throw new SpatialSceneError("invalid-data", "Source profile does not match or model is not rigged.", "character")
  }
  const joints = new Set<number>()
  for (const skin of model.rigFacts.skins) {
    for (const node of skin.jointNodeIndices) {
      joints.add(node)
    }
  }
  const boneByName = new Map(attachment.mapping.bones.map(bone => [bone.canonicalName, bone] as const))
  const mapped = boneByName.get(attachment.bone)
  if (mapped === undefined) {
    throw new SpatialSceneError("not-found", `Canonical bone ${attachment.bone} is not mapped.`, "character")
  }
  if (!joints.has(mapped.sourceNodeIndex)) {
    throw new SpatialSceneError("invalid-data", `Source node ${mapped.sourceNodeIndex} is not a rig joint.`, "character")
  }
  const world = model.jointWorldMatrix(options, mapped.sourceNodeIndex)
  return multiplyTransforms(world, multiplyTransforms(composeTransform(mapped.restOffset), composeTransform(attachment.localOffset)))
}
