import { mock } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import type { CliDependencies } from "../../cli/commands";

// Isolated process fixture: retain the actual parser and entrypoint signal
// handlers, replacing expensive command work with one owned async resource.
const root = process.cwd();
const workspace = join(root, "active-command");
mock.module("../../cli/commands", () => ({
  async runCli(_argv: readonly string[], dependencies: CliDependencies) {
    await mkdir(workspace);
    const signal = dependencies.abortSignal;
    const aborted = new Promise<void>(resolve => {
      if (signal?.aborted) resolve();
      else signal?.addEventListener("abort", () => resolve(), { once: true });
    });
    const keepAlive = setInterval(() => {}, 100);
    try {
      await writeFile(join(root, "ready.json"), JSON.stringify({ signal: signal !== undefined }));
      await aborted;
      if (!signal?.aborted) throw new Error("Cancellation never reached command work");
      await delay(25); // Main must await async draining before removing handlers.
      return 130;
    } finally {
      clearInterval(keepAlive);
      await rm(workspace, { recursive: true });
      await writeFile(join(root, "cleanup.json"), JSON.stringify({ aborted: signal?.aborted, reason: signal?.reason?.code }));
    }
  },
}));
const { main } = await import("../../cli/main");
const before = [process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")];
const code = await main(["scene", "render", "scene.json", "--request", "request.json", "--json"]);
await writeFile(join(root, "completed.json"), JSON.stringify({ code, before,
  after: [process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")] }));
process.exitCode = code;
