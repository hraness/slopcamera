import { lstatSync } from "node:fs";
import { join } from "node:path";

import {
  defineRegistry,
  HranessError,
  okEnvelope,
  runCli as runRegistryCli,
  type CliIO,
  type ErrorCode,
  type Registry,
  type Verb,
} from "@hraness/desktop-foundation/registry";
import { chooseMode, renderSnapshot, runTui, type TuiIO } from "@hraness/desktop-foundation/tui";

import { SLOPCAMERA_VERSION } from "../../../src/version";
import { listOutputs, OUTPUTS_LIMIT, statusEnvelope, statusViews, STATUS_SCHEMA, type StatusOutputs } from "./desktop-status";
import type { ProcessRunner } from "./io";
import { CliError } from "./errors";
import { BunProcessRunner } from "./io";
import { readMenubarStatus } from "./menubar-status";
import { inspectLegacyLogin, retireLegacyLogin, type RetireDependencies } from "./legacy-login";
import { outputsDirectory } from "./outputs";
import { defaultCliStateRoot } from "./paths";
import { CLI_VERBS, type VerbRow } from "./verbs";

/**
 * The verbs `slopcamera` answers through the desktop-foundation registry:
 * `status`, `tui`, `commands`, `legacy retire` and `outputs list|open|reveal`.
 * Every other verb keeps its own parser in `args.ts`; the registry still
 * lists it with its class so `commands --json` covers the whole CLI.
 */
export const PRODUCT = "slopcamera";
export const OUTPUTS_LIST_LIMIT = 200;

/** First words (and `outputs` sub-verbs) the registry answers. */
export function isRegistryCommand(argv: readonly string[]): boolean {
  const [first, second] = argv;
  if (first === "status" || first === "tui" || first === "commands" || first === "legacy") return true;
  return first === "outputs" && (second === "list" || second === "open" || second === "reveal");
}

export interface RegistryDependencies {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly platform: NodeJS.Platform;
  readonly now: () => Date;
  readonly stateRoot?: string;
  readonly version?: string;
  readonly runner?: ProcessRunner;
  readonly retire?: RetireDependencies;
  readonly stdoutIsTerminal?: boolean;
  readonly tuiIo?: TuiIO;
}

function stateRootOf(deps: RegistryDependencies): string {
  return deps.stateRoot ?? defaultCliStateRoot(deps.platform, deps.env);
}

/** Loads everything `status` and `tui` show. Reads only; creates nothing. */
export function loadStatus(deps: RegistryDependencies) {
  const stateRoot = stateRootOf(deps);
  return statusEnvelope({
    version: deps.version ?? SLOPCAMERA_VERSION,
    status: readMenubarStatus(stateRoot),
    outputs: listOutputs(outputsDirectory(stateRoot), OUTPUTS_LIMIT),
    legacyLogin: inspectLegacyLogin(deps.env.HOME),
    now: deps.now(),
  });
}

function schemaFor(path: readonly string[]): string {
  return `${PRODUCT}.${path.join(".")}/1`;
}

/**
 * One output by its file name, as `outputs list` prints it. Only a plain
 * name of a regular, visible file directly in the outputs folder is
 * accepted, so the verb can never open anything else.
 */
export function outputPath(root: string, name: string | undefined): string {
  if (name === undefined || name === "") throw new HranessError("usage", "Name one output, as `slopcamera outputs list` prints it.");
  if (name.includes("/") || name.includes("\\") || name.startsWith(".") || name.includes("\0") || name.length > 255) {
    throw new HranessError("usage", "Give the output's file name only, as `slopcamera outputs list` prints it.");
  }
  const path = join(root, name);
  let regular = false;
  try {
    regular = lstatSync(path).isFile();
  } catch {
    regular = false;
  }
  if (!regular) {
    throw new HranessError("not-found", `No output named ${JSON.stringify(name)}.`, undefined, [
      { command: `${PRODUCT} outputs list --json`, why: "List the outputs by name.", audience: "agent" },
    ]);
  }
  return path;
}

async function finder(deps: RegistryDependencies, argv: readonly [string, ...string[]]): Promise<void> {
  if (deps.platform !== "darwin") {
    throw new HranessError("unsupported-platform", "Opening Finder works on macOS only. Nothing opened.", undefined, [
      { command: `${PRODUCT} outputs --json`, why: "Print the outputs folder to open it yourself.", audience: "agent" },
    ]);
  }
  const result = await (deps.runner ?? new BunProcessRunner()).run(argv, { maxOutputBytes: 4_096 });
  if (result.exitCode !== 0) throw new HranessError("internal", "Finder didn't open. Try again.");
}

interface OutputsListData {
  readonly root: string;
  readonly total: number;
  readonly outputs: StatusOutputs["latest"];
}

interface OpenedData {
  readonly opened: string;
  readonly reveal: boolean;
}

// defineRegistry takes a heterogeneous verb list typed Verb<any, any>[] upstream.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function implemented(deps: RegistryDependencies): Verb<any, any>[] {
  const stateRoot = () => stateRootOf(deps);
  const status: Verb<Record<string, never>, number> = {
    path: ["status"],
    opClass: "read",
    schema: STATUS_SCHEMA,
    summary: "What Slopcamera is doing, credits, newest outputs and old login items",
    output: "raw",
    input: () => ({}),
    async run(_input, ctx) {
      const envelope = loadStatus(deps);
      if (ctx.json) {
        ctx.io.stdout.write(`${JSON.stringify(envelope)}\n`);
      } else if (envelope.ok) {
        ctx.io.stdout.write(renderSnapshot(statusViews(deps.now), envelope.data));
        for (const next of envelope.next ?? []) ctx.io.stdout.write(`next: ${next.command}  (${next.why})\n`);
      }
      return 0;
    },
  };
  const tui: Verb<{ snapshot: boolean; width?: number }, number> = {
    path: ["tui"],
    opClass: "read",
    schema: STATUS_SCHEMA,
    summary: "The status screen; --snapshot prints it once, --json prints the status",
    flags: ["snapshot"],
    valueFlags: ["width"],
    usage: "[--snapshot|--json] [--width N]",
    output: "raw",
    input(argv) {
      if (argv.positionals.length > 0) throw new HranessError("usage", "tui takes no arguments.");
      const width = argv.flags.width;
      if (width === undefined) return { snapshot: argv.flags.snapshot === true };
      if (typeof width !== "string" || !/^[0-9]{1,4}$/u.test(width) || Number(width) < 20 || Number(width) > 400) {
        throw new HranessError("usage", "--width takes a number of columns from 20 to 400.");
      }
      return { snapshot: argv.flags.snapshot === true, width: Number(width) };
    },
    async run(input, ctx) {
      const mode = chooseMode(ctx.json, input.snapshot, deps.stdoutIsTerminal ?? process.stdout.isTTY === true);
      return await runTui({
        load: async () => loadStatus(deps),
        views: statusViews(deps.now),
        mode,
        ...(input.width === undefined ? {} : { width: input.width }),
        io: deps.tuiIo ?? { stdout: { write: (text: string) => ctx.io.stdout.write(text), ...(process.stdout.columns === undefined ? {} : { columns: process.stdout.columns }) }, stdin: process.stdin },
      });
    },
  };
  const legacyRetire: Verb<Record<string, never>, { retired: { label: string; from: string; to: string }[]; loginItem: ReturnType<typeof inspectLegacyLogin> }> = {
    path: ["legacy", "retire"],
    opClass: "operate",
    schema: schemaFor(["legacy", "retire"]),
    summary: "Stop the old menu bar opening at login, keeping its file",
    input(argv) {
      if (argv.positionals.length > 0) throw new HranessError("usage", "legacy retire takes no arguments.");
      return {};
    },
    async run() {
      if (deps.platform !== "darwin") return { retired: [], loginItem: { state: "none" } };
      const retired = await retireLegacyLogin(deps.env.HOME, deps.retire ?? {});
      return { retired, loginItem: inspectLegacyLogin(deps.env.HOME) };
    },
    text(output) {
      const moved = output.retired.map(item => `Moved ${item.from} to ${item.to}. The old menu bar no longer opens at login.`);
      if (output.loginItem.state === "not-ours") moved.push("A menu bar login item was changed outside Slopcamera, so it was left alone.");
      return moved.length === 0 ? "Nothing to retire. The old menu bar doesn't open at login." : moved.join("\n");
    },
  };
  const outputsList: Verb<Record<string, never>, OutputsListData> = {
    path: ["outputs", "list"],
    opClass: "read",
    schema: schemaFor(["outputs", "list"]),
    summary: "List the files in the outputs folder, newest first",
    input(argv) {
      if (argv.positionals.length > 0) throw new HranessError("usage", "outputs list takes no arguments.");
      return {};
    },
    async run() {
      const listed = listOutputs(outputsDirectory(stateRoot()), OUTPUTS_LIST_LIMIT);
      return { root: listed.root, total: listed.total, outputs: listed.latest };
    },
    text(output) {
      if (output.outputs.length === 0) return `No outputs yet in ${output.root}`;
      return output.outputs.map(item => `${item.name}\t${item.bytes}\t${item.modifiedAt}`).join("\n");
    },
  };
  const openVerb = (reveal: boolean): Verb<{ name?: string }, OpenedData> => ({
    path: ["outputs", reveal ? "reveal" : "open"],
    opClass: "operate",
    schema: schemaFor(["outputs", reveal ? "reveal" : "open"]),
    summary: reveal ? "Show one output in Finder" : "Open the outputs folder, or one output, on this Mac",
    usage: reveal ? "<name>" : "[<name>]",
    input(argv) {
      if (argv.positionals.length > 1) throw new HranessError("usage", "Name at most one output.");
      const name = argv.positionals[0];
      if (reveal && name === undefined) throw new HranessError("usage", "Name the output to show, as `slopcamera outputs list` prints it.");
      return name === undefined ? {} : { name };
    },
    async run(input) {
      const root = outputsDirectory(stateRoot());
      if (input.name === undefined) {
        let folder = false;
        try {
          folder = lstatSync(root).isDirectory();
        } catch {
          folder = false;
        }
        if (!folder) {
          throw new HranessError("not-found", "There's no outputs folder yet. Agents create it when they save their first output.", undefined, [
            { command: `${PRODUCT} outputs --json`, why: "Create the outputs folder and print its path.", audience: "agent" },
          ]);
        }
        await finder(deps, ["/usr/bin/open", "--", root]);
        return { opened: root, reveal: false };
      }
      const path = outputPath(root, input.name);
      await finder(deps, reveal ? ["/usr/bin/open", "-R", "--", path] : ["/usr/bin/open", "--", path]);
      return { opened: path, reveal };
    },
    text(output) {
      return output.reveal ? `Showed ${output.opened} in Finder.` : `Opened ${output.opened}.`;
    },
  });
  return [status, tui, legacyRetire, outputsList, openVerb(false), openVerb(true)];
}

/** A verb `args.ts` parses and runs; the registry only lists it. */
function listed(row: VerbRow): Verb<unknown, unknown> {
  return {
    path: row.path,
    opClass: row.opClass,
    schema: schemaFor(row.path),
    summary: row.summary,
    input: () => {
      throw new HranessError("internal", `slopcamera ${row.path.join(" ")} is run by the main parser.`);
    },
    run: async () => undefined,
  };
}

/** The shared envelope codes a Slopcamera error keeps as is. */
const SHARED_CODES = new Set<ErrorCode>(["usage", "not-found", "conflict", "internal"]);

/**
 * Answers a Slopcamera application error with a declared envelope code: the
 * shared code when there is one, otherwise `slopcamera.<code>`. Without this
 * the registry reports every such error as an unexpected internal failure.
 */
export function asHranessError(error: unknown): unknown {
  if (!(error instanceof CliError)) return error;
  const shared = error.code as ErrorCode;
  const code: ErrorCode = SHARED_CODES.has(shared) ? shared : `${PRODUCT}.${error.code}`;
  return new HranessError(code, error.message);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withDeclaredErrors(verb: Verb<any, any>): Verb<any, any> {
  return {
    ...verb,
    input(argv) {
      try {
        return verb.input(argv);
      } catch (error) {
        throw asHranessError(error);
      }
    },
    async run(input, ctx) {
      try {
        return await verb.run(input, ctx);
      } catch (error) {
        throw asHranessError(error);
      }
    },
  };
}

export function slopcameraRegistry(deps: RegistryDependencies): Registry {
  const own = implemented(deps).map(withDeclaredErrors);
  const ownPaths = new Set(own.map(verb => verb.path.join(" ")));
  return defineRegistry(PRODUCT, [
    ...own,
    ...CLI_VERBS.filter(row => !ownPaths.has(row.path.join(" "))).map(listed),
  ]);
}

/** Runs a registry command line and returns its exit status. */
export async function runRegistry(argv: readonly string[], io: CliIO, deps: RegistryDependencies): Promise<number> {
  return await runRegistryCli(slopcameraRegistry(deps), argv, io);
}

export { okEnvelope };
