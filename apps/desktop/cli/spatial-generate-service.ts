import { constants } from "node:fs";
import { mkdir, open, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createSha256HexHasher } from "../../../src/code/sha256";
import {
  buildSpatialGeneratorRecord,
  deriveSpatialGeneratorSeed,
  generatedSpatialEntityId,
  mergeSpatialGeneratorOutput,
  parseSpatialGeneratorParameters,
  parseSpatialScene,
  SPATIAL_GENERATOR_LIMITS,
  spatialGeneratorParametersSha256,
  spatialSceneSha256,
  SpatialGeneratorIdSchema,
  validateSpatialGeneratorOutput,
} from "../../../src/spatial-scene/index";
import { sha256Hex } from "../core/canonical-json";
import type { ApplicationContext } from "../application/context";
import type { SpatialSceneCommand } from "./args";
import { CliError, errorMessage } from "./errors";
import { publishSpatialSource, readSpatialJson } from "./spatial-scene-service";

/**
 * Capture an explicit local generator module once: a bounded regular file
 * pinned by descriptor stat before and after the read, never a symlink leaf.
 */
async function readGeneratorModuleBytes(path: string): Promise<Uint8Array> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.size === 0n || before.size > BigInt(SPATIAL_GENERATOR_LIMITS.moduleSourceBytes)) {
      throw new CliError("invalid-data", "Generator module must be a nonempty bounded regular file.");
    }
    const bytes = new Uint8Array(Number(before.size));
    let offset = 0;
    while (offset < bytes.byteLength) {
      const read = await handle.read(bytes, offset, bytes.byteLength - offset, offset);
      if (read.bytesRead === 0) throw new CliError("conflict", "Generator module ended while it was being read.");
      offset += read.bytesRead;
    }
    const after = await handle.stat({ bigint: true });
    if (after.size !== before.size || after.mtimeNs !== before.mtimeNs || after.ctimeNs !== before.ctimeNs) {
      throw new CliError("conflict", "Generator module changed while it was being read.");
    }
    return bytes;
  } finally { await handle.close(); }
}

/**
 * The retained closureSha256 covers exactly the entry file, so the runtime
 * closure must stay single-file: relative and absolute import/export specifiers
 * and require() are rejected. Erased `import type` entries carry no runtime
 * dependency and are allowed; bare package specifiers resolve ambient
 * dependencies this digest does not cover — a documented prototype gap.
 */
function assertSingleFileGeneratorModule(source: string): void {
  for (const entry of new Bun.Transpiler({ loader: "ts" }).scan(source).imports) {
    const specifier = entry.path;
    if (specifier.startsWith(".") || specifier.startsWith("/") || /^[a-zA-Z]:/u.test(specifier)) {
      throw new CliError("invalid-data", `Generator modules are single-file in this version; move "${specifier}" inline or pass data through --parameters.`);
    }
  }
  if (/\brequire\s*\(/u.test(source)) {
    throw new CliError("invalid-data", "Generator modules are single-file ESM; require() is not supported.");
  }
  if (/(?<![\w$.])import\s*\(/u.test(source)) {
    throw new CliError("invalid-data", "Generator modules are single-file; dynamic import() would escape the retained source digest.");
  }
}

/**
 * The module executes from a private content-addressed copy, so the code that
 * runs is exactly the bytes sourceSha256 describes. A plain-path import would
 * return a stale module from the in-process registry after the file changed.
 */
async function stageGeneratorModule(privateRoot: string, moduleBytes: Uint8Array, sourceSha256: string): Promise<string> {
  const directory = join(privateRoot, "scene-generator-modules");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const staged = join(directory, `${sourceSha256}.ts`);
  const temporary = join(directory, `.${sourceSha256}.${process.pid}.tmp`);
  try {
    await writeFile(temporary, moduleBytes, { mode: 0o600 });
    await rename(temporary, staged);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
  return staged;
}

export type SpatialGenerateCommand = Extract<SpatialSceneCommand, { readonly action: "generate" }>;

/**
 * Executes a trusted current-user generator module — the same trust class as an
 * explicitly imported workflow module, with no sandbox claim — then stamps
 * generated identity, validates bounded output, records attempt provenance and
 * merges through replace-generator-output semantics.
 */
export async function executeSpatialGenerateCommand(
  application: ApplicationContext,
  command: SpatialGenerateCommand,
): Promise<unknown> {
  const parsedGeneratorId = SpatialGeneratorIdSchema.safeParse(command.generatorId);
  if (!parsedGeneratorId.success) {
    throw new CliError("invalid-data", "--generator-id must match generator_<alphanumeric> (1–128 characters).");
  }
  const generatorId = parsedGeneratorId.data;
  const modulePath = resolve(application.paths.repositoryRoot, command.module);
  const moduleBytes = await readGeneratorModuleBytes(modulePath);
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(moduleBytes);
  } catch {
    throw new CliError("invalid-data", "Generator module must be UTF-8 TypeScript source.");
  }
  assertSingleFileGeneratorModule(source);
  const moduleHash = createSha256HexHasher();
  moduleHash.update(moduleBytes);
  const sourceSha256 = moduleHash.digestHex();
  const stagedPath = await stageGeneratorModule(application.paths.privateRoot, moduleBytes, sourceSha256);

  const parameters = command.parameters === undefined
    ? {}
    : parseSpatialGeneratorParameters(
      await readSpatialJson(resolve(application.paths.repositoryRoot, command.parameters), SPATIAL_GENERATOR_LIMITS.parametersBytes));
  const parametersSha256 = spatialGeneratorParametersSha256(parameters);
  const seed = command.seed ?? deriveSpatialGeneratorSeed(sourceSha256);

  let loaded: unknown;
  try {
    loaded = await import(pathToFileURL(stagedPath).href);
  } catch (error) {
    throw new CliError("invalid-data", `Generator module failed to load: ${errorMessage(error)}`);
  }
  const generate = (loaded as Readonly<Record<string, unknown>>).generate;
  if (typeof generate !== "function") {
    throw new CliError("invalid-data", 'Generator module must export a "generate" function.');
  }
  const context = Object.freeze({
    seed,
    parameters,
    lib: Object.freeze({ entityId: (key: string) => generatedSpatialEntityId(generatorId, key) }),
  });
  let raw: unknown;
  try {
    raw = await (generate as (context: unknown) => unknown)(context);
  } catch (error) {
    throw new CliError("invalid-data", `Generator module failed: ${errorMessage(error)}`);
  }

  const output = validateSpatialGeneratorOutput(generatorId, raw);
  const runtimeSha256 = sha256Hex(Bun.version);
  const generator = buildSpatialGeneratorRecord({
    generatorId,
    sourceSha256,
    closureSha256: sourceSha256,
    parametersSha256,
    seed,
    runtimeSha256,
    entities: output.entities,
    editableKeys: output.editableKeys,
  });
  const into = command.into === undefined
    ? undefined
    : parseSpatialScene(await readSpatialJson(resolve(application.paths.repositoryRoot, command.into)));
  const scene = mergeSpatialGeneratorOutput(into, generator, output.entities);
  const outputPath = resolve(application.paths.repositoryRoot, command.output);
  await publishSpatialSource(outputPath, scene);
  return {
    path: outputPath,
    sceneSha256: spatialSceneSha256(scene),
    generatorId,
    seed,
    entities: output.entities.length,
    outputSha256: generator.outputSha256,
    sourceSha256,
    attemptId: generator.execution.kind === "attempt" ? generator.execution.attemptId : undefined,
    merged: into !== undefined,
  };
}
