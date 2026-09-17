import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import { z } from "zod";
import { canonicalJson } from "../../../src/code/canonical-json";
import { SpatialAuditBoundsSchema } from "../../../src/spatial-scene/audit";
import { createSpatialSceneStarter } from "../../../src/spatial-scene/authoring";
import { sampleSpatialCameraTrack } from "../../../src/spatial-scene/camera-track";
import { SPATIAL_SCENE_LIMITS, SpatialAssetIdSchema, SpatialAssetManifestSchema, SpatialCameraIdSchema, type SpatialAssetManifest } from "../../../src/spatial-scene/contracts";
import { SPATIAL_REVIEW_LIMITS } from "../../../src/spatial-scene/review";
import { parseSpatialScene, parseSpatialValue, spatialSceneSha256 } from "../../../src/spatial-scene/index";
import type { Bounds } from "../../../src/spatial-scene/math";
import { diffSpatialScenes } from "../../../src/spatial-scene/patch";
import type { ApplicationContext } from "../application/context";
import { createApplicationOperationRegistry } from "../application/default-registry";
import { planSpatialRender } from "../application/spatial-render";
import { SpatialAssetAdmissionV1Schema, SpatialAssetFactsV1Schema, type SpatialAssetFactsV1 } from "../contracts/spatial-asset";
import { createNodeBundleFileSystem } from "../core/storage";
import type { SpatialCliExecutionProfile, SpatialSceneCommand } from "./args";
import { CliError } from "./errors";
import { executeSpatialGenerateCommand } from "./spatial-generate-service";

/** Capture an explicit local regular file once, without following a leaf symlink. */
export async function readSpatialJson(path: string, maximumBytes: number = SPATIAL_SCENE_LIMITS.sourceBytes): Promise<unknown> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1 || maximumBytes > 32 * 1024 * 1024) throw new CliError("invalid-data", "Invalid spatial JSON byte limit.");
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.size > BigInt(maximumBytes)) throw new CliError("invalid-data", "Scene source must be a bounded regular JSON file.");
    const bytes = new Uint8Array(Number(before.size));
    let offset = 0;
    while (offset < bytes.byteLength) {
      const read = await handle.read(bytes, offset, Math.min(256 * 1024, bytes.byteLength - offset), offset);
      if (read.bytesRead === 0) throw new CliError("conflict", "Scene source ended while it was being read.");
      offset += read.bytesRead;
    }
    const after = await handle.stat({ bigint: true });
    if (bytes.byteLength > maximumBytes || after.size !== before.size || after.mtimeNs !== before.mtimeNs || after.ctimeNs !== before.ctimeNs) {
      throw new CliError("conflict", "Scene source changed while it was being read.");
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } finally { await handle.close(); }
}

export async function publishSpatialSource(path: string, value: unknown, beforePublication?: () => Promise<void>): Promise<void> {
  const directory = await realpath(dirname(resolve(path)));
  const fileSystem = createNodeBundleFileSystem(directory);
  const written = await fileSystem.writeTextNoReplace?.(basename(path), `${canonicalJson(value)}\n`, beforePublication);
  if (written !== "created") throw new CliError("conflict", "Scene output already exists. Choose a new path to retain both revisions.");
}

/** An explicit CLI profile may fill an omitted request field, never replace one. */
export function bindSpatialCliExecutionProfile(request: unknown, executionProfile: SpatialCliExecutionProfile | undefined): unknown {
  if (executionProfile === undefined) return request;
  if (typeof request !== "object" || request === null || Array.isArray(request)) throw new CliError("invalid-data", "A spatial render request must be a JSON object.");
  if ("executionProfile" in request && request.executionProfile !== executionProfile) throw new CliError("conflict", "--profile differs from the execution profile retained in the request.");
  return { ...request, executionProfile };
}

const SpatialAuditAssetBoundsMapSchema = z.record(SpatialAssetIdSchema, SpatialAuditBoundsSchema);
/** A facts payload carries no assetId; the subject manifest supplies it. */
const SpatialAuditAssetFactsPairSchema = z.strictObject({ manifest: SpatialAssetManifestSchema, facts: SpatialAssetFactsV1Schema });

function auditSubjectBounds(manifest: SpatialAssetManifest, facts: SpatialAssetFactsV1): Record<string, unknown> {
  if (facts.subject.sha256 !== manifest.payload.sha256 || facts.subject.bytes !== manifest.payload.bytes) {
    throw new CliError("invalid-data", `Asset facts for ${manifest.assetId} do not describe the manifest payload.`);
  }
  return { [manifest.assetId]: facts.bounds.sceneSpace };
}

/** One document contributes assetId → scene-space bounds; model-space bounds never substitute. */
function auditBoundsRecord(document: unknown): Record<string, unknown> {
  if (typeof document === "object" && document !== null && !Array.isArray(document)) {
    const kind = (document as { readonly kind?: unknown }).kind;
    if (kind === "slopcamera.spatial-asset-admission") {
      const admission = parseSpatialValue(SpatialAssetAdmissionV1Schema, document, "asset admission");
      return auditSubjectBounds(admission.manifest, admission.facts);
    }
    if (kind === "slopcamera.spatial-asset-facts") {
      throw new CliError("invalid-data", "A slopcamera.spatial-asset-facts payload carries no assetId; pass its slopcamera.spatial-asset-admission document or a {manifest, facts} pair.");
    }
    const pair = SpatialAuditAssetFactsPairSchema.safeParse(document);
    if (pair.success) return auditSubjectBounds(pair.data.manifest, pair.data.facts);
    if (SpatialAuditAssetBoundsMapSchema.safeParse(document).success) return document as Record<string, unknown>;
  }
  throw new CliError("invalid-data", "--asset-bounds accepts a Record<assetId, {min, max}> bounds map, a slopcamera.spatial-asset-admission document, a {manifest, facts} pair, or an array of those documents.");
}

/**
 * `--asset-bounds` accepts the raw bounds map or documents produced by
 * `scene asset admit`; each contributes scene-space bounds keyed by the
 * subject assetId. Identical repeats dedupe; differing bounds conflict.
 */
export function normalizeSpatialAuditAssetBounds(input: unknown): Record<string, Bounds> {
  const merged: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const document of Array.isArray(input) ? input : [input]) {
    for (const [assetId, bounds] of Object.entries(auditBoundsRecord(document))) {
      const existing = merged[assetId];
      if (existing !== undefined && canonicalJson(existing) !== canonicalJson(bounds)) {
        throw new CliError("conflict", `--asset-bounds supplies conflicting scene-space bounds for ${assetId}.`);
      }
      merged[assetId] = bounds;
    }
  }
  return parseSpatialValue(SpatialAuditAssetBoundsMapSchema, merged, "asset bounds");
}

function assertCameraTrackActive(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw new CliError("cancelled", "Camera track export was cancelled.");
}

export async function executeSpatialSceneCommand(application: ApplicationContext, command: SpatialSceneCommand, signal?: AbortSignal): Promise<unknown> {
  if (command.action === "generate") return executeSpatialGenerateCommand(application, command);
  // Fail closed before touching the filesystem, renderer, or provider: review
  // uploads the selected bounded rendered beauty frames to a vision model and
  // requires --allow-cloud-upload on this exact invocation.
  if (command.action === "review" && !command.allowCloudUpload) {
    throw new CliError("authorization-required", "scene review uploads bounded rendered beauty frames to a vision model and requires --allow-cloud-upload on this invocation.", { command: "scene review" });
  }
  if (command.action === "camera-track") assertCameraTrackActive(signal);
  const sourcePath = resolve(application.paths.repositoryRoot, command.path);
  if (command.action === "init") {
    const scene = createSpatialSceneStarter();
    await publishSpatialSource(sourcePath, scene);
    return { path: sourcePath, sceneSha256: spatialSceneSha256(scene) };
  }
  if (command.action === "review") {
    const acknowledgedAt = application.clock.now().toISOString();
    const authorizedApplication: ApplicationContext = {
      ...application,
      spatialReviewAuthorization: {
        authorize: async request => (typeof request.sceneSha256 === "string" && /^[a-f0-9]{64}$/u.test(request.sceneSha256)
          && SpatialCameraIdSchema.safeParse(request.cameraId).success
          && Array.isArray(request.timesUs)
          && request.timesUs.length >= 1
          && request.timesUs.length <= SPATIAL_REVIEW_LIMITS.frames
          && request.maximumFrames >= 1
          && request.maximumFrames <= SPATIAL_REVIEW_LIMITS.frames
          && request.maximumFrameBytes <= SPATIAL_REVIEW_LIMITS.pngBytes
          && request.maximumUploadBytes <= SPATIAL_REVIEW_LIMITS.uploadBytes
          ? { acknowledgedAt }
          : undefined),
      },
    };
    const result = await createApplicationOperationRegistry().execute({ application: authorizedApplication, abortSignal: signal ?? new AbortController().signal }, {
      kind: "scene.review", version: 1,
      input: {
        source: { path: relative(application.paths.repositoryRoot, sourcePath) },
        request: { cameraId: command.camera, ...(command.timesUs === undefined ? {} : { timesUs: [...command.timesUs] }) },
      },
    });
    return result.output;
  }
  if (command.action === "render-audit") {
    const result = await createApplicationOperationRegistry().execute({ application, abortSignal: signal ?? new AbortController().signal }, {
      kind: "scene.render-audit", version: 1,
      input: {
        source: { path: relative(application.paths.repositoryRoot, sourcePath) },
        request: { cameraId: command.camera, ...(command.timesUs === undefined ? {} : { timesUs: [...command.timesUs] }) },
      },
    });
    return result.output;
  }
  const scene = parseSpatialScene(await readSpatialJson(sourcePath));
  if (command.action === "diff") {
    const other = parseSpatialScene(await readSpatialJson(resolve(application.paths.repositoryRoot, command.other)));
    return { sceneSha256: spatialSceneSha256(scene), otherSha256: spatialSceneSha256(other), diff: diffSpatialScenes(scene, other) };
  }
  if (command.action === "camera-track") {
    const fence = async () => {
      assertCameraTrackActive(signal);
      await application.hostResourceLease?.assertOwned();
      assertCameraTrackActive(signal);
    };
    assertCameraTrackActive(signal);
    const request = await readSpatialJson(resolve(application.paths.repositoryRoot, command.request));
    assertCameraTrackActive(signal);
    const track = sampleSpatialCameraTrack(scene, request);
    const output = resolve(application.paths.repositoryRoot, command.output);
    await publishSpatialSource(output, track, fence);
    await fence();
    return { path: output, sceneSha256: track.sceneSha256, cameraId: track.cameraId, clock: track.clock, executed: false };
  }
  if (command.action === "plan" || command.action === "render") {
    const request = bindSpatialCliExecutionProfile(await readSpatialJson(resolve(application.paths.repositoryRoot, command.request)), command.executionProfile);
    if (command.action === "plan") return planSpatialRender(scene, request);
    const result = await createApplicationOperationRegistry().execute({ application, abortSignal: new AbortController().signal }, {
      kind: "scene.render", version: 1, input: {
        source: { path: relative(application.paths.repositoryRoot, sourcePath) }, request,
        ...(command.assets === undefined ? {} : { assets: await readSpatialJson(resolve(application.paths.repositoryRoot, command.assets)) }),
      },
    });
    return result.output;
  }
  const registry = createApplicationOperationRegistry();
  if (command.action === "audit") {
    const result = await registry.execute({ application, abortSignal: new AbortController().signal }, {
      kind: "scene.audit", version: 1,
      input: {
        scene, cameraId: command.camera,
        ...(command.timesUs === undefined ? {} : { timesUs: [...command.timesUs] }),
        ...(command.assetBounds === undefined ? {} : { assetBounds: normalizeSpatialAuditAssetBounds(await readSpatialJson(resolve(application.paths.repositoryRoot, command.assetBounds))) }),
      },
    });
    return result.output;
  }
  const input = command.action === "patch"
    ? { scene, patch: await readSpatialJson(resolve(application.paths.repositoryRoot, command.patch)) }
    : command.action === "evaluate" ? { scene, cameraId: command.camera, timeUs: command.timeUs } : { scene };
  const result = await registry.execute({ application, abortSignal: new AbortController().signal }, {
    kind: command.action === "patch" ? "scene.patch" : command.action === "evaluate" ? "scene.evaluate" : "scene.inspect",
    version: 1, input,
  });
  if (command.action === "patch") {
    const output = result.output as { readonly scene: unknown };
    await publishSpatialSource(resolve(application.paths.repositoryRoot, command.output), output.scene);
  }
  return result.output;
}
