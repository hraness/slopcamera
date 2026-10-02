import { runSlopcameraOilPaintFile, type SlopcameraOilPaintFileInput } from "./oil-paint.js"
import { slopcameraOilPaintLimits } from "./oil-paint-model.js"
import { reportUsefulResult, type UsefulResultObserver } from "./support-completion.js"
import { resolve } from "node:path"

export interface SlopcameraOilPaintCliDependencies {
  readonly cwd?: () => string
  readonly log?: (value: string) => void
  readonly onUsefulResult?: UsefulResultObserver
}

function option(args: readonly string[], name: string): string | undefined {
  const indexes = args.flatMap((value, index) => value === name ? [index] : [])
  if (indexes.length > 1) throw new Error(`${name} may be supplied at most once`)
  const index = indexes[0]
  if (index === undefined) return undefined
  const value = args[index + 1]
  if (value === undefined || value.startsWith("--")) throw new Error(`${name} requires a value`)
  return value
}

function rejectOptions(args: readonly string[], allowed: readonly string[]): void {
  for (const value of args) {
    if (value.startsWith("--") && !allowed.includes(value)) {
      throw new Error(`Unknown oil-paint option: ${value}`)
    }
  }
}

function positionalArguments(
  args: readonly string[],
  valueOptions: readonly string[],
): readonly string[] {
  const positionals: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index]!
    if (value === "--json") continue
    if (valueOptions.includes(value)) {
      index += 1
      continue
    }
    if (!value.startsWith("--")) positionals.push(value)
  }
  return positionals
}

/** `image oil-paint` is file-based: no provider or workspace code is loaded. */
export async function runSlopcameraOilPaintCli(
  args: readonly string[],
  dependencies: SlopcameraOilPaintCliDependencies = {},
): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    (dependencies.log ?? console.log)(slopcameraOilPaintCliHelp)
    return
  }
  rejectOptions(args, ["--output", "--log", "--replay", "--json"])
  const replay = option(args, "--replay")
  const output = option(args, "--output")
  const log = option(args, "--log")
  const json = args.includes("--json")
  if (args.filter(value => value === "--json").length > 1) {
    throw new Error("--json may be supplied at most once")
  }
  const positionals = positionalArguments(args, ["--output", "--log", "--replay"])
  if (output === undefined) throw new Error("slopcamera image oil-paint requires --output <file.ppm>")
  if (positionals.length > 1) {
    throw new Error("Use slopcamera image oil-paint <spec.json> --output <file.ppm> [--log <file.json>] [--json]")
  }
  if (replay === undefined && positionals.length !== 1) {
    throw new Error("Use slopcamera image oil-paint <spec.json> --output <file.ppm> [--log <file.json>] [--json]")
  }
  if (replay !== undefined && positionals.length !== 0) {
    throw new Error("--replay cannot be combined with a source positional")
  }
  const cwd = dependencies.cwd ?? process.cwd
  const resolvePath = (path: string): string => resolve(cwd(), path)
  const input: SlopcameraOilPaintFileInput = {
    outputPath: resolvePath(output),
    ...(replay === undefined
      ? { inputPath: resolvePath(positionals[0]!) }
      : { replayPath: resolvePath(replay) }),
    ...(log === undefined ? {} : { logPath: resolvePath(log) }),
  }
  const result = await runSlopcameraOilPaintFile(input)
  const line = json
    ? JSON.stringify({ command: "slopcamera.image.oilpaint", ...result }, null, 2)
    : `Oil paint ${result.width}×${result.height}, ${result.strokes} strokes, ${result.clockSteps} clock steps: ${result.outputPath}`
      + (result.logPath === null ? "" : `\nReplay log: ${result.logPath}`)
  ;(dependencies.log ?? console.log)(line)
  reportUsefulResult(dependencies.onUsefulResult)
}

export const slopcameraOilPaintCliHelp = `  slopcamera image oil-paint <spec.json> --output <file.ppm> [--log <file.json>] [--json]\n    replay: slopcamera image oil-paint --replay <log.json> --output <file.ppm> [--json]\n    bounds: ${slopcameraOilPaintLimits.widthMax}×${slopcameraOilPaintLimits.heightMax} canvas, ${slopcameraOilPaintLimits.maxStrokes} strokes, ${slopcameraOilPaintLimits.maxLayers} layers, ${slopcameraOilPaintLimits.maxBristles} bristles`
