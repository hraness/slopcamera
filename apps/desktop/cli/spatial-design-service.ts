import { constants } from "node:fs";
import { mkdir, open, realpath, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, dirname, join, relative, resolve } from "node:path";
import { z } from "zod";
import { createSha256HexHasher } from "../../../src/code/sha256";
import { SlopcameraCodeError } from "../../../src/code/errors";
import { compileSpatialDesign, editSpatialDesignParameters, inspectSpatialDesign } from "../../../src/spatial-scene/design";
import { createSpatialDesignStarter, listSpatialDesignTemplates } from "../../../src/spatial-scene/design-templates";
import { parseSpatialScene, parseSpatialValue, spatialSceneSha256, spatialValueSha256 } from "../../../src/spatial-scene/identity";
import type { SpatialSceneV1 } from "../../../src/spatial-scene/contracts";
import type { ApplicationContext } from "../application/context";
import { createNodeBundleFileSystem } from "../core/storage";
import type { SpatialDesignCommand } from "./args";
import { CliError } from "./errors";
import { ensurePhysicalPrivateDirectoryWithin, resolveSafePath } from "./paths";
import { publishSpatialSource, readSpatialJson } from "./spatial-scene-service";

const MAX_BUNDLE_BYTES = 64 * 1024 * 1024;
const MAX_GALLERY_BYTES = 128 * 1024 * 1024;
const ParametersSchema = z.record(z.string().min(1).max(64), z.number().finite()).refine(value => Object.keys(value).length <= 128, "At most 128 parameter updates are allowed.");
export const SpatialDesignVariantsSchema = z.strictObject({
  kind: z.literal("slopcamera.spatial-design-variants"), schemaVersion: z.literal(1),
  variants: z.array(z.strictObject({
    id: z.string().min(1).max(48).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    label: z.string().min(1).max(120), parameters: ParametersSchema,
  })).min(1).max(6),
}).superRefine((value, context) => {
  if (new Set(value.variants.map(variant => variant.id)).size !== value.variants.length) context.addIssue({ code: "custom", message: "Variant IDs must be unique." });
});

type Compilation = ReturnType<typeof compileSpatialDesign>;
type CapturedAsset = Readonly<{ path: string; bytes: Uint8Array }>;

function inspectionSummary(input: unknown): unknown {
  const report = inspectSpatialDesign(input);
  return { designId: report.design.designId, name: report.design.name, designSha256: report.designSha256,
    parameters: report.design.parameters, values: report.values, valueOrder: report.valueOrder,
    constraints: report.constraints, estimate: report.estimate,
    stages: report.stages.map(({ spec: _spec, ...stage }) => stage) };
}

function digest(bytes: Uint8Array): string {
  const hasher = createSha256HexHasher(); hasher.update(bytes); return hasher.digestHex();
}

async function captureAsset(sourceRoot: string, path: string, expected: { bytes: number; sha256: string }): Promise<CapturedAsset> {
  const absolute = resolve(sourceRoot, path);
  if (absolute !== await realpath(absolute)) throw new CliError("unsafe-path", "Design assets must have physical paths without symlinks.");
  const handle = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.size !== BigInt(expected.bytes) || expected.bytes > MAX_BUNDLE_BYTES) throw new CliError("invalid-data", `Design asset size differs: ${path}`);
    const bytes = new Uint8Array(expected.bytes);
    let offset = 0;
    while (offset < bytes.length) {
      const result = await handle.read(bytes, offset, Math.min(262144, bytes.length - offset), offset);
      if (result.bytesRead === 0) throw new CliError("conflict", `Design asset changed: ${path}`);
      offset += result.bytesRead;
    }
    const after = await handle.stat({ bigint: true });
    if (before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs || digest(bytes) !== expected.sha256) throw new CliError("conflict", `Design asset identity differs: ${path}`);
    return { path, bytes };
  } finally { await handle.close(); }
}

/** Capture only the assets still referenced by the compiled scene, including base-scene dependencies. */
async function captureCompilation(compilation: Compilation, sourceRoot: string | undefined): Promise<readonly CapturedAsset[]> {
  const emitted = new Map(compilation.outputs.flatMap(output => output.artifacts).map(artifact => [artifact.assetId, artifact]));
  const seen = new Map<string, { path: string; sha256: string; bytes: number }>();
  let total = 0;
  const assets: CapturedAsset[] = [];
  for (const asset of compilation.scene.assets) {
    const { path, bytes, sha256 } = asset.payload;
    const pathKey = path.normalize("NFC").toLowerCase();
    if (["design.json", "scene.json", "receipt.json", "render.json", "gallery.json", "base.scene.json"].some(reserved => pathKey === reserved || pathKey.startsWith(`${reserved}/`))) throw new CliError("conflict", `Asset uses a reserved bundle path: ${path}`);
    const prior = seen.get(pathKey);
    if (prior !== undefined) {
      if (prior.sha256 !== sha256 || prior.bytes !== bytes || prior.path !== path) throw new CliError("conflict", `Asset paths have conflicting identities: ${path}`);
      continue;
    }
    for (const existing of seen.keys()) if (pathKey.startsWith(`${existing}/`) || existing.startsWith(`${pathKey}/`)) throw new CliError("conflict", `Asset file and directory paths collide: ${path}`);
    seen.set(pathKey, { path, sha256, bytes });
    total += bytes;
    if (total > MAX_BUNDLE_BYTES) throw new CliError("invalid-data", "Design bundle exceeds 64 MiB.");
    const generated = emitted.get(asset.assetId);
    if (generated !== undefined) {
      if (generated.path !== path || generated.bytes.byteLength !== bytes || digest(generated.bytes) !== sha256) throw new CliError("invalid-data", "Generated design asset identity differs.");
      assets.push({ path, bytes: generated.bytes });
    } else {
      if (sourceRoot === undefined) throw new CliError("invalid-data", "A base scene with retained assets requires --scene.");
      assets.push(await captureAsset(sourceRoot, path, asset.payload));
    }
  }
  return assets;
}

async function reserveDirectory(root: string, requested: string, fence: () => Promise<void>): Promise<string> {
  const target = await resolveSafePath(root, requested);
  if (target === root) throw new CliError("unsafe-path", "Design output must be a new directory below the workspace.");
  const parent = relative(root, dirname(target));
  if (parent !== "") await ensurePhysicalPrivateDirectoryWithin(root, parent);
  await fence();
  // The custody callback may yield; validate physical parents again afterwards.
  await resolveSafePath(root, requested);
  if (parent !== "") await ensurePhysicalPrivateDirectoryWithin(root, parent);
  try { await mkdir(target, { mode: 0o700 }); }
  catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") throw new CliError("conflict", "Design output already exists. Choose a new directory to preserve all revisions.");
    throw error;
  }
  return target;
}

async function publishBytes(root: string, asset: CapturedAsset, fence: () => Promise<void>): Promise<void> {
  const folder = dirname(asset.path);
  const directory = folder === "." ? root : await ensurePhysicalPrivateDirectoryWithin(root, folder);
  const path = join(directory, basename(asset.path));
  const temporary = join(directory, `.design-${randomUUID()}.tmp`);
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(asset.bytes); await handle.sync();
  } finally { await handle.close(); }
  try {
    const fileSystem = createNodeBundleFileSystem(root);
    // The storage boundary rechecks staging bytes and physical parents after
    // the custody callback and publishes by a guarded no-replace hard link.
    const result = await fileSystem.copyFileNoReplace!(relative(root, temporary), relative(root, path),
      { bytes: asset.bytes.byteLength, sha256: digest(asset.bytes) }, fence).catch((error: unknown) => {
        if (error instanceof Error && !(error instanceof CliError) && !("code" in error)) throw new CliError("conflict", error.message);
        throw error;
      });
    if (result !== "created") throw new CliError("conflict", "Design asset output already exists.");
  } finally { await unlink(temporary); }
}

async function publishCompilation(root: string, compilation: Compilation, assets: readonly CapturedAsset[], fence: () => Promise<void>): Promise<unknown> {
  for (const asset of assets) await publishBytes(root, asset, fence);
  await publishSpatialSource(join(root, "design.json"), compilation.design, fence);
  await publishSpatialSource(join(root, "scene.json"), compilation.scene, fence);
  const cameraId = compilation.scene.cameras.find(camera => camera.cameraId === "camera_hero")?.cameraId ?? compilation.scene.cameras[0]?.cameraId;
  if (cameraId !== undefined) await publishSpatialSource(join(root, "render.json"), { cameraId, selection: { kind: "frame", timeUs: 0 }, mode: { kind: "beauty" } }, fence);
  const receipt = {
    kind: "slopcamera.spatial-design-bundle", schemaVersion: 1,
    compilation: compilation.receipt, compilationSha256: compilation.receiptSha256,
    stages: compilation.outputs.map(output => ({ receipt: output.receipt, receiptSha256: output.receiptSha256 })),
    sceneSha256: spatialSceneSha256(compilation.scene),
    files: assets.map(asset => ({ path: asset.path, bytes: asset.bytes.byteLength, sha256: digest(asset.bytes) })),
  };
  await publishSpatialSource(join(root, "receipt.json"), receipt, fence);
  return { directory: root, scene: join(root, "scene.json"), design: join(root, "design.json"), receipt: join(root, "receipt.json"),
    receiptSha256: spatialValueSha256(receipt), sceneSha256: receipt.sceneSha256,
    ...(cameraId === undefined ? {} : { renderRequest: join(root, "render.json") }),
    stages: compilation.outputs.length, assets: assets.length };
}

async function executeDesign(application: ApplicationContext, command: SpatialDesignCommand, signal?: AbortSignal): Promise<unknown> {
  const root = application.paths.repositoryRoot;
  const fence = async () => { signal?.throwIfAborted(); await application.hostResourceLease?.assertOwned(); signal?.throwIfAborted(); };
  await fence();
  if (command.action === "catalog") return { templates: listSpatialDesignTemplates() };
  if (command.action === "init") {
    const starter = createSpatialDesignStarter(command.template);
    inspectSpatialDesign(starter.design);
    const directory = await reserveDirectory(root, command.directory, fence);
    await publishSpatialSource(join(directory, "design.json"), starter.design, fence);
    await publishSpatialSource(join(directory, "base.scene.json"), starter.scene, fence);
    return { directory, design: join(directory, "design.json"), scene: join(directory, "base.scene.json"), template: command.template };
  }
  const design = await readSpatialJson(resolve(root, command.path));
  if (command.action === "inspect") return inspectionSummary(design);
  if (command.action === "set") {
    const parameters = parseSpatialValue(ParametersSchema, await readSpatialJson(resolve(root, command.parameters), 65536), "design parameter updates");
    const edited = editSpatialDesignParameters(design, parameters);
    const output = await resolveSafePath(root, command.output);
    const folder = relative(root, dirname(output));
    if (folder !== "") await ensurePhysicalPrivateDirectoryWithin(root, folder);
    await publishSpatialSource(output, edited, fence);
    return { path: output, inspection: inspectionSummary(edited) };
  }
  const scenePath = command.scene === undefined ? undefined : resolve(root, command.scene);
  const scene: SpatialSceneV1 | undefined = scenePath === undefined ? undefined : parseSpatialScene(await readSpatialJson(scenePath));
  const options = scene === undefined ? {} : { scene };
  const sourceRoot = scenePath === undefined ? undefined : await realpath(dirname(scenePath));
  if (command.action === "compile") {
    const compilation = compileSpatialDesign(design, options);
    const assets = await captureCompilation(compilation, sourceRoot);
    const directory = await reserveDirectory(root, command.outputDir, fence);
    return await publishCompilation(directory, compilation, assets, fence);
  }
  const variants = parseSpatialValue(SpatialDesignVariantsSchema, await readSpatialJson(resolve(root, command.variants), 65536), "design variants");
  // Inspect every candidate before emitting any geometry or publishing a directory.
  const designs = variants.variants.map(variant => editSpatialDesignParameters(design, variant.parameters));
  let estimatedBytes = 0;
  for (const candidate of designs) {
    const inspection = inspectSpatialDesign(candidate);
    estimatedBytes += inspection.estimate.bytes;
    if (estimatedBytes > MAX_GALLERY_BYTES) throw new CliError("invalid-data", "Design gallery exceeds 128 MiB of estimated output.");
  }
  const compiled = [];
  let total = 0;
  for (let index = 0; index < designs.length; index++) {
    await fence();
    const compilation = compileSpatialDesign(designs[index], options);
    const assets = await captureCompilation(compilation, sourceRoot);
    total += assets.reduce((sum, asset) => sum + asset.bytes.byteLength, 0);
    if (total > MAX_GALLERY_BYTES) throw new CliError("invalid-data", "Design gallery exceeds 128 MiB.");
    compiled.push({ variant: variants.variants[index]!, compilation, assets });
  }
  const directory = await reserveDirectory(root, command.outputDir, fence);
  const rows = [];
  for (const { variant, compilation, assets } of compiled) {
    const child = await reserveDirectory(directory, variant.id, fence);
    const bundle = await publishCompilation(child, compilation, assets, fence);
    rows.push({ ...variant, bundle });
  }
  const gallery = { kind: "slopcamera.spatial-design-gallery", schemaVersion: 1, rendered: false, variants: rows };
  await publishSpatialSource(join(directory, "gallery.json"), gallery, fence);
  return { directory, gallery: join(directory, "gallery.json"), variants: rows, rendered: false,
    sourceSha256: spatialValueSha256(design) };
}

export async function executeSpatialDesignCommand(application: ApplicationContext, command: SpatialDesignCommand, signal?: AbortSignal): Promise<unknown> {
  try { return await executeDesign(application, command, signal); }
  catch (error) {
    if (error instanceof CliError) throw error;
    if (signal?.aborted) throw new CliError("cancelled", "Design command was cancelled; retain any partial bundle.");
    if (error instanceof SlopcameraCodeError) throw new CliError(error.code, error.message, error.details);
    if (error instanceof SyntaxError) throw new CliError("invalid-data", "Design input must be valid UTF-8 JSON.");
    if (error instanceof Error && "code" in error) {
      if (error.code === "ENOENT" || error.code === "ENOTDIR") throw new CliError("not-found", "Design source, asset, or output parent does not exist.");
      if (error.code === "ELOOP") throw new CliError("unsafe-path", "Design inputs and outputs must use physical paths without symlinks.");
      if (error.code === "EEXIST") throw new CliError("conflict", "Design output already exists; choose a new path.");
    }
    throw error;
  }
}
