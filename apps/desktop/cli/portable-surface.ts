import { runSlopcameraOilPaintCli } from "../../../src/oil-paint-cli"
import { canonicalizeUnifiedCliArgs as coreCanonicalizeUnifiedCliArgs, runPortableSurface as runCorePortableSurface } from "./portable-surface-core"
import type { PortableSurfaceDependencies } from "./portable-surface-core"

export type { PortableSurfaceDependencies }

export function canonicalizeUnifiedCliArgs(argv: readonly string[]): readonly string[] {
  return coreCanonicalizeUnifiedCliArgs(argv)
}

/** Keep the oil-paint file command local while preserving the existing headless delegation table. */
export async function runPortableSurface(
  argvInput: readonly string[],
  dependencies: PortableSurfaceDependencies = {},
): Promise<number | undefined> {
  const argv = coreCanonicalizeUnifiedCliArgs(argvInput)
  if (argv[0] === "image" && argv[1] === "oil-paint") {
    await runSlopcameraOilPaintCli(argv.slice(2), {
      ...(dependencies.cwd === undefined ? {} : { cwd: dependencies.cwd }),
      ...(dependencies.log === undefined ? {} : { log: dependencies.log }),
      ...(dependencies.onUsefulResult === undefined ? {} : { onUsefulResult: dependencies.onUsefulResult }),
    })
    return 0
  }
  return await runCorePortableSurface(argv, dependencies)
}
