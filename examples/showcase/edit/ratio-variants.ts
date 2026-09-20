/** Four deliberate compositions of one native film, using ordinary project edits.
 * Run prepare first, review selected rendered frames, then run render with the
 * reviewed Git engine revision. This is separate from automatic social-variants.
 */
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile, statfs } from "node:fs/promises"
import { VideoProjectV1Schema } from "../../../apps/desktop/contracts"

const [jobId, phase, expectedRevision] = process.argv.slice(2)
assert.ok(jobId && /^studio_[A-Za-z0-9_-]+$/.test(jobId), "Pass the successful product studio job ID")
assert.ok(phase === "prepare" || phase === "render", "Use prepare or render <reviewed-engine-revision>")
const variants = [
  { id: "landscape", width: 1280, height: 720, zoom: 1, endZoom: 1.04 },
  { id: "portrait", width: 720, height: 1280, zoom: 1.6, endZoom: 1.664 },
  { id: "square", width: 960, height: 960, zoom: 1.25, endZoom: 1.3 },
  { id: "feed-portrait", width: 864, height: 1080, zoom: 1.3, endZoom: 1.352 },
] as const
const frames = await Promise.all(variants.map(async variant => {
  const path = `examples/showcase/edit/ratio-frames/${variant.id}.svg`
  const bytes = await readFile(path)
  return { path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }
}))
const recipeSha256 = createHash("sha256").update(JSON.stringify({ jobId, variants, frames })).digest("hex")
const output = `artifacts/showcase/edit/ratio-directed-${recipeSha256.slice(0, 16)}`
await mkdir(output, { recursive: true })

async function run(argv: readonly string[]) {
  const child = Bun.spawn([...argv], { stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
  ])
  return { stdout, stderr, exitCode }
}
async function cli(label: string, args: readonly string[]): Promise<Record<string, unknown>> {
  const argv = [process.execPath, "apps/desktop/cli/main.ts", ...args, "--json"]
  const request = `${output}/${label}.command.json`
  if (await Bun.file(request).exists()) {
    const prior = await Bun.file(request).json()
    assert.deepEqual(prior.argv, argv, "Only exact successful requests can be reused")
    assert.equal(prior.exitCode, 0, "A failed attempt needs inspection and a new output identity")
  } else {
    const result = await run(argv)
    await writeFile(`${output}/${label}.json`, result.stdout)
    await writeFile(`${output}/${label}.stderr.txt`, result.stderr)
    await writeFile(request, JSON.stringify({ argv, exitCode: result.exitCode }, null, 2) + "\n")
    assert.equal(result.exitCode, 0, `${label} failed; inspect retained evidence`)
  }
  const value: unknown = await Bun.file(`${output}/${label}.json`).json()
  assert.ok(typeof value === "object" && value !== null && !Array.isArray(value), "Expected CLI object")
  console.log(JSON.stringify({ label, output }))
  return value as Record<string, unknown>
}
const revision = await run(["git", "rev-parse", "HEAD"])
assert.equal(revision.exitCode, 0)
const engineRevision = revision.stdout.trim()
if (phase === "render") {
  assert.equal(engineRevision, expectedRevision, "Final rendering must use the explicitly reviewed engine commit")
  const diff = await run(["git", "diff", "--quiet", "HEAD", "--", "apps/desktop/cli/project-renderer.ts"])
  assert.equal(diff.exitCode, 0, "Commit the reviewed renderer before final rendering")
}
const projects: Record<string, unknown>[] = []
for (const variant of variants) {
  const label = variant.id
  const assembly = await cli(`${label}-assemble`, ["studio", "assemble", jobId, "--output-id", "beauty",
    "--name", `Optical study / ${label} / ${recipeSha256.slice(0, 12)}`])
  const projectId = assembly.projectId
  assert.ok(typeof projectId === "string" && projectId.startsWith("project_"))
  const project = VideoProjectV1Schema.parse(await Bun.file(`artifacts/slopcamera/projects/${projectId}/project.json`).json())
  assert.equal(project.placements.length, 1)
  const placement = project.placements[0]!
  assert.equal(placement.video.length, 1)
  const video = placement.video[0]!
  assert.ok(video.presentation.enabled && video.presentation.fit === "contain")
  await cli(`${label}-trim`, ["project", "edit", projectId, "trim", "0.25s", "5.75s"])
  await cli(`${label}-cut`, ["project", "edit", projectId, "cut", "2.5s", "2.75s"])
  await cli(`${label}-speed`, ["project", "edit", projectId, "speed", "4s", "5.75s", "1.25"])
  await cli(`${label}-camera`, ["project", "edit", projectId, "camera", "push", "--placement", placement.placementId,
    "--stream", video.streamId, "--from", "0.25s", "--to", "5.75s", "--center", "0.5,0.5",
    "--start-zoom", String(variant.zoom), "--end-zoom", String(variant.endZoom), "--easing", "ease-in-out"])
  const frame = frames.find(value => value.path.endsWith(`/${label}.svg`))!
  await cli(`${label}-frame`, ["project", "edit", projectId, "overlay", "add", "--kind", "svg", "--source", frame.path,
    "--from", "0.25s", "--to", "5.75s", "--anchor", "center", "--position", "0,0",
    "--width", String(variant.width), "--height", String(variant.height)])
  const options = [projectId, "--width", String(variant.width), "--height", String(variant.height), "--fps", "24",
    "--output", `renders/optical-${label}.mp4`]
  const plan = await cli(`${label}-plan`, ["project", "render", "plan", ...options])
  if (phase === "render") {
    const disk = await statfs(output)
    assert.ok(disk.bavail * disk.bsize >= 1024 ** 3, "Ratio rendering requires at least 1 GiB of free disk space")
  }
  const rendered: Record<string, unknown> | undefined = phase === "render"
    ? await cli(`${label}-render`, ["project", "render", "run", ...options]) : undefined
  if (rendered) assert.equal(rendered.planPath, plan.planPath, "The rendered project changed since composition review")
  projects.push({ ...variant, projectId, frame, planPath: plan.planPath, ...(rendered ? { rendered } : {}) })
}
await writeFile(`${output}/${phase}.json`, JSON.stringify({ jobId, phase, engineRevision, recipeSha256,
  source: { path: "examples/showcase/edit/ratio-variants.ts", sha256: createHash("sha256").update(await readFile(import.meta.filename)).digest("hex") },
  projects, review: "Selected first/middle/last frames precede final renders. Inspect every final frame before publication.",
}, null, 2) + "\n")
console.log(JSON.stringify({ output, phase, projects: projects.map(value => value.projectId) }))
