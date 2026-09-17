import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readdir, realpath, rm } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { createBoundedJsonSnapshot } from "../../../src/code/json-snapshot";
import {
  SpatialCameraIdSchema, SpatialTimeUsSchema, type EvaluatedSpatialScene, type SpatialSceneV1,
} from "../../../src/spatial-scene/contracts";
import { evaluateSpatialScene } from "../../../src/spatial-scene/evaluate";
import { parseSpatialScene, parseSpatialValue, spatialAssetClosureDigests, spatialSceneSha256 } from "../../../src/spatial-scene/identity";
import {
  buildSpatialReviewReport, redactedSpatialReviewProviderError, SPATIAL_REVIEW_LIMITS,
  SPATIAL_REVIEW_PROMPT_SHA256, SPATIAL_REVIEW_PROMPT_VERSION,
  SPATIAL_REVIEW_UPLOAD_POLICY, spatialReviewDefaultTimesUs, SpatialReviewProviderError,
  type SpatialReviewProvider, type SpatialReviewReport, type SpatialReviewRequestFrame,
} from "../../../src/spatial-scene/review";
import { canonicalJson } from "../core/canonical-json";
import { assertHtmlOverlayGpuEvidenceProfile } from "../html-overlay/execution-profile";
import { exactCapabilityByName } from "./capability-binding";
import { ApplicationError } from "./errors";
import { bindHtmlOverlayBrowserRuntime, HtmlOverlayBrowserRuntimeBindingSchema, type HtmlOverlayBrowserRuntimeBinding } from "./html-overlay-browser-runtime";
import { createHtmlOverlayExecutionBundle, HtmlOverlayExecutionIntegritySchema } from "./html-overlay-integrity";
import type { OperationExecutionContext } from "./operation";
import { assertMediaCapabilities, bindExpectedMediaCapabilities, MediaCapabilityBindingsSchema, mediaCapabilityCommand, mediaCapabilityRunner, type MediaCapabilityName } from "./operations/media/capabilities";
import { AbortBoundApplicationRunner, createMediaOperationWorkspace } from "./operations/media/shared";
import { throwIfAborted } from "./operations/shared";
import { frameName, partitionSpatialRenderWindow, readPhysical, SPATIAL_RENDER_LIMITS, verifyPng } from "./spatial-render";
import { withPreparedSpatialAssets } from "./spatial-assets";

function checked(condition: boolean, message: string): asserts condition {
  if (!condition) throw new ApplicationError("invalid-data", message);
}
const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

export const SpatialReviewRequestSchema = z.strictObject({
  cameraId: SpatialCameraIdSchema,
  /** Exact integer-microsecond samples; omitted means the fixed four-sample default. */
  timesUs: z.array(SpatialTimeUsSchema).min(1).max(SPATIAL_REVIEW_LIMITS.frames).optional(),
});
export type SpatialReviewRequest = z.infer<typeof SpatialReviewRequestSchema>;

/** The consent grant the adapter-owned authorization envelope returns. */
export interface SpatialReviewGrant {
  readonly acknowledgedAt: string;
}

/**
 * The exact bounded upload an invocation-scoped consent envelope is asked to
 * authorize before any capability probe, render, or provider dispatch.
 */
export interface SpatialReviewAuthorizationRequest {
  readonly sceneSha256: string;
  readonly cameraId: string;
  readonly timesUs: readonly number[];
  readonly maximumFrames: number;
  readonly maximumFrameBytes: number;
  readonly maximumUploadBytes: number;
}

/** Explicit host envelope. Generic workflow approval never grants this permission. */
export interface ApplicationSpatialReviewAuthorization {
  authorize(request: SpatialReviewAuthorizationRequest): Promise<SpatialReviewGrant | undefined>;
}

export interface SpatialReviewPlan {
  readonly scene: SpatialSceneV1;
  /** The authored scene with the review camera's projection downscaled. */
  readonly evaluationScene: SpatialSceneV1;
  readonly sceneSha256: string;
  readonly request: SpatialReviewRequest;
  readonly timesUs: readonly number[];
  readonly width: number;
  readonly height: number;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly excludedEntityIds: readonly string[];
  readonly costs: {
    readonly sourceBytes: number;
    readonly renderPixels: number;
    readonly pngBytesBound: number;
    readonly stagingBytesBound: number;
  };
}

type Projection = SpatialSceneV1["cameras"][number]["projection"];

/**
 * Uniformly downscales one calibrated projection into the review raster budget.
 * Perspective intrinsics scale per axis with the raster so the frustum is
 * preserved exactly; orthographic world extents stay fixed and only raster
 * density changes.
 */
function reviewProjection(projection: Projection): { readonly projection: Projection; readonly width: number; readonly height: number } {
  const scale = Math.min(
    1,
    SPATIAL_REVIEW_LIMITS.dimension / projection.width,
    SPATIAL_REVIEW_LIMITS.dimension / projection.height,
  );
  const width = Math.max(1, Math.floor(projection.width * scale));
  const height = Math.max(1, Math.floor(projection.height * scale));
  if (width === projection.width && height === projection.height) {
    return { projection, width, height };
  }
  if (projection.kind === "perspective") {
    const sx = width / projection.width;
    const sy = height / projection.height;
    return {
      projection: {
        ...projection, width, height,
        fx: projection.fx * sx, cx: projection.cx * sx,
        fy: projection.fy * sy, cy: projection.cy * sy,
      },
      width, height,
    };
  }
  return { projection: { ...projection, width, height }, width, height };
}

/**
 * Pure planning: parses and bounds the scene, camera and sample list before any
 * capability, workspace, or provider is touched. Sample order is ascending and
 * unique; the report builder re-verifies every bound on its own input.
 */
export function planSpatialReview(sceneInput: unknown, requestInput: unknown): SpatialReviewPlan {
  const scene = parseSpatialScene(sceneInput);
  const request = parseSpatialValue(SpatialReviewRequestSchema, requestInput, "spatial review request");
  const camera = scene.cameras.find(item => item.cameraId === request.cameraId);
  checked(camera !== undefined, `Unknown camera ${request.cameraId}.`);
  const scaled = reviewProjection(camera.projection);
  const timesUs = [...(request.timesUs ?? spatialReviewDefaultTimesUs(scene.durationUs))].sort((a, b) => a - b);
  checked(new Set(timesUs).size === timesUs.length, "Review sample times must be unique.");
  checked(timesUs.every(timeUs => timeUs <= scene.durationUs), "A review sample is outside the scene clock.");
  checked(scene.entities.length * timesUs.length <= SPATIAL_REVIEW_LIMITS.entitySamples, "Scene review exceeds its entity-sample budget; pass fewer --times-us samples.");
  const sourceBytes = scene.assets.reduce((sum, asset) => sum + asset.payload.bytes, 0);
  checked(sourceBytes <= SPATIAL_RENDER_LIMITS.sourceBytes, "Scene asset closure exceeds its byte budget.");
  const renderPixels = scaled.width * scaled.height * timesUs.length;
  const perFrameBound = Math.min(
    scaled.width * scaled.height * 5 + scaled.height * 8 + 65_536,
    SPATIAL_REVIEW_LIMITS.pngBytes,
  );
  const pngBytesBound = perFrameBound * timesUs.length;
  const stagingBytesBound = sourceBytes + pngBytesBound + SPATIAL_RENDER_LIMITS.metadataBytes;
  const excludedEntityIds = scene.entities.filter(entity => entity.kind === "splat").map(entity => entity.entityId);
  const evaluationScene = scaled.projection === camera.projection
    ? scene
    : {
        ...scene,
        cameras: scene.cameras.map(item => item.cameraId === request.cameraId
          ? { ...item, projection: scaled.projection }
          : item),
      };
  return Object.freeze({
    scene, evaluationScene, sceneSha256: spatialSceneSha256(scene), request, timesUs,
    width: scaled.width, height: scaled.height,
    sourceWidth: camera.projection.width, sourceHeight: camera.projection.height,
    excludedEntityIds: Object.freeze([...excludedEntityIds]),
    costs: Object.freeze({ sourceBytes, renderPixels, pngBytesBound, stagingBytesBound }),
  });
}

/** The review's browser claim: html-browser, plus FFmpeg only when a declared video asset needs frame extraction. */
export function spatialReviewCapabilityNames(scene: SpatialSceneV1): readonly MediaCapabilityName[] {
  return Object.freeze(scene.assets.some(asset => asset.interpretation.kind === "video")
    ? ["ffmpeg", "ffprobe", "html-browser"] as const : ["html-browser"] as const);
}

export interface SpatialReviewHostInput {
  readonly scene: unknown;
  /** Adapter-owned contained root holding the scene's declared asset payloads. */
  readonly assetRoot: string;
  readonly request: unknown;
  /** Invocation-scoped consent grant; never part of serialized input. */
  readonly grant: SpatialReviewGrant;
  readonly capabilityBindings?: z.infer<typeof MediaCapabilityBindingsSchema>;
  readonly browserRuntime?: HtmlOverlayBrowserRuntimeBinding;
}
/** Trusted injection seam for deterministic host tests; never serialized. */
export interface SpatialReviewDependencies {
  readonly bindBrowserRuntime?: typeof bindHtmlOverlayBrowserRuntime;
  readonly nextAttemptId?: () => string;
  readonly provider?: SpatialReviewProvider;
}

function providerFailureCode(error: SpatialReviewProviderError): ApplicationError["code"] {
  switch (error.code) {
    case "aborted": return "cancelled";
    case "gateway-outcome-unknown": return "ambiguous";
    case "invalid-request": case "invalid-response": return "invalid-data";
    default: return "unavailable"; // credential-missing, gateway-unavailable, model-unavailable
  }
}

/**
 * Renders the selected beauty frames through the real browser pass in a private
 * workspace, hashes each exact PNG immediately before dispatch, makes exactly
 * one provider call, and assembles the strict advisory report. Splats are
 * excluded from the batch (the software pass cannot represent them) and named
 * in `render.excludedEntityIds`; nothing is published and no receipt is
 * written. The caller supplies the consent grant; provider credentials and
 * transport live entirely inside the injected provider seam.
 */
export async function reviewSpatialSceneHost(
  context: OperationExecutionContext,
  input: SpatialReviewHostInput,
  dependencies: SpatialReviewDependencies = {},
): Promise<SpatialReviewReport> {
  const plan = planSpatialReview(input.scene, input.request);
  const expectedCapabilities = input.capabilityBindings === undefined ? undefined : parseSpatialValue(MediaCapabilityBindingsSchema, input.capabilityBindings, "review capabilities");
  const expectedRuntime = input.browserRuntime === undefined ? undefined : HtmlOverlayBrowserRuntimeBindingSchema.parse(
    createBoundedJsonSnapshot(input.browserRuntime, SPATIAL_RENDER_LIMITS.metadataBytes, "Expected browser runtime").value,
  );
  const workspace = await createMediaOperationWorkspace(context);
  let directory: string | undefined;
  const assertCustody = async () => { await context.application.hostResourceLease?.assertOwned(); throwIfAborted(context.abortSignal); };
  const cleanupErrors: unknown[] = [];
  let failure: unknown, failed = false, stage = "preparation";
  let completed: SpatialReviewReport | undefined;
  try {
    await assertCustody();
    directory = await mkdtemp(join(workspace.path, "spatial-review-"));
    checked(await realpath(directory) === directory, "Scene review workspace must be physical.");
    const names = spatialReviewCapabilityNames(plan.scene);
    await assertMediaCapabilities(context, context.application, expectedCapabilities, names);
    const capabilities = await bindExpectedMediaCapabilities(context.application, names, expectedCapabilities);
    const runtime = await (dependencies.bindBrowserRuntime ?? bindHtmlOverlayBrowserRuntime)(exactCapabilityByName(capabilities, "html-browser"), context.abortSignal);
    if (expectedRuntime !== undefined) {
      checked(canonicalJson(runtime) === canonicalJson(expectedRuntime), "Browser runtime changed after review planning.");
    }
    const renderer = context.application.htmlOverlayRenderer;
    checked(renderer !== undefined, "The application does not provide the qualified spatial browser renderer.");
    const runner = new AbortBoundApplicationRunner(mediaCapabilityRunner(context.application, capabilities), context.abortSignal);
    const ports = { runner, ...(names.includes("ffmpeg") ? { ffmpegCommand: mediaCapabilityCommand(capabilities, "ffmpeg"), ffprobeCommand: mediaCapabilityCommand(capabilities, "ffprobe") } : {}) };
    const sourceManifests = spatialAssetClosureDigests(plan.scene.assets);
    const frames: SpatialReviewRequestFrame[] = [];
    let pngBytes = 0;
    for (let offset = 0; offset < plan.timesUs.length; offset += SPATIAL_RENDER_LIMITS.batchFrames) {
      await assertCustody();
      const windowTimes = plan.timesUs.slice(offset, offset + SPATIAL_RENDER_LIMITS.batchFrames);
      // The software beauty pass cannot lower splats; they are filtered before
      // lowering and named as excluded entities, never silently rendered.
      const windowSnapshots: EvaluatedSpatialScene[] = windowTimes.map(timeUs => {
        const snapshot = evaluateSpatialScene(plan.evaluationScene, { cameraId: plan.request.cameraId, timeUs });
        return { ...snapshot, entities: snapshot.entities.filter(entry => entry.entity.kind !== "splat") };
      });
      await withPreparedSpatialAssets({
        snapshots: windowSnapshots,
        exactSceneTimesUs: windowTimes.map(timeUs => ({ numerator: String(timeUs), denominator: "1" })),
        assetRoot: input.assetRoot, workspaceParent: directory,
      }, ports, context.abortSignal, async (prepared) => {
        checked(canonicalJson(prepared.receipt.sourceManifests) === canonicalJson(sourceManifests), "Asset preparation did not bind the complete source closure.");
        const partitions = partitionSpatialRenderWindow({
          snapshots: windowSnapshots, preparedAssets: prepared.preparedAssets,
          mode: { kind: "beauty" },
          frameRate: { numerator: 1, denominator: 1 },
        });
        for (const partition of partitions) {
          await assertCustody();
          const batch = partition.batch;
          const batchDirectory = join(directory!, `review-${offset + partition.offset}`);
          await mkdir(batchDirectory, { mode: 0o700 });
          const bundle = createHtmlOverlayExecutionBundle(batch.authoring, runtime, undefined);
          checked(canonicalJson(bundle.libraryLocks.map(lock => lock.specifier).sort()) === canonicalJson(["three"])
            && bundle.libraryLocks.find(lock => lock.specifier === "three")?.version === "0.185.1", "Review libraries differ from the exact qualified profile.");
          stage = "render";
          const rendered = await renderer.renderFrames({
            authoring: batch.authoring, browserRuntime: runtime, outputDirectory: batchDirectory,
            resources: prepared.resources,
          }, context.abortSignal);
          await assertCustody();
          const integrity = parseSpatialValue(HtmlOverlayExecutionIntegritySchema, rendered.executionIntegrity, "Renderer execution integrity");
          checked(canonicalJson(integrity) === canonicalJson(bundle.integrity) && canonicalJson(rendered.libraryLocks) === canonicalJson(bundle.libraryLocks), "Renderer returned execution or library integrity different from the bound input.");
          checked(assertHtmlOverlayGpuEvidenceProfile(undefined, rendered.gpuEvidence) === undefined, "Scene review must not claim hardware evidence on the software profile.");
          const samples = windowTimes.slice(partition.offset, partition.offset + partition.length);
          const expectedPattern = join(batchDirectory, "frames", "frame-%08d.png");
          checked(rendered.frameCount === samples.length && rendered.framePattern === expectedPattern, "Renderer frame count or output location differs from the planned review batch.");
          const entries = await readdir(join(batchDirectory, "frames"));
          checked(entries.length === samples.length, "Renderer produced an unexpected review frame directory entry.");
          for (const [index, timeUs] of samples.entries()) {
            const bytes = await readPhysical(join(batchDirectory, "frames", frameName(index)), SPATIAL_REVIEW_LIMITS.pngBytes, context.abortSignal);
            pngBytes += bytes.byteLength;
            checked(pngBytes <= SPATIAL_REVIEW_LIMITS.uploadBytes, "Review PNG bytes exceeded the upload bound.");
            await verifyPng(bytes, plan.width, plan.height);
            frames.push({
              index: offset + partition.offset + index, timeUs,
              width: plan.width, height: plan.height,
              bytes, sha256: sha256(bytes),
            });
          }
          await rm(batchDirectory, { recursive: true });
        }
      });
    }
    // The paid dispatch happens only after every rendered byte is verified and
    // hashed; provider credentials and transport stay inside the provider seam.
    stage = "critique";
    const provider = dependencies.provider ?? context.application.spatialReviewProvider;
    checked(provider !== undefined, "The application does not provide a bounded spatial review provider.");
    const attemptId = (dependencies.nextAttemptId ?? randomUUID)();
    let result;
    try {
      result = await provider.critique({
        attemptId,
        cloudUpload: { acknowledgedAt: input.grant.acknowledgedAt, policy: SPATIAL_REVIEW_UPLOAD_POLICY },
        prompt: { sha256: SPATIAL_REVIEW_PROMPT_SHA256, version: SPATIAL_REVIEW_PROMPT_VERSION },
        scene: {
          sceneId: plan.scene.sceneId,
          sceneSha256: plan.sceneSha256,
          cameraId: plan.request.cameraId,
          durationUs: plan.scene.durationUs,
          timesUs: plan.timesUs,
          entities: plan.scene.entities.slice(0, SPATIAL_REVIEW_LIMITS.promptEntities).map(entity => ({
            entityId: entity.entityId, kind: entity.kind, name: entity.name,
          })),
        },
        frames,
      }, context.abortSignal);
    } catch (error) {
      // A non-typed provider failure is unaccountable: the dispatch may or may
      // not have reached the wire, so it must surface as ambiguous and never
      // be retried. Provider internals are redacted at this seam.
      throw redactedSpatialReviewProviderError(error, true);
    }
    completed = buildSpatialReviewReport({
      acknowledgedAt: input.grant.acknowledgedAt,
      attemptId,
      provider: result,
      render: {
        excludedEntityIds: plan.excludedEntityIds,
        height: plan.height, width: plan.width,
        sourceHeight: plan.sourceHeight, sourceWidth: plan.sourceWidth,
      },
      scene: plan.scene,
      sceneSha256: plan.sceneSha256,
      frames: frames.map(frame => ({
        index: frame.index, timeUs: frame.timeUs, width: frame.width, height: frame.height,
        pngSha256: frame.sha256, pngBytes: frame.bytes.byteLength,
      })),
      request: { cameraId: plan.request.cameraId, timesUs: plan.timesUs },
    });
  } catch (error) { failure = error; failed = true; }
  finally {
    if (directory !== undefined) try { await rm(directory, { recursive: true, force: true }); } catch (error) { cleanupErrors.push(error); }
    try { await workspace.dispose(); } catch (error) { cleanupErrors.push(error); }
  }
  if (failed || cleanupErrors.length > 0) {
    const cause = failed ? failure : cleanupErrors[0];
    const error = new ApplicationError(
      cause instanceof SpatialReviewProviderError ? providerFailureCode(cause)
        : cause instanceof ApplicationError ? cause.code : "internal",
      cause instanceof Error ? cause.message : "Scene review failed.", {
        spatialReview: { stage: failed ? stage : "cleanup" },
        cleanupErrors: cleanupErrors.map(item => item instanceof Error ? item.message : String(item)),
      });
    error.cause = cause;
    throw error;
  }
  checked(completed !== undefined, "Scene review did not produce a report.");
  return completed;
}
