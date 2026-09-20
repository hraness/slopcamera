/** Assemble an actual successful native job, then revise and deliver its project. */
import assert from "node:assert/strict"
import { mkdir, readFile, writeFile } from "node:fs/promises"

const jobId = process.argv[2]
assert.ok(jobId && /^studio_[A-Za-z0-9_-]+$/.test(jobId), "Pass the successful product studio job ID")
const output = "artifacts/showcase/edit"
await mkdir(output, { recursive: true })
const resume = process.argv[3] === "--resume"
if (resume) {
  const started = JSON.parse(await readFile(`${output}/started.json`, "utf8"))
  assert.equal(started.jobId, jobId, "Resume must target the original native job")
} else {
  await writeFile(`${output}/started.json`, JSON.stringify({ jobId, startedAt: new Date().toISOString() }) + "\n", { flag: "wx" })
}
async function cli(label: string, args: readonly string[]): Promise<Record<string, any>> {
  const argv = [process.execPath, "apps/desktop/cli/main.ts", ...args, "--json"]
  if (resume && await Bun.file(`${output}/${label}.command.json`).exists()) {
    const previous = await Bun.file(`${output}/${label}.command.json`).json()
    assert.deepEqual(previous.argv, argv, "A resumed step must use the exact successful request")
    assert.equal(previous.exitCode, 0, "Inspect a failed attempt and use a separately named recovery step")
    return JSON.parse(await readFile(`${output}/${label}.json`, "utf8"))
  }
  const child = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
  ])
  await writeFile(`${output}/${label}.json`, stdout)
  await writeFile(`${output}/${label}.stderr.txt`, stderr)
  await writeFile(`${output}/${label}.command.json`, JSON.stringify({ argv, exitCode }, null, 2) + "\n")
  assert.equal(exitCode, 0, `${label} failed; inspect the retained evidence`)
  return JSON.parse(stdout)
}
const assembly = await cli("assemble", ["studio", "assemble", jobId, "--output-id", "beauty", "--name", "Optical study — editable delivery"])
const project = assembly.projectId
assert.ok(typeof project === "string" && project.startsWith("project_"), "Assembly did not return a project")
const before = JSON.parse(await readFile(`artifacts/slopcamera/projects/${project}/project.json`, "utf8"))
assert.equal(before.placements.length, 1)
const placement = before.placements[0]
assert.equal(placement.video.length, 1)
assert.equal(placement.video[0].presentation.fit, "contain", "Preserve geometry across export formats")
await cli("trim", ["project", "edit", project, "trim", "0.25s", "5.75s"])
await cli("cut", ["project", "edit", project, "cut", "2.5s", "2.75s"])
await cli("speed", ["project", "edit", project, "speed", "4s", "5.75s", "1.25"])
await cli("push-centered", ["project", "edit", project, "camera", "push", "--placement", placement.placementId,
  "--stream", placement.video[0].streamId, "--from", "0.25s", "--to", "5.75s", "--center", "0.5,0.5", "--start-zoom", "1", "--end-zoom", "1.04", "--easing", "ease-in-out"])
await cli("label-sized", ["project", "edit", project, "overlay", "add", "--kind", "svg", "--source", "examples/showcase/edit/delivery-label.svg",
  "--from", "0.25s", "--to", "5.75s", "--anchor", "bottom-left", "--position", "24,-24", "--width", "240", "--height", "60"])
await cli("landscape-plan", ["project", "render", "plan", project, "--width", "1280", "--height", "720", "--fps", "24", "--output", "renders/edit-preview.mp4"])
const inputPath = `${output}/social-variants.input.json`
await writeFile(inputPath, JSON.stringify({ project, tier: "preview", maximumBytes: 64 * 1024 * 1024, outputDirectory: "renders/showcase-social" }, null, 2) + "\n")
await cli("workflow-plan", ["workflows", "plan", "social-variants", "--input", inputPath])
const run = await cli("workflow-run", ["workflows", "run", "social-variants", "--input", inputPath, "--jobs", "2"])
console.log(JSON.stringify({ project, output, sourceJob: jobId, runId: run.summary.runId, status: run.summary.status, pause: run.pause, review: "Inspect all four real outputs before publication; this example is silent." }))

assert.equal(run.summary.status, "completed", "Inspect this retained run and authorize its exact pending plan before using runs resume; exit zero is not completed rendering.")
