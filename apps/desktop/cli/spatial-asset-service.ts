import { lstat, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import type { ApplicationContext } from "../application/context";
import { admitSpatialAssetFile, SpatialAssetAdmissionError } from "../application/spatial-asset-admission";
import { SpatialAssetAdmissionV1Schema } from "../contracts/spatial-asset";
import type { SpatialAssetCommand } from "./args";
import { CliError } from "./errors";
import { displayPath, ensurePhysicalPrivateDirectoryWithin, resolveSafePath } from "./paths";
import { publishSpatialSource } from "./spatial-scene-service";

function isWithin(root: string, candidate: string): boolean {
  const pathRelative = relative(root, candidate);
  return pathRelative === "" || (!pathRelative.startsWith("..") && !isAbsolute(pathRelative));
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/** A source root must exist and be physical before bounding one file below it. */
async function physicalSourceRoot(path: string): Promise<string> {
  let details;
  try { details = await lstat(path); }
  catch (error) {
    if (isMissing(error)) throw new CliError("not-found", `--source-root is not a directory: ${path}`);
    throw error;
  }
  if (details.isSymbolicLink() || !details.isDirectory()) {
    throw new CliError("unsafe-path", `--source-root must be a physical directory without symlinks: ${path}`);
  }
  return await realpath(path);
}

/**
 * Admit one explicit local GLB below --source-root (default: the project root),
 * publish its exact bytes and derived facts beside --output, and write the
 * deterministic admission document without replacing any existing path.
 */
export async function executeSpatialAssetCommand(
  application: ApplicationContext,
  command: SpatialAssetCommand,
  adapter: Readonly<{ signal?: AbortSignal }>,
): Promise<unknown> {
  const repositoryRoot = application.paths.repositoryRoot;
  const signal = adapter.signal ?? new AbortController().signal;
  const fence = async () => {
    signal.throwIfAborted();
    await application.hostResourceLease?.assertOwned();
    signal.throwIfAborted();
  };
  try {
    signal.throwIfAborted();
    const sourceRoot = await physicalSourceRoot(resolve(repositoryRoot, command.sourceRoot ?? "."));
    const source = resolve(sourceRoot, command.file);
    let physicalSource: string;
    try { physicalSource = await realpath(source); }
    catch (error) {
      if (isMissing(error)) throw new CliError("not-found", `Admitted asset does not exist: ${command.file}`);
      throw error;
    }
    if (!isWithin(sourceRoot, physicalSource)) {
      throw new CliError("unsafe-path", `Admitted asset escapes --source-root: ${command.file}`);
    }
    if (physicalSource !== source) {
      throw new CliError("unsafe-path", `Admitted asset must be a physical file without symlink components: ${command.file}`);
    }
    if (!(await lstat(physicalSource)).isFile()) {
      throw new CliError("invalid-data", `Admitted asset is not a regular file: ${command.file}`);
    }
    const output = await resolveSafePath(repositoryRoot, command.output);
    try {
      await lstat(output);
      throw new CliError("conflict", "Scene asset admission output already exists. Choose a new path to retain both revisions.");
    } catch (error) {
      if (error instanceof CliError) throw error;
      if (!isMissing(error)) throw error;
    }
    const outputParent = relative(repositoryRoot, dirname(output));
    const assetRoot = outputParent === ""
      ? repositoryRoot
      : await ensurePhysicalPrivateDirectoryWithin(repositoryRoot, outputParent);
    const result = await admitSpatialAssetFile({
      filePath: physicalSource, assetRoot,
      ...(command.assetId === undefined ? {} : { assetId: command.assetId }),
      metersPerUnit: command.metersPerUnit, sourceUp: command.sourceUp,
      signal, beforePublication: fence,
    });
    const document = SpatialAssetAdmissionV1Schema.parse({
      kind: "slopcamera.spatial-asset-admission", schemaVersion: 1,
      manifest: result.manifest, factsManifest: result.factsManifest, facts: result.facts,
      bounds: result.bounds, entity: result.entity, artifacts: result.artifacts,
      operations: result.operations,
    });
    try {
      await publishSpatialSource(output, document, fence);
    } catch (error) {
      const failure = error instanceof CliError ? error : new CliError("conflict", "Scene asset admission output publication failed.");
      throw new CliError(signal.aborted ? "cancelled" : failure.code, failure.message, {
        ...failure.details, published: [result.artifacts.payload, result.artifacts.facts], output: command.output,
      });
    }
    return {
      output: displayPath(repositoryRoot, output),
      assetId: result.manifest.assetId,
      factsAssetId: result.factsManifest.assetId,
      entityId: result.entity.entityId,
      bounds: result.bounds,
      artifacts: result.artifacts,
      document,
    };
  } catch (error) {
    if (error instanceof SpatialAssetAdmissionError) {
      throw new CliError(signal.aborted ? "cancelled" : "conflict", error.message, {
        published: error.published, attempted: error.attempted, output: command.output,
      });
    }
    if (signal.aborted && !(error instanceof CliError)) {
      throw new CliError("cancelled", "Scene asset admission cancelled; retain its source and any publication evidence.");
    }
    if (error instanceof RangeError) throw new CliError("invalid-data", error.message);
    throw error;
  }
}
