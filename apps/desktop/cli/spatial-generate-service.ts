import { constants } from "node:fs";
import { mkdir, open, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
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
import { canonicalJsonSha256, sha256Hex } from "../core/canonical-json";
import type { ApplicationContext } from "../application/context";
import type { SpatialSceneCommand } from "./args";
import { CliError, errorMessage } from "./errors";
import { publishSpatialSource, readSpatialJson } from "./spatial-scene-service";

/**
 * Capture an explicit local generator file once: a bounded regular file
 * pinned by descriptor stat before and after the read, never a symlink leaf.
 */
async function readGeneratorModuleBytes(path: string, label: string): Promise<Uint8Array> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ELOOP") throw new CliError("invalid-data", `${label} must be a real file, not a symlink.`);
      if (error.code === "ENOENT" || error.code === "ENOTDIR") throw new CliError("not-found", `${label} does not exist.`);
      throw error;
    });
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.size === 0n || before.size > BigInt(SPATIAL_GENERATOR_LIMITS.moduleSourceBytes)) {
      throw new CliError("invalid-data", `${label} must be a nonempty bounded regular file.`);
    }
    const bytes = new Uint8Array(Number(before.size));
    let offset = 0;
    while (offset < bytes.byteLength) {
      const read = await handle.read(bytes, offset, bytes.byteLength - offset, offset);
      if (read.bytesRead === 0) throw new CliError("conflict", `${label} ended while it was being read.`);
      offset += read.bytesRead;
    }
    const after = await handle.stat({ bigint: true });
    if (after.size !== before.size || after.ino !== before.ino || after.mtimeNs !== before.mtimeNs || after.ctimeNs !== before.ctimeNs) {
      throw new CliError("conflict", `${label} changed while it was being read.`);
    }
    return bytes;
  } finally { await handle.close(); }
}

/**
 * One verified real file in the generator closure. realPath is the canonical
 * dedupe and containment identity and the verified-read target; relativePath
 * is the POSIX manifest key and the staged location below the module root.
 */
interface GeneratorClosureFile {
  readonly realPath: string;
  readonly relativePath: string;
  readonly bytes: Uint8Array;
}

interface GeneratorModuleClosure {
  readonly files: readonly GeneratorClosureFile[];
  readonly entryRelativePath: string;
  readonly sourceSha256: string;
  readonly closureSha256: string;
}

/**
 * Closure bounds: at most 64 real files whose verified bytes together stay
 * inside the pre-existing per-module ceiling (1 MiB), so hashing, staging,
 * and module loading remain cheap. A single-file module therefore keeps its
 * exact prior acceptance range.
 */
const GENERATOR_MODULE_CLOSURE_LIMITS = Object.freeze({
  files: 64,
  totalBytes: SPATIAL_GENERATOR_LIMITS.moduleSourceBytes,
});

/** The transpiler loader for a scanned member, or undefined for data (.json) files that carry no imports. */
function generatorModuleLoader(relativePath: string): "ts" | "js" | undefined {
  if (relativePath.endsWith(".ts")) return "ts";
  if (relativePath.endsWith(".js")) return "js";
  return undefined;
}

function generatorModuleLabel(entry: GeneratorClosureFile, file: GeneratorClosureFile): string {
  return file === entry ? "Generator module" : `Generator dependency "${file.relativePath}"`;
}

function decodeGeneratorModuleSource(file: GeneratorClosureFile, label: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(file.bytes);
  } catch {
    throw new CliError("invalid-data", `${label} must be UTF-8 TypeScript/JavaScript source.`);
  }
}

function sha256BytesHex(bytes: Uint8Array): string {
  const hasher = createSha256HexHasher();
  hasher.update(bytes);
  return hasher.digestHex();
}

/**
 * Source forms the static closure cannot see are rejected in every file:
 * require()/require.resolve(), dynamic import(), and the Bun import.meta
 * facilities that mint module references at runtime.
 */
function assertClosureVisibleModuleForms(source: string, label: string): void {
  if (/\brequire(?:\s*\.\s*resolve)?\s*\(/u.test(source)) {
    throw new CliError("invalid-data", `${label} must be ESM; require() escapes the retained closure digest.`);
  }
  if (/(?<![\w$.])import\s*\(/u.test(source)) {
    throw new CliError("invalid-data", `${label} uses dynamic import(), which escapes the retained closure digest.`);
  }
  if (/\bimport\s*\.\s*meta\s*\.\s*(?:glob|resolve|require)\b/u.test(source)) {
    throw new CliError("invalid-data", `${label} uses import.meta glob/resolve/require, which escapes the retained closure digest.`);
  }
}

function isRelativeModuleSpecifier(specifier: string): boolean {
  return specifier === "." || specifier === ".." || specifier.startsWith("./") || specifier.startsWith("../");
}

/** Absolute filesystem specifiers, including drive-letter, UNC, and file: URL forms. */
function isAbsoluteModuleSpecifier(specifier: string): boolean {
  return specifier.startsWith("/") || specifier.startsWith("\\")
    || /^[a-zA-Z]:/u.test(specifier) || specifier.toLowerCase().startsWith("file:");
}

/**
 * Resolution candidates mirroring Bun's file-then-index probing, restricted
 * to the code/data extensions the closure admits; `.js` also probes the
 * TypeScript `.ts` spelling because the runtime resolves that way.
 */
function generatorModuleSpecifierCandidates(resolved: string, specifier: string): readonly string[] {
  if (resolved.endsWith(".ts") || resolved.endsWith(".json")) return [resolved];
  if (resolved.endsWith(".js")) return [resolved, `${resolved.slice(0, -3)}.ts`];
  if (extname(resolved) !== "") {
    throw new CliError("invalid-data", `Generator import "${specifier}" must target a .ts, .js, or .json file inside the module directory.`);
  }
  if (specifier.endsWith("/") || specifier === "." || specifier === "..") {
    return [join(resolved, "index.ts"), join(resolved, "index.js"), join(resolved, "index.json")];
  }
  return [`${resolved}.ts`, `${resolved}.js`, `${resolved}.json`,
    join(resolved, "index.ts"), join(resolved, "index.js"), join(resolved, "index.json")];
}

async function realpathIfPresent(candidate: string, specifier: string): Promise<string | undefined> {
  try {
    return await realpath(candidate);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return undefined;
    if (code === "ELOOP") {
      throw new CliError("invalid-data", `Generator import "${specifier}" resolves through a symlink; generator modules must be a real file tree.`);
    }
    throw error;
  }
}

/**
 * BFS over the transitive relative-import graph so the retained closureSha256
 * covers the complete real file set. The module root is the entry file's real
 * directory; every resolved file must stay inside it, must be a real
 * (non-symlink) regular file, and gets the same verified read as the entry.
 * Erased `import type`/`export type` entries carry no runtime dependency and
 * are allowed; bare package specifiers (including node:/bun: builtins) resolve
 * ambient dependencies the digests do not cover — a documented prototype gap
 * unchanged from single-file mode.
 */
async function resolveGeneratorModuleClosure(modulePath: string): Promise<GeneratorModuleClosure> {
  const entryBytes = await readGeneratorModuleBytes(modulePath, "Generator module");
  let entryRealPath: string;
  try {
    entryRealPath = await realpath(modulePath);
  } catch {
    throw new CliError("not-found", "Generator module does not resolve to a real file.");
  }
  const rootReal = dirname(entryRealPath);
  const entry: GeneratorClosureFile = { realPath: entryRealPath, relativePath: basename(entryRealPath), bytes: entryBytes };
  if (generatorModuleLoader(entry.relativePath) === undefined) {
    throw new CliError("invalid-data", "Generator module must be a .ts or .js file.");
  }
  const files: GeneratorClosureFile[] = [entry];
  const seen = new Set([entry.realPath]);
  const queue = [entry];
  let totalBytes = entry.bytes.byteLength;

  const resolveImport = async (importer: GeneratorClosureFile, specifier: string): Promise<string> => {
    const resolved = resolve(dirname(importer.realPath), specifier);
    for (const candidate of generatorModuleSpecifierCandidates(resolved, specifier)) {
      const real = await realpathIfPresent(candidate, specifier);
      if (real === undefined) continue;
      const contained = relative(rootReal, real);
      if (contained === "" || contained === ".." || contained.startsWith(`..${sep}`) || isAbsolute(contained)) {
        throw new CliError("invalid-data", `Generator import "${specifier}" escapes the generator module directory.`);
      }
      if (real !== candidate && real.toLowerCase() !== candidate.toLowerCase()) {
        throw new CliError("invalid-data", `Generator import "${specifier}" resolves through a symlink; generator modules must be a real file tree.`);
      }
      return real;
    }
    throw new CliError("not-found", `Generator import "${specifier}" does not resolve to a .ts, .js, or .json file below the module directory.`);
  };

  while (queue.length > 0) {
    const importer = queue.shift()!;
    const loader = generatorModuleLoader(importer.relativePath);
    if (loader === undefined) continue; // data files carry no further imports
    const label = generatorModuleLabel(entry, importer);
    const source = decodeGeneratorModuleSource(importer, label);
    assertClosureVisibleModuleForms(source, label);
    for (const scanned of new Bun.Transpiler({ loader }).scan(source).imports) {
      if (scanned.kind === "dynamic-import") {
        throw new CliError("invalid-data", `${label} uses dynamic import(), which escapes the retained closure digest.`);
      }
      const specifier = scanned.path;
      if (isAbsoluteModuleSpecifier(specifier)) {
        throw new CliError("invalid-data", `Generator import "${specifier}" is absolute; only relative imports inside the module directory are allowed.`);
      }
      if (!isRelativeModuleSpecifier(specifier)) continue; // ambient bare specifier — documented gap
      const real = await resolveImport(importer, specifier);
      if (seen.has(real)) continue;
      const relativePath = relative(rootReal, real).split(sep).join("/");
      const bytes = await readGeneratorModuleBytes(real, `Generator dependency "${relativePath}"`);
      const file: GeneratorClosureFile = { realPath: real, relativePath, bytes };
      files.push(file);
      seen.add(real);
      queue.push(file);
      totalBytes += bytes.byteLength;
      if (files.length > GENERATOR_MODULE_CLOSURE_LIMITS.files) {
        throw new CliError("invalid-data", `Generator module closure exceeds ${GENERATOR_MODULE_CLOSURE_LIMITS.files} files.`);
      }
      if (totalBytes > GENERATOR_MODULE_CLOSURE_LIMITS.totalBytes) {
        throw new CliError("invalid-data", `Generator module closure exceeds ${GENERATOR_MODULE_CLOSURE_LIMITS.totalBytes} total bytes.`);
      }
    }
  }

  const manifest = files
    .map(file => ({ relativePath: file.relativePath, sha256: sha256BytesHex(file.bytes) }))
    .sort((left, right) => left.relativePath < right.relativePath ? -1 : left.relativePath > right.relativePath ? 1 : 0);
  const sourceSha256 = sha256BytesHex(entry.bytes);
  // Single-file modules keep closureSha256 == sourceSha256 exactly, so the
  // retained record is byte-identical to the pre-closure behavior.
  const closureSha256 = files.length === 1 ? sourceSha256 : canonicalJsonSha256(manifest);
  return { files, entryRelativePath: entry.relativePath, sourceSha256, closureSha256 };
}

async function directoryExists(path: string): Promise<boolean> {
  return stat(path).then(result => result.isDirectory()).catch(() => false);
}

/**
 * The closure executes from a private content-addressed tree mirroring the
 * module's relative structure, so the code that runs is exactly the bytes the
 * retained digests describe. Plain-path imports would return stale modules
 * from the in-process registry after any member file changed.
 */
async function stageGeneratorModuleTree(privateRoot: string, closure: GeneratorModuleClosure): Promise<string> {
  const directory = join(privateRoot, "scene-generator-modules");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const staged = join(directory, closure.closureSha256);
  const stagedEntry = join(staged, ...closure.entryRelativePath.split("/"));
  if (await directoryExists(staged)) return stagedEntry;
  const temporary = join(directory, `.${closure.closureSha256}.${process.pid}.tmp`);
  await rm(temporary, { recursive: true, force: true });
  try {
    for (const file of closure.files) {
      const target = join(temporary, ...file.relativePath.split("/"));
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      await writeFile(target, file.bytes, { mode: 0o600 });
    }
    await rename(temporary, staged);
  } catch (error) {
    await rm(temporary, { recursive: true, force: true }).catch(() => undefined);
    if (await directoryExists(staged)) return stagedEntry; // a concurrent invocation staged identical content
    throw error;
  }
  return stagedEntry;
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
  const closure = await resolveGeneratorModuleClosure(modulePath);
  const { sourceSha256, closureSha256 } = closure;
  const stagedPath = await stageGeneratorModuleTree(application.paths.privateRoot, closure);

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
    closureSha256,
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
