import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { join, relative, resolve } from "node:path"
import { checkDiagramFile, readDiagramFile, renderDiagramFile } from "@hraness/slopcamera"

// Run from the repository root. This recipe only reads these two fixed sources
// and their configs; each invocation writes into a fresh ignored directory.
const directory = "examples/showcase/diagram/production-pipeline"
const cases = [
  { name: "production-pipeline", config: "baseline.config.json" },
  { name: "production-pipeline-themed", config: "themed.config.json" },
] as const
const fontDirectory = "src/assets/fonts/nebula-sans"
const inputs = [
  ...cases.flatMap(({ name, config }) => [`${directory}/${name}.diagram.json`, `${directory}/${config}`]),
  `${directory}/render.ts`, `${directory}/README.md`,
  ...["Book", "Bold"].flatMap((face) => ["otf", "woff2"].map((extension) => `${fontDirectory}/NebulaSans-${face}.${extension}`)),
  `${fontDirectory}/LICENSE.txt`, `${fontDirectory}/PROVENANCE.md`,
  "bun.lock", "package.json",
  ...["artifacts", "config", "icons", "label-layout", "layout", "lint", "parse", "render", "theme", "tldr", "types"].map((name) => `src/${name}.ts`),
]
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")
async function fingerprint(path: string) {
  const bytes = await readFile(path)
  return { path, bytes: bytes.length, sha256: hash(bytes) }
}
const before = await Promise.all(inputs.map(fingerprint))
const sources = await Promise.all(cases.map(({ name }) => readDiagramFile(`${directory}/${name}.diagram.json`)))
const geometry = sources.map(({ spec }) => ({
  canvas: spec.canvas,
  shapes: spec.shapes.map((shape) => {
    assert.ok(shape.type === "rect")
    return { id: shape.id, x: shape.x, y: shape.y, width: shape.width, height: shape.height, radius: shape.radius, label: shape.label, tone: shape.tone }
  }),
  edges: spec.edges,
}))
assert.deepEqual(geometry[0], geometry[1], "The treatment must preserve all labels, geometry, roles and connections")
for (const { name, config } of cases) {
  const check = await checkDiagramFile({ filePath: `${directory}/${name}.diagram.json`, configPath: `${directory}/${config}` })
  assert.deepEqual(check.findings, [], `${name} must pass the same zero-finding criterion as CLI --strict`)
}

await mkdir("artifacts/showcase/diagram", { recursive: true })
const outputDirectory = await mkdtemp("artifacts/showcase/diagram/production-pipeline-")
const outputs = []
let totalBytes = 0
for (const { name, config } of cases) {
  const result = await renderDiagramFile({
    filePath: `${directory}/${name}.diagram.json`, configPath: `${directory}/${config}`,
    outDirectory: outputDirectory, scale: 1,
  })
  assert.deepEqual(result.findings, [])
  const artifacts = []
  for (const [kind, path] of Object.entries(result.artifacts)) {
    if (kind === "spec") continue
    assert.equal(resolve(path).startsWith(`${resolve(outputDirectory)}/`), true)
    const item = await fingerprint(path)
    assert.ok(item.bytes > 0 && item.bytes <= 2 * 1024 * 1024, `${kind} exceeded the 2 MiB export ceiling`)
    totalBytes += item.bytes
    artifacts.push({ ...item, path: relative(process.cwd(), path), kind })
  }
  assert.equal(artifacts.length, 5)
  outputs.push({ name, config, strictFindings: result.findings, artifacts })
}
assert.ok(totalBytes <= 10 * 1024 * 1024, "The ten exports exceeded the aggregate ceiling")
assert.deepEqual(await Promise.all(inputs.map(fingerprint)), before, "Rendering must not mutate any retained input")
const receipt = {
  schema: "slopcamera.showcase.diagram-pair/v1", bun: Bun.version,
  dimensions: { width: 720, height: 1232, scale: 1 }, inputs: before,
  invariant: geometry[0], outputs, totalBytes,
  review: "pending-independent-light-dark-inspection",
}
await writeFile(join(outputDirectory, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`)
console.log(JSON.stringify({ outputDirectory, exports: 10, totalBytes, review: receipt.review }))
