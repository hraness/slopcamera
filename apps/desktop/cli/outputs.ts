import { dirname, join, sep } from "node:path";

import type { CliIo } from "./io";
import { writeJson, writeLine } from "./io";
import { ensurePrivateDirectory } from "./paths";

/** The directory agents write user-facing outputs into. */
export function outputsDirectory(stateRoot: string): string {
  const productRoot = stateRoot.endsWith(`${sep}cli`) ? dirname(stateRoot) : stateRoot;
  return join(productRoot, "outputs");
}

/** `slopcamera outputs`: creates the private outputs folder and prints its path. */
export async function reportOutputsRoot(io: CliIo, stateRoot: string, asJson: boolean): Promise<void> {
  const directory = outputsDirectory(stateRoot);
  await ensurePrivateDirectory(directory);
  if (asJson) writeJson(io, { outputs: directory });
  else writeLine(io, directory);
}
