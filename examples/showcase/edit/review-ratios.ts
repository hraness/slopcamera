/** Render bounded composition-review stills from the actual project graph. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, statfs } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { ProjectRenderPlanV1Schema } from '../../../apps/desktop/contracts'
import { buildProjectFfmpegInvocation } from '../../../apps/desktop/cli/project-renderer'
const directory = process.argv[2]!
assert.ok(directory && /^artifacts\/showcase\/edit\/ratio-directed-[a-f0-9]{16}$/.test(directory))
const prepared = await Bun.file(`${directory}/prepare.json`).json()
assert.ok(Array.isArray(prepared.projects) && prepared.projects.length === 4)
assert.equal(new Set(prepared.projects.map((project: { id: unknown }) => project.id)).size, 4)
const ffmpeg = Bun.which('ffmpeg')!, ffprobe = Bun.which('ffprobe')!, rsvg = Bun.which('rsvg-convert')!
assert.ok(ffmpeg && ffprobe && rsvg)
async function run(argv: readonly string[]) {
  const child = Bun.spawn([...argv], { stdout: 'pipe', stderr: 'pipe' })
  const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  return { stdout, stderr, exitCode }
}
const version = await run([rsvg, '--version'])
assert.equal(version.exitCode, 0)
for (const project of prepared.projects) {
  assert.ok(['landscape', 'portrait', 'square', 'feed-portrait'].includes(project.id))
  assert.ok(typeof project.projectId === 'string' && /^project_[a-z0-9_]+$/.test(project.projectId))
  const out = resolve(directory, 'stills', project.id)
  await mkdir(out, { recursive: true })
  const disk = await statfs(out)
  assert.ok(disk.bavail * disk.bsize >= 1024 ** 3, 'Composition review requires at least 1 GiB of free disk space')
  const request = await Bun.file(`${directory}/${project.id}-plan.json`).json()
  const plan = ProjectRenderPlanV1Schema.parse(request.plan)
  assert.equal(plan.projectId, project.projectId)
  assert.equal(plan.output.durationUs, 4_900_000)
  assert.equal(plan.output.frameRate, 24)
  const built = await buildProjectFfmpegInvocation(plan, {
    ffmpeg, ffprobe, rsvgConvert: rsvg, rsvgConvertVersion: version.stdout.trim(),
    projectDirectory: resolve('artifacts/slopcamera/projects', project.projectId), repositoryRoot: process.cwd(),
    outputPath: resolve('artifacts/slopcamera/projects', project.projectId, 'renders/preflight-unused.mp4'),
    workspaceDirectory: out, runner: { run },
  })
  const originalGraph = built.argv[built.argv.indexOf('-filter_complex_script') + 1]!
  const graph = (await readFile(originalGraph, 'utf8')).trim() + ";[video_out]select='eq(n,0)+eq(n,59)+eq(n,117)'[selected];[primary_audio]anullsink\n"
  const graphPath = join(out, 'selected.ffgraph')
  await writeFile(graphPath, graph)
  const prefix = built.argv.slice(0, built.argv.indexOf('-map'))
  prefix[prefix.indexOf('-filter_complex_script') + 1] = graphPath
  const argv = [...prefix, '-map', '[selected]', '-an', '-fps_mode', 'vfr', '-frames:v', '3', '-c:v', 'png', join(out, 'frame-%02d.png')]
  const result = await run(argv)
  await writeFile(join(out, 'stderr.txt'), result.stderr)
  await writeFile(join(out, 'receipt.json'), JSON.stringify({
    method: 'Selected frames from the actual project renderer graph before final encoding; this is feasibility evidence, not an official project render receipt.',
    frames: [0, 59, 117], planSha256: plan.planSha256, sourceGraph: originalGraph,
    selectedGraphSha256: createHash('sha256').update(graph).digest('hex'), argv, exitCode: result.exitCode,
  }, null, 2) + '\n')
  assert.equal(result.exitCode, 0, result.stderr.slice(-1200))
  console.log(JSON.stringify({ id: project.id, out }))
}
