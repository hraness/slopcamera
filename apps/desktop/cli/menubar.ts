import { lstatSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { CliError } from "./errors";
import type { CliIo } from "./io";
import { writeJson, writeLine } from "./io";
import { ensurePrivateDirectory } from "./paths";

/*
 * `slopcamera menubar` launches the detached Rust status-item binary built
 * from `desktop/menubar`. The binary only reads the per-user outputs
 * directory — agents drop finished artifacts there and the menu renders them
 * newest-first. One status item exists per user; a second launch exits
 * quietly once the runtime lock is held, reported as "already running".
 */

const SETTLE_MS = 400;

/** The directory agents write user-facing outputs into — inside the
 * per-user product root so it survives repository moves. The macOS state
 * root is `Slopcamera/cli`, so outputs sit beside it; other platforms use
 * the state root itself as the product root. */
export function outputsRoot(stateRoot: string): string {
  const productRoot = stateRoot.endsWith(`${sep}cli`) ? dirname(stateRoot) : stateRoot;
  return join(productRoot, "outputs");
}

export function resolveMenubarBinary(
  repositoryRoot: string,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string | null {
  const candidates = [
    environment.SLOPCAMERA_DESKTOP,
    resolve(dirname(process.execPath), "slopcamera-menubar"),
    resolve(repositoryRoot, "desktop", "target", "release", "slopcamera-menubar"),
    resolve(repositoryRoot, "desktop", "target", "debug", "slopcamera-menubar"),
  ];
  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== "" && qualifiedBinary(candidate)) return candidate;
  }
  return null;
}

/** Detached launchers only accept private, prebuilt executables. */
function qualifiedBinary(path: string): boolean {
  try {
    const info = lstatSync(path);
    return info.isFile() && (info.mode & 0o111) !== 0 && (info.mode & 0o022) === 0;
  } catch {
    return false;
  }
}

export async function launchMenubar(
  io: CliIo,
  repositoryRoot: string,
  asJson: boolean,
): Promise<void> {
  const binary = resolveMenubarBinary(repositoryRoot);
  if (binary === null) {
    throw new CliError(
      "unavailable",
      "The Slopcamera menu bar is not installed. Build it with `cargo build --release --manifest-path desktop/Cargo.toml` or set SLOPCAMERA_DESKTOP.",
    );
  }
  let child;
  try {
    child = Bun.spawn([binary], { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
  } catch {
    throw new CliError("unavailable", "The Slopcamera menu bar could not start.");
  }
  child.unref();
  const settled = await Promise.race([
    child.exited.then((code) => code as number | null),
    Bun.sleep(SETTLE_MS).then(() => null),
  ]);
  if (settled !== null && settled !== 0) {
    throw new CliError("unavailable", "The Slopcamera menu bar exited during startup.");
  }
  const alreadyRunning = settled === 0;
  if (asJson) writeJson(io, { running: true, alreadyRunning });
  else writeLine(io, alreadyRunning ? "Slopcamera menu bar is already running." : "Slopcamera menu bar is running.");
}

export async function reportOutputsRoot(
  io: CliIo,
  stateRoot: string,
  asJson: boolean,
): Promise<void> {
  const directory = outputsRoot(stateRoot);
  await ensurePrivateDirectory(directory);
  if (asJson) writeJson(io, { outputs: directory });
  else writeLine(io, directory);
}
