import { rm, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

// Emit the shared implementation once. Each api/**/*.js remains a distinct
// Vercel Function, retaining its own handler, limiter, duration and routing.
// Worker-based SDK operations such as vectorize are not hosted; api-build.test
// guards that admission boundary. Widening it requires emitting those workers.
const root = resolve(import.meta.dir, "..")
const outdir = resolve(root, ".api-build")
await rm(outdir, { recursive: true, force: true })
const result = await Bun.build({
  entrypoints: [resolve(root, "apps/api/src/vercel.ts")],
  outdir,
  target: "node",
  format: "esm",
  packages: "external",
  sourcemap: "external",
})
if (!result.success) throw new AggregateError(result.logs, "API JavaScript emit failed")
// Keep JS wrappers checked against the original implementation signatures,
// rather than inferring types from generated code or dropping their checks.
await writeFile(resolve(outdir, "vercel.d.ts"), 'export { handleVercelRequest, queryValue } from "../apps/api/src/vercel.js"\n')
console.log(`API implementation emitted once (${result.outputs.length} files); function boundaries unchanged.`)
