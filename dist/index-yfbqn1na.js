// @bun
import {
  SlopcameraCodeError,
  createBoundedJsonSnapshot,
  createBoundedJsonValueSnapshot,
  deepFreezeJson
} from "./index-8txs6fkn.js";

// src/spatial-scene/contracts.ts
import { z } from "zod";
var SPATIAL_SCENE_LIMITS = Object.freeze({
  sourceBytes: 2097152,
  sourceDepth: 32,
  sourceValues: 200000,
  entities: 4096,
  assets: 128,
  cameras: 64,
  channels: 4096,
  keysPerChannel: 4096,
  durationUs: 3600000000,
  patchOperations: 256
});
var SpatialDigestSchema = z.string().regex(/^[a-f0-9]{64}$/u);
var stableId = (prefix) => z.string().min(prefix.length + 1).max(128).regex(new RegExp(`^${prefix}[a-zA-Z0-9][a-zA-Z0-9_-]*$`, "u"));
var SpatialSceneIdSchema = stableId("scene_");
var SpatialEntityIdSchema = stableId("entity_");
var SpatialCameraIdSchema = stableId("camera_");
var SpatialAssetIdSchema = stableId("asset_");
var SpatialGeneratorIdSchema = stableId("generator_");
var SpatialChannelIdSchema = stableId("channel_");
var SpatialShotIdSchema = stableId("shot_");
var finiteCoordinate = z.number().finite().min(-1e6).max(1e6);
var positiveDimension = z.number().finite().min(0.000001).max(1e6);
var unit = z.number().finite().min(0).max(1);
var SpatialTimeUsSchema = z.number().int().safe().min(0).max(SPATIAL_SCENE_LIMITS.durationUs);
var SpatialVec3Schema = z.tuple([finiteCoordinate, finiteCoordinate, finiteCoordinate]);
var SpatialQuaternionSchema = z.tuple([
  z.number().finite().min(-1).max(1),
  z.number().finite().min(-1).max(1),
  z.number().finite().min(-1).max(1),
  z.number().finite().min(-1).max(1)
]).refine((value) => Math.abs(value.reduce((sum, part) => sum + part * part, 0) - 1) <= 0.000001, "Rotation must be a unit quaternion in XYZW order.");
var SpatialTransformSchema = z.strictObject({
  position: SpatialVec3Schema,
  rotation: SpatialQuaternionSchema,
  scale: z.tuple([positiveDimension, positiveDimension, positiveDimension])
});
var SpatialPoseSchema = z.strictObject({
  position: SpatialVec3Schema,
  rotation: SpatialQuaternionSchema
});
var SpatialFrameRateSchema = z.strictObject({
  numerator: z.number().int().safe().min(1).max(1e6),
  denominator: z.number().int().safe().min(1).max(1e6)
}).refine((rate) => rate.numerator / rate.denominator <= 1000, "Frame rate exceeds 1,000 fps.");
var dimensions = {
  width: z.number().int().min(1).max(16384),
  height: z.number().int().min(1).max(16384)
};
var clipping = { near: positiveDimension, far: positiveDimension };
var SpatialProjectionSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("perspective"),
    ...dimensions,
    ...clipping,
    fx: positiveDimension,
    fy: positiveDimension,
    cx: finiteCoordinate,
    cy: finiteCoordinate
  }),
  z.strictObject({
    kind: z.literal("orthographic"),
    ...dimensions,
    ...clipping,
    left: finiteCoordinate,
    right: finiteCoordinate,
    top: finiteCoordinate,
    bottom: finiteCoordinate
  })
]).superRefine((projection, context) => {
  if (projection.far <= projection.near)
    context.addIssue({ code: "custom", message: "Far clipping must exceed near clipping." });
  if (projection.width * projection.height > 33554432)
    context.addIssue({ code: "custom", message: "Camera exceeds the 32-megapixel limit." });
  if (projection.kind === "orthographic" && (projection.right <= projection.left || projection.top <= projection.bottom)) {
    context.addIssue({ code: "custom", message: "Orthographic extents must have positive width and height." });
  }
});
var SpatialCameraSchema = z.strictObject({
  cameraId: SpatialCameraIdSchema,
  name: z.string().min(1).max(256),
  pose: SpatialPoseSchema,
  projection: SpatialProjectionSchema
});
var relativePath = z.string().min(1).max(1024).refine((value) => !value.startsWith("/") && !/[\\\u0000-\u001f]/u.test(value) && !/^[a-zA-Z]:/u.test(value) && value.split("/").every((part) => part !== "" && part !== "." && part !== ".."), "Asset paths must be contained root-relative paths.");
var SpatialPayloadSchema = z.strictObject({
  path: relativePath,
  sha256: SpatialDigestSchema,
  bytes: z.number().int().safe().min(1).max(134217728)
});
var imageInterpretation = {
  ...dimensions,
  colorSpace: z.literal("srgb"),
  alpha: z.enum(["straight", "opaque"])
};
var SpatialAssetInterpretationSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("image"), ...imageInterpretation, mimeType: z.enum(["image/png", "image/jpeg", "image/svg+xml"]) }),
  z.strictObject({ kind: z.literal("video"), ...imageInterpretation, durationUs: SpatialTimeUsSchema.refine((value) => value > 0), frameRate: SpatialFrameRateSchema }),
  z.strictObject({ kind: z.literal("diagram"), schemaVersion: z.literal(1), theme: z.enum(["light", "dark"]) }),
  z.strictObject({ kind: z.literal("gltf"), format: z.enum(["glb", "gltf"]), metersPerUnit: positiveDimension, sourceUp: z.enum(["x", "y", "z"]) }),
  z.strictObject({ kind: z.literal("font"), format: z.enum(["otf", "woff2"]), family: z.string().min(1).max(128) }),
  z.strictObject({ kind: z.literal("splat"), format: z.enum(["spz", "ply"]), metersPerUnit: positiveDimension, sourceUp: z.enum(["x", "y", "z"]) }),
  z.strictObject({ kind: z.literal("metadata"), format: z.literal("json"), schema: z.enum(["slopcamera.spatial-world-import", "slopcamera.world-labs-provenance", "slopcamera.spatial-asset-facts", "slopcamera.provider-metadata"]) })
]);
var SpatialAssetManifestSchema = z.strictObject({
  assetId: SpatialAssetIdSchema,
  payload: SpatialPayloadSchema,
  interpretation: SpatialAssetInterpretationSchema,
  dependencies: z.array(SpatialAssetIdSchema).max(SPATIAL_SCENE_LIMITS.assets),
  provenance: z.strictObject({
    source: z.enum(["authored", "imported", "generated", "derived"]),
    description: z.string().min(1).max(2048),
    receiptSha256: SpatialDigestSchema.optional()
  })
});
var color = z.string().regex(/^#[a-fA-F0-9]{6}$/u);
var SpatialMaterialSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("unlit"), color, opacity: unit, map: SpatialAssetIdSchema.optional() }),
  z.strictObject({ kind: z.literal("standard"), color, opacity: unit, roughness: unit, metalness: unit, map: SpatialAssetIdSchema.optional() })
]);
var SpatialGeometrySchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("box"), size: z.tuple([positiveDimension, positiveDimension, positiveDimension]) }),
  z.strictObject({ kind: z.literal("sphere"), radius: positiveDimension }),
  z.strictObject({ kind: z.literal("plane"), width: positiveDimension, height: positiveDimension }),
  z.strictObject({ kind: z.literal("cylinder"), radius: positiveDimension, height: positiveDimension }),
  z.strictObject({
    kind: z.literal("asset"),
    assetId: SpatialAssetIdSchema,
    nodeIndex: z.number().int().min(0).max(65535).optional(),
    materialMode: z.enum(["entity", "source"]).optional(),
    clip: z.strictObject({ index: z.number().int().min(0).max(255), offsetUs: SpatialTimeUsSchema, playback: z.enum(["once", "loop", "freeze"]) }).optional()
  })
]);
var SpatialOriginSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("authored") }),
  z.strictObject({ kind: z.literal("generated"), generatorId: SpatialGeneratorIdSchema, key: z.string().min(1).max(256) })
]);
var SpatialPlacementSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("world") }),
  z.strictObject({ kind: z.literal("view"), cameraId: SpatialCameraIdSchema, units: z.enum(["pixels", "normalized"]), order: z.number().int().min(-4096).max(4096) })
]);
var entityBase = {
  entityId: SpatialEntityIdSchema,
  name: z.string().min(1).max(256),
  parentId: SpatialEntityIdSchema.nullable(),
  transform: SpatialTransformSchema,
  placement: SpatialPlacementSchema,
  origin: SpatialOriginSchema,
  visible: z.boolean()
};
var surfaceBase = {
  assetId: SpatialAssetIdSchema,
  width: positiveDimension,
  height: positiveDimension,
  fit: z.enum(["contain", "cover", "stretch"]),
  opacity: unit
};
var SpatialEntitySchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...entityBase, kind: z.literal("group") }),
  z.strictObject({ ...entityBase, kind: z.literal("mesh"), geometry: SpatialGeometrySchema, material: SpatialMaterialSchema }),
  z.strictObject({ ...entityBase, ...surfaceBase, kind: z.literal("image") }),
  z.strictObject({ ...entityBase, ...surfaceBase, kind: z.literal("diagram") }),
  z.strictObject({ ...entityBase, ...surfaceBase, kind: z.literal("video"), sourceOffsetUs: SpatialTimeUsSchema, playback: z.enum(["once", "loop", "freeze"]) }),
  z.strictObject({ ...entityBase, kind: z.literal("text"), text: z.string().max(16384), fontAssetId: SpatialAssetIdSchema, fontSize: positiveDimension, width: positiveDimension, color, align: z.enum(["left", "center", "right"]) }),
  z.strictObject({ ...entityBase, kind: z.literal("light"), light: z.enum(["ambient", "directional", "point"]), color, intensity: z.number().finite().min(0).max(1e5) }),
  z.strictObject({ ...entityBase, kind: z.literal("splat"), assetId: SpatialAssetIdSchema }),
  z.strictObject({
    ...entityBase,
    kind: z.literal("environment"),
    assetId: SpatialAssetIdSchema,
    role: z.enum(["background", "environment", "both"]),
    intensity: z.number().finite().min(0).max(16)
  })
]);
var key = (value) => z.strictObject({ timeUs: SpatialTimeUsSchema, value });
var channelBase = { channelId: SpatialChannelIdSchema, targetId: z.union([SpatialEntityIdSchema, SpatialCameraIdSchema]) };
var SpatialAnimationSchema = z.discriminatedUnion("property", [
  z.strictObject({ ...channelBase, property: z.literal("position"), interpolation: z.enum(["step", "linear"]), keys: z.array(key(SpatialVec3Schema)).min(1).max(SPATIAL_SCENE_LIMITS.keysPerChannel) }),
  z.strictObject({ ...channelBase, property: z.literal("rotation"), interpolation: z.enum(["step", "slerp"]), keys: z.array(key(SpatialQuaternionSchema)).min(1).max(SPATIAL_SCENE_LIMITS.keysPerChannel) }),
  z.strictObject({ ...channelBase, property: z.literal("scale"), interpolation: z.enum(["step", "linear"]), keys: z.array(key(z.tuple([positiveDimension, positiveDimension, positiveDimension]))).min(1).max(SPATIAL_SCENE_LIMITS.keysPerChannel) }),
  z.strictObject({ ...channelBase, property: z.literal("opacity"), interpolation: z.enum(["step", "linear"]), keys: z.array(key(unit)).min(1).max(SPATIAL_SCENE_LIMITS.keysPerChannel) })
]);
var SpatialOverrideSchema = z.discriminatedUnion("property", [
  z.strictObject({ entityId: SpatialEntityIdSchema, property: z.literal("color"), value: color }),
  z.strictObject({ entityId: SpatialEntityIdSchema, property: z.literal("opacity"), value: unit }),
  z.strictObject({ entityId: SpatialEntityIdSchema, property: z.literal("transform"), value: SpatialTransformSchema })
]);
var SpatialGeneratorSchema = z.strictObject({
  generatorId: SpatialGeneratorIdSchema,
  sourceSha256: SpatialDigestSchema,
  closureSha256: SpatialDigestSchema,
  parametersSha256: SpatialDigestSchema,
  seed: z.number().int().safe().min(0).max(4294967295),
  outputSha256: SpatialDigestSchema,
  execution: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("qualified"), runtimeSha256: SpatialDigestSchema }),
    z.strictObject({ kind: z.literal("attempt"), attemptId: z.string().min(1).max(128), runtimeSha256: SpatialDigestSchema })
  ]),
  editableKeys: z.array(z.strictObject({ key: z.string().min(1).max(256), properties: z.array(z.enum(["color", "opacity", "transform"])).min(1).max(3) })).max(SPATIAL_SCENE_LIMITS.entities)
});
var SpatialSceneV1Schema = z.strictObject({
  kind: z.literal("slopcamera.spatial-scene"),
  schemaVersion: z.literal(1),
  sceneId: SpatialSceneIdSchema,
  coordinates: z.literal("right-handed-y-up-meters"),
  durationUs: SpatialTimeUsSchema.refine((value) => value > 0),
  entities: z.array(SpatialEntitySchema).max(SPATIAL_SCENE_LIMITS.entities),
  cameras: z.array(SpatialCameraSchema).min(1).max(SPATIAL_SCENE_LIMITS.cameras),
  assets: z.array(SpatialAssetManifestSchema).max(SPATIAL_SCENE_LIMITS.assets),
  animations: z.array(SpatialAnimationSchema).max(SPATIAL_SCENE_LIMITS.channels),
  generators: z.array(SpatialGeneratorSchema).max(128),
  overrides: z.array(SpatialOverrideSchema).max(SPATIAL_SCENE_LIMITS.entities)
});
var SpatialPatchOperationSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("add-asset"), asset: SpatialAssetManifestSchema }),
  z.strictObject({ kind: z.literal("replace-asset"), asset: SpatialAssetManifestSchema }),
  z.strictObject({ kind: z.literal("set-mesh-geometry"), entityId: SpatialEntityIdSchema, geometry: SpatialGeometrySchema }),
  z.strictObject({ kind: z.literal("set-material"), entityId: SpatialEntityIdSchema, material: SpatialMaterialSchema }),
  z.strictObject({ kind: z.literal("rename-entity"), entityId: SpatialEntityIdSchema, name: z.string().min(1).max(256) }),
  z.strictObject({ kind: z.literal("reparent-entity"), entityId: SpatialEntityIdSchema, parentId: SpatialEntityIdSchema.nullable() }),
  z.strictObject({ kind: z.literal("set-transform"), entityId: SpatialEntityIdSchema, transform: SpatialTransformSchema }),
  z.strictObject({ kind: z.literal("set-color"), entityId: SpatialEntityIdSchema, color }),
  z.strictObject({ kind: z.literal("set-opacity"), entityId: SpatialEntityIdSchema, opacity: unit }),
  z.strictObject({ kind: z.literal("set-camera"), camera: SpatialCameraSchema }),
  z.strictObject({ kind: z.literal("set-channel"), channel: SpatialAnimationSchema }),
  z.strictObject({ kind: z.literal("remove-channel"), channelId: SpatialChannelIdSchema }),
  z.strictObject({ kind: z.literal("add-entity"), entity: SpatialEntitySchema }),
  z.strictObject({ kind: z.literal("remove-entity"), entityId: SpatialEntityIdSchema }),
  z.strictObject({ kind: z.literal("set-override"), override: SpatialOverrideSchema }),
  z.strictObject({ kind: z.literal("remove-override"), entityId: SpatialEntityIdSchema, property: z.enum(["color", "opacity", "transform"]) }),
  z.strictObject({ kind: z.literal("replace-generator-output"), generator: SpatialGeneratorSchema, entities: z.array(SpatialEntitySchema).max(SPATIAL_SCENE_LIMITS.entities) })
]);
var SpatialScenePatchV1Schema = z.strictObject({
  kind: z.literal("slopcamera.spatial-scene-patch"),
  schemaVersion: z.literal(1),
  expectedSceneSha256: SpatialDigestSchema,
  operations: z.array(SpatialPatchOperationSchema).min(1).max(SPATIAL_SCENE_LIMITS.patchOperations)
});
var SpatialShotV1Schema = z.strictObject({
  shotId: SpatialShotIdSchema,
  sceneSha256: SpatialDigestSchema,
  cameraId: SpatialCameraIdSchema,
  range: z.strictObject({ startUs: SpatialTimeUsSchema, endUs: SpatialTimeUsSchema }),
  sceneStartUs: SpatialTimeUsSchema,
  playback: z.enum(["once", "loop", "freeze"]),
  overrides: z.array(SpatialOverrideSchema).max(SPATIAL_SCENE_LIMITS.entities),
  cameraPoseOverride: SpatialPoseSchema.optional()
}).refine((shot) => shot.range.endUs > shot.range.startUs, "Shot range must be nonempty and half-open.");
var matrixNumber = z.number().finite().min(-1000000000000).max(1000000000000);
var SpatialMatrixSchema = z.tuple([
  matrixNumber,
  matrixNumber,
  matrixNumber,
  matrixNumber,
  matrixNumber,
  matrixNumber,
  matrixNumber,
  matrixNumber,
  matrixNumber,
  matrixNumber,
  matrixNumber,
  matrixNumber,
  matrixNumber,
  matrixNumber,
  matrixNumber,
  matrixNumber
]);
var EvaluatedSpatialSceneSchema = z.strictObject({
  kind: z.literal("slopcamera.spatial-snapshot"),
  schemaVersion: z.literal(1),
  sceneSha256: SpatialDigestSchema,
  stateSha256: SpatialDigestSchema,
  viewSha256: SpatialDigestSchema,
  timeUs: SpatialTimeUsSchema,
  camera: SpatialCameraSchema,
  entities: z.array(z.strictObject({
    entity: SpatialEntitySchema,
    worldMatrix: SpatialMatrixSchema,
    visible: z.boolean(),
    selectionId: z.number().int().min(1).max(SPATIAL_SCENE_LIMITS.entities)
  })).max(SPATIAL_SCENE_LIMITS.entities),
  assets: z.array(SpatialAssetManifestSchema).max(SPATIAL_SCENE_LIMITS.assets)
});

// src/spatial-scene/identity.ts
class SpatialSceneError extends SlopcameraCodeError {
  path;
  constructor(code, message, path = "scene") {
    super(code, message, { path });
    this.name = "SpatialSceneError";
    this.path = path;
  }
}
var limits = { maximumDepth: SPATIAL_SCENE_LIMITS.sourceDepth, maximumValues: SPATIAL_SCENE_LIMITS.sourceValues };
function parseSpatialValue(schema, input, name) {
  try {
    const captured = createBoundedJsonValueSnapshot(input, SPATIAL_SCENE_LIMITS.sourceBytes, name, limits);
    const parsed = schema.safeParse(captured.value);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new SpatialSceneError("invalid-data", issue?.message ?? `Invalid ${name}.`, `${name}.${issue?.path.join(".") ?? ""}`);
    }
    return parsed.data;
  } catch (error) {
    if (error instanceof SpatialSceneError)
      throw error;
    throw new SpatialSceneError("invalid-data", error instanceof Error ? error.message : `Invalid ${name}.`, name);
  }
}
function spatialValueSha256(input) {
  return createBoundedJsonSnapshot(input, SPATIAL_SCENE_LIMITS.sourceBytes, "spatial identity", limits).sha256;
}
function spatialStateValueSha256(input) {
  return createBoundedJsonSnapshot(input, SPATIAL_SCENE_LIMITS.sourceBytes * 4, "spatial state identity", {
    maximumDepth: SPATIAL_SCENE_LIMITS.sourceDepth + 4,
    maximumValues: SPATIAL_SCENE_LIMITS.sourceValues + SPATIAL_SCENE_LIMITS.entities * 24
  }).sha256;
}
function compare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
function sortSpatialBy(items, id) {
  return [...items].sort((a, b) => compare(id(a), id(b)));
}
function unique(items, id, path) {
  const result = new Map;
  for (const item of items) {
    const key2 = id(item);
    if (result.has(key2))
      throw new SpatialSceneError("invalid-data", `Duplicate identity ${key2}.`, path);
    result.set(key2, item);
  }
  return result;
}
function requireReference(map, id, path) {
  const result = map.get(id);
  if (result === undefined)
    throw new SpatialSceneError("invalid-data", `Missing reference ${id}.`, path);
  return result;
}
function spatialTopologicalIds(edges, name) {
  const done = new Set;
  const active = new Set;
  const result = [];
  for (const id of edges.keys()) {
    const pending = [{ id, exit: false }];
    while (pending.length) {
      const next = pending.pop();
      if (next.exit) {
        active.delete(next.id);
        done.add(next.id);
        result.push(next.id);
        continue;
      }
      if (done.has(next.id))
        continue;
      if (active.has(next.id))
        throw new SpatialSceneError("invalid-data", `Cycle at ${next.id}.`, name);
      const dependencies = requireReference(edges, next.id, name);
      active.add(next.id);
      pending.push({ id: next.id, exit: true });
      for (const dependency of dependencies)
        pending.push({ id: dependency, exit: false });
    }
  }
  return Object.freeze(result);
}
function generatedSpatialEntityId(generatorId, key2) {
  SpatialGeneratorIdSchema.parse(generatorId);
  if (typeof key2 !== "string" || key2.length < 1 || key2.length > 256)
    throw new SpatialSceneError("invalid-data", "Generator keys must contain 1\u2013256 characters.");
  return `entity_${spatialValueSha256({ domain: "slopcamera.generated-entity.v1", generatorId, key: key2 })}`;
}
function normalizeEntity(entity) {
  if (entity.kind === "mesh")
    return { ...entity, material: { ...entity.material, color: entity.material.color.toLowerCase() } };
  if (entity.kind === "text" || entity.kind === "light")
    return { ...entity, color: entity.color.toLowerCase() };
  return entity;
}
function normalizeAsset(asset) {
  if (asset.interpretation.kind !== "video")
    return asset;
  const rate = asset.interpretation.frameRate;
  let { numerator: divisor, denominator: remainder } = rate;
  while (remainder !== 0) {
    const next = divisor % remainder;
    divisor = remainder;
    remainder = next;
  }
  return { ...asset, interpretation: { ...asset.interpretation, frameRate: { numerator: rate.numerator / divisor, denominator: rate.denominator / divisor } } };
}
function spatialGeneratorOutputSha256(input) {
  const entities = parseSpatialValue(SpatialEntitySchema.array().max(SPATIAL_SCENE_LIMITS.entities), input, "generator output");
  unique(entities, (item) => item.entityId, "generator output");
  return spatialValueSha256({ domain: "slopcamera.generator-output.v1", entities: sortSpatialBy(entities.map(normalizeEntity), (item) => item.entityId) });
}
function spatialAssetManifestSha256(input, dependencyDigests = {}) {
  const asset = normalizeAsset(parseSpatialValue(SpatialAssetManifestSchema, input, "asset manifest"));
  const captured = createBoundedJsonValueSnapshot(dependencyDigests, SPATIAL_SCENE_LIMITS.sourceBytes, "dependency identities", limits).value;
  if (captured === null || Array.isArray(captured) || typeof captured !== "object")
    throw new SpatialSceneError("invalid-data", "Dependency digests must be an object.");
  unique(asset.dependencies, (item) => item, "asset.dependencies");
  const dependencies = [...asset.dependencies].sort(compare).map((assetId) => {
    const sha256 = captured[assetId];
    if (typeof sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(sha256))
      throw new SpatialSceneError("invalid-data", `Missing dependency digest for ${assetId}.`);
    return { assetId, sha256 };
  });
  return spatialValueSha256({ domain: "slopcamera.asset-manifest.v1", payload: { sha256: asset.payload.sha256, bytes: asset.payload.bytes }, interpretation: asset.interpretation, dependencies });
}
function spatialAssetClosureDigests(assets) {
  const map = unique(assets, (asset) => asset.assetId, "assets");
  const order = spatialTopologicalIds(new Map(assets.map((asset) => [asset.assetId, asset.dependencies])), "asset dependencies");
  const digests = Object.create(null);
  for (const id of order)
    digests[id] = spatialAssetManifestSha256(map.get(id), digests);
  return Object.freeze(digests);
}
function spatialPropertySupported(entity, property) {
  if ((property === "color" || property === "opacity") && entity.kind === "mesh" && entity.geometry.kind === "asset" && entity.geometry.materialMode === "source")
    return false;
  if (property === "opacity")
    return ["mesh", "image", "video", "diagram"].includes(entity.kind);
  if (property === "color")
    return ["mesh", "text", "light"].includes(entity.kind);
  return true;
}
function validateSpatialOverrides(scene, overrides) {
  const entities = new Map(scene.entities.map((entity) => [entity.entityId, entity]));
  const generators = new Map(scene.generators.map((generator) => [generator.generatorId, generator]));
  unique(overrides, (override) => `${override.entityId}:${override.property}`, "overrides");
  for (const override of overrides) {
    const entity = requireReference(entities, override.entityId, "overrides");
    if (!spatialPropertySupported(entity, override.property))
      throw new SpatialSceneError("conflict", `Entity ${entity.entityId} does not support ${override.property}.`, "overrides");
    if (entity.origin.kind === "generated") {
      const origin = entity.origin;
      const generator = requireReference(generators, origin.generatorId, "overrides");
      if (!generator.editableKeys.some((item) => item.key === origin.key && item.properties.includes(override.property))) {
        throw new SpatialSceneError("conflict", `Undeclared override ${origin.key}.${override.property}.`, "overrides");
      }
    }
    const properties = override.property === "transform" ? ["position", "rotation", "scale"] : [override.property];
    if (scene.animations.some((channel) => channel.targetId === entity.entityId && properties.includes(channel.property))) {
      throw new SpatialSceneError("conflict", `Animation and override both write ${entity.entityId}.${override.property}.`, "overrides");
    }
  }
}
function parseSpatialScene(input) {
  const parsed = parseSpatialValue(SpatialSceneV1Schema, input, "scene");
  const scene = {
    ...parsed,
    entities: sortSpatialBy(parsed.entities.map(normalizeEntity), (item) => item.entityId),
    cameras: sortSpatialBy(parsed.cameras, (item) => item.cameraId),
    assets: sortSpatialBy(parsed.assets.map(normalizeAsset).map((asset) => ({ ...asset, dependencies: [...asset.dependencies].sort(compare) })), (item) => item.assetId),
    animations: sortSpatialBy(parsed.animations, (item) => item.channelId),
    generators: sortSpatialBy(parsed.generators.map((generator) => ({ ...generator, editableKeys: sortSpatialBy(generator.editableKeys.map((item) => ({ ...item, properties: [...item.properties].sort(compare) })), (item) => item.key) })), (item) => item.generatorId),
    overrides: sortSpatialBy(parsed.overrides.map((item) => item.property === "color" ? { ...item, value: item.value.toLowerCase() } : item), (item) => `${item.entityId}:${item.property}`)
  };
  const entities = unique(scene.entities, (entity) => entity.entityId, "entities");
  const cameras = unique(scene.cameras, (camera) => camera.cameraId, "cameras");
  const assets = unique(scene.assets, (asset) => asset.assetId, "assets");
  const generators = unique(scene.generators, (generator) => generator.generatorId, "generators");
  unique(scene.animations, (channel) => channel.channelId, "animations");
  unique(scene.animations, (channel) => `${channel.targetId}:${channel.property}`, "animation writers");
  let payloadBytes = 0;
  for (const asset of scene.assets) {
    unique(asset.dependencies, (id) => id, "asset dependencies");
    payloadBytes += asset.payload.bytes;
    if (payloadBytes > 268435456)
      throw new SpatialSceneError("invalid-data", "Asset closure exceeds 256 MiB.", "assets");
    if ((asset.interpretation.kind === "image" || asset.interpretation.kind === "video") && asset.interpretation.width * asset.interpretation.height > 33554432)
      throw new SpatialSceneError("invalid-data", "Asset exceeds the 32-megapixel limit.", "assets");
    if (asset.interpretation.kind === "metadata" && asset.payload.bytes > 1048576)
      throw new SpatialSceneError("invalid-data", "Retained metadata exceeds one MiB.", "assets");
  }
  spatialTopologicalIds(new Map(scene.assets.map((asset) => [asset.assetId, asset.dependencies])), "asset dependencies");
  spatialTopologicalIds(new Map(scene.entities.map((entity) => [entity.entityId, entity.parentId === null ? [] : [entity.parentId]])), "entity hierarchy");
  const generatedKeys = new Set;
  for (const entity of scene.entities) {
    if (entity.placement.kind === "view")
      requireReference(cameras, entity.placement.cameraId, "placement");
    if (entity.parentId !== null) {
      const parent = requireReference(entities, entity.parentId, "parent");
      const a = parent.placement, b = entity.placement;
      if (a.kind !== b.kind || a.kind === "view" && b.kind === "view" && (a.cameraId !== b.cameraId || a.units !== b.units))
        throw new SpatialSceneError("invalid-data", "Parent and child must share their world or view coordinate domain.", "placement");
    }
    if (entity.origin.kind === "generated") {
      const { generatorId, key: key2 } = entity.origin;
      requireReference(generators, generatorId, "origin");
      if (entity.entityId !== generatedSpatialEntityId(generatorId, key2))
        throw new SpatialSceneError("invalid-data", "Generated entity identity must derive from its generator and stable key.", "origin");
      const identity = `${generatorId}:${key2}`;
      if (generatedKeys.has(identity))
        throw new SpatialSceneError("invalid-data", "Duplicate generator output key.", "origin");
      generatedKeys.add(identity);
    }
    if (entity.kind === "environment" && (entity.placement.kind !== "world" || entity.parentId !== null)) {
      throw new SpatialSceneError("invalid-data", "Environment entities must be unparented world entities.", "placement");
    }
    if (entity.kind === "mesh" && entity.material.map !== undefined) {
      if (entity.geometry.kind === "asset")
        throw new SpatialSceneError("invalid-data", "Material maps apply to authored procedural geometry only.", "entities");
      const mapAsset = requireReference(assets, entity.material.map, "entity asset");
      if (mapAsset.interpretation.kind !== "image")
        throw new SpatialSceneError("invalid-data", `Entity ${entity.entityId} material map requires an image asset.`, "entity asset");
    }
    const reference = entity.kind === "mesh" && entity.geometry.kind === "asset" ? { assetId: entity.geometry.assetId, kind: "gltf" } : entity.kind === "text" ? { assetId: entity.fontAssetId, kind: "font" } : entity.kind === "environment" ? { assetId: entity.assetId, kind: "image" } : ("assetId" in entity) ? { assetId: entity.assetId, kind: entity.kind } : undefined;
    if (reference) {
      const asset = requireReference(assets, reference.assetId, "entity asset");
      if (asset.interpretation.kind !== reference.kind)
        throw new SpatialSceneError("invalid-data", `Entity ${entity.entityId} requires a ${reference.kind} asset.`, "entity asset");
      if (entity.kind === "video" && asset.interpretation.kind === "video" && entity.sourceOffsetUs >= asset.interpretation.durationUs)
        throw new SpatialSceneError("invalid-data", "Video source offset must precede its duration.", "sourceOffsetUs");
    }
  }
  for (const generator of scene.generators) {
    unique(generator.editableKeys, (item) => item.key, "generator editable keys");
    for (const editable of generator.editableKeys) {
      unique(editable.properties, (item) => item, "generator editable properties");
      const entity = entities.get(generatedSpatialEntityId(generator.generatorId, editable.key));
      if (!entity)
        throw new SpatialSceneError("conflict", `Orphan editable key ${editable.key}.`, "generators");
      if (editable.properties.some((property) => !spatialPropertySupported(entity, property)))
        throw new SpatialSceneError("invalid-data", `Editable key ${editable.key} declares an unsupported property.`, "generators");
    }
    const retained = scene.entities.filter((entity) => entity.origin.kind === "generated" && entity.origin.generatorId === generator.generatorId);
    if (spatialGeneratorOutputSha256(retained) !== generator.outputSha256)
      throw new SpatialSceneError("conflict", "Retained generator output does not match its pinned digest.", "generators");
  }
  for (const channel of scene.animations) {
    const entity = entities.get(channel.targetId);
    if (entity === undefined) {
      requireReference(cameras, channel.targetId, "animation target");
      if (channel.property !== "position" && channel.property !== "rotation")
        throw new SpatialSceneError("invalid-data", "Camera animation supports only position and rotation.", "animations");
    } else {
      if (!spatialPropertySupported(entity, channel.property))
        throw new SpatialSceneError("invalid-data", `Unsupported ${channel.property} animation.`, "animations");
      if (entity.origin.kind === "generated") {
        const origin = entity.origin;
        const control = channel.property === "opacity" ? "opacity" : "transform";
        if (!generators.get(origin.generatorId).editableKeys.some((item) => item.key === origin.key && item.properties.includes(control)))
          throw new SpatialSceneError("conflict", `Generated animation requires declared ${control} control.`, "animations");
      }
    }
    let previous = -1;
    for (const key2 of channel.keys) {
      if (key2.timeUs <= previous || key2.timeUs > scene.durationUs)
        throw new SpatialSceneError("invalid-data", "Animation keys must be strictly ordered within scene duration.", "animations");
      previous = key2.timeUs;
    }
  }
  validateSpatialOverrides(scene, scene.overrides);
  return deepFreezeJson(scene);
}
function spatialSceneSha256(input) {
  return spatialValueSha256(parseSpatialScene(input));
}

// src/spatial-scene/math.ts
var MAX_ABS_COMPONENT = 1000000000000;
var MAX_IMAGE_DIMENSION = 1e6;
var AFFINE_TOLERANCE = 0.000000000001;
var RIGID_TOLERANCE = 0.00000001;
var MIN_RELATIVE_DETERMINANT = 0.000000000001;
function number(value, label) {
  if (!Number.isFinite(value) || Math.abs(value) > MAX_ABS_COMPONENT) {
    throw new RangeError(`${label} must be finite with magnitude <= ${MAX_ABS_COMPONENT}`);
  }
  return value;
}
function values(value, length, label) {
  if (!Array.isArray(value) || value.length !== length)
    throw new RangeError(`${label} must have ${length} components`);
  for (let index = 0;index < length; index++)
    number(value[index], `${label}[${index}]`);
}
function vec2(x, y) {
  return Object.freeze([number(x, "x"), number(y, "y")]);
}
function vec3(x, y, z2) {
  return Object.freeze([number(x, "x"), number(y, "y"), number(z2, "z")]);
}
function matrix(value) {
  values(value, 16, "matrix");
  return Object.freeze(value);
}
function affine(value) {
  values(value, 16, "transform");
  if (Math.abs(value[3]) > AFFINE_TOLERANCE || Math.abs(value[7]) > AFFINE_TOLERANCE || Math.abs(value[11]) > AFFINE_TOLERANCE || Math.abs(value[15] - 1) > AFFINE_TOLERANCE) {
    throw new RangeError("transform must be affine with bottom row [0,0,0,1]");
  }
}
var IDENTITY_MATRIX = matrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
function normalizeQuaternion(q) {
  values(q, 4, "quaternion");
  const length = Math.hypot(...q);
  if (length === 0)
    throw new RangeError("quaternion must be nonzero");
  return Object.freeze([q[0] / length, q[1] / length, q[2] / length, q[3] / length]);
}
function composeTransform(transform) {
  values(transform.position, 3, "position");
  values(transform.scale, 3, "scale");
  const [x, y, z2, w] = normalizeQuaternion(transform.rotation);
  const [sx, sy, sz] = transform.scale;
  return matrix([
    (1 - 2 * (y * y + z2 * z2)) * sx,
    2 * (x * y + z2 * w) * sx,
    2 * (x * z2 - y * w) * sx,
    0,
    2 * (x * y - z2 * w) * sy,
    (1 - 2 * (x * x + z2 * z2)) * sy,
    2 * (y * z2 + x * w) * sy,
    0,
    2 * (x * z2 + y * w) * sz,
    2 * (y * z2 - x * w) * sz,
    (1 - 2 * (x * x + y * y)) * sz,
    0,
    ...transform.position,
    1
  ]);
}
function multiplyTransforms(parent, local) {
  affine(parent);
  affine(local);
  const output = new Array(16).fill(0);
  for (let col = 0;col < 4; col++) {
    for (let row = 0;row < 3; row++) {
      output[col * 4 + row] = parent[row] * local[col * 4] + parent[4 + row] * local[col * 4 + 1] + parent[8 + row] * local[col * 4 + 2] + (col === 3 ? parent[12 + row] : 0);
    }
  }
  output[15] = 1;
  return matrix(output);
}
function invertTransform(transform) {
  affine(transform);
  const scale = Math.max(...[0, 1, 2, 4, 5, 6, 8, 9, 10].map((index) => Math.abs(transform[index])));
  if (scale === 0)
    throw new RangeError("transform is singular");
  const [a, b, c, d, e, f, g, h, i] = [0, 4, 8, 1, 5, 9, 2, 6, 10].map((index) => transform[index] / scale);
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) <= MIN_RELATIVE_DETERMINANT)
    throw new RangeError("transform is singular or ill-conditioned");
  const factor = 1 / det / scale;
  const r00 = (e * i - f * h) * factor, r01 = (c * h - b * i) * factor, r02 = (b * f - c * e) * factor;
  const r10 = (f * g - d * i) * factor, r11 = (a * i - c * g) * factor, r12 = (c * d - a * f) * factor;
  const r20 = (d * h - e * g) * factor, r21 = (b * g - a * h) * factor, r22 = (a * e - b * d) * factor;
  const [tx, ty, tz] = [transform[12], transform[13], transform[14]];
  return matrix([
    r00,
    r10,
    r20,
    0,
    r01,
    r11,
    r21,
    0,
    r02,
    r12,
    r22,
    0,
    -(r00 * tx + r01 * ty + r02 * tz),
    -(r10 * tx + r11 * ty + r12 * tz),
    -(r20 * tx + r21 * ty + r22 * tz),
    1
  ]);
}
function transformPoint(transform, point) {
  affine(transform);
  values(point, 3, "point");
  return apply(transform, point, true);
}
function transformDirection(transform, direction) {
  affine(transform);
  values(direction, 3, "direction");
  return apply(transform, direction, false);
}
function apply(m, v, translate) {
  return vec3(m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + (translate ? m[12] : 0), m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + (translate ? m[13] : 0), m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + (translate ? m[14] : 0));
}
function slerpQuaternion(from, to, t) {
  number(t, "t");
  if (t < 0 || t > 1)
    throw new RangeError("t must be in [0,1]");
  const a = normalizeQuaternion(from);
  const normalizedTo = normalizeQuaternion(to);
  let dot = a.reduce((sum, value, index) => sum + value * normalizedTo[index], 0);
  const b = dot < 0 ? normalizedTo.map((value) => -value) : normalizedTo;
  dot = Math.min(1, Math.max(0, Math.abs(dot)));
  let left = 1 - t, right = t;
  if (dot < 0.9995) {
    const angle = Math.acos(dot), sine = Math.sin(angle);
    left = Math.sin((1 - t) * angle) / sine;
    right = Math.sin(t * angle) / sine;
  }
  return normalizeQuaternion([
    left * a[0] + right * b[0],
    left * a[1] + right * b[1],
    left * a[2] + right * b[2],
    left * a[3] + right * b[3]
  ]);
}
function projection(p) {
  for (const value of [p.width, p.height]) {
    if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_IMAGE_DIMENSION)
      throw new RangeError("image dimensions must be positive bounded integers");
  }
  number(p.near, "near");
  number(p.far, "far");
  if (p.near <= 0 || p.far <= p.near)
    throw new RangeError("clipping requires 0 < near < far");
  if (p.kind === "perspective") {
    for (const key2 of ["fx", "fy", "cx", "cy"])
      number(p[key2], key2);
    if (p.fx <= 0 || p.fy <= 0)
      throw new RangeError("focal lengths in pixels must be positive");
  } else if (p.kind === "orthographic") {
    for (const key2 of ["left", "right", "bottom", "top"])
      number(p[key2], key2);
    if (p.left >= p.right || p.bottom >= p.top)
      throw new RangeError("orthographic extents must be ordered");
  } else {
    throw new RangeError("unsupported projection");
  }
}
function camera(camera2) {
  projection(camera2.projection);
  const m = camera2.cameraToWorld;
  affine(m);
  const columns = [[m[0], m[1], m[2]], [m[4], m[5], m[6]], [m[8], m[9], m[10]]];
  for (let i = 0;i < 3; i++) {
    for (let j = i;j < 3; j++) {
      const dot = columns[i].reduce((sum, value, index) => sum + value * columns[j][index], 0);
      if (Math.abs(dot - (i === j ? 1 : 0)) > RIGID_TOLERANCE)
        throw new RangeError("camera pose must be rigid without scale or shear");
    }
  }
  const determinant = m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
  if (determinant <= 0)
    throw new RangeError("camera pose must preserve handedness");
}
function prepareCameraView(view) {
  camera(view);
  return Object.freeze({ ...view, worldToCamera: invertTransform(view.cameraToWorld) });
}
function projectPreparedPoint(prepared, worldPoint) {
  values(worldPoint, 3, "world point");
  const local = apply(prepared.worldToCamera, worldPoint, true);
  const depthMeters = -local[2];
  if (depthMeters <= 0)
    return null;
  const p = prepared.projection;
  const pixel = p.kind === "perspective" ? vec2(p.fx * local[0] / depthMeters + p.cx, p.cy - p.fy * local[1] / depthMeters) : vec2((local[0] - p.left) / (p.right - p.left) * p.width, (p.top - local[1]) / (p.top - p.bottom) * p.height);
  return Object.freeze({
    pixel,
    depthMeters,
    insideImage: pixel[0] >= 0 && pixel[0] < p.width && pixel[1] >= 0 && pixel[1] < p.height,
    insideClip: depthMeters >= p.near && depthMeters <= p.far
  });
}
function projectPoint(view, worldPoint) {
  return projectPreparedPoint(prepareCameraView(view), worldPoint);
}
function unprojectPixel(view, pixel, depthMeters) {
  camera(view);
  values(pixel, 2, "pixel");
  number(depthMeters, "depth");
  if (depthMeters <= 0)
    throw new RangeError("axial depth must be positive");
  const p = view.projection;
  const local = p.kind === "perspective" ? [(pixel[0] - p.cx) / p.fx * depthMeters, (p.cy - pixel[1]) / p.fy * depthMeters, -depthMeters] : [p.left + pixel[0] / p.width * (p.right - p.left), p.top - pixel[1] / p.height * (p.top - p.bottom), -depthMeters];
  values(local, 3, "unprojected local point");
  return apply(view.cameraToWorld, local, true);
}
function pixelRay(view, pixel) {
  camera(view);
  values(pixel, 2, "pixel");
  const p = view.projection;
  const x = p.kind === "perspective" ? (pixel[0] - p.cx) / p.fx : p.left + pixel[0] / p.width * (p.right - p.left);
  const y = p.kind === "perspective" ? (p.cy - pixel[1]) / p.fy : p.top - pixel[1] / p.height * (p.top - p.bottom);
  const length = p.kind === "perspective" ? Math.hypot(x, y, 1) : 1;
  const origin = apply(view.cameraToWorld, p.kind === "perspective" ? [0, 0, 0] : vec3(x, y, 0), true);
  const direction = apply(view.cameraToWorld, p.kind === "perspective" ? vec3(x / length, y / length, -1 / length) : [0, 0, -1], false);
  return Object.freeze({
    origin,
    direction,
    nearDistanceMeters: number(p.near * length, "near ray distance"),
    farDistanceMeters: number(p.far * length, "far ray distance")
  });
}
function transformBounds(transform, bounds) {
  affine(transform);
  values(bounds.min, 3, "bounds min");
  values(bounds.max, 3, "bounds max");
  if (bounds.min.some((value, index) => value > bounds.max[index]))
    throw new RangeError("bounds must have min <= max");
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let mask = 0;mask < 8; mask++) {
    const point = apply(transform, [mask & 1 ? bounds.max[0] : bounds.min[0], mask & 2 ? bounds.max[1] : bounds.min[1], mask & 4 ? bounds.max[2] : bounds.min[2]], true);
    for (let index = 0;index < 3; index++) {
      min[index] = Math.min(min[index], point[index]);
      max[index] = Math.max(max[index], point[index]);
    }
  }
  return Object.freeze({ min: vec3(min[0], min[1], min[2]), max: vec3(max[0], max[1], max[2]) });
}
function cameraMathView(camera2) {
  return Object.freeze({ projection: camera2.projection, cameraToWorld: composeTransform({ ...camera2.pose, scale: [1, 1, 1] }) });
}

// src/spatial-scene/evaluate.ts
import { z as z2 } from "zod";
var EvaluatedOptionsSchema = z2.strictObject({
  timeUs: SpatialTimeUsSchema,
  cameraId: SpatialCameraIdSchema,
  overrides: z2.array(SpatialOverrideSchema).max(SPATIAL_SCENE_LIMITS.entities).optional(),
  cameraPoseOverride: SpatialPoseSchema.optional()
});
function mergeSpatialOverrides(sceneOverrides, shotOverrides) {
  const effective = new Map(sceneOverrides.map((override) => [`${override.entityId}:${override.property}`, override]));
  const seen = new Set;
  for (const override of shotOverrides) {
    const key2 = `${override.entityId}:${override.property}`;
    if (seen.has(key2))
      throw new SpatialSceneError("conflict", `Duplicate shot override ${key2}.`, "shot.overrides");
    seen.add(key2);
    effective.set(key2, override);
  }
  return deepFreezeJson(sortSpatialBy([...effective.values()], (item) => `${item.entityId}:${item.property}`));
}
function applySpatialEntityOverride(entity, override) {
  if (!spatialPropertySupported(entity, override.property))
    throw new SpatialSceneError("conflict", `Unsupported override ${entity.entityId}.${override.property}.`);
  if (override.property === "transform")
    return { ...entity, transform: override.value };
  if (override.property === "color") {
    const color2 = override.value.toLowerCase();
    if (entity.kind === "mesh")
      return { ...entity, material: { ...entity.material, color: color2 } };
    if (entity.kind === "text" || entity.kind === "light")
      return { ...entity, color: color2 };
  }
  if (override.property === "opacity") {
    if (entity.kind === "mesh")
      return { ...entity, material: { ...entity.material, opacity: override.value } };
    if (entity.kind === "image" || entity.kind === "diagram" || entity.kind === "video")
      return { ...entity, opacity: override.value };
  }
  throw new SpatialSceneError("conflict", `Unsupported override ${entity.entityId}.${override.property}.`);
}
function sampleChannel(channel, timeUs) {
  const keys = channel.keys;
  if (timeUs <= keys[0].timeUs)
    return keys[0].value;
  if (timeUs >= keys[keys.length - 1].timeUs)
    return keys[keys.length - 1].value;
  let lower = 0, upper = keys.length - 1;
  while (upper - lower > 1) {
    const middle = Math.floor((lower + upper) / 2);
    if (keys[middle].timeUs <= timeUs)
      lower = middle;
    else
      upper = middle;
  }
  const a = keys[lower], b = keys[upper];
  if (channel.interpolation === "step")
    return a.value;
  const t = (timeUs - a.timeUs) / (b.timeUs - a.timeUs);
  if (channel.property === "rotation") {
    return slerpQuaternion(channel.keys[lower].value, channel.keys[upper].value, t);
  }
  if (typeof a.value === "number" && typeof b.value === "number")
    return a.value + (b.value - a.value) * t;
  const av = a.value, bv = b.value;
  return av.map((value, index) => value + (bv[index] - value) * t);
}
function validateSpatialShot(sceneInput, shotInput) {
  const context = createSpatialEvaluationContext(sceneInput);
  const scene = context.scene;
  const shot = parseSpatialValue(SpatialShotV1Schema, shotInput, "shot");
  if (shot.sceneSha256 !== context.sceneSha256)
    throw new SpatialSceneError("conflict", "Shot pins another scene revision.", "shot.sceneSha256");
  if (!context.camerasById.has(shot.cameraId))
    throw new SpatialSceneError("invalid-data", "Shot camera is absent from its scene.", "shot.cameraId");
  if (shot.sceneStartUs >= scene.durationUs)
    throw new SpatialSceneError("invalid-data", "Shot scene start must precede scene duration.", "shot.sceneStartUs");
  if (shot.playback === "once" && shot.sceneStartUs + shot.range.endUs - shot.range.startUs > scene.durationUs)
    throw new SpatialSceneError("invalid-data", "Once playback exceeds scene duration.", "shot.range");
  validateSpatialOverrides(scene, mergeSpatialOverrides(scene.overrides, shot.overrides));
  if (shot.cameraPoseOverride && context.cameraChannelsById.has(shot.cameraId))
    throw new SpatialSceneError("conflict", "Camera animation and shot pose override both own camera pose.", "shot.cameraPoseOverride");
  return deepFreezeJson(shot);
}
function createSpatialEvaluationContext(sceneInput) {
  const scene = parseSpatialScene(sceneInput);
  const entitiesById = new Map(scene.entities.map((entity) => [entity.entityId, entity]));
  const camerasById = new Map(scene.cameras.map((camera2) => [camera2.cameraId, camera2]));
  const entityOrder = spatialTopologicalIds(new Map(scene.entities.map((entity) => [entity.entityId, entity.parentId === null ? [] : [entity.parentId]])), "entity hierarchy");
  const visibilityById = new Map;
  for (const id of entityOrder) {
    const entity = entitiesById.get(id);
    visibilityById.set(id, entity.visible && (entity.parentId === null || visibilityById.get(entity.parentId) === true));
  }
  const entityChannels = [];
  const cameraChannelsById = new Map;
  for (const channel of scene.animations) {
    if (entitiesById.has(channel.targetId))
      entityChannels.push(channel);
    else {
      const list = cameraChannelsById.get(channel.targetId) ?? [];
      list.push(channel);
      cameraChannelsById.set(channel.targetId, list);
    }
  }
  return Object.freeze({
    scene,
    sceneSha256: spatialValueSha256(scene),
    entitiesById,
    camerasById,
    entityOrder,
    visibilityById,
    entityChannels,
    cameraChannelsById,
    baseOverrides: mergeSpatialOverrides(scene.overrides, []),
    assetDigests: spatialAssetClosureDigests(scene.assets)
  });
}
function evaluateSpatialSceneInContext(context, options) {
  const scene = context.scene;
  const capturedOptions = parseSpatialValue(EvaluatedOptionsSchema, options, "evaluation options");
  const timeUs = capturedOptions.timeUs;
  if (timeUs > scene.durationUs)
    throw new SpatialSceneError("invalid-data", "Evaluation time exceeds scene duration.", "timeUs");
  let camera2 = context.camerasById.get(capturedOptions.cameraId);
  if (!camera2)
    throw new SpatialSceneError("not-found", `Unknown camera ${capturedOptions.cameraId}.`, "cameraId");
  const overrides = capturedOptions.overrides === undefined ? context.baseOverrides : mergeSpatialOverrides(scene.overrides, capturedOptions.overrides);
  if (capturedOptions.overrides !== undefined)
    validateSpatialOverrides(scene, overrides);
  if (capturedOptions.cameraPoseOverride && context.cameraChannelsById.has(camera2.cameraId))
    throw new SpatialSceneError("conflict", "Camera animation conflicts with camera pose override.", "cameraPoseOverride");
  const entities = new Map(context.entitiesById);
  for (const channel of context.entityChannels) {
    const value = sampleChannel(channel, timeUs);
    const entity = entities.get(channel.targetId);
    if (channel.property === "opacity")
      entities.set(entity.entityId, applySpatialEntityOverride(entity, { entityId: entity.entityId, property: "opacity", value }));
    else
      entities.set(entity.entityId, { ...entity, transform: { ...entity.transform, [channel.property]: value } });
  }
  for (const channel of context.cameraChannelsById.get(camera2.cameraId) ?? []) {
    const value = sampleChannel(channel, timeUs);
    camera2 = { ...camera2, pose: { ...camera2.pose, [channel.property]: value } };
  }
  for (const override of overrides)
    entities.set(override.entityId, applySpatialEntityOverride(entities.get(override.entityId), override));
  if (capturedOptions.cameraPoseOverride)
    camera2 = { ...camera2, pose: capturedOptions.cameraPoseOverride };
  const matrices = new Map;
  for (const id of context.entityOrder) {
    const entity = entities.get(id);
    try {
      const local = composeTransform(entity.transform);
      matrices.set(id, entity.parentId === null ? local : multiplyTransforms(matrices.get(entity.parentId), local));
    } catch (error) {
      throw new SpatialSceneError("invalid-data", error instanceof Error ? error.message : "Invalid evaluated transform.", `entities.${id}.transform`);
    }
  }
  const evaluated = scene.entities.map((source, index) => ({
    entity: entities.get(source.entityId),
    worldMatrix: matrices.get(source.entityId),
    visible: context.visibilityById.get(source.entityId),
    selectionId: index + 1
  }));
  const stateSha256 = spatialStateValueSha256({ domain: "slopcamera.spatial-state.v1", timeUs, entities: evaluated, assetDigests: context.assetDigests });
  const viewSha256 = spatialValueSha256({ domain: "slopcamera.spatial-view.v1", stateSha256, camera: camera2 });
  const result = EvaluatedSpatialSceneSchema.parse({
    kind: "slopcamera.spatial-snapshot",
    schemaVersion: 1,
    sceneSha256: context.sceneSha256,
    stateSha256,
    viewSha256,
    timeUs,
    camera: camera2,
    entities: evaluated.map((item) => ({ ...item, visible: item.visible && (item.entity.placement.kind === "world" || item.entity.placement.cameraId === camera2.cameraId) })),
    assets: scene.assets
  });
  return deepFreezeJson(result);
}
function evaluateSpatialScene(sceneInput, options) {
  return evaluateSpatialSceneInContext(createSpatialEvaluationContext(sceneInput), options);
}

// src/spatial-scene/patch.ts
function diffCollection(collection, before, after, identify) {
  const old = new Map(before.map((item) => [identify(item), item]));
  const current = new Map(after.map((item) => [identify(item), item]));
  const result = [];
  for (const id of [...new Set([...old.keys(), ...current.keys()])].sort()) {
    const a = old.get(id), b = current.get(id);
    if (a === undefined || b === undefined) {
      result.push({ kind: a === undefined ? "added" : "removed", collection, id, properties: Object.keys(a ?? b).sort() });
    } else {
      const aRecord = a, bRecord = b;
      const properties = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort().filter((key2) => spatialValueSha256(Object.hasOwn(a, key2) ? { value: aRecord[key2] } : {}) !== spatialValueSha256(Object.hasOwn(b, key2) ? { value: bRecord[key2] } : {}));
      if (properties.length)
        result.push({ kind: "changed", collection, id, properties });
    }
  }
  return result;
}
function diffSpatialScenes(beforeInput, afterInput) {
  const before = parseSpatialScene(beforeInput);
  const after = parseSpatialScene(afterInput);
  return deepFreezeJson([
    ...diffCollection("assets", before.assets, after.assets, (asset) => asset.assetId),
    ...diffCollection("entities", before.entities, after.entities, (entity) => entity.entityId),
    ...diffCollection("cameras", before.cameras, after.cameras, (camera2) => camera2.cameraId),
    ...diffCollection("animations", before.animations, after.animations, (channel) => channel.channelId),
    ...diffCollection("generators", before.generators, after.generators, (generator) => generator.generatorId),
    ...diffCollection("overrides", before.overrides, after.overrides, (override) => `${override.entityId}:${override.property}`)
  ]);
}
function applySpatialScenePatch(sceneInput, patchInput) {
  const original = parseSpatialScene(sceneInput);
  const patch = parseSpatialValue(SpatialScenePatchV1Schema, patchInput, "scene patch");
  if (patch.expectedSceneSha256 !== spatialValueSha256(original))
    throw new SpatialSceneError("conflict", "Scene revision changed; inspect and rebase the patch.", "expectedSceneSha256");
  const entities = new Map(original.entities.map((entity) => [entity.entityId, entity]));
  const assets = new Map(original.assets.map((asset) => [asset.assetId, asset]));
  const addressedGeometry = new Set, replacedGenerators = new Set;
  const cameras = new Map(original.cameras.map((camera2) => [camera2.cameraId, camera2]));
  const animations = new Map(original.animations.map((channel) => [channel.channelId, channel]));
  const generators = new Map(original.generators.map((generator) => [generator.generatorId, generator]));
  const overrides = new Map(original.overrides.map((override) => [`${override.entityId}:${override.property}`, override]));
  function authored(id) {
    const entity = entities.get(id);
    if (!entity)
      throw new SpatialSceneError("not-found", `Entity ${id} does not exist.`, "operations");
    if (entity.origin.kind !== "authored")
      throw new SpatialSceneError("conflict", "Generated entities can be edited only through declared overrides or retained output replacement.", "operations");
    return entity;
  }
  for (const operation of patch.operations) {
    switch (operation.kind) {
      case "add-asset":
        if (assets.has(operation.asset.assetId))
          throw new SpatialSceneError("conflict", `Asset ${operation.asset.assetId} already exists.`);
        assets.set(operation.asset.assetId, operation.asset);
        break;
      case "replace-asset":
        if (!assets.has(operation.asset.assetId))
          throw new SpatialSceneError("not-found", `Asset ${operation.asset.assetId} does not exist.`);
        assets.set(operation.asset.assetId, operation.asset);
        break;
      case "set-mesh-geometry": {
        const entity = authored(operation.entityId);
        if (entity.kind !== "mesh")
          throw new SpatialSceneError("conflict", "Geometry replacement requires an authored mesh wrapper.");
        entities.set(operation.entityId, { ...entity, geometry: operation.geometry });
        addressedGeometry.add(operation.entityId);
        break;
      }
      case "set-material": {
        const entity = authored(operation.entityId);
        if (entity.kind !== "mesh")
          throw new SpatialSceneError("conflict", "Material replacement requires an authored mesh entity.");
        if (entity.geometry.kind === "asset" && entity.geometry.materialMode === "source")
          throw new SpatialSceneError("conflict", "Source-material meshes consume source materials only; the entity material is inert.");
        entities.set(operation.entityId, { ...entity, material: operation.material });
        break;
      }
      case "rename-entity":
        entities.set(operation.entityId, { ...authored(operation.entityId), name: operation.name });
        break;
      case "reparent-entity":
        entities.set(operation.entityId, { ...authored(operation.entityId), parentId: operation.parentId });
        break;
      case "set-transform":
        entities.set(operation.entityId, { ...authored(operation.entityId), transform: operation.transform });
        break;
      case "set-color":
        entities.set(operation.entityId, applySpatialEntityOverride(authored(operation.entityId), { entityId: operation.entityId, property: "color", value: operation.color }));
        break;
      case "set-opacity":
        entities.set(operation.entityId, applySpatialEntityOverride(authored(operation.entityId), { entityId: operation.entityId, property: "opacity", value: operation.opacity }));
        break;
      case "set-camera":
        cameras.set(operation.camera.cameraId, operation.camera);
        break;
      case "set-channel":
        animations.set(operation.channel.channelId, operation.channel);
        break;
      case "remove-channel":
        if (!animations.delete(operation.channelId))
          throw new SpatialSceneError("not-found", `Channel ${operation.channelId} does not exist.`);
        break;
      case "add-entity":
        if (entities.has(operation.entity.entityId))
          throw new SpatialSceneError("conflict", `Entity ${operation.entity.entityId} already exists.`);
        if (operation.entity.origin.kind !== "authored")
          throw new SpatialSceneError("conflict", "Add generated entities through retained generator output replacement.");
        entities.set(operation.entity.entityId, operation.entity);
        if (operation.entity.kind === "mesh")
          addressedGeometry.add(operation.entity.entityId);
        break;
      case "remove-entity":
        authored(operation.entityId);
        entities.delete(operation.entityId);
        break;
      case "set-override":
        overrides.set(`${operation.override.entityId}:${operation.override.property}`, operation.override);
        break;
      case "remove-override":
        if (!overrides.delete(`${operation.entityId}:${operation.property}`))
          throw new SpatialSceneError("not-found", "Override does not exist.");
        break;
      case "replace-generator-output": {
        const generatorId = operation.generator.generatorId;
        replacedGenerators.add(generatorId);
        for (const entity of entities.values())
          if (entity.origin.kind === "generated" && entity.origin.generatorId === generatorId)
            entities.delete(entity.entityId);
        for (const entity of operation.entities) {
          if (entity.origin.kind !== "generated" || entity.origin.generatorId !== generatorId)
            throw new SpatialSceneError("conflict", "Generator replacement must contain only its own retained output.");
          if (entities.has(entity.entityId))
            throw new SpatialSceneError("conflict", `Generator output collides with ${entity.entityId}.`);
          entities.set(entity.entityId, entity);
        }
        generators.set(generatorId, operation.generator);
        break;
      }
    }
  }
  const scene = parseSpatialScene({ ...original, assets: [...assets.values()], entities: [...entities.values()], cameras: [...cameras.values()], animations: [...animations.values()], generators: [...generators.values()], overrides: [...overrides.values()] });
  const beforeAssets = new Map(original.assets.map((asset) => [asset.assetId, asset]));
  const oldClosure = spatialAssetClosureDigests(original.assets), newClosure = spatialAssetClosureDigests(scene.assets);
  for (const entity of scene.entities) {
    const referenced = entity.kind === "mesh" && entity.geometry.kind === "asset" ? [entity.geometry.assetId] : entity.kind === "text" ? [entity.fontAssetId] : ("assetId" in entity) ? [entity.assetId] : [];
    if (entity.kind === "mesh" && entity.material.map !== undefined)
      referenced.push(entity.material.map);
    for (const assetId of referenced) {
      if (entity.origin.kind === "generated" && oldClosure[assetId] !== undefined && oldClosure[assetId] !== newClosure[assetId] && !replacedGenerators.has(entity.origin.generatorId)) {
        throw new SpatialSceneError("conflict", "Changing a generated part's asset closure requires explicit retained generator output replacement.");
      }
    }
    if (entity.kind === "mesh" && entity.geometry.kind === "asset" && (entity.geometry.nodeIndex !== undefined || entity.geometry.clip !== undefined) && beforeAssets.has(entity.geometry.assetId) && beforeAssets.get(entity.geometry.assetId).payload.sha256 !== assets.get(entity.geometry.assetId).payload.sha256 && !addressedGeometry.has(entity.entityId) && !(entity.origin.kind === "generated" && replacedGenerators.has(entity.origin.generatorId))) {
      throw new SpatialSceneError("conflict", "Replacing addressed GLB bytes requires explicit set-mesh-geometry with the new local node/clip addresses; internal correspondence is not inferred.");
    }
  }
  const diff = diffSpatialScenes(original, scene);
  return deepFreezeJson({ scene, sceneSha256: spatialValueSha256(scene), diff });
}

export { SPATIAL_SCENE_LIMITS, SpatialDigestSchema, SpatialSceneIdSchema, SpatialEntityIdSchema, SpatialCameraIdSchema, SpatialAssetIdSchema, SpatialGeneratorIdSchema, SpatialChannelIdSchema, SpatialShotIdSchema, SpatialTimeUsSchema, SpatialVec3Schema, SpatialQuaternionSchema, SpatialTransformSchema, SpatialPoseSchema, SpatialFrameRateSchema, SpatialProjectionSchema, SpatialCameraSchema, SpatialPayloadSchema, SpatialAssetInterpretationSchema, SpatialAssetManifestSchema, SpatialMaterialSchema, SpatialGeometrySchema, SpatialOriginSchema, SpatialPlacementSchema, SpatialEntitySchema, SpatialAnimationSchema, SpatialOverrideSchema, SpatialGeneratorSchema, SpatialSceneV1Schema, SpatialPatchOperationSchema, SpatialScenePatchV1Schema, SpatialShotV1Schema, SpatialMatrixSchema, EvaluatedSpatialSceneSchema, SpatialSceneError, parseSpatialValue, spatialValueSha256, spatialStateValueSha256, sortSpatialBy, spatialTopologicalIds, generatedSpatialEntityId, spatialGeneratorOutputSha256, spatialAssetManifestSha256, spatialAssetClosureDigests, spatialPropertySupported, validateSpatialOverrides, parseSpatialScene, spatialSceneSha256, MAX_ABS_COMPONENT, MAX_IMAGE_DIMENSION, IDENTITY_MATRIX, normalizeQuaternion, composeTransform, multiplyTransforms, invertTransform, transformPoint, transformDirection, slerpQuaternion, prepareCameraView, projectPreparedPoint, projectPoint, unprojectPixel, pixelRay, transformBounds, cameraMathView, mergeSpatialOverrides, applySpatialEntityOverride, validateSpatialShot, createSpatialEvaluationContext, evaluateSpatialSceneInContext, evaluateSpatialScene, diffSpatialScenes, applySpatialScenePatch };
