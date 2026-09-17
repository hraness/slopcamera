// @bun
import {
  EvaluatedSpatialSceneSchema,
  IDENTITY_MATRIX,
  MAX_ABS_COMPONENT,
  MAX_IMAGE_DIMENSION,
  SPATIAL_SCENE_LIMITS,
  SpatialAnimationSchema,
  SpatialAssetIdSchema,
  SpatialAssetInterpretationSchema,
  SpatialAssetManifestSchema,
  SpatialCameraIdSchema,
  SpatialCameraSchema,
  SpatialChannelIdSchema,
  SpatialDigestSchema,
  SpatialEntityIdSchema,
  SpatialEntitySchema,
  SpatialFrameRateSchema,
  SpatialGeneratorIdSchema,
  SpatialGeneratorSchema,
  SpatialGeometrySchema,
  SpatialMaterialSchema,
  SpatialMatrixSchema,
  SpatialOriginSchema,
  SpatialOverrideSchema,
  SpatialPatchOperationSchema,
  SpatialPayloadSchema,
  SpatialPlacementSchema,
  SpatialPoseSchema,
  SpatialProjectionSchema,
  SpatialQuaternionSchema,
  SpatialSceneError,
  SpatialSceneIdSchema,
  SpatialScenePatchV1Schema,
  SpatialSceneV1Schema,
  SpatialShotIdSchema,
  SpatialShotV1Schema,
  SpatialTimeUsSchema,
  SpatialTransformSchema,
  SpatialVec3Schema,
  applySpatialEntityOverride,
  applySpatialScenePatch,
  cameraMathView,
  composeTransform,
  createSpatialEvaluationContext,
  diffSpatialScenes,
  evaluateSpatialScene,
  evaluateSpatialSceneInContext,
  generatedSpatialEntityId,
  invertTransform,
  mergeSpatialOverrides,
  multiplyTransforms,
  normalizeQuaternion,
  parseSpatialScene,
  parseSpatialValue,
  pixelRay,
  prepareCameraView,
  projectPoint,
  projectPreparedPoint,
  slerpQuaternion,
  sortSpatialBy,
  spatialAssetClosureDigests,
  spatialAssetManifestSha256,
  spatialGeneratorOutputSha256,
  spatialPropertySupported,
  spatialSceneSha256,
  spatialStateValueSha256,
  spatialTopologicalIds,
  spatialValueSha256,
  transformBounds,
  transformDirection,
  transformPoint,
  unprojectPixel,
  validateSpatialOverrides,
  validateSpatialShot
} from "../index-yfbqn1na.js";
import {
  AuthoredGraphNodeV1Schema,
  AuthoredWorkflowGraphV1Schema,
  CompiledWorkflowGraphSchema,
  DEFAULT_GRAPH_COMPILER_LIMITS,
  GRAPH_ABI,
  GraphCompilerLimitsSchema,
  JsonValueSchema,
  MAX_WORKFLOW_RESULT_BYTES,
  MAX_WORKFLOW_RESULT_DEPTH,
  MAX_WORKFLOW_RESULT_VALUES,
  OperationDiscoverySchema,
  OperationKindSchema,
  OperationPolicySchema,
  PORTABLE_SLOPCAMERA_OPERATION_CONTRACTS,
  PORTABLE_SLOPCAMERA_OPERATION_KINDS,
  PUBLIC_SLOPCAMERA_WORKFLOW_PROJECTION,
  PUBLIC_WORKFLOW_REGISTRY_PROJECTION,
  PUBLIC_WORKFLOW_REGISTRY_PROJECTION_ID,
  PortableWorkflowBuilder,
  REQUIREMENT_ENVELOPE_VERSION,
  RequirementEnvelopeSchema,
  SerializedRefV1Schema,
  SlopcameraDiagramCheckInputSchema,
  SlopcameraDiagramCheckOutputSchema,
  SlopcameraDiagramRenderInputSchema,
  SlopcameraDiagramRenderOutputSchema,
  SlopcameraImageGenerateInputSchema,
  SlopcameraImageGenerateOutputSchema,
  SlopcameraImageModelSchema,
  SlopcameraImageVectorizeInputSchema,
  SlopcameraImageVectorizeOutputSchema,
  SlopcameraLintFindingSchema,
  SlopcameraRenderArtifactsSchema,
  SlopcameraVectorizeProvenanceSchema,
  SlopcameraVectorizeQualityReceiptSchema,
  SlopcameraVectorizeReceiptSchema,
  SlopcameraWorkflowRunError,
  WORKFLOW_COMPILATION_HASH_DOMAIN,
  WORKFLOW_COMPILATION_VERSION,
  WORKFLOW_GRAPH_HASH_DOMAIN,
  WORKFLOW_GRAPH_VERSION,
  WORKFLOW_NODE_RECEIPT_HASH_DOMAIN,
  WORKFLOW_NODE_RECEIPT_VERSION,
  WORKFLOW_REF_BRAND,
  WORKFLOW_REF_VERSION,
  buildWorkflow,
  buildWorkflowGraph,
  compileWorkflowGraph,
  createGraphHash,
  createPublicWorkflowRegistryProjection,
  createSlopcameraCodeHost,
  createWorkflowCompilationHash,
  createWorkflowGraphHash,
  definePortableWorkflowFragment,
  defineWorkflow,
  isPortableSlopcameraOperationKind,
  runBuiltWorkflow,
  runWorkflow,
  seconds
} from "../index-42zsesc1.js";
import {
  SlopcameraCodeError,
  asSlopcameraCodeError,
  boundedCanonicalJson,
  boundedCanonicalJsonSha256,
  canonicalJson,
  canonicalJsonSha256,
  createBoundedJsonValueSnapshot,
  deepFreezeJson,
  sha256Hex,
  slopcameraCodeErrorMessage
} from "../index-8txs6fkn.js";
import"../index-z1w83f81.js";

// src/spatial-scene/inspect.ts
function localBounds(entity) {
  let half;
  if (entity.kind === "mesh") {
    switch (entity.geometry.kind) {
      case "asset":
        return { status: "unknown", reason: "requires-asset-decoding" };
      case "box":
        half = entity.geometry.size.map((value) => value / 2);
        break;
      case "plane":
        half = [entity.geometry.width / 2, entity.geometry.height / 2, 0];
        break;
      case "sphere":
        half = [entity.geometry.radius, entity.geometry.radius, entity.geometry.radius];
        break;
      case "cylinder":
        half = [entity.geometry.radius, entity.geometry.height / 2, entity.geometry.radius];
        break;
    }
  } else if (entity.kind === "image" || entity.kind === "diagram" || entity.kind === "video")
    half = [entity.width / 2, entity.height / 2, 0];
  else
    return { status: "unknown", reason: entity.kind === "text" ? "requires-text-layout" : entity.kind === "splat" ? "requires-asset-decoding" : "no-surface" };
  return { min: [-half[0], -half[1], -half[2]], max: half };
}
function inspectSpatialScene(input) {
  const scene = parseSpatialScene(input);
  const snapshot = evaluateSpatialScene(scene, { timeUs: 0, cameraId: scene.cameras[0].cameraId });
  const digests = spatialAssetClosureDigests(scene.assets);
  return deepFreezeJson({
    sceneId: scene.sceneId,
    sceneSha256: spatialValueSha256(scene),
    durationUs: scene.durationUs,
    entities: snapshot.entities.map(({ entity, worldMatrix }) => {
      const origin = entity.origin;
      const declared = origin.kind === "generated" ? scene.generators.find((generator) => generator.generatorId === origin.generatorId).editableKeys.find((item) => item.key === origin.key)?.properties ?? [] : ["color", "opacity", "transform"].filter((property) => spatialPropertySupported(entity, property));
      const animatedProperties = scene.animations.filter((channel) => channel.targetId === entity.entityId).map((channel) => channel.property);
      const editableControls = declared.filter((property) => !animatedProperties.some((animated) => animated === property || property === "transform" && ["position", "rotation", "scale"].includes(animated)));
      const local = localBounds(entity);
      const bounds = "status" in local ? local : { status: "authored-enclosure", coordinateDomain: entity.placement, atTimeUs: 0, bounds: transformBounds(worldMatrix, local) };
      const assetIds = entity.kind === "mesh" ? [...entity.geometry.kind === "asset" ? [entity.geometry.assetId] : [], ...entity.material.map === undefined ? [] : [entity.material.map]] : entity.kind === "text" ? [entity.fontAssetId] : ("assetId" in entity) ? [entity.assetId] : [];
      return { entityId: entity.entityId, name: entity.name, kind: entity.kind, origin, parentId: entity.parentId, placement: entity.placement, editableControls, animatedProperties, assetIds, bounds };
    }),
    cameras: scene.cameras,
    assets: scene.assets.map((manifest) => ({ assetId: manifest.assetId, manifestSha256: digests[manifest.assetId], manifest })),
    generators: scene.generators
  });
}

// src/spatial-scene/audit.ts
import { z } from "zod";
var SPATIAL_AUDIT_LIMITS = Object.freeze({
  samples: 64,
  defaultSamples: 9,
  findings: 1024,
  entitySamples: 65536,
  reportBytes: 33554432
});
var ENTITY_KINDS = ["group", "mesh", "image", "diagram", "video", "text", "light", "splat", "environment"];
var BOUNDS_UNKNOWN_REASONS = ["requires-asset-decoding", "requires-text-layout", "no-surface"];
var CONTAINED = ["full", "partial", "outside", "behind-camera", "clipped"];
var FINDING_KINDS = ["never-visible", "off-camera", "empty-scene-region", "bounds-unknown", "behind-camera-all-samples"];
var CONTAINED_HISTOGRAM_ORDER = ["full", "partial", "outside", "clipped", "behind-camera"];
var auditVector = z.tuple([
  z.number().finite().min(-1000000000000).max(1000000000000),
  z.number().finite().min(-1000000000000).max(1000000000000),
  z.number().finite().min(-1000000000000).max(1000000000000)
]);
var SpatialAuditBoundsSchema = z.strictObject({ min: auditVector, max: auditVector }).refine((bounds) => bounds.min.every((value, index) => value <= bounds.max[index]), "Bounds min must not exceed max.");
var SpatialAuditOptionsSchema = z.strictObject({
  cameraId: SpatialCameraIdSchema,
  timesUs: z.array(SpatialTimeUsSchema).min(1).max(SPATIAL_AUDIT_LIMITS.samples).optional(),
  assetBounds: z.record(SpatialAssetIdSchema, SpatialAuditBoundsSchema).optional()
});
var SpatialAuditFrustumSchema = z.strictObject({
  contained: z.enum(CONTAINED),
  pixelFootprint: z.number().finite().min(0).max(1000000000000000)
});
var SpatialAuditSampleSchema = z.strictObject({
  timeUs: SpatialTimeUsSchema,
  visible: z.boolean(),
  bounds: SpatialAuditBoundsSchema.optional(),
  frustum: SpatialAuditFrustumSchema.optional(),
  note: z.enum(["out-of-range", "other-camera"]).optional()
});
var SpatialAuditEntitySchema = z.strictObject({
  entityId: SpatialEntityIdSchema,
  name: z.string().min(1).max(256),
  kind: z.enum(ENTITY_KINDS),
  placement: SpatialPlacementSchema,
  enclosure: z.discriminatedUnion("status", [
    z.strictObject({ status: z.literal("bounded") }),
    z.strictObject({ status: z.literal("unknown"), reason: z.enum(BOUNDS_UNKNOWN_REASONS) })
  ]),
  samples: z.array(SpatialAuditSampleSchema).max(SPATIAL_AUDIT_LIMITS.samples)
});
var SpatialAuditFindingSchema = z.strictObject({
  severity: z.enum(["info", "warning"]),
  kind: z.enum(FINDING_KINDS),
  entityId: SpatialEntityIdSchema.optional(),
  timeUs: SpatialTimeUsSchema.optional(),
  detail: z.string().min(1).max(1024)
});
var entityKindCounts = z.strictObject({
  group: z.number().int().min(0),
  mesh: z.number().int().min(0),
  image: z.number().int().min(0),
  diagram: z.number().int().min(0),
  video: z.number().int().min(0),
  text: z.number().int().min(0),
  light: z.number().int().min(0),
  splat: z.number().int().min(0),
  environment: z.number().int().min(0)
});
var SpatialAuditReportSchema = z.strictObject({
  kind: z.literal("slopcamera.spatial-audit"),
  schemaVersion: z.literal(1),
  sceneId: SpatialSceneIdSchema,
  sceneSha256: SpatialDigestSchema,
  cameraId: SpatialCameraIdSchema,
  durationUs: SpatialTimeUsSchema,
  timesUs: z.array(SpatialTimeUsSchema).min(1).max(SPATIAL_AUDIT_LIMITS.samples),
  summary: z.strictObject({
    entities: z.strictObject({
      total: z.number().int().min(0).max(SPATIAL_SCENE_LIMITS.entities),
      bounded: z.number().int().min(0).max(SPATIAL_SCENE_LIMITS.entities),
      unknownBounds: z.number().int().min(0).max(SPATIAL_SCENE_LIMITS.entities),
      byKind: entityKindCounts
    }),
    animations: z.strictObject({
      channels: z.number().int().min(0).max(SPATIAL_SCENE_LIMITS.channels),
      targets: z.number().int().min(0).max(SPATIAL_SCENE_LIMITS.entities + SPATIAL_SCENE_LIMITS.cameras),
      properties: z.strictObject({
        position: z.number().int().min(0),
        rotation: z.number().int().min(0),
        scale: z.number().int().min(0),
        opacity: z.number().int().min(0)
      })
    }),
    cameras: z.array(SpatialCameraIdSchema).max(SPATIAL_SCENE_LIMITS.cameras),
    entitiesNeverVisible: z.array(SpatialEntityIdSchema).max(SPATIAL_SCENE_LIMITS.entities),
    entitiesNeverInFrustum: z.array(SpatialEntityIdSchema).max(SPATIAL_SCENE_LIMITS.entities)
  }),
  entities: z.array(SpatialAuditEntitySchema).max(SPATIAL_SCENE_LIMITS.entities),
  findings: z.array(SpatialAuditFindingSchema).max(SPATIAL_AUDIT_LIMITS.findings),
  omittedFindings: z.number().int().min(0)
});
function auditLocalBounds(entity, assetBounds) {
  const supplied = (assetId) => assetBounds[assetId] === undefined ? { status: "unknown", reason: "requires-asset-decoding" } : { status: "bounded", bounds: assetBounds[assetId] };
  let half;
  if (entity.kind === "mesh") {
    switch (entity.geometry.kind) {
      case "asset":
        return supplied(entity.geometry.assetId);
      case "box":
        half = entity.geometry.size.map((value) => value / 2);
        break;
      case "plane":
        half = [entity.geometry.width / 2, entity.geometry.height / 2, 0];
        break;
      case "sphere":
        half = [entity.geometry.radius, entity.geometry.radius, entity.geometry.radius];
        break;
      case "cylinder":
        half = [entity.geometry.radius, entity.geometry.height / 2, entity.geometry.radius];
        break;
    }
  } else if (entity.kind === "image" || entity.kind === "diagram" || entity.kind === "video") {
    half = [entity.width / 2, entity.height / 2, 0];
  } else if (entity.kind === "splat")
    return supplied(entity.assetId);
  else
    return { status: "unknown", reason: entity.kind === "text" ? "requires-text-layout" : "no-surface" };
  return { status: "bounded", bounds: { min: [-half[0], -half[1], -half[2]], max: half } };
}
var round3 = (value) => Math.round(value * 1000) / 1000;
function boundsCorners(bounds) {
  const corners = [];
  for (let mask = 0;mask < 8; mask++) {
    corners.push([
      mask & 1 ? bounds.max[0] : bounds.min[0],
      mask & 2 ? bounds.max[1] : bounds.min[1],
      mask & 4 ? bounds.max[2] : bounds.min[2]
    ]);
  }
  return corners;
}
function classifyWorldFrustum(view, bounds) {
  const { width, height } = view.projection;
  let behind = 0, inside = 0, inClip = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const corner of boundsCorners(bounds)) {
    const projected = projectPreparedPoint(view, corner);
    if (projected === null) {
      behind++;
      continue;
    }
    minX = Math.min(minX, projected.pixel[0]);
    maxX = Math.max(maxX, projected.pixel[0]);
    minY = Math.min(minY, projected.pixel[1]);
    maxY = Math.max(maxY, projected.pixel[1]);
    if (projected.insideClip)
      inClip++;
    if (projected.insideImage && projected.insideClip)
      inside++;
  }
  const contained = behind === 8 ? "behind-camera" : inside === 8 ? "full" : inside > 0 || behind > 0 ? "partial" : inClip > 0 ? "outside" : "clipped";
  const pixelFootprint = behind === 8 ? 0 : round3(Math.max(0, Math.min(maxX, width) - Math.max(minX, 0)) * Math.max(0, Math.min(maxY, height) - Math.max(minY, 0)));
  return { contained, pixelFootprint };
}
function classifyViewOverlay(bounds, units, width, height) {
  const scaleX = units === "normalized" ? width : 1;
  const scaleY = units === "normalized" ? height : 1;
  const minX = bounds.min[0] * scaleX, maxX = bounds.max[0] * scaleX;
  const minY = bounds.min[1] * scaleY, maxY = bounds.max[1] * scaleY;
  const pixelFootprint = round3(Math.max(0, Math.min(maxX, width) - Math.max(minX, 0)) * Math.max(0, Math.min(maxY, height) - Math.max(minY, 0)));
  const contained = minX >= 0 && minY >= 0 && maxX <= width && maxY <= height ? "full" : pixelFootprint > 0 ? "partial" : "outside";
  return { contained, pixelFootprint };
}
function spatialAuditDefaultTimesUs(durationUs) {
  const count = SPATIAL_AUDIT_LIMITS.defaultSamples;
  return Array.from({ length: count }, (_, index) => Math.round(index * durationUs / (count - 1)));
}
var findingOrder = (finding) => `${finding.kind}:${finding.entityId ?? ""}:${String(finding.timeUs ?? -1).padStart(12, "0")}`;
function auditSpatialScene(sceneInput, options) {
  return auditSpatialSceneInContext(createSpatialEvaluationContext(sceneInput), options);
}
function auditSpatialSceneInContext(context, options) {
  const scene = context.scene;
  const captured = parseSpatialValue(SpatialAuditOptionsSchema, options, "audit options");
  const cameraId = captured.cameraId;
  if (!context.camerasById.has(cameraId)) {
    throw new SpatialSceneError("not-found", `Unknown camera ${cameraId}.`, "cameraId");
  }
  const assetIds = new Set(scene.assets.map((asset) => asset.assetId));
  const assetBounds = Object.create(null);
  for (const [assetId, bounds] of Object.entries(captured.assetBounds ?? {})) {
    if (!assetIds.has(assetId))
      throw new SpatialSceneError("invalid-data", `Asset bounds reference unknown ${assetId}.`, "assetBounds");
    assetBounds[assetId] = Object.freeze({ min: Object.freeze([...bounds.min]), max: Object.freeze([...bounds.max]) });
  }
  const timesUs = [...new Set(captured.timesUs ?? spatialAuditDefaultTimesUs(scene.durationUs))].sort((a, b) => a - b);
  for (const timeUs of timesUs) {
    if (timeUs > scene.durationUs)
      throw new SpatialSceneError("invalid-data", "Audit sample time exceeds scene duration.", "timesUs");
  }
  if (scene.entities.length * timesUs.length > SPATIAL_AUDIT_LIMITS.entitySamples) {
    throw new SpatialSceneError("invalid-data", "Audit entity-sample budget exceeded; pass fewer timesUs samples.", "timesUs");
  }
  const enclosures = new Map(scene.entities.map((entity) => [entity.entityId, auditLocalBounds(entity, assetBounds)]));
  const samplesByEntity = new Map(scene.entities.map((entity) => [entity.entityId, []]));
  for (const timeUs of timesUs) {
    const snapshot = evaluateSpatialSceneInContext(context, { timeUs, cameraId });
    const view = prepareCameraView(cameraMathView(snapshot.camera));
    const { width, height } = snapshot.camera.projection;
    for (const entry of snapshot.entities) {
      const entity = entry.entity;
      const samples = samplesByEntity.get(entity.entityId);
      const placement = entity.placement;
      if (placement.kind === "view" && placement.cameraId !== cameraId) {
        samples.push({ timeUs, visible: entry.visible, note: "other-camera" });
        continue;
      }
      const enclosure = enclosures.get(entity.entityId);
      if (enclosure.status === "unknown") {
        samples.push({ timeUs, visible: entry.visible });
        continue;
      }
      try {
        const domain = transformBounds(entry.worldMatrix, enclosure.bounds);
        const frustum = placement.kind === "view" ? classifyViewOverlay(domain, placement.units, width, height) : classifyWorldFrustum(view, domain);
        samples.push({ timeUs, visible: entry.visible, bounds: domain, frustum });
      } catch (error) {
        if (!(error instanceof RangeError))
          throw error;
        samples.push({ timeUs, visible: entry.visible, note: "out-of-range" });
      }
    }
  }
  const findings = [];
  const neverVisible = [];
  const neverInFrustum = [];
  const auditedEntities = [];
  for (const entity of scene.entities) {
    const enclosure = enclosures.get(entity.entityId);
    const samples = samplesByEntity.get(entity.entityId);
    auditedEntities.push({
      entityId: entity.entityId,
      name: entity.name,
      kind: entity.kind,
      placement: entity.placement,
      enclosure: enclosure.status === "bounded" ? { status: "bounded" } : { status: "unknown", reason: enclosure.reason },
      samples
    });
    const applicable = samples.filter((sample) => sample.note !== "other-camera");
    const visible = applicable.filter((sample) => sample.visible);
    if (visible.length === 0) {
      neverVisible.push(entity.entityId);
      findings.push({
        severity: "info",
        kind: "never-visible",
        entityId: entity.entityId,
        detail: entity.placement.kind === "view" && entity.placement.cameraId !== cameraId ? `View-bound to ${entity.placement.cameraId}; not evaluated under ${cameraId}.` : "Effective visibility is false at every sampled time."
      });
      continue;
    }
    if (enclosure.status === "unknown") {
      if (enclosure.reason !== "no-surface") {
        findings.push({
          severity: "info",
          kind: "bounds-unknown",
          entityId: entity.entityId,
          detail: enclosure.reason === "requires-asset-decoding" ? "Bounds require decoded asset data; supply assetBounds to audit this entity." : "Text bounds require font layout; audited for visibility only."
        });
      }
      continue;
    }
    const outOfRange = visible.filter((sample) => sample.note === "out-of-range").length;
    if (outOfRange > 0) {
      findings.push({
        severity: "info",
        kind: "bounds-unknown",
        entityId: entity.entityId,
        detail: `World bounds exceed numeric limits at ${String(outOfRange)} visible sample${outOfRange === 1 ? "" : "s"}.`
      });
    }
    const statuses = visible.filter((sample) => sample.frustum !== undefined).map((sample) => sample.frustum.contained);
    if (statuses.length === 0)
      continue;
    if (!statuses.some((status) => status === "full" || status === "partial")) {
      neverInFrustum.push(entity.entityId);
      if (statuses.every((status) => status === "behind-camera")) {
        findings.push({
          severity: "warning",
          kind: "behind-camera-all-samples",
          entityId: entity.entityId,
          detail: `Every visible sample is behind the camera plane (${String(statuses.length)} sample${statuses.length === 1 ? "" : "s"}).`
        });
      } else {
        const histogram = CONTAINED_HISTOGRAM_ORDER.map((status) => [status, statuses.filter((value) => value === status).length]).filter(([, count]) => count > 0).map(([status, count]) => `${status} \xD7${String(count)}`).join(", ");
        findings.push({
          severity: "warning",
          kind: "off-camera",
          entityId: entity.entityId,
          detail: `Never inside the camera frustum: ${histogram} across ${String(statuses.length)} visible samples.`
        });
      }
    }
  }
  const boundedVisible = scene.entities.filter((entity) => enclosures.get(entity.entityId).status === "bounded" && samplesByEntity.get(entity.entityId).some((sample) => sample.visible && sample.note !== "other-camera")).length;
  const everInFrustum = scene.entities.some((entity) => samplesByEntity.get(entity.entityId).some((sample) => sample.visible && (sample.frustum?.contained === "full" || sample.frustum?.contained === "partial")));
  if (!everInFrustum) {
    const unknownCount = scene.entities.length - [...enclosures.values()].filter((item) => item.status === "bounded").length;
    findings.push({
      severity: "warning",
      kind: "empty-scene-region",
      detail: `No visible bounded entity intersects the camera frustum at any sampled time (${String(boundedVisible)} bounded visible, ${String(unknownCount)} with unknown bounds).`
    });
  }
  const sortedFindings = sortSpatialBy(findings, findingOrder);
  const retainedFindings = sortedFindings.slice(0, SPATIAL_AUDIT_LIMITS.findings);
  const byKind = Object.fromEntries(ENTITY_KINDS.map((kind) => [kind, 0]));
  for (const entity of scene.entities)
    byKind[entity.kind]++;
  const properties = { position: 0, rotation: 0, scale: 0, opacity: 0 };
  for (const channel of scene.animations)
    properties[channel.property]++;
  const report = {
    kind: "slopcamera.spatial-audit",
    schemaVersion: 1,
    sceneId: scene.sceneId,
    sceneSha256: context.sceneSha256,
    cameraId,
    durationUs: scene.durationUs,
    timesUs,
    summary: {
      entities: {
        total: scene.entities.length,
        bounded: [...enclosures.values()].filter((item) => item.status === "bounded").length,
        unknownBounds: [...enclosures.values()].filter((item) => item.status === "unknown").length,
        byKind
      },
      animations: {
        channels: scene.animations.length,
        targets: new Set(scene.animations.map((channel) => channel.targetId)).size,
        properties
      },
      cameras: scene.cameras.map((camera) => camera.cameraId),
      entitiesNeverVisible: sortSpatialBy(neverVisible, (id) => id),
      entitiesNeverInFrustum: sortSpatialBy(neverInFrustum, (id) => id)
    },
    entities: auditedEntities,
    findings: retainedFindings,
    omittedFindings: sortedFindings.length - retainedFindings.length
  };
  const parsed = SpatialAuditReportSchema.parse(report);
  try {
    createBoundedJsonValueSnapshot(parsed, SPATIAL_AUDIT_LIMITS.reportBytes, "audit report", {
      maximumDepth: SPATIAL_SCENE_LIMITS.sourceDepth + 8,
      maximumValues: SPATIAL_SCENE_LIMITS.sourceValues + SPATIAL_AUDIT_LIMITS.entitySamples * 16
    });
  } catch (error) {
    throw new SpatialSceneError("invalid-data", error instanceof Error ? error.message : "Audit report exceeds its bounded size.", "audit");
  }
  return deepFreezeJson(parsed);
}

// src/spatial-scene/audit-rendered.ts
import { z as z2 } from "zod";
var SPATIAL_RENDERED_AUDIT_LIMITS = Object.freeze({
  samples: SPATIAL_AUDIT_LIMITS.samples,
  findings: SPATIAL_AUDIT_LIMITS.findings,
  entitySamples: SPATIAL_AUDIT_LIMITS.entitySamples,
  reportBytes: SPATIAL_AUDIT_LIMITS.reportBytes,
  selectionIds: 4096,
  frameDimension: 8192,
  framePixels: 33554432
});
var ENTITY_KINDS2 = ["group", "mesh", "image", "diagram", "video", "text", "light", "splat", "environment"];
var ELIGIBILITY = ["renderable", "proxy-coverage", "view-masked", "no-surface", "unsupported-kind"];
var BOUNDS_UNKNOWN_REASONS2 = ["requires-asset-decoding", "requires-text-layout", "no-surface"];
var FINDING_KINDS2 = [
  "never-rendered",
  "unsupported-kind",
  "proxy-coverage",
  "occluded",
  "unattributed-pixels",
  "empty-render",
  "bounds-unknown"
];
var SAMPLE_NOTES = ["out-of-range", "other-camera", "unlowered-expected"];
var SPATIAL_SPLAT_PROXY_REPRESENTATION = "splat-bounding-box-proxy;spz-position-bounds;approximate-not-pixel-truth";
var SpatialRenderedAuditCoverageSchema = z2.discriminatedUnion("kind", [
  z2.strictObject({ kind: z2.literal("opaque") }),
  z2.strictObject({ kind: z2.literal("alpha-threshold"), threshold: z2.number().finite().gt(0).max(1) })
]);
var SPATIAL_RENDERED_AUDIT_COVERAGE = Object.freeze({ kind: "alpha-threshold", threshold: 0.5 });
var selectionIdSchema = z2.number().int().min(1).max(SPATIAL_RENDERED_AUDIT_LIMITS.selectionIds);
var selectionKeyPattern = /^(?:0|[1-9]\d{0,3})$/u;
var pixelCountSchema = z2.number().int().min(0).max(SPATIAL_RENDERED_AUDIT_LIMITS.framePixels);
var SpatialRenderedAuditObjectSchema = z2.strictObject({
  entityId: SpatialEntityIdSchema,
  selectionId: selectionIdSchema,
  representation: z2.string().min(1).max(256),
  placement: z2.enum(["world", "view"]),
  assetManifestSha256: SpatialDigestSchema.optional()
});
var SpatialRenderedAuditFrameSchema = z2.strictObject({
  timeUs: SpatialTimeUsSchema,
  width: z2.number().int().min(1).max(SPATIAL_RENDERED_AUDIT_LIMITS.frameDimension),
  height: z2.number().int().min(1).max(SPATIAL_RENDERED_AUDIT_LIMITS.frameDimension),
  pngSha256: SpatialDigestSchema,
  counts: z2.record(z2.string().regex(selectionKeyPattern), pixelCountSchema),
  objects: z2.array(SpatialRenderedAuditObjectSchema).max(SPATIAL_SCENE_LIMITS.entities)
}).superRefine((frame, context) => {
  const pixels = frame.width * frame.height;
  if (pixels > SPATIAL_RENDERED_AUDIT_LIMITS.framePixels) {
    context.addIssue({ code: "custom", message: "Object-ID frame exceeds the pixel budget." });
  }
  let total = 0;
  for (const [key, count] of Object.entries(frame.counts)) {
    const code = Number(key);
    if (!Number.isInteger(code) || code < 1 || code > SPATIAL_RENDERED_AUDIT_LIMITS.selectionIds) {
      context.addIssue({ code: "custom", message: "Object-ID counts must key selection codes in [1,4096]." });
    }
    total += count;
  }
  if (total > pixels) {
    context.addIssue({ code: "custom", message: "Object-ID counts exceed the frame pixel count." });
  }
  const entityIds = new Set, selectionIds = new Set;
  for (const object of frame.objects) {
    if (entityIds.has(object.entityId) || selectionIds.has(object.selectionId)) {
      context.addIssue({ code: "custom", message: "Frame evidence must name each entity and selection code once." });
    }
    entityIds.add(object.entityId);
    selectionIds.add(object.selectionId);
  }
});
var SpatialRenderedAuditSampleSchema = z2.strictObject({
  timeUs: SpatialTimeUsSchema,
  expected: z2.boolean(),
  lowered: z2.boolean(),
  rendered: z2.boolean(),
  pixels: z2.number().int().min(0).max(SPATIAL_RENDERED_AUDIT_LIMITS.framePixels),
  framePercent: z2.number().finite().min(0).max(100),
  geometricPixels: z2.number().finite().min(0).max(1000000000000000).optional(),
  coverageRatio: z2.number().finite().min(0).max(1000000000000000).optional(),
  note: z2.enum(SAMPLE_NOTES).optional()
});
var SpatialRenderedAuditEntitySchema = z2.strictObject({
  entityId: SpatialEntityIdSchema,
  name: z2.string().min(1).max(256),
  kind: z2.enum(ENTITY_KINDS2),
  placement: SpatialPlacementSchema,
  eligibility: z2.enum(ELIGIBILITY),
  selectionId: selectionIdSchema,
  enclosure: z2.discriminatedUnion("status", [
    z2.strictObject({ status: z2.literal("bounded") }),
    z2.strictObject({ status: z2.literal("unknown"), reason: z2.enum(BOUNDS_UNKNOWN_REASONS2) })
  ]),
  samples: z2.array(SpatialRenderedAuditSampleSchema).max(SPATIAL_RENDERED_AUDIT_LIMITS.samples),
  totals: z2.strictObject({
    expected: z2.number().int().min(0).max(SPATIAL_RENDERED_AUDIT_LIMITS.samples),
    lowered: z2.number().int().min(0).max(SPATIAL_RENDERED_AUDIT_LIMITS.samples),
    rendered: z2.number().int().min(0).max(SPATIAL_RENDERED_AUDIT_LIMITS.samples),
    pixels: z2.number().int().min(0).max(SPATIAL_RENDERED_AUDIT_LIMITS.framePixels * SPATIAL_RENDERED_AUDIT_LIMITS.samples),
    maxPixels: z2.number().int().min(0).max(SPATIAL_RENDERED_AUDIT_LIMITS.framePixels),
    maxFramePercent: z2.number().finite().min(0).max(100)
  })
});
var SpatialRenderedAuditFrameReportSchema = z2.strictObject({
  timeUs: SpatialTimeUsSchema,
  pngSha256: SpatialDigestSchema,
  renderedPixels: pixelCountSchema,
  unattributedPixels: pixelCountSchema,
  loweredEntities: z2.number().int().min(0).max(SPATIAL_SCENE_LIMITS.entities)
});
var SpatialRenderedAuditFindingSchema = z2.strictObject({
  severity: z2.enum(["info", "warning"]),
  kind: z2.enum(FINDING_KINDS2),
  entityId: SpatialEntityIdSchema.optional(),
  timeUs: SpatialTimeUsSchema.optional(),
  detail: z2.string().min(1).max(1024)
});
var SpatialRenderedAuditReportSchema = z2.strictObject({
  kind: z2.literal("slopcamera.spatial-rendered-audit"),
  schemaVersion: z2.literal(1),
  sceneId: SpatialSceneIdSchema,
  sceneSha256: SpatialDigestSchema,
  cameraId: SpatialCameraIdSchema,
  durationUs: SpatialTimeUsSchema,
  timesUs: z2.array(SpatialTimeUsSchema).min(1).max(SPATIAL_RENDERED_AUDIT_LIMITS.samples),
  mode: z2.strictObject({ kind: z2.literal("object-id"), coverage: SpatialRenderedAuditCoverageSchema }),
  frame: z2.strictObject({
    width: z2.number().int().min(1).max(SPATIAL_RENDERED_AUDIT_LIMITS.frameDimension),
    height: z2.number().int().min(1).max(SPATIAL_RENDERED_AUDIT_LIMITS.frameDimension),
    pixels: pixelCountSchema
  }),
  summary: z2.strictObject({
    entities: z2.strictObject({
      total: z2.number().int().min(0).max(SPATIAL_SCENE_LIMITS.entities),
      renderable: z2.number().int().min(0).max(SPATIAL_SCENE_LIMITS.entities),
      proxyCoverage: z2.number().int().min(0).max(SPATIAL_SCENE_LIMITS.entities).optional(),
      viewMasked: z2.number().int().min(0).max(SPATIAL_SCENE_LIMITS.entities),
      noSurface: z2.number().int().min(0).max(SPATIAL_SCENE_LIMITS.entities),
      unsupported: z2.number().int().min(0).max(SPATIAL_SCENE_LIMITS.entities)
    }),
    entitiesNeverRendered: z2.array(SpatialEntityIdSchema).max(SPATIAL_SCENE_LIMITS.entities),
    entitiesUnsupported: z2.array(SpatialEntityIdSchema).max(SPATIAL_SCENE_LIMITS.entities),
    entitiesViewMasked: z2.array(SpatialEntityIdSchema).max(SPATIAL_SCENE_LIMITS.entities),
    entitiesProxyCoverage: z2.array(SpatialEntityIdSchema).max(SPATIAL_SCENE_LIMITS.entities).optional(),
    renderedPixels: z2.number().int().min(0).max(SPATIAL_RENDERED_AUDIT_LIMITS.framePixels * SPATIAL_RENDERED_AUDIT_LIMITS.samples),
    unattributedPixels: z2.number().int().min(0).max(SPATIAL_RENDERED_AUDIT_LIMITS.framePixels * SPATIAL_RENDERED_AUDIT_LIMITS.samples)
  }),
  entities: z2.array(SpatialRenderedAuditEntitySchema).max(SPATIAL_SCENE_LIMITS.entities),
  frames: z2.array(SpatialRenderedAuditFrameReportSchema).min(1).max(SPATIAL_RENDERED_AUDIT_LIMITS.samples),
  findings: z2.array(SpatialRenderedAuditFindingSchema).max(SPATIAL_RENDERED_AUDIT_LIMITS.findings),
  omittedFindings: z2.number().int().min(0)
});
var SpatialRenderedAuditOptionsSchema = z2.strictObject({
  cameraId: SpatialCameraIdSchema,
  assetBounds: z2.record(SpatialAssetIdSchema, SpatialAuditBoundsSchema).optional(),
  coverage: SpatialRenderedAuditCoverageSchema.optional()
});
function decodeObjectIdPixels(rgba, width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > SPATIAL_RENDERED_AUDIT_LIMITS.frameDimension || height > SPATIAL_RENDERED_AUDIT_LIMITS.frameDimension || width * height > SPATIAL_RENDERED_AUDIT_LIMITS.framePixels) {
    throw new RangeError("Object-ID frame dimensions exceed their bound.");
  }
  if (rgba.length !== width * height * 4) {
    throw new RangeError("Object-ID pixels must be exactly width \xD7 height RGBA8.");
  }
  const counts = {};
  for (let index = 0;index < rgba.length; index += 4) {
    const red = rgba[index], green = rgba[index + 1], blue = rgba[index + 2], alpha = rgba[index + 3];
    if (alpha === 0) {
      if (red !== 0 || green !== 0 || blue !== 0) {
        throw new RangeError("Object-ID no-hit pixels must be exactly [0,0,0,0].");
      }
      continue;
    }
    const code = red * 65536 + green * 256 + blue;
    if (alpha !== 255 || code === 0 || code > SPATIAL_RENDERED_AUDIT_LIMITS.selectionIds) {
      throw new RangeError("Object-ID pixels must be alpha-255 selection codes in [1,4096].");
    }
    counts[String(code)] = (counts[String(code)] ?? 0) + 1;
  }
  return counts;
}
var round32 = (value) => Math.round(value * 1000) / 1000;
function eligibility(entity, assetBounds) {
  if (entity.kind === "splat") {
    return entity.placement.kind === "world" && assetBounds[entity.assetId] !== undefined ? "proxy-coverage" : "unsupported-kind";
  }
  if (entity.kind === "group" || entity.kind === "light" || entity.kind === "environment")
    return "no-surface";
  if (entity.placement.kind === "view")
    return "view-masked";
  return "renderable";
}
function entityAssetId(entity) {
  switch (entity.kind) {
    case "mesh":
      return entity.geometry.kind === "asset" ? entity.geometry.assetId : entity.material.map;
    case "image":
    case "diagram":
    case "video":
    case "environment":
      return entity.assetId;
    case "text":
      return entity.fontAssetId;
    case "splat":
      return entity.assetId;
    default:
      return;
  }
}
var findingOrder2 = (finding) => `${finding.kind}:${finding.entityId ?? ""}:${String(finding.timeUs ?? -1).padStart(12, "0")}`;
function auditSpatialSceneRendered(sceneInput, framesInput, options) {
  return auditSpatialSceneRenderedInContext(createSpatialEvaluationContext(sceneInput), framesInput, options);
}
function auditSpatialSceneRenderedInContext(context, framesInput, options) {
  const scene = context.scene;
  const captured = parseSpatialValue(SpatialRenderedAuditOptionsSchema, options, "rendered audit options");
  const coverage = captured.coverage ?? SPATIAL_RENDERED_AUDIT_COVERAGE;
  const cameraId = captured.cameraId;
  if (!context.camerasById.has(cameraId)) {
    throw new SpatialSceneError("not-found", `Unknown camera ${cameraId}.`, "cameraId");
  }
  const assetIds = new Set(scene.assets.map((asset) => asset.assetId));
  for (const assetId of Object.keys(captured.assetBounds ?? {})) {
    if (!assetIds.has(assetId))
      throw new SpatialSceneError("invalid-data", `Asset bounds reference unknown ${assetId}.`, "assetBounds");
  }
  const frames = parseSpatialValue(z2.array(SpatialRenderedAuditFrameSchema).min(1).max(SPATIAL_RENDERED_AUDIT_LIMITS.samples), framesInput, "rendered audit frames");
  const timeSet = new Set(frames.map((frame) => frame.timeUs));
  if (timeSet.size !== frames.length) {
    throw new SpatialSceneError("invalid-data", "Rendered audit frames must have unique sample times.", "frames");
  }
  const timesUs = [...timeSet].sort((a, b) => a - b);
  for (const timeUs of timesUs) {
    if (timeUs > scene.durationUs)
      throw new SpatialSceneError("invalid-data", "Rendered audit sample time exceeds scene duration.", "frames");
  }
  if (scene.entities.length * timesUs.length > SPATIAL_RENDERED_AUDIT_LIMITS.entitySamples) {
    throw new SpatialSceneError("invalid-data", "Rendered audit entity-sample budget exceeded; pass fewer frames.", "frames");
  }
  const first = frames[0];
  for (const frame of frames) {
    if (frame.width !== first.width || frame.height !== first.height) {
      throw new SpatialSceneError("invalid-data", "Rendered audit frames must share one calibrated dimension.", "frames");
    }
  }
  const framePixels = first.width * first.height;
  const entityIndex = new Map(scene.entities.map((entity, index) => [entity.entityId, index + 1]));
  const manifestDigests = context.assetDigests;
  const frameDrafts = new Map;
  for (const frame of frames) {
    const attributed = new Map;
    const lowered = new Map;
    for (const object of frame.objects) {
      const entity = scene.entities.find((candidate) => candidate.entityId === object.entityId);
      if (entity === undefined) {
        throw new SpatialSceneError("invalid-data", `Frame evidence names unknown entity ${object.entityId}.`, "frames");
      }
      if (object.selectionId !== entityIndex.get(object.entityId)) {
        throw new SpatialSceneError("invalid-data", `Frame evidence selection id differs from the canonical index for ${object.entityId}.`, "frames");
      }
      if (object.assetManifestSha256 !== undefined) {
        const assetId = entityAssetId(entity);
        if (assetId === undefined || manifestDigests[assetId] !== object.assetManifestSha256) {
          throw new SpatialSceneError("invalid-data", `Frame evidence asset digest does not match the declared manifest for ${object.entityId}.`, "frames");
        }
      }
      if (entity.kind === "splat") {
        if (object.representation !== SPATIAL_SPLAT_PROXY_REPRESENTATION || object.placement !== "world" || entity.placement.kind !== "world" || captured.assetBounds?.[entity.assetId] === undefined) {
          throw new SpatialSceneError("invalid-data", `Frame evidence may lower splat ${object.entityId} only as its supplied-bounds bounding-box proxy.`, "frames");
        }
      } else if (object.representation === SPATIAL_SPLAT_PROXY_REPRESENTATION) {
        throw new SpatialSceneError("invalid-data", `Frame evidence must not mark non-splat ${object.entityId} as a splat bounding-box proxy.`, "frames");
      }
      lowered.set(object.entityId, object);
      attributed.set(object.selectionId, 0);
    }
    let renderedPixels2 = 0, unattributedPixels2 = 0;
    for (const [key, count] of Object.entries(frame.counts)) {
      const code = Number(key);
      if (!attributed.has(code)) {
        unattributedPixels2 += count;
        continue;
      }
      attributed.set(code, count);
      renderedPixels2 += count;
    }
    frameDrafts.set(frame.timeUs, {
      timeUs: frame.timeUs,
      width: frame.width,
      height: frame.height,
      pngSha256: frame.pngSha256,
      attributed,
      lowered,
      renderedPixels: renderedPixels2,
      unattributedPixels: unattributedPixels2
    });
  }
  const geometric = auditSpatialSceneInContext(context, {
    cameraId,
    timesUs,
    ...captured.assetBounds === undefined ? {} : { assetBounds: captured.assetBounds }
  });
  const geometricEntities = new Map(geometric.entities.map((entity) => [entity.entityId, entity]));
  const geometricSamples = new Map(geometric.entities.map((entity) => [
    entity.entityId,
    new Map(entity.samples.map((sample) => [sample.timeUs, sample]))
  ]));
  const findings = [];
  const entities = [];
  const entitiesNeverRendered = [];
  const entitiesUnsupported = [];
  const entitiesViewMasked = [];
  const entitiesProxyCoverage = [];
  const suppliedAssetBounds = captured.assetBounds ?? {};
  const eligibilityCounts = { renderable: 0, "proxy-coverage": 0, "view-masked": 0, "no-surface": 0, "unsupported-kind": 0 };
  for (const entity of scene.entities) {
    const entityEligibility = eligibility(entity, suppliedAssetBounds);
    eligibilityCounts[entityEligibility]++;
    if (entityEligibility === "unsupported-kind")
      entitiesUnsupported.push(entity.entityId);
    if (entityEligibility === "view-masked")
      entitiesViewMasked.push(entity.entityId);
    if (entityEligibility === "proxy-coverage")
      entitiesProxyCoverage.push(entity.entityId);
    const selectionId = entityIndex.get(entity.entityId);
    const geometricEntity = geometricEntities.get(entity.entityId);
    const geoSamples = geometricSamples.get(entity.entityId);
    const samples = [];
    for (const timeUs of timesUs) {
      const frame = frameDrafts.get(timeUs);
      const geo = geoSamples.get(timeUs);
      const evidence = frame.lowered.get(entity.entityId);
      const expected = (entityEligibility === "renderable" || entityEligibility === "view-masked" || entityEligibility === "proxy-coverage") && geo.visible && geo.note !== "other-camera";
      const lowered = evidence !== undefined;
      const pixels = evidence !== undefined ? frame.attributed.get(selectionId) ?? 0 : 0;
      const note = expected && !lowered ? "unlowered-expected" : geo.note;
      samples.push({
        timeUs,
        expected,
        lowered,
        rendered: pixels > 0,
        pixels,
        framePercent: round32(pixels * 100 / framePixels),
        ...geo.frustum === undefined ? {} : { geometricPixels: geo.frustum.pixelFootprint },
        ...geo.frustum !== undefined && geo.frustum.pixelFootprint > 0 ? { coverageRatio: round32(pixels / geo.frustum.pixelFootprint) } : {},
        ...note === undefined ? {} : { note }
      });
    }
    const totals = {
      expected: samples.filter((sample) => sample.expected).length,
      lowered: samples.filter((sample) => sample.lowered).length,
      rendered: samples.filter((sample) => sample.rendered).length,
      pixels: samples.reduce((sum, sample) => sum + sample.pixels, 0),
      maxPixels: samples.reduce((maximum, sample) => Math.max(maximum, sample.pixels), 0),
      maxFramePercent: samples.reduce((maximum, sample) => Math.max(maximum, sample.framePercent), 0)
    };
    entities.push({
      entityId: entity.entityId,
      name: entity.name,
      kind: entity.kind,
      placement: entity.placement,
      eligibility: entityEligibility,
      selectionId,
      enclosure: geometricEntity.enclosure,
      samples,
      totals
    });
    if (entityEligibility === "unsupported-kind") {
      findings.push({
        severity: "info",
        kind: "unsupported-kind",
        entityId: entity.entityId,
        detail: entity.placement.kind === "world" ? "The object-ID pass cannot lower this splat's bounding-box proxy without decoded splat-position bounds; retained collider evidence is approximate, never pixel truth." : "The object-ID pass cannot lower a view-placed splat; bounding-box proxies require world placement."
      });
      if (geometricEntity.enclosure.status === "unknown" && geometricEntity.enclosure.reason !== "no-surface") {
        findings.push({
          severity: "info",
          kind: "bounds-unknown",
          entityId: entity.entityId,
          detail: "Bounds require decoded asset data; supply assetBounds so the object-ID pass can lower a bounding-box proxy."
        });
      }
      continue;
    }
    if (entityEligibility === "no-surface")
      continue;
    if (entityEligibility === "proxy-coverage") {
      findings.push({
        severity: "info",
        kind: "proxy-coverage",
        entityId: entity.entityId,
        detail: "Object-ID coverage counts this entity's bounding-box proxy built from supplied splat-position bounds \u2014 approximate coverage, never splat pixel truth."
      });
    }
    if (entityEligibility === "view-masked" && entity.placement.kind === "view" && entity.placement.cameraId === cameraId && totals.lowered > 0) {
      findings.push({
        severity: "info",
        kind: "unsupported-kind",
        entityId: entity.entityId,
        detail: "View surfaces draw after world content and write their own selection code; their pixels are attributed to the entity and can occlude world counts."
      });
    }
    if (entity.visible && totals.rendered === 0) {
      entitiesNeverRendered.push(entity.entityId);
      const covered = samples.filter((sample) => sample.expected && (sample.geometricPixels ?? 0) > 0).length;
      const maximum = samples.reduce((value, sample) => Math.max(value, sample.geometricPixels ?? 0), 0);
      findings.push({
        severity: totals.expected === 0 ? "info" : "warning",
        kind: "never-rendered",
        entityId: entity.entityId,
        detail: totals.expected === 0 ? "Authored visible but effectively invisible at every sampled time; zero rendered pixels is consistent." : covered === 0 ? `Effectively visible at ${String(totals.expected)} sampled time${totals.expected === 1 ? "" : "s"} but its geometric estimate never covered the frame; zero pixels is consistent.` : `Zero pixels at every expected sample despite up to ${String(maximum)} px\xB2 of geometric coverage; fully occluded, masked, or below the coverage threshold.`
      });
    } else if (totals.rendered > 0) {
      const occluded = samples.filter((sample) => sample.expected && (sample.geometricPixels ?? 0) > 0 && sample.pixels === 0).length;
      if (occluded > 0) {
        findings.push({
          severity: "info",
          kind: "occluded",
          entityId: entity.entityId,
          detail: `Zero rendered pixels at ${String(occluded)} of ${String(totals.expected)} expected samples despite positive geometric coverage; occluded, masked, or below the coverage threshold.`
        });
      }
    }
    if (geometricEntity.enclosure.status === "unknown" && totals.expected > 0 && geometricEntity.enclosure.reason !== "no-surface") {
      findings.push({
        severity: "info",
        kind: "bounds-unknown",
        entityId: entity.entityId,
        detail: geometricEntity.enclosure.reason === "requires-asset-decoding" ? "Bounds require decoded asset data; supply assetBounds for a geometric footprint delta." : "Text bounds require font layout; the rendered footprint has no geometric delta."
      });
    }
  }
  const frameReports = timesUs.map((timeUs) => {
    const frame = frameDrafts.get(timeUs);
    return {
      timeUs,
      pngSha256: frame.pngSha256,
      renderedPixels: frame.renderedPixels,
      unattributedPixels: frame.unattributedPixels,
      loweredEntities: frame.lowered.size
    };
  });
  const renderedPixels = frameReports.reduce((sum, frame) => sum + frame.renderedPixels, 0);
  const unattributedPixels = frameReports.reduce((sum, frame) => sum + frame.unattributedPixels, 0);
  if (unattributedPixels > 0) {
    const framesWithUnattributed = frameReports.filter((frame) => frame.unattributedPixels > 0).length;
    findings.push({
      severity: "warning",
      kind: "unattributed-pixels",
      detail: `${String(unattributedPixels)} pixel${unattributedPixels === 1 ? "" : "s"} across ${String(framesWithUnattributed)} frame${framesWithUnattributed === 1 ? "" : "s"} carried selection codes absent from attributable evidence.`
    });
  }
  if (renderedPixels === 0) {
    const expectedSamples = entities.reduce((sum, entity) => sum + entity.totals.expected, 0);
    findings.push({
      severity: "warning",
      kind: "empty-render",
      detail: `No attributed object-ID pixel appeared in any sampled frame (${String(expectedSamples)} expected entity-samples).`
    });
  }
  const sortedFindings = sortSpatialBy(findings, findingOrder2);
  const retainedFindings = sortedFindings.slice(0, SPATIAL_RENDERED_AUDIT_LIMITS.findings);
  const report = {
    kind: "slopcamera.spatial-rendered-audit",
    schemaVersion: 1,
    sceneId: scene.sceneId,
    sceneSha256: context.sceneSha256,
    cameraId,
    durationUs: scene.durationUs,
    timesUs,
    mode: { kind: "object-id", coverage },
    frame: { width: first.width, height: first.height, pixels: framePixels },
    summary: {
      entities: {
        total: scene.entities.length,
        renderable: eligibilityCounts.renderable,
        proxyCoverage: eligibilityCounts["proxy-coverage"],
        viewMasked: eligibilityCounts["view-masked"],
        noSurface: eligibilityCounts["no-surface"],
        unsupported: eligibilityCounts["unsupported-kind"]
      },
      entitiesNeverRendered: sortSpatialBy(entitiesNeverRendered, (id) => id),
      entitiesUnsupported: sortSpatialBy(entitiesUnsupported, (id) => id),
      entitiesViewMasked: sortSpatialBy(entitiesViewMasked, (id) => id),
      entitiesProxyCoverage: sortSpatialBy(entitiesProxyCoverage, (id) => id),
      renderedPixels,
      unattributedPixels
    },
    entities,
    frames: frameReports,
    findings: retainedFindings,
    omittedFindings: sortedFindings.length - retainedFindings.length
  };
  const parsed = SpatialRenderedAuditReportSchema.parse(report);
  try {
    createBoundedJsonValueSnapshot(parsed, SPATIAL_RENDERED_AUDIT_LIMITS.reportBytes, "rendered audit report", {
      maximumDepth: SPATIAL_SCENE_LIMITS.sourceDepth + 8,
      maximumValues: SPATIAL_SCENE_LIMITS.sourceValues + SPATIAL_RENDERED_AUDIT_LIMITS.entitySamples * 16
    });
  } catch (error) {
    throw new SpatialSceneError("invalid-data", error instanceof Error ? error.message : "Rendered audit report exceeds its bounded size.", "rendered audit");
  }
  return deepFreezeJson(parsed);
}

// src/spatial-scene/time.ts
function gcd(a, b) {
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}
function rational(numerator, denominator) {
  const divisor = gcd(numerator, denominator);
  return Object.freeze({ numerator: String(numerator / divisor), denominator: String(denominator / divisor) });
}
function integer(input, name) {
  if (!Number.isSafeInteger(input) || input < 0)
    throw new SpatialSceneError("invalid-data", `${name} must be a nonnegative safe integer.`);
  return BigInt(input);
}
function duration(input) {
  const value = parseSpatialValue(SpatialTimeUsSchema, input, "durationUs");
  if (value === 0)
    throw new SpatialSceneError("invalid-data", "Output duration must be positive.");
  return BigInt(value);
}
function reduceSpatialFrameRate(input) {
  const rate = parseSpatialValue(SpatialFrameRateSchema, input, "frame rate");
  const divisor = Number(gcd(BigInt(rate.numerator), BigInt(rate.denominator)));
  return Object.freeze({ numerator: rate.numerator / divisor, denominator: rate.denominator / divisor });
}
function spatialFrameCount(durationUs, rateInput) {
  const end = duration(durationUs), rate = reduceSpatialFrameRate(rateInput);
  const numerator = end * BigInt(rate.numerator), denominator = 1000000n * BigInt(rate.denominator);
  return Number((numerator + denominator - 1n) / denominator);
}
function spatialFrameSample(frameIndex, durationUs, rateInput) {
  const index = integer(frameIndex, "frameIndex"), end = duration(durationUs), rate = reduceSpatialFrameRate(rateInput);
  const numerator = index * 1000000n * BigInt(rate.denominator), denominator = BigInt(rate.numerator);
  if (numerator >= end * denominator)
    throw new SpatialSceneError("invalid-data", "Frame lies outside the half-open duration before quantization.", "frameIndex");
  const timeUs = Number((2n * numerator + denominator) / (2n * denominator));
  return deepFreezeJson({ frameIndex, timeUs, exactTimeUs: rational(numerator, denominator) });
}
function spatialOutputDuration(durationUs, rateInput) {
  const rate = reduceSpatialFrameRate(rateInput);
  return rational(BigInt(spatialFrameCount(durationUs, rate)) * 1000000n * BigInt(rate.denominator), BigInt(rate.numerator));
}

// src/spatial-scene/authoring.ts
function createSpatialSceneStarter() {
  const transform = { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] };
  const common = { parentId: null, placement: { kind: "world" }, origin: { kind: "authored" }, visible: true };
  return parseSpatialScene({
    kind: "slopcamera.spatial-scene",
    schemaVersion: 1,
    sceneId: "scene_starter",
    coordinates: "right-handed-y-up-meters",
    durationUs: 4000000,
    entities: [
      {
        ...common,
        entityId: "entity_product",
        name: "Product",
        kind: "mesh",
        transform,
        geometry: { kind: "box", size: [1.4, 1.4, 1.4] },
        material: { kind: "standard", color: "#3674ee", opacity: 1, roughness: 0.35, metalness: 0.1 }
      },
      {
        ...common,
        entityId: "entity_pedestal",
        name: "Pedestal",
        kind: "mesh",
        transform: { ...transform, position: [0, -0.9, 0] },
        geometry: { kind: "cylinder", radius: 1.15, height: 0.35 },
        material: { kind: "standard", color: "#cbd5e1", opacity: 1, roughness: 0.7, metalness: 0 }
      },
      {
        ...common,
        entityId: "entity_fill",
        name: "Fill",
        kind: "light",
        transform,
        light: "ambient",
        color: "#ffffff",
        intensity: 2
      },
      {
        ...common,
        entityId: "entity_key",
        name: "Key",
        kind: "light",
        transform: { ...transform, position: [3, 4, 5] },
        light: "directional",
        color: "#ffffff",
        intensity: 3
      }
    ],
    cameras: [{
      cameraId: "camera_hero",
      name: "Hero",
      pose: { position: [0, 0.3, 5], rotation: [0, 0, 0, 1] },
      projection: { kind: "perspective", width: 960, height: 540, fx: 650, fy: 650, cx: 480, cy: 270, near: 0.1, far: 100 }
    }],
    animations: [{
      channelId: "channel_turn",
      targetId: "entity_product",
      property: "rotation",
      interpolation: "slerp",
      keys: [{ timeUs: 0, value: [0, 0, 0, 1] }, { timeUs: 2000000, value: [0, 0.7071067811865475, 0, 0.7071067811865476] }, { timeUs: 4000000, value: [0, 1, 0, 0] }]
    }],
    assets: [],
    generators: [],
    overrides: []
  });
}

// src/spatial-scene/probe.ts
var transform = (position) => ({
  position,
  rotation: [0, 0, 0, 1],
  scale: [1, 1, 1]
});
var entityBase = {
  parentId: null,
  placement: { kind: "world" },
  origin: { kind: "authored" },
  visible: true
};
var neutral = {
  kind: "standard",
  color: "#8b95a7",
  opacity: 1,
  roughness: 0.55,
  metalness: 0.05
};
function galleryProbeScene(mode, asset) {
  const subjectMaterial = mode === "texture" ? { kind: "standard", color: "#ffffff", opacity: 1, roughness: 0.75, metalness: 0, map: asset.assetId } : mode === "skybox" ? { kind: "standard", color: "#cfd6e4", opacity: 1, roughness: 0.18, metalness: 0.85 } : neutral;
  const entities = [
    {
      ...entityBase,
      entityId: "entity_subject",
      name: "Subject",
      kind: "mesh",
      transform: transform([0, 0.15, 0]),
      geometry: { kind: "sphere", radius: 0.9 },
      material: subjectMaterial
    },
    {
      ...entityBase,
      entityId: "entity_ground",
      name: "Ground",
      kind: "mesh",
      transform: {
        position: [0, -0.75, 0],
        rotation: [-0.7071067811865476, 0, 0, 0.7071067811865476],
        scale: [1, 1, 1]
      },
      geometry: { kind: "plane", width: 10, height: 10 },
      material: { ...neutral, roughness: 0.9 }
    },
    {
      ...entityBase,
      entityId: "entity_fill",
      name: "Fill",
      kind: "light",
      transform: transform([0, 0, 0]),
      light: "ambient",
      color: "#ffffff",
      intensity: 1.6
    },
    {
      ...entityBase,
      entityId: "entity_key",
      name: "Key",
      kind: "light",
      transform: transform([3, 4, 5]),
      light: "directional",
      color: "#ffffff",
      intensity: 3
    }
  ];
  if (mode === "texture") {
    const wallTiles = [
      [-2.5, 0.2, -3],
      [2.5, 0.2, -3],
      [-2.5, 3, -3],
      [2.5, 3, -3]
    ];
    for (const [index, position] of wallTiles.entries()) {
      entities.push({
        ...entityBase,
        entityId: `entity_wall_${String(index + 1)}`,
        name: `Wall tile ${String(index + 1)}`,
        kind: "mesh",
        transform: transform(position),
        geometry: { kind: "plane", width: 5, height: 2.8 },
        material: {
          kind: "standard",
          color: "#ffffff",
          opacity: 1,
          roughness: 0.85,
          metalness: 0,
          map: asset.assetId
        }
      });
    }
  }
  if (mode === "skybox") {
    entities.push({
      ...entityBase,
      entityId: "entity_environment",
      name: "Environment",
      kind: "environment",
      transform: transform([0, 0, 0]),
      assetId: asset.assetId,
      role: "both",
      intensity: 1
    });
  }
  if (mode === "backdrop") {
    entities.push({
      ...entityBase,
      entityId: "entity_backdrop",
      name: "Backdrop",
      kind: "image",
      transform: transform([0, 1.6, -3]),
      assetId: asset.assetId,
      width: 12,
      height: 6.75,
      fit: "cover",
      opacity: 1
    });
  }
  return parseSpatialScene({
    kind: "slopcamera.spatial-scene",
    schemaVersion: 1,
    sceneId: "scene_gallery_probe",
    coordinates: "right-handed-y-up-meters",
    durationUs: 4000000,
    entities,
    cameras: [{
      cameraId: "camera_probe",
      name: "Probe",
      pose: { position: [0, 0.5, 4.4], rotation: [0, 0, 0, 1] },
      projection: {
        kind: "perspective",
        width: 960,
        height: 540,
        fx: 650,
        fy: 650,
        cx: 480,
        cy: 270,
        near: 0.1,
        far: 100
      }
    }],
    assets: [asset],
    animations: [],
    generators: [],
    overrides: []
  });
}
function galleryProbeRenderRequest() {
  return {
    cameraId: "camera_probe",
    mode: { kind: "beauty" },
    selection: { kind: "frame", timeUs: 0 }
  };
}

// src/spatial-scene/build.ts
import { z as z3 } from "zod";
var AXIS_INDEX = { x: 0, y: 1, z: 2 };
var WORLD_UP = [0, 1, 0];
var DEG = Math.PI / 180;
var SCATTER_MAX_ATTEMPTS = 128;
var scalarKeySchema = z3.strictObject({ timeUs: SpatialTimeUsSchema, value: z3.number().finite().min(0).max(1) });
var vec3KeySchema = z3.strictObject({ timeUs: SpatialTimeUsSchema, value: SpatialVec3Schema });
var quaternionKeySchema = z3.strictObject({ timeUs: SpatialTimeUsSchema, value: SpatialQuaternionSchema });
function finite(value, label) {
  if (!Number.isFinite(value))
    throw new RangeError(`${label} must be finite`);
  return value;
}
function vec3(value, label) {
  if (!Array.isArray(value) || value.length !== 3)
    throw new RangeError(`${label} must have 3 components`);
  for (let index = 0;index < 3; index++)
    finite(value[index], `${label}[${index}]`);
  return value;
}
function quaternion(value, label) {
  if (!Array.isArray(value) || value.length !== 4)
    throw new RangeError(`${label} must have 4 components`);
  for (let index = 0;index < 4; index++)
    finite(value[index], `${label}[${index}]`);
  return value;
}
function timeUs(value, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > SPATIAL_SCENE_LIMITS.durationUs) {
    throw new RangeError(`${label} must be an integer microsecond within [0, ${SPATIAL_SCENE_LIMITS.durationUs}]`);
  }
  return value;
}
function segments(value, durationUs) {
  if (value === undefined)
    return Math.min(64, Math.max(16, Math.ceil(durationUs / 166667)));
  if (!Number.isSafeInteger(value) || value < 1 || value > SPATIAL_SCENE_LIMITS.keysPerChannel - 1) {
    throw new RangeError(`segments must be an integer within [1, ${SPATIAL_SCENE_LIMITS.keysPerChannel - 1}]`);
  }
  return value;
}
function bounds(value, label) {
  vec3(value.min, `${label}.min`);
  vec3(value.max, `${label}.max`);
  if (value.min.some((part, index) => part > value.max[index]))
    throw new RangeError(`${label} requires min <= max`);
  return value;
}
function transform2(value, label) {
  vec3(value.position, `${label}.position`);
  quaternion(value.rotation, `${label}.rotation`);
  vec3(value.scale, `${label}.scale`);
  return value;
}
function unitQuaternion(value) {
  return normalizeQuaternion(value).map((component) => Math.min(1, Math.max(-1, component)));
}
function emitTransform(input) {
  return deepFreezeJson(parseSpatialValue(SpatialTransformSchema, {
    position: [...input.position],
    rotation: unitQuaternion(input.rotation),
    scale: [...input.scale]
  }, "transform"));
}
function emitPose(position, rotation) {
  return deepFreezeJson(parseSpatialValue(SpatialPoseSchema, { position: [...position], rotation }, "pose"));
}
function subtract(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function quaternionFromBasis(xAxis, yAxis, zAxis) {
  const [m00, m01, m02] = [xAxis[0], yAxis[0], zAxis[0]];
  const [m10, m11, m12] = [xAxis[1], yAxis[1], zAxis[1]];
  const [m20, m21, m22] = [xAxis[2], yAxis[2], zAxis[2]];
  const trace = m00 + m11 + m22;
  let q;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4];
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    q = [s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    q = [(m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    q = [(m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s];
  }
  return unitQuaternion(q);
}
function lookRotation(position, target, up) {
  const back = subtract(position, target);
  const backLength = Math.hypot(...back);
  if (backLength === 0)
    throw new RangeError("position and target must differ");
  const zAxis = back.map((component) => component / backLength);
  const right = cross(up, zAxis);
  const rightLength = Math.hypot(...right);
  let xAxis;
  if (rightLength < 0.000000000001) {
    const candidates = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const fallback = candidates.reduce((best, axis) => Math.abs(axis[0] * zAxis[0] + axis[1] * zAxis[1] + axis[2] * zAxis[2]) < Math.abs(best[0] * zAxis[0] + best[1] * zAxis[1] + best[2] * zAxis[2]) ? axis : best);
    const retry = cross(fallback, zAxis);
    const retryLength = Math.hypot(...retry);
    xAxis = retry.map((component) => component / retryLength);
  } else {
    xAxis = right.map((component) => component / rightLength);
  }
  return quaternionFromBasis(xAxis, cross(zAxis, xAxis), zAxis);
}
var EASINGS = {
  linear: (t) => t,
  "ease-in": (t) => t * t * t,
  "ease-out": (t) => 1 - (1 - t) * (1 - t) * (1 - t),
  "ease-in-out": (t) => t * t * (3 - 2 * t)
};
function keyTimes(startUs, durationUs, spans) {
  const times = [];
  for (let index = 0;index <= spans; index++) {
    const time = Math.round(startUs + index / spans * durationUs);
    if (times.length === 0 || time > times[times.length - 1][0])
      times.push([time, index / spans]);
  }
  return times;
}
function perspectiveFromFov(input) {
  const fov = finite(input.fovDeg, "fovDeg");
  if (fov <= 0 || fov >= 180)
    throw new RangeError("fovDeg must lie within (0, 180)");
  finite(input.near, "near");
  finite(input.far, "far");
  const cx = input.cx ?? input.width / 2;
  const cy = input.cy ?? input.height / 2;
  const focal = input.width / 2 / Math.tan(fov / 2 * DEG);
  return deepFreezeJson(parseSpatialValue(SpatialProjectionSchema, {
    kind: "perspective",
    width: input.width,
    height: input.height,
    near: input.near,
    far: input.far,
    fx: focal,
    fy: focal,
    cx,
    cy
  }, "projection"));
}
function lookAtPose(position, target, up = WORLD_UP) {
  vec3(position, "position");
  vec3(target, "target");
  vec3(up, "up");
  if (Math.hypot(...up) === 0)
    throw new RangeError("up must be nonzero");
  return emitPose(position, lookRotation(position, target, up));
}
function easeKeys(input) {
  return bakeKeys(input);
}
function bakeKeys(input) {
  const startUs = timeUs(input.startUs ?? 0, "startUs");
  const duration2 = timeUs(input.durationUs, "durationUs");
  if (duration2 === 0)
    throw new RangeError("durationUs must be positive");
  timeUs(startUs + duration2, "startUs + durationUs");
  const easing = EASINGS[input.easing];
  if (easing === undefined)
    throw new RangeError(`unsupported easing ${String(input.easing)}`);
  const spans = segments(input.segments, duration2);
  const times = keyTimes(startUs, duration2, spans);
  const { from, to } = input;
  if (typeof from === "number" && typeof to === "number") {
    finite(from, "from");
    finite(to, "to");
    return deepFreezeJson(times.map(([time, t]) => parseSpatialValue(scalarKeySchema, {
      timeUs: time,
      value: t === 0 ? from : t === 1 ? to : from + (to - from) * easing(t)
    }, "opacity key")));
  }
  if (Array.isArray(from) && Array.isArray(to) && from.length === 3 && to.length === 3) {
    const a = vec3(from, "from"), b = vec3(to, "to");
    return deepFreezeJson(times.map(([time, t]) => {
      const eased = easing(t);
      return parseSpatialValue(vec3KeySchema, {
        timeUs: time,
        value: t === 0 ? [...a] : t === 1 ? [...b] : [a[0] + (b[0] - a[0]) * eased, a[1] + (b[1] - a[1]) * eased, a[2] + (b[2] - a[2]) * eased]
      }, "vec3 key");
    }));
  }
  if (Array.isArray(from) && Array.isArray(to) && from.length === 4 && to.length === 4) {
    const a = quaternion(from, "from"), b = quaternion(to, "to");
    return deepFreezeJson(times.map(([time, t]) => parseSpatialValue(quaternionKeySchema, {
      timeUs: time,
      value: t === 0 ? unitQuaternion(a) : t === 1 ? unitQuaternion(b) : unitQuaternion(slerpQuaternion(a, b, easing(t)))
    }, "rotation key")));
  }
  throw new RangeError("from and to must share one shape: scalar opacity, vec3, or quaternion");
}
function easeChannel(input) {
  const keys = bakeKeys(input);
  const interpolation = input.interpolation ?? (input.property === "rotation" ? "slerp" : "linear");
  return deepFreezeJson(parseSpatialValue(SpatialAnimationSchema, {
    channelId: input.channelId,
    targetId: input.targetId,
    property: input.property,
    interpolation,
    keys
  }, "animation channel"));
}
function worldBounds(entry) {
  if (entry.bounds === undefined) {
    const p = entry.transform.position;
    return { min: [p[0], p[1], p[2]], max: [p[0], p[1], p[2]] };
  }
  return transformBounds(composeTransform(entry.transform), entry.bounds);
}
function moved(transformValue, axis, position) {
  const next = [transformValue.position[0], transformValue.position[1], transformValue.position[2]];
  next[axis] = position;
  return emitTransform({ position: next, rotation: transformValue.rotation, scale: transformValue.scale });
}
function shifted(transformValue, delta) {
  const p = transformValue.position;
  return emitTransform({ position: [p[0] + delta[0], p[1] + delta[1], p[2] + delta[2]], rotation: transformValue.rotation, scale: transformValue.scale });
}
function align(items, axis, edge) {
  const index = AXIS_INDEX[axis];
  if (items.length === 0)
    return deepFreezeJson([]);
  for (const entry of items)
    transform2(entry.transform, "transform");
  const enclosed = items.map(worldBounds);
  const lows = enclosed.map((item) => item.min[index]);
  const highs = enclosed.map((item) => item.max[index]);
  const target = edge === "min" ? Math.min(...lows) : edge === "max" ? Math.max(...highs) : (Math.min(...lows) + Math.max(...highs)) / 2;
  return deepFreezeJson(items.map((item, itemIndex) => {
    const current = edge === "min" ? lows[itemIndex] : edge === "max" ? highs[itemIndex] : (lows[itemIndex] + highs[itemIndex]) / 2;
    return moved(item.transform, index, item.transform.position[index] + target - current);
  }));
}
function distribute(items, axis, mode) {
  const index = AXIS_INDEX[axis];
  if (items.length < 2)
    return deepFreezeJson(items.map((item) => emitTransform(item.transform)));
  for (const entry of items)
    transform2(entry.transform, "transform");
  const enclosed = items.map(worldBounds);
  const order = items.map((_, itemIndex) => itemIndex).sort((a, b) => items[a].transform.position[index] - items[b].transform.position[index] || a - b);
  const positions = new Array(items.length);
  const first = order[0];
  positions[first] = items[first].transform.position[index];
  let edge = enclosed[first].max[index];
  const gap = "gap" in mode ? finite(mode.gap, "gap") : (finite(mode.span, "span") - order.reduce((total, itemIndex) => total + enclosed[itemIndex].max[index] - enclosed[itemIndex].min[index], 0)) / (items.length - 1);
  for (let place = 1;place < order.length; place++) {
    const itemIndex = order[place];
    const offset = enclosed[itemIndex].min[index] - items[itemIndex].transform.position[index];
    positions[itemIndex] = edge + gap - offset;
    edge = edge + gap + enclosed[itemIndex].max[index] - enclosed[itemIndex].min[index];
  }
  return deepFreezeJson(items.map((item, itemIndex) => moved(item.transform, index, positions[itemIndex])));
}
function row(items, mode) {
  return distribute(items, "x", mode);
}
function column(items, mode) {
  return distribute(items, "y", mode);
}
function stack(items, mode) {
  return distribute(items, "z", mode);
}
function grid(input) {
  if (!Number.isSafeInteger(input.rows) || input.rows < 1)
    throw new RangeError("rows must be a positive integer");
  if (!Number.isSafeInteger(input.columns) || input.columns < 1)
    throw new RangeError("columns must be a positive integer");
  if (input.rows * input.columns > SPATIAL_SCENE_LIMITS.entities)
    throw new RangeError("grid exceeds the entity limit");
  const spacing = typeof input.cellSize === "number" ? [input.cellSize, input.cellSize] : input.cellSize;
  if (!Array.isArray(spacing) || spacing.length !== 2)
    throw new RangeError("cellSize must be a scalar or [x, z] pair");
  const [sx, sz] = [finite(spacing[0], "cellSize[0]"), finite(spacing[1], "cellSize[1]")];
  const origin = input.origin === undefined ? [0, 0, 0] : vec3(input.origin, "origin");
  return deepFreezeJson(parseSpatialValue(z3.array(SpatialVec3Schema), Array.from({ length: input.rows * input.columns }, (_, cell) => [origin[0] + cell % input.columns * sx, origin[1], origin[2] + Math.floor(cell / input.columns) * sz]), "grid"));
}
function groundSnap(transformValue, halfHeight, floorY = 0) {
  finite(halfHeight, "halfHeight");
  finite(floorY, "floorY");
  if (halfHeight < 0)
    throw new RangeError("halfHeight must be nonnegative");
  transform2(transformValue, "transform");
  return emitTransform({
    position: [transformValue.position[0], floorY + halfHeight, transformValue.position[2]],
    rotation: transformValue.rotation,
    scale: transformValue.scale
  });
}
function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = state + 1831565813 >>> 0;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}
function scatter(input) {
  if (!Number.isSafeInteger(input.seed) || input.seed < 0 || input.seed > 4294967295) {
    throw new RangeError("seed must be an integer within [0, 2^32 - 1]");
  }
  if (!Number.isSafeInteger(input.count) || input.count < 0 || input.count > SPATIAL_SCENE_LIMITS.entities) {
    throw new RangeError(`count must be an integer within [0, ${SPATIAL_SCENE_LIMITS.entities}]`);
  }
  const region = input.region;
  for (const [value, label] of [[region.minX, "minX"], [region.maxX, "maxX"], [region.minZ, "minZ"], [region.maxZ, "maxZ"]])
    finite(value, `region.${label}`);
  if (region.minX > region.maxX || region.minZ > region.maxZ)
    throw new RangeError("region requires min <= max");
  const spacing = input.minSpacing === undefined ? 0 : finite(input.minSpacing, "minSpacing");
  if (spacing < 0)
    throw new RangeError("minSpacing must be nonnegative");
  const random = mulberry32(input.seed);
  const accepted = [];
  for (let placed = 0;placed < input.count; placed++) {
    let done = false;
    for (let attempt = 0;attempt < SCATTER_MAX_ATTEMPTS && !done; attempt++) {
      const x = region.minX + random() * (region.maxX - region.minX);
      const z4 = region.minZ + random() * (region.maxZ - region.minZ);
      if (spacing === 0 || accepted.every(([px, , pz]) => (px - x) * (px - x) + (pz - z4) * (pz - z4) >= spacing * spacing)) {
        accepted.push([x, 0, z4]);
        done = true;
      }
    }
    if (!done)
      throw new RangeError("scatter could not satisfy minSpacing within the region");
  }
  return deepFreezeJson(parseSpatialValue(z3.array(SpatialVec3Schema), accepted, "scatter"));
}
function onTopOf(moverBounds, moverTransform, targetBounds, targetTransform) {
  const mover = transformBounds(composeTransform(transform2(moverTransform, "moverTransform")), bounds(moverBounds, "moverBounds"));
  const target = transformBounds(composeTransform(transform2(targetTransform, "targetTransform")), bounds(targetBounds, "targetBounds"));
  return shifted(moverTransform, [
    (target.min[0] + target.max[0]) / 2 - (mover.min[0] + mover.max[0]) / 2,
    target.max[1] - mover.min[1],
    (target.min[2] + target.max[2]) / 2 - (mover.min[2] + mover.max[2]) / 2
  ]);
}
function nextTo(moverBounds, moverTransform, targetBounds, targetTransform, options) {
  const index = AXIS_INDEX[options?.axis ?? "x"];
  const side = options?.side ?? "after";
  const gap = finite(options?.gap ?? 0, "gap");
  const mover = transformBounds(composeTransform(transform2(moverTransform, "moverTransform")), bounds(moverBounds, "moverBounds"));
  const target = transformBounds(composeTransform(transform2(targetTransform, "targetTransform")), bounds(targetBounds, "targetBounds"));
  const delta = [0, 0, 0];
  delta[index] = side === "after" ? target.max[index] + gap - mover.min[index] : target.min[index] - gap - mover.max[index];
  for (const other of [0, 1, 2]) {
    if (other === index)
      continue;
    delta[other] = (target.min[other] + target.max[other]) / 2 - (mover.min[other] + mover.max[other]) / 2;
  }
  return shifted(moverTransform, delta);
}
function facing(transformValue, target, up = WORLD_UP) {
  transform2(transformValue, "transform");
  vec3(target, "target");
  vec3(up, "up");
  if (Math.hypot(...up) === 0)
    throw new RangeError("up must be nonzero");
  return emitTransform({
    position: transformValue.position,
    rotation: lookRotation(transformValue.position, target, up),
    scale: transformValue.scale
  });
}
function orbitKeys(input) {
  const center = vec3(input.center, "center");
  const radius = finite(input.radius, "radius");
  if (radius < 0)
    throw new RangeError("radius must be nonnegative");
  const height = input.height === undefined ? center[1] : finite(input.height, "height");
  const revolutions = finite(input.revolutions ?? 1, "revolutions");
  const up = input.up === undefined ? WORLD_UP : vec3(input.up, "up");
  if (Math.hypot(...up) === 0)
    throw new RangeError("up must be nonzero");
  const startUs = timeUs(input.startUs ?? 0, "startUs");
  const duration2 = timeUs(input.durationUs, "durationUs");
  if (duration2 === 0)
    throw new RangeError("durationUs must be positive");
  timeUs(startUs + duration2, "startUs + durationUs");
  const times = keyTimes(startUs, duration2, segments(input.segments, duration2));
  const position = [];
  const rotation = [];
  for (const [time, t] of times) {
    const angle = 2 * Math.PI * revolutions * t % (2 * Math.PI);
    const at = [center[0] + radius * Math.cos(angle), height, center[2] + radius * Math.sin(angle)];
    position.push(parseSpatialValue(vec3KeySchema, { timeUs: time, value: at }, "orbit position key"));
    rotation.push(parseSpatialValue(quaternionKeySchema, { timeUs: time, value: lookRotation(at, center, up) }, "orbit rotation key"));
  }
  return deepFreezeJson({ position, rotation });
}
function frameFitPose(boundsInput, projectionInput, marginInput = 0.1) {
  const box = bounds(boundsInput, "bounds");
  const projection = parseSpatialValue(SpatialProjectionSchema, projectionInput, "projection");
  const margin = finite(marginInput, "margin");
  if (margin < 0 || margin >= 1)
    throw new RangeError("margin must lie within [0, 1)");
  const center = [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2];
  const half = [(box.max[0] - box.min[0]) / 2, (box.max[1] - box.min[1]) / 2, (box.max[2] - box.min[2]) / 2];
  const pad = Math.max(0.000000001, projection.near * 0.000000001);
  if (projection.kind === "perspective") {
    const roomX2 = Math.min(projection.cx, projection.width - projection.cx) * (1 - margin);
    const roomY2 = Math.min(projection.cy, projection.height - projection.cy) * (1 - margin);
    if (roomX2 <= 0 || roomY2 <= 0)
      throw new RangeError("projection has no image room around its principal point");
    const distance = Math.max(projection.fx * half[0] / roomX2 + half[2], projection.fy * half[1] / roomY2 + half[2], projection.near + half[2]) + pad;
    if (distance + half[2] > projection.far)
      throw new RangeError("bounds exceed the projection's far clipping distance");
    return emitPose([center[0], center[1], center[2] + distance], [0, 0, 0, 1]);
  }
  const roomX = (projection.right - projection.left) / 2 * (1 - margin);
  const roomY = (projection.top - projection.bottom) / 2 * (1 - margin);
  if (half[0] > roomX || half[1] > roomY)
    throw new RangeError("bounds exceed the shrunken orthographic extents");
  return emitPose([
    center[0] - (projection.left + projection.right) / 2,
    center[1] - (projection.top + projection.bottom) / 2,
    center[2] + projection.near + half[2] + pad
  ], [0, 0, 0, 1]);
}

// src/spatial-scene/generate.ts
import { z as z4 } from "zod";
var SPATIAL_GENERATOR_LIMITS = Object.freeze({
  moduleSourceBytes: 1048576,
  parametersBytes: 65536,
  parametersDepth: 16,
  parametersValues: 8192
});
var moduleResultSchema = z4.strictObject({
  entities: z4.array(z4.unknown()).max(SPATIAL_SCENE_LIMITS.entities),
  editableKeys: SpatialGeneratorSchema.shape.editableKeys.optional()
});
function parseSpatialGeneratorParameters(input) {
  return createBoundedJsonValueSnapshot(input, SPATIAL_GENERATOR_LIMITS.parametersBytes, "generator parameters", {
    maximumDepth: SPATIAL_GENERATOR_LIMITS.parametersDepth,
    maximumValues: SPATIAL_GENERATOR_LIMITS.parametersValues
  }).value;
}
function spatialGeneratorParametersSha256(parameters) {
  return spatialValueSha256({ domain: "slopcamera.generator-parameters.v1", parameters });
}
function deriveSpatialGeneratorSeed(sourceSha256) {
  SpatialDigestSchema.parse(sourceSha256);
  return Number.parseInt(sourceSha256.slice(0, 8), 16);
}
function spatialGeneratorAttemptId(options) {
  return `attempt_${spatialValueSha256({ domain: "slopcamera.generator-attempt.v1", ...options }).slice(0, 32)}`;
}
function generatedAssetReference(entity) {
  if (entity.kind === "mesh") {
    if (entity.geometry.kind === "asset")
      return entity.geometry.assetId;
    return entity.material.map;
  }
  if (entity.kind === "text")
    return entity.fontAssetId;
  return "assetId" in entity ? entity.assetId : undefined;
}
function validateSpatialGeneratorOutput(generatorId, output) {
  SpatialGeneratorIdSchema.parse(generatorId);
  const result = parseSpatialValue(moduleResultSchema, output, "generator output");
  const seen = new Set;
  const entities = [];
  for (const [index, raw] of result.entities.entries()) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw new SpatialSceneError("invalid-data", `Generated entity ${index} must be a plain object carrying a stable key.`, "generator output");
    }
    const record = raw;
    const key = record.key;
    if (typeof key !== "string" || key.length < 1 || key.length > 256) {
      throw new SpatialSceneError("invalid-data", `Generated entity ${index} must carry a string "key" of 1\u2013256 characters.`, "generator output");
    }
    if ("entityId" in record || "origin" in record) {
      throw new SpatialSceneError("invalid-data", `Generated entity "${key}" must not set entityId or origin; the host stamps generated identity.`, "generator output");
    }
    if (seen.has(key))
      throw new SpatialSceneError("invalid-data", `Duplicate generator output key "${key}".`, "generator output");
    seen.add(key);
    const { key: _omitted, ...fields } = record;
    const entity = parseSpatialValue(SpatialEntitySchema, {
      ...fields,
      entityId: generatedSpatialEntityId(generatorId, key),
      origin: { kind: "generated", generatorId, key }
    }, `generator output ${key}`);
    const assetId = generatedAssetReference(entity);
    if (assetId !== undefined) {
      throw new SpatialSceneError("invalid-data", `Generated entity "${key}" references ${assetId}; generated entities cannot reference assets in this version.`, "generator output");
    }
    entities.push(entity);
  }
  const editableKeys = result.editableKeys ?? [];
  const declared = new Set;
  for (const editable of editableKeys) {
    if (declared.has(editable.key))
      throw new SpatialSceneError("invalid-data", `Duplicate editable key "${editable.key}".`, "generator editableKeys");
    declared.add(editable.key);
    if (!seen.has(editable.key)) {
      throw new SpatialSceneError("invalid-data", `Editable key "${editable.key}" does not match any produced entity key.`, "generator editableKeys");
    }
  }
  return deepFreezeJson({ entities, editableKeys });
}
function buildSpatialGeneratorRecord(options) {
  const outputSha256 = spatialGeneratorOutputSha256(options.entities);
  const attemptId = spatialGeneratorAttemptId({
    generatorId: options.generatorId,
    sourceSha256: options.sourceSha256,
    parametersSha256: options.parametersSha256,
    runtimeSha256: options.runtimeSha256,
    outputSha256,
    seed: options.seed
  });
  return parseSpatialValue(SpatialGeneratorSchema, {
    generatorId: options.generatorId,
    sourceSha256: options.sourceSha256,
    closureSha256: options.closureSha256,
    parametersSha256: options.parametersSha256,
    seed: options.seed,
    outputSha256,
    execution: { kind: "attempt", attemptId, runtimeSha256: options.runtimeSha256 },
    editableKeys: options.editableKeys
  }, "generator");
}
function createSpatialGeneratorSceneShell() {
  return {
    kind: "slopcamera.spatial-scene",
    schemaVersion: 1,
    sceneId: "scene_generated",
    coordinates: "right-handed-y-up-meters",
    durationUs: 4000000,
    entities: [],
    cameras: [{
      cameraId: "camera_main",
      name: "Main",
      pose: { position: [0, 3, 8], rotation: [0, 0, 0, 1] },
      projection: { kind: "perspective", width: 960, height: 540, fx: 650, fy: 650, cx: 480, cy: 270, near: 0.1, far: 200 }
    }],
    assets: [],
    animations: [],
    generators: [],
    overrides: []
  };
}
function mergeSpatialGeneratorOutput(scene, generator, entities) {
  const base = scene ?? parseSpatialScene(createSpatialGeneratorSceneShell());
  const retained = new Set(entities.map((entity) => entity.entityId));
  const removed = new Set;
  const kept = [];
  for (const entity of base.entities) {
    if (entity.origin.kind === "generated" && entity.origin.generatorId === generator.generatorId) {
      if (!retained.has(entity.entityId))
        removed.add(entity.entityId);
      continue;
    }
    kept.push(entity);
  }
  for (const override of base.overrides) {
    if (removed.has(override.entityId)) {
      throw new SpatialSceneError("conflict", `Regeneration removed ${override.entityId}; remove its ${override.property} override or restore the produced key.`, "overrides");
    }
  }
  for (const channel of base.animations) {
    if (removed.has(channel.targetId)) {
      throw new SpatialSceneError("conflict", `Regeneration removed ${channel.targetId}; remove channel ${channel.channelId} or restore the produced key.`, "animations");
    }
  }
  const keptIds = new Set(kept.map((entity) => entity.entityId));
  for (const entity of entities) {
    if (keptIds.has(entity.entityId))
      throw new SpatialSceneError("conflict", `Generator output collides with ${entity.entityId}.`, "entities");
  }
  const generators = [...base.generators.filter((record) => record.generatorId !== generator.generatorId), generator];
  return parseSpatialScene({ ...base, entities: [...kept, ...entities], generators });
}

// src/spatial-scene/gltf.ts
import { z as z5 } from "zod";
var SPATIAL_GLB_PROFILE = "slopcamera.glb-triangles-trs-pbr-basecolor-v1";
var SPATIAL_GLB_LIMITS = Object.freeze({
  bytes: 134217728,
  jsonBytes: 2097152,
  jsonValues: 200000,
  jsonDepth: 32,
  nodes: 4096,
  meshes: 256,
  primitives: 256,
  verticesPerPrimitive: 65536,
  triangles: 1e5,
  decodedAccessorValues: 2000000,
  accessors: 4096,
  bufferViews: 4096,
  materials: 256,
  images: 128,
  imageBytes: 16777216,
  imageTotalBytes: 33554432,
  imagePixels: 67108864,
  clips: 256,
  channels: 4096,
  animationKeys: 4096,
  durationSeconds: 3600
});
var finite2 = z5.number().finite().min(-1e6).max(1e6);
var index = z5.number().int().min(0).max(65535);
var unit = z5.number().finite().min(0).max(1);
var vec32 = z5.tuple([finite2, finite2, finite2]);
var signedUnit = z5.number().finite().min(-1).max(1);
var quaternion2 = z5.tuple([signedUnit, signedUnit, signedUnit, signedUnit]);
var metadata = { name: z5.string().max(1024).optional(), extras: z5.unknown().optional(), extensions: z5.never().optional() };
var byteOffset = z5.number().int().min(0).max(SPATIAL_GLB_LIMITS.bytes);
var textureInfo = z5.strictObject({ ...metadata, index, texCoord: z5.literal(0).optional() });
var samplerSchema = z5.strictObject({
  ...metadata,
  magFilter: z5.union([z5.literal(9728), z5.literal(9729)]).optional(),
  minFilter: z5.union([z5.literal(9728), z5.literal(9729), z5.literal(9984), z5.literal(9985), z5.literal(9986), z5.literal(9987)]).optional(),
  wrapS: z5.union([z5.literal(33071), z5.literal(33648), z5.literal(10497)]).default(10497),
  wrapT: z5.union([z5.literal(33071), z5.literal(33648), z5.literal(10497)]).default(10497)
});
var nodeSchema = z5.strictObject({
  ...metadata,
  children: z5.array(index).max(SPATIAL_GLB_LIMITS.nodes).default([]),
  mesh: index.optional(),
  translation: vec32.optional(),
  rotation: quaternion2.optional(),
  scale: vec32.optional(),
  matrix: z5.array(finite2).length(16).optional()
});
var accessorSchema = z5.strictObject({
  ...metadata,
  bufferView: index,
  byteOffset: byteOffset.default(0),
  componentType: z5.union([z5.literal(5121), z5.literal(5123), z5.literal(5125), z5.literal(5126)]),
  normalized: z5.boolean().default(false),
  count: z5.number().int().min(1).max(SPATIAL_GLB_LIMITS.triangles * 3),
  type: z5.enum(["SCALAR", "VEC2", "VEC3", "VEC4"]),
  min: z5.array(finite2).min(1).max(4).optional(),
  max: z5.array(finite2).min(1).max(4).optional()
});
var gltfSchema = z5.strictObject({
  ...metadata,
  asset: z5.strictObject({ version: z5.literal("2.0"), minVersion: z5.literal("2.0").optional(), generator: z5.string().max(1024).optional(), copyright: z5.string().max(4096).optional(), extras: z5.unknown().optional(), extensions: z5.never().optional() }),
  extensionsUsed: z5.array(z5.never()).optional(),
  extensionsRequired: z5.array(z5.never()).optional(),
  buffers: z5.array(z5.strictObject({ ...metadata, byteLength: z5.number().int().min(1).max(SPATIAL_GLB_LIMITS.bytes) })).length(1),
  bufferViews: z5.array(z5.strictObject({ ...metadata, buffer: z5.literal(0), byteOffset: byteOffset.default(0), byteLength: z5.number().int().min(1).max(SPATIAL_GLB_LIMITS.bytes), byteStride: z5.number().int().min(4).max(252).optional(), target: z5.union([z5.literal(34962), z5.literal(34963)]).optional() })).max(SPATIAL_GLB_LIMITS.bufferViews),
  accessors: z5.array(accessorSchema).max(SPATIAL_GLB_LIMITS.accessors),
  scene: index.optional(),
  scenes: z5.array(z5.strictObject({ ...metadata, nodes: z5.array(index).min(1).max(SPATIAL_GLB_LIMITS.nodes) })).min(1).max(128),
  nodes: z5.array(nodeSchema).min(1).max(SPATIAL_GLB_LIMITS.nodes),
  meshes: z5.array(z5.strictObject({ ...metadata, primitives: z5.array(z5.strictObject({
    ...metadata,
    attributes: z5.strictObject({ POSITION: index, NORMAL: index.optional(), TEXCOORD_0: index.optional() }),
    indices: index.optional(),
    material: index.optional(),
    mode: z5.literal(4).default(4)
  })).min(1).max(SPATIAL_GLB_LIMITS.primitives) })).min(1).max(SPATIAL_GLB_LIMITS.meshes),
  materials: z5.array(z5.strictObject({
    ...metadata,
    pbrMetallicRoughness: z5.strictObject({ ...metadata, baseColorFactor: z5.tuple([unit, unit, unit, unit]).default([1, 1, 1, 1]), metallicFactor: unit.default(1), roughnessFactor: unit.default(1), baseColorTexture: textureInfo.optional() }).optional(),
    alphaMode: z5.enum(["OPAQUE", "MASK", "BLEND"]).default("OPAQUE"),
    alphaCutoff: unit.default(0.5),
    doubleSided: z5.boolean().default(false),
    emissiveFactor: z5.tuple([z5.literal(0), z5.literal(0), z5.literal(0)]).optional()
  })).max(SPATIAL_GLB_LIMITS.materials).default([]),
  images: z5.array(z5.strictObject({ ...metadata, bufferView: index, mimeType: z5.enum(["image/png", "image/jpeg"]) })).max(SPATIAL_GLB_LIMITS.images).default([]),
  textures: z5.array(z5.strictObject({ ...metadata, source: index, sampler: index.optional() })).max(SPATIAL_GLB_LIMITS.images).default([]),
  samplers: z5.array(samplerSchema).max(SPATIAL_GLB_LIMITS.images).default([]),
  animations: z5.array(z5.strictObject({
    ...metadata,
    samplers: z5.array(z5.strictObject({ ...metadata, input: index, output: index, interpolation: z5.enum(["STEP", "LINEAR"]).default("LINEAR") })).min(1).max(SPATIAL_GLB_LIMITS.channels),
    channels: z5.array(z5.strictObject({ ...metadata, sampler: index, target: z5.strictObject({ ...metadata, node: index, path: z5.enum(["translation", "rotation", "scale"]) }) })).min(1).max(SPATIAL_GLB_LIMITS.channels)
  })).max(SPATIAL_GLB_LIMITS.clips).default([])
});
var optionsSchema = z5.strictObject({
  metersPerUnit: z5.number().finite().min(0.000001).max(1e6),
  sourceUp: z5.enum(["x", "y", "z"]),
  nodeIndex: index.optional(),
  materialMode: z5.enum(["source", "entity"]).default("entity"),
  timeUs: z5.number().int().min(0).max(3600000000),
  clip: z5.strictObject({ index, offsetUs: z5.number().int().min(0).max(3600000000), playback: z5.enum(["once", "loop", "freeze"]) }).optional()
});
function fail(message, path = "glb") {
  throw new SpatialSceneError("invalid-data", `${SPATIAL_GLB_PROFILE}: ${message}`, path);
}
function at(array, index2, path) {
  return array[index2] ?? fail(`Missing index ${index2}.`, path);
}
function schemaValue(schema, input, name) {
  const captured = createBoundedJsonValueSnapshot(input, SPATIAL_GLB_LIMITS.jsonBytes, name, { maximumDepth: SPATIAL_GLB_LIMITS.jsonDepth, maximumValues: SPATIAL_GLB_LIMITS.jsonValues });
  const result = schema.safeParse(captured.value);
  if (!result.success) {
    const issue = result.error.issues[0];
    return fail(`Unsupported or invalid field: ${issue?.message ?? "invalid data"}.`, `${name}.${issue?.path.join(".") ?? ""}`);
  }
  return result.data;
}
function normalizedRotation(value, path) {
  if (value.length !== 4 || Math.abs(Math.hypot(...value) - 1) > 0.00001)
    fail("Rotation must be a unit XYZW quaternion.", path);
  return normalizeQuaternion(value);
}
function safeMatrix(value, path) {
  try {
    invertTransform(value);
  } catch {
    fail("Node transform must be an invertible affine matrix.", path);
  }
  return value;
}
function nodeTransform(node, path) {
  if (node.matrix) {
    if (node.translation || node.rotation || node.scale)
      fail("Node matrix and TRS cannot be combined.", path);
    const matrix = safeMatrix(Object.freeze([...node.matrix]), path);
    const axes = [[matrix[0], matrix[1], matrix[2]], [matrix[4], matrix[5], matrix[6]], [matrix[8], matrix[9], matrix[10]]];
    for (let a = 0;a < 3; a++)
      for (let b = a + 1;b < 3; b++) {
        const left = axes[a], right = axes[b];
        const dot = left.reduce((sum, value, i) => sum + value * right[i], 0);
        if (Math.abs(dot) > Math.hypot(...left) * Math.hypot(...right) * 0.000001)
          fail("Node matrix contains unsupported shear.", path);
      }
    return matrix;
  }
  const rotation = normalizedRotation(node.rotation ?? [0, 0, 0, 1], path);
  return safeMatrix(composeTransform({ position: node.translation ?? [0, 0, 0], rotation, scale: node.scale ?? [1, 1, 1] }), path);
}
function imageHeader(bytes, mimeType) {
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0, height = 0;
  if (mimeType === "image/png") {
    if (bytes.length < 45 || [137, 80, 78, 71, 13, 10, 26, 10].some((value, i) => bytes[i] !== value))
      fail("Embedded image MIME does not match a PNG signature.");
    let cursor = 8, chunks = 0, hasData = false, ended = false;
    while (cursor < bytes.length) {
      if (++chunks > 65536 || cursor + 12 > bytes.length)
        fail("Malformed PNG chunk envelope.");
      const length = data.getUint32(cursor), type = data.getUint32(cursor + 4);
      if (length > bytes.length - cursor - 12)
        fail("PNG chunk exceeds its image view.");
      if (cursor === 8) {
        if (type !== 1229472850 || length !== 13)
          fail("PNG must begin with IHDR.");
        width = data.getUint32(cursor + 8);
        height = data.getUint32(cursor + 12);
      } else if (type === 1229472850)
        fail("Duplicate PNG IHDR.");
      if (type === 1633899596)
        fail("Animated PNG textures are unsupported.");
      if (type === 1229209940)
        hasData = true;
      cursor += 12 + length;
      if (type === 1229278788) {
        if (length !== 0 || cursor !== bytes.length)
          fail("PNG IEND must end its image view.");
        ended = true;
        break;
      }
    }
    if (!hasData || !ended)
      fail("PNG requires IDAT and IEND chunks.");
  } else {
    if (bytes.length < 10 || bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217)
      fail("Embedded image MIME does not match a complete JPEG envelope.");
    let cursor = 2, segments2 = 0;
    while (cursor + 4 <= bytes.length) {
      if (++segments2 > 65536 || bytes[cursor++] !== 255)
        fail("Malformed JPEG marker.");
      while (bytes[cursor] === 255)
        cursor++;
      const marker = bytes[cursor++];
      if (marker === 218 || marker === 217)
        break;
      if (marker === 0 || marker === 216 || marker >= 208 && marker <= 215)
        fail("Unexpected JPEG standalone marker.");
      if (cursor + 2 > bytes.length)
        fail("Truncated JPEG segment.");
      const length = data.getUint16(cursor);
      if (length < 2 || cursor + length > bytes.length)
        fail("JPEG segment exceeds its image view.");
      if ([192, 193, 194].includes(marker)) {
        if (width !== 0 || length < 8 || bytes[cursor + 2] !== 8 || ![1, 3].includes(bytes[cursor + 7]))
          fail("JPEG requires one 8-bit grayscale or RGB frame.");
        height = data.getUint16(cursor + 3);
        width = data.getUint16(cursor + 5);
      } else if (marker >= 192 && marker <= 207 && ![196, 200, 204].includes(marker))
        fail("JPEG frame encoding is unsupported.");
      cursor += length;
    }
  }
  if (width < 1 || height < 1 || width > 8192 || height > 8192 || width * height > SPATIAL_GLB_LIMITS.imagePixels)
    fail("Embedded image dimensions exceed the decoded pixel profile.");
  return { width, height };
}
function readAccessors(document, binary) {
  let totalValues = 0;
  const data = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  for (const [index2, view] of document.bufferViews.entries()) {
    if (view.byteOffset + view.byteLength > document.buffers[0].byteLength)
      fail("Buffer view exceeds the declared BIN payload.", `bufferViews.${index2}`);
    if (view.byteStride !== undefined && view.byteStride % 4 !== 0)
      fail("Vertex stride must be a multiple of four.", `bufferViews.${index2}`);
  }
  return Object.freeze(document.accessors.map((accessor, index2) => {
    const path = `accessors.${index2}`;
    const view = at(document.bufferViews, accessor.bufferView, path);
    const bytes = accessor.componentType === 5121 ? 1 : accessor.componentType === 5123 ? 2 : 4;
    const components = accessor.type === "SCALAR" ? 1 : Number(accessor.type.slice(3));
    const stride = view.byteStride ?? components * bytes;
    if (accessor.byteOffset % bytes !== 0 || (view.byteOffset + accessor.byteOffset) % bytes !== 0 || stride < components * bytes || stride % bytes !== 0)
      fail("Accessor alignment or stride is invalid.", path);
    if (accessor.byteOffset + (accessor.count - 1) * stride + components * bytes > view.byteLength)
      fail("Accessor exceeds its buffer view.", path);
    if (accessor.normalized && (accessor.componentType === 5125 || accessor.componentType === 5126))
      fail("Only unsigned byte/short UVs support normalized storage in this profile.", path);
    totalValues += accessor.count * components;
    if (totalValues > SPATIAL_GLB_LIMITS.decodedAccessorValues)
      fail("Decoded accessor budget exceeded.", path);
    const values = [];
    const low = new Array(components).fill(Infinity), high = new Array(components).fill(-Infinity);
    for (let element = 0;element < accessor.count; element++)
      for (let component = 0;component < components; component++) {
        const offset = view.byteOffset + accessor.byteOffset + element * stride + component * bytes;
        const raw = accessor.componentType === 5121 ? data.getUint8(offset) : accessor.componentType === 5123 ? data.getUint16(offset, true) : accessor.componentType === 5125 ? data.getUint32(offset, true) : data.getFloat32(offset, true);
        if (!Number.isFinite(raw))
          fail("Accessor contains nonfinite data.", path);
        low[component] = Math.min(low[component], raw);
        high[component] = Math.max(high[component], raw);
        values.push(accessor.normalized ? raw / (accessor.componentType === 5121 ? 255 : 65535) : raw);
      }
    for (const [declared, computed, label] of [[accessor.min, low, "min"], [accessor.max, high, "max"]]) {
      if (declared !== undefined && (declared.length !== components || declared.some((value, component) => Math.abs(value - computed[component]) > 0.000001 * Math.max(1, Math.abs(value)))))
        fail(`Accessor ${label} does not match decoded values.`, path);
    }
    return Object.freeze({ source: accessor, components, values: Object.freeze(values) });
  }));
}
function validateViewRoles(document) {
  const roles = new Map, vertexAccessors = new Map;
  const assign = (viewIndex, role) => {
    const previous = roles.get(viewIndex);
    if (previous !== undefined && previous !== role)
      fail(`Buffer view mixes ${previous} and ${role} data.`, `bufferViews.${viewIndex}`);
    roles.set(viewIndex, role);
  };
  const accessor = (index2, role) => {
    const source = at(document.accessors, index2, "accessors");
    assign(source.bufferView, role);
    if (role === "vertex") {
      const ids = vertexAccessors.get(source.bufferView) ?? new Set;
      ids.add(index2);
      vertexAccessors.set(source.bufferView, ids);
    }
  };
  for (const mesh of document.meshes)
    for (const primitive of mesh.primitives) {
      for (const index2 of Object.values(primitive.attributes))
        if (index2 !== undefined)
          accessor(index2, "vertex");
      if (primitive.indices !== undefined)
        accessor(primitive.indices, "index");
    }
  for (const clip of document.animations)
    for (const sampler of clip.samplers) {
      accessor(sampler.input, "animation");
      accessor(sampler.output, "animation");
    }
  for (const image of document.images)
    assign(image.bufferView, "image");
  for (const [viewIndex, ids] of vertexAccessors)
    if (ids.size > 1 && at(document.bufferViews, viewIndex, "bufferViews").byteStride === undefined)
      fail("Shared vertex-attribute views require an explicit stride.", `bufferViews.${viewIndex}`);
}
function cleanSampler(sampler) {
  return Object.freeze({
    wrapS: sampler?.wrapS ?? 10497,
    wrapT: sampler?.wrapT ?? 10497,
    ...sampler?.magFilter === undefined ? {} : { magFilter: sampler.magFilter },
    ...sampler?.minFilter === undefined ? {} : { minFilter: sampler.minFilter }
  });
}
function materials(document) {
  for (const texture of document.textures) {
    at(document.images, texture.source, "textures.source");
    if (texture.sampler !== undefined)
      at(document.samplers, texture.sampler, "textures.sampler");
  }
  return deepFreezeJson(document.materials.map((material) => {
    const pbr = material.pbrMetallicRoughness;
    const texture = pbr?.baseColorTexture === undefined ? undefined : at(document.textures, pbr.baseColorTexture.index, "baseColorTexture");
    return {
      baseColorLinear: pbr?.baseColorFactor ?? [1, 1, 1, 1],
      metalness: pbr?.metallicFactor ?? 1,
      roughness: pbr?.roughnessFactor ?? 1,
      alphaMode: material.alphaMode,
      alphaCutoff: material.alphaCutoff,
      doubleSided: material.doubleSided,
      ...texture === undefined ? {} : { baseColorTexture: { imageIndex: texture.source, sampler: cleanSampler(texture.sampler === undefined ? undefined : document.samplers[texture.sampler]) } }
    };
  }));
}
function readMeshes(document, accessors) {
  const sources = materials(document);
  const defaultMaterial = { baseColorLinear: [1, 1, 1, 1], metalness: 1, roughness: 1, alphaMode: "OPAQUE", alphaCutoff: 0.5, doubleSided: false };
  let primitiveCount = 0, triangles = 0;
  return deepFreezeJson(document.meshes.map((mesh, meshIndex) => mesh.primitives.map((primitive, primitiveIndex) => {
    const path = `meshes.${meshIndex}.primitives.${primitiveIndex}`;
    if (++primitiveCount > SPATIAL_GLB_LIMITS.primitives)
      fail("Source primitive count exceeds this profile.", path);
    const positions = at(accessors, primitive.attributes.POSITION, path);
    const normals = primitive.attributes.NORMAL === undefined ? undefined : at(accessors, primitive.attributes.NORMAL, path);
    const uvs = primitive.attributes.TEXCOORD_0 === undefined ? undefined : at(accessors, primitive.attributes.TEXCOORD_0, path);
    const indices = primitive.indices === undefined ? undefined : at(accessors, primitive.indices, path);
    if (positions.source.type !== "VEC3" || positions.source.componentType !== 5126 || positions.source.normalized || positions.source.min === undefined || positions.source.max === undefined || positions.source.count > SPATIAL_GLB_LIMITS.verticesPerPrimitive)
      fail("POSITION requires bounded float32 VEC3 with declared min/max.", path);
    for (const attribute of [positions, normals, uvs])
      if (attribute !== undefined) {
        const view = document.bufferViews[attribute.source.bufferView];
        if ((view.byteOffset + attribute.source.byteOffset) % 4 !== 0 || attribute.source.byteOffset % 4 !== 0 || view.target !== undefined && view.target !== 34962)
          fail("Vertex attributes require four-byte alignment and ARRAY_BUFFER target.", path);
        const componentBytes = attribute.source.componentType === 5121 ? 1 : attribute.source.componentType === 5123 ? 2 : 4;
        if ((view.byteStride ?? attribute.components * componentBytes) % 4 !== 0)
          fail("Every vertex attribute element must remain four-byte aligned.", path);
        if (attribute.source.count !== positions.source.count || attribute.values.some((value) => Math.abs(value) > 1e6))
          fail("Vertex attributes require matching counts and bounded coordinates.", path);
      }
    if (normals) {
      if (normals.source.type !== "VEC3" || normals.source.componentType !== 5126 || normals.source.normalized)
        fail("NORMAL requires float32 VEC3.", path);
      for (let i = 0;i < normals.values.length; i += 3)
        if (Math.abs(Math.hypot(...normals.values.slice(i, i + 3)) - 1) > 0.0001)
          fail("Normals must be unit vectors.", path);
    }
    if (uvs && (uvs.source.type !== "VEC2" || uvs.source.componentType !== 5126 && !([5121, 5123].includes(uvs.source.componentType) && uvs.source.normalized)))
      fail("TEXCOORD_0 requires float32 or normalized unsigned byte/short VEC2.", path);
    if (indices) {
      const view = document.bufferViews[indices.source.bufferView];
      if (indices.source.type !== "SCALAR" || ![5121, 5123, 5125].includes(indices.source.componentType) || indices.source.normalized || view.byteStride !== undefined || view.target !== undefined && view.target !== 34963)
        fail("Triangle indices require tightly packed unsigned scalar storage.", path);
      const restart = indices.source.componentType === 5121 ? 255 : indices.source.componentType === 5123 ? 65535 : 4294967295;
      if (indices.values.some((value) => value >= positions.source.count || value === restart))
        fail("Triangle index is out of range or reserved for primitive restart.", path);
    }
    const vertices = indices?.values.length ?? positions.source.count;
    if (vertices % 3 !== 0)
      fail("TRIANGLES require complete index or vertex triples.", path);
    triangles += vertices / 3;
    if (triangles > SPATIAL_GLB_LIMITS.triangles)
      fail("Source triangle budget exceeded.", path);
    const material = primitive.material === undefined ? defaultMaterial : at(sources, primitive.material, path);
    if (material.baseColorTexture && uvs === undefined)
      fail("Base-color textures require TEXCOORD_0.", path);
    return { positions: positions.values, ...normals === undefined ? {} : { normals: normals.values }, ...uvs === undefined ? {} : { uvs: uvs.values }, ...indices === undefined ? {} : { indices: indices.values }, material };
  })));
}
function hierarchy(document) {
  const parents = document.nodes.map(() => null);
  for (const [index2, node] of document.nodes.entries()) {
    nodeTransform(node, `nodes.${index2}`);
    if (node.mesh !== undefined)
      at(document.meshes, node.mesh, `nodes.${index2}.mesh`);
    const seen2 = new Set;
    for (const child of node.children) {
      at(document.nodes, child, `nodes.${index2}.children`);
      if (seen2.has(child) || parents[child] !== null)
        fail("Nodes may have only one parent and unique child references.", `nodes.${index2}`);
      seen2.add(child);
      parents[child] = index2;
    }
  }
  const roots = document.nodes.map((_, index2) => index2).filter((index2) => parents[index2] === null);
  const order = [], seen = new Set, pending = [...roots];
  while (pending.length) {
    const index2 = pending.pop();
    if (seen.has(index2))
      fail("Node hierarchy contains a cycle.");
    seen.add(index2);
    order.push(index2);
    pending.push(...document.nodes[index2].children);
  }
  if (seen.size !== document.nodes.length)
    fail("Node hierarchy contains a cycle.");
  for (const scene2 of document.scenes) {
    const unique = new Set;
    for (const index2 of scene2.nodes) {
      at(document.nodes, index2, "scenes.nodes");
      if (parents[index2] !== null || unique.has(index2))
        fail("Scene roots must be unique nodes without parents.");
      unique.add(index2);
    }
  }
  if (document.scene === undefined && document.scenes.length !== 1)
    fail("Multiple scenes require an explicit glTF default scene.");
  const scene = at(document.scenes, document.scene ?? 0, "scene");
  const reachable = new Set, visit = [...scene.nodes];
  while (visit.length) {
    const index2 = visit.pop();
    reachable.add(index2);
    visit.push(...document.nodes[index2].children);
  }
  return { parents: Object.freeze(parents), order: Object.freeze(order), reachable };
}
function animationDurations(document, accessors) {
  let totalChannels = 0;
  return Object.freeze(document.animations.map((clip, clipIndex) => {
    totalChannels += clip.channels.length;
    if (totalChannels > SPATIAL_GLB_LIMITS.channels)
      fail("Animation channel budget exceeded.");
    let duration2 = 0;
    for (const sampler of clip.samplers) {
      const input = at(accessors, sampler.input, "animation input"), output = at(accessors, sampler.output, "animation output");
      if (input.source.type !== "SCALAR" || input.source.componentType !== 5126 || input.source.normalized || input.source.count > SPATIAL_GLB_LIMITS.animationKeys || input.source.min === undefined || input.source.max === undefined)
        fail("Animation input requires bounded float32 scalar seconds with min/max.");
      if (output.source.componentType !== 5126 || output.source.normalized || output.source.count !== input.source.count)
        fail("Animation output must be float32 with matching key count.");
      for (const accessor of [input, output]) {
        const view = document.bufferViews[accessor.source.bufferView];
        if (view.byteStride !== undefined || view.target !== undefined)
          fail("Animation data must be tightly packed without a GPU buffer target.");
      }
      let previous = -1;
      for (const time of input.values) {
        if (time < 0 || time <= previous || time > SPATIAL_GLB_LIMITS.durationSeconds)
          fail("Animation times must be strictly ordered nonnegative seconds within the duration profile.");
        previous = time;
      }
      duration2 = Math.max(duration2, previous);
    }
    const writers = new Set;
    for (const channel of clip.channels) {
      const node = at(document.nodes, channel.target.node, "animation target");
      if (node.matrix)
        fail("Animated nodes must use TRS, never a matrix.");
      const key = `${channel.target.node}:${channel.target.path}`;
      if (writers.has(key))
        fail("Animation has multiple writers for one node property.", `animations.${clipIndex}`);
      writers.add(key);
      const sampler = at(clip.samplers, channel.sampler, "animation sampler");
      const output = accessors[sampler.output];
      if (output.source.type !== (channel.target.path === "rotation" ? "VEC4" : "VEC3"))
        fail("Animation output arity does not match its target property.");
      if (channel.target.path === "rotation")
        for (let i = 0;i < output.values.length; i += 4)
          normalizedRotation(output.values.slice(i, i + 4), "animation rotation");
      else if (output.values.some((value) => Math.abs(value) > 1e6 || channel.target.path === "scale" && value === 0))
        fail("Animation transform values are unbounded or singular.");
      if (channel.target.path === "scale" && sampler.interpolation === "LINEAR") {
        for (let i = 3;i < output.values.length; i++)
          if (Math.sign(output.values[i]) !== Math.sign(output.values[i - 3]))
            fail("Linear scale animation crosses a singular transform.");
      }
    }
    return duration2;
  }));
}

class SpatialGlbModel {
  profile = SPATIAL_GLB_PROFILE;
  nodeCount;
  clipDurationsSeconds;
  #state;
  constructor(state) {
    this.#state = state;
    this.nodeCount = state.document.nodes.length;
    this.clipDurationsSeconds = state.clipDurations;
    Object.freeze(this);
  }
  static parse(input) {
    if (!(input instanceof Uint8Array) || input.byteLength < 28 || input.byteLength > SPATIAL_GLB_LIMITS.bytes || input.buffer instanceof SharedArrayBuffer)
      fail("Expected bounded, non-shared GLB bytes.");
    const bytes = Uint8Array.from(input);
    const header = new DataView(bytes.buffer);
    if (header.getUint32(0, true) !== 1179937895 || header.getUint32(4, true) !== 2 || header.getUint32(8, true) !== bytes.length)
      fail("Invalid GLB 2.0 header or total length.");
    const jsonLength = header.getUint32(12, true);
    if (header.getUint32(16, true) !== 1313821514 || jsonLength % 4 !== 0 || jsonLength < 4 || jsonLength > SPATIAL_GLB_LIMITS.jsonBytes || 20 + jsonLength + 8 > bytes.length)
      fail("Expected bounded first JSON chunk and following BIN chunk.");
    const binHeader = 20 + jsonLength, binLength = header.getUint32(binHeader, true);
    if (header.getUint32(binHeader + 4, true) !== 5130562 || binLength % 4 !== 0 || binHeader + 8 + binLength !== bytes.length)
      fail("Expected exactly one BIN chunk and no trailing chunks.");
    let json;
    try {
      json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(20, binHeader)));
    } catch {
      return fail("GLB JSON must be valid UTF-8 JSON.");
    }
    const document = schemaValue(gltfSchema, json, "gltf");
    const payloadLength = document.buffers[0].byteLength;
    if (payloadLength > binLength || binLength - payloadLength > 3)
      fail("Declared BIN length does not match its padding.");
    const binary = bytes.subarray(binHeader + 8);
    if (binary.subarray(payloadLength).some((byte) => byte !== 0))
      fail("BIN padding must contain zero bytes.");
    validateViewRoles(document);
    const accessors = readAccessors(document, binary);
    const meshPrimitives = readMeshes(document, accessors);
    const graph = hierarchy(document);
    const clipDurations = animationDurations(document, accessors);
    let totalImageBytes = 0, totalPixels = 0;
    const images = document.images.map((image, imageIndex) => {
      const view = at(document.bufferViews, image.bufferView, "images.bufferView");
      if (view.byteStride !== undefined || view.target !== undefined || view.byteLength > SPATIAL_GLB_LIMITS.imageBytes)
        fail("Embedded images require bounded untargeted byte views.");
      totalImageBytes += view.byteLength;
      if (totalImageBytes > SPATIAL_GLB_LIMITS.imageTotalBytes)
        fail("Embedded image byte budget exceeded.");
      const imageBytes = binary.slice(view.byteOffset, view.byteOffset + view.byteLength);
      const dimensions = imageHeader(imageBytes, image.mimeType);
      totalPixels += dimensions.width * dimensions.height;
      if (totalPixels > SPATIAL_GLB_LIMITS.imagePixels)
        fail("Embedded decoded image pixel budget exceeded.");
      return Object.freeze({ imageIndex, mimeType: image.mimeType, ...dimensions, bytes: imageBytes });
    });
    return new SpatialGlbModel({ document: deepFreezeJson(document), accessors, meshPrimitives, images: Object.freeze(images), ...graph, clipDurations });
  }
  evaluate(input) {
    const options = schemaValue(optionsSchema, input, "glb evaluation");
    const state = this.#state, document = state.document;
    if (options.nodeIndex !== undefined && !state.reachable.has(options.nodeIndex))
      fail("Selected node is absent from the default scene.", "nodeIndex");
    let sourceTimeSeconds = null;
    const animated = new Map;
    if (options.clip !== undefined) {
      const clip = at(document.animations, options.clip.index, "clip.index");
      const duration2 = state.clipDurations[options.clip.index];
      const requested = (options.timeUs + options.clip.offsetUs) / 1e6;
      if (options.clip.offsetUs / 1e6 > duration2)
        fail("Clip source offset exceeds its duration.");
      if (options.clip.playback === "once" && requested > duration2)
        fail("Once clip playback exceeds its duration.");
      sourceTimeSeconds = options.clip.playback === "loop" ? duration2 === 0 ? 0 : requested % duration2 : Math.min(requested, duration2);
      for (const channel of clip.channels) {
        const sampler = clip.samplers[channel.sampler], times = state.accessors[sampler.input].values, output = state.accessors[sampler.output];
        let lower = 0, upper = times.length - 1;
        if (sourceTimeSeconds <= times[0])
          upper = 0;
        else if (sourceTimeSeconds >= times[upper])
          lower = upper;
        else
          while (upper - lower > 1) {
            const middle = Math.floor((lower + upper) / 2);
            if (times[middle] <= sourceTimeSeconds)
              lower = middle;
            else
              upper = middle;
          }
        const left = output.values.slice(lower * output.components, (lower + 1) * output.components);
        let value = left;
        if (sampler.interpolation === "LINEAR" && upper !== lower) {
          const right = output.values.slice(upper * output.components, (upper + 1) * output.components);
          const t = (sourceTimeSeconds - times[lower]) / (times[upper] - times[lower]);
          value = channel.target.path === "rotation" ? slerpQuaternion(left, right, t) : left.map((part, index2) => part + (right[index2] - part) * t);
        }
        const pose = animated.get(channel.target.node) ?? {};
        if (channel.target.path === "rotation")
          pose.rotation = normalizedRotation(value, "evaluated clip rotation");
        else
          pose[channel.target.path] = value;
        animated.set(channel.target.node, pose);
      }
    }
    const rotation = options.sourceUp === "x" ? [0, 0, Math.SQRT1_2, Math.SQRT1_2] : options.sourceUp === "z" ? [-Math.SQRT1_2, 0, 0, Math.SQRT1_2] : [0, 0, 0, 1];
    const conversion = composeTransform({ position: [0, 0, 0], rotation, scale: [options.metersPerUnit, options.metersPerUnit, options.metersPerUnit] });
    const matrices = new Map;
    for (const index2 of state.order) {
      const node = document.nodes[index2], overrides = animated.get(index2);
      const local = overrides ? nodeTransform({ ...node, ...overrides }, `nodes.${index2}`) : nodeTransform(node, `nodes.${index2}`);
      const parent = state.parents[index2];
      matrices.set(index2, multiplyTransforms(parent === null ? conversion : matrices.get(parent), local));
    }
    const selected = new Set;
    if (options.nodeIndex === undefined)
      for (const index2 of state.reachable)
        selected.add(index2);
    else {
      const pending = [options.nodeIndex];
      while (pending.length) {
        const index2 = pending.pop();
        selected.add(index2);
        pending.push(...document.nodes[index2].children);
      }
    }
    const primitives = [], imageIds = new Set;
    let triangles = 0;
    for (const sourceNodeIndex of [...selected].sort((a, b) => a - b)) {
      const node = document.nodes[sourceNodeIndex];
      if (node.mesh === undefined)
        continue;
      const matrix = safeMatrix(matrices.get(sourceNodeIndex), `nodes.${sourceNodeIndex}`);
      for (const [sourcePrimitiveIndex, primitive] of state.meshPrimitives[node.mesh].entries()) {
        if (primitives.length >= SPATIAL_GLB_LIMITS.primitives)
          fail("Instanced primitive budget exceeded.");
        triangles += (primitive.indices?.length ?? primitive.positions.length / 3) / 3;
        if (triangles > SPATIAL_GLB_LIMITS.triangles)
          fail("Instanced triangle budget exceeded.");
        const bounds3 = vertexBounds(primitive.positions, primitive.indices, matrix);
        const { material, ...geometry } = primitive;
        if (options.materialMode === "source" && material.baseColorTexture)
          imageIds.add(material.baseColorTexture.imageIndex);
        primitives.push({ ...geometry, matrix, bounds: bounds3, sourceNodeIndex, sourcePrimitiveIndex, ...options.materialMode === "source" ? { material } : {} });
      }
    }
    if (primitives.length === 0)
      fail("Selected scene or subtree contains no triangle geometry.");
    const bounds2 = combineBounds(primitives.map((primitive) => primitive.bounds));
    const images = [...imageIds].sort((a, b) => a - b).map((index2) => {
      const image = state.images[index2];
      return Object.freeze({ ...image, bytes: image.bytes.slice() });
    });
    return Object.freeze({ profile: SPATIAL_GLB_PROFILE, primitives: deepFreezeJson(primitives), images: Object.freeze(images), bounds: bounds2, sourceTimeSeconds });
  }
}
function vertexBounds(positions, indices, matrix) {
  const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
  const count = indices?.length ?? positions.length / 3;
  for (let index2 = 0;index2 < count; index2++) {
    const offset = (indices?.[index2] ?? index2) * 3;
    const point = transformPoint(matrix, [positions[offset], positions[offset + 1], positions[offset + 2]]);
    for (let axis = 0;axis < 3; axis++) {
      low[axis] = Math.min(low[axis], point[axis]);
      high[axis] = Math.max(high[axis], point[axis]);
    }
  }
  return deepFreezeJson({ min: low, max: high });
}
function combineBounds(bounds2) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const bound of bounds2)
    for (let axis = 0;axis < 3; axis++) {
      min[axis] = Math.min(min[axis], bound.min[axis]);
      max[axis] = Math.max(max[axis], bound.max[axis]);
    }
  return deepFreezeJson({ min, max });
}
function parseSpatialGlb(bytes) {
  return SpatialGlbModel.parse(bytes);
}
function evaluateSpatialGlb(model, options) {
  if (!(model instanceof SpatialGlbModel))
    fail("Evaluation requires a parsed GLB model.");
  return model.evaluate(options);
}
function spatialGlbBounds(model) {
  return evaluateSpatialGlb(model, { metersPerUnit: 1, sourceUp: "y", timeUs: 0 }).bounds;
}

// src/spatial-scene/camera-track.ts
import { z as z6 } from "zod";
var SPATIAL_CAMERA_TRACK_MAX_FRAMES = 2048;
var clockSchema = z6.strictObject({
  startUs: SpatialTimeUsSchema,
  frameRate: SpatialFrameRateSchema,
  frameCount: z6.number().int().min(1).max(SPATIAL_CAMERA_TRACK_MAX_FRAMES)
});
var rationalSchema = z6.strictObject({
  numerator: z6.string().regex(/^(0|[1-9][0-9]{0,19})$/u),
  denominator: z6.string().regex(/^[1-9][0-9]{0,6}$/u)
});
var SpatialCameraTrackSchema = z6.strictObject({
  kind: z6.literal("slopcamera.spatial-camera-track"),
  schemaVersion: z6.literal(1),
  sceneSha256: SpatialDigestSchema,
  cameraId: SpatialCameraIdSchema,
  clock: clockSchema,
  samples: z6.array(z6.strictObject({
    frameIndex: z6.number().int().min(0).max(SPATIAL_CAMERA_TRACK_MAX_FRAMES - 1),
    timeUs: SpatialTimeUsSchema,
    exactTimeUs: rationalSchema,
    camera: SpatialCameraSchema
  })).min(1).max(SPATIAL_CAMERA_TRACK_MAX_FRAMES)
});
var optionsSchema2 = clockSchema.extend({ cameraId: SpatialCameraIdSchema });
function absoluteSample(frameIndex, clock) {
  const sample = spatialFrameSample(frameIndex, 3600000000, clock.frameRate);
  const denominator = BigInt(sample.exactTimeUs.denominator);
  return { frameIndex, timeUs: clock.startUs + sample.timeUs, exactTimeUs: {
    numerator: String(BigInt(clock.startUs) * denominator + BigInt(sample.exactTimeUs.numerator)),
    denominator: String(denominator)
  } };
}
function parseSpatialCameraTrack(input) {
  const track = parseSpatialValue(SpatialCameraTrackSchema, input, "camera track");
  const rate = reduceSpatialFrameRate(track.clock.frameRate);
  if (rate.numerator !== track.clock.frameRate.numerator || rate.denominator !== track.clock.frameRate.denominator || track.samples.length !== track.clock.frameCount)
    throw new SpatialSceneError("invalid-data", "Camera track clock or coverage is not canonical.");
  const first = track.samples[0].camera.projection;
  for (const [index2, sample] of track.samples.entries()) {
    const expected = absoluteSample(index2, track.clock);
    if (sample.frameIndex !== index2 || sample.timeUs !== expected.timeUs || sample.exactTimeUs.numerator !== expected.exactTimeUs.numerator || sample.exactTimeUs.denominator !== expected.exactTimeUs.denominator || sample.camera.cameraId !== track.cameraId || sample.camera.projection.width !== first.width || sample.camera.projection.height !== first.height) {
      throw new SpatialSceneError("invalid-data", "Camera track must preserve exact clock, camera identity, order and image dimensions.");
    }
  }
  return deepFreezeJson(track);
}
function sampleSpatialCameraTrack(sceneInput, optionsInput) {
  const scene = parseSpatialScene(sceneInput);
  const { cameraId, ...inputClock } = parseSpatialValue(optionsSchema2, optionsInput, "camera track options");
  const clock = { ...inputClock, frameRate: reduceSpatialFrameRate(inputClock.frameRate) };
  const last = absoluteSample(clock.frameCount - 1, clock);
  if (BigInt(last.exactTimeUs.numerator) >= BigInt(scene.durationUs) * BigInt(last.exactTimeUs.denominator)) {
    throw new SpatialSceneError("invalid-data", "Camera samples exceed the half-open scene duration.");
  }
  const camera = scene.cameras.find((item) => item.cameraId === cameraId);
  if (!camera)
    throw new SpatialSceneError("not-found", `Unknown camera ${cameraId}.`);
  const cameraScene = {
    ...scene,
    cameras: [camera],
    entities: [],
    assets: [],
    generators: [],
    overrides: [],
    animations: scene.animations.filter((channel) => channel.targetId === cameraId)
  };
  const cameraContext = createSpatialEvaluationContext(cameraScene);
  return parseSpatialCameraTrack({
    kind: "slopcamera.spatial-camera-track",
    schemaVersion: 1,
    sceneSha256: spatialValueSha256(scene),
    cameraId,
    clock,
    samples: Array.from({ length: clock.frameCount }, (_, frameIndex) => {
      const sample = absoluteSample(frameIndex, clock);
      return { ...sample, camera: evaluateSpatialSceneInContext(cameraContext, { cameraId, timeUs: sample.timeUs }).camera };
    })
  });
}
// src/code/index.ts
function compileWorkflowGraph2(options) {
  return compileWorkflowGraph({
    graph: options.graph,
    ...options.limits === undefined ? {} : { limits: options.limits },
    projection: PUBLIC_WORKFLOW_REGISTRY_PROJECTION
  });
}
export {
  validateSpatialShot,
  validateSpatialOverrides,
  validateSpatialGeneratorOutput,
  unprojectPixel,
  transformPoint,
  transformDirection,
  transformBounds,
  stack,
  spatialValueSha256,
  spatialTopologicalIds,
  spatialStateValueSha256,
  spatialSceneSha256,
  spatialPropertySupported,
  spatialOutputDuration,
  spatialGlbBounds,
  spatialGeneratorParametersSha256,
  spatialGeneratorOutputSha256,
  spatialGeneratorAttemptId,
  spatialFrameSample,
  spatialFrameCount,
  spatialAuditDefaultTimesUs,
  spatialAssetManifestSha256,
  spatialAssetClosureDigests,
  sortSpatialBy,
  slopcameraCodeErrorMessage,
  slerpQuaternion,
  sha256Hex,
  seconds,
  scatter,
  sampleSpatialCameraTrack,
  runWorkflow,
  runBuiltWorkflow,
  row,
  reduceSpatialFrameRate,
  projectPreparedPoint,
  projectPoint,
  prepareCameraView,
  pixelRay,
  perspectiveFromFov,
  parseSpatialValue,
  parseSpatialScene,
  parseSpatialGlb,
  parseSpatialGeneratorParameters,
  parseSpatialCameraTrack,
  orbitKeys,
  onTopOf,
  normalizeQuaternion,
  nextTo,
  multiplyTransforms,
  mergeSpatialOverrides,
  mergeSpatialGeneratorOutput,
  lookAtPose,
  isPortableSlopcameraOperationKind,
  invertTransform,
  inspectSpatialScene,
  groundSnap,
  grid,
  generatedSpatialEntityId,
  galleryProbeScene,
  galleryProbeRenderRequest,
  frameFitPose,
  facing,
  evaluateSpatialSceneInContext,
  evaluateSpatialScene,
  evaluateSpatialGlb,
  easeKeys,
  easeChannel,
  distribute,
  diffSpatialScenes,
  deriveSpatialGeneratorSeed,
  defineWorkflow,
  definePortableWorkflowFragment,
  decodeObjectIdPixels,
  createWorkflowGraphHash,
  createWorkflowCompilationHash,
  createSpatialSceneStarter,
  createSpatialGeneratorSceneShell,
  createSpatialEvaluationContext,
  createSlopcameraCodeHost,
  createPublicWorkflowRegistryProjection,
  createGraphHash,
  composeTransform,
  compileWorkflowGraph2 as compileWorkflowGraph,
  column,
  canonicalJsonSha256,
  canonicalJson,
  cameraMathView,
  buildWorkflowGraph,
  buildWorkflow,
  buildSpatialGeneratorRecord,
  boundedCanonicalJsonSha256,
  boundedCanonicalJson,
  auditSpatialSceneRenderedInContext,
  auditSpatialSceneRendered,
  auditSpatialSceneInContext,
  auditSpatialScene,
  asSlopcameraCodeError,
  applySpatialScenePatch,
  applySpatialEntityOverride,
  align,
  WORKFLOW_REF_VERSION,
  WORKFLOW_REF_BRAND,
  WORKFLOW_NODE_RECEIPT_VERSION,
  WORKFLOW_NODE_RECEIPT_HASH_DOMAIN,
  WORKFLOW_GRAPH_VERSION,
  WORKFLOW_GRAPH_HASH_DOMAIN,
  WORKFLOW_COMPILATION_VERSION,
  WORKFLOW_COMPILATION_HASH_DOMAIN,
  SpatialVec3Schema,
  SpatialTransformSchema,
  SpatialTimeUsSchema,
  SpatialShotV1Schema,
  SpatialShotIdSchema,
  SpatialSceneV1Schema,
  SpatialScenePatchV1Schema,
  SpatialSceneIdSchema,
  SpatialSceneError,
  SpatialRenderedAuditSampleSchema,
  SpatialRenderedAuditReportSchema,
  SpatialRenderedAuditOptionsSchema,
  SpatialRenderedAuditObjectSchema,
  SpatialRenderedAuditFrameSchema,
  SpatialRenderedAuditFrameReportSchema,
  SpatialRenderedAuditFindingSchema,
  SpatialRenderedAuditEntitySchema,
  SpatialRenderedAuditCoverageSchema,
  SpatialQuaternionSchema,
  SpatialProjectionSchema,
  SpatialPoseSchema,
  SpatialPlacementSchema,
  SpatialPayloadSchema,
  SpatialPatchOperationSchema,
  SpatialOverrideSchema,
  SpatialOriginSchema,
  SpatialMatrixSchema,
  SpatialMaterialSchema,
  SpatialGlbModel,
  SpatialGeometrySchema,
  SpatialGeneratorSchema,
  SpatialGeneratorIdSchema,
  SpatialFrameRateSchema,
  SpatialEntitySchema,
  SpatialEntityIdSchema,
  SpatialDigestSchema,
  SpatialChannelIdSchema,
  SpatialCameraTrackSchema,
  SpatialCameraSchema,
  SpatialCameraIdSchema,
  SpatialAuditSampleSchema,
  SpatialAuditReportSchema,
  SpatialAuditOptionsSchema,
  SpatialAuditFrustumSchema,
  SpatialAuditFindingSchema,
  SpatialAuditEntitySchema,
  SpatialAuditBoundsSchema,
  SpatialAssetManifestSchema,
  SpatialAssetInterpretationSchema,
  SpatialAssetIdSchema,
  SpatialAnimationSchema,
  SlopcameraWorkflowRunError,
  SlopcameraVectorizeReceiptSchema,
  SlopcameraVectorizeQualityReceiptSchema,
  SlopcameraVectorizeProvenanceSchema,
  SlopcameraRenderArtifactsSchema,
  SlopcameraLintFindingSchema,
  SlopcameraImageVectorizeOutputSchema,
  SlopcameraImageVectorizeInputSchema,
  SlopcameraImageModelSchema,
  SlopcameraImageGenerateOutputSchema,
  SlopcameraImageGenerateInputSchema,
  SlopcameraDiagramRenderOutputSchema,
  SlopcameraDiagramRenderInputSchema,
  SlopcameraDiagramCheckOutputSchema,
  SlopcameraDiagramCheckInputSchema,
  SlopcameraCodeError,
  SerializedRefV1Schema,
  SPATIAL_SPLAT_PROXY_REPRESENTATION,
  SPATIAL_SCENE_LIMITS,
  SPATIAL_RENDERED_AUDIT_LIMITS,
  SPATIAL_RENDERED_AUDIT_COVERAGE,
  SPATIAL_GLB_PROFILE,
  SPATIAL_GLB_LIMITS,
  SPATIAL_GENERATOR_LIMITS,
  SPATIAL_CAMERA_TRACK_MAX_FRAMES,
  SPATIAL_AUDIT_LIMITS,
  RequirementEnvelopeSchema,
  REQUIREMENT_ENVELOPE_VERSION,
  PortableWorkflowBuilder,
  PUBLIC_WORKFLOW_REGISTRY_PROJECTION_ID,
  PUBLIC_WORKFLOW_REGISTRY_PROJECTION,
  PUBLIC_SLOPCAMERA_WORKFLOW_PROJECTION,
  PORTABLE_SLOPCAMERA_OPERATION_KINDS,
  PORTABLE_SLOPCAMERA_OPERATION_CONTRACTS,
  OperationPolicySchema,
  OperationKindSchema,
  OperationDiscoverySchema,
  MAX_WORKFLOW_RESULT_VALUES,
  MAX_WORKFLOW_RESULT_DEPTH,
  MAX_WORKFLOW_RESULT_BYTES,
  MAX_IMAGE_DIMENSION,
  MAX_ABS_COMPONENT,
  JsonValueSchema,
  IDENTITY_MATRIX,
  GraphCompilerLimitsSchema,
  GRAPH_ABI,
  EvaluatedSpatialSceneSchema,
  DEFAULT_GRAPH_COMPILER_LIMITS,
  CompiledWorkflowGraphSchema,
  AuthoredWorkflowGraphV1Schema,
  AuthoredGraphNodeV1Schema
};
