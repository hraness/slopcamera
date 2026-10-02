#!/usr/bin/env bun

import { main as coreMain, slopcameraCliVersion, type SlopcameraCliDependencies } from "./cli-core.js"
import { runSlopcameraOilPaintCli, slopcameraOilPaintCliHelp } from "./oil-paint-cli.js"
import { showProductSupportInvitation, standaloneSupportEnvironment } from "./support.js"

export { slopcameraCliVersion }
export type { SlopcameraCliDependencies }

export async function main(args: readonly string[] = process.argv.slice(2), dependencies: SlopcameraCliDependencies = {}): Promise<void> {
  if (args[0] === "image" && args[1] === "oil-paint") {
    await runSlopcameraOilPaintCli(args.slice(2), {
      ...(dependencies.log === undefined ? {} : { log: dependencies.log }),
      ...(dependencies.onUsefulResult === undefined ? {} : { onUsefulResult: dependencies.onUsefulResult }),
    })
    return
  }
  await coreMain(args, dependencies)
  if ((args[0] === "--help" || args[0] === "-h") && dependencies.log === undefined) console.log(`\n${slopcameraOilPaintCliHelp}`)
}

if (import.meta.main) {
  try {
    const env = standaloneSupportEnvironment()
    let usefulResult = false
    await main(process.argv.slice(2), { supportEnvironment: env, onUsefulResult: () => { usefulResult = true } })
    if (usefulResult && (process.exitCode ?? 0) === 0) await showProductSupportInvitation({ env })
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
