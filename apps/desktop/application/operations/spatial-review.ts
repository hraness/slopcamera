import { constants } from "node:fs";
import { mkdtemp, open, rm } from "node:fs/promises";
import { dirname, join, posix } from "node:path";

import { z } from "zod";

import { createBoundedJsonValueSnapshot } from "../../../../src/code/json-snapshot";
import { SPATIAL_SCENE_LIMITS, SpatialAssetIdSchema, SpatialDigestSchema } from "../../../../src/spatial-scene/contracts";
import { parseSpatialScene } from "../../../../src/spatial-scene/identity";
import { SPATIAL_REVIEW_LIMITS, SpatialReviewReportSchema } from "../../../../src/spatial-scene/review";
import { ensurePhysicalPrivateDirectoryWithin } from "../../cli/paths";
import { canonicalJson } from "../../core/canonical-json";
import { exactCapabilityByName } from "../capability-binding";
import type { ApplicationContext } from "../context";
import { ApplicationError } from "../errors";
import { bindHtmlOverlayBrowserRuntime, HtmlOverlayBrowserRuntimeBindingSchema } from "../html-overlay-browser-runtime";
import type { OperationDefinition, OperationExecutionContext } from "../operation";
import {
  planSpatialReview, reviewSpatialSceneHost, spatialReviewCapabilityNames,
  SpatialReviewRequestSchema, type SpatialReviewDependencies, type SpatialReviewGrant,
} from "../spatial-review";
import { MediaCapabilityBindingsSchema, bindExpectedMediaCapabilities } from "./media/capabilities";
import {
  MediaArtifactReferenceSchema, MediaArtifactRequestSchema, bindRepositoryMedia, loadRepositoryMedia,
  createMediaOperationWorkspace,
} from "./media/shared";

const MAXIMUM_ASSET_BYTES = 256 * 1024 * 1024;
const AssetBindingSchema = z.strictObject({ assetId: SpatialAssetIdSchema, artifact: MediaArtifactReferenceSchema });
const requestShape = z.strictObject({
  source: MediaArtifactRequestSchema,
  assets: z.array(AssetBindingSchema).max(SPATIAL_SCENE_LIMITS.assets).optional(),
  request: SpatialReviewRequestSchema,
  sceneSha256: SpatialDigestSchema.optional(),
  capabilityBindings: MediaCapabilityBindingsSchema.optional(),
  browserRuntime: HtmlOverlayBrowserRuntimeBindingSchema.optional(),
});
const captured = (input: unknown) => createBoundedJsonValueSnapshot(input, 16 * 1024 * 1024, "spatial review request", { maximumDepth: 48, maximumValues: 500_000 }).value;
export const SpatialReviewInputSchema = z.preprocess(captured, requestShape);
export const BoundSpatialReviewInputSchema = z.preprocess(captured, requestShape.extend({
  source: MediaArtifactReferenceSchema,
  assets: z.array(AssetBindingSchema).max(SPATIAL_SCENE_LIMITS.assets),
  sceneSha256: SpatialDigestSchema,
  capabilityBindings: MediaCapabilityBindingsSchema,
  browserRuntime: HtmlOverlayBrowserRuntimeBindingSchema,
}));
/** The output is the advisory report itself, matching scene.render-audit; nothing is published. */
export const SpatialReviewOutputSchema = SpatialReviewReportSchema;
export type SpatialReviewInput = z.infer<typeof SpatialReviewInputSchema>;
export type BoundSpatialReviewInput = z.infer<typeof BoundSpatialReviewInputSchema>;
export type SpatialReviewOutput = z.infer<typeof SpatialReviewOutputSchema>;

function sourceDocument(data: Uint8Array) {
  try { return parseSpatialScene(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data))); }
  catch (error) { throw new ApplicationError("invalid-data", `Invalid spatial source: ${error instanceof Error ? error.message : String(error)}`); }
}

/**
 * The source grants access only to its bounded, root-contained declared
 * closure. Consent is checked against the exact planned upload before any
 * capability probe, browser binding, render, or provider dispatch: without an
 * invocation-scoped grant this fails closed with `authorization-required`.
 * Capability and browser-runtime identity are bound at admission and
 * re-verified inside the host service, exactly like scene.render-audit.
 */
export async function bindSpatialReviewInput(
  application: ApplicationContext,
  input: unknown,
  signal = new AbortController().signal,
  bindRuntime: typeof bindHtmlOverlayBrowserRuntime = bindHtmlOverlayBrowserRuntime,
): Promise<Readonly<{ bound: BoundSpatialReviewInput; grant: SpatialReviewGrant }>> {
  const parsed = SpatialReviewInputSchema.parse(input);
  const source = await loadRepositoryMedia(application, parsed.source, signal, SPATIAL_SCENE_LIMITS.sourceBytes);
  const scene = sourceDocument(source.data);
  const plan = planSpatialReview(scene, parsed.request);
  const sceneSha256 = plan.sceneSha256;
  if (parsed.sceneSha256 !== undefined && parsed.sceneSha256 !== sceneSha256) throw new ApplicationError("conflict", "Scene source changed after planning.");
  const authorization = application.spatialReviewAuthorization;
  const grant = authorization === undefined ? undefined : await authorization.authorize({
    sceneSha256,
    cameraId: plan.request.cameraId,
    timesUs: plan.timesUs,
    maximumFrames: plan.timesUs.length,
    maximumFrameBytes: SPATIAL_REVIEW_LIMITS.pngBytes,
    maximumUploadBytes: SPATIAL_REVIEW_LIMITS.uploadBytes,
  });
  if (grant === undefined) {
    throw new ApplicationError("authorization-required", "Scene review uploads the selected bounded rendered beauty frames to a vision model and requires an explicit cloud-upload grant for this invocation.");
  }
  if (scene.assets.reduce((sum, asset) => sum + asset.payload.bytes, 0) > MAXIMUM_ASSET_BYTES) throw new ApplicationError("invalid-data", "Scene asset closure exceeds 256 MiB.");
  const supplied = parsed.assets === undefined ? undefined : new Map(parsed.assets.map(item => [item.assetId, item.artifact]));
  if (supplied !== undefined && (supplied.size !== parsed.assets!.length || supplied.size !== scene.assets.length || scene.assets.some(asset => !supplied.has(asset.assetId)))) throw new ApplicationError("invalid-data", "Asset bindings must name every declared asset exactly once.");
  const assets: z.infer<typeof AssetBindingSchema>[] = [];
  for (const asset of scene.assets) {
    const request = supplied?.get(asset.assetId) ?? {
      ...asset.payload, path: posix.join(posix.dirname(source.artifact.path), asset.payload.path),
    };
    if (request.sha256 !== asset.payload.sha256 || request.bytes !== asset.payload.bytes) throw new ApplicationError("conflict", `Asset ${asset.assetId} does not match its source manifest.`);
    const bound = await bindRepositoryMedia(application, request, signal, asset.payload.bytes);
    assets.push({ assetId: asset.assetId, artifact: bound.artifact });
  }
  const capabilityBindings = await bindExpectedMediaCapabilities(application, spatialReviewCapabilityNames(scene), parsed.capabilityBindings);
  const browserRuntime = await bindRuntime(exactCapabilityByName(capabilityBindings, "html-browser"), signal);
  if (parsed.browserRuntime !== undefined && canonicalJson(parsed.browserRuntime) !== canonicalJson(browserRuntime)) throw new ApplicationError("conflict", "Browser runtime changed after review planning.");
  return {
    bound: BoundSpatialReviewInputSchema.parse({ ...parsed, source: source.artifact, assets, sceneSha256, capabilityBindings, browserRuntime }),
    grant,
  };
}

async function writePrivateFile(path: string, bytes: Uint8Array): Promise<void> {
  const handle = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
}

/** Trusted test ports are never part of a serialized review request. */
export interface SpatialReviewOperationDependencies extends SpatialReviewDependencies {
  readonly createWorkspace?: typeof createMediaOperationWorkspace;
  readonly createDirectory?: typeof mkdtemp;
  readonly removeDirectory?: (path: string) => Promise<void>;
}

export async function executeSpatialReview(
  context: OperationExecutionContext,
  input: SpatialReviewInput,
  dependencies: SpatialReviewOperationDependencies = {},
): Promise<SpatialReviewOutput> {
  if (context.workflow !== undefined) BoundSpatialReviewInputSchema.parse(input);
  const { bound, grant } = await bindSpatialReviewInput(context.application, input, context.abortSignal, dependencies.bindBrowserRuntime);
  const source = await loadRepositoryMedia(context.application, bound.source, context.abortSignal, SPATIAL_SCENE_LIMITS.sourceBytes);
  const scene = sourceDocument(source.data);
  const workspace = await (dependencies.createWorkspace ?? createMediaOperationWorkspace)(context);
  let directory: string | undefined;
  const cleanupErrors: unknown[] = [];
  let completed: SpatialReviewOutput | undefined, failure: unknown, failed = false;
  try {
    directory = await (dependencies.createDirectory ?? mkdtemp)(join(workspace.path, "spatial-review-source-"));
    const assetRoot = await ensurePhysicalPrivateDirectoryWithin(directory, "assets");
    const writtenPaths = new Map<string, string>();
    for (const asset of scene.assets) {
      const artifact = bound.assets.find(item => item.assetId === asset.assetId)!.artifact;
      const loaded = await loadRepositoryMedia(context.application, artifact, context.abortSignal, asset.payload.bytes);
      const previous = writtenPaths.get(asset.payload.path);
      if (previous !== undefined) {
        if (previous !== artifact.sha256) throw new ApplicationError("conflict", "Two scene assets declare different bytes at one path.");
        continue;
      }
      const parent = dirname(asset.payload.path);
      if (parent !== ".") await ensurePhysicalPrivateDirectoryWithin(assetRoot, parent);
      await writePrivateFile(join(assetRoot, asset.payload.path), loaded.data);
      writtenPaths.set(asset.payload.path, artifact.sha256);
    }
    const report = await reviewSpatialSceneHost(context, {
      scene, assetRoot, request: bound.request, grant,
      capabilityBindings: bound.capabilityBindings, browserRuntime: bound.browserRuntime,
    }, dependencies);
    completed = SpatialReviewOutputSchema.parse(report);
  } catch (error) { failure = error; failed = true; }
  finally {
    if (directory !== undefined) try { await (dependencies.removeDirectory ?? (async path => { await rm(path, { recursive: true, force: true }); }))(directory); } catch (error) { cleanupErrors.push(error); }
    try { await workspace.dispose(); } catch (error) { cleanupErrors.push(error); }
  }
  if (failed || cleanupErrors.length > 0) {
    const cause = cleanupErrors.length === 0 ? failure : new AggregateError([...(failed ? [failure] : []), ...cleanupErrors], "Scene review failed during execution or cleanup.");
    const error = new ApplicationError(failure instanceof ApplicationError ? failure.code : "internal",
      cause instanceof Error ? cause.message : "Scene review failed.",
      { cleanupErrors: cleanupErrors.map(error => error instanceof Error ? error.message : String(error)) });
    error.cause = cause;
    throw error;
  }
  if (completed === undefined) throw new ApplicationError("internal", "Scene review completed without a report.");
  return completed;
}

export const spatialReviewOperationDefinition = {
  kind: "scene.review", version: 1,
  inputSchema: SpatialReviewInputSchema, inputSchemaId: "slopcamera.operation.scene.review.input/v1",
  outputSchema: SpatialReviewOutputSchema, outputSchemaId: "slopcamera.operation.scene.review.output/v1",
  lifecycle: { kind: "paid-dispatch", execute: executeSpatialReview },
  policy: {
    cache: "exact-run", cancellable: true, effect: "paid-cloud", maxDurationMs: 600_000,
    maxFanOut: 0, maxInputBytes: 16 * 1024 * 1024, maxOutputBytes: 4 * 1024 * 1024,
    preparation: ["local-media"], resources: [
      { amount: 1, resource: "cpu" }, { amount: 1, resource: "local-io" }, { amount: 1, resource: "browser" },
      { amount: 1, resource: "ffmpeg" }, { amount: 1, resource: "network" }, { amount: 1, resource: "paid-call" },
    ], resume: "ambiguous-after-dispatch",
  },
  summarize: output => ({ kind: "scene.review", fields: {
    sceneSha256: output.sceneSha256, cameraId: output.cameraId, frames: output.frames.length,
    findings: output.findings.scene.length + output.findings.frames.reduce((sum, frame) => sum + frame.findings.length, 0),
    model: output.model.requestedModel,
    ...(output.model.resolvedModel === null ? {} : { resolvedModel: output.model.resolvedModel }),
  } }),
} satisfies OperationDefinition<"scene.review", SpatialReviewInput, SpatialReviewOutput>;
