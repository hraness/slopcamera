#!/usr/bin/env bun
// @bun
import {
  SLOPCAMERA_VERSION,
  artifactSummary,
  checkDiagramFile,
  renderDiagramFile,
  runMcpServer
} from "./index-701s1axp.js";
import {
  installSkill,
  pathExists
} from "./index-7308egqr.js";
import"./index-8txs6fkn.js";
import"./index-ayspp776.js";
import {
  executeSlopcameraOperation,
  generateSlopcameraIcon,
  generateSlopcameraImageGallery,
  isSlopcameraOperationCode,
  parseSlopcameraGalleryVary,
  searchSlopcameraOperations,
  slopcameraGalleryKinds,
  slopcameraGalleryLimits,
  slopcameraIconMaximumRounds,
  slopcameraOperationCodes,
  withSlopcameraOperationHostAdmission
} from "./index-shtrpj4s.js";
import {
  vectorizeImage
} from "./index-9ajx7fzb.js";
import {
  generateSlopcameraImageFile,
  slopcameraGatewayCredentialStatus,
  slopcameraImageModels
} from "./index-231ernwj.js";
import"./index-sh6xbav6.js";
import {
  __require
} from "./index-z1w83f81.js";

// src/cli.ts
import { readFile, writeFile } from "fs/promises";
import { resolve } from "path";

// src/support-completion.ts
function reportUsefulResult(observer) {
  try {
    if (observer !== undefined)
      Promise.resolve(observer()).catch(() => {
        return;
      });
  } catch {}
}

// src/support.ts
import {
  maybeShowSupportInvitation,
  runSupportCommand
} from "@hraness/support-foundation/node";
var supportProfile = {
  id: "slopcamera",
  name: "Slopcamera",
  valueProposition: "Support ongoing development of local visual tools for agents.",
  updates: false
};
function standaloneSupportEnvironment() {
  const env = { ...process.env };
  process.env.HRANESS_SUPPORT_AUDIENCE = "off";
  process.env.HRANESS_SUPPORT_EMAIL = "off";
  return env;
}
async function runProductSupportCommand(args, options = {}) {
  const result = await runSupportCommand(supportProfile, args, {
    command: ["slopcamera"],
    ...options,
    gitEmail: false
  });
  if (result.stdout !== "")
    process.stdout.write(result.stdout);
  if (result.stderr !== "")
    process.stderr.write(result.stderr);
  return result.exitCode;
}
async function showProductSupportInvitation(options = {}) {
  try {
    await maybeShowSupportInvitation(supportProfile, {
      usefulResult: true,
      command: ["slopcamera"],
      ...options,
      gitEmail: false
    });
  } catch {}
}

// src/cli.ts
var slopcameraCliVersion = SLOPCAMERA_VERSION;
var help = `slopcamera ${slopcameraCliVersion}

Turn source material into deterministic diagrams, images, and canvas assets.

Usage:
  slopcamera diagram init [file]
  slopcamera diagram check <file> [--config <file>] [--strict]
  slopcamera diagram render <file> [--out-dir <directory>] [--config <file>] [--scale <number>]
  slopcamera image vectorize <image> --output <file.svg> [--json] [--duotone <#rgb,#rgb>]
  slopcamera image generate <prompt> --output <file.png|jpg|webp> [--model <provider/model>] [--json]
  slopcamera image icon <subject> --output <file.svg> [--model <provider/model>]
    [--ink <#rgb|#rrggbb>] [--rounds <1-${slopcameraIconMaximumRounds}>] [--critique-model <provider/model>]
    [--keep-raster] [--json]
  slopcamera image gallery <subject> --output-dir <directory> [--kind <${slopcameraGalleryKinds.join("|")}>]
    [--count <1-${slopcameraGalleryLimits.candidates}>] [--vary <axis[=v1,v2][;axis...]>] [--candidates <file.json>]
    [--model <provider/model>] [--cell <${slopcameraGalleryLimits.cellEdgeMin}-${slopcameraGalleryLimits.cellEdgeMax}>] [--tile|--no-tile] [--json]
  slopcamera code search [query] [--limit <number>]
  slopcamera code execute <operation> --input <JSON>
  slopcamera mcp --root <workspace>
  slopcamera doctor
  slopcamera support [--json|protocol --json|offer --json|shown <id>|release <id>|dismiss|snooze|enable|status --json]
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

Icon produces isometric line-art SVG: a style-locked Gateway raster is
normalized to canonical ink-on-transparent pixels, traced by the local
vectorizer, and (when --rounds exceeds 1) critiqued by a vision model whose
feedback revises the prompt for the next attempt. Only Slopcamera's own
generated output is uploaded for critique \u2014 never user media.

Gallery generates several bounded candidates in parallel and composes them
into one labelled contact sheet plus a receipt. Use it to review texture,
skybox, backdrop, sprite, or design alternatives, then promote a chosen
candidate file explicitly \u2014 nothing is applied automatically.

Optional support: after useful work, agents can read slopcamera support protocol --json.
Discovery uses stderr without claiming an invitation; HRANESS_SUPPORT_AUDIENCE=off disables it.
No feature requires payment. Imported CLI/SDK calls and probes stay quiet.

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
function parseGalleryVary(value) {
  if (value === undefined)
    return;
  return parseSlopcameraGalleryVary(value);
}
async function readGalleryCandidates(path) {
  const text = await readFile(resolve(path), "utf8");
  if (Buffer.byteLength(text, "utf8") > 64 * 1024) {
    throw new Error("--candidates JSON must be no more than 65536 UTF-8 bytes");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("--candidates must be valid JSON");
  }
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
    if (subcommand === "vectorize" || subcommand === "generate" || subcommand === "icon" || subcommand === "gallery") {
      return [subcommand, ...rest];
    }
    throw new Error("Use slopcamera image vectorize, generate, icon, or gallery");
  }
  if (surface === "init" || surface === "check" || surface === "render" || surface === "vectorize" || surface === "generate") {
    throw new Error(`The flat \`${surface}\` command moved to a namespaced Slopcamera surface.

${help}`);
  }
  return args;
}
async function main(args, dependencies = {}) {
  if (args[0] === "support") {
    process.exitCode = await runProductSupportCommand(args.slice(1), dependencies.supportEnvironment === undefined ? {} : { env: dependencies.supportEnvironment });
    return;
  }
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
    reportUsefulResult(dependencies.onUsefulResult);
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
    reportUsefulResult(dependencies.onUsefulResult);
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
    reportUsefulResult(dependencies.onUsefulResult);
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
    reportUsefulResult(dependencies.onUsefulResult);
    return;
  }
  if (command === "icon") {
    const parsed = parseArguments(rest, new Set(["model", "output", "ink", "rounds", "critique-model"]));
    const unknownFlags = [...parsed.flags].filter((flag) => flag !== "json" && flag !== "keep-raster");
    if (unknownFlags.length > 0) {
      throw new Error(`Unknown icon option: --${unknownFlags[0]}`);
    }
    if (parsed.positionals.length !== 1) {
      throw new Error("slopcamera image icon accepts exactly one subject");
    }
    const output = requiredOption(parsed, "output");
    if (!output.toLowerCase().endsWith(".svg")) {
      throw new Error("--output must end in .svg");
    }
    const model = parsed.options.model ?? slopcameraImageModels[1];
    if (model.length > 256 || !/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/iu.test(model)) {
      throw new Error("--model must be a bounded Vercel AI Gateway provider/model id");
    }
    const critiqueModel = parsed.options["critique-model"];
    if (critiqueModel !== undefined && (critiqueModel.length > 256 || !/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/iu.test(critiqueModel))) {
      throw new Error("--critique-model must be a bounded Vercel AI Gateway provider/model id");
    }
    const ink = parsed.options.ink;
    if (ink !== undefined && !/^#[a-f0-9]{3}(?:[a-f0-9]{3})?$/iu.test(ink)) {
      throw new Error("--ink must be a #rgb or #rrggbb color");
    }
    const rounds = parsePositiveInteger(parsed.options.rounds, "rounds");
    if (rounds !== undefined && rounds > slopcameraIconMaximumRounds) {
      throw new Error(`--rounds must be at most ${slopcameraIconMaximumRounds}`);
    }
    const result = await withSlopcameraOperationHostAdmission("slopcamera.image.icon", async (lease) => await (dependencies.icon ?? generateSlopcameraIcon)({
      keepRaster: parsed.flags.has("keep-raster"),
      model,
      outputPath: output,
      subject: requiredPositional(parsed, 0, "subject"),
      inheritedFileDescriptors: [lease.inheritedFileDescriptor],
      ...critiqueModel === undefined ? {} : { critiqueModel },
      ...ink === undefined ? {} : { ink },
      ...rounds === undefined ? {} : { rounds }
    }), hostAdmissionOptions(dependencies));
    if (parsed.flags.has("json")) {
      (dependencies.log ?? console.log)(JSON.stringify(result, null, 2));
    } else {
      const scored = result.attempts.map((attempt) => attempt.score === undefined ? `#${attempt.round}` : `#${attempt.round}=${attempt.score}`).join(" ");
      (dependencies.log ?? console.log)(`Icon ${result.svgSha256.slice(0, 12)} round ${result.selectedRound}/${result.attempts.length} (${scored}): ${result.outputPath}`);
    }
    return;
  }
  if (command === "gallery") {
    const parsed = parseArguments(rest, new Set(["model", "output-dir", "kind", "count", "vary", "candidates", "cell", "timeout-ms"]));
    const unknownFlags = [...parsed.flags].filter((flag) => flag !== "json" && flag !== "tile" && flag !== "no-tile");
    if (unknownFlags.length > 0) {
      throw new Error(`Unknown gallery option: --${unknownFlags[0]}`);
    }
    if (parsed.flags.has("tile") && parsed.flags.has("no-tile")) {
      throw new Error("--tile and --no-tile are mutually exclusive");
    }
    if (parsed.positionals.length !== 1) {
      throw new Error("slopcamera image gallery accepts exactly one subject");
    }
    const model = parsed.options.model ?? slopcameraImageModels[1];
    if (model.length > 256 || !/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/iu.test(model)) {
      throw new Error("--model must be a bounded Vercel AI Gateway provider/model id");
    }
    const kind = parsed.options.kind;
    if (kind !== undefined && !slopcameraGalleryKinds.includes(kind)) {
      throw new Error(`--kind must be one of: ${slopcameraGalleryKinds.join(", ")}`);
    }
    const count = parsePositiveInteger(parsed.options.count, "count");
    if (count !== undefined && count > slopcameraGalleryLimits.candidates) {
      throw new Error(`--count must be at most ${slopcameraGalleryLimits.candidates}`);
    }
    const cell = parsePositiveInteger(parsed.options.cell, "cell");
    if (cell !== undefined && (cell < slopcameraGalleryLimits.cellEdgeMin || cell > slopcameraGalleryLimits.cellEdgeMax)) {
      throw new Error(`--cell must be between ${slopcameraGalleryLimits.cellEdgeMin} and ${slopcameraGalleryLimits.cellEdgeMax}`);
    }
    const timeoutMs = parsePositiveInteger(parsed.options["timeout-ms"], "timeout-ms");
    const vary = parseGalleryVary(parsed.options.vary);
    const candidates = parsed.options.candidates === undefined ? undefined : await readGalleryCandidates(parsed.options.candidates);
    if (candidates !== undefined && !Array.isArray(candidates)) {
      throw new Error("--candidates JSON must be an array of {id, prompt|variant} entries");
    }
    const result = await withSlopcameraOperationHostAdmission("slopcamera.image.gallery", async () => await (dependencies.gallery ?? generateSlopcameraImageGallery)({
      subject: requiredPositional(parsed, 0, "subject"),
      outputDir: requiredOption(parsed, "output-dir"),
      model,
      ...kind === undefined ? {} : { kind },
      ...count === undefined ? {} : { count },
      ...vary === undefined ? {} : { vary },
      ...candidates === undefined ? {} : { candidates },
      ...cell === undefined ? {} : { cellEdge: cell },
      ...timeoutMs === undefined ? {} : { timeoutMs },
      ...parsed.flags.has("tile") ? { tiled: true } : parsed.flags.has("no-tile") ? { tiled: false } : {}
    }), hostAdmissionOptions(dependencies));
    if (parsed.flags.has("json")) {
      (dependencies.log ?? console.log)(JSON.stringify(result, null, 2));
    } else {
      const rows = result.candidates.map((candidate) => candidate.status === "generated" ? `#${candidate.index} ${candidate.id}	${candidate.path}` : `#${candidate.index} ${candidate.id}	failed`);
      (dependencies.log ?? console.log)(`Gallery ${result.counts.generated}/${result.counts.requested} generated (${result.model}): ${result.gallery.path}
` + `${rows.join(`
`)}
receipt ${result.receiptPath}`);
    }
    reportUsefulResult(dependencies.onUsefulResult);
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
      if (operation === "slopcamera.diagram.render" || operation === "slopcamera.image.vectorize" || operation === "slopcamera.image.generate") {
        reportUsefulResult(dependencies.onUsefulResult);
      }
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
    const env = standaloneSupportEnvironment();
    let usefulResult = false;
    await main(process.argv.slice(2), { supportEnvironment: env, onUsefulResult: () => {
      usefulResult = true;
    } });
    if (usefulResult && (process.exitCode ?? 0) === 0)
      await showProductSupportInvitation({ env });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
export {
  slopcameraCliVersion,
  main
};
