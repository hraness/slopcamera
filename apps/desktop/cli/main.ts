#!/usr/bin/env bun

import { parseCliArgs } from "./args";
import { runCli } from "./commands";
import { asCliError, CliError, EXIT_CODE } from "./errors";
import { BunProcessRunner, processIo } from "./io";
import { resolveRepositoryPaths } from "./paths";
import {
  canonicalizeUnifiedCliArgs,
  runPortableSurface,
  type PortableSurfaceDependencies,
} from "./portable-surface";

import { rootHelpIntro } from "./root-help-intro";

export function isEmbeddedVectorizeWorkerInvocation(
  argv: readonly string[],
  entrypoint: string = import.meta.path,
): boolean {
  return entrypoint.includes("$bunfs")
    && argv.length === 1
    && argv[0]?.startsWith("/$bunfs/") === true
    && argv[0].endsWith("/vectorize/worker.js");
}

export async function main(
  argv: readonly string[] = process.argv.slice(2),
  portableDependencies: PortableSurfaceDependencies = {},
): Promise<number> {
  if (isEmbeddedVectorizeWorkerInvocation(argv)) {
    // The bundled headless supervisor preserves process isolation by spawning
    // this compiled executable with its virtual worker path. Loading the
    // worker only in that exact internal invocation keeps sharp/VTracer and
    // the bounded stdin protocol inside the shipped artifact.
    await import("../../../src/vectorize/worker.ts");
    return typeof process.exitCode === "number" ? process.exitCode : 0;
  }
  const unifiedArgv = canonicalizeUnifiedCliArgs(argv);
  const portableExitCode = await runPortableSurface(unifiedArgv, portableDependencies);
  if (portableExitCode !== undefined) return portableExitCode;
  const earlyCommand = parseCliArgs(unifiedArgv);
  if (earlyCommand.kind === "help" || earlyCommand.kind === "version" || earlyCommand.kind === "complete") {
    const intro = rootHelpIntro(unifiedArgv, {
      isTTY: process.stdout.isTTY === true, term: process.env.TERM, columns: process.stdout.columns,
    });
    if (intro !== "") processIo.stdout(intro);
    return await runCli(unifiedArgv, { io: processIo });
  }
  const paths = await resolveRepositoryPaths(processIo.cwd(), processIo.env);
  if (earlyCommand.kind === "html-render" || earlyCommand.kind === "spatial-world" || earlyCommand.kind === "directing" || earlyCommand.kind === "studio"
    || earlyCommand.kind === "spatial-scene" && earlyCommand.action === "camera-track") {
    const controller = new AbortController();
    const cancel = () => controller.abort(new CliError("cancelled", "Command interrupted."));
    process.on("SIGINT", cancel);
    process.on("SIGTERM", cancel);
    try {
      return await runCli(unifiedArgv, { io: processIo, paths,
        runner: new BunProcessRunner(), abortSignal: controller.signal });
    } finally {
      process.off("SIGINT", cancel);
      process.off("SIGTERM", cancel);
    }
  }
  return await runCli(unifiedArgv, {
    io: processIo,
    paths,
    runner: new BunProcessRunner(),
  });
}

export async function runMainEntrypoint(
  portableDependencies: PortableSurfaceDependencies = {},
): Promise<void> {
  try {
    process.exitCode = await main(process.argv.slice(2), portableDependencies);
  } catch (error) {
    const failure = asCliError(error);
    process.stderr.write(`slopcamera: ${failure.message}\n`);
    process.exitCode = EXIT_CODE[failure.code];
  }
}

if (import.meta.main) {
  await runMainEntrypoint();
}
