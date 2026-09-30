#!/usr/bin/env bun
import { fileURLToPath } from "node:url";
import type { CliUpdateOptions, StartupResult } from "@hraness/cli-update";
import { SLOPCAMERA_VERSION } from "../../../src/version";
import { slopcameraUpdatePolicy } from "./update-policy";

type EntryPorts = {
  update(options: CliUpdateOptions): Promise<StartupResult>;
  main(): Promise<void>;
};

export async function runSlopcameraEntrypoint(argv = process.argv.slice(2), ports: Partial<EntryPorts> = {}): Promise<void> {
  const main = ports.main ?? (async () => (await import("./main")).runMainEntrypoint({}, true));
  // Compiled private binaries and their embedded workers keep the native installer.
  if (import.meta.path.includes("$bunfs")) { await main(); return; }
  // The product renders its own command help; the updater sees an inert help request.
  const gateArgv = argv[0] === "update" && argv.slice(1).some(arg => arg === "--help" || arg === "-h")
    ? ["help", "update"] : argv;
  const update = await (ports.update ?? (async options => (await import("@hraness/cli-update")).runCliUpdate(options)))({
    packageName: "@hraness/slopcamera", version: SLOPCAMERA_VERSION, binName: "slopcamera",
    entrypoint: fileURLToPath(import.meta.url), argv: gateArgv,
    provider: { kind: "github", repository: "hraness/slopcamera", assetName: "hraness-slopcamera-{version}.tgz" },
    ...slopcameraUpdatePolicy(gateArgv),
    verifyArtifact: async artifact => (await import("./update-verification")).verifySlopcameraUpdate(artifact),
  });
  if (update.handled) { process.exitCode = update.exitCode; return; }
  try { await main(); }
  finally { await update.release(); }
}

if (import.meta.main) await runSlopcameraEntrypoint();
