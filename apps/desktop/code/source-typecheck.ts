import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import ts from "typescript";

import { ApplicationError } from "../application/errors";

const MAX_TYPE_DIAGNOSTICS = 20;
const MAX_TYPE_DIAGNOSTIC_BYTES = 32 * 1024;
const WORKFLOW_GLOBALS_PATH = "/slopcamera-workflow-typecheck-globals.d.ts";
const WORKFLOW_GLOBALS_SOURCE = [
  "declare const Bun: any;",
  "declare const process: any;",
  "",
].join("\n");
// Packed distributions ship no host tsconfig; this closed fallback preserves
// the host compiler contract instead of adopting a foreign caller tsconfig.
const PACKED_WORKFLOW_CONFIG = {
  compilerOptions: {
    allowImportingTsExtensions: true,
    exactOptionalPropertyTypes: true,
    isolatedModules: true,
    jsx: "react-jsx",
    lib: ["ES2023", "DOM", "DOM.Iterable"],
    module: "Preserve",
    moduleDetection: "force",
    moduleResolution: "Bundler",
    noEmit: true,
    noFallthroughCasesInSwitch: true,
    noImplicitOverride: true,
    noImplicitReturns: true,
    noUncheckedIndexedAccess: true,
    noUnusedLocals: true,
    noUnusedParameters: true,
    skipLibCheck: true,
    strict: true,
    target: "ES2023",
    useUnknownInCatchVariables: true,
    verbatimModuleSyntax: true,
  },
};

export interface TypecheckWorkflowSnapshotOptions {
  readonly aliases: Readonly<Record<string, string>>;
  readonly configSearchPath: string;
  readonly entryPath: string;
  readonly hostBoundary: string;
  readonly includeRuntimeTypes: boolean;
  readonly sourceRoot: string;
}

function isWithin(root: string, candidate: string): boolean {
  const fromRoot = relative(root, candidate);
  return fromRoot === "" || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot));
}

/** Finds the host tsconfig without crossing into a foreign caller tree. */
function boundedHostConfigPath(
  searchPath: string,
  boundary: string,
): string | undefined {
  const limit = resolve(boundary);
  let candidate = resolve(searchPath);
  while (isWithin(limit, candidate)) {
    const path = join(candidate, "tsconfig.json");
    if (ts.sys.fileExists(path)) return path;
    const parent = dirname(candidate);
    if (parent === candidate) return undefined;
    candidate = parent;
  }
  return undefined;
}

/**
 * Resolves the installed @types/bun package from the host tree so runtime
 * types never depend on the caller's working directory or dependencies.
 */
function bunTypeRoots(hostBoundary: string): string | undefined {
  try {
    return dirname(dirname(
      Bun.resolveSync("@types/bun/package.json", resolve(hostBoundary)),
    ));
  } catch {
    return undefined;
  }
}

function diagnosticText(
  diagnostic: ts.Diagnostic,
  sourceRoot: string,
): string {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
  if (diagnostic.file === undefined || diagnostic.start === undefined) {
    return `TS${String(diagnostic.code)}: ${message}`;
  }
  const location = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  const lineStarts = diagnostic.file.getLineStarts();
  const lineStart = lineStarts[location.line] ?? diagnostic.start;
  const lineEnd = diagnostic.file.text.indexOf("\n", lineStart);
  const sourceLine = diagnostic.file.text
    .slice(lineStart, lineEnd === -1 ? undefined : lineEnd)
    .trim();
  const path = isWithin(sourceRoot, diagnostic.file.fileName)
    ? relative(sourceRoot, diagnostic.file.fileName)
    : diagnostic.file.fileName;
  return [
    `${path}:${String(location.line + 1)}:${String(location.character + 1)} TS${String(diagnostic.code)}: ${message}`,
    ...(sourceLine === "" ? [] : [`  ${sourceLine.slice(0, 512)}`]),
  ].join("\n");
}

function boundedDiagnostics(
  diagnostics: readonly ts.Diagnostic[],
  sourceRoot: string,
): string {
  const lines: string[] = [];
  let bytes = 0;
  for (const diagnostic of diagnostics.slice(0, MAX_TYPE_DIAGNOSTICS)) {
    const line = diagnosticText(diagnostic, sourceRoot);
    const nextBytes = Buffer.byteLength(`${line}\n`, "utf8");
    if (bytes + nextBytes > MAX_TYPE_DIAGNOSTIC_BYTES) break;
    lines.push(line);
    bytes += nextBytes;
  }
  if (diagnostics.length > lines.length) {
    lines.push(`… ${String(diagnostics.length - lines.length)} additional diagnostic(s) omitted`);
  }
  return lines.join("\n");
}

/**
 * Semantically checks the same private source snapshot that is handed to the
 * bundler. Only workflow-owned files can make this preflight fail; the host
 * application has its own repository-wide typecheck.
 */
export function typecheckWorkflowSnapshot(
  options: TypecheckWorkflowSnapshotOptions,
): void {
  const configPath = boundedHostConfigPath(
    options.configSearchPath,
    options.hostBoundary,
  );
  const hostDirectory = configPath === undefined
    ? resolve(options.hostBoundary)
    : dirname(configPath);
  let parsedOptions: ts.CompilerOptions;
  if (configPath === undefined) {
    const parsed = ts.parseJsonConfigFileContent(
      PACKED_WORKFLOW_CONFIG,
      ts.sys,
      hostDirectory,
      {
        composite: false,
        declaration: false,
        emitDeclarationOnly: false,
        incremental: false,
        noEmit: true,
      },
      "slopcamera-packed-workflow.tsconfig.json",
    );
    if (parsed.errors.length > 0) {
      throw new ApplicationError(
        "internal",
        `Workflow semantic checking could not apply its packed TypeScript configuration:\n${
          boundedDiagnostics(parsed.errors, options.sourceRoot)
        }`,
      );
    }
    parsedOptions = parsed.options;
  } else {
    const config = ts.readConfigFile(configPath, path => ts.sys.readFile(path));
    if (config.error !== undefined) {
      throw new ApplicationError(
        "internal",
        `Workflow semantic checking could not read the host TypeScript configuration: ${
          diagnosticText(config.error, options.sourceRoot)
        }`,
      );
    }
    const parsed = ts.parseJsonConfigFileContent(
      config.config,
      ts.sys,
      hostDirectory,
      {
        composite: false,
        declaration: false,
        emitDeclarationOnly: false,
        incremental: false,
        noEmit: true,
      },
      configPath,
    );
    if (parsed.errors.length > 0) {
      throw new ApplicationError(
        "internal",
        `Workflow semantic checking could not parse the host TypeScript configuration:\n${
          boundedDiagnostics(parsed.errors, options.sourceRoot)
        }`,
      );
    }
    parsedOptions = parsed.options;
  }
  const typecheckImporterPath = resolve(
    hostDirectory,
    "slopcamera-workflow-typecheck.ts",
  );
  const aliasPaths = Object.fromEntries(
    Object.entries(options.aliases)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([specifier, runtimePath]) => {
        if (!/\.[cm]?js$/u.test(runtimePath)) {
          return [specifier, [runtimePath]];
        }
        const declaration = ts.resolveModuleName(
          specifier,
          typecheckImporterPath,
          parsedOptions,
          ts.sys,
        ).resolvedModule?.resolvedFileName;
        return [
          specifier,
          [declaration !== undefined && /\.d\.[cm]?ts$/u.test(declaration)
            ? declaration
            : runtimePath],
        ];
      }),
  );
  // Runtime-typed workflows use the host's installed @types/bun when it is
  // present and the explicit any-globals shim when it is not.
  const runtimeTypeRoots = options.includeRuntimeTypes
    ? bunTypeRoots(options.hostBoundary)
    : undefined;
  const realRuntimeTypes = runtimeTypeRoots !== undefined;
  const compilerOptions: ts.CompilerOptions = {
    ...parsedOptions,
    baseUrl: options.sourceRoot,
    composite: false,
    declaration: false,
    emitDeclarationOnly: false,
    incremental: false,
    noEmit: true,
    paths: {
      ...parsedOptions.paths,
      ...aliasPaths,
    },
    ...(realRuntimeTypes ? { typeRoots: [runtimeTypeRoots] } : {}),
    types: realRuntimeTypes ? ["bun"] : [],
  };
  delete compilerOptions.tsBuildInfoFile;
  const host = ts.createCompilerHost(compilerOptions, true);
  const defaultFileExists = host.fileExists.bind(host);
  const defaultGetSourceFile = host.getSourceFile.bind(host);
  const defaultReadFile = host.readFile.bind(host);
  host.fileExists = path => (
    path === WORKFLOW_GLOBALS_PATH || defaultFileExists(path)
  );
  host.getSourceFile = (path, languageVersion, onError, shouldCreateNewSourceFile) => (
    path === WORKFLOW_GLOBALS_PATH
      ? ts.createSourceFile(
          path,
          WORKFLOW_GLOBALS_SOURCE,
          languageVersion,
          true,
          ts.ScriptKind.TS,
        )
      : defaultGetSourceFile(
          path,
          languageVersion,
          onError,
          shouldCreateNewSourceFile,
        )
  );
  host.readFile = path => (
    path === WORKFLOW_GLOBALS_PATH ? WORKFLOW_GLOBALS_SOURCE : defaultReadFile(path)
  );
  const program = ts.createProgram({
    host,
    options: compilerOptions,
    rootNames: [
      options.entryPath,
      ...(realRuntimeTypes ? [] : [WORKFLOW_GLOBALS_PATH]),
    ],
  });
  const diagnostics = program.getSourceFiles()
    .filter(file => isWithin(options.sourceRoot, file.fileName))
    .flatMap(file => [
      ...program.getSyntacticDiagnostics(file),
      ...program.getSemanticDiagnostics(file),
    ])
    .filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error);
  if (diagnostics.length > 0) {
    throw new ApplicationError(
      "invalid-data",
      `Workflow TypeScript check failed:\n${
        boundedDiagnostics(diagnostics, options.sourceRoot)
      }`,
      { diagnosticCount: diagnostics.length },
    );
  }
}
