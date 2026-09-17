import { z } from "zod"
import { canonicalJsonSha256 } from "../code/canonical-json.js"
import { deepFreezeJson } from "../code/json-snapshot.js"
import { HUMANOID_BONE_NAMES, type SpatialHumanoidMapping } from "./character.js"
import {
  SPATIAL_SCENE_LIMITS, SpatialDigestSchema, SpatialFrameRateSchema, SpatialQuaternionSchema,
  SpatialTimeUsSchema, SpatialTransformSchema, SpatialVec3Schema,
  type SpatialFrameRate,
} from "./contracts.js"
import { parseSpatialValue, sortSpatialBy, SpatialSceneError } from "./identity.js"
import {
  composeTransform, multiplyTransforms, normalizeQuaternion, slerpQuaternion,
  type Quaternion, type Vec3,
} from "./math.js"
import { spatialFrameCount, spatialFrameSample } from "./time.js"

export const SPATIAL_PERFORMANCE_LIMITS = Object.freeze({
  directives: 256,
  clips: 128,
  props: 128,
  samples: 1_024,
  channels: 512,
  keysPerChannel: SPATIAL_SCENE_LIMITS.keysPerChannel,
  bones: 128,
  morphTargets: 16,
  findings: 1_024,
  attachments: 64,
  cameras: 64,
  galleryCandidates: 64,
  bakeProfiles: 32,
})

/** Canonical deterministic body masks. Each maps to an ordered bone set. */
export const SPATIAL_PERFORMANCE_BODY_MASKS = Object.freeze({
  fullBody: HUMANOID_BONE_NAMES,
  upperBody: [
    "hips", "spine", "chest", "upperChest",
    "leftShoulder", "leftUpperArm", "leftLowerArm", "leftHand",
    "rightShoulder", "rightUpperArm", "rightLowerArm", "rightHand",
    "neck", "head", "leftEye", "rightEye", "jaw",
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
  ],
  lowerBody: [
    "hips", "spine",
    "leftUpperLeg", "leftLowerLeg", "leftFoot", "leftToes",
    "rightUpperLeg", "rightLowerLeg", "rightFoot", "rightToes",
  ],
  head: ["neck", "head", "leftEye", "rightEye", "jaw"],
  spine: ["hips", "spine", "chest", "upperChest", "neck"],
  leftArm: ["leftShoulder", "leftUpperArm", "leftLowerArm", "leftHand"],
  rightArm: ["rightShoulder", "rightUpperArm", "rightLowerArm", "rightHand"],
  leftArmFull: ["leftShoulder", "leftUpperArm", "leftLowerArm", "leftHand",
    "leftThumbProximal", "leftThumbIntermediate", "leftThumbDistal",
    "leftIndexProximal", "leftIndexIntermediate", "leftIndexDistal",
    "leftMiddleProximal", "leftMiddleIntermediate", "leftMiddleDistal",
    "leftRingProximal", "leftRingIntermediate", "leftRingDistal",
    "leftLittleProximal", "leftLittleIntermediate", "leftLittleDistal"],
  rightArmFull: ["rightShoulder", "rightUpperArm", "rightLowerArm", "rightHand",
    "rightThumbProximal", "rightThumbIntermediate", "rightThumbDistal",
    "rightIndexProximal", "rightIndexIntermediate", "rightIndexDistal",
    "rightMiddleProximal", "rightMiddleIntermediate", "rightMiddleDistal",
    "rightRingProximal", "rightRingIntermediate", "rightRingDistal",
    "rightLittleProximal", "rightLittleIntermediate", "rightLittleDistal"],
  leftLeg: ["leftUpperLeg", "leftLowerLeg", "leftFoot", "leftToes"],
  rightLeg: ["rightUpperLeg", "rightLowerLeg", "rightFoot", "rightToes"],
} as const)

export type SpatialPerformanceBodyMaskName = keyof typeof SPATIAL_PERFORMANCE_BODY_MASKS

export const SPATIAL_PERFORMANCE_COMPILER_ID = "slopcamera.spatial-performance-compiler@v2"

const humanoidBoneName = z.enum(HUMANOID_BONE_NAMES)
const unit = z.number().finite().min(0).max(1)
const finiteCoord = z.number().finite().min(-1_000_000).max(1_000_000)
const positiveTimeScale = z.number().finite().min(0.001).max(1_000)
const directiveId = z.string().min(1).max(128)
const bodyMaskName = z.enum(Object.keys(SPATIAL_PERFORMANCE_BODY_MASKS) as [string, ...string[]])
const bodyMaskBones = z.array(humanoidBoneName).min(1).max(HUMANOID_BONE_NAMES.length)
const bodyMask = z.union([bodyMaskName, bodyMaskBones])

const clipKey = z.strictObject({
  timeUs: SpatialTimeUsSchema,
  position: SpatialVec3Schema,
  rotation: SpatialQuaternionSchema,
})

export const SpatialPerformanceClipSchema = z.strictObject({
  kind: z.literal("slopcamera.spatial-performance-clip"),
  schemaVersion: z.literal(1),
  durationUs: SpatialTimeUsSchema.refine((value) => value > 0, "Clip duration must be positive."),
  channels: z.array(z.strictObject({
    bone: humanoidBoneName,
    keys: z.array(clipKey).min(1).max(SPATIAL_PERFORMANCE_LIMITS.keysPerChannel),
  })).min(1).max(SPATIAL_PERFORMANCE_LIMITS.channels),
}).superRefine((clip, context) => {
  for (const [index, channel] of clip.channels.entries()) {
    const times = channel.keys.map((key) => key.timeUs)
    for (let i = 1; i < times.length; i += 1) {
      if (times[i]! <= times[i - 1]!) {
        context.addIssue({ code: "custom", path: ["channels", index, "keys"], message: "Clip keys must be sorted by time." })
      }
    }
    if (channel.keys[0]!.timeUs > 0 || channel.keys[channel.keys.length - 1]!.timeUs < clip.durationUs) {
      context.addIssue({ code: "custom", path: ["channels", index], message: "Clip channel keys must cover [0, durationUs]." })
    }
  }
})

export const SpatialPerformancePropSchema = z.strictObject({
  propId: z.string().min(1).max(128),
  localOffset: SpatialTransformSchema,
})

const clipDirective = z.strictObject({
  directiveId,
  kind: z.literal("clip"),
  clipDigest: SpatialDigestSchema,
  startUs: SpatialTimeUsSchema,
  endUs: SpatialTimeUsSchema,
  trimStartUs: SpatialTimeUsSchema,
  trimEndUs: SpatialTimeUsSchema,
  loop: z.union([z.number().int().min(1).max(1_024), z.literal("once")]),
  timeScale: positiveTimeScale,
  mode: z.enum(["override", "additive"]).optional().default("override"),
  mask: bodyMask.optional(),
}).superRefine((directive, context) => {
  if (directive.endUs <= directive.startUs) context.addIssue({ code: "custom", path: ["endUs"], message: "Clip output end must exceed start." })
  if (directive.trimEndUs <= directive.trimStartUs) context.addIssue({ code: "custom", path: ["trimEndUs"], message: "Clip trim end must exceed start." })
  if (directive.mode === "additive" && directive.loop !== "once") {
    context.addIssue({ code: "custom", path: ["loop"], message: "Additive clips must loop once." })
  }
})

const crossfadeDirective = z.strictObject({
  directiveId,
  kind: z.literal("crossfade"),
  fromClipId: directiveId,
  toClipId: directiveId,
  startUs: SpatialTimeUsSchema,
  durationUs: z.number().int().min(0).max(SPATIAL_SCENE_LIMITS.durationUs),
})

const lookAtDirective = z.strictObject({
  directiveId,
  kind: z.literal("look-at"),
  bone: humanoidBoneName,
  target: SpatialVec3Schema,
})

const twoBoneIkDirective = z.strictObject({
  directiveId,
  kind: z.literal("two-bone-ik"),
  endBone: humanoidBoneName,
  target: SpatialVec3Schema,
  pole: SpatialVec3Schema,
  policy: z.enum(["stretch", "preserve"]).default("stretch"),
})

const footPlantDirective = z.strictObject({
  directiveId,
  kind: z.literal("foot-plant"),
  bone: humanoidBoneName,
  groundY: finiteCoord,
})

const morphDirective = z.strictObject({
  directiveId,
  kind: z.literal("morph"),
  index: z.number().int().min(0).max(SPATIAL_PERFORMANCE_LIMITS.morphTargets - 1),
  weight: unit,
})

const attachDirective = z.strictObject({
  directiveId,
  kind: z.literal("attach"),
  propId: z.string().min(1).max(128),
  bone: humanoidBoneName,
  localOffset: SpatialTransformSchema,
  startUs: SpatialTimeUsSchema,
  endUs: SpatialTimeUsSchema,
}).superRefine((directive, context) => {
  if (directive.endUs <= directive.startUs) context.addIssue({ code: "custom", path: ["endUs"], message: "Attach end must exceed start." })
})

const releaseDirective = z.strictObject({
  directiveId,
  kind: z.literal("release"),
  propId: z.string().min(1).max(128),
  startUs: SpatialTimeUsSchema,
})

const rootTrajectoryDirective = z.strictObject({
  directiveId,
  kind: z.literal("root-trajectory"),
  waypoints: z.array(z.strictObject({
    timeUs: SpatialTimeUsSchema,
    position: SpatialVec3Schema,
    rotation: SpatialQuaternionSchema,
  })).min(2).max(SPATIAL_PERFORMANCE_LIMITS.samples),
}).superRefine((directive, context) => {
  for (let i = 1; i < directive.waypoints.length; i += 1) {
    if (directive.waypoints[i]!.timeUs <= directive.waypoints[i - 1]!.timeUs) {
      context.addIssue({ code: "custom", path: ["waypoints"], message: "Trajectory waypoints must be sorted by time." })
    }
  }
})

const springDirective = z.strictObject({
  directiveId,
  kind: z.literal("spring"),
  bone: humanoidBoneName,
  amplitude: z.number().finite().min(0).max(1),
  frequency: z.number().finite().min(0).max(100),
  seed: z.number().int().min(0).max(0xffff_ffff),
})

export const SpatialPerformancePlanSchema = z.strictObject({
  kind: z.literal("slopcamera.spatial-performance-plan"),
  schemaVersion: z.literal(1),
  sceneSha256: SpatialDigestSchema,
  rigSha256: SpatialDigestSchema,
  mappingSha256: SpatialDigestSchema,
  compilerVersion: z.literal(SPATIAL_PERFORMANCE_COMPILER_ID),
  seed: z.number().int().min(0).max(0xffff_ffff),
  durationUs: SpatialTimeUsSchema.refine((value) => value > 0, "Duration must be positive."),
  frameRate: SpatialFrameRateSchema,
  directives: z.array(z.discriminatedUnion("kind", [
    clipDirective,
    crossfadeDirective,
    lookAtDirective,
    twoBoneIkDirective,
    footPlantDirective,
    morphDirective,
    attachDirective,
    releaseDirective,
    rootTrajectoryDirective,
    springDirective,
  ])).min(1).max(SPATIAL_PERFORMANCE_LIMITS.directives),
})

export const SpatialPerformanceSourcesSchema = z.strictObject({
  sceneSha256: SpatialDigestSchema,
  rigSha256: SpatialDigestSchema,
  mapping: z.custom<SpatialHumanoidMapping>((value) => value !== null && typeof value === "object"),
  clips: z.record(SpatialDigestSchema, SpatialPerformanceClipSchema).refine(
    (record) => Object.keys(record).length <= SPATIAL_PERFORMANCE_LIMITS.clips,
    "Too many source clips.",
  ),
  props: z.record(z.string().min(1).max(128), SpatialPerformancePropSchema).refine(
    (record) => Object.keys(record).length <= SPATIAL_PERFORMANCE_LIMITS.props,
    "Too many props.",
  ),
})

export const SpatialPerformanceBoneChannelSchema = z.strictObject({
  kind: z.literal("bone-pose"),
  bone: humanoidBoneName,
  keys: z.array(z.strictObject({
    timeUs: SpatialTimeUsSchema,
    position: SpatialVec3Schema,
    rotation: SpatialQuaternionSchema,
  })).max(SPATIAL_PERFORMANCE_LIMITS.samples),
})

export const SpatialPerformanceMorphChannelSchema = z.strictObject({
  kind: z.literal("morph"),
  index: z.number().int().min(0).max(SPATIAL_PERFORMANCE_LIMITS.morphTargets - 1),
  keys: z.array(z.strictObject({
    timeUs: SpatialTimeUsSchema,
    value: unit,
  })).max(SPATIAL_PERFORMANCE_LIMITS.samples),
})

export const SpatialPerformanceAttachmentChannelSchema = z.strictObject({
  kind: z.literal("attachment"),
  propId: z.string().min(1).max(128),
  keys: z.array(z.strictObject({
    timeUs: SpatialTimeUsSchema,
    attached: z.boolean(),
    parentBone: humanoidBoneName,
    localOffset: SpatialTransformSchema,
  })).max(SPATIAL_PERFORMANCE_LIMITS.samples),
})

export const SpatialPerformanceChannelSchema = z.discriminatedUnion("kind", [
  SpatialPerformanceBoneChannelSchema,
  SpatialPerformanceMorphChannelSchema,
  SpatialPerformanceAttachmentChannelSchema,
])

const attachmentSample = z.strictObject({
  attached: z.boolean(),
  parentBone: humanoidBoneName.optional(),
  localOffset: SpatialTransformSchema.optional(),
  worldPosition: SpatialVec3Schema,
})

export const SpatialPerformanceSampleSchema = z.strictObject({
  timeUs: SpatialTimeUsSchema,
  boneWorld: z.record(humanoidBoneName, z.strictObject({
    position: SpatialVec3Schema,
    rotation: SpatialQuaternionSchema,
  })),
  attachments: z.record(z.string().min(1).max(128), attachmentSample).refine(
    (record) => Object.keys(record).length <= SPATIAL_PERFORMANCE_LIMITS.attachments,
    "Too many attachments.",
  ),
})

export const SpatialPerformanceReceiptSchema = z.strictObject({
  kind: z.literal("slopcamera.spatial-performance-receipt"),
  schemaVersion: z.literal(1),
  compiler: z.literal(SPATIAL_PERFORMANCE_COMPILER_ID),
  compilerSha256: SpatialDigestSchema,
  sceneSha256: SpatialDigestSchema,
  rigSha256: SpatialDigestSchema,
  mappingSha256: SpatialDigestSchema,
  directivesSha256: SpatialDigestSchema,
  seed: z.number().int().min(0).max(0xffff_ffff),
  outputSha256: SpatialDigestSchema,
  durationUs: SpatialTimeUsSchema,
  sampleCount: z.number().int().min(1).max(SPATIAL_PERFORMANCE_LIMITS.samples),
})

export const SpatialPerformanceTakeSchema = z.strictObject({
  kind: z.literal("slopcamera.spatial-performance-take"),
  schemaVersion: z.literal(1),
  planSha256: SpatialDigestSchema,
  durationUs: SpatialTimeUsSchema,
  samples: z.array(SpatialPerformanceSampleSchema).max(SPATIAL_PERFORMANCE_LIMITS.samples),
  channels: z.array(SpatialPerformanceChannelSchema).max(SPATIAL_PERFORMANCE_LIMITS.channels),
  receipt: SpatialPerformanceReceiptSchema,
})

export const SpatialPerformanceFindingSchema = z.strictObject({
  kind: z.enum([
    "joint-limit",
    "foot-slide",
    "ground-penetration",
    "gaze-error",
    "attachment-drift",
    "clip-discontinuity",
    "character-camera-collision",
    "character-character-collision",
  ]),
  severity: z.enum(["info", "warning"]),
  entityId: z.string().min(1).max(128).optional(),
  bone: humanoidBoneName.optional(),
  timeUs: SpatialTimeUsSchema.optional(),
  detail: z.string().min(1).max(1_024),
})

export const SpatialPerformanceAuditReportSchema = z.strictObject({
  kind: z.literal("slopcamera.spatial-performance-audit"),
  schemaVersion: z.literal(1),
  takeSha256: SpatialDigestSchema,
  findings: z.array(SpatialPerformanceFindingSchema).max(SPATIAL_PERFORMANCE_LIMITS.findings),
  omittedFindings: z.number().int().min(0),
})

export const SpatialPerformanceAuditOptionsSchema = z.strictObject({
  characterId: z.string().min(1).max(128).default("character"),
  groundY: finiteCoord.optional(),
  gazeTarget: SpatialVec3Schema.optional(),
  cameras: z.array(z.strictObject({
    cameraId: z.string().min(1).max(128),
    position: SpatialVec3Schema,
    near: z.number().finite().min(0.000001).max(1_000_000),
  })).max(SPATIAL_PERFORMANCE_LIMITS.cameras).optional(),
  otherCharacters: z.array(z.strictObject({
    characterId: z.string().min(1).max(128),
    position: SpatialVec3Schema,
    radius: z.number().finite().min(0.000001).max(100),
  })).max(16).optional(),
  clipBoundaries: z.array(SpatialTimeUsSchema).max(SPATIAL_PERFORMANCE_LIMITS.directives).optional(),
})

export const SpatialPerformanceGalleryCandidateSchema = z.strictObject({
  candidateId: z.string().min(1).max(128),
  takeSha256: SpatialDigestSchema,
  receiptOutputSha256: SpatialDigestSchema,
  label: z.string().min(1).max(256),
})

export const SpatialPerformanceGalleryPlanSchema = z.strictObject({
  kind: z.literal("slopcamera.spatial-performance-gallery-plan"),
  schemaVersion: z.literal(1),
  planSha256: SpatialDigestSchema,
  candidates: z.array(SpatialPerformanceGalleryCandidateSchema)
    .min(1)
    .max(SPATIAL_PERFORMANCE_LIMITS.galleryCandidates),
}).superRefine((plan, context) => {
  const ids = new Set<string>()
  for (const [index, candidate] of plan.candidates.entries()) {
    if (ids.has(candidate.candidateId)) {
      context.addIssue({ code: "custom", path: ["candidates", index, "candidateId"], message: "Candidate id must be unique." })
    }
    ids.add(candidate.candidateId)
  }
})

export const SpatialPerformanceGallerySelectionSchema = z.strictObject({
  kind: z.literal("slopcamera.spatial-performance-gallery-selection"),
  schemaVersion: z.literal(1),
  galleryPlanSha256: SpatialDigestSchema,
  selectedCandidateId: z.string().min(1).max(128),
  takeSha256: SpatialDigestSchema,
  receiptOutputSha256: SpatialDigestSchema,
})

export const SpatialPerformanceBakeEngineSchema = z.strictObject({
  engineId: z.string().min(1).max(128),
  profile: z.string().min(1).max(256),
})

export const SpatialPerformanceBakeInputSchema = z.strictObject({
  inputSha256: SpatialDigestSchema,
  inputProfile: z.string().min(1).max(256),
})

export const SpatialPerformanceBakeOutputSchema = z.strictObject({
  outputProfile: z.string().min(1).max(256),
  outputSha256: SpatialDigestSchema.optional(),
})

export const SpatialPerformanceBakeRequestSchema = z.strictObject({
  kind: z.literal("slopcamera.spatial-performance-bake-request"),
  schemaVersion: z.literal(1),
  engine: SpatialPerformanceBakeEngineSchema,
  input: SpatialPerformanceBakeInputSchema,
  outputs: z.array(SpatialPerformanceBakeOutputSchema).min(1).max(SPATIAL_PERFORMANCE_LIMITS.bakeProfiles),
})

export const SpatialPerformanceBakeReceiptSchema = z.strictObject({
  kind: z.literal("slopcamera.spatial-performance-bake-receipt"),
  schemaVersion: z.literal(1),
  requestSha256: SpatialDigestSchema,
  engine: SpatialPerformanceBakeEngineSchema,
  input: SpatialPerformanceBakeInputSchema,
  outputs: z.array(z.strictObject({
    outputProfile: z.string().min(1).max(256),
    outputSha256: SpatialDigestSchema,
  })).min(1).max(SPATIAL_PERFORMANCE_LIMITS.bakeProfiles),
})

type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T

export type SpatialPerformancePlan = DeepReadonly<z.infer<typeof SpatialPerformancePlanSchema>>
export type SpatialPerformanceClip = DeepReadonly<z.infer<typeof SpatialPerformanceClipSchema>>
export type SpatialPerformanceProp = DeepReadonly<z.infer<typeof SpatialPerformancePropSchema>>
export type SpatialPerformanceSources = DeepReadonly<z.infer<typeof SpatialPerformanceSourcesSchema>>
export type SpatialPerformanceTake = DeepReadonly<z.infer<typeof SpatialPerformanceTakeSchema>>
export type SpatialPerformanceBoneChannel = DeepReadonly<z.infer<typeof SpatialPerformanceBoneChannelSchema>>
export type SpatialPerformanceMorphChannel = DeepReadonly<z.infer<typeof SpatialPerformanceMorphChannelSchema>>
export type SpatialPerformanceAttachmentChannel = DeepReadonly<z.infer<typeof SpatialPerformanceAttachmentChannelSchema>>
export type SpatialPerformanceReceipt = DeepReadonly<z.infer<typeof SpatialPerformanceReceiptSchema>>
export type SpatialPerformanceFinding = DeepReadonly<z.infer<typeof SpatialPerformanceFindingSchema>>
export type SpatialPerformanceAuditReport = DeepReadonly<z.infer<typeof SpatialPerformanceAuditReportSchema>>
export type SpatialPerformanceAuditOptions = DeepReadonly<z.infer<typeof SpatialPerformanceAuditOptionsSchema>>
export type SpatialPerformanceGalleryPlan = DeepReadonly<z.infer<typeof SpatialPerformanceGalleryPlanSchema>>
export type SpatialPerformanceGalleryCandidate = DeepReadonly<z.infer<typeof SpatialPerformanceGalleryCandidateSchema>>
export type SpatialPerformanceGallerySelection = DeepReadonly<z.infer<typeof SpatialPerformanceGallerySelectionSchema>>
export type SpatialPerformanceBakeRequest = DeepReadonly<z.infer<typeof SpatialPerformanceBakeRequestSchema>>
export type SpatialPerformanceBakeReceipt = DeepReadonly<z.infer<typeof SpatialPerformanceBakeReceiptSchema>>

const BONE_PARENTS: Readonly<Record<string, string | null>> = Object.freeze({
  hips: null,
  spine: "hips",
  chest: "spine",
  upperChest: "chest",
  neck: "upperChest",
  head: "neck",
  leftEye: "head",
  rightEye: "head",
  jaw: "head",
  leftShoulder: "upperChest",
  leftUpperArm: "leftShoulder",
  leftLowerArm: "leftUpperArm",
  leftHand: "leftLowerArm",
  leftUpperLeg: "hips",
  leftLowerLeg: "leftUpperLeg",
  leftFoot: "leftLowerLeg",
  leftToes: "leftFoot",
  rightShoulder: "upperChest",
  rightUpperArm: "rightShoulder",
  rightLowerArm: "rightUpperArm",
  rightHand: "rightLowerArm",
  rightUpperLeg: "hips",
  rightLowerLeg: "rightUpperLeg",
  rightFoot: "rightLowerLeg",
  rightToes: "rightFoot",
  leftThumbProximal: "leftHand",
  leftThumbIntermediate: "leftThumbProximal",
  leftThumbDistal: "leftThumbIntermediate",
  leftIndexProximal: "leftHand",
  leftIndexIntermediate: "leftIndexProximal",
  leftIndexDistal: "leftIndexIntermediate",
  leftMiddleProximal: "leftHand",
  leftMiddleIntermediate: "leftMiddleProximal",
  leftMiddleDistal: "leftMiddleIntermediate",
  leftRingProximal: "leftHand",
  leftRingIntermediate: "leftRingProximal",
  leftRingDistal: "leftRingIntermediate",
  leftLittleProximal: "leftHand",
  leftLittleIntermediate: "leftLittleProximal",
  leftLittleDistal: "leftLittleIntermediate",
  rightThumbProximal: "rightHand",
  rightThumbIntermediate: "rightThumbProximal",
  rightThumbDistal: "rightThumbIntermediate",
  rightIndexProximal: "rightHand",
  rightIndexIntermediate: "rightIndexProximal",
  rightIndexDistal: "rightIndexIntermediate",
  rightMiddleProximal: "rightHand",
  rightMiddleIntermediate: "rightMiddleProximal",
  rightMiddleDistal: "rightMiddleIntermediate",
  rightRingProximal: "rightHand",
  rightRingIntermediate: "rightRingProximal",
  rightRingDistal: "rightRingIntermediate",
  rightLittleProximal: "rightHand",
  rightLittleIntermediate: "rightLittleProximal",
  rightLittleDistal: "rightLittleIntermediate",
})

function assertBoneExists(mapping: SpatialHumanoidMapping, bone: string, path: string): void {
  if (mapping.bones.find((b) => b.canonicalName === bone) === undefined) {
    throw new SpatialSceneError("not-found", `Canonical bone ${bone} is not mapped.`, path)
  }
}

function assertPropExists(sources: SpatialPerformanceSources, propId: string, path: string): void {
  if (sources.props[propId] === undefined) {
    throw new SpatialSceneError("not-found", `Prop ${propId} is not defined.`, path)
  }
}

function validatePerformancePlan(plan: SpatialPerformancePlan, sources: SpatialPerformanceSources): void {
  const directiveIds = new Set<string>()
  const clipDirectives = plan.directives.filter((d): d is Extract<SpatialPerformancePlan["directives"][number], { kind: "clip" }> => d.kind === "clip")
  const clipById = new Map(clipDirectives.map((d) => [d.directiveId, d] as const))
  const mappedBones = new Set<string>(sources.mapping.bones.map((bone) => bone.canonicalName))

  const usedBones = new Set<string>()
  for (const directive of plan.directives) {
    if ("bone" in directive && directive.bone !== undefined) usedBones.add(directive.bone)
    if ("endBone" in directive && directive.endBone !== undefined) usedBones.add(directive.endBone)
  }
  for (const clip of Object.values(sources.clips)) {
    for (const channel of clip.channels) usedBones.add(channel.bone)
  }
  for (const bone of usedBones) {
    if (!mappedBones.has(bone)) continue
    const parent = BONE_PARENTS[bone]
    if (parent !== null && parent !== undefined && !mappedBones.has(parent)) {
      throw new SpatialSceneError("invalid-data", `Mapped bone ${bone} has unmapped parent ${parent}.`, "performance.mapping")
    }
  }

  for (const directive of plan.directives) {
    if (directiveIds.has(directive.directiveId)) {
      throw new SpatialSceneError("invalid-data", `Duplicate directiveId ${directive.directiveId}.`, "performance.directives")
    }
    directiveIds.add(directive.directiveId)

    if (directive.kind === "clip") {
      if (directive.endUs > plan.durationUs) {
        throw new SpatialSceneError("invalid-data", `Clip ${directive.directiveId} ends after plan duration.`, `performance.directive.${directive.directiveId}`)
      }
      const clip = sources.clips[directive.clipDigest]
      if (clip === undefined) {
        throw new SpatialSceneError("not-found", `Clip ${directive.clipDigest} is missing.`, `performance.directive.${directive.directiveId}`)
      }
      if (directive.trimStartUs > clip.durationUs || directive.trimEndUs > clip.durationUs) {
        throw new SpatialSceneError("invalid-data", `Clip ${directive.directiveId} trim bounds exceed clip duration.`, `performance.directive.${directive.directiveId}`)
      }
      for (const channel of clip.channels) {
        if (!mappedBones.has(channel.bone)) {
          throw new SpatialSceneError("invalid-data", `Clip ${directive.clipDigest} references unmapped bone ${channel.bone}.`, `performance.directive.${directive.directiveId}`)
        }
      }
      if (directive.mode === "additive" && directive.mask === undefined) {
        throw new SpatialSceneError("invalid-data", `Additive clip ${directive.directiveId} must declare a body mask.`, `performance.directive.${directive.directiveId}`)
      }
    } else if (directive.kind === "crossfade") {
      const from = clipById.get(directive.fromClipId)
      const to = clipById.get(directive.toClipId)
      if (from === undefined || from.kind !== "clip") {
        throw new SpatialSceneError("not-found", `Crossfade ${directive.directiveId} references unknown fromClipId ${directive.fromClipId}.`, `performance.directive.${directive.directiveId}`)
      }
      if (to === undefined || to.kind !== "clip") {
        throw new SpatialSceneError("not-found", `Crossfade ${directive.directiveId} references unknown toClipId ${directive.toClipId}.`, `performance.directive.${directive.directiveId}`)
      }
      if (from.mode === "additive" || to.mode === "additive") {
        throw new SpatialSceneError("invalid-data", `Crossfade ${directive.directiveId} cannot reference additive clips.`, `performance.directive.${directive.directiveId}`)
      }
      if (directive.startUs < from.startUs || directive.startUs < to.startUs) {
        throw new SpatialSceneError("invalid-data", `Crossfade ${directive.directiveId} starts before one of its clips.`, `performance.directive.${directive.directiveId}`)
      }
      const fadeEnd = directive.startUs + directive.durationUs
      if (fadeEnd > plan.durationUs) {
        throw new SpatialSceneError("invalid-data", `Crossfade ${directive.directiveId} ends after plan duration.`, `performance.directive.${directive.directiveId}`)
      }
      if (fadeEnd > from.endUs || fadeEnd > to.endUs) {
        throw new SpatialSceneError("invalid-data", `Crossfade ${directive.directiveId} extends beyond one of its clips.`, `performance.directive.${directive.directiveId}`)
      }
    } else if (directive.kind === "attach") {
      if (directive.endUs > plan.durationUs) {
        throw new SpatialSceneError("invalid-data", `Attach ${directive.directiveId} ends after plan duration.`, `performance.directive.${directive.directiveId}`)
      }
    } else if (directive.kind === "release") {
      if (directive.startUs > plan.durationUs) {
        throw new SpatialSceneError("invalid-data", `Release ${directive.directiveId} starts after plan duration.`, `performance.directive.${directive.directiveId}`)
      }
    } else if (directive.kind === "two-bone-ik") {
      const endBone = directive.endBone
      const lowerBone = BONE_PARENTS[endBone]
      const upperBone = lowerBone !== null && lowerBone !== undefined ? BONE_PARENTS[lowerBone] : undefined
      if (lowerBone === null || lowerBone === undefined || upperBone === null || upperBone === undefined) {
        throw new SpatialSceneError("invalid-data", `Two-bone IK ${directive.directiveId} requires at least two parent bones above ${endBone}.`, `performance.directive.${directive.directiveId}`)
      }
      for (const bone of [endBone, lowerBone, upperBone]) {
        if (!mappedBones.has(bone)) {
          throw new SpatialSceneError("invalid-data", `Two-bone IK ${directive.directiveId} chain bone ${bone} is not mapped.`, `performance.directive.${directive.directiveId}`)
        }
      }
    } else if (directive.kind === "root-trajectory") {
      for (const waypoint of directive.waypoints) {
        if (waypoint.timeUs > plan.durationUs) {
          throw new SpatialSceneError("invalid-data", `Root trajectory waypoint time ${waypoint.timeUs} exceeds plan duration.`, `performance.directive.${directive.directiveId}`)
        }
      }
    }
  }
}

export function parseSpatialPerformancePlan(input: unknown): SpatialPerformancePlan {
  const value = parseSpatialValue(SpatialPerformancePlanSchema, input, "performance plan")
  return deepFreezeJson(value) as unknown as SpatialPerformancePlan
}

export function parseSpatialPerformanceSources(input: unknown): SpatialPerformanceSources {
  const value = parseSpatialValue(SpatialPerformanceSourcesSchema, input, "performance sources")
  return deepFreezeJson(value) as unknown as SpatialPerformanceSources
}

export function parseSpatialPerformanceAuditOptions(input: unknown): SpatialPerformanceAuditOptions {
  const value = parseSpatialValue(SpatialPerformanceAuditOptionsSchema, input, "performance audit options")
  return deepFreezeJson(value) as unknown as SpatialPerformanceAuditOptions
}

export function parseSpatialPerformanceGalleryPlan(input: unknown): SpatialPerformanceGalleryPlan {
  const value = parseSpatialValue(SpatialPerformanceGalleryPlanSchema, input, "performance gallery plan")
  return deepFreezeJson(value) as unknown as SpatialPerformanceGalleryPlan
}

export function parseSpatialPerformanceGallerySelection(input: unknown): SpatialPerformanceGallerySelection {
  const value = parseSpatialValue(SpatialPerformanceGallerySelectionSchema, input, "performance gallery selection")
  return deepFreezeJson(value) as unknown as SpatialPerformanceGallerySelection
}

export function parseSpatialPerformanceBakeRequest(input: unknown): SpatialPerformanceBakeRequest {
  const value = parseSpatialValue(SpatialPerformanceBakeRequestSchema, input, "performance bake request")
  return deepFreezeJson(value) as unknown as SpatialPerformanceBakeRequest
}

export function parseSpatialPerformanceBakeReceipt(input: unknown): SpatialPerformanceBakeReceipt {
  const value = parseSpatialValue(SpatialPerformanceBakeReceiptSchema, input, "performance bake receipt")
  return deepFreezeJson(value) as unknown as SpatialPerformanceBakeReceipt
}

export function validatePerformanceGallerySelection(
  selection: SpatialPerformanceGallerySelection,
  plan: SpatialPerformanceGalleryPlan,
  take: SpatialPerformanceTake,
): void {
  const planSha = canonicalJsonSha256(plan)
  if (planSha !== selection.galleryPlanSha256) {
    throw new SpatialSceneError("invalid-data", "Stale or mismatched gallery plan digest.", "performance.gallery.plan")
  }
  const candidate = plan.candidates.find((c) => c.candidateId === selection.selectedCandidateId)
  if (candidate === undefined) {
    throw new SpatialSceneError("not-found", `Candidate ${selection.selectedCandidateId} is not in the gallery plan.`, "performance.gallery.selection")
  }
  const takeSha = canonicalJsonSha256(take)
  if (takeSha !== selection.takeSha256) {
    throw new SpatialSceneError("invalid-data", "Stale or mismatched take digest.", "performance.gallery.take")
  }
  if (take.receipt.outputSha256 !== selection.receiptOutputSha256) {
    throw new SpatialSceneError("invalid-data", "Stale or mismatched receipt output digest.", "performance.gallery.receipt")
  }
  if (candidate.takeSha256 !== selection.takeSha256 || candidate.receiptOutputSha256 !== selection.receiptOutputSha256) {
    throw new SpatialSceneError("invalid-data", "Selection does not match the gallery candidate's bound digests.", "performance.gallery.selection")
  }
}

export function validatePerformanceBakeReceipt(request: SpatialPerformanceBakeRequest, receipt: SpatialPerformanceBakeReceipt): void {
  const requestSha = canonicalJsonSha256(request)
  if (requestSha !== receipt.requestSha256) {
    throw new SpatialSceneError("invalid-data", "Stale or mismatched bake request digest.", "performance.bake.request")
  }
  if (request.engine.engineId !== receipt.engine.engineId || request.engine.profile !== receipt.engine.profile) {
    throw new SpatialSceneError("invalid-data", "Bake engine/profile identity mismatch.", "performance.bake.engine")
  }
  if (request.input.inputSha256 !== receipt.input.inputSha256 || request.input.inputProfile !== receipt.input.inputProfile) {
    throw new SpatialSceneError("invalid-data", "Bake input identity mismatch.", "performance.bake.input")
  }
  if (receipt.outputs.length !== request.outputs.length) {
    throw new SpatialSceneError("invalid-data", "Bake output count mismatch.", "performance.bake.outputs")
  }
  const requestProfiles = new Set(request.outputs.map((output) => output.outputProfile))
  for (const output of receipt.outputs) {
    if (!requestProfiles.has(output.outputProfile)) {
      throw new SpatialSceneError("invalid-data", `Bake output profile ${output.outputProfile} is not in the request.`, "performance.bake.outputs")
    }
  }
}

function vec3Add(a: Vec3, b: Vec3): Vec3 {
  return Object.freeze([a[0] + b[0], a[1] + b[1], a[2] + b[2]])
}

function vec3Sub(a: Vec3, b: Vec3): Vec3 {
  return Object.freeze([a[0] - b[0], a[1] - b[1], a[2] - b[2]])
}

function vec3Length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2])
}

function vec3Normalize(a: Vec3): Vec3 {
  const length = vec3Length(a)
  if (length === 0) return Object.freeze([0, 0, 1])
  return Object.freeze([a[0] / length, a[1] / length, a[2] / length])
}

function vec3Dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function vec3Cross(a: Vec3, b: Vec3): Vec3 {
  return Object.freeze([
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ])
}

function multiplyQuaternionUnnormalized(a: Quaternion, b: Quaternion): Quaternion {
  return Object.freeze([
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ]) as unknown as Quaternion
}

function multiplyQuaternion(a: Quaternion, b: Quaternion): Quaternion {
  return normalizeQuaternion(multiplyQuaternionUnnormalized(a, b))
}

function conjugateQuaternion(q: Quaternion): Quaternion {
  return Object.freeze([-q[0], -q[1], -q[2], q[3]])
}

function rotateVectorByQuaternion(q: Quaternion, v: Vec3): Vec3 {
  if (vec3Length(v) === 0) return Object.freeze([0, 0, 0])
  const pure = multiplyQuaternionUnnormalized(q, [v[0], v[1], v[2], 0])
  const rotated = multiplyQuaternionUnnormalized(pure, conjugateQuaternion(q))
  return Object.freeze([rotated[0], rotated[1], rotated[2]])
}

function quaternionFromVectors(from: Vec3, to: Vec3): Quaternion {
  const f = vec3Normalize(from)
  const t = vec3Normalize(to)
  const d = vec3Dot(f, t)
  if (d > 0.999_999) return Object.freeze([0, 0, 0, 1])
  if (d < -0.999_999) {
    const axis = vec3Cross([0, 1, 0], f)
    const n = vec3Length(axis)
    const up = n < 0.000_001 ? ([1, 0, 0] as Vec3) : axis
    return normalizeQuaternion([up[0], up[1], up[2], 0])
  }
  const cross = vec3Cross(f, t)
  return normalizeQuaternion([cross[0], cross[1], cross[2], 1 + d])
}

function worldFromLocal(parentPosition: Vec3, parentRotation: Quaternion, localPosition: Vec3, localRotation: Quaternion): { position: Vec3; rotation: Quaternion } {
  return {
    position: vec3Add(parentPosition, rotateVectorByQuaternion(parentRotation, localPosition)),
    rotation: multiplyQuaternion(parentRotation, localRotation),
  }
}

function solveTwoBoneIk(
  baseWorld: { position: Vec3; rotation: Quaternion },
  upperLocal: { position: Vec3; rotation: Quaternion },
  lowerLocal: { position: Vec3; rotation: Quaternion },
  endLocal: { position: Vec3; rotation: Quaternion },
  target: Vec3,
  pole: Vec3,
  policy: "stretch" | "preserve",
): { upperRotation: Quaternion; lowerRotation: Quaternion } | null {
  const a = vec3Length(lowerLocal.position)
  const b = vec3Length(endLocal.position)
  if (a <= 1e-7) return null
  const targetOffset = vec3Sub(target, baseWorld.position)
  let c = vec3Length(targetOffset)
  const minReach = Math.abs(a - b)
  const maxReach = a + b
  if (c < minReach || c > maxReach) {
    if (policy === "preserve") return null
    c = Math.max(minReach, Math.min(maxReach, c))
  }
  if (c <= 1e-7) return null
  const targetDir = vec3Normalize(targetOffset)
  const poleDir = vec3Normalize(pole)
  let normal = vec3Cross(poleDir, targetDir)
  if (vec3Length(normal) < 1e-7) {
    normal = vec3Cross([0, 1, 0], targetDir)
    if (vec3Length(normal) < 1e-7) normal = vec3Cross([1, 0, 0], targetDir)
    if (vec3Length(normal) < 1e-7) return null
  }
  normal = vec3Normalize(normal)
  const perp = vec3Normalize(vec3Cross(targetDir, normal))
  const cosAlpha = Math.max(-1, Math.min(1, (a * a + c * c - b * b) / (2 * a * c)))
  const sinAlpha = Math.sqrt(Math.max(0, 1 - cosAlpha * cosAlpha))
  const elbowOffset = vec3Add(vec3Scale(targetDir, a * cosAlpha), vec3Scale(perp, a * sinAlpha))
  const elbowWorld = vec3Add(baseWorld.position, elbowOffset)
  const upperRestDir = rotateVectorByQuaternion(upperLocal.rotation, vec3Normalize(lowerLocal.position))
  const upperTargetDir = rotateVectorByQuaternion(conjugateQuaternion(baseWorld.rotation), vec3Normalize(vec3Sub(elbowWorld, baseWorld.position)))
  const qUpper = quaternionFromVectors(upperRestDir, upperTargetDir)
  const solvedUpperWorldRot = multiplyQuaternion(multiplyQuaternion(baseWorld.rotation, qUpper), upperLocal.rotation)
  const lowerRestDir = rotateVectorByQuaternion(lowerLocal.rotation, vec3Normalize(endLocal.position))
  const lowerTargetDir = rotateVectorByQuaternion(conjugateQuaternion(solvedUpperWorldRot), vec3Normalize(vec3Sub(target, elbowWorld)))
  const qLower = quaternionFromVectors(lowerRestDir, lowerTargetDir)
  return {
    upperRotation: multiplyQuaternion(qUpper, upperLocal.rotation),
    lowerRotation: multiplyQuaternion(qLower, lowerLocal.rotation),
  }
}

export function poseFromMatrix(matrix: readonly number[]): { position: Vec3; rotation: Quaternion } {
  const m = matrix
  if (m.length < 16) throw new RangeError("Matrix must have 16 components.")
  const position: Vec3 = Object.freeze([m[12]!, m[13]!, m[14]!])
  const trace = m[0]! + m[5]! + m[10]!
  let rotation: Quaternion
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1)
    rotation = [(m[6]! - m[9]!) * s, (m[8]! - m[2]!) * s, (m[1]! - m[4]!) * s, 0.25 / s] as Quaternion
  } else if (m[0]! > m[5]! && m[0]! > m[10]!) {
    const s = 2 * Math.sqrt(1 + m[0]! - m[5]! - m[10]!)
    rotation = [0.25 * s, (m[1]! + m[4]!) / s, (m[8]! + m[2]!) / s, (m[6]! - m[9]!) / s] as Quaternion
  } else if (m[5]! > m[10]!) {
    const s = 2 * Math.sqrt(1 + m[5]! - m[0]! - m[10]!)
    rotation = [(m[1]! + m[4]!) / s, 0.25 * s, (m[6]! + m[9]!) / s, (m[8]! - m[2]!) / s] as Quaternion
  } else {
    const s = 2 * Math.sqrt(1 + m[10]! - m[0]! - m[5]!)
    rotation = [(m[8]! + m[2]!) / s, (m[6]! + m[9]!) / s, 0.25 * s, (m[1]! - m[4]!) / s] as Quaternion
  }
  return { position, rotation: normalizeQuaternion(rotation) }
}

function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return Object.freeze([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t])
}

function vec3Scale(a: Vec3, s: number): Vec3 {
  return Object.freeze([a[0] * s, a[1] * s, a[2] * s])
}

function seededLcg(seed: number): { value: number; next: number } {
  const next = (seed * 1_664_525 + 1_013_904_223) >>> 0
  return { value: next / 0x1_0000_0000, next }
}

function springOffset(timeUs: number, seed: number, amplitude: number, frequency: number): { position: Vec3; rotation: Quaternion } {
  let state = seed
  const phases: number[] = []
  for (let i = 0; i < 6; i += 1) {
    const lcg = seededLcg(state)
    state = lcg.next
    phases.push(lcg.value * Math.PI * 2)
  }
  const t = timeUs / 1_000_000
  const envelope = Math.exp(-t)
  const px = Math.sin(2 * Math.PI * frequency * t + phases[0]!) * amplitude * envelope
  const py = Math.sin(2 * Math.PI * frequency * t + phases[1]!) * amplitude * envelope
  const pz = Math.sin(2 * Math.PI * frequency * t + phases[2]!) * amplitude * envelope
  const rx = Math.sin(2 * Math.PI * frequency * t + phases[3]!) * amplitude * envelope * 0.5
  const ry = Math.sin(2 * Math.PI * frequency * t + phases[4]!) * amplitude * envelope * 0.5
  const rz = Math.sin(2 * Math.PI * frequency * t + phases[5]!) * amplitude * envelope * 0.5
  const rw = Math.sqrt(Math.max(0, 1 - (rx * rx + ry * ry + rz * rz)))
  return {
    position: [px, py, pz] as unknown as Vec3,
    rotation: normalizeQuaternion([rx, ry, rz, rw]),
  }
}

function resolveBodyMask(mask: string | readonly string[] | undefined): Set<string> {
  if (mask === undefined) return new Set(HUMANOID_BONE_NAMES)
  if (typeof mask === "string") {
    const bones = SPATIAL_PERFORMANCE_BODY_MASKS[mask as SpatialPerformanceBodyMaskName]
    if (bones === undefined) throw new SpatialSceneError("invalid-data", `Unknown body mask ${mask}.`, "performance.mask")
    return new Set(bones)
  }
  return new Set(mask)
}

function mappedBoneOrder(mapping: SpatialHumanoidMapping): readonly string[] {
  const mapped = new Set<string>(mapping.bones.map((bone) => bone.canonicalName))
  const result: string[] = []
  const pending = ["hips"]
  while (pending.length > 0) {
    const bone = pending.shift()!
    if (!mapped.has(bone)) continue
    result.push(bone)
    for (const [child, parent] of Object.entries(BONE_PARENTS)) {
      if (parent === bone && mapped.has(child)) pending.push(child)
    }
  }
  return Object.freeze(result)
}

function sampleClipChannel(channel: SpatialPerformanceClip["channels"][number], sourceTimeUs: number): { position: Vec3; rotation: Quaternion } | null {
  const keys = channel.keys
  if (sourceTimeUs <= keys[0]!.timeUs) {
    return { position: keys[0]!.position, rotation: keys[0]!.rotation }
  }
  if (sourceTimeUs >= keys[keys.length - 1]!.timeUs) {
    return { position: keys[keys.length - 1]!.position, rotation: keys[keys.length - 1]!.rotation }
  }
  for (let i = 1; i < keys.length; i += 1) {
    const prev = keys[i - 1]!
    const next = keys[i]!
    if (sourceTimeUs >= prev.timeUs && sourceTimeUs <= next.timeUs) {
      const t = (sourceTimeUs - prev.timeUs) / (next.timeUs - prev.timeUs)
      return {
        position: lerpVec3(prev.position, next.position, t),
        rotation: slerpQuaternion(prev.rotation, next.rotation, t),
      }
    }
  }
  return null
}

function collectActiveClips(
  timeUs: number,
  clips: SpatialPerformanceSources["clips"],
  directives: SpatialPerformancePlan["directives"],
  mode?: "override" | "additive",
): { directive: Extract<SpatialPerformancePlan["directives"][number], { kind: "clip" }>; sourceTimeUs: number }[] {
  const result: { directive: Extract<SpatialPerformancePlan["directives"][number], { kind: "clip" }>; sourceTimeUs: number }[] = []
  for (const directive of directives) {
    if (directive.kind !== "clip") continue
    if (mode !== undefined && directive.mode !== mode) continue
    const clip = clips[directive.clipDigest]
    if (clip === undefined) continue
    if (timeUs < directive.startUs || timeUs >= directive.endUs) continue
    const trimmedDuration = directive.trimEndUs - directive.trimStartUs
    const sourceCycle = trimmedDuration / directive.timeScale
    const loopCount = directive.loop === "once" ? 1 : directive.loop
    const totalSource = sourceCycle * loopCount
    const outputLocal = timeUs - directive.startUs
    if (outputLocal >= totalSource) continue
    const cycleLocal = outputLocal % sourceCycle
    const sourceTimeUs = directive.trimStartUs + cycleLocal * directive.timeScale
    result.push({ directive, sourceTimeUs })
  }
  return result
}

function activeCrossfade(
  timeUs: number,
  directives: SpatialPerformancePlan["directives"],
): { from: string; to: string; alpha: number } | null {
  for (const directive of directives) {
    if (directive.kind !== "crossfade") continue
    if (timeUs >= directive.startUs && timeUs < directive.startUs + directive.durationUs) {
      const alpha = directive.durationUs > 0 ? (timeUs - directive.startUs) / directive.durationUs : 0
      return { from: directive.fromClipId, to: directive.toClipId, alpha }
    }
  }
  return null
}

function clipPoseForBone(
  clips: SpatialPerformanceSources["clips"],
  directive: Extract<SpatialPerformancePlan["directives"][number], { kind: "clip" }>,
  sourceTimeUs: number,
  bone: string,
  boneToRest: ReadonlyMap<string, { position: Vec3; rotation: Quaternion }>,
): { position: Vec3; rotation: Quaternion } {
  const clip = clips[directive.clipDigest]
  if (clip === undefined) {
    const rest = boneToRest.get(bone)
    return rest ?? { position: [0, 0, 0] as unknown as Vec3, rotation: [0, 0, 0, 1] as unknown as Quaternion }
  }
  const channel = clip.channels.find((c) => c.bone === bone)
  if (channel === undefined) {
    const rest = boneToRest.get(bone)
    return rest ?? { position: [0, 0, 0] as unknown as Vec3, rotation: [0, 0, 0, 1] as unknown as Quaternion }
  }
  const sampled = sampleClipChannel(channel, sourceTimeUs)
  if (sampled !== null) return sampled
  return { position: [0, 0, 0] as unknown as Vec3, rotation: [0, 0, 0, 1] as unknown as Quaternion }
}

function baseBonePose(
  clips: SpatialPerformanceSources["clips"],
  directives: SpatialPerformancePlan["directives"],
  timeUs: number,
  bone: string,
  boneToRest: ReadonlyMap<string, { position: Vec3; rotation: Quaternion }>,
): { position: Vec3; rotation: Quaternion } {
  const active = collectActiveClips(timeUs, clips, directives, "override")
  const maskedActive = active.filter((entry) => resolveBodyMask(entry.directive.mask).has(bone))
  const crossfade = activeCrossfade(timeUs, directives)
  if (maskedActive.length === 0) {
    const rest = boneToRest.get(bone)
    return rest ?? { position: [0, 0, 0] as unknown as Vec3, rotation: [0, 0, 0, 1] as unknown as Quaternion }
  }
  if (crossfade !== null) {
    const fromDirective = maskedActive.find((a) => a.directive.directiveId === crossfade.from)
    const toDirective = maskedActive.find((a) => a.directive.directiveId === crossfade.to)
    if (fromDirective !== undefined && toDirective !== undefined) {
      const fromPose = clipPoseForBone(clips, fromDirective.directive, fromDirective.sourceTimeUs, bone, boneToRest)
      const toPose = clipPoseForBone(clips, toDirective.directive, toDirective.sourceTimeUs, bone, boneToRest)
      return {
        position: lerpVec3(fromPose.position, toPose.position, crossfade.alpha),
        rotation: slerpQuaternion(fromPose.rotation, toPose.rotation, crossfade.alpha),
      }
    }
  }
  if (maskedActive.length === 1) return clipPoseForBone(clips, maskedActive[0]!.directive, maskedActive[0]!.sourceTimeUs, bone, boneToRest)
  let pose = clipPoseForBone(clips, maskedActive[0]!.directive, maskedActive[0]!.sourceTimeUs, bone, boneToRest)
  for (let i = 1; i < maskedActive.length; i += 1) {
    const other = clipPoseForBone(clips, maskedActive[i]!.directive, maskedActive[i]!.sourceTimeUs, bone, boneToRest)
    const t = 1 / (i + 1)
    pose = {
      position: lerpVec3(pose.position, other.position, t),
      rotation: slerpQuaternion(pose.rotation, other.rotation, t),
    }
  }
  return pose
}

function additiveBoneDelta(
  clips: SpatialPerformanceSources["clips"],
  directives: SpatialPerformancePlan["directives"],
  timeUs: number,
  bone: string,
  boneToRest: ReadonlyMap<string, { position: Vec3; rotation: Quaternion }>,
): { position: Vec3; rotation: Quaternion } {
  const active = collectActiveClips(timeUs, clips, directives, "additive")
  const maskedActive = active.filter((entry) => resolveBodyMask(entry.directive.mask).has(bone))
  let position: Vec3 = [0, 0, 0] as unknown as Vec3
  let rotation: Quaternion = [0, 0, 0, 1] as unknown as Quaternion
  for (const entry of maskedActive) {
    const pose = clipPoseForBone(clips, entry.directive, entry.sourceTimeUs, bone, boneToRest)
    position = vec3Add(position, pose.position)
    rotation = multiplyQuaternion(rotation, pose.rotation)
  }
  return { position, rotation }
}

function rootWaypointPosition(waypoints: readonly { timeUs: number; position: Vec3; rotation: Quaternion }[], timeUs: number): { position: Vec3; rotation: Quaternion } {
  if (timeUs <= waypoints[0]!.timeUs) return { position: waypoints[0]!.position, rotation: waypoints[0]!.rotation }
  const last = waypoints[waypoints.length - 1]!
  if (timeUs >= last.timeUs) return { position: last.position, rotation: last.rotation }
  for (let i = 1; i < waypoints.length; i += 1) {
    const prev = waypoints[i - 1]!
    const next = waypoints[i]!
    if (timeUs >= prev.timeUs && timeUs <= next.timeUs) {
      const t = (timeUs - prev.timeUs) / (next.timeUs - prev.timeUs)
      return {
        position: lerpVec3(prev.position, next.position, t),
        rotation: slerpQuaternion(prev.rotation, next.rotation, t),
      }
    }
  }
  return { position: last.position, rotation: last.rotation }
}

function buildBoneToRest(mapping: SpatialHumanoidMapping): ReadonlyMap<string, { position: Vec3; rotation: Quaternion }> {
  const map = new Map<string, { position: Vec3; rotation: Quaternion }>()
  for (const bone of mapping.bones) {
    map.set(bone.canonicalName, { position: bone.restOffset.position, rotation: bone.restOffset.rotation })
  }
  return map
}

export function compileSpatialPerformance(planInput: unknown, sourcesInput: unknown): SpatialPerformanceTake {
  const plan = parseSpatialPerformancePlan(planInput)
  const sources = parseSpatialPerformanceSources(sourcesInput)

  if (sources.sceneSha256 !== plan.sceneSha256) {
    throw new SpatialSceneError("invalid-data", "Stale or mismatched scene digest.", "performance.scene")
  }
  if (sources.rigSha256 !== plan.rigSha256) {
    throw new SpatialSceneError("invalid-data", "Stale or mismatched rig digest.", "performance.rig")
  }
  const mappingSha = canonicalJsonSha256(sources.mapping)
  if (mappingSha !== plan.mappingSha256) {
    throw new SpatialSceneError("invalid-data", "Stale or mismatched mapping digest.", "performance.mapping")
  }

  validatePerformancePlan(plan, sources)

  for (const directive of plan.directives) {
    if ("bone" in directive && directive.bone !== undefined) {
      assertBoneExists(sources.mapping, directive.bone, `performance.directive.${directive.directiveId}`)
    }
    if ("endBone" in directive && directive.endBone !== undefined) {
      assertBoneExists(sources.mapping, directive.endBone, `performance.directive.${directive.directiveId}`)
    }
    if (directive.kind === "clip") {
      const clip = sources.clips[directive.clipDigest]
      if (clip === undefined) {
        throw new SpatialSceneError("not-found", `Clip ${directive.clipDigest} is missing.`, `performance.directive.${directive.directiveId}`)
      }
      const clipSha = canonicalJsonSha256(clip)
      if (clipSha !== directive.clipDigest) {
        throw new SpatialSceneError("invalid-data", `Clip digest mismatch for ${directive.clipDigest}.`, `performance.directive.${directive.directiveId}`)
      }
    }
    if ("propId" in directive && directive.propId !== undefined) {
      assertPropExists(sources, directive.propId, `performance.directive.${directive.directiveId}`)
    }
  }

  const frameRate: SpatialFrameRate = { numerator: plan.frameRate.numerator, denominator: plan.frameRate.denominator }
  const sampleCount = spatialFrameCount(plan.durationUs, frameRate)
  if (sampleCount > SPATIAL_PERFORMANCE_LIMITS.samples) {
    throw new SpatialSceneError("invalid-data", `Sample count ${sampleCount} exceeds the performance limit.`, "performance.samples")
  }

  const boneToRest = buildBoneToRest(sources.mapping)
  const order = mappedBoneOrder(sources.mapping)

  const morphDirectives = plan.directives.filter((d) => d.kind === "morph") as Extract<SpatialPerformancePlan["directives"][number], { kind: "morph" }>[]
  const attachDirectives = plan.directives.filter((d) => d.kind === "attach") as Extract<SpatialPerformancePlan["directives"][number], { kind: "attach" }>[]
  const releaseDirectives = plan.directives.filter((d) => d.kind === "release") as Extract<SpatialPerformancePlan["directives"][number], { kind: "release" }>[]
  const springDirectives = plan.directives.filter((d) => d.kind === "spring") as Extract<SpatialPerformancePlan["directives"][number], { kind: "spring" }>[]
  const lookAtDirectives = plan.directives.filter((d) => d.kind === "look-at") as Extract<SpatialPerformancePlan["directives"][number], { kind: "look-at" }>[]
  const twoBoneDirectives = plan.directives.filter((d) => d.kind === "two-bone-ik") as Extract<SpatialPerformancePlan["directives"][number], { kind: "two-bone-ik" }>[]
  const footPlantDirectives = plan.directives.filter((d) => d.kind === "foot-plant") as Extract<SpatialPerformancePlan["directives"][number], { kind: "foot-plant" }>[]
  const rootTrajectory = plan.directives.find((d) => d.kind === "root-trajectory") as Extract<SpatialPerformancePlan["directives"][number], { kind: "root-trajectory" }> | undefined

  const propIds = new Set<string>([...Object.keys(sources.props), ...attachDirectives.map((d) => d.propId), ...releaseDirectives.map((d) => d.propId)])

  type MutableSample = {
    timeUs: number
    boneWorld: Record<string, { position: [number, number, number]; rotation: [number, number, number, number] }>
    attachments: Record<string, { attached: boolean; parentBone?: string; localOffset?: { position: [number, number, number]; rotation: [number, number, number, number]; scale: [number, number, number] }; worldPosition: [number, number, number] }>
  }

  const samples: MutableSample[] = []
  const boneKeys: Record<string, { positions: [number, number, number][]; rotations: [number, number, number, number][] }> = {}
  for (const bone of order) {
    boneKeys[bone] = { positions: [], rotations: [] }
  }
  const morphKeys: Record<number, { timeUs: number; value: number }[]> = {}
  const attachmentKeys: Record<string, { timeUs: number; attached: boolean; parentBone: string; localOffset: { position: [number, number, number]; rotation: [number, number, number, number]; scale: [number, number, number] } }[]> = {}
  for (const propId of propIds) {
    attachmentKeys[propId] = []
  }

  for (let i = 0; i < sampleCount; i += 1) {
    const sample = spatialFrameSample(i, plan.durationUs, frameRate)
    const timeUs = sample.timeUs

    let rootPosition: Vec3 = [0, 0, 0] as unknown as Vec3
    let rootRotation: Quaternion = [0, 0, 0, 1] as unknown as Quaternion
    if (rootTrajectory !== undefined) {
      const waypoint = rootWaypointPosition(rootTrajectory.waypoints, timeUs)
      rootPosition = waypoint.position
      rootRotation = waypoint.rotation
    }

    const localPoses = new Map<string, { position: Vec3; rotation: Quaternion }>()
    const boneRecord: Record<string, { position: [number, number, number]; rotation: [number, number, number, number] }> = {}

    // Pass 1: base local poses from override clips, respecting canonical body masks.
    for (const bone of order) {
      localPoses.set(bone, baseBonePose(sources.clips, plan.directives, timeUs, bone, boneToRest))
    }

    // Pass 2: forward-kinematics the base pose so lookAt/IK/footPlant see consistent worlds.
    const baseWorld = new Map<string, { position: Vec3; rotation: Quaternion }>()
    for (const bone of order) {
      const parentName = BONE_PARENTS[bone]!
      const parent = parentName === null ? { position: rootPosition, rotation: rootRotation } : baseWorld.get(parentName)
      if (parent === undefined) throw new SpatialSceneError("invalid-data", `Missing parent for bone ${bone}.`, "performance.fk")
      const local = localPoses.get(bone)!
      baseWorld.set(bone, worldFromLocal(parent.position, parent.rotation, local.position, local.rotation))
    }

    // Pass 3: apply deterministic additive clip layers in directive order.
    for (const bone of order) {
      const delta = additiveBoneDelta(sources.clips, plan.directives, timeUs, bone, boneToRest)
      const base = localPoses.get(bone)!
      localPoses.set(bone, { position: vec3Add(base.position, delta.position), rotation: multiplyQuaternion(base.rotation, delta.rotation) })
    }

    // Pass 4: apply deterministic spring offsets.
    for (const spring of springDirectives) {
      const offset = springOffset(timeUs, plan.seed + spring.seed, spring.amplitude, spring.frequency)
      const base = localPoses.get(spring.bone)!
      localPoses.set(spring.bone, { position: vec3Add(base.position, offset.position), rotation: multiplyQuaternion(base.rotation, offset.rotation) })
    }

    // Pass 5: forward-kinematics the working pose for constraint solvers.
    const workingWorld = new Map<string, { position: Vec3; rotation: Quaternion }>()
    for (const bone of order) {
      const parentName = BONE_PARENTS[bone]!
      const parent = parentName === null ? { position: rootPosition, rotation: rootRotation } : workingWorld.get(parentName)
      if (parent === undefined) throw new SpatialSceneError("invalid-data", `Missing parent for bone ${bone}.`, "performance.fk")
      const local = localPoses.get(bone)!
      workingWorld.set(bone, worldFromLocal(parent.position, parent.rotation, local.position, local.rotation))
    }

    // Pass 6: solve lookAt, bounded analytic two-bone IK, and footPlant into local poses.
    for (const lookAt of lookAtDirectives) {
      const world = workingWorld.get(lookAt.bone)
      const parentName = BONE_PARENTS[lookAt.bone]!
      const parent = parentName === null ? { position: rootPosition, rotation: rootRotation } : workingWorld.get(parentName)
      if (world === undefined || parent === undefined) continue
      const parentConj = conjugateQuaternion(parent.rotation)
      const targetWorldDir = vec3Normalize(vec3Sub(lookAt.target, world.position))
      const targetParentDir = rotateVectorByQuaternion(parentConj, targetWorldDir)
      const lookLocal = quaternionFromVectors([0, 0, 1], targetParentDir)
      const local = localPoses.get(lookAt.bone)!
      localPoses.set(lookAt.bone, { position: local.position, rotation: lookLocal })
    }

    for (const ik of twoBoneDirectives) {
      const endBone = ik.endBone
      const lowerBone = BONE_PARENTS[endBone]!
      const upperBone = BONE_PARENTS[lowerBone]!
      const baseWorld = workingWorld.get(upperBone)
      const upperLocal = localPoses.get(upperBone)
      const lowerLocal = localPoses.get(lowerBone)
      const endLocal = localPoses.get(endBone)
      if (baseWorld === undefined || upperLocal === undefined || lowerLocal === undefined || endLocal === undefined) continue
      const solved = solveTwoBoneIk(baseWorld, upperLocal, lowerLocal, endLocal, ik.target, ik.pole, ik.policy)
      if (solved !== null) {
        localPoses.set(upperBone, { position: upperLocal.position, rotation: solved.upperRotation })
        localPoses.set(lowerBone, { position: lowerLocal.position, rotation: solved.lowerRotation })
      }
    }

    for (const plant of footPlantDirectives) {
      const world = workingWorld.get(plant.bone)
      const parentName = BONE_PARENTS[plant.bone]!
      const parent = parentName === null ? { position: rootPosition, rotation: rootRotation } : workingWorld.get(parentName)
      if (world === undefined || parent === undefined) continue
      const parentConj = conjugateQuaternion(parent.rotation)
      const plantedWorld = { position: [world.position[0], plant.groundY, world.position[2]] as unknown as Vec3, rotation: [0, 0, 0, 1] as unknown as Quaternion }
      const targetParent = vec3Sub(plantedWorld.position, parent.position)
      const plantLocalPos = rotateVectorByQuaternion(parentConj, targetParent)
      const plantLocal = { position: plantLocalPos, rotation: multiplyQuaternion(parentConj, plantedWorld.rotation) }
      localPoses.set(plant.bone, plantLocal)
    }

    // Pass 7: final forward-kinematics pass to record world positions.
    const boneWorld = new Map<string, { position: Vec3; rotation: Quaternion }>()
    for (const bone of order) {
      const parentName = BONE_PARENTS[bone]!
      const parent = parentName === null ? { position: rootPosition, rotation: rootRotation } : boneWorld.get(parentName)
      if (parent === undefined) throw new SpatialSceneError("invalid-data", `Missing parent for bone ${bone}.`, "performance.fk")
      const local = localPoses.get(bone)!
      const world = worldFromLocal(parent.position, parent.rotation, local.position, local.rotation)
      boneWorld.set(bone, world)
      boneKeys[bone]!.positions.push([world.position[0], world.position[1], world.position[2]])
      boneKeys[bone]!.rotations.push([world.rotation[0], world.rotation[1], world.rotation[2], world.rotation[3]])
      boneRecord[bone] = {
        position: [world.position[0], world.position[1], world.position[2]],
        rotation: [world.rotation[0], world.rotation[1], world.rotation[2], world.rotation[3]],
      }
    }

    const morphValues: Record<number, number> = {}
    for (const directive of morphDirectives) {
      morphValues[directive.index] = directive.weight
    }
    for (const [index, weight] of Object.entries(morphValues)) {
      const idx = Number(index)
      const channel = morphKeys[idx] ?? []
      channel.push({ timeUs, value: weight })
      morphKeys[idx] = channel
    }

    const attachmentRecord: MutableSample["attachments"] = {}
    for (const propId of propIds) {
      let attached = false
      let parentBone: string | undefined
      let localOffset: { position: [number, number, number]; rotation: [number, number, number, number]; scale: [number, number, number] } | undefined
      for (const directive of attachDirectives) {
        if (directive.propId === propId && timeUs >= directive.startUs && timeUs < directive.endUs) {
          attached = true
          parentBone = directive.bone
          localOffset = {
            position: [directive.localOffset.position[0], directive.localOffset.position[1], directive.localOffset.position[2]],
            rotation: [directive.localOffset.rotation[0], directive.localOffset.rotation[1], directive.localOffset.rotation[2], directive.localOffset.rotation[3]],
            scale: [directive.localOffset.scale[0], directive.localOffset.scale[1], directive.localOffset.scale[2]],
          }
        }
      }
      for (const directive of releaseDirectives) {
        if (directive.propId === propId && timeUs >= directive.startUs) {
          attached = false
          parentBone = undefined
          localOffset = undefined
        }
      }
      let worldPosition: [number, number, number] = [0, 0, 0]
      if (attached && parentBone !== undefined && localOffset !== undefined) {
        const parentWorld = boneWorld.get(parentBone)
        if (parentWorld !== undefined) {
          const offsetMatrix = multiplyTransforms(
            composeTransform({ position: parentWorld.position, rotation: parentWorld.rotation, scale: [1, 1, 1] as unknown as Vec3 }),
            composeTransform({ position: localOffset.position as unknown as Vec3, rotation: localOffset.rotation as unknown as Quaternion, scale: localOffset.scale as unknown as Vec3 }),
          )
          const offsetPose = poseFromMatrix(offsetMatrix)
          worldPosition = [offsetPose.position[0], offsetPose.position[1], offsetPose.position[2]]
        }
      } else {
        const prop = sources.props[propId]
        if (prop !== undefined) {
          worldPosition = [prop.localOffset.position[0], prop.localOffset.position[1], prop.localOffset.position[2]]
        }
      }
      attachmentRecord[propId] = { attached, worldPosition }
      if (attached && parentBone !== undefined && localOffset !== undefined) {
        attachmentRecord[propId]!.parentBone = parentBone
        attachmentRecord[propId]!.localOffset = localOffset
      }
      attachmentKeys[propId]!.push({ timeUs, attached, parentBone: parentBone ?? "hips", localOffset: localOffset ?? { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } })
    }

    samples.push({ timeUs, boneWorld: boneRecord, attachments: attachmentRecord })
  }

  const channels: { kind: string }[] = []
  for (const bone of order) {
    const data = boneKeys[bone]!
    const keys: { timeUs: number; position: [number, number, number]; rotation: [number, number, number, number] }[] = []
    for (let i = 0; i < sampleCount; i += 1) {
      const sample = spatialFrameSample(i, plan.durationUs, frameRate)
      keys.push({ timeUs: sample.timeUs, position: data.positions[i]!, rotation: data.rotations[i]! })
    }
    channels.push({ kind: "bone-pose", bone, keys } as unknown as { kind: string })
  }
  for (const [index, values] of Object.entries(morphKeys)) {
    const idx = Number(index)
    channels.push({ kind: "morph", index: idx, keys: values } as unknown as { kind: string })
  }
  for (const [propId, data] of Object.entries(attachmentKeys)) {
    channels.push({ kind: "attachment", propId, keys: data } as unknown as { kind: string })
  }

  const planSha = canonicalJsonSha256(plan)
  const directivesSha = canonicalJsonSha256(plan.directives)
  const compilerSha = canonicalJsonSha256(SPATIAL_PERFORMANCE_COMPILER_ID)
  const outputSha = canonicalJsonSha256({ planSha256: planSha, durationUs: plan.durationUs, samples, channels })

  const receipt = {
    kind: "slopcamera.spatial-performance-receipt",
    schemaVersion: 1,
    compiler: SPATIAL_PERFORMANCE_COMPILER_ID,
    compilerSha256: compilerSha,
    sceneSha256: plan.sceneSha256,
    rigSha256: plan.rigSha256,
    mappingSha256: plan.mappingSha256,
    directivesSha256: directivesSha,
    seed: plan.seed,
    outputSha256: outputSha,
    durationUs: plan.durationUs,
    sampleCount,
  }

  const take = {
    kind: "slopcamera.spatial-performance-take",
    schemaVersion: 1,
    planSha256: planSha,
    durationUs: plan.durationUs,
    samples,
    channels,
    receipt,
  }

  return deepFreezeJson(take) as unknown as SpatialPerformanceTake
}

export function auditSpatialPerformance(take: SpatialPerformanceTake, optionsInput: unknown): SpatialPerformanceAuditReport {
  const options = parseSpatialPerformanceAuditOptions(optionsInput)
  const takeSha = canonicalJsonSha256(take)
  const findings: SpatialPerformanceFinding[] = []

  const getHeadForward = (headPose: { position: Vec3; rotation: Quaternion }): Vec3 => {
    return rotateVectorByQuaternion(headPose.rotation, [0, 0, 1])
  }

  const typedBoneWorld = (sample: (typeof take.samples)[number]) => {
    return sample.boneWorld as Record<string, { position: Vec3; rotation: Quaternion }>
  }
  const typedAttachments = (sample: (typeof take.samples)[number]) => {
    return sample.attachments as Record<string, { attached: boolean; parentBone?: string; worldPosition: Vec3 }>
  }

  for (let i = 0; i < take.samples.length; i += 1) {
    const sample = take.samples[i]!
    const timeUs = sample.timeUs
    const bones = typedBoneWorld(sample)

    for (const [bone, pose] of Object.entries(bones)) {
      if (options.groundY !== undefined && (bone === "leftFoot" || bone === "rightFoot")) {
        if (pose.position[1] < options.groundY - 0.01) {
          findings.push({
            kind: "ground-penetration",
            severity: "warning",
            entityId: options.characterId,
            bone: bone as unknown as z.infer<typeof humanoidBoneName>,
            timeUs,
            detail: `Foot ${bone} penetrates ground at y=${pose.position[1].toFixed(4)} (groundY=${options.groundY}).`,
          })
        }
        if (i > 0) {
          const prev = take.samples[i - 1]!
          const prevBones = typedBoneWorld(prev)
          const prevPose = prevBones[bone]
          if (prevPose !== undefined && Math.abs(prevPose.position[1] - options.groundY) < 0.02 && Math.abs(pose.position[1] - options.groundY) < 0.02) {
            const dx = pose.position[0] - prevPose.position[0]
            const dz = pose.position[2] - prevPose.position[2]
            const horizontal = Math.hypot(dx, dz)
            if (horizontal > 0.01) {
              findings.push({
                kind: "foot-slide",
                severity: "warning",
                entityId: options.characterId,
                bone: bone as unknown as z.infer<typeof humanoidBoneName>,
                timeUs,
                detail: `Planted foot ${bone} slid ${horizontal.toFixed(4)} meters.`,
              })
            }
          }
        }
      }
    }

    if (options.gazeTarget !== undefined) {
      const head = bones["head"]
      if (head !== undefined) {
        const forward = getHeadForward(head)
        const toTarget = vec3Normalize(vec3Sub(options.gazeTarget, head.position))
        const dot = Math.max(-1, Math.min(1, vec3Dot(forward, toTarget)))
        const angle = Math.acos(dot)
        if (angle > 0.1) {
          findings.push({
            kind: "gaze-error",
            severity: "info",
            entityId: options.characterId,
            bone: "head",
            timeUs,
            detail: `Head is ${angle.toFixed(4)} radians off gaze target.`,
          })
        }
      }
    }

    const attachments = typedAttachments(sample)
    for (const [propId, attachment] of Object.entries(attachments)) {
      if (attachment.attached && attachment.parentBone !== undefined) {
        const hand = bones[attachment.parentBone]
        if (hand !== undefined) {
          const drift = vec3Length(vec3Sub(attachment.worldPosition, hand.position))
          if (drift > 0.01) {
            findings.push({
              kind: "attachment-drift",
              severity: "warning",
              entityId: options.characterId,
              bone: attachment.parentBone as unknown as z.infer<typeof humanoidBoneName>,
              timeUs,
              detail: `Prop ${propId} drifts ${drift.toFixed(4)} meters from ${attachment.parentBone}.`,
            })
          }
        }
      }
    }

    const upperLegs = ["leftUpperLeg", "rightUpperLeg"] as const
    const lowerLegs = ["leftLowerLeg", "rightLowerLeg"] as const
    const feet = ["leftFoot", "rightFoot"] as const
    for (let side = 0; side < 2; side += 1) {
      const upper = bones[upperLegs[side]!]
      const lower = bones[lowerLegs[side]!]
      const foot = bones[feet[side]!]
      if (upper !== undefined && lower !== undefined && foot !== undefined) {
        const thigh = vec3Normalize(vec3Sub(lower.position, upper.position))
        const calf = vec3Normalize(vec3Sub(foot.position, lower.position))
        const dot = vec3Dot(thigh, calf)
        if (dot > 0.95) {
          findings.push({
            kind: "joint-limit",
            severity: "warning",
            entityId: options.characterId,
            bone: lowerLegs[side]! as unknown as z.infer<typeof humanoidBoneName>,
            timeUs,
            detail: `Knee ${lowerLegs[side]!} overextended (dot=${dot.toFixed(4)}).`,
          })
        }
      }
      const upperArm = bones[side === 0 ? "leftUpperArm" : "rightUpperArm"]
      const lowerArm = bones[side === 0 ? "leftLowerArm" : "rightLowerArm"]
      const hand = bones[side === 0 ? "leftHand" : "rightHand"]
      if (upperArm !== undefined && lowerArm !== undefined && hand !== undefined) {
        const upper = vec3Normalize(vec3Sub(lowerArm.position, upperArm.position))
        const lower = vec3Normalize(vec3Sub(hand.position, lowerArm.position))
        const dot = vec3Dot(upper, lower)
        if (dot > 0.95) {
          findings.push({
            kind: "joint-limit",
            severity: "warning",
            entityId: options.characterId,
            bone: (side === 0 ? "leftLowerArm" : "rightLowerArm") as unknown as z.infer<typeof humanoidBoneName>,
            timeUs,
            detail: `Elbow ${side === 0 ? "leftLowerArm" : "rightLowerArm"} overextended (dot=${dot.toFixed(4)}).`,
          })
        }
      }
    }

    if (i > 0 && options.clipBoundaries !== undefined && options.clipBoundaries.includes(timeUs)) {
      const prev = take.samples[i - 1]!
      const prevBones = typedBoneWorld(prev)
      let jump = 0
      for (const [bone, pose] of Object.entries(bones)) {
        const prevPose = prevBones[bone]
        if (prevPose === undefined) continue
        const p = vec3Length(vec3Sub(pose.position, prevPose.position))
        if (p > jump) jump = p
      }
      if (jump > 0.1) {
        findings.push({
          kind: "clip-discontinuity",
          severity: "warning",
          entityId: options.characterId,
          timeUs,
          detail: `Transform jump of ${jump.toFixed(4)} meters across clip boundary.`,
        })
      }
    }

    const hips = bones["hips"]
    if (hips !== undefined) {
      if (options.cameras !== undefined) {
        for (const camera of options.cameras) {
          const distance = vec3Length(vec3Sub(camera.position, hips.position))
          if (distance < camera.near) {
            findings.push({
              kind: "character-camera-collision",
              severity: "warning",
              entityId: options.characterId,
              timeUs,
              detail: `Character is ${distance.toFixed(4)} meters inside camera ${camera.cameraId} near plane.`,
            })
          }
        }
      }
      if (options.otherCharacters !== undefined) {
        for (const other of options.otherCharacters) {
          const distance = vec3Length(vec3Sub(other.position, hips.position))
          if (distance < other.radius) {
            findings.push({
              kind: "character-character-collision",
              severity: "warning",
              entityId: options.characterId,
              timeUs,
              detail: `Character collides with ${other.characterId} (distance=${distance.toFixed(4)}).`,
            })
          }
        }
      }
    }
  }

  const sorted = sortSpatialBy(findings, (f) => {
    const key = `${String(f.timeUs).padStart(16, "0")}|${f.bone ?? ""}|${f.kind}|${f.severity}|${f.entityId ?? ""}|${f.detail}`
    return key
  })
  const omitted = Math.max(0, sorted.length - SPATIAL_PERFORMANCE_LIMITS.findings)
  const trimmed = sorted.slice(0, SPATIAL_PERFORMANCE_LIMITS.findings)

  return deepFreezeJson({
    kind: "slopcamera.spatial-performance-audit",
    schemaVersion: 1,
    takeSha256: takeSha,
    findings: trimmed,
    omittedFindings: omitted,
  }) as unknown as SpatialPerformanceAuditReport
}
