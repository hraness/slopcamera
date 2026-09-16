import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdtemp, open, realpath, rm, writeFile } from "node:fs/promises";
import { basename, extname, isAbsolute, join, relative } from "node:path";

import { z } from "zod";
import { canonicalJson } from "../core/canonical-json";
import { createNodeSpatialDurability } from "../core/spatial-durability";
import { createNodeBundleFileSystem } from "../core/storage";
import { SpatialAssetFactsV1Schema, type SpatialAssetFactsV1, type SpatialPublishedArtifact } from "../contracts/spatial-asset";
import {
  SpatialAssetIdSchema, SpatialAssetManifestSchema, SpatialEntitySchema,
  type SpatialAssetManifest, type SpatialEntity, type SpatialPatchOperation,
} from "../../../src/spatial-scene/contracts";
import { evaluateSpatialGlb, parseSpatialGlb, spatialGlbBounds, SPATIAL_GLB_LIMITS } from "../../../src/spatial-scene/gltf";
import { spatialAssetManifestSha256 } from "../../../src/spatial-scene/identity";
import type { Bounds } from "../../../src/spatial-scene/math";

/** Bounded data half of one admission request; effect handles stay host-side. */
const requestSchema = z.strictObject({
  filePath: z.string().min(1).max(4_096),
  assetRoot: z.string().min(1).max(4_096),
  assetId: SpatialAssetIdSchema.optional(),
  metersPerUnit: z.number().finite().min(0.000001).max(1_000_000),
  sourceUp: z.enum(["x", "y", "z"]),
});
export interface SpatialAssetAdmissionRequest {
  readonly filePath: string;
  readonly assetRoot: string;
  readonly assetId?: string;
  readonly metersPerUnit: number;
  readonly sourceUp: "x" | "y" | "z";
  readonly signal: AbortSignal;
  readonly beforePublication?: () => Promise<void>;
}
export interface SpatialAssetAdmissionResult {
  readonly manifest: SpatialAssetManifest;
  readonly factsManifest: SpatialAssetManifest;
  readonly facts: SpatialAssetFactsV1;
  readonly bounds: { readonly modelSpace: Bounds; readonly sceneSpace: Bounds };
  readonly entity: SpatialEntity;
  readonly artifacts: { readonly payload: SpatialPublishedArtifact; readonly facts: SpatialPublishedArtifact };
  readonly operations: readonly SpatialPatchOperation[];
}

/** Retained evidence survives cancellation and publication/cleanup uncertainty. */
export class SpatialAssetAdmissionError extends Error {
  readonly published: readonly SpatialPublishedArtifact[];
  readonly attempted: readonly SpatialPublishedArtifact[];
  constructor(cause: unknown, published: readonly SpatialPublishedArtifact[], attempted: readonly SpatialPublishedArtifact[] = published) {
    super("Scene asset admission did not complete; retain its exact source and publication evidence.", { cause });
    this.name = "SpatialAssetAdmissionError";
    this.published = Object.freeze([...published]);
    this.attempted = Object.freeze([...attempted]);
  }
}

async function physicalRoot(path: string): Promise<string> {
  if (!isAbsolute(path) || await realpath(path) !== path || !(await lstat(path)).isDirectory()) {
    throw new RangeError("Scene asset roots must be absolute physical directories without symlinks.");
  }
  return path;
}

/**
 * Capture one explicit local file exactly once: a bounded physical regular
 * file with no symlink components, a stable inode identity across the read,
 * and a sha256 over precisely the captured bytes.
 */
async function readAdmittedAssetFile(path: string, signal: AbortSignal): Promise<{ readonly bytes: Uint8Array; readonly sha256: string }> {
  signal.throwIfAborted();
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size < 1 || before.size > SPATIAL_GLB_LIMITS.bytes || await realpath(path) !== path) {
      throw new RangeError("Admitted asset must be a bounded physical regular file without symlink components.");
    }
    const bytes = new Uint8Array(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      signal.throwIfAborted();
      const read = await handle.read(bytes, offset, Math.min(1024 * 1024, bytes.length - offset), offset);
      if (read.bytesRead === 0) throw new RangeError("Admitted asset was truncated while it was being read.");
      offset += read.bytesRead;
    }
    const after = await handle.stat(), leaf = await lstat(path);
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || before.mode !== after.mode
      || leaf.isSymbolicLink() || leaf.dev !== after.dev || leaf.ino !== after.ino || await realpath(path) !== path) {
      throw new RangeError("Admitted asset changed while it was captured.");
    }
    signal.throwIfAborted();
    return { bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
  } finally { await handle.close(); }
}

function isGlbPayload(path: string, bytes: Uint8Array): boolean {
  return extname(path).toLowerCase() === ".glb"
    || (bytes.length >= 4 && bytes[0] === 0x67 && bytes[1] === 0x6c && bytes[2] === 0x54 && bytes[3] === 0x46);
}

function entityName(path: string): string {
  const name = basename(path).replace(/\.[^.]*$/u, "").trim();
  return name === "" ? "Admitted model" : name.slice(0, 256);
}

/**
 * Admit one local GLB file as a scene asset. Exact source bytes are copied
 * into the caller's content-addressed asset root, model- and scene-space
 * bounds are derived from decoded vertex data, and the result is a subject
 * `gltf` manifest, a sibling `metadata` facts manifest, a mesh entity, and a
 * ready-to-apply patch fragment. Publication is atomic and no-replace:
 * identical content-addressed bytes settle as "exists" so an interrupted
 * admit retries deterministically, while different bytes conflict.
 */
export async function admitSpatialAssetFile(options: SpatialAssetAdmissionRequest): Promise<SpatialAssetAdmissionResult> {
  const parsed = requestSchema.safeParse({
    filePath: options.filePath, assetRoot: options.assetRoot, assetId: options.assetId,
    metersPerUnit: options.metersPerUnit, sourceUp: options.sourceUp,
  });
  if (!parsed.success) throw new RangeError("Scene asset admission request is invalid.");
  const request = parsed.data;
  options.signal.throwIfAborted();
  if (!isAbsolute(request.filePath)) throw new RangeError("Admitted asset paths must resolve to absolute local files.");
  const root = await physicalRoot(request.assetRoot);
  const { bytes, sha256 } = await readAdmittedAssetFile(request.filePath, options.signal);
  if (!isGlbPayload(request.filePath, bytes)) {
    throw new RangeError(`scene asset admit currently admits GLB 2.0 payloads: ${basename(request.filePath)} is not a .glb file and lacks the glTF magic.`);
  }
  const model = parseSpatialGlb(bytes);
  const modelSpace = spatialGlbBounds(model);
  const sceneSpace = evaluateSpatialGlb(model, { metersPerUnit: request.metersPerUnit, sourceUp: request.sourceUp, timeUs: 0 }).bounds;
  const assetId = request.assetId ?? `asset_admitted_${sha256}`;
  const entityId = `entity_admitted_${sha256}`;
  const payload = { path: `assets/${sha256}.glb`, sha256, bytes: bytes.byteLength };
  const manifest = SpatialAssetManifestSchema.parse({
    assetId, payload,
    interpretation: { kind: "gltf", format: "glb", metersPerUnit: request.metersPerUnit, sourceUp: request.sourceUp },
    dependencies: [],
    provenance: { source: "imported", description: `Admitted local GLB payload ${basename(request.filePath)}.` },
  });
  const facts = SpatialAssetFactsV1Schema.parse({
    kind: "slopcamera.spatial-asset-facts", schemaVersion: 1,
    subject: payload, subjectManifestSha256: spatialAssetManifestSha256(manifest),
    profile: model.profile, nodeCount: model.nodeCount, clipDurationsSeconds: [...model.clipDurationsSeconds],
    bounds: { modelSpace, sceneSpace },
  });
  const factsText = `${canonicalJson(facts)}\n`, factsSha256 = createHash("sha256").update(factsText).digest("hex");
  const factsPayload = { path: `assets/${factsSha256}.json`, sha256: factsSha256, bytes: Buffer.byteLength(factsText) };
  const factsManifest = SpatialAssetManifestSchema.parse({
    assetId: `asset_facts_${factsSha256}`, payload: factsPayload,
    interpretation: { kind: "metadata", format: "json", schema: "slopcamera.spatial-asset-facts" },
    dependencies: [assetId],
    provenance: { source: "derived", description: `Derived bounds and profile facts for ${assetId}.` },
  });
  if (factsManifest.assetId === assetId) throw new RangeError("Requested asset identity conflicts with the derived facts asset.");
  const entity = SpatialEntitySchema.parse({
    entityId, kind: "mesh", name: entityName(request.filePath), parentId: null,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    placement: { kind: "world" }, origin: { kind: "authored" }, visible: true,
    geometry: { kind: "asset", assetId },
    material: { kind: "standard", color: "#cccccc", opacity: 1, roughness: 1, metalness: 0 },
  });
  const fileSystem = createNodeBundleFileSystem(root), durability = createNodeSpatialDurability(root);
  const published: SpatialPublishedArtifact[] = [];
  const attempted: SpatialPublishedArtifact[] = [];
  const fence = async () => { options.signal.throwIfAborted(); await options.beforePublication?.(); options.signal.throwIfAborted(); };
  await fence();
  const workspace = await mkdtemp(join(root, ".slopcamera-asset-admit-"));
  let result: SpatialAssetAdmissionResult | undefined, failure: { error: unknown } | undefined;
  try {
    const staged = join(workspace, `${sha256}.glb`);
    await writeFile(staged, bytes, { flag: "wx", mode: 0o600 });
    attempted.push({ ...payload, disposition: "created" });
    const payloadDisposition = await fileSystem.copyFileNoReplace!(relative(root, staged), payload.path, payload, fence);
    published.push({ ...payload, disposition: payloadDisposition });
    await durability.syncExactFile(payload.path, payload);
    attempted.push({ ...factsPayload, disposition: "created" });
    const factsDisposition = await fileSystem.writeTextNoReplace!(factsPayload.path, factsText, fence);
    published.push({ ...factsPayload, disposition: factsDisposition });
    await durability.syncExactFile(factsPayload.path, factsPayload);
    const operations: SpatialPatchOperation[] = [
      { kind: "add-asset", asset: manifest },
      { kind: "add-asset", asset: factsManifest },
      { kind: "add-entity", entity },
    ];
    result = {
      manifest, factsManifest, facts, entity, operations,
      bounds: { modelSpace, sceneSpace },
      artifacts: { payload: published[0]!, facts: published[1]! },
    };
  } catch (error) { failure = { error }; }
  finally {
    try { await rm(workspace, { recursive: true, force: true }); }
    catch (error) { failure = { error: failure === undefined ? error : new AggregateError([failure.error, error], "Scene asset admission and workspace cleanup failed.") }; }
  }
  if (failure !== undefined) throw new SpatialAssetAdmissionError(failure.error, published, attempted);
  if (result === undefined) throw new SpatialAssetAdmissionError(new Error("Scene asset admission did not settle."), published, attempted);
  return result;
}
