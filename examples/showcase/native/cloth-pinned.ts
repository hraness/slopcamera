/** Separate pinned bake and script-disabled replay; never overwrites the free-cloth cache. */
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const [flag, blender] = process.argv.slice(2)
if (flag !== '--blender-bin' || !blender) throw new Error('Usage: bun examples/showcase/native/cloth-pinned.ts --blender-bin <absolute-runtime-path>')
const stamp = Date.now(), out = join(root, 'artifacts/showcase/native/cloth-pinned-' + stamp)
await mkdir(out, { recursive: true })
async function cli(label: string, args: string[]) {
  const argv = [process.execPath, join(root, 'apps/desktop/dist/cli/main.js'), ...args, '--json']
  const start = Date.now(), child = Bun.spawn(argv, { cwd: root, stdout: 'pipe', stderr: 'pipe' })
  const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  await writeFile(join(out, label + '.stdout.json'), stdout)
  await writeFile(join(out, label + '.stderr.txt'), stderr)
  await writeFile(join(out, label + '.command.json'), JSON.stringify({ argv, exitCode, milliseconds: Date.now() - start }, null, 2) + '\n')
  if (exitCode !== 0) throw new Error(label + ' failed: ' + stderr.slice(-1000))
  const result = JSON.parse(stdout)
  console.log(JSON.stringify({ label, exitCode, milliseconds: Date.now() - start }))
  return result
}
const originalBundle = await cli('source-bundle', ['studio', 'bundle', join(root, 'examples/showcase/native/cloth/source.json')])
const bakeJob = JSON.parse(await readFile(join(root, 'examples/showcase/native/cloth-pinned/job.json'), 'utf8'))
bakeJob.bundleSha256 = originalBundle.bundleSha256
bakeJob.jobId = 'studio_showcase_cloth_pinned_' + stamp
await writeFile(join(out, 'planned.job.json'), JSON.stringify(bakeJob, null, 2) + '\n')
const baked = await cli('bake', ['studio', 'run', join(out, 'planned.job.json'), '--blender-bin', blender, '--allow-trusted-code'])
if (baked.document.state !== 'succeeded' || baked.document.custody !== 'closed') throw new Error('Pinned bake incomplete')
const sourceRoot = join(root, dirname(baked.receipt.path), 'outputs')
const evidence = JSON.parse(await readFile(join(sourceRoot, 'cache/cloth/bake-evidence.json'), 'utf8'))
if (!evidence.isBaked || evidence.pins.length !== 40 || evidence.pins.some((frame: any) => frame.positions.length !== 2)) throw new Error('Pinned bake facts incomplete')
await writeFile(join(out, 'bake-evidence.json'), JSON.stringify({ receipt: baked.receipt, ...evidence }, null, 2) + '\n')
const source = join(out, 'replay.source.json')
await writeFile(source, JSON.stringify({ engine: 'blender', entrypoint: { kind: 'blend', path: 'native/scene.blend' }, files: baked.document.outputs.map((file: any) => file.path) }, null, 2) + '\n')
const bundle = await cli('replay-bundle', ['studio', 'bundle', source, '--source-root', sourceRoot])
const job = JSON.parse(await readFile(join(out, 'planned.job.json'), 'utf8'))
job.jobId = 'studio_showcase_cloth_pinned_replay_' + stamp
job.bundleSha256 = bundle.bundleSha256
job.stage = 'render'
job.engine.device = 'gpu'
job.engine.samples = 32
job.render.width = 1280
job.render.height = 800
job.limits = { timeoutSeconds: 900, maximumOutputBytes: 134217728, maximumOutputFiles: 40 }
job.outputs = [{ kind: 'sequence', id: 'beauty', role: 'beauty', format: 'png', pathPattern: 'frames/%06d.png', interpretation: { kind: 'raster', semantic: 'color', colorSpace: 'srgb', dataType: 'uint8', channels: ['R', 'G', 'B'], alpha: 'opaque', unit: 'unitless' } }]
await writeFile(join(out, 'bound.job.json'), JSON.stringify(job, null, 2) + '\n')
const replay = await cli('run', ['studio', 'run', join(out, 'bound.job.json'), '--blender-bin', blender, '--allow-trusted-code'])
if (replay.document.state !== 'succeeded' || replay.document.custody !== 'closed' || replay.document.outputs.length !== 40) throw new Error('Pinned replay incomplete')
console.log(JSON.stringify({ bakeReceipt: baked.receipt, replayReceipt: replay.receipt, physicalFrames: 40, pinFrames: evidence.pins.length }))
