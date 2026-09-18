import { z } from "zod"
import {
  SPATIAL_SCENE_LIMITS,
  SpatialAssetIdSchema,
  SpatialAssetManifestSchema,
  SpatialDigestSchema,
  SpatialEntitySchema,
  SpatialGeneratorIdSchema,
  SpatialPatchOperationSchema,
  SpatialPayloadSchema,
} from "./contracts.js"
import { SPATIAL_GLB_LIMITS, SPATIAL_GLB_PROFILE, SPATIAL_GLB_PROFILE_V1, SPATIAL_GLB_RIGGED_PROFILE } from "./gltf.js"
import { SPATIAL_GEOMETRY_PROFILE } from "./geometry.js"

/**
 * Canonical document contracts produced by `scene asset admit` and consumed by
 * `scene audit --asset-bounds` and the MCP `audit_scene` tool. They live in the
 * portable layer so every surface shares one strict schema; hosts only read or
 * write the documents.
 */

/**
 * Affine guard bound. Node matrices stay below math.MAX_ABS_COMPONENT (1e12)
 * and decoded vertices below 1e6, so every transformed vertex stays under
 * ~3e18; 1e18 bounds the reachable evaluated range with margin.
 */
const boundsComponent = z.number().finite().min(-1e18).max(1e18)
const boundsVector = z.tuple([boundsComponent, boundsComponent, boundsComponent])
export const SpatialBoundsSchema = z.strictObject({ min: boundsVector, max: boundsVector })
  .refine(value => value.min.every((component, index) => component <= value.max[index]!), "Bounds min must not exceed max.")
export type SpatialBounds = Readonly<z.infer<typeof SpatialBoundsSchema>>

/**
 * Derived facts bound to one admitted asset payload. The document persists as a
 * canonical JSON payload behind a sibling `metadata` manifest that depends on
 * its subject asset, so a scene may omit it without invalidating the subject
 * manifest under the unchanged `gltf` interpretation shape.
 */
const factsUnit = z.number().finite().min(0).max(1)
/**
 * One declared GLB material's capability row. `maps` lists present texture
 * slots in fixed order; `emissiveLinear` records a declared emissiveFactor.
 */
export const SpatialAssetMaterialFactSchema = z.strictObject({
  name: z.string().max(1_024).optional(),
  alphaMode: z.enum(["OPAQUE", "MASK", "BLEND"]),
  doubleSided: z.boolean(),
  maps: z.array(z.enum(["baseColor", "metallicRoughness", "normal", "occlusion", "emissive", "clearcoat", "clearcoatRoughness", "clearcoatNormal", "transmission", "sheenColor", "sheenRoughness", "anisotropy"])).max(12),
  textureTransforms: z.array(z.strictObject({ map: z.string().min(1).max(64), offset: z.tuple([z.number().finite(), z.number().finite()]), rotation: z.number().finite().min(-Math.PI).max(Math.PI), scale: z.tuple([z.number().finite(), z.number().finite()]) })).max(12).default([]),
  emissiveLinear: z.tuple([factsUnit, factsUnit, factsUnit]).optional(),
  emissiveStrength: z.number().finite().min(0).max(100_000).optional(),
  /** PBR extension indicators: present only when the GLB declares the corresponding KHR extension on this material. */
  clearcoat: z.strictObject({ factor: factsUnit, roughness: factsUnit }).optional(),
  transmission: z.strictObject({ factor: factsUnit }).optional(),
  sheen: z.strictObject({ colorLinear: z.tuple([factsUnit, factsUnit, factsUnit]), roughness: factsUnit }).optional(),
  anisotropy: z.strictObject({ strength: z.number().finite().min(-1).max(1), rotation: z.number().finite().min(0).max(2 * Math.PI) }).optional(),
  ior: z.number().finite().min(1).max(5).optional(),
})
const SpatialAssetRigFactsSchema = z.strictObject({
  profile: z.literal(SPATIAL_GLB_RIGGED_PROFILE),
  skins: z.array(z.strictObject({
    name: z.string().max(1_024).optional(),
    jointNodeIndices: z.array(z.number().int().min(0).max(SPATIAL_GLB_LIMITS.nodes - 1)).min(1).max(SPATIAL_GLB_LIMITS.jointsPerSkin),
    inverseBindMatricesAccessor: z.number().int().min(0).max(SPATIAL_GLB_LIMITS.accessors - 1),
  })).min(1).max(SPATIAL_GLB_LIMITS.skins),
  morphTargets: z.array(z.array(z.array(z.strictObject({
    name: z.string().min(1).max(1_024), hasPosition: z.boolean(), hasNormal: z.boolean(),
  })).max(SPATIAL_GLB_LIMITS.morphTargetsPerPrimitive)).max(SPATIAL_GLB_LIMITS.primitives)).max(SPATIAL_GLB_LIMITS.meshes),
  clips: z.array(z.strictObject({
    name: z.string().max(1_024).optional(),
    durationSeconds: z.number().finite().min(0).max(SPATIAL_GLB_LIMITS.durationSeconds),
    channels: z.array(z.strictObject({
      nodeIndex: z.number().int().min(0).max(SPATIAL_GLB_LIMITS.nodes - 1),
      path: z.enum(["translation", "rotation", "scale", "weights"]),
    })).max(SPATIAL_GLB_LIMITS.channels),
  })).max(SPATIAL_GLB_LIMITS.clips),
})
const meterBound = z.number().finite().min(0).max(1_000_000)
const lodCoordinate = z.number().finite().min(-1e6).max(1e6)
const lodVector = z.tuple([lodCoordinate, lodCoordinate, lodCoordinate])
/** One deterministic LOD level: an alternate retained GLB payload plus its selection rule. */
export const SpatialAssetLodSchema = z.strictObject({
  level: z.number().int().min(0).max(7),
  /** Asset id of the retained payload for this level (level 0 is the facts subject). */
  assetId: SpatialAssetIdSchema,
  sha256: SpatialDigestSchema,
  /** Selection rule: pick the greatest level whose switch distance is met. */
  switchDistanceM: meterBound,
})
export type SpatialAssetLod = Readonly<z.infer<typeof SpatialAssetLodSchema>>

/** Bounded collision proxies in the subject's model space; hulls reference a retained native artifact. */
export const SpatialCollisionProxySchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("box"), center: lodVector, halfExtents: z.tuple([meterBound, meterBound, meterBound]).refine(v => v.every(c => c > 0), "Box half extents must be positive.") }),
  z.strictObject({ kind: z.literal("sphere"), center: lodVector, radius: meterBound.refine(v => v > 0, "Sphere radius must be positive.") }),
  z.strictObject({ kind: z.literal("capsule"), center: lodVector, axis: z.enum(["x", "y", "z"]), radius: meterBound.refine(v => v > 0, "Capsule radius must be positive."), halfLength: meterBound }),
  z.strictObject({ kind: z.literal("hull-hull"), artifactSha256: SpatialDigestSchema }),
])
export type SpatialCollisionProxy = Readonly<z.infer<typeof SpatialCollisionProxySchema>>

/** Binding to one verified retained-native exchange: request and receipt digests plus emitted outputs. */
export const SpatialRetainedArtifactSchema = z.strictObject({
  operation: z.enum(["mesh-repair", "complex-csg", "uv-atlas", "decimation", "hull-decomposition", "glb-emission"]),
  requestSha256: SpatialDigestSchema,
  receiptSha256: SpatialDigestSchema,
  outputs: z.array(z.strictObject({ sha256: SpatialDigestSchema, bytes: z.number().int().safe().min(1).max(SPATIAL_GLB_LIMITS.bytes) })).min(1).max(16),
})
export type SpatialRetainedArtifact = Readonly<z.infer<typeof SpatialRetainedArtifactSchema>>

/** Facts for a parametric-geometry subject: generator identity, spec/parameter digests, LOD set and collision proxies. */
export const SpatialAssetGeneratorFactsSchema = z.strictObject({
  generatorId: SpatialGeneratorIdSchema,
  /** Parametric generator kind (wall, stairs, arch, …) as declared by the spec. */
  parametricKind: z.string().min(1).max(64),
  /** Canonical digest of the bounded parametric spec document. */
  specSha256: SpatialDigestSchema,
  /** Digest of the declared generator parameters (matches the generator record). */
  parametersSha256: SpatialDigestSchema,
  /** Sorted LOD set; level 0 must be present and is the facts subject. */
  lods: z.array(SpatialAssetLodSchema).min(1).max(8),
  /** Model-space collision proxies consumed by audits and hosts. */
  collision: z.array(SpatialCollisionProxySchema).max(16),
  /** Verified retained-native exchanges whose outputs this subject binds. */
  retainedArtifacts: z.array(SpatialRetainedArtifactSchema).max(8).optional(),
})
export type SpatialAssetGeneratorFacts = Readonly<z.infer<typeof SpatialAssetGeneratorFactsSchema>>

export const SpatialAssetFactsV1Schema = z.strictObject({
  kind: z.literal("slopcamera.spatial-asset-facts"), schemaVersion: z.literal(1),
  subject: SpatialPayloadSchema,
  subjectManifestSha256: SpatialDigestSchema,
  profile: z.enum([SPATIAL_GLB_PROFILE, SPATIAL_GLB_PROFILE_V1, SPATIAL_GLB_RIGGED_PROFILE, SPATIAL_GEOMETRY_PROFILE]),
  nodeCount: z.number().int().min(1).max(SPATIAL_GLB_LIMITS.nodes),
  clipDurationsSeconds: z.array(z.number().finite().min(0).max(SPATIAL_GLB_LIMITS.durationSeconds)).max(SPATIAL_GLB_LIMITS.clips),
  bounds: z.strictObject({ modelSpace: SpatialBoundsSchema, sceneSpace: SpatialBoundsSchema }),
  /** Present on newly admitted assets; absent facts predate the material-facts extension. */
  materials: z.array(SpatialAssetMaterialFactSchema).max(SPATIAL_GLB_LIMITS.materials).optional(),
  /** Exact skeleton, morph and channel facts for the additive rigged profile. */
  rig: SpatialAssetRigFactsSchema.optional(),
  /** Generator identity, LOD set, collision proxies and retained artifacts for parametric subjects. */
  generator: SpatialAssetGeneratorFactsSchema.optional(),
}).superRefine((facts, context) => {
  if ((facts.profile === SPATIAL_GLB_RIGGED_PROFILE) !== (facts.rig !== undefined)) context.addIssue({ code: "custom", path: ["rig"], message: "Rig facts must be present exactly for the rigged GLB profile." })
  if ((facts.profile === SPATIAL_GEOMETRY_PROFILE) !== (facts.generator !== undefined)) context.addIssue({ code: "custom", path: ["generator"], message: "Generator facts must be present exactly for the parametric geometry profile." })
  if (facts.generator !== undefined) {
    const levels = new Set(facts.generator.lods.map(lod => lod.level))
    if (levels.size !== facts.generator.lods.length || !levels.has(0)) context.addIssue({ code: "custom", path: ["generator", "lods"], message: "LOD levels must be unique and include level 0." })
    const distances = facts.generator.lods.map(lod => lod.switchDistanceM)
    if (distances.some((value, index) => index > 0 && value <= distances[index - 1]!)) context.addIssue({ code: "custom", path: ["generator", "lods"], message: "LOD switch distances must strictly increase." })
    const hulls = facts.generator.collision.filter(proxy => proxy.kind === "hull-hull")
    for (const hull of hulls) {
      const bound = facts.generator.retainedArtifacts?.some(artifact => artifact.outputs.some(output => output.sha256 === hull.artifactSha256)) ?? false
      if (!bound) context.addIssue({ code: "custom", path: ["generator", "collision"], message: "Hull-hull proxies must reference a retained artifact output." })
    }
  }
})
export type SpatialAssetFactsV1 = Readonly<z.infer<typeof SpatialAssetFactsV1Schema>>

export const SpatialPublishedArtifactSchema = z.strictObject({
  path: z.string().min(1).max(1_024),
  sha256: SpatialDigestSchema,
  bytes: z.number().int().safe().min(1).max(SPATIAL_GLB_LIMITS.bytes),
  disposition: z.enum(["created", "exists"]),
})
export type SpatialPublishedArtifact = Readonly<z.infer<typeof SpatialPublishedArtifactSchema>>

/**
 * The deterministic `scene asset admit` output document. Artifact paths are
 * relative to the directory containing this document; `operations` apply in
 * order inside one `SpatialScenePatchV1` alongside the caller's expected scene
 * digest.
 */
export const SpatialAssetAdmissionV1Schema = z.strictObject({
  kind: z.literal("slopcamera.spatial-asset-admission"), schemaVersion: z.literal(1),
  manifest: SpatialAssetManifestSchema,
  factsManifest: SpatialAssetManifestSchema,
  facts: SpatialAssetFactsV1Schema,
  bounds: z.strictObject({ modelSpace: SpatialBoundsSchema, sceneSpace: SpatialBoundsSchema }),
  entity: SpatialEntitySchema,
  artifacts: z.strictObject({ payload: SpatialPublishedArtifactSchema, facts: SpatialPublishedArtifactSchema }),
  operations: z.array(SpatialPatchOperationSchema).min(2).max(SPATIAL_SCENE_LIMITS.patchOperations),
})
export type SpatialAssetAdmissionV1 = Readonly<z.infer<typeof SpatialAssetAdmissionV1Schema>>
