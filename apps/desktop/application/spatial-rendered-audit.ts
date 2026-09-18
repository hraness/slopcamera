import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, realpath, rm } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { createBoundedJsonSnapshot } from "../../../src/code/json-snapshot";
import {
  SpatialCameraIdSchema, SpatialTimeUsSchema, type EvaluatedSpatialScene, type SpatialSceneV1,
} from "../../../src/spatial-scene/contracts";
import {
  auditSpatialSceneRendered, decodeObjectIdPixels, SPATIAL_RENDERED_AUDIT_COVERAGE,
  SPATIAL_RENDERED_AUDIT_LIMITS, type SpatialRenderedAuditFrame, type SpatialRenderedAuditReport,
} from "../../../src/spatial-scene/audit-rendered";
import { spatialAuditDefaultTimesUs } from "../../../src/spatial-scene/audit";
import { evaluateSpatialScene } from "../../../src/spatial-scene/evaluate";
import { parseSpatialScene, parseSpatialValue, spatialAssetClosureDigests, spatialSceneSha256 } from "../../../src/spatial-scene/identity";
import { transformPoint, type Bounds, type Vec3 } from "../../../src/spatial-scene/math";
import { canonicalJson } from "../core/canonical-json";
import { assertHtmlOverlayGpuEvidenceProfile } from "../html-overlay/execution-profile";
import type { PreparedSpatialAsset } from "../html-overlay/spatial";
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

export const SpatialRenderedAuditRequestSchema = z.strictObject({
  cameraId: SpatialCameraIdSchema,
  /** Exact integer-microsecond samples; omitted means the shared default cadence. */
  timesUs: z.array(SpatialTimeUsSchema).min(1).max(SPATIAL_RENDERED_AUDIT_LIMITS.samples).optional(),
});
export type SpatialRenderedAuditRequest = z.infer<typeof SpatialRenderedAuditRequestSchema>;

export interface SpatialRenderedAuditPlan {
  readonly scene: SpatialSceneV1;
  readonly sceneSha256: string;
  readonly request: SpatialRenderedAuditRequest;
  readonly timesUs: readonly number[];
  readonly width: number;
  readonly height: number;
  readonly costs: {
    readonly sourceBytes: number;
    readonly renderPixels: number;
    readonly pngBytesBound: number;
    readonly stagingBytesBound: number;
  };
}

/**
 * Pure planning: parses and bounds the scene, camera and sample list before any
 * capability or workspace is touched. Sample order is ascending and unique; the
 * analyzer re-verifies every bound on its own input.
 */
export function planSpatialRenderedAudit(sceneInput: unknown, requestInput: unknown): SpatialRenderedAuditPlan {
  const scene = parseSpatialScene(sceneInput);
  const request = parseSpatialValue(SpatialRenderedAuditRequestSchema, requestInput, "spatial rendered audit request");
  const camera = scene.cameras.find(item => item.cameraId === request.cameraId);
  checked(camera !== undefined, `Unknown camera ${request.cameraId}.`);
  const { width, height } = camera.projection;
  checked(width <= SPATIAL_RENDERED_AUDIT_LIMITS.frameDimension && height <= SPATIAL_RENDERED_AUDIT_LIMITS.frameDimension
    && width * height <= SPATIAL_RENDERED_AUDIT_LIMITS.framePixels, "Rendered audit dimensions exceed the qualified raster budget.");
  const timesUs = [...new Set(request.timesUs ?? spatialAuditDefaultTimesUs(scene.durationUs))].sort((a, b) => a - b);
  checked(timesUs.every(timeUs => timeUs <= scene.durationUs), "A rendered audit sample is outside the scene clock.");
  checked(scene.entities.length * timesUs.length <= SPATIAL_RENDERED_AUDIT_LIMITS.entitySamples, "Rendered audit exceeds its entity-sample budget; pass fewer --times-us samples.");
  const sourceBytes = scene.assets.reduce((sum, asset) => sum + asset.payload.bytes, 0);
  checked(sourceBytes <= SPATIAL_RENDER_LIMITS.sourceBytes, "Scene asset closure exceeds its byte budget.");
  const renderPixels = width * height * timesUs.length;
  const pngBytesBound = (width * height * 5 + height * 8 + 65_536) * timesUs.length;
  const stagingBytesBound = sourceBytes + pngBytesBound + SPATIAL_RENDER_LIMITS.metadataBytes;
  checked(renderPixels <= SPATIAL_RENDER_LIMITS.totalPixels && pngBytesBound <= SPATIAL_RENDER_LIMITS.pngBytes, "Rendered audit staging exceeds its pixel or byte budget.");
  return Object.freeze({
    scene, sceneSha256: spatialSceneSha256(scene), request, timesUs, width, height,
    costs: Object.freeze({ sourceBytes, renderPixels, pngBytesBound, stagingBytesBound }),
  });
}

/** The audit's browser claim: html-browser, plus FFmpeg only when a declared video asset needs frame extraction. */
export function spatialRenderedAuditCapabilityNames(scene: SpatialSceneV1): readonly MediaCapabilityName[] {
  return Object.freeze(scene.assets.some(asset => asset.interpretation.kind === "video")
    ? ["ffmpeg", "ffprobe", "html-browser"] as const : ["html-browser"] as const);
}

export interface SpatialRenderedAuditHostInput {
  readonly scene: unknown;
  /** Adapter-owned contained root holding the scene's declared asset payloads. */
  readonly assetRoot: string;
  readonly request: unknown;
  readonly capabilityBindings?: z.infer<typeof MediaCapabilityBindingsSchema>;
  readonly browserRuntime?: HtmlOverlayBrowserRuntimeBinding;
}
/** Trusted injection seam for deterministic host tests; never serialized. */
export interface SpatialRenderedAuditDependencies {
  readonly bindBrowserRuntime?: typeof bindHtmlOverlayBrowserRuntime;
}

/**
 * Per-vertex bounds over the exact prepared primitives actually lowered,
 * unioned per declared asset. Splat entries contribute their decoded
 * SPZ-position enclosure — the same bounds the object-ID proxy lowers.
 */
function preparedAssetBounds(assets: readonly PreparedSpatialAsset[]): Record<string, Bounds> {
  const union = new Map<string, { min: [number, number, number]; max: [number, number, number] }>();
  for (const asset of assets) {
    if (asset.kind !== "geometry" && asset.kind !== "splat") continue;
    const entry = union.get(asset.assetId) ?? { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    if (asset.kind === "splat") {
      for (let axis = 0; axis < 3; axis++) {
        entry.min[axis] = Math.min(entry.min[axis]!, asset.bounds.min[axis]!);
        entry.max[axis] = Math.max(entry.max[axis]!, asset.bounds.max[axis]!);
      }
      union.set(asset.assetId, entry);
      continue;
    }
    for (const primitive of asset.primitives) {
      const count = primitive.indices?.length ?? primitive.positions.length / 3;
      for (let index = 0; index < count; index++) {
        const offset = (primitive.indices?.[index] ?? index) * 3;
        const point = transformPoint(primitive.matrix, [primitive.positions[offset]!, primitive.positions[offset + 1]!, primitive.positions[offset + 2]!]);
        for (let axis = 0; axis < 3; axis++) {
          entry.min[axis] = Math.min(entry.min[axis]!, point[axis]!);
          entry.max[axis] = Math.max(entry.max[axis]!, point[axis]!);
        }
      }
    }
    union.set(asset.assetId, entry);
  }
  return Object.fromEntries([...union].map(([assetId, bounds]) => [assetId, {
    min: Object.freeze([...bounds.min]) as unknown as Vec3,
    max: Object.freeze([...bounds.max]) as unknown as Vec3,
  }])) as Record<string, Bounds>;
}

/**
 * Renders each sampled time through the real object-ID pass, decodes the exact
 * PNG rasters, and runs the portable analyzer. Splats lower as their
 * bounding-box proxies and report `proxy-coverage` — approximate attribution,
 * never splat pixel truth; nothing is published and no receipt is written.
 */
export async function auditSpatialSceneRenderedHost(
  context: OperationExecutionContext,
  input: SpatialRenderedAuditHostInput,
  dependencies: SpatialRenderedAuditDependencies = {},
): Promise<SpatialRenderedAuditReport> {
  const plan = planSpatialRenderedAudit(input.scene, input.request);
  const expectedCapabilities = input.capabilityBindings === undefined ? undefined : parseSpatialValue(MediaCapabilityBindingsSchema, input.capabilityBindings, "rendered audit capabilities");
  const expectedRuntime = input.browserRuntime === undefined ? undefined : HtmlOverlayBrowserRuntimeBindingSchema.parse(
    createBoundedJsonSnapshot(input.browserRuntime, SPATIAL_RENDER_LIMITS.metadataBytes, "Expected browser runtime").value,
  );
  const workspace = await createMediaOperationWorkspace(context);
  let directory: string | undefined;
  const assertCustody = async () => { await context.application.hostResourceLease?.assertOwned(); throwIfAborted(context.abortSignal); };
  const cleanupErrors: unknown[] = [];
  let failure: unknown, failed = false, stage = "preparation";
  let completed: SpatialRenderedAuditReport | undefined;
  try {
    await assertCustody();
    directory = await mkdtemp(join(workspace.path, "spatial-rendered-audit-"));
    checked(await realpath(directory) === directory, "Rendered audit workspace must be physical.");
    const names = spatialRenderedAuditCapabilityNames(plan.scene);
    await assertMediaCapabilities(context, context.application, expectedCapabilities, names);
    const capabilities = await bindExpectedMediaCapabilities(context.application, names, expectedCapabilities);
    const runtime = await (dependencies.bindBrowserRuntime ?? bindHtmlOverlayBrowserRuntime)(exactCapabilityByName(capabilities, "html-browser"), context.abortSignal);
    if (expectedRuntime !== undefined) {
      checked(canonicalJson(runtime) === canonicalJson(expectedRuntime), "Browser runtime changed after rendered audit planning.");
    }
    const renderer = context.application.htmlOverlayRenderer;
    checked(renderer !== undefined, "The application does not provide the qualified spatial browser renderer.");
    const runner = new AbortBoundApplicationRunner(mediaCapabilityRunner(context.application, capabilities), context.abortSignal);
    const ports = { runner, ...(names.includes("ffmpeg") ? { ffmpegCommand: mediaCapabilityCommand(capabilities, "ffmpeg"), ffprobeCommand: mediaCapabilityCommand(capabilities, "ffprobe") } : {}) };
    const sourceManifests = spatialAssetClosureDigests(plan.scene.assets);
    const frames: SpatialRenderedAuditFrame[] = [];
    const assetBounds: Record<string, Bounds> = {};
    let pngBytes = 0;
    for (let offset = 0; offset < plan.timesUs.length; offset += SPATIAL_RENDER_LIMITS.batchFrames) {
      await assertCustody();
      const windowTimes = plan.timesUs.slice(offset, offset + SPATIAL_RENDER_LIMITS.batchFrames);
      const windowSnapshots: EvaluatedSpatialScene[] = windowTimes.map(timeUs =>
        evaluateSpatialScene(plan.scene, { cameraId: plan.request.cameraId, timeUs }));
      await withPreparedSpatialAssets({
        snapshots: windowSnapshots,
        exactSceneTimesUs: windowTimes.map(timeUs => ({ numerator: String(timeUs), denominator: "1" })),
        assetRoot: input.assetRoot, workspaceParent: directory,
      }, ports, context.abortSignal, async (prepared) => {
        checked(canonicalJson(prepared.receipt.sourceManifests) === canonicalJson(sourceManifests), "Asset preparation did not bind the complete source closure.");
        for (const [assetId, bounds] of Object.entries(preparedAssetBounds(prepared.preparedAssets))) {
          const existing = assetBounds[assetId];
          assetBounds[assetId] = existing === undefined ? bounds : {
            min: bounds.min.map((value, axis) => Math.min(value, existing.min[axis]!)) as unknown as Vec3,
            max: bounds.max.map((value, axis) => Math.max(value, existing.max[axis]!)) as unknown as Vec3,
          };
        }
        const preparedSplatIds = new Set(prepared.preparedAssets.filter(asset => asset.kind === "splat").map(asset => asset.entityId));
        const loweredSnapshots = windowSnapshots.map(snapshot => ({
          ...snapshot,
          entities: snapshot.entities.filter(entry => entry.entity.kind !== "splat" || preparedSplatIds.has(entry.entity.entityId)),
        }));
        const partitions = partitionSpatialRenderWindow({
          snapshots: loweredSnapshots, preparedAssets: prepared.preparedAssets,
          mode: { kind: "object-id", coverage: SPATIAL_RENDERED_AUDIT_COVERAGE },
          frameRate: { numerator: 1, denominator: 1 },
        });
        for (const partition of partitions) {
          await assertCustody();
          const batch = partition.batch;
          const batchDirectory = join(directory!, `audit-${offset + partition.offset}`);
          await mkdir(batchDirectory, { mode: 0o700 });
          const bundle = createHtmlOverlayExecutionBundle(batch.authoring, runtime, undefined);
          checked(canonicalJson(bundle.libraryLocks.map(lock => lock.specifier).sort()) === canonicalJson(["three"])
            && bundle.libraryLocks.find(lock => lock.specifier === "three")?.version === "0.185.1", "Rendered audit libraries differ from the exact qualified profile.");
          stage = "render";
          const rendered = await renderer.renderFrames({
            authoring: batch.authoring, browserRuntime: runtime, outputDirectory: batchDirectory,
            resources: prepared.resources,
          }, context.abortSignal);
          await assertCustody();
          const integrity = parseSpatialValue(HtmlOverlayExecutionIntegritySchema, rendered.executionIntegrity, "Renderer execution integrity");
          checked(canonicalJson(integrity) === canonicalJson(bundle.integrity) && canonicalJson(rendered.libraryLocks) === canonicalJson(bundle.libraryLocks), "Renderer returned execution or library integrity different from the bound input.");
          checked(assertHtmlOverlayGpuEvidenceProfile(undefined, rendered.gpuEvidence) === undefined, "Rendered audit must not claim hardware evidence on the software profile.");
          const samples = windowTimes.slice(partition.offset, partition.offset + partition.length);
          const expectedPattern = join(batchDirectory, "frames", "frame-%08d.png");
          checked(rendered.frameCount === samples.length && rendered.framePattern === expectedPattern, "Renderer frame count or output location differs from the planned audit batch.");
          const entries = await readdir(join(batchDirectory, "frames"));
          checked(entries.length === samples.length, "Renderer produced an unexpected audit frame directory entry.");
          for (const [index, timeUs] of samples.entries()) {
            const bytes = await readPhysical(join(batchDirectory, "frames", frameName(index)), plan.costs.pngBytesBound, context.abortSignal);
            pngBytes += bytes.length;
            checked(pngBytes <= plan.costs.pngBytesBound, "Rendered audit PNG bytes exceeded the admitted staging estimate.");
            const rgba = await verifyPng(bytes, plan.width, plan.height);
            const evidence = batch.metadata.frames[index];
            checked(evidence !== undefined && evidence.timeUs === timeUs, "Batch evidence does not align with the audited sample clock.");
            frames.push({
              timeUs, width: plan.width, height: plan.height, pngSha256: sha256(bytes),
              counts: decodeObjectIdPixels(rgba, plan.width, plan.height),
              objects: evidence.objects,
            });
          }
          await rm(batchDirectory, { recursive: true });
        }
      }, { tolerateSplatDecodeFailure: true });
    }
    completed = auditSpatialSceneRendered(plan.scene, frames, {
      cameraId: plan.request.cameraId, assetBounds,
      coverage: SPATIAL_RENDERED_AUDIT_COVERAGE,
    });
  } catch (error) { failure = error; failed = true; }
  finally {
    if (directory !== undefined) try { await rm(directory, { recursive: true, force: true }); } catch (error) { cleanupErrors.push(error); }
    try { await workspace.dispose(); } catch (error) { cleanupErrors.push(error); }
  }
  if (failed || cleanupErrors.length > 0) {
    const cause = failed ? failure : cleanupErrors[0];
    const error = new ApplicationError(cause instanceof ApplicationError ? cause.code : "internal",
      cause instanceof Error ? cause.message : "Rendered scene audit failed.", {
        spatialRenderedAudit: { stage: failed ? stage : "cleanup" },
        cleanupErrors: cleanupErrors.map(item => item instanceof Error ? item.message : String(item)),
      });
    error.cause = cause;
    throw error;
  }
  checked(completed !== undefined, "Rendered audit did not produce a report.");
  return completed;
}
