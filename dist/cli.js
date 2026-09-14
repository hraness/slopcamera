#!/usr/bin/env bun
// @bun
import {
  SLOPCAMERA_VERSION,
  artifactSummary,
  checkDiagramFile,
  renderDiagramFile,
  runMcpServer
} from "./index-14fdv91w.js";
import {
  installSkill,
  pathExists
} from "./index-7308egqr.js";
import"./index-8txs6fkn.js";
import"./index-fava6pge.js";
import {
  executeSlopcameraOperation,
  isSlopcameraOperationCode,
  searchSlopcameraOperations,
  slopcameraOperationCodes,
  withSlopcameraOperationHostAdmission
} from "./index-h1k0fnjq.js";
import {
  vectorizeImage
} from "./index-zfnddgay.js";
import {
  generateSlopcameraImageFile,
  slopcameraGatewayCredentialStatus,
  slopcameraImageModels
} from "./index-r7gdhmsp.js";
import"./index-sh6xbav6.js";
import {
  __require
} from "./index-z1w83f81.js";

// src/cli.ts
import { writeFile } from "fs/promises";
import { resolve } from "path";
var slopcameraCliVersion = SLOPCAMERA_VERSION;
var help = `slopcamera ${slopcameraCliVersion}

Turn source material into deterministic diagrams, images, and canvas assets.

Usage:
  slopcamera diagram init [file]
  slopcamera diagram check <file> [--config <file>] [--strict]
  slopcamera diagram render <file> [--out-dir <directory>] [--config <file>] [--scale <number>]
  slopcamera image vectorize <image> --output <file.svg> [--json] [--duotone <#rgb,#rgb>]
  slopcamera image generate <prompt> --output <file.png|jpg|webp> [--model <provider/model>] [--json]
  slopcamera code search [query] [--limit <number>]
  slopcamera code execute <operation> --input <JSON>
  slopcamera mcp --root <workspace>
  slopcamera doctor
  slopcamera skill path
  slopcamera skill install [--target codex|claude|agents] [--scope user|project] [--force]

Render writes the same five replaceable artifacts on every run:
  <name>.tldr
  <name>.light.svg
  <name>.dark.svg
  <name>.light.png
  <name>.dark.png

  The .tldr file is editable interchange for browser-based canvas tooling.
  Rendering does not require a desktop application or a bundled UI runtime.

Vectorize adaptively traces a raster with a checksum-pinned VTracer binary.
It enforces bounded input, decode, time, path, and output budgets and emits a
safe path-only SVG (plus an internal vector alpha mask when fidelity requires).
It is fully local. No source path or bytes are sent to a network endpoint.

Generate sends one bounded, non-retried request directly to Vercel AI Gateway.
Set AI_GATEWAY_API_KEY, or run through \`vercel env run -- \u2026\` so
VERCEL_OIDC_TOKEN is available. Slopcamera never stores or prints the token.
PNG, JPEG, and WebP responses are signature-checked and published atomically.

Code mode searches and executes a fixed semantic registry. Execute accepts
typed JSON for one exact owned operation code; it never evaluates source text.

MCP preserves root-relative check_diagram/render_diagram and adds closed
search_slopcamera/execute_slopcamera registry tools. It uses built-in assets, never
executes workspace config or caller code, and writes protocol messages only to
stdout.
`;
function parseArguments(args, valueOptions) {
  const positionals = [];
  const options = {};
  const flags = new Set;
  for (let index = 0;index < args.length; index += 1) {
    const argument = args[index];
    if (argument === undefined)
      continue;
    if (!argument.startsWith("--")) {
      positionals.push(argument);
      continue;
    }
    const name = argument.slice(2);
    if (!valueOptions.has(name)) {
      flags.add(name);
      continue;
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`--${name} requires a value`);
    }
    options[name] = value;
    index += 1;
  }
  return { positionals, options, flags };
}
function requiredPositional(parsed, index, label) {
  const value = parsed.positionals[index];
  if (value === undefined)
    throw new Error(`Missing ${label}`);
  return value;
}
function requiredOption(parsed, name) {
  const value = parsed.options[name];
  if (value === undefined)
    throw new Error(`--${name} is required`);
  return value;
}
function parsePositiveInteger(value, name) {
  if (value === undefined)
    return;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return parsed;
}
function parseDuotone(value) {
  if (value === undefined)
    return;
  const colors = value.split(",").map((color) => color.trim());
  if (colors.length !== 2 || colors.some((color) => !/^#[a-f0-9]{3}(?:[a-f0-9]{3})?$/iu.test(color))) {
    throw new Error("--duotone must contain two #rgb or #rrggbb colors separated by a comma");
  }
  return [colors[0], colors[1]];
}
function printFindings(findings) {
  if (findings.length === 0) {
    console.log("No diagram lint findings.");
    return;
  }
  console.warn(`${findings.length} diagram lint finding${findings.length === 1 ? "" : "s"}:`);
  for (const finding of findings) {
    console.warn(`  [${finding.code}] ${finding.message}`);
  }
}
var starter = {
  $schema: "https://raw.githubusercontent.com/hraness/slopcamera/main/schema/diagram.schema.json",
  version: 1,
  name: "example-flow",
  canvas: { width: 960, height: 540, padding: 64 },
  layout: { type: "stack", direction: "horizontal", gap: 160, align: "center" },
  shapes: [
    {
      id: "source",
      type: "rect",
      width: 240,
      height: 160,
      label: "Source",
      icon: "document",
      tone: "blue"
    },
    {
      id: "result",
      type: "rect",
      width: 240,
      height: 160,
      label: "Result",
      icon: "check",
      tone: "green"
    }
  ],
  edges: [{ id: "source-result", from: "source", to: "result" }]
};
function hostAdmissionOptions(dependencies) {
  return dependencies.hostResourceCoordinator === undefined ? {} : { hostResourceCoordinator: dependencies.hostResourceCoordinator };
}
function canonicalArguments(args) {
  const [surface, subcommand, ...rest] = args;
  if (surface === "diagram") {
    if (subcommand === "init" || subcommand === "check" || subcommand === "render") {
      return [subcommand, ...rest];
    }
    throw new Error("Use slopcamera diagram init, check, or render");
  }
  if (surface === "image") {
    if (subcommand === "vectorize" || subcommand === "generate") {
      return [subcommand, ...rest];
    }
    throw new Error("Use slopcamera image vectorize or generate");
  }
  if (surface === "init" || surface === "check" || surface === "render" || surface === "vectorize" || surface === "generate") {
    throw new Error(`The flat \`${surface}\` command moved to a namespaced Slopcamera surface.

${help}`);
  }
  return args;
}
async function main(args, dependencies = {}) {
  const [command, ...rest] = canonicalArguments(args);
  if (command === undefined || command === "help" || command === "--help" || command === "-h") {
    console.log(help);
    return;
  }
  if (command === "version" || command === "--version" || command === "-v") {
    console.log(slopcameraCliVersion);
    return;
  }
  if (command === "init") {
    const parsed = parseArguments(rest, new Set);
    const filePath = resolve(parsed.positionals[0] ?? "diagram.diagram.json");
    if (await pathExists(filePath))
      throw new Error(`Refusing to overwrite existing file: ${filePath}`);
    await writeFile(filePath, `${JSON.stringify(starter, null, 2)}
`);
    console.log(`Created ${filePath}`);
    return;
  }
  if (command === "check") {
    const parsed = parseArguments(rest, new Set(["config"]));
    const result = await withSlopcameraOperationHostAdmission("slopcamera.diagram.check", async () => await checkDiagramFile({
      filePath: requiredPositional(parsed, 0, "diagram file"),
      ...parsed.options.config === undefined ? {} : { configPath: parsed.options.config }
    }), hostAdmissionOptions(dependencies));
    console.log(`Valid diagram${result.configPath === null ? "" : ` with ${result.configPath}`}.`);
    printFindings(result.findings);
    if (parsed.flags.has("strict") && result.findings.length > 0)
      process.exitCode = 2;
    return;
  }
  if (command === "render") {
    const parsed = parseArguments(rest, new Set(["out-dir", "config", "scale"]));
    const scale = parsed.options.scale === undefined ? undefined : Number.parseFloat(parsed.options.scale);
    const result = await withSlopcameraOperationHostAdmission("slopcamera.diagram.render", async () => await renderDiagramFile({
      filePath: requiredPositional(parsed, 0, "diagram file"),
      ...parsed.options["out-dir"] === undefined ? {} : { outDirectory: parsed.options["out-dir"] },
      ...parsed.options.config === undefined ? {} : { configPath: parsed.options.config },
      ...scale === undefined ? {} : { scale }
    }), hostAdmissionOptions(dependencies));
    console.log(artifactSummary(result.artifacts));
    printFindings(result.findings);
    return;
  }
  if (command === "vectorize") {
    const parsed = parseArguments(rest, new Set(["output", "duotone", "alpha-cutoff", "timeout-ms"]));
    const unknownFlags = [...parsed.flags].filter((flag) => flag !== "json");
    if (unknownFlags.length > 0) {
      throw new Error(`Unknown vectorize option: --${unknownFlags[0]}`);
    }
    if (parsed.positionals.length > 1) {
      throw new Error("slopcamera image vectorize accepts exactly one raster input");
    }
    const output = requiredOption(parsed, "output");
    if (!output.toLowerCase().endsWith(".svg")) {
      throw new Error("--output must end in .svg");
    }
    const alphaCutoff = parsePositiveInteger(parsed.options["alpha-cutoff"], "alpha-cutoff");
    const timeoutMs = parsePositiveInteger(parsed.options["timeout-ms"], "timeout-ms");
    const duotone = parseDuotone(parsed.options.duotone);
    const result = await withSlopcameraOperationHostAdmission("slopcamera.image.vectorize", async (lease) => await (dependencies.vectorize ?? vectorizeImage)(requiredPositional(parsed, 0, "raster image"), {
      ...alphaCutoff === undefined ? {} : { alphaCutoff },
      ...duotone === undefined ? {} : { duotone },
      ...timeoutMs === undefined ? {} : { limits: { maxDurationMs: timeoutMs } },
      inheritedFileDescriptors: [lease.inheritedFileDescriptor],
      outputPath: output
    }), hostAdmissionOptions(dependencies));
    if (parsed.flags.has("json")) {
      (dependencies.log ?? console.log)(JSON.stringify({ ...result.receipt, outputPath: result.outputPath }, null, 2));
    } else {
      (dependencies.log ?? console.log)(`Vectorized ${result.receipt.width}\xD7${result.receipt.height} with ` + `${result.receipt.profile}/${result.receipt.representation}: ${result.outputPath}`);
    }
    return;
  }
  if (command === "generate") {
    const parsed = parseArguments(rest, new Set(["model", "output"]));
    const unknownFlags = [...parsed.flags].filter((flag) => flag !== "json");
    if (unknownFlags.length > 0) {
      throw new Error(`Unknown generate option: --${unknownFlags[0]}`);
    }
    if (parsed.positionals.length !== 1) {
      throw new Error("slopcamera image generate accepts exactly one prompt");
    }
    const model = parsed.options.model ?? slopcameraImageModels[1];
    if (model.length > 256 || !/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/iu.test(model)) {
      throw new Error("--model must be a bounded Vercel AI Gateway provider/model id");
    }
    const result = await withSlopcameraOperationHostAdmission("slopcamera.image.generate", async () => await (dependencies.generate ?? generateSlopcameraImageFile)({
      model,
      prompt: requiredPositional(parsed, 0, "prompt"),
      outputPath: requiredOption(parsed, "output")
    }), hostAdmissionOptions(dependencies));
    if (parsed.flags.has("json")) {
      (dependencies.log ?? console.log)(JSON.stringify(result, null, 2));
    } else {
      (dependencies.log ?? console.log)(`Generated ${result.mediaType} with ${result.model}: ${result.outputPath} (${result.bytes} bytes, request ${result.requestId})`);
    }
    return;
  }
  if (command === "code") {
    const [subcommand, ...subcommandArgs] = rest;
    if (subcommand === "search") {
      const parsed = parseArguments(subcommandArgs, new Set(["limit"]));
      if (parsed.flags.size > 0 || parsed.positionals.length > 1) {
        throw new Error("Use slopcamera code search [query] [--limit <number>]");
      }
      const limit = parsePositiveInteger(parsed.options.limit, "limit") ?? slopcameraOperationCodes.length;
      const operations = searchSlopcameraOperations(parsed.positionals[0] ?? "", limit);
      console.log(JSON.stringify({ operations }, null, 2));
      return;
    }
    if (subcommand === "execute") {
      const parsed = parseArguments(subcommandArgs, new Set(["input"]));
      if (parsed.flags.size > 0 || parsed.positionals.length !== 1) {
        throw new Error("Use slopcamera code execute <operation> --input <JSON>");
      }
      const requestedOperation = parsed.positionals[0];
      const operation = isSlopcameraOperationCode(requestedOperation) ? requestedOperation : undefined;
      if (operation === undefined) {
        throw new Error(`Unknown Slopcamera operation code: ${requestedOperation}`);
      }
      const inputText = requiredOption(parsed, "input");
      if (Buffer.byteLength(inputText, "utf8") > 64 * 1024) {
        throw new Error("--input JSON must be no more than 65536 UTF-8 bytes");
      }
      let input;
      try {
        input = JSON.parse(inputText);
      } catch {
        throw new Error("--input must be valid JSON");
      }
      const result = await executeSlopcameraOperation(operation, input, {
        ...hostAdmissionOptions(dependencies)
      });
      (dependencies.log ?? console.log)(JSON.stringify({ operation, result }, null, 2));
      return;
    }
    throw new Error("Use slopcamera code search [query] or slopcamera code execute <operation> --input <JSON>");
  }
  if (command === "mcp") {
    const parsed = parseArguments(rest, new Set(["root"]));
    if (parsed.positionals.length > 0 || parsed.flags.size > 0) {
      throw new Error("slopcamera mcp accepts only --root <workspace>");
    }
    await runMcpServer({
      rootDirectory: requiredOption(parsed, "root"),
      serverVersion: slopcameraCliVersion
    });
    return;
  }
  if (command === "doctor") {
    console.log(`slopcamera ${slopcameraCliVersion}`);
    console.log(`Bun ${process.versions.bun ?? "not detected"}`);
    console.log("Headless diagram SVG/PNG/tldraw renderer ready");
    console.log(process.platform === "win32" ? "Local raster-to-SVG vectorizer unavailable on Windows (fails closed with tool_platform)" : "Local raster-to-SVG vectorizer ready without authentication (VTracer downloads on first use)");
    console.log("Root-relative MCP check/render server ready (trusted local workspace)");
    const gateway = slopcameraGatewayCredentialStatus();
    console.log(gateway.available ? `Vercel AI Gateway ready via ${gateway.source}` : "Vercel AI Gateway requires AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN");
    return;
  }
  if (command === "skill") {
    const [subcommand, ...subcommandArgs] = rest;
    if (subcommand === "path") {
      const { bundledSkillPath } = await import("./skill-install-dh0ntqba.js");
      console.log(bundledSkillPath());
      return;
    }
    if (subcommand === "install") {
      const parsed = parseArguments(subcommandArgs, new Set(["target", "scope", "project"]));
      const target = parsed.options.target ?? "codex";
      const scope = parsed.options.scope ?? "user";
      if (!["codex", "claude", "agents"].includes(target)) {
        throw new Error("--target must be codex, claude, or agents");
      }
      if (!["user", "project"].includes(scope)) {
        throw new Error("--scope must be user or project");
      }
      const destination = await installSkill({
        target,
        scope,
        ...parsed.options.project === undefined ? {} : { projectDirectory: parsed.options.project },
        force: parsed.flags.has("force")
      });
      console.log(`Installed slopcamera skill at ${destination}`);
      return;
    }
    throw new Error("Use slopcamera skill path or install");
  }
  throw new Error(`Unknown command: ${command}

${help}`);
}
if (import.meta.main) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
export {
  slopcameraCliVersion,
  main
};
