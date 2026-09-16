import { constants } from "node:fs";
import { mkdtemp, open, rm } from "node:fs/promises";
import { dirname, join, posix } from "node:path";

import { z } from "zod";

import { createBoundedJsonValueSnapshot } from "../../../../src/code/json-snapshot";
import { SPATIAL_SCENE_LIMITS, SpatialAssetIdSchema, SpatialDigestSchema } from "../../../../src/spatial-scene/contracts";
import { parseSpatialScene, spatialSceneSha256 } from "../../../../src/spatial-scene/identity";
import { SpatialRenderedAuditReportSchema } from "../../../../src/spatial-scene/audit-rendered";
import { ensurePhysicalPrivateDirectoryWithin } from "../../cli/paths";
import { canonicalJson } from "../../core/canonical-json";
import { exactCapabilityByName } from "../capability-binding";
import type { ApplicationContext } from "../context";
import { ApplicationError } from "../errors";
import { bindHtmlOverlayBrowserRuntime, HtmlOverlayBrowserRuntimeBindingSchema } from "../html-overlay-browser-runtime";
import type { OperationDefinition, OperationExecutionContext } from "../operation";
import {
  auditSpatialSceneRenderedHost, planSpatialRenderedAudit, spatialRenderedAuditCapabilityNames,
  SpatialRenderedAuditRequestSchema, type SpatialRenderedAuditDependencies,
} from "../spatial-rendered-audit";
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
  request: SpatialRenderedAuditRequestSchema,
  sceneSha256: SpatialDigestSchema.optional(),
  capabilityBindings: MediaCapabilityBindingsSchema.optional(),
  browserRuntime: HtmlOverlayBrowserRuntimeBindingSchema.optional(),
});
const captured = (input: unknown) => createBoundedJsonValueSnapshot(input, 16 * 1024 * 1024, "spatial rendered audit request", { maximumDepth: 48, maximumValues: 500_000 }).value;
export const SpatialRenderedAuditInputSchema = z.preprocess(captured, requestShape);
export const BoundSpatialRenderedAuditInputSchema = z.preprocess(captured, requestShape.extend({
  source: MediaArtifactReferenceSchema,
  assets: z.array(AssetBindingSchema).max(SPATIAL_SCENE_LIMITS.assets),
  sceneSha256: SpatialDigestSchema,
  capabilityBindings: MediaCapabilityBindingsSchema,
  browserRuntime: HtmlOverlayBrowserRuntimeBindingSchema,
}));
/** The output is the report itself, matching scene.audit; nothing is published. */
export const SpatialRenderedAuditOutputSchema = SpatialRenderedAuditReportSchema;
export type SpatialRenderedAuditInput = z.infer<typeof SpatialRenderedAuditInputSchema>;
export type BoundSpatialRenderedAuditInput = z.infer<typeof BoundSpatialRenderedAuditInputSchema>;
export type SpatialRenderedAuditOutput = z.infer<typeof SpatialRenderedAuditOutputSchema>;

function sourceDocument(data: Uint8Array) {
  try { return parseSpatialScene(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data))); }
  catch (error) { throw new ApplicationError("invalid-data", `Invalid spatial source: ${error instanceof Error ? error.message : String(error)}`); }
}

/**
 * The source grants access only to its bounded, root-contained declared
 * closure. Capability and browser-runtime identity are bound at admission and
 * re-verified inside the host service, exactly like scene.render.
 */
export async function bindSpatialRenderedAuditInput(
  application: ApplicationContext,
  input: unknown,
  signal = new AbortController().signal,
  bindRuntime: typeof bindHtmlOverlayBrowserRuntime = bindHtmlOverlayBrowserRuntime,
): Promise<BoundSpatialRenderedAuditInput> {
  const parsed = SpatialRenderedAuditInputSchema.parse(input);
  const source = await loadRepositoryMedia(application, parsed.source, signal, SPATIAL_SCENE_LIMITS.sourceBytes);
  const scene = sourceDocument(source.data);
  planSpatialRenderedAudit(scene, parsed.request);
  const sceneSha256 = spatialSceneSha256(scene);
  if (parsed.sceneSha256 !== undefined && parsed.sceneSha256 !== sceneSha256) throw new ApplicationError("conflict", "Scene source changed after planning.");
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
  const capabilityBindings = await bindExpectedMediaCapabilities(application, spatialRenderedAuditCapabilityNames(scene), parsed.capabilityBindings);
  const browserRuntime = await bindRuntime(exactCapabilityByName(capabilityBindings, "html-browser"), signal);
  if (parsed.browserRuntime !== undefined && canonicalJson(parsed.browserRuntime) !== canonicalJson(browserRuntime)) throw new ApplicationError("conflict", "Browser runtime changed after rendered audit planning.");
  return BoundSpatialRenderedAuditInputSchema.parse({ ...parsed, source: source.artifact, assets, sceneSha256, capabilityBindings, browserRuntime });
}

async function writePrivateFile(path: string, bytes: Uint8Array): Promise<void> {
  const handle = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
}

/** Trusted test ports are never part of a serialized audit request. */
export interface SpatialRenderedAuditOperationDependencies extends SpatialRenderedAuditDependencies {
  readonly createWorkspace?: typeof createMediaOperationWorkspace;
  readonly createDirectory?: typeof mkdtemp;
  readonly removeDirectory?: (path: string) => Promise<void>;
}

export async function executeSpatialRenderedAudit(
  context: OperationExecutionContext,
  input: SpatialRenderedAuditInput,
  dependencies: SpatialRenderedAuditOperationDependencies = {},
): Promise<SpatialRenderedAuditOutput> {
  if (context.workflow !== undefined) BoundSpatialRenderedAuditInputSchema.parse(input);
  const bound = await bindSpatialRenderedAuditInput(context.application, input, context.abortSignal, dependencies.bindBrowserRuntime);
  const source = await loadRepositoryMedia(context.application, bound.source, context.abortSignal, SPATIAL_SCENE_LIMITS.sourceBytes);
  const scene = sourceDocument(source.data);
  const workspace = await (dependencies.createWorkspace ?? createMediaOperationWorkspace)(context);
  let directory: string | undefined;
  const cleanupErrors: unknown[] = [];
  let completed: SpatialRenderedAuditOutput | undefined, failure: unknown, failed = false;
  try {
    directory = await (dependencies.createDirectory ?? mkdtemp)(join(workspace.path, "spatial-audit-source-"));
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
    const report = await auditSpatialSceneRenderedHost(context, {
      scene, assetRoot, request: bound.request,
      capabilityBindings: bound.capabilityBindings, browserRuntime: bound.browserRuntime,
    }, dependencies);
    completed = SpatialRenderedAuditOutputSchema.parse(report);
  } catch (error) { failure = error; failed = true; }
  finally {
    if (directory !== undefined) try { await (dependencies.removeDirectory ?? (async path => { await rm(path, { recursive: true, force: true }); }))(directory); } catch (error) { cleanupErrors.push(error); }
    try { await workspace.dispose(); } catch (error) { cleanupErrors.push(error); }
  }
  if (failed || cleanupErrors.length > 0) {
    const cause = cleanupErrors.length === 0 ? failure : new AggregateError([...(failed ? [failure] : []), ...cleanupErrors], "Rendered scene audit failed during execution or cleanup.");
    const error = new ApplicationError(failure instanceof ApplicationError ? failure.code : "internal",
      cause instanceof Error ? cause.message : "Rendered scene audit failed.",
      { cleanupErrors: cleanupErrors.map(error => error instanceof Error ? error.message : String(error)) });
    error.cause = cause;
    throw error;
  }
  if (completed === undefined) throw new ApplicationError("internal", "Rendered scene audit completed without a report.");
  return completed;
}

export const spatialRenderedAuditOperationDefinition = {
  kind: "scene.render-audit", version: 1,
  inputSchema: SpatialRenderedAuditInputSchema, inputSchemaId: "slopcamera.operation.scene.render-audit.input/v1",
  outputSchema: SpatialRenderedAuditOutputSchema, outputSchemaId: "slopcamera.operation.scene.render-audit.output/v1",
  lifecycle: { kind: "local-artifact", execute: executeSpatialRenderedAudit },
  policy: {
    cache: "none", cancellable: true, effect: "local-derived-write", maxDurationMs: 300_000,
    maxFanOut: 0, maxInputBytes: 16 * 1024 * 1024, maxOutputBytes: 34 * 1024 * 1024,
    preparation: ["local-media"], resources: [
      { amount: 1, resource: "cpu" }, { amount: 1, resource: "local-io" }, { amount: 1, resource: "browser" },
      { amount: 1, resource: "ffmpeg" },
    ], resume: "deterministic",
  },
  summarize: output => ({ kind: "scene.render-audit", fields: {
    sceneSha256: output.sceneSha256, cameraId: output.cameraId, samples: output.timesUs.length,
    entities: output.summary.entities.total, neverRendered: output.summary.entitiesNeverRendered.length, findings: output.findings.length,
  } }),
} satisfies OperationDefinition<"scene.render-audit", SpatialRenderedAuditInput, SpatialRenderedAuditOutput>;
