import { reportUsefulResult, type UsefulResultObserver } from "../../../src/support-completion";

import { constants } from "node:fs";
import { mkdir, open } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { canonicalJson } from "../core/canonical-json";
import {
  HTML_OVERLAY_SCAFFOLD_KINDS,
  HTML_OVERLAY_SCAFFOLD_PROFILES,
  createHtmlOverlayScaffold,
  getApprovedHtmlOverlayLibraryLock,
  getHtmlOverlayScaffoldProfile,
  type HtmlOverlayLibrarySpecifier,
  type HtmlOverlayScaffoldKind,
} from "../html-overlay";
import { CliError } from "./errors";
import {
  createHtmlFilmProject, HTML_FILM_ASPECTS, HTML_FILM_TEMPLATES,
  type HtmlFilmAspect, type HtmlFilmInitResult, type HtmlFilmTemplate,
} from "./html-film-init";

const HEADLESS_SLOPCAMERA_CLI_MODULE = "@hraness/slopcamera/cli";

async function runHeadlessSlopcameraCli(
  argv: readonly string[],
  options?: Readonly<{ onUsefulResult?: UsefulResultObserver }>,
): Promise<void> {
  // Keep this as a runtime package import so the headless CLI retains its own
  // package-relative skill and asset resolution inside an installed bundle.
  const module: unknown = await import(HEADLESS_SLOPCAMERA_CLI_MODULE);
  if (
    typeof module !== "object"
    || module === null
    || !("main" in module)
    || typeof module.main !== "function"
  ) {
    throw new CliError("unavailable", "The portable Slopcamera CLI is unavailable.");
  }
  await module.main(argv, options);
}

export interface PortableSurfaceDependencies {
  readonly onUsefulResult?: UsefulResultObserver;
  readonly cwd?: () => string;
  readonly log?: (value: string) => void;
  readonly runHeadless?: (argv: readonly string[], options?: Readonly<{ onUsefulResult?: UsefulResultObserver }>) => Promise<void>;
  readonly writeScaffold?: (path: string, html: string) => Promise<void>;
  readonly createFilm?: typeof createHtmlFilmProject;
}
function optionValue(argv: readonly string[], name: string): string | undefined {
  const indexes = argv.flatMap((value, index) => value === name ? [index] : []);
  if (indexes.length > 1) {
    throw new CliError("usage", `${name} may be supplied at most once.`);
  }
  const index = indexes[0];
  if (index === undefined) return undefined;
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new CliError("usage", `${name} requires a value.`);
  }
  return value;
}

/**
 * `image generate --prompt ...` is the project/media spelling and stays on the
 * desktop Gateway lane. The portable file command has an explicit --output
 * and delegates to @hraness/slopcamera without duplicating its parser.
 */
export function canonicalizeUnifiedCliArgs(
  argv: readonly string[],
): readonly string[] {
  if (argv[0] !== "image" || argv[1] !== "generate") return argv;
  const output = optionValue(argv, "--output");
  const prompt = optionValue(argv, "--prompt");
  if (output === undefined) {
    return ["ai", "image", "generate", ...argv.slice(2)];
  }
  if (prompt === undefined) return argv;
  const promptIndex = argv.indexOf("--prompt");
  return [
    "image",
    "generate",
    prompt,
    ...argv.slice(2, promptIndex),
    ...argv.slice(promptIndex + 2),
  ];
}

function scaffoldKind(input: string | undefined): HtmlOverlayScaffoldKind {
  if (input !== undefined) {
    try {
      return getHtmlOverlayScaffoldProfile(input as HtmlOverlayScaffoldKind).kind;
    } catch {
      // Preserve one stable CLI usage error for every foreign scaffold kind.
    }
  }
  throw new CliError(
    "usage",
    `HTML scaffold must be one of: ${HTML_OVERLAY_SCAFFOLD_KINDS.join(", ")}.`,
  );
}

function catalogLibraries(
  specifiers: readonly HtmlOverlayLibrarySpecifier[],
): readonly Readonly<{ specifier: string; version: string }>[] {
  return specifiers.map(specifier => {
    const lock = getApprovedHtmlOverlayLibraryLock(specifier);
    return Object.freeze({
      specifier: lock.specifier,
      version: lock.version,
    });
  });
}

function htmlOverlayCatalogJson(): string {
  return canonicalJson({
    profiles: HTML_OVERLAY_SCAFFOLD_PROFILES.map(profile => ({
      bestFor: profile.bestFor,
      clockIntegration: profile.clockIntegration,
      kind: profile.kind,
      libraries: catalogLibraries(profile.libraries),
      primaryJob: profile.primaryJob,
      substrate: profile.substrate,
      summary: profile.summary,
    })),
    schemaVersion: 1,
  });
}

function htmlOverlayCatalogText(): string {
  const rows = ["HTML overlay scaffold profiles:"];
  for (const profile of HTML_OVERLAY_SCAFFOLD_PROFILES) {
    const libraries = catalogLibraries(profile.libraries)
      .map(library => `${library.specifier}@${library.version}`)
      .join(", ") || "none";
    rows.push(
      `${profile.kind}  job=${profile.primaryJob}  substrate=${profile.substrate}  libraries=${libraries}`,
      `  ${profile.summary} Best for: ${profile.bestFor}`,
    );
  }
  return rows.join("\n");
}

async function writeScaffoldWithoutReplacement(
  path: string,
  html: string,
): Promise<void> {
  await mkdir(dirname(path), { mode: 0o700, recursive: true });
  let handle;
  try {
    handle = await open(
      path,
      constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW | constants.O_WRONLY,
      0o600,
    );
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      throw new CliError("conflict", `Refusing to overwrite existing file: ${path}`);
    }
    throw error;
  }
  try {
    await handle.writeFile(html, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function runHtmlScaffold(
  argv: readonly string[],
  dependencies: PortableSurfaceDependencies,
): Promise<number> {
  if (argv[1] !== "scaffold") {
    throw new CliError("usage", "Use slopcamera html scaffold <kind> --output <file.html>.");
  }
  const kind = scaffoldKind(argv[2]);
  const output = optionValue(argv, "--output");
  if (output === undefined) {
    throw new CliError("usage", "slopcamera html scaffold requires --output <file.html>.");
  }
  if (!output.toLowerCase().endsWith(".html")) {
    throw new CliError("usage", "HTML scaffold output must end in .html.");
  }
  if (
    argv.length !== 5
    || argv[3] !== "--output"
  ) {
    throw new CliError(
      "usage",
      "Use slopcamera html scaffold <kind> --output <file.html>.",
    );
  }
  const outputPath = resolve((dependencies.cwd ?? process.cwd)(), output);
  await (dependencies.writeScaffold ?? writeScaffoldWithoutReplacement)(
    outputPath,
    createHtmlOverlayScaffold(kind),
  );
  (dependencies.log ?? console.log)(`Created ${outputPath}`);
  reportUsefulResult(dependencies.onUsefulResult);
  return 0;
}

function runHtmlCatalog(
  argv: readonly string[],
  dependencies: PortableSurfaceDependencies,
): number {
  const options = argv.slice(2);
  if (
    options.length > 1
    || (options.length === 1 && options[0] !== "--json")
  ) {
    throw new CliError("usage", "Use slopcamera html catalog [--json].");
  }
  const output = options[0] === "--json"
    ? htmlOverlayCatalogJson()
    : htmlOverlayCatalogText();
  (dependencies.log ?? console.log)(output);
  return 0;
}

const HTML_INIT_USAGE = "Use slopcamera html init <dir> --template launch-film [--aspect 16:9|1:1|9:16] [--json].";

async function runHtmlInit(
  argv: readonly string[],
  dependencies: PortableSurfaceDependencies,
): Promise<number> {
  let directory: string | undefined;
  let template: string | undefined;
  let aspect: string | undefined;
  let json = false;
  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index]!;
    if (value === "--json") {
      if (json) throw new CliError("usage", "--json may be supplied at most once.");
      json = true;
    } else if (value === "--template" || value === "--aspect") {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("--")) throw new CliError("usage", `${value} requires a value.`);
      if ((value === "--template" ? template : aspect) !== undefined) throw new CliError("usage", `${value} may be supplied at most once.`);
      if (value === "--template") template = next;
      else aspect = next;
      index += 1;
    } else if (value.startsWith("-") || directory !== undefined) {
      throw new CliError("usage", HTML_INIT_USAGE);
    } else {
      directory = value;
    }
  }
  if (directory === undefined || template === undefined) throw new CliError("usage", HTML_INIT_USAGE);
  if (!(HTML_FILM_TEMPLATES as readonly string[]).includes(template)) {
    throw new CliError("usage", `Unknown film template ${template}. Use one of: ${HTML_FILM_TEMPLATES.join(", ")}.`);
  }
  const selectedAspect = aspect ?? "16:9";
  if (!(HTML_FILM_ASPECTS as readonly string[]).includes(selectedAspect)) {
    throw new CliError("usage", `--aspect must be one of ${HTML_FILM_ASPECTS.join(", ")}.`);
  }
  const result: HtmlFilmInitResult = await (dependencies.createFilm ?? createHtmlFilmProject)(
    resolve((dependencies.cwd ?? process.cwd)(), directory),
    { template: template as HtmlFilmTemplate, aspect: selectedAspect as HtmlFilmAspect },
  );
  (dependencies.log ?? console.log)(json
    ? JSON.stringify(result)
    : [`Created ${result.directory} from ${result.template} (${result.aspect})`, ...result.next.map(line => `next ${line}`)].join("\n"));
  reportUsefulResult(dependencies.onUsefulResult);
  return 0;
}

export async function runPortableSurface(
  argvInput: readonly string[],
  dependencies: PortableSurfaceDependencies = {},
): Promise<number | undefined> {
  const argv = canonicalizeUnifiedCliArgs(argvInput);
  if (argv[0] === "style" && (argv.includes("--help") || argv.includes("-h"))) return undefined;
  if (argv[0] === "html") {
    if (argv[1] === "render" || argv[1] === "still" || argv[1] === "preview" || argv[1] === "deliver"
      || argv.includes("--help") || argv.includes("-h")) return undefined;
    if (argv[1] === "catalog") return runHtmlCatalog(argv, dependencies);
    if (argv[1] === "init") return await runHtmlInit(argv, dependencies);
    return await runHtmlScaffold(argv, dependencies);
  }
  const delegatesToHeadless = argv[0] === "diagram"
    || argv[0] === "style"
    || argv[0] === "mcp"
    || argv[0] === "canvas"
    || argv[0] === "skill"
    || (
      argv[0] === "code"
      && (argv[1] === "search" || argv[1] === "execute")
    )
    || (
      argv[0] === "image"
      && (
        argv[1] === "vectorize" ||
        argv[1] === "generate" ||
        argv[1] === "icon" ||
        argv[1] === "gallery"
      )
    );
  if (!delegatesToHeadless) return undefined;

  const previousExitCode = process.exitCode;
  process.exitCode = undefined;
  try {
    await (dependencies.runHeadless ?? runHeadlessSlopcameraCli)(argv,
      dependencies.onUsefulResult === undefined ? {} : { onUsefulResult: dependencies.onUsefulResult });
    return process.exitCode ?? 0;
  } finally {
    process.exitCode = previousExitCode;
  }
}
