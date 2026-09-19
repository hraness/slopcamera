import { z } from "zod";

import { createBoundedJsonSnapshot } from "../../../src/code/json-snapshot";
import {
  EvaluatedSpatialSceneSchema,
  SpatialAssetIdSchema,
  SpatialDigestSchema,
  SpatialEntityIdSchema,
  SpatialFrameRateSchema,
  SpatialMaterialSchema,
  SpatialMatrixSchema,
  SpatialProjectionSchema,
  SpatialTimeUsSchema,
  type EvaluatedSpatialScene,
  type SpatialCamera,
  type SpatialEntity,
  type SpatialProjection,
  type SpatialSpotLight,
} from "../../../src/spatial-scene/contracts";
import { cameraMathView, composeTransform, invertTransform, multiplyTransforms, type Mat4 } from "../../../src/spatial-scene/math";
import { spatialAssetClosureDigests } from "../../../src/spatial-scene/identity";
import { pbrMaterialMapAssetIds } from "../../../src/spatial-scene/material-lighting";
import { SpatialRenderEffectsBindingSchema } from "../../../src/spatial-scene/render-effects";
import { SpatialAuditBoundsSchema } from "../../../src/spatial-scene/audit";
import { SPATIAL_SPLAT_PROXY_REPRESENTATION } from "../../../src/spatial-scene/audit-rendered";
import { canonicalJson, canonicalJsonSha256 } from "../core/canonical-json";
import {
  HtmlOverlayAuthoringInputSchema,
  HtmlOverlayDeclaredResourceSchema,
  HtmlOverlayDeclaredResourcesSchema,
  type HtmlOverlayDeclaredResource,
} from "./contracts";
import { htmlOverlayAssetLocalUrl, serializeHtmlOverlayImportMap } from "./libraries";
import { HtmlOverlayExecutionProfileSchema } from "./execution-profile";
import { SpatialSpzFactsSchema, SPATIAL_SPLAT_LIMITS, spatialSpzAllocationBounds } from "../contracts/spatial-world";
import { addSpatialSplatRuntime } from "./spatial-splat-runtime";
import { SPATIAL_SHADOW_POLICY, spatialShadowRuntimeSource } from "./spatial-shadows";

export const SPATIAL_OVERLAY_LIMITS = Object.freeze({
  frames: 32,
  requestBytes: 16 * 1024 * 1024,
  requestValues: 1_000_000,
  preparedAssets: 1_024,
  primitivesPerAsset: 256,
  verticesPerPrimitive: 65_536,
  trianglesPerFrame: 100_000,
  drawCallsPerFrame: 2_048,
  decodedTexturePixels: 67_108_864,
});

const alphaSchema = z.enum(["straight", "opaque"]);
const textureShape = {
  resource: HtmlOverlayDeclaredResourceSchema,
  width: z.number().int().min(1).max(8_192),
  height: z.number().int().min(1).max(8_192),
  alpha: alphaSchema,
  uvTransform: z.strictObject({ offset: z.tuple([z.number().finite(), z.number().finite()]), rotation: z.number().finite().min(-Math.PI).max(Math.PI), scale: z.tuple([z.number().finite(), z.number().finite()]) }).optional(),
};
const samplerSchema = z.strictObject({
  wrapS: z.union([z.literal(33071), z.literal(33648), z.literal(10497)]),
  wrapT: z.union([z.literal(33071), z.literal(33648), z.literal(10497)]),
  magFilter: z.union([z.literal(9728), z.literal(9729)]).optional(),
  minFilter: z.union([z.literal(9728), z.literal(9729), z.literal(9984), z.literal(9985), z.literal(9986), z.literal(9987)]).optional(),
});
const finiteGeometry = z.number().finite().min(-1e6).max(1e6);
const primitiveSchema = z.strictObject({
  positions: z.array(finiteGeometry).min(9).max(SPATIAL_OVERLAY_LIMITS.verticesPerPrimitive * 3),
  normals: z.array(finiteGeometry).min(9).max(SPATIAL_OVERLAY_LIMITS.verticesPerPrimitive * 3).optional(),
  uvs: z.array(finiteGeometry).min(6).max(SPATIAL_OVERLAY_LIMITS.verticesPerPrimitive * 2).optional(),
  indices: z.array(z.number().int().min(0).max(SPATIAL_OVERLAY_LIMITS.verticesPerPrimitive - 1)).min(3)
    .max(SPATIAL_OVERLAY_LIMITS.trianglesPerFrame * 3).optional(),
  matrix: SpatialMatrixSchema,
  sourceNodeIndex: z.number().int().min(0).max(65_535).optional(),
  sourcePrimitiveIndex: z.number().int().min(0).max(65_535).optional(),
  doubleSided: z.boolean().optional(),
  alphaCutoff: z.number().finite().min(0).max(1).optional(),
  alphaMode: z.enum(["OPAQUE", "MASK", "BLEND"]).optional(),
  linearColor: z.tuple([z.number().finite().min(0).max(1), z.number().finite().min(0).max(1), z.number().finite().min(0).max(1)]).optional(),
  /** Host-resolved final material; omitted means the entity's material. */
  material: SpatialMaterialSchema.optional(),
  texture: z.strictObject({ ...textureShape, flipY: z.boolean().optional(), sampler: samplerSchema.optional() }).optional(),
  normalTexture: z.strictObject({ ...textureShape, scale: z.number().finite().optional(), flipY: z.boolean().optional(), sampler: samplerSchema.optional() }).optional(),
  metallicRoughnessTexture: z.strictObject({ ...textureShape, flipY: z.boolean().optional(), sampler: samplerSchema.optional() }).optional(),
  occlusionTexture: z.strictObject({ ...textureShape, strength: z.number().finite().min(0).max(1).optional(), flipY: z.boolean().optional(), sampler: samplerSchema.optional() }).optional(),
  emissiveTexture: z.strictObject({ ...textureShape, flipY: z.boolean().optional(), sampler: samplerSchema.optional() }).optional(),
  clearcoatTexture: z.strictObject({ ...textureShape, flipY: z.boolean().optional(), sampler: samplerSchema.optional() }).optional(),
  clearcoatRoughnessTexture: z.strictObject({ ...textureShape, flipY: z.boolean().optional(), sampler: samplerSchema.optional() }).optional(),
  clearcoatNormalTexture: z.strictObject({ ...textureShape, scale: z.number().finite().optional(), flipY: z.boolean().optional(), sampler: samplerSchema.optional() }).optional(),
  transmissionTexture: z.strictObject({ ...textureShape, flipY: z.boolean().optional(), sampler: samplerSchema.optional() }).optional(),
  sheenColorTexture: z.strictObject({ ...textureShape, flipY: z.boolean().optional(), sampler: samplerSchema.optional() }).optional(),
  sheenRoughnessTexture: z.strictObject({ ...textureShape, flipY: z.boolean().optional(), sampler: samplerSchema.optional() }).optional(),
  anisotropyTexture: z.strictObject({ ...textureShape, flipY: z.boolean().optional(), sampler: samplerSchema.optional() }).optional(),
  physical: z.strictObject({ emissiveLinear: z.tuple([z.number(), z.number(), z.number()]).optional(), emissiveStrength: z.number().min(0).max(100_000).optional(), clearcoat: z.strictObject({ factor: z.number().min(0).max(1), roughness: z.number().min(0).max(1) }).optional(), transmission: z.number().min(0).max(1).optional(), sheen: z.strictObject({ colorLinear: z.tuple([z.number(), z.number(), z.number()]), roughness: z.number().min(0).max(1) }).optional(), anisotropy: z.strictObject({ strength: z.number().min(0).max(1), rotation: z.number().min(0).max(2 * Math.PI) }).optional(), ior: z.number().min(1).max(5).optional() }).optional(),
}).superRefine((primitive, context) => {
  const vertices = primitive.positions.length / 3;
  const hasTexture = primitive.texture !== undefined || primitive.normalTexture !== undefined || primitive.metallicRoughnessTexture !== undefined
    || primitive.occlusionTexture !== undefined || primitive.emissiveTexture !== undefined || primitive.clearcoatTexture !== undefined || primitive.clearcoatRoughnessTexture !== undefined || primitive.clearcoatNormalTexture !== undefined || primitive.transmissionTexture !== undefined || primitive.sheenColorTexture !== undefined || primitive.sheenRoughnessTexture !== undefined || primitive.anisotropyTexture !== undefined;
  if (!Number.isInteger(vertices)
    || (primitive.indices === undefined ? vertices % 3 !== 0 : primitive.indices.length % 3 !== 0)
    || primitive.indices?.some(index => index >= vertices)
    || (primitive.normals !== undefined && primitive.normals.length !== primitive.positions.length)
    || (primitive.uvs !== undefined && primitive.uvs.length !== vertices * 2)
    || (hasTexture && primitive.uvs === undefined)) {
    context.addIssue({ code: "custom", message: "Prepared geometry must contain complete triangles, matching attributes, and in-range indices; textured geometry requires UVs." });
  }
  try { invertTransform(primitive.matrix); } catch {
    context.addIssue({ code: "custom", message: "Prepared geometry matrices must be finite invertible affine transforms." });
  }
});

export const PreparedSpatialAssetSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("splat"), assetId: SpatialAssetIdSchema, entityId: SpatialEntityIdSchema, assetManifestSha256: SpatialDigestSchema,
    resource: HtmlOverlayDeclaredResourceSchema, facts: SpatialSpzFactsSchema,
    /** Entity-local axis-aligned enclosure decoded from the SPZ position section; the object-ID proxy derives from it. */
    bounds: SpatialAuditBoundsSchema }),
  z.strictObject({
    kind: z.literal("raster"),
    assetId: SpatialAssetIdSchema,
    assetManifestSha256: SpatialDigestSchema,
    entityId: SpatialEntityIdSchema,
    /** null is a static surface. Video frames must name the exact snapshot time. */
    timeUs: SpatialTimeUsSchema.nullable(),
    sourceTimeUs: SpatialTimeUsSchema.optional(),
    sourceFrameIndex: z.number().int().min(0).max(216_000).optional(),
    sourcePresentationTimeUs: SpatialTimeUsSchema.optional(),
    sourcePts: z.number().int().safe().min(0).optional(),
    sourceTimeBase: z.strictObject({ numerator: z.string().regex(/^[1-9]\d{0,15}$/u), denominator: z.string().regex(/^[1-9]\d{0,15}$/u) }).optional(),
    sourceTimestamp: z.string().max(64).regex(/^\d+(?:\.\d{1,9})?$/u).optional(),
    sourceExactTimeUs: z.strictObject({ numerator: z.string().regex(/^(?:0|[1-9]\d{0,23})$/u), denominator: z.string().regex(/^[1-9]\d{0,8}$/u) }).optional(),
    entityContentSha256: SpatialDigestSchema.optional(),
    ...textureShape,
  }),
  z.strictObject({
    kind: z.literal("lut"),
    assetId: SpatialAssetIdSchema,
    assetManifestSha256: SpatialDigestSchema,
    ...textureShape,
  }),
  z.strictObject({
    kind: z.literal("particle-instances"),
    entityId: SpatialEntityIdSchema,
    instanceCount: z.number().int().min(0).max(1_000_000),
    resource: HtmlOverlayDeclaredResourceSchema,
    strideBytes: z.literal(64),
    systemSha256: SpatialDigestSchema,
    timeUs: SpatialTimeUsSchema,
  }),
  z.strictObject({
    kind: z.literal("geometry"),
    assetId: SpatialAssetIdSchema,
    entityId: SpatialEntityIdSchema,
    entityGeometrySha256: SpatialDigestSchema,
    assetManifestSha256: SpatialDigestSchema,
    nodeIndex: z.number().int().min(0).max(65_535).optional(),
    timeUs: SpatialTimeUsSchema.nullable(),
    primitives: z.array(primitiveSchema).min(1).max(SPATIAL_OVERLAY_LIMITS.primitivesPerAsset),
    /** Optional exact canonical primitives JSON, served through the private resource boundary. */
    resource: HtmlOverlayDeclaredResourceSchema.optional(),
  }),
]);

export const SpatialCoverageSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("opaque") }),
  z.strictObject({ kind: z.literal("alpha-threshold"), threshold: z.number().finite().gt(0).max(1) }),
]);
export const SpatialRenderModeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("beauty") }),
  z.strictObject({ kind: z.literal("object-id"), coverage: SpatialCoverageSchema }),
  z.strictObject({ kind: z.literal("axial-depth"), coverage: SpatialCoverageSchema }),
  z.strictObject({ kind: z.literal("motion"), coverage: SpatialCoverageSchema, entityId: SpatialEntityIdSchema,
    /** Pixels per frame interval mapped to the packed evidence midpoint range. */
    motionScale: z.number().finite().positive().max(1_000_000) }),
]);

export const SpatialOverlayBatchInputSchema = z.strictObject({
  snapshots: z.array(EvaluatedSpatialSceneSchema).min(1).max(SPATIAL_OVERLAY_LIMITS.frames),
  /**
   * The immediately preceding evaluated sample, retained only to derive exact
   * screen-space velocity for the first frame of this batch. It is never
   * rendered, and its scene digest must match the rendered snapshots.
   */
  previousSnapshot: EvaluatedSpatialSceneSchema.optional(),
  frameRate: SpatialFrameRateSchema,
  effects: SpatialRenderEffectsBindingSchema.optional(),
  mode: SpatialRenderModeSchema,
  executionProfile: HtmlOverlayExecutionProfileSchema.optional(),
  preparedAssets: z.array(PreparedSpatialAssetSchema).max(SPATIAL_OVERLAY_LIMITS.preparedAssets).default([]),
});
type DeepReadonly<T> = T extends object ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> } : T;
export type PreparedSpatialAsset = DeepReadonly<z.infer<typeof PreparedSpatialAssetSchema>>;
export type SpatialRenderMode = DeepReadonly<z.infer<typeof SpatialRenderModeSchema>>;
export type SpatialOverlayBatchInput = DeepReadonly<z.input<typeof SpatialOverlayBatchInputSchema>>;
type PreparedRaster = Extract<PreparedSpatialAsset, { kind: "raster" }>;
type PreparedGeometry = Extract<PreparedSpatialAsset, { kind: "geometry" }>;
type PreparedParticleInstances = Extract<PreparedSpatialAsset, { kind: "particle-instances" }>;
type PreparedSplat = Extract<PreparedSpatialAsset, { kind: "splat" }>;
type LoweredSplat = Readonly<{ kind: "splat"; entityId: string; key: string; matrix: Mat4 }>;
type Material = DeepReadonly<z.infer<typeof SpatialMaterialSchema>>;
type Texture = DeepReadonly<z.infer<typeof primitiveSchema>["texture"]>;

/** Text preparation draws white glyphs; final color is applied by the scene material. */
export function spatialTextRasterContentSha256(entity: Extract<SpatialEntity, { kind: "text" }>): string {
  return canonicalJsonSha256({ domain: "slopcamera.spatial-text-raster.v1", text: entity.text, fontAssetId: entity.fontAssetId,
    fontSize: entity.fontSize, width: entity.width, align: entity.align });
}
export function spatialGeometryContentSha256(entity: Extract<SpatialEntity, { kind: "mesh" }>): string {
  return canonicalJsonSha256({ domain: "slopcamera.spatial-geometry-binding.v1", geometry: entity.geometry });
}
export function spatialVideoRasterContentSha256(entity: Extract<SpatialEntity, { kind: "video" }>): string {
  return canonicalJsonSha256({ domain: "slopcamera.spatial-video-binding.v1", assetId: entity.assetId, sourceOffsetUs: entity.sourceOffsetUs, playback: entity.playback });
}

/**
 * The content normalization every splat representation applies: the declared
 * `sourceUp`→Y rotation plus the uniform `metersPerUnit` scale, ahead of the
 * entity's own transform. Beauty rendering and proxy bounds share this map.
 */
export function spatialSplatContentTransform(interpretation: { readonly metersPerUnit: number; readonly sourceUp: "x" | "y" | "z" }): Mat4 {
  const rotation = interpretation.sourceUp === "x" ? [0, 0, Math.SQRT1_2, Math.SQRT1_2] as const
    : interpretation.sourceUp === "z" ? [-Math.SQRT1_2, 0, 0, Math.SQRT1_2] as const : [0, 0, 0, 1] as const;
  const unit = interpretation.metersPerUnit;
  return composeTransform({ position: [0, 0, 0], rotation, scale: [unit, unit, unit] });
}

export class SpatialOverlayCapabilityError extends Error {
  readonly code = "unsupported-capability";
  constructor(readonly capability: string, message: string) {
    super(message);
    this.name = "SpatialOverlayCapabilityError";
  }
}

/** Exact byte-order encoding. Zero RGB with zero alpha is always no-hit. */
export function spatialSelectionColor(selectionId: number): readonly [number, number, number] {
  if (!Number.isInteger(selectionId) || selectionId < 1 || selectionId > 4_096) {
    throw new RangeError("Selection IDs must be integers in [1,4096].");
  }
  return Object.freeze([Math.floor(selectionId / 65_536), Math.floor(selectionId / 256) % 256, selectionId % 256]);
}

export const SPATIAL_DEPTH_MAX_CODE = 16_777_215;
/** Decode an RGBA8 sample; byte values are data, never color-converted. */
export function decodeSpatialAxialDepth(rgba: readonly number[], near: number, far: number): number | null {
  if (rgba.length !== 4 || rgba.some(byte => !Number.isInteger(byte) || byte < 0 || byte > 255)
    || !Number.isFinite(near) || !Number.isFinite(far) || near <= 0 || far <= near) {
    throw new RangeError("Expected RGBA8 bytes and positive ordered clipping distances.");
  }
  const code = rgba[0]! * 65_536 + rgba[1]! * 256 + rgba[2]!;
  if (rgba[3] === 0 && code === 0) return null;
  if (rgba[3] !== 255 || code === 0) throw new RangeError("Malformed axial-depth validity or code.");
  return Math.min(far, Math.max(near, near + (code - 1) / (SPATIAL_DEPTH_MAX_CODE - 1) * (far - near)));
}

/** WebGL clip projection, with unequal focal lengths and off-center principal point. */
export function spatialWebGlProjection(projection: SpatialProjection): Mat4 {
  const p = SpatialProjectionSchema.parse(projection);
  if (p.kind === "perspective") {
    return Object.freeze([
      2 * p.fx / p.width, 0, 0, 0,
      0, 2 * p.fy / p.height, 0, 0,
      1 - 2 * p.cx / p.width, 2 * p.cy / p.height - 1, -(p.far + p.near) / (p.far - p.near), -1,
      0, 0, -2 * p.far * p.near / (p.far - p.near), 0,
    ]);
  }
  return Object.freeze([
    2 / (p.right - p.left), 0, 0, 0,
    0, 2 / (p.top - p.bottom), 0, 0,
    0, 0, -2 / (p.far - p.near), 0,
    -(p.right + p.left) / (p.right - p.left), -(p.top + p.bottom) / (p.top - p.bottom),
    -(p.far + p.near) / (p.far - p.near), 1,
  ]);
}

type LoweredMesh = Readonly<{
  kind: "mesh";
  entityId: string;
  selectionId: number;
  matrix: Mat4;
  /** Exact previous-sample model matrix for screen-space velocity; present only when the batch derives motion. */
  previousMatrix?: Mat4;
  placement: SpatialEntity["placement"];
  geometry: Exclude<Extract<SpatialEntity, { kind: "mesh" }>["geometry"], { kind: "asset" }> | { readonly kind: "prepared"; readonly key: string; readonly primitive: number };
  material: Material;
  textureName?: string;
  textureAlpha?: "straight" | "opaque";
  /** Exact prepared resource name for every PBR map asset used by this mesh. */
  pbrTextures?: Readonly<Record<string, string>>;
  uvScale: readonly [number, number];
  uvOffset: readonly [number, number];
  surfaceScale: readonly [number, number];
  flipViewUv: boolean;
  doubleSided: boolean;
  alphaCutoff: number;
  alphaMode?: "OPAQUE" | "MASK" | "BLEND";
  linearColor?: readonly [number, number, number];
  castShadow?: boolean;
  receiveShadow?: boolean;
  textureOptions?: Readonly<{ readonly flipY?: boolean; readonly sampler?: DeepReadonly<z.infer<typeof samplerSchema>>; readonly uvTransform?: { readonly offset: readonly [number, number]; readonly rotation: number; readonly scale: readonly [number, number] } }>;
  sourcePhysical?: DeepReadonly<NonNullable<z.infer<typeof primitiveSchema>["physical"]>>;
  sourceTextures?: Readonly<Record<string, { readonly name: string; readonly uvTransform?: { readonly offset: readonly [number, number]; readonly rotation: number; readonly scale: readonly [number, number] } }>>;
}>;
type LoweredLight = Readonly<{
  kind: "light";
  entityId: string;
  matrix: Mat4;
  light: "ambient" | "point" | "directional" | "spot";
  color: string;
  intensity: number;
  spot?: SpatialSpotLight;
  shadow?: boolean;
}>;
/** Equirect sky surface: camera-following background and optional standard-material environment light. */
type LoweredEnvironment = Readonly<{
  kind: "environment";
  entityId: string;
  textureName: string;
  /** Effective world rotation in XYZW; environment entities are unparented so the authored rotation is world-space. */
  rotation: readonly [number, number, number, number];
  intensity: number;
  role: "background" | "environment" | "both";
}>;

function unsupported(capability: string, message: string): never {
  throw new SpatialOverlayCapabilityError(capability, message);
}

function preparedKey(asset: PreparedSpatialAsset): string {
  if (asset.kind === "splat") return `${asset.assetId}:${asset.entityId}:splat`;
  if (asset.kind === "lut") return `lut:${asset.assetId}`;
  if (asset.kind === "particle-instances") return `${asset.systemSha256}:${asset.entityId}:${asset.timeUs}`;
  return asset.kind === "raster"
    ? `${asset.assetId}:${asset.entityId}:${asset.timeUs === null ? "static" : String(asset.timeUs)}`
    : `${asset.assetId}:${asset.entityId}:${asset.nodeIndex === undefined ? "all" : String(asset.nodeIndex)}:${asset.timeUs === null ? "static" : String(asset.timeUs)}`;
}

function assertRasterResource(texture: NonNullable<Texture>): void {
  if (texture.resource.mediaType !== "image/png" && texture.resource.mediaType !== "image/jpeg") {
    unsupported("prepared-raster-format", "Prepared surfaces must be validated PNG or JPEG resources; SVG, video, fonts, and diagram JSON require host preparation.");
  }
  if (texture.resource.bytes === 0) throw new RangeError("Prepared raster resources must be nonempty.");
}

function assertCoverage(mode: SpatialRenderMode, material: Material, texture: Texture, alphaMode?: "OPAQUE" | "MASK" | "BLEND"): void {
  if (mode.kind !== "beauty" && mode.coverage.kind === "opaque"
    && alphaMode !== "MASK"
    && (material.opacity !== 1 || texture?.alpha === "straight")) {
    unsupported("opaque-coverage", "Opaque auxiliary passes require opaque materials and opaque textures. Select an explicit alpha threshold for translucent surfaces.");
  }
}

function fitSurface(width: number, height: number, raster: PreparedRaster, fit: "contain" | "cover" | "stretch") {
  const aspect = raster.width / raster.height;
  const target = width / height;
  let surfaceScale: [number, number] = [1, 1];
  let uvScale: [number, number] = [1, 1];
  if (fit === "contain") surfaceScale = aspect > target ? [1, target / aspect] : [aspect / target, 1];
  if (fit === "cover") uvScale = aspect > target ? [target / aspect, 1] : [1, aspect / target];
  return { surfaceScale, uvScale, uvOffset: [(1 - uvScale[0]) / 2, (1 - uvScale[1]) / 2] as const };
}

function geometryTriangleCount(mesh: LoweredMesh, geometries: ReadonlyMap<string, PreparedGeometry>): number {
  switch (mesh.geometry.kind) {
    case "box": return 12;
    case "plane": return 2;
    case "sphere": return 960;
    case "cylinder": return 128;
    case "prepared": {
      const primitive = geometries.get(mesh.geometry.key)!.primitives[mesh.geometry.primitive]!;
      return primitive.indices === undefined ? primitive.positions.length / 9 : primitive.indices.length / 3;
    }
  }
}

function escapeEmbeddedJson(value: unknown): string {
  return canonicalJson(value).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026").replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
}

function calibratedCamera(camera: SpatialCamera) {
  return {
    cameraToWorld: cameraMathView(camera).cameraToWorld,
    projection: spatialWebGlProjection(camera.projection),
    near: camera.projection.near,
    far: camera.projection.far,
    kind: camera.projection.kind,
    // Physical values are carried to the renderer payload for deterministic
    // cinematic consumers; calibrated projection remains authoritative.
    ...(camera.lens === undefined ? {} : { lens: camera.lens }),
  };
}

/**
 * Pure lowering. The integer overlay clock transports frame indices only. The
 * exact scene times and rational delivery rate remain in the returned metadata.
 * No file reads, loaders, generator execution, or GPU work occur here.
 */
export function createSpatialOverlayBatch(input: unknown) {
  const captured = createBoundedJsonSnapshot(input, SPATIAL_OVERLAY_LIMITS.requestBytes, "Spatial overlay request", {
    maximumDepth: 48, maximumValues: SPATIAL_OVERLAY_LIMITS.requestValues,
  });
  const request = SpatialOverlayBatchInputSchema.parse(captured.value);
  const first = request.snapshots[0]!;
  const width = first.camera.projection.width;
  const height = first.camera.projection.height;
  if (request.effects !== undefined && request.snapshots.some(snapshot => snapshot.sceneSha256 !== request.effects!.document.sceneSha256)) {
    throw new RangeError("Render effects belong to a different evaluated scene source.");
  }
  const activeEffects = request.mode.kind === "beauty" ? request.effects : undefined;
  const effectSteps = activeEffects?.document.renderPlan.postProcess?.steps ?? [];
  const needsVelocity = request.mode.kind === "motion" || effectSteps.some(step => step.kind === "motion-blur");
  const needsDepth = effectSteps.some(step => step.kind === "depth-of-field");
  if (request.previousSnapshot !== undefined) {
    if (!needsVelocity) throw new RangeError("A previous snapshot is only meaningful when the batch derives motion.");
    if (request.previousSnapshot.sceneSha256 !== first.sceneSha256 || request.previousSnapshot.stateSha256 === first.stateSha256
      || request.previousSnapshot.timeUs >= first.timeUs) {
      throw new RangeError("The previous snapshot must precede this batch on the same scene source.");
    }
  }
  if (request.mode.kind === "motion" && request.snapshots.length < 2 && request.previousSnapshot === undefined) {
    throw new RangeError("Motion evidence requires a leading sample or at least two rendered samples.");
  }
  const prepared = new Map<string, PreparedSpatialAsset>();
  const geometries = new Map<string, PreparedGeometry>();
  const particles = new Map<string, PreparedParticleInstances>();
  const splats = new Map<string, PreparedSplat>();
  const splatResources = new Map<string, HtmlOverlayDeclaredResource>();
  const resources = new Map<string, HtmlOverlayDeclaredResource>();
  const textures = new Map<string, { readonly width: number; readonly height: number; readonly alpha: "straight" | "opaque" }>();
  const lutBindings = new Map<string, { readonly resourceName: string; readonly size: number }>();
  const usedPrepared = new Set<string>();
  const bindTexture = (texture: NonNullable<Texture>): void => {
    // Motion evidence draws velocity only; prepared raster bindings still count
    // as used through bindAsset, but their pixels are never declared or served.
    if (request.mode.kind === "motion") return;
    assertRasterResource(texture);
    const existing = resources.get(texture.resource.name);
    if (existing !== undefined && canonicalJson(existing) !== canonicalJson(texture.resource)) {
      throw new RangeError("Prepared texture resource names must identify one immutable resource.");
    }
    const dimensions = { width: texture.width, height: texture.height, alpha: texture.alpha };
    const priorDimensions = textures.get(texture.resource.name);
    if (priorDimensions !== undefined && canonicalJson(priorDimensions) !== canonicalJson(dimensions)) {
      throw new RangeError("Prepared texture dimensions and alpha semantics must agree for one resource.");
    }
    textures.set(texture.resource.name, dimensions);
    resources.set(texture.resource.name, texture.resource);
  };
  for (const asset of request.preparedAssets) {
    const key = preparedKey(asset);
    if (prepared.has(key)) throw new RangeError(`Duplicate prepared asset binding: ${key}`);
    prepared.set(key, asset);
    if (asset.kind === "geometry") {
      geometries.set(key, asset);
      if (asset.resource !== undefined) {
        const bytes = new TextEncoder().encode(canonicalJson(asset.primitives));
        if (asset.resource.transport !== "fetch" || asset.resource.mediaType !== "application/json" || asset.resource.bytes !== bytes.byteLength
          || asset.resource.sha256 !== canonicalJsonSha256(asset.primitives)) {
          throw new RangeError("Prepared geometry resource must bind the exact canonical validated primitives.");
        }
        const previous = resources.get(asset.resource.name);
        if (previous !== undefined && canonicalJson(previous) !== canonicalJson(asset.resource)) throw new RangeError("Geometry resource names must identify exact immutable bytes.");
        resources.set(asset.resource.name, asset.resource);
      }
    }
    if (asset.kind === "lut") {
      if (activeEffects === undefined || !activeEffects.document.renderPlan.postProcess?.steps.some(step => step.kind === "lut-grade" && step.assetId === asset.assetId)) {
        throw new RangeError(`Prepared LUT ${asset.assetId} does not bind an active lut-grade step.`);
      }
      const size = asset.height;
      if (asset.width !== size * size || size < 2 || size > 256) {
        throw new RangeError(`Prepared LUT ${asset.assetId} must be an s²×s strip image encoding an s³ grid, with 2 ≤ s ≤ 256.`);
      }
      bindTexture(asset);
      lutBindings.set(asset.assetId, { resourceName: asset.resource.name, size });
      usedPrepared.add(key);
      continue;
    }
    if (asset.kind === "particle-instances") {
      if (activeEffects === undefined || asset.resource.transport !== "fetch" || asset.resource.mediaType !== "application/octet-stream"
        || asset.resource.bytes !== asset.instanceCount * asset.strideBytes
        || !request.snapshots.some(snapshot => snapshot.timeUs === asset.timeUs)
        || !activeEffects.document.particleSystems.some(binding => binding.systemSha256 === asset.systemSha256 && binding.system.entityId === asset.entityId)) {
        throw new RangeError("Prepared particle instances must bind an active system, exact sample, fixed layout, and immutable binary resource.");
      }
      const previous = resources.get(asset.resource.name);
      if (previous !== undefined && canonicalJson(previous) !== canonicalJson(asset.resource)) throw new RangeError("Particle resource names must identify exact immutable bytes.");
      particles.set(key, asset);
      resources.set(asset.resource.name, asset.resource);
      usedPrepared.add(key);
    }
    if (asset.kind === "splat") {
      const expected = spatialSpzAllocationBounds(asset.facts.splats, asset.resource.bytes, asset.facts.decompressedBytes);
      if (asset.resource.mediaType !== "application/octet-stream" || asset.resource.bytes < 18 || expected.gpuBytesBound !== asset.facts.gpuBytesBound || expected.hostBytesBound !== asset.facts.hostBytesBound) throw new RangeError("Prepared SPZ allocation or binary resource evidence is invalid.");
      const previous = splatResources.get(asset.resource.name);
      const declared = resources.get(asset.resource.name);
      if ((previous !== undefined && canonicalJson(previous) !== canonicalJson(asset.resource))
        || (declared !== undefined && canonicalJson(declared) !== canonicalJson(asset.resource))) throw new RangeError("Splat resource names must identify exact immutable bytes.");
      splatResources.set(asset.resource.name, asset.resource);
      splats.set(key, asset);
      // Object-ID lowers only the bounding-box proxy: the SPZ payload is never
      // declared, served, decoded, or allocated for that mode.
      if (request.mode.kind === "beauty") resources.set(asset.resource.name, asset.resource);
    }
  }
  if (activeEffects !== undefined) {
    for (const binding of activeEffects.document.particleSystems) {
      for (const snapshot of request.snapshots) {
        const key = `${binding.systemSha256}:${binding.system.entityId}:${snapshot.timeUs}`;
        if (!particles.has(key)) throw new RangeError(`Particle system ${binding.system.entityId} has no exact prepared buffer at ${snapshot.timeUs}.`);
      }
    }
    for (const step of effectSteps) {
      if (step.kind === "lut-grade" && !lutBindings.has(step.assetId)) {
        throw new RangeError(`lut-grade step has no exact prepared LUT for ${step.assetId}.`);
      }
    }
  }
  /** Screen-space velocity derives from exact per-sample transforms; the first frame of a batch falls back to its leading snapshot, then to zero motion. */
  const previousModelMatrix = (entityId: string, currentWorld: Mat4, previousSnapshot: EvaluatedSpatialScene | undefined, local?: Mat4, previousLocal?: Mat4): Mat4 => {
    const world = previousSnapshot === undefined ? currentWorld
      : previousSnapshot.entities.find(entry => entry.entity.entityId === entityId)?.worldMatrix ?? currentWorld;
    return local === undefined ? world : multiplyTransforms(world, previousLocal ?? local);
  };
  const previousPrimitiveMatrix = (baseKey: string, primitive: number, previousTimeUs: number | undefined, fallback: Mat4): Mat4 => {
    if (previousTimeUs === undefined) return fallback;
    const asset = prepared.get(`${baseKey}:${previousTimeUs}`);
    return asset?.kind === "geometry" && asset.primitives[primitive] !== undefined ? asset.primitives[primitive].matrix : fallback;
  };
  const frameEvidence: Array<{
    readonly sceneSha256: string; readonly stateSha256: string; readonly viewSha256: string; readonly timeUs: number;
    readonly camera: SpatialCamera;
    readonly objects: ReadonlyArray<{ readonly entityId: string; readonly selectionId: number; readonly representation: string; readonly placement: "world" | "view"; readonly assetManifestSha256?: string }>;
  }> = [];
  const frames = request.snapshots.map((snapshot: EvaluatedSpatialScene, snapshotIndex: number) => {
    const previousSnapshot = snapshotIndex > 0 ? request.snapshots[snapshotIndex - 1]! : request.previousSnapshot;
    if (snapshot.fog?.kind === "height") unsupported("height-fog", "Height-dependent fog is not representable by Three FogExp2; use linear fog until a qualified height-fog lowering exists.");
    if (snapshot.camera.projection.width !== width || snapshot.camera.projection.height !== height) {
      throw new RangeError("A spatial overlay batch requires identical calibrated output dimensions.");
    }
    const manifests = new Map(snapshot.assets.map(asset => [asset.assetId, asset]));
    const manifestDigests = spatialAssetClosureDigests(snapshot.assets);
    if (manifests.size !== snapshot.assets.length) throw new RangeError("Snapshot asset IDs must be unique.");
    const ids = new Set<string>();
    const selections = new Set<number>();
    const objects: (LoweredMesh | LoweredLight | LoweredSplat | LoweredEnvironment)[] = [];
    const evidence: Array<{ entityId: string; selectionId: number; representation: string; placement: "world" | "view"; assetManifestSha256?: string }> = [];
    const bindAsset = (assetId: string, key: string): PreparedSpatialAsset => {
      const manifest = manifests.get(assetId);
      if (manifest === undefined) throw new RangeError(`Snapshot has no manifest for ${assetId}.`);
      const asset = prepared.get(key);
      if (asset === undefined) unsupported(`prepare-${manifest.interpretation.kind}`, `No exact prepared representation for ${key}.`);
      if (asset.kind === "particle-instances") throw new RangeError(`Prepared particle binding cannot substitute scene asset ${assetId}.`);
      if (asset.assetManifestSha256 !== manifestDigests[assetId]) {
        throw new RangeError(`Prepared asset manifest identity is stale for ${assetId}.`);
      }
      usedPrepared.add(key);
      return asset;
    };
    for (const entry of [...snapshot.entities].sort((a, b) => a.selectionId - b.selectionId)) {
      const entity = entry.entity;
      if (ids.has(entity.entityId) || selections.has(entry.selectionId)) throw new RangeError("Snapshot entity and selection IDs must be unique.");
      ids.add(entity.entityId); selections.add(entry.selectionId);
      invertTransform(entry.worldMatrix);
      if (entity.kind === "splat") {
        const key = `${entity.assetId}:${entity.entityId}:splat`;
        if (request.mode.kind === "beauty") {
          if (request.executionProfile !== "three-spark-webgl2-hardware-v1") unsupported("splat-profile", "Splat rendering requires the explicit Three/Spark hardware profile.");
          if (entity.placement.kind !== "world" || snapshot.camera.projection.kind !== "perspective") unsupported("splat-camera", "The initial Spark profile requires world placement and a perspective camera.");
          const preparedSplat = bindAsset(entity.assetId, key), manifest = manifests.get(entity.assetId)!;
          if (preparedSplat.kind !== "splat" || manifest.interpretation.kind !== "splat" || manifest.interpretation.format !== "spz" || preparedSplat.resource.sha256 !== manifest.payload.sha256 || preparedSplat.resource.bytes !== manifest.payload.bytes) throw new RangeError("Splat resource does not match the exact source payload.");
          const m = entry.worldMatrix, lengths = [Math.hypot(m[0]!, m[1]!, m[2]!), Math.hypot(m[4]!, m[5]!, m[6]!), Math.hypot(m[8]!, m[9]!, m[10]!)];
          if (Math.max(...lengths) - Math.min(...lengths) > Math.max(...lengths) * 1e-6) unsupported("splat-transform", "The initial Spark profile requires uniform world scale.");
          for (const [left, right] of [[0, 4], [0, 8], [4, 8]] as const) if (Math.abs(m[left]! * m[right]! + m[left + 1]! * m[right + 1]! + m[left + 2]! * m[right + 2]!) > lengths[0]! ** 2 * 1e-6) unsupported("splat-transform", "The initial Spark profile does not accept sheared world transforms.");
          if (entry.visible) objects.push({ kind: "splat", entityId: entity.entityId, key, matrix: multiplyTransforms(entry.worldMatrix, spatialSplatContentTransform(manifest.interpretation)) });
          evidence.push({ entityId: entity.entityId, selectionId: entry.selectionId, representation: "spz-static-radiance; authored-wrapper-id; no-depth-or-object-id", placement: "world", assetManifestSha256: preparedSplat.assetManifestSha256 });
          continue;
        }
        if (request.mode.kind !== "object-id" && request.mode.kind !== "motion") unsupported("splat-aov", "Splat axial-depth is unsupported; retained colliders are approximate evidence, not pixel truth.");
        // Object-ID and motion lower the splat's bounding-box proxy under its
        // normal selection code — approximate coverage, never splat pixel
        // truth. The box derives from the prepared decoded-position bounds, so
        // a splat without trusted bounds has no representation to bind.
        const preparedSplat = bindAsset(entity.assetId, key), manifest = manifests.get(entity.assetId)!;
        if (preparedSplat.kind !== "splat" || manifest.interpretation.kind !== "splat" || manifest.interpretation.format !== "spz" || preparedSplat.resource.sha256 !== manifest.payload.sha256 || preparedSplat.resource.bytes !== manifest.payload.bytes) throw new RangeError("Splat resource does not match the exact source payload.");
        if (entry.visible && entity.placement.kind === "world") {
          const bounds = preparedSplat.bounds;
          const center: [number, number, number] = [(bounds.min[0] + bounds.max[0]) / 2, (bounds.min[1] + bounds.max[1]) / 2, (bounds.min[2] + bounds.max[2]) / 2];
          const size: [number, number, number] = [bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]];
          const material: Material = { kind: "unlit", color: "#ffffff", opacity: 1 };
          assertCoverage(request.mode, material, undefined);
          const proxyLocal = composeTransform({ position: center, rotation: [0, 0, 0, 1], scale: [1, 1, 1] });
          objects.push({ kind: "mesh", entityId: entity.entityId, selectionId: entry.selectionId,
            matrix: multiplyTransforms(entry.worldMatrix, proxyLocal),
            ...(needsVelocity ? { previousMatrix: previousModelMatrix(entity.entityId, entry.worldMatrix, previousSnapshot, proxyLocal) } : {}),
            placement: entity.placement, geometry: { kind: "box", size }, material,
            uvScale: [1, 1], uvOffset: [0, 0], surfaceScale: [1, 1], flipViewUv: false, doubleSided: true, alphaCutoff: 0 });
          evidence.push({ entityId: entity.entityId, selectionId: entry.selectionId, representation: SPATIAL_SPLAT_PROXY_REPRESENTATION, placement: "world", assetManifestSha256: preparedSplat.assetManifestSha256 });
        }
        continue;
      }
      if (entity.kind === "group") continue;
      if (entity.kind === "light") {
        if (entity.placement.kind !== "world") unsupported("view-light", "Lights require world placement.");
        if (entry.visible) objects.push({
          kind: "light", entityId: entity.entityId, matrix: entry.worldMatrix, light: entity.light, color: entity.color, intensity: entity.intensity,
          ...(entity.spot === undefined ? {} : { spot: entity.spot }),
          ...(entity.shadow === undefined ? {} : { shadow: entity.shadow }),
        });
        continue;
      }
      if (entity.kind === "environment") {
        // The equirect raster is bound for every frame even when hidden: the
        // prepared batch and auxiliary passes must see identical bindings.
        const key = `${entity.assetId}:${entity.entityId}:static`;
        const asset = bindAsset(entity.assetId, key);
        if (asset.kind !== "raster" || manifests.get(entity.assetId)!.interpretation.kind !== "image") {
          unsupported("prepared-environment-kind", "Environment entities require a prepared image raster.");
        }
        bindTexture(asset);
        if (entry.visible) objects.push({ kind: "environment", entityId: entity.entityId, textureName: asset.resource.name,
          rotation: entity.transform.rotation, intensity: entity.intensity, role: entity.role });
        continue;
      }
      // Capability checks include invisible/off-camera entities, so changing
      // visibility or cameras cannot discover an unplanned loader during render.
      const base = { kind: "mesh" as const, entityId: entity.entityId, selectionId: entry.selectionId, matrix: entry.worldMatrix, placement: entity.placement,
        ...(needsVelocity ? { previousMatrix: previousModelMatrix(entity.entityId, entry.worldMatrix, previousSnapshot) } : {}),
        ...(entity.kind === "mesh" && entity.castShadow !== undefined ? { castShadow: entity.castShadow } : {}),
        ...(entity.kind === "mesh" && entity.receiveShadow !== undefined ? { receiveShadow: entity.receiveShadow } : {}) };
      const unitFit = { uvScale: [1, 1] as const, uvOffset: [0, 0] as const, surfaceScale: [1, 1] as const, flipViewUv: false, doubleSided: true, alphaCutoff: 0 };
      let meshes: LoweredMesh[];
      let representation: string;
      let assetManifestSha256: string | undefined;
      if (entity.kind === "mesh") {
        if (entity.geometry.kind === "asset") {
          const baseKey = `${entity.geometry.assetId}:${entity.entityId}:${entity.geometry.nodeIndex === undefined ? "all" : String(entity.geometry.nodeIndex)}`;
          const timedKey = `${baseKey}:${String(snapshot.timeUs)}`;
          const key = prepared.has(timedKey) ? timedKey : `${baseKey}:static`;
          const asset = bindAsset(entity.geometry.assetId, key);
          if (asset.kind !== "geometry" || manifests.get(asset.assetId)!.interpretation.kind !== "gltf") {
            unsupported("prepared-geometry-kind", "Asset meshes require prepared glTF geometry.");
          }
          if (asset.entityGeometrySha256 !== spatialGeometryContentSha256(entity) || (entity.geometry.clip !== undefined && asset.timeUs !== snapshot.timeUs)) {
            throw new RangeError("Prepared geometry must bind the exact entity geometry, material policy, clip, and sample time.");
          }
          assetManifestSha256 = asset.assetManifestSha256;
          representation = asset.timeUs === null ? "prepared-static-triangle-mesh" : "prepared-evaluated-triangle-mesh";
          const materialMode = entity.geometry.materialMode;
          meshes = asset.primitives.map((primitive, index) => {
            const sourceTextureSlots = ["normalTexture", "metallicRoughnessTexture", "occlusionTexture", "emissiveTexture", "clearcoatTexture", "clearcoatRoughnessTexture", "clearcoatNormalTexture", "transmissionTexture", "sheenColorTexture", "sheenRoughnessTexture", "anisotropyTexture"] as const;
            if (primitive.texture !== undefined) bindTexture(primitive.texture);
            for (const slot of sourceTextureSlots) if (primitive[slot] !== undefined) bindTexture(primitive[slot]);
            const material = primitive.material ?? entity.material;
            if (materialMode === "source" && primitive.material === undefined) throw new RangeError("Source-material geometry requires the exact resolved source material for every primitive.");
            if (materialMode !== "source" && (primitive.material !== undefined || primitive.texture !== undefined || primitive.linearColor !== undefined)) {
              throw new RangeError("Entity-material meshes must not receive source material or texture overrides.");
            }
            assertCoverage(request.mode, material, primitive.texture, primitive.alphaMode);
            return { ...base, ...unitFit, geometry: { kind: "prepared", key, primitive: index }, material,
              ...(needsVelocity ? { previousMatrix: previousModelMatrix(entity.entityId, entry.worldMatrix, previousSnapshot, primitive.matrix,
                previousPrimitiveMatrix(baseKey, index, previousSnapshot?.timeUs, primitive.matrix)) } : {}),
              doubleSided: primitive.doubleSided ?? true, alphaCutoff: primitive.alphaCutoff ?? 0,
              ...(primitive.alphaMode === undefined ? {} : { alphaMode: primitive.alphaMode }),
              ...(primitive.linearColor === undefined ? {} : { linearColor: primitive.linearColor }),
              ...(primitive.physical === undefined ? {} : { sourcePhysical: primitive.physical }),
              ...(sourceTextureSlots.every(slot => primitive[slot] === undefined) ? {} : { sourceTextures: Object.fromEntries(sourceTextureSlots.flatMap(slot => primitive[slot] === undefined ? [] : [[slot, { name: primitive[slot]!.resource.name, ...(primitive[slot]!.uvTransform === undefined ? {} : { uvTransform: primitive[slot]!.uvTransform }) }]])) }),
              ...(primitive.texture === undefined ? {} : { textureName: primitive.texture.resource.name, textureAlpha: primitive.texture.alpha,
                textureOptions: { ...(primitive.texture.flipY === undefined ? {} : { flipY: primitive.texture.flipY }),
                  ...(primitive.texture.sampler === undefined ? {} : { sampler: primitive.texture.sampler }), ...(primitive.texture.uvTransform === undefined ? {} : { uvTransform: primitive.texture.uvTransform }) } }) };
          });
        } else {
          let mapRaster: PreparedRaster | undefined;
          const materialMap = entity.material.kind !== "pbr" ? entity.material.map : undefined;
          const pbrTextures: Record<string, string> = {};
          const mapIds = entity.material.kind === "pbr" ? pbrMaterialMapAssetIds(entity.material) : materialMap === undefined ? [] : [materialMap];
          let mapDimensions: readonly [number, number] | undefined;
          for (const mapId of mapIds) {
            const key = `${mapId}:${entity.entityId}:static`;
            const asset = bindAsset(mapId, key);
            if (asset.kind !== "raster" || manifests.get(mapId)!.interpretation.kind !== "image") unsupported("prepared-material-map", "Material maps require a prepared image raster.");
            bindTexture(asset);
            const dimensions = [asset.width, asset.height] as const;
            if (mapDimensions !== undefined && (dimensions[0] !== mapDimensions[0] || dimensions[1] !== mapDimensions[1])) throw new RangeError("PBR maps must have identical decoded dimensions.");
            mapDimensions = dimensions;
            if (entity.material.kind === "pbr") {
              pbrTextures[mapId] = asset.resource.name;
              if (entity.material.baseColorMap?.assetId === mapId) mapRaster = asset;
            } else mapRaster = asset;
            assetManifestSha256 = asset.assetManifestSha256;
          }
          assertCoverage(request.mode, entity.material, mapRaster);
          representation = `primitive-${entity.geometry.kind}${mapIds.length === 0 ? "" : "-textured"}`;
          meshes = [{ ...base, ...unitFit, geometry: entity.geometry, material: entity.material,
            ...(Object.keys(pbrTextures).length === 0 ? {} : { pbrTextures }),
            ...(mapRaster === undefined ? {} : { textureName: mapRaster.resource.name, textureAlpha: mapRaster.alpha }) }];
        }
      } else {
        const assetId = entity.kind === "text" ? entity.fontAssetId : entity.assetId;
        const timedKey = `${assetId}:${entity.entityId}:${String(snapshot.timeUs)}`;
        const key = prepared.has(timedKey) ? timedKey : `${assetId}:${entity.entityId}:static`;
        const asset = bindAsset(assetId, key);
        if (asset.kind !== "raster") unsupported("prepared-raster-kind", "Image, diagram, video, and text entities require prepared raster surfaces.");
        const expected = entity.kind === "text" ? "font" : entity.kind;
        if (manifests.get(assetId)!.interpretation.kind !== expected) throw new RangeError(`Prepared surface asset kind does not match ${entity.kind}.`);
        if (entity.kind === "video" && (asset.timeUs !== snapshot.timeUs || asset.sourceTimeUs === undefined || asset.entityContentSha256 !== spatialVideoRasterContentSha256(entity))) {
          unsupported("video-exact-frame", "Video surfaces require a prepared frame with exact snapshot time and source timestamp.");
        }
        if (entity.kind === "text" && asset.entityContentSha256 !== spatialTextRasterContentSha256(entity)) {
          throw new RangeError("Prepared text raster must bind the exact text, font, size, width, and alignment.");
        }
        bindTexture(asset);
        assetManifestSha256 = asset.assetManifestSha256;
        representation = `prepared-${entity.kind}-raster`;
        const surfaceWidth = entity.width;
        const surfaceHeight = entity.kind === "text" ? surfaceWidth * asset.height / asset.width : entity.height;
        const material: Material = { kind: "unlit", color: entity.kind === "text" ? entity.color : "#ffffff", opacity: entity.kind === "text" ? 1 : entity.opacity };
        assertCoverage(request.mode, material, asset);
        meshes = [{ ...base, geometry: { kind: "plane", width: surfaceWidth, height: surfaceHeight }, material,
          textureName: asset.resource.name, textureAlpha: asset.alpha, ...fitSurface(surfaceWidth, surfaceHeight, asset, entity.kind === "text" ? "stretch" : entity.fit),
          flipViewUv: entity.placement.kind === "view", doubleSided: true, alphaCutoff: 0 }];
      }
      if (!entry.visible || (entity.placement.kind === "view" && entity.placement.cameraId !== snapshot.camera.cameraId)) continue;
      objects.push(...meshes);
      evidence.push({ entityId: entity.entityId, selectionId: entry.selectionId, representation, placement: entity.placement.kind,
        ...(assetManifestSha256 === undefined ? {} : { assetManifestSha256 }) });
    }
    const frameParticles = activeEffects?.document.particleSystems.flatMap(binding => {
      const target = snapshot.entities.find(entry => entry.entity.entityId === binding.system.entityId);
      if (target === undefined) throw new RangeError(`Particle system target ${binding.system.entityId} is absent from the evaluated scene.`);
      if (target.entity.placement.kind !== "world") unsupported("particle-placement", "Particle systems require world-placed target entities.");
      const key = `${binding.systemSha256}:${binding.system.entityId}:${snapshot.timeUs}`;
      const preparedInstances = particles.get(key)!;
      return target.visible && preparedInstances.instanceCount > 0 ? [{ key, entityId: binding.system.entityId, matrix: target.worldMatrix,
        ...(needsVelocity ? { previousMatrix: previousModelMatrix(binding.system.entityId, target.worldMatrix, previousSnapshot) } : {}) }] : [];
    }) ?? [];
    if (objects.reduce((count, object) => count + (object.kind === "environment" ? 1 : 0), 0) > 1) {
      throw new RangeError("A frame may show at most one visible environment entity; gate alternates through authored visibility.");
    }
    const meshes = objects.filter((object): object is LoweredMesh => object.kind === "mesh");
    // Transparency sorting is a Spark beauty-pipeline constraint; object-ID
    // proxies draw as ordinary opaque-coded meshes and never invoke it.
    if (request.mode.kind === "beauty" && splats.size > 0 && meshes.some(mesh => mesh.placement.kind === "world" && (mesh.material.opacity < 1 || mesh.alphaMode === "BLEND" || mesh.textureAlpha === "straight" && mesh.alphaCutoff === 0))) unsupported("splat-transparency", "The initial world profile supports opaque 3D meshes and view overlays; interleaved transparent mesh/splat sorting is not qualified.");
    const triangles = meshes.reduce((sum, mesh) => sum + geometryTriangleCount(mesh, geometries), 0);
    if (meshes.length > SPATIAL_OVERLAY_LIMITS.drawCallsPerFrame || triangles > SPATIAL_OVERLAY_LIMITS.trianglesPerFrame) {
      throw new RangeError("Spatial overlay exceeds its per-frame draw-call or triangle budget.");
    }
    if (request.mode.kind === "motion") {
      const entityId = request.mode.entityId;
      if (!meshes.some(mesh => mesh.entityId === entityId) && !frameParticles.some(item => item.entityId === entityId)) {
        throw new RangeError(`Motion target ${entityId} has no renderable velocity representation at ${snapshot.timeUs}.`);
      }
    }
    frameEvidence.push({ sceneSha256: snapshot.sceneSha256, stateSha256: snapshot.stateSha256, viewSha256: snapshot.viewSha256,
      timeUs: snapshot.timeUs, camera: snapshot.camera, objects: evidence });
    return { camera: calibratedCamera(snapshot.camera), timeUs: snapshot.timeUs,
      ...(needsVelocity ? { previousCamera: previousSnapshot === undefined ? calibratedCamera(snapshot.camera) : calibratedCamera(previousSnapshot.camera) } : {}),
      objects, particles: frameParticles, ...(snapshot.fog === undefined ? {} : { fog: snapshot.fog }) };
  });
  if (usedPrepared.size !== prepared.size) throw new RangeError("Prepared assets must be referenced by this exact batch; unused bindings are rejected.");
  const declaredResources = HtmlOverlayDeclaredResourcesSchema.parse([...resources.values()]);
  const decodedTexturePixels = [...textures.values()].reduce((sum, texture) => sum + texture.width * texture.height, 0);
  if (decodedTexturePixels > SPATIAL_OVERLAY_LIMITS.decodedTexturePixels) throw new RangeError("Prepared textures exceed the decoded pixel budget.");
  // Spark's SPZ decoder does not forward the header training flag. Its two
  // renderer-global covariance terms therefore must be bound explicitly. The
  // initial profile admits only non-AA training: add covariance without opacity
  // compensation, rather than applying the AA-trained blur a second time.
  // https://github.com/sparkjsdev/spark/blob/v2.1.0/src/SparkRenderer.ts#L115-L132
  const splatKernel = { antialiased: false, preBlurAmount: 0.3, blurAmount: 0 };
  const payload = {
    mode: request.mode,
    frames,
    ...(activeEffects === undefined ? {} : { effects: {
      documentSha256: activeEffects.documentSha256,
      renderPlanSha256: activeEffects.document.renderPlanSha256,
      steps: effectSteps.map(step => step.kind === "lut-grade" ? { ...step, lut: lutBindings.get(step.assetId)! } : step),
    } }),
    geometry: Object.fromEntries([...geometries].filter(([, asset]) => asset.resource === undefined).map(([key, asset]) => [key, asset.primitives])),
    geometryResources: [...geometries].filter(([, asset]) => asset.resource !== undefined).map(([key, asset]) => ({ key, resource: asset.resource!, url: htmlOverlayAssetLocalUrl(asset.resource!) })),
    particleBuffers: [...particles].map(([key, asset]) => ({ key, instanceCount: asset.instanceCount, resource: asset.resource, strideBytes: asset.strideBytes, url: htmlOverlayAssetLocalUrl(asset.resource) })),
    textures: declaredResources.filter(resource => textures.has(resource.name)).map(resource => ({ ...textures.get(resource.name)!, name: resource.name, url: htmlOverlayAssetLocalUrl(resource) })),
    ...(request.executionProfile === "three-spark-webgl2-hardware-v1" ? { splatKernel, splats: [...splats].map(([key, asset]) => ({ key, ...asset, url: htmlOverlayAssetLocalUrl(asset.resource) })) } : {}),
  };
  const totalSplats = [...splats.values()].reduce((sum, asset) => sum + asset.facts.splats, 0);
  // 32 B/pixel conservatively covers the RGBA16F/depth beauty target and the
  // default RGBA8/depth canvas plus renderer framebuffer slack. Driver/process
  // and platform compositor overhead remain outside this allocation accounting.
  // The bound guards Spark's beauty allocations only — object-ID proxies never
  // load or allocate splat payloads.
  if (request.mode.kind === "beauty" && splats.size > 0 && (totalSplats > SPATIAL_SPLAT_LIMITS.splats || [...splats.values()].reduce((sum, asset) => sum + asset.facts.gpuBytesBound, width * height * 32) > SPATIAL_SPLAT_LIMITS.gpuBytes || [...splats.values()].reduce((sum, asset) => sum + asset.facts.hostBytesBound, 0) > SPATIAL_SPLAT_LIMITS.hostBytes)) throw new RangeError("Prepared world exceeds its aggregate splat/GPU/host allocation bounds.");
  const sparkProfile = request.executionProfile === "three-spark-webgl2-hardware-v1";
  if (sparkProfile && request.mode.kind !== "beauty") unsupported("splat-aov", "The initial Spark profile renders beauty only.");
  const libraries = sparkProfile ? ["@sparkjsdev/spark", "three", "three/addons/postprocessing/Pass.js"] as const : ["three"] as const;
  let html = spatialDocument(escapeEmbeddedJson(payload));
  if (sparkProfile) html = addSpatialSplatRuntime(html.replace(serializeHtmlOverlayImportMap(["three"]), serializeHtmlOverlayImportMap(libraries)));
  const authoring = HtmlOverlayAuthoringInputSchema.parse({
    kind: "slopcamera.html-overlay", schemaVersion: 1, canvas: { width, height, deviceScaleFactor: 1 },
    html, libraries, parameters: {}, resources: declaredResources, seed: 0,
    timing: { fps: 1, durationUs: frames.length * 1_000_000 },
  });
  const preparation: Array<{
    key: string; assetManifestSha256?: string; instanceCount?: number; resourceSha256?: string; systemSha256?: string; timeUs?: number;
    sourceTimeUs?: number; sourceFrameIndex?: number; sourcePresentationTimeUs?: number; sourcePts?: number;
    sourceTimeBase?: { numerator: string; denominator: string }; sourceTimestamp?: string; sourceExactTimeUs?: { numerator: string; denominator: string };
  }> = request.preparedAssets.map(asset => asset.kind === "particle-instances" ? {
    key: preparedKey(asset), instanceCount: asset.instanceCount, resourceSha256: asset.resource.sha256,
    systemSha256: asset.systemSha256, timeUs: asset.timeUs,
  } : { key: preparedKey(asset), assetManifestSha256: asset.assetManifestSha256,
    ...(asset.kind === "raster" && asset.sourceTimeUs !== undefined ? { sourceTimeUs: asset.sourceTimeUs } : {}),
    ...(asset.kind === "raster" && asset.sourceFrameIndex !== undefined ? { sourceFrameIndex: asset.sourceFrameIndex } : {}),
    ...(asset.kind === "raster" && asset.sourcePresentationTimeUs !== undefined ? { sourcePresentationTimeUs: asset.sourcePresentationTimeUs } : {}),
    ...(asset.kind === "raster" && asset.sourcePts !== undefined ? { sourcePts: asset.sourcePts } : {}),
    ...(asset.kind === "raster" && asset.sourceTimeBase !== undefined ? { sourceTimeBase: asset.sourceTimeBase } : {}),
    ...(asset.kind === "raster" && asset.sourceTimestamp !== undefined ? { sourceTimestamp: asset.sourceTimestamp } : {}),
    ...(asset.kind === "raster" && asset.sourceExactTimeUs !== undefined ? { sourceExactTimeUs: asset.sourceExactTimeUs } : {}),
  });
  const metadataValue = {
    kind: "slopcamera.spatial-overlay-batch", schemaVersion: 1,
    renderer: "three-webgl2-snapshot-v1", mode: request.mode,
    ...(request.effects === undefined ? {} : { effects: {
      applied: activeEffects !== undefined,
      documentSha256: request.effects.documentSha256,
      renderPlanSha256: request.effects.document.renderPlanSha256,
      stepKinds: request.effects.document.renderPlan.postProcess?.steps.map(step => step.kind) ?? [],
      ...(activeEffects === undefined ? {} : { postProcess: {
        pipeline: "ordered-fullscreen-passes; premultiplied-linear-half-float-source; straight-alpha-working-domain; srgb-premultiplied-output",
        ...(lutBindings.size === 0 ? {} : { lutDomain: "linear-clamped-0..1; strip-s2-by-s-3d-lut; two-slice-linear",
          luts: Object.fromEntries([...lutBindings].map(([assetId, binding]) => [assetId, binding])) }),
        ...(needsDepth ? { depthSource: "beauty-depth-buffer; world-surfaces-only; view-overlays-unchanged" } : {}),
        ...(needsVelocity ? { velocitySource: "per-sample-rigid-transform-delta; previous-sample-or-leading-snapshot; first-sample-zero" } : {}),
      } }),
    } }),
    ...(request.mode.kind === "motion" ? { motion: {
      entityId: request.mode.entityId, motionScale: request.mode.motionScale,
      encoding: "rg16un; R,G=x hi/lo; B,A=y hi/lo; alpha=hit",
      source: "per-sample-rigid-transform-delta; previous-sample-or-leading-snapshot; first-sample-zero",
      packing: "velocity_px/motionScale*0.5+0.5 clamped to [0,1]; 16-bit unsigned per axis",
    } } : {}),
    ...(request.executionProfile === undefined ? {} : { executionProfile: request.executionProfile }),
    ...(sparkProfile ? { splatProfile: { adapter: "spark-2.1.0-spz-v2-v3-ext-v1", kernel: splatKernel, lod: false, sorting: "await-explicit-camera-update", readback: "synchronous-exact-MRT-buffer-before-worker-sort", color: "srgb-radiance-to-linear", depth: "unsupported", objectId: "unsupported", collider: "approximate-retained-only", splats: totalSplats } } : {}),
    frameRate: request.frameRate,
    transport: { kind: "frame-index-only", fps: 1, frameCount: frames.length },
    color: request.mode.kind === "beauty"
      ? { source: "srgb", working: "linear-srgb", compositing: "linear-half-float-premultiplied", output: "srgb", alpha: "straight-png", toneMapping: "none" }
      : { source: "rgba8-data", working: "rgba8-data", output: "rgba8-data", alpha: "binary-validity", toneMapping: "none" },
    ...(request.mode.kind === "beauty" ? { shadows: SPATIAL_SHADOW_POLICY } : {}),
    rasterization: { antialias: false, sampling: "single-pixel-center", surfaces: "authored-primitives-double-sided; prepared-mesh-explicit-sidedness", transparentOrdering: "three-object-sort" },
    selectionEncoding: { channels: "RGB-big-endian-uint24", noHit: [0, 0, 0, 0] },
    depthEncoding: {
      channels: "RGB-big-endian-uint24", noHit: [0, 0, 0, 0], validAlpha: 255,
      formula: "near + (code - 1) / 16777214 * (far - near)", units: "positive-camera-axial-meters",
      viewSurfaces: "mask-to-no-hit", quantizationSteps: 16_777_214,
      toleranceMeters: frameEvidence.map(frame => Math.max(2 * (frame.camera.projection.far - frame.camera.projection.near) / 16_777_214, frame.camera.projection.far * 2 ** -20, 1e-6)),
    },
    cameraConvention: "camera-to-world; column-major; XYZW; local-minus-Z; top-left-image-boundary; pixel-centers-i+0.5,j+0.5",
    viewConvention: "top-left-image-boundary; X-right,Y-down; normalized-XY-scaled-by-output-dimensions; order-after-world",
    preparation,
    costs: { requestBytes: captured.bytes, htmlBytes: new TextEncoder().encode(html).byteLength,
      decodedTexturePixels, resourceBytes: declaredResources.reduce((sum, resource) => sum + resource.bytes, 0),
      note: sparkProfile ? "One isolated browser per batch; retained SPZ sources load once, each exact camera sample awaits full-resolution sort. Admission bounds are not measured GPU performance." : "Each batch uses one isolated browser render; scenes and frame-local GPU objects are rebuilt for every selected snapshot. These are admission counts, not measured GPU performance." },
    frames: frameEvidence,
  };
  const metadata = createBoundedJsonSnapshot(metadataValue, SPATIAL_OVERLAY_LIMITS.requestBytes, "Spatial overlay metadata");
  return Object.freeze({ authoring: Object.freeze(authoring), metadata: metadata.value as unknown as DeepReadonly<typeof metadataValue>, metadataSha256: metadata.sha256 });
}

/** Fixed golden-spiral gather taps; computed on the host so generated shaders contain no transcendentals. */
const DOF_TAPS = Object.freeze(Array.from({ length: 16 }, (_, index) => {
  const angle = index * 2.399_963_229_728_653;
  const radius = Math.sqrt((index + 0.5) / 16);
  return `vec2(${(Math.cos(angle) * radius).toFixed(7)},${(Math.sin(angle) * radius).toFixed(7)})`;
}).join(","));
const BLOOM_WEIGHTS = Object.freeze([0.2270270270, 0.1945945946, 0.1216216216, 0.0540540541, 0.0162162162].map(weight => weight.toFixed(10)).join(","));

function spatialDocument(payload: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}canvas{display:block;width:100%;height:100%}</style>
<script type="importmap">${serializeHtmlOverlayImportMap(["three"])}</script></head><body><canvas></canvas>
<script type="module">
import * as THREE from "three";
const input=${payload};
const canvas=document.querySelector("canvas");
const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:false,premultipliedAlpha:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(1);renderer.setSize(SlopcameraOverlay.width,SlopcameraOverlay.height,false);
renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.NoToneMapping;renderer.autoClear=false;renderer.shadowMap.enabled=input.mode.kind==="beauty";renderer.shadowMap.type=THREE.PCFSoftShadowMap;
${spatialShadowRuntimeSource()}
const mode=input.mode;const postSteps=input.effects?input.effects.steps:[];
const isMotion=mode.kind==="motion";
const needsVelocity=isMotion||postSteps.some(step=>step.kind==="motion-blur");
const needsDepth=postSteps.some(step=>step.kind==="depth-of-field");
const needsBright=postSteps.some(step=>step.kind==="bloom"||step.kind==="flare");
const hasPost=postSteps.length>0;
let beautyTarget=null,velocityTarget=null,postA=null,postB=null,brightA=null,brightB=null,outputScene=null,outputCamera=null,outputGeometry=null,outputMaterial=null,postScene=null,postMesh=null,postOutputMaterial=null;
const resolution=new THREE.Vector2(SlopcameraOverlay.width,SlopcameraOverlay.height);
const postVertex="precision highp float;attribute vec3 position;attribute vec2 uv;varying vec2 sampleUv;void main(){sampleUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}";
const toSrgbFn="vec3 toSrgb(vec3 v){return mix(12.92*v,1.055*pow(max(v,vec3(0.0)),vec3(1.0/2.4))-0.055,step(vec3(0.0031308),v));}";
const postHeader="precision highp float;uniform sampler2D source;uniform vec2 resolution;varying vec2 sampleUv;";
const makePostTarget=(w,h,depth)=>new THREE.WebGLRenderTarget(w,h,{type:THREE.HalfFloatType,format:THREE.RGBAFormat,colorSpace:THREE.LinearSRGBColorSpace,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:depth,stencilBuffer:false});
if(mode.kind==="beauty"||isMotion){
  if(!renderer.extensions.has("EXT_color_buffer_float"))throw new Error("Spatial floating-point passes require renderable half-float color.");
  if(mode.kind==="beauty"){
    beautyTarget=makePostTarget(SlopcameraOverlay.width,SlopcameraOverlay.height,true);
    if(needsDepth){beautyTarget.depthTexture=new THREE.DepthTexture(SlopcameraOverlay.width,SlopcameraOverlay.height);beautyTarget.depthTexture.type=THREE.UnsignedIntType;}
  }
  if(needsVelocity)velocityTarget=makePostTarget(SlopcameraOverlay.width,SlopcameraOverlay.height,true);
  if(hasPost){postA=makePostTarget(SlopcameraOverlay.width,SlopcameraOverlay.height,false);postB=makePostTarget(SlopcameraOverlay.width,SlopcameraOverlay.height,false);}
  if(needsBright){const hw=Math.max(1,SlopcameraOverlay.width>>1),hh=Math.max(1,SlopcameraOverlay.height>>1);brightA=makePostTarget(hw,hh,false);brightB=makePostTarget(hw,hh,false);}
  outputGeometry=new THREE.PlaneGeometry(2,2);
  outputMaterial=new THREE.RawShaderMaterial({depthTest:false,depthWrite:false,blending:THREE.NoBlending,transparent:false,toneMapped:false,dithering:false,
    uniforms:{linearPremultiplied:{value:beautyTarget?beautyTarget.texture:null}},
    vertexShader:postVertex,
    fragmentShader:"precision highp float;uniform sampler2D linearPremultiplied;varying vec2 sampleUv;"+toSrgbFn+"void main(){vec4 c=texture2D(linearPremultiplied,sampleUv);if(c.a<=0.0){gl_FragColor=vec4(0.0);return;}gl_FragColor=vec4(toSrgb(c.rgb/c.a)*c.a,c.a);}",
  });
  postOutputMaterial=new THREE.RawShaderMaterial({depthTest:false,depthWrite:false,blending:THREE.NoBlending,transparent:false,toneMapped:false,dithering:false,
    uniforms:{source:{value:null},resolution:{value:resolution}},vertexShader:postVertex,
    fragmentShader:postHeader+toSrgbFn+"void main(){vec4 c=texture2D(source,sampleUv);gl_FragColor=vec4(toSrgb(max(c.rgb,vec3(0.0)))*c.a,c.a);}",
  });
  outputScene=new THREE.Scene();const outputMesh=new THREE.Mesh(outputGeometry,outputMaterial);outputMesh.frustumCulled=false;outputScene.add(outputMesh);outputCamera=new THREE.Camera();
  postScene=new THREE.Scene();postMesh=new THREE.Mesh(outputGeometry);postMesh.frustumCulled=false;postScene.add(postMesh);
}
const textures=new Map();const particleBuffers=new Map();let disposed=false;let contextFailure=null;
const loseContext=event=>{event.preventDefault();contextFailure=new Error("Spatial WebGL context was lost.");};
canvas.addEventListener("webglcontextlost",loseContext);
const initialization=(async()=>{
  const loadedGeometry=new Map();
  for(const item of input.geometryResources){
    let primitives=loadedGeometry.get(item.resource.sha256);
    if(primitives===undefined){
      const response=await fetch(item.url);if(!response.ok)throw new Error("Prepared geometry resource is unavailable.");
      const bytes=await response.arrayBuffer();
      if(bytes.byteLength!==item.resource.bytes)throw new Error("Prepared geometry resource length changed.");
      const hash=new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));
      const sha256=Array.from(hash,value=>value.toString(16).padStart(2,"0")).join("");
      if(sha256!==item.resource.sha256)throw new Error("Prepared geometry resource digest changed.");
      primitives=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
      loadedGeometry.set(sha256,primitives);
    }
    if(disposed)throw new Error("Spatial renderer was disposed during geometry preparation.");
    input.geometry[item.key]=primitives;
  }
  for(const item of input.particleBuffers){
    const response=await fetch(item.url);if(!response.ok)throw new Error("Prepared particle buffer is unavailable.");
    const bytes=await response.arrayBuffer();
    if(bytes.byteLength!==item.resource.bytes||bytes.byteLength!==item.instanceCount*item.strideBytes)throw new Error("Prepared particle buffer length changed.");
    const hash=new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));
    const sha256=Array.from(hash,value=>value.toString(16).padStart(2,"0")).join("");
    if(sha256!==item.resource.sha256)throw new Error("Prepared particle buffer digest changed.");
    const view=new DataView(bytes);const positions=new Float32Array(item.instanceCount*3);const colors=new Float32Array(item.instanceCount*3);const sizes=new Float32Array(item.instanceCount);const opacity=new Float32Array(item.instanceCount);
    for(let index=0;index<item.instanceCount;index++){const offset=index*item.strideBytes;positions.set([view.getFloat32(offset,true),view.getFloat32(offset+4,true),view.getFloat32(offset+8,true)],index*3);sizes[index]=view.getFloat32(offset+32,true);opacity[index]=view.getFloat32(offset+36,true);colors.set([view.getFloat32(offset+40,true),view.getFloat32(offset+44,true),view.getFloat32(offset+48,true)],index*3);}
    particleBuffers.set(item.key,{colors,opacity,positions,sizes});
  }
  for(const item of input.textures){
    const texture=await new THREE.TextureLoader().loadAsync(item.url);
    if(disposed){texture.dispose();throw new Error("Spatial renderer was disposed during texture preparation.");}
    if(texture.image.width!==item.width||texture.image.height!==item.height){texture.dispose();throw new Error("Prepared raster dimensions changed.");}
    texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=false;
    texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;
    texture.wrapS=THREE.ClampToEdgeWrapping;texture.wrapT=THREE.ClampToEdgeWrapping;
    textures.set(item.name,texture);
  }
})().catch(error=>{for(const texture of textures.values())texture.dispose();textures.clear();throw error;});
SlopcameraOverlay.ready(initialization);
const vertexShader=\`precision highp float;
uniform mat4 projectionMatrix;uniform mat4 modelViewMatrix;
attribute vec3 position;attribute vec2 uv;
varying vec2 surfaceUv;varying float axialDepth;
void main(){vec4 p=modelViewMatrix*vec4(position,1.0);surfaceUv=uv;axialDepth=-p.z;gl_Position=projectionMatrix*p;}\`;
const fragmentShader=\`precision highp float;
uniform sampler2D surfaceMap;uniform bool hasMap;uniform bool textureOpaque;uniform vec2 uvScale;uniform vec2 uvOffset;uniform bool flipViewUv;
uniform float opacity;uniform float threshold;uniform bool isMask;uniform float maskCutoff;uniform vec3 selection;uniform float nearClip;uniform float farClip;uniform int mode;
varying vec2 surfaceUv;varying float axialDepth;
void main(){vec2 uv=surfaceUv;if(flipViewUv)uv.y=1.0-uv.y;uv=uv*uvScale+uvOffset;
float alpha=opacity*(hasMap&&!textureOpaque?texture2D(surfaceMap,uv).a:1.0);if(isMask){if(alpha<maskCutoff)discard;alpha=1.0;}if(alpha<threshold)discard;
if(mode==0){gl_FragColor=vec4(selection,1.0);return;}if(mode==2){gl_FragColor=vec4(0.0);return;}
float code=1.0+floor(clamp((axialDepth-nearClip)/(farClip-nearClip),0.0,1.0)*16777214.0+0.5);
float high=floor(code/65536.0);float middle=floor((code-high*65536.0)/256.0);float low=code-high*65536.0-middle*256.0;
gl_FragColor=vec4(vec3(high,middle,low)/255.0,1.0);}\`;
function makeGeometry(object,track){
  const g=object.geometry;let geometry;
  const displaced=object.material.kind==="pbr"&&object.material.heightMap!==undefined;
  if(g.kind==="box")geometry=new THREE.BoxGeometry(...g.size,...(displaced?[16,16,16]:[1,1,1]));
  else if(g.kind==="sphere")geometry=new THREE.SphereGeometry(g.radius,32,16);
  else if(g.kind==="plane")geometry=new THREE.PlaneGeometry(g.width*object.surfaceScale[0],g.height*object.surfaceScale[1],displaced?32:1,displaced?32:1);
  else if(g.kind==="cylinder")geometry=new THREE.CylinderGeometry(g.radius,g.radius,g.height,32,displaced?16:1);
  else{const p=input.geometry[g.key][g.primitive];geometry=new THREE.BufferGeometry();
    geometry.setAttribute("position",new THREE.Float32BufferAttribute(p.positions,3));
    if(p.normals)geometry.setAttribute("normal",new THREE.Float32BufferAttribute(p.normals,3));
    if(p.uvs)geometry.setAttribute("uv",new THREE.Float32BufferAttribute(p.uvs,2));
    if(p.indices)geometry.setIndex(p.indices);if(!p.normals)geometry.computeVertexNormals();}
  if(geometry.attributes.uv&&!geometry.attributes.uv1)geometry.setAttribute("uv1",geometry.attributes.uv.clone());
  return track(geometry);
}
function makeMaterial(object,frame,track){
  const m=object.material;const originalMap=object.textureName===undefined?null:textures.get(object.textureName);
  const map=originalMap===null?null:track(originalMap.clone());
  if(map){
    const options=object.textureOptions;
    if(options?.flipY!==undefined)map.flipY=options.flipY;
    if(options?.sampler){const s=options.sampler;
      const wraps={33071:THREE.ClampToEdgeWrapping,33648:THREE.MirroredRepeatWrapping,10497:THREE.RepeatWrapping};
      const filters={9728:THREE.NearestFilter,9729:THREE.LinearFilter,9984:THREE.NearestMipmapNearestFilter,9985:THREE.LinearMipmapNearestFilter,9986:THREE.NearestMipmapLinearFilter,9987:THREE.LinearMipmapLinearFilter};
      map.wrapS=wraps[s.wrapS];map.wrapT=wraps[s.wrapT];map.magFilter=filters[s.magFilter??9729];map.minFilter=filters[s.minFilter??9987];map.generateMipmaps=(s.minFilter??9987)>=9984;
    }if(options?.uvTransform){map.offset.fromArray(options.uvTransform.offset);map.rotation=options.uvTransform.rotation;map.repeat.fromArray(options.uvTransform.scale);map.wrapS=map.wrapT=THREE.RepeatWrapping;}map.needsUpdate=true;
  }
  const view=object.placement.kind==="view";
  if(input.mode.kind!=="beauty"){
    const id=object.selectionId;
    return track(new THREE.RawShaderMaterial({vertexShader,fragmentShader,side:object.doubleSided?THREE.DoubleSide:THREE.FrontSide,
      transparent:false,blending:THREE.NoBlending,depthWrite:!view,depthTest:!view,toneMapped:false,dithering:false,
      uniforms:{surfaceMap:{value:map},hasMap:{value:map!==null},textureOpaque:{value:object.textureAlpha==="opaque"},uvScale:{value:new THREE.Vector2(...object.uvScale)},
      uvOffset:{value:new THREE.Vector2(...object.uvOffset)},flipViewUv:{value:object.flipViewUv},opacity:{value:m.opacity},
      threshold:{value:input.mode.coverage.kind==="opaque"?1:input.mode.coverage.threshold},isMask:{value:object.alphaMode==="MASK"},maskCutoff:{value:object.alphaCutoff},
      selection:{value:new THREE.Vector3(Math.floor(id/65536)/255,(Math.floor(id/256)%256)/255,(id%256)/255)},
      nearClip:{value:frame.camera.near},farClip:{value:frame.camera.far},mode:{value:input.mode.kind==="object-id"?0:view?2:1}}}));
  }
  if(map&&object.textureOptions?.uvTransform===undefined){map.repeat.fromArray(object.uvScale);map.offset.fromArray(object.uvOffset);
    if(object.flipViewUv){map.repeat.y*=-1;map.offset.y+=object.uvScale[1];}map.needsUpdate=true;}
  const transparent=object.alphaMode===undefined?object.alphaCutoff===0&&(m.opacity<1||object.textureAlpha==="straight"):object.alphaMode==="BLEND";
  const options={color:m.color,opacity:m.opacity,transparent,map,
    side:object.doubleSided?THREE.DoubleSide:THREE.FrontSide,alphaTest:object.alphaCutoff,depthTest:!view,depthWrite:!view&&!transparent,toneMapped:false};
  const sourceMap=slot=>{const binding=object.sourceTextures?.[slot];if(!binding)return null;const texture=track(textures.get(binding.name).clone());if(binding.uvTransform){texture.offset.fromArray(binding.uvTransform.offset);texture.rotation=binding.uvTransform.rotation;texture.repeat.fromArray(binding.uvTransform.scale);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;}texture.colorSpace=(slot==="emissiveTexture"||slot==="sheenColorTexture")?THREE.SRGBColorSpace:THREE.NoColorSpace;texture.needsUpdate=true;return texture;};
  if(object.sourcePhysical){const p=object.sourcePhysical;const physical=track(new THREE.MeshPhysicalMaterial({...options,roughness:m.roughness,metalness:m.metalness}));if(object.linearColor)physical.color.setRGB(...object.linearColor,THREE.LinearSRGBColorSpace);
    physical.normalMap=sourceMap("normalTexture");physical.roughnessMap=physical.metalnessMap=sourceMap("metallicRoughnessTexture");physical.aoMap=sourceMap("occlusionTexture");physical.emissiveMap=sourceMap("emissiveTexture");if(p.emissiveLinear)physical.emissive.setRGB(...p.emissiveLinear,THREE.LinearSRGBColorSpace);physical.emissiveIntensity=p.emissiveStrength??1;
    if(p.clearcoat){physical.clearcoat=p.clearcoat.factor;physical.clearcoatRoughness=p.clearcoat.roughness;}physical.clearcoatMap=sourceMap("clearcoatTexture");physical.clearcoatRoughnessMap=sourceMap("clearcoatRoughnessTexture");physical.clearcoatNormalMap=sourceMap("clearcoatNormalTexture");
    physical.transmission=p.transmission??0;physical.transmissionMap=sourceMap("transmissionTexture");if(p.sheen){physical.sheen=1;physical.sheenColor.setRGB(...p.sheen.colorLinear,THREE.LinearSRGBColorSpace);physical.sheenRoughness=p.sheen.roughness;}physical.sheenColorMap=sourceMap("sheenColorTexture");physical.sheenRoughnessMap=sourceMap("sheenRoughnessTexture");if(p.anisotropy){physical.anisotropy=p.anisotropy.strength;physical.anisotropyRotation=p.anisotropy.rotation;}physical.anisotropyMap=sourceMap("anisotropyTexture");if(p.ior!==undefined)physical.ior=p.ior;physical.needsUpdate=true;return physical;}
  if(m.kind==="pbr"){
    const pbrMap=ref=>{if(!ref)return null;const name=object.pbrTextures?.[ref.assetId];if(!name)throw new Error("PBR map has no exact prepared texture binding.");
      const texture=track(textures.get(name).clone());texture.colorSpace=ref.colorSpace==="srgb"?THREE.SRGBColorSpace:THREE.NoColorSpace;
      if(ref.uvTransform){texture.offset.fromArray(ref.uvTransform.offset);texture.rotation=ref.uvTransform.rotation;texture.repeat.fromArray(ref.uvTransform.scale);texture.center.set(0,0);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;}
      texture.needsUpdate=true;return texture;};
    const baseMap=pbrMap(m.baseColorMap);const physical=track(new THREE.MeshPhysicalMaterial({...options,map:baseMap,roughness:m.roughness,metalness:m.metalness}));
    if(object.linearColor)physical.color.setRGB(...object.linearColor,THREE.LinearSRGBColorSpace);
    physical.normalMap=pbrMap(m.normalMap);if(physical.normalMap)physical.normalScale.setScalar(m.normalScale??1);
    if(m.ormMap){const orm=pbrMap(m.ormMap);physical.roughnessMap=orm;physical.metalnessMap=orm;physical.aoMap=orm;}
    else{physical.roughnessMap=pbrMap(m.roughnessMap);physical.metalnessMap=pbrMap(m.metalnessMap);physical.aoMap=pbrMap(m.aoMap);}
    physical.aoMapIntensity=m.aoMapIntensity??1;
    if(m.emissive){physical.emissive=new THREE.Color(m.emissive.color);physical.emissiveIntensity=m.emissive.intensity;physical.emissiveMap=pbrMap(m.emissive.map);}
    if(m.heightMap){physical.displacementMap=pbrMap(m.heightMap);physical.displacementScale=m.heightScale;}
    if(m.clearcoat){physical.clearcoat=m.clearcoat.factor;physical.clearcoatRoughness=m.clearcoat.roughness;physical.clearcoatMap=pbrMap(m.clearcoat.map);physical.clearcoatRoughnessMap=pbrMap(m.clearcoat.roughnessMap);physical.clearcoatNormalMap=pbrMap(m.clearcoat.normalMap);if(physical.clearcoatNormalMap)physical.clearcoatNormalScale.setScalar(m.clearcoat.normalScale??1);}
    if(m.transmission){physical.transmission=m.transmission.factor;physical.transmissionMap=pbrMap(m.transmission.map);}
    if(m.sheen){physical.sheen=1;physical.sheenColor=new THREE.Color(m.sheen.color);physical.sheenRoughness=m.sheen.roughness;physical.sheenColorMap=pbrMap(m.sheen.colorMap);physical.sheenRoughnessMap=pbrMap(m.sheen.roughnessMap);}
    if(m.anisotropy){physical.anisotropy=m.anisotropy.strength;physical.anisotropyRotation=m.anisotropy.rotation;physical.anisotropyMap=pbrMap(m.anisotropy.map);}
    if(m.ior!==undefined)physical.ior=m.ior;physical.needsUpdate=true;
    return physical;
  }
  const material=track(m.kind==="unlit"?new THREE.MeshBasicMaterial(options):new THREE.MeshStandardMaterial({...options,roughness:m.roughness,metalness:m.metalness}));
  if(object.linearColor)material.color.setRGB(...object.linearColor,THREE.LinearSRGBColorSpace);
  return material;
}
function makeCamera(data){
  const camera=data.kind==="perspective"?new THREE.PerspectiveCamera():new THREE.OrthographicCamera();camera.matrixAutoUpdate=false;camera.matrix.fromArray(data.cameraToWorld);
  camera.projectionMatrix.fromArray(data.projection);camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  // Preserve physical metadata for renderer effects without recomputing the authoritative calibrated projection.
  if(data.lens){camera.filmGauge=data.lens.sensorWidthMm;camera.focus=data.lens.focusDistanceM??10;camera.userData.slopcameraLens=Object.freeze({...data.lens});}
  camera.updateMatrixWorld(true);return camera;
}
const postMaterial=(fragment,uniforms)=>new THREE.RawShaderMaterial({depthTest:false,depthWrite:false,blending:THREE.NoBlending,transparent:false,toneMapped:false,dithering:false,vertexShader:postVertex,fragmentShader:fragment,uniforms});
const velocityVertex="precision highp float;uniform mat4 currentMvp;uniform mat4 previousMvp;uniform vec2 resolution;attribute vec3 position;varying vec2 vPx;void main(){vec4 c=currentMvp*vec4(position,1.0);vec4 p=previousMvp*vec4(position,1.0);vPx=(c.xy/max(c.w,0.000001)-p.xy/max(p.w,0.000001))*resolution*0.5;gl_Position=c;}";
const velocityPointVertex="precision highp float;uniform mat4 currentMvp;uniform mat4 previousMvp;uniform mat4 currentMv;uniform mat4 projection;uniform vec2 resolution;uniform float viewportHeight;uniform bool perspective;attribute vec3 position;attribute float particleSize;varying vec2 vPx;void main(){vec4 c=currentMvp*vec4(position,1.0);vec4 p=previousMvp*vec4(position,1.0);vPx=(c.xy/max(c.w,0.000001)-p.xy/max(p.w,0.000001))*resolution*0.5;gl_Position=c;vec4 mv=currentMv*vec4(position,1.0);float scale=0.5*viewportHeight*projection[1][1];gl_PointSize=max(1.0,particleSize*scale/(perspective?max(0.000001,-mv.z):1.0));}";
const velocityFragment="precision highp float;varying vec2 vPx;void main(){gl_FragColor=vec4(vPx,0.0,1.0);}";
const velocityPointFragment="precision highp float;varying vec2 vPx;void main(){vec2 p=gl_PointCoord*2.0-1.0;float coverage=clamp((1.0-dot(p,p))*8.0,0.0,1.0);if(coverage<=0.0)discard;gl_FragColor=vec4(vPx,0.0,coverage);}";
const viewProjection=cam=>new THREE.Matrix4().fromArray(cam.projection).multiply(new THREE.Matrix4().fromArray(cam.cameraToWorld).invert());
const buildVelocityScene=(frame,track)=>{
  const scene=new THREE.Scene();
  const curVP=viewProjection(frame.camera),prevVP=viewProjection(frame.previousCamera);
  const curView=new THREE.Matrix4().fromArray(frame.camera.cameraToWorld).invert();
  const projection=new THREE.Matrix4().fromArray(frame.camera.projection);
  const add=(geometry,matrix,previous,points)=>{
    const model=new THREE.Matrix4().fromArray(matrix),previousModel=new THREE.Matrix4().fromArray(previous??matrix);
    const uniforms={resolution:{value:resolution},currentMvp:{value:curVP.clone().multiply(model)},previousMvp:{value:prevVP.clone().multiply(previousModel)}};
    const material=points?track(new THREE.RawShaderMaterial({vertexShader:velocityPointVertex,fragmentShader:velocityPointFragment,depthTest:true,depthWrite:true,transparent:false,blending:THREE.NoBlending,toneMapped:false,dithering:false,
      uniforms:{...uniforms,currentMv:{value:curView.clone().multiply(model)},projection:{value:projection},viewportHeight:{value:SlopcameraOverlay.height},perspective:{value:frame.camera.kind==="perspective"}}}))
      :track(new THREE.RawShaderMaterial({vertexShader:velocityVertex,fragmentShader:velocityFragment,depthTest:true,depthWrite:true,transparent:false,blending:THREE.NoBlending,toneMapped:false,dithering:false,side:THREE.DoubleSide,uniforms}));
    const drawable=points?new THREE.Points(geometry,material):new THREE.Mesh(geometry,material);
    drawable.frustumCulled=false;scene.add(drawable);
  };
  for(const object of frame.objects){
    if(object.kind!=="mesh"||object.placement.kind!=="world")continue;
    if(isMotion&&object.entityId!==mode.entityId)continue;
    // Prepared primitives apply their local matrix after the world transform in
    // the beauty path, while previousMatrix already carries prevWorld*prevPrimitive.
    const primitive=object.geometry.kind==="prepared"?new THREE.Matrix4().fromArray(input.geometry[object.geometry.key][object.geometry.primitive].matrix):null;
    const current=primitive===null?object.matrix:new THREE.Matrix4().fromArray(object.matrix).multiply(primitive).toArray();
    add(makeGeometry(object,track),current,object.previousMatrix??current,false);
  }
  for(const item of frame.particles){
    if(isMotion&&item.entityId!==mode.entityId)continue;
    const data=particleBuffers.get(item.key);if(!data)continue;
    const geometry=track(new THREE.BufferGeometry());
    geometry.setAttribute("position",new THREE.BufferAttribute(data.positions,3));
    geometry.setAttribute("particleSize",new THREE.BufferAttribute(data.sizes,1));
    add(geometry,item.matrix,item.previousMatrix,true);
  }
  return scene;
};
const unpremultiplyFragment=postHeader+"void main(){vec4 c=texture2D(source,sampleUv);if(c.a<=0.0){gl_FragColor=vec4(0.0);return;}gl_FragColor=vec4(c.rgb/c.a,c.a);}";
const buildStepPasses=(step,frame,index,track,read)=>{
  const base={source:{value:read},resolution:{value:resolution}};
  const u=extra=>Object.assign(base,extra);
  switch(step.kind){
    case "tone-map":return[{target:"write",material:track(postMaterial(postHeader+"uniform float exposure;uniform float whitePoint;void main(){vec4 c=texture2D(source,sampleUv);vec3 x=max(c.rgb,vec3(0.0))*exp2(exposure);float w2=whitePoint*whitePoint;gl_FragColor=vec4(x*(1.0+x/w2)/(1.0+x),c.a);}",u({exposure:{value:step.exposure},whitePoint:{value:step.whitePoint}})))}];
    case "vignette":return[{target:"write",material:track(postMaterial(postHeader+"uniform float intensity;uniform float radius;void main(){vec4 c=texture2D(source,sampleUv);float d=length((sampleUv-0.5)*1.41421356);gl_FragColor=vec4(c.rgb*(1.0-intensity*smoothstep(radius,1.0,d)),c.a);}",u({intensity:{value:step.intensity},radius:{value:step.radius}})))}];
    case "chromatic-aberration":return[{target:"write",material:track(postMaterial(postHeader+"uniform float offsetPixels;uniform float radialFalloff;void main(){vec2 dir=sampleUv-0.5;float len=max(length(dir),0.000001);vec2 off=dir/len*offsetPixels*pow(len*1.41421356,radialFalloff)/resolution;vec4 c=texture2D(source,sampleUv);gl_FragColor=vec4(texture2D(source,sampleUv+off).r,c.g,texture2D(source,sampleUv-off).b,c.a);}",u({offsetPixels:{value:step.offsetPixels},radialFalloff:{value:step.radialFalloff}})))}];
    case "grain":return[{target:"write",material:track(postMaterial(postHeader+"uniform float intensity;uniform float seed;float grainHash(vec2 p){vec3 q=fract(vec3(p.xyx)*0.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}void main(){vec4 c=texture2D(source,sampleUv);float n=grainHash(floor(sampleUv*resolution)+vec2(seed,seed*1.618034));gl_FragColor=vec4(max(c.rgb+vec3((n-0.5)*intensity),vec3(0.0)),c.a);}",u({intensity:{value:step.intensity},seed:{value:step.seed+frame.timeUs%7919}})))}];
    case "depth-of-field":return[{target:"write",material:track(postMaterial(postHeader+"uniform sampler2D depthTex;uniform float nearClip;uniform float farClip;uniform float focusDistance;uniform float aperture;uniform float focalLength;uniform float sensorWidth;uniform bool isPerspective;const vec2 dofTaps[16]=vec2[16](${DOF_TAPS});float viewZ(float d){return isPerspective?nearClip*farClip/max(farClip-d*(farClip-nearClip),0.000001):nearClip+d*(farClip-nearClip);}void main(){vec4 c=texture2D(source,sampleUv);float z=viewZ(texture2D(depthTex,sampleUv).x);float coc=clamp(aperture*focalLength*abs(focusDistance-z)/(focusDistance*max(z,0.0001))*resolution.x/sensorWidth,0.0,32.0);vec3 acc=c.rgb;for(int i=0;i<16;i++){acc+=texture2D(source,sampleUv+dofTaps[i]*coc/resolution).rgb;}gl_FragColor=vec4(acc/17.0,c.a);}",u({depthTex:{value:beautyTarget.depthTexture},nearClip:{value:frame.camera.near},farClip:{value:frame.camera.far},focusDistance:{value:step.focusDistance},aperture:{value:step.aperture},focalLength:{value:step.focalLength},sensorWidth:{value:frame.camera.lens?frame.camera.lens.sensorWidthMm:36},isPerspective:{value:frame.camera.kind==="perspective"}})))}];
    case "motion-blur":return[{target:"write",material:track(postMaterial(postHeader+"uniform sampler2D velocityTex;uniform int samples;uniform float shutter;void main(){vec4 c=texture2D(source,sampleUv);vec2 v=texture2D(velocityTex,sampleUv).xy*shutter/resolution;vec3 acc=c.rgb;float n=1.0;for(int i=1;i<64;i++){if(i>=samples)break;float t=float(i)/float(samples-1)-0.5;acc+=texture2D(source,sampleUv+v*t).rgb;n+=1.0;}gl_FragColor=vec4(acc/n,c.a);}",u({velocityTex:{value:velocityTarget.texture},samples:{value:step.samples},shutter:{value:step.shutterAngle/360}})))}];
    case "bloom":{
      const bright=postHeader+"uniform float threshold;void main(){vec4 c=texture2D(source,sampleUv);gl_FragColor=vec4(max(c.rgb-vec3(threshold),vec3(0.0)),1.0);}";
      const blur=postHeader+"uniform vec2 texel;uniform float spread;uniform vec2 direction;const float bloomW[5]=float[5](${BLOOM_WEIGHTS});void main(){vec3 acc=texture2D(source,sampleUv).rgb*bloomW[0];for(int i=1;i<5;i++){vec2 o=direction*float(i)*spread*0.125*texel;acc+=(texture2D(source,sampleUv+o).rgb+texture2D(source,sampleUv-o).rgb)*bloomW[i];}gl_FragColor=vec4(acc,1.0);}";
      const composite=postHeader+"uniform sampler2D bright;uniform float intensity;void main(){vec4 c=texture2D(source,sampleUv);gl_FragColor=vec4(c.rgb+texture2D(bright,sampleUv).rgb*intensity,c.a);}";
      const halfTexel=new THREE.Vector2(1/brightA.width,1/brightA.height);
      return[{target:brightA,material:track(postMaterial(bright,u({threshold:{value:step.threshold}})))},
        {target:brightB,material:track(postMaterial(blur,{source:{value:brightA.texture},resolution:{value:resolution},texel:{value:halfTexel},spread:{value:step.radius},direction:{value:new THREE.Vector2(1,0)}}))},
        {target:brightA,material:track(postMaterial(blur,{source:{value:brightB.texture},resolution:{value:resolution},texel:{value:halfTexel},spread:{value:step.radius},direction:{value:new THREE.Vector2(0,1)}}))},
        {target:"write",material:track(postMaterial(composite,u({bright:{value:brightA.texture},intensity:{value:step.intensity}})))}];
    }
    case "flare":{
      const bright=postHeader+"uniform float threshold;void main(){vec4 c=texture2D(source,sampleUv);gl_FragColor=vec4(max(c.rgb-vec3(threshold),vec3(0.0)),1.0);}";
      const ghosts=postHeader+"uniform sampler2D bright;uniform int ghosts;uniform float haloWidth;uniform float intensity;void main(){vec4 c=texture2D(source,sampleUv);vec3 g=vec3(0.0);float n=0.0;for(int i=0;i<16;i++){if(i>=ghosts)break;float t=float(i)/max(float(ghosts-1),1.0);vec2 guv=vec2(0.5)-(sampleUv-0.5)*mix(0.25,1.5,t);g+=texture2D(bright,guv).rgb*(1.0-t)*(1.0-t);n+=1.0;}vec2 dir=sampleUv-0.5;float len=max(length(dir),0.000001);vec3 h=texture2D(bright,sampleUv-dir/len*haloWidth*0.5).rgb;gl_FragColor=vec4(c.rgb+(g/max(n,1.0)+h)*intensity,c.a);}";
      return[{target:brightA,material:track(postMaterial(bright,u({threshold:{value:step.threshold}})))},
        {target:"write",material:track(postMaterial(ghosts,u({bright:{value:brightA.texture},ghosts:{value:step.ghosts},haloWidth:{value:step.haloWidth},intensity:{value:step.intensity}})))}];
    }
    case "lut-grade":{
      const lutTexture=track(textures.get(step.lut.resourceName).clone());
      lutTexture.flipY=false;lutTexture.colorSpace=THREE.NoColorSpace;lutTexture.needsUpdate=true;
      const fragment=postHeader+"uniform sampler2D lutTex;uniform float lutSize;uniform float intensity;vec3 lutLookup(vec3 c){float s=lutSize;vec3 cl=clamp(c,0.0,1.0);float b=cl.b*(s-1.0);float b0=floor(b);float b1=min(b0+1.0,s-1.0);vec2 rg=cl.rg*(s-1.0)+0.5;vec3 c0=texture2D(lutTex,vec2((b0*s+rg.x)/(s*s),rg.y/s)).rgb;vec3 c1=texture2D(lutTex,vec2((b1*s+rg.x)/(s*s),rg.y/s)).rgb;return mix(c0,c1,b-b0);}void main(){vec4 c=texture2D(source,sampleUv);gl_FragColor=vec4(mix(c.rgb,lutLookup(c.rgb),intensity),c.a);}";
      return[{target:"write",material:track(postMaterial(fragment,u({lutTex:{value:lutTexture},lutSize:{value:step.lut.size},intensity:{value:step.intensity}})))}];
    }
    default:throw new Error("Unsupported post-process step "+String(step&&step.kind)+".");
  }
};
const runPostChain=(frame,index,track)=>{
  let read=beautyTarget.texture;let written=0;
  const targets=[postA,postB];
  const run=(material,target)=>{postMesh.material=material;renderer.setRenderTarget(target);renderer.clear(true,true,true);renderer.render(postScene,outputCamera);};
  run(track(postMaterial(unpremultiplyFragment,{source:{value:read},resolution:{value:resolution}})),postA);
  read=postA.texture;
  for(const step of postSteps)for(const item of buildStepPasses(step,frame,index,track,read)){
    const target=item.target==="write"?targets[1-written]:item.target;
    run(item.material,target);
    if(item.target==="write"){read=targets[1-written].texture;written=1-written;}
  }
  return read;
};
SlopcameraOverlay.onFrame(({frame:index})=>{
  if(disposed)throw new Error("Spatial renderer is disposed.");if(contextFailure)throw contextFailure;
  const frame=input.frames[index];if(!frame)throw new Error("Spatial frame index is outside the immutable batch.");
  const disposable=[];const track=value=>(disposable.push(value),value);
  try{
    if(isMotion){
      renderer.setRenderTarget(velocityTarget);renderer.clear(true,true,true);
      renderer.render(buildVelocityScene(frame,track),outputCamera);
      postMesh.material=track(postMaterial(postHeader+"uniform float motionScale;uniform float threshold;void main(){vec4 v=texture2D(source,sampleUv);if(v.a<threshold){gl_FragColor=vec4(0.0);return;}vec2 e=clamp(v.xy/motionScale*0.5+0.5,0.0,1.0)*65535.0;vec2 hi=floor(e/256.0);vec2 lo=e-hi*256.0;gl_FragColor=vec4(hi.x/255.0,lo.x/255.0,hi.y/255.0,lo.y/255.0,1.0);}",
        {source:{value:velocityTarget.texture},resolution:{value:resolution},motionScale:{value:mode.motionScale},threshold:{value:mode.coverage.kind==="opaque"?1:mode.coverage.threshold}}));
      renderer.setRenderTarget(null);renderer.clear(true,true,true);renderer.render(postScene,outputCamera);
      if(contextFailure)throw contextFailure;
      return;
    }
    const world=new THREE.Scene();const view=new THREE.Scene();const camera=makeCamera(frame.camera);
    const viewCamera=new THREE.OrthographicCamera(0,SlopcameraOverlay.width,0,SlopcameraOverlay.height,0.01,2000002);viewCamera.position.z=1000001;viewCamera.updateMatrixWorld(true);
    if(frame.fog&&input.mode.kind==="beauty"){
      if(frame.fog.kind==="linear")world.fog=new THREE.Fog(frame.fog.color,frame.fog.near,frame.fog.far);
      else world.fog=new THREE.FogExp2(frame.fog.color,frame.fog.density);
    }
    const environment=frame.objects.find(object=>object.kind==="environment");
    if(environment!==undefined&&input.mode.kind==="beauty"){
      const equirect=track(textures.get(environment.textureName).clone());
      equirect.mapping=THREE.EquirectangularReflectionMapping;equirect.needsUpdate=true;
      const skyRotation=new THREE.Quaternion(...environment.rotation);
      if(environment.role!=="environment"){world.background=equirect;world.backgroundRotation.setFromQuaternion(skyRotation);world.backgroundIntensity=environment.intensity;}
      if(environment.role!=="background"){world.environment=equirect;world.environmentRotation.setFromQuaternion(skyRotation);world.environmentIntensity=environment.intensity;}
    }
    for(const item of frame.particles){
      const data=particleBuffers.get(item.key);if(!data)throw new Error("Prepared particle frame buffer is absent.");
      const geometry=track(new THREE.BufferGeometry());geometry.setAttribute("position",new THREE.BufferAttribute(data.positions,3));geometry.setAttribute("particleColor",new THREE.BufferAttribute(data.colors,3));geometry.setAttribute("particleSize",new THREE.BufferAttribute(data.sizes,1));geometry.setAttribute("particleOpacity",new THREE.BufferAttribute(data.opacity,1));
      const material=track(new THREE.RawShaderMaterial({transparent:true,depthTest:true,depthWrite:false,blending:THREE.NormalBlending,toneMapped:false,dithering:false,
        uniforms:{viewportHeight:{value:SlopcameraOverlay.height},perspective:{value:frame.camera.kind==="perspective"}},
        vertexShader:"precision highp float;uniform mat4 projectionMatrix;uniform mat4 modelViewMatrix;uniform float viewportHeight;uniform bool perspective;attribute vec3 position;attribute vec3 particleColor;attribute float particleSize;attribute float particleOpacity;varying vec3 color;varying float opacity;void main(){vec4 p=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*p;float scale=0.5*viewportHeight*projectionMatrix[1][1];gl_PointSize=max(1.0,particleSize*scale/(perspective?max(0.000001,-p.z):1.0));color=particleColor;opacity=particleOpacity;}",
        fragmentShader:"precision highp float;varying vec3 color;varying float opacity;void main(){vec2 p=gl_PointCoord*2.0-1.0;float coverage=clamp((1.0-dot(p,p))*8.0,0.0,1.0);float alpha=opacity*coverage;if(alpha<=0.0)discard;gl_FragColor=vec4(color*alpha,alpha);}"}));
      const points=new THREE.Points(geometry,material);points.matrixAutoUpdate=false;points.matrix.fromArray(item.matrix);world.add(points);
    }
    for(const object of frame.objects){
      if(object.kind==="light"){
        const light=object.light==="ambient"?new THREE.AmbientLight(object.color,object.intensity):object.light==="point"?new THREE.PointLight(object.color,object.intensity):object.light==="spot"?new THREE.SpotLight(object.color,object.intensity,object.spot.distance??0,object.spot.angle,object.spot.penumbra,object.spot.decay??2):new THREE.DirectionalLight(object.color,object.intensity);
        light.matrixAutoUpdate=false;light.matrix.fromArray(object.matrix);if("castShadow" in light)light.castShadow=object.shadow===true;world.add(light);
        if(object.light==="directional"||object.light==="spot"){const target=new THREE.Object3D();target.position.set(0,0,-1).applyMatrix4(light.matrix);world.add(target);light.target=target;}
        continue;
      }
      if(object.kind==="environment")continue;
      const mesh=new THREE.Mesh(makeGeometry(object,track),makeMaterial(object,frame,track));mesh.name=object.entityId;
      mesh.castShadow=object.castShadow===true;mesh.receiveShadow=object.receiveShadow===true;
      mesh.matrixAutoUpdate=false;mesh.matrix.fromArray(object.matrix);
      if(object.geometry.kind==="prepared")mesh.matrix.multiply(new THREE.Matrix4().fromArray(input.geometry[object.geometry.key][object.geometry.primitive].matrix));
      if(object.placement.kind==="view"){
        if(object.placement.units==="normalized")mesh.matrix.premultiply(new THREE.Matrix4().makeScale(SlopcameraOverlay.width,SlopcameraOverlay.height,1));
        mesh.renderOrder=object.placement.order;mesh.frustumCulled=false;view.add(mesh);
      }else world.add(mesh);
    }
    if(input.mode.kind==="beauty")configureSpatialShadows(world,renderer.capabilities.maxTextureSize,track);
    renderer.setRenderTarget(beautyTarget);renderer.clear(true,true,true);renderer.render(world,camera);renderer.clearDepth();renderer.render(view,viewCamera);
    if(beautyTarget){
      if(velocityTarget){renderer.setRenderTarget(velocityTarget);renderer.clear(true,true,true);renderer.render(buildVelocityScene(frame,track),outputCamera);}
      renderer.setRenderTarget(null);renderer.clear(true,true,true);
      if(hasPost){
        postOutputMaterial.uniforms.source.value=runPostChain(frame,index,track);
        postMesh.material=postOutputMaterial;renderer.render(postScene,outputCamera);
      }else renderer.render(outputScene,outputCamera);
    }
    if(contextFailure)throw contextFailure;
  }finally{for(const resource of disposable)resource.dispose();}
});
addEventListener("pagehide",()=>{disposed=true;canvas.removeEventListener("webglcontextlost",loseContext);for(const texture of textures.values())texture.dispose();textures.clear();beautyTarget?.dispose();beautyTarget?.depthTexture?.dispose();velocityTarget?.dispose();postA?.dispose();postB?.dispose();brightA?.dispose();brightB?.dispose();outputGeometry?.dispose();outputMaterial?.dispose();postOutputMaterial?.dispose();renderer.dispose();renderer.forceContextLoss();});
</script></body></html>`;
}
