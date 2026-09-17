import { z } from "zod";

import { SPATIAL_SCENE_LIMITS, SpatialAssetManifestSchema, SpatialDigestSchema, SpatialEntitySchema, SpatialPatchOperationSchema, SpatialPayloadSchema } from "../../../src/spatial-scene/contracts";
import { SPATIAL_GLB_LIMITS, SPATIAL_GLB_PROFILE, SPATIAL_GLB_PROFILE_V1 } from "../../../src/spatial-scene/gltf";

/**
 * Affine guard bound. Node matrices stay below math.MAX_ABS_COMPONENT (1e12)
 * and decoded vertices below 1e6, so every transformed vertex stays under
 * ~3e18; 1e18 bounds the reachable evaluated range with margin.
 */
const boundsComponent = z.number().finite().min(-1e18).max(1e18);
const boundsVector = z.tuple([boundsComponent, boundsComponent, boundsComponent]);
export const SpatialBoundsSchema = z.strictObject({ min: boundsVector, max: boundsVector })
  .refine(value => value.min.every((component, index) => component <= value.max[index]!), "Bounds min must not exceed max.");
export type SpatialBounds = Readonly<z.infer<typeof SpatialBoundsSchema>>;

/**
 * Derived facts bound to one admitted asset payload. The document persists as a
 * canonical JSON payload behind a sibling `metadata` manifest that depends on
 * its subject asset, so a scene may omit it without invalidating the subject
 * manifest under the unchanged `gltf` interpretation shape.
 */
const factsUnit = z.number().finite().min(0).max(1);
/**
 * One declared GLB material's capability row. `maps` lists present texture
 * slots in fixed order; `emissiveLinear` records a declared emissiveFactor.
 */
export const SpatialAssetMaterialFactSchema = z.strictObject({
  name: z.string().max(1_024).optional(),
  alphaMode: z.enum(["OPAQUE", "MASK", "BLEND"]),
  doubleSided: z.boolean(),
  maps: z.array(z.enum(["baseColor", "metallicRoughness", "normal", "occlusion", "emissive"])).max(5),
  emissiveLinear: z.tuple([factsUnit, factsUnit, factsUnit]).optional(),
});
export const SpatialAssetFactsV1Schema = z.strictObject({
  kind: z.literal("slopcamera.spatial-asset-facts"), schemaVersion: z.literal(1),
  subject: SpatialPayloadSchema,
  subjectManifestSha256: SpatialDigestSchema,
  profile: z.enum([SPATIAL_GLB_PROFILE, SPATIAL_GLB_PROFILE_V1]),
  nodeCount: z.number().int().min(1).max(SPATIAL_GLB_LIMITS.nodes),
  clipDurationsSeconds: z.array(z.number().finite().min(0).max(SPATIAL_GLB_LIMITS.durationSeconds)).max(SPATIAL_GLB_LIMITS.clips),
  bounds: z.strictObject({ modelSpace: SpatialBoundsSchema, sceneSpace: SpatialBoundsSchema }),
  /** Present on newly admitted assets; absent facts predate the material-facts extension. */
  materials: z.array(SpatialAssetMaterialFactSchema).max(SPATIAL_GLB_LIMITS.materials).optional(),
});
export type SpatialAssetFactsV1 = Readonly<z.infer<typeof SpatialAssetFactsV1Schema>>;

export const SpatialPublishedArtifactSchema = z.strictObject({
  path: z.string().min(1).max(1_024),
  sha256: SpatialDigestSchema,
  bytes: z.number().int().safe().min(1).max(SPATIAL_GLB_LIMITS.bytes),
  disposition: z.enum(["created", "exists"]),
});
export type SpatialPublishedArtifact = Readonly<z.infer<typeof SpatialPublishedArtifactSchema>>;

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
});
export type SpatialAssetAdmissionV1 = Readonly<z.infer<typeof SpatialAssetAdmissionV1Schema>>;
