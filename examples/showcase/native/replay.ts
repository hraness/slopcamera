/** Render a completed cloth/liquid cache in a fresh, script-disabled native process. */
import { dirname, join, resolve } from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const [inputName, flag, blender] = process.argv.slice(2)
const name = inputName ?? ""
if (!['cloth', 'fluid'].includes(name ?? '') || flag !== '--blender-bin' || !blender) {
  throw new Error('Usage: bun examples/showcase/native/replay.ts <cloth|fluid> --blender-bin <absolute-runtime-path>')
}
const out = join(root, 'artifacts/showcase/native', name)
const bake = JSON.parse(await readFile(join(out, 'run.stdout.json'), 'utf8'))
if (bake.document?.state !== 'succeeded' || bake.document?.custody !== 'closed') throw new Error('A completed, closed bake receipt is required')
if (!/^[a-zA-Z0-9_-]{1,160}$/.test(bake.document.jobId)) throw new Error('Invalid retained job identity')
const expectedReceipt = join(root, 'artifacts/slopcamera/private/studio/jobs', bake.document.jobId, 'receipt.json')
if (resolve(root, bake.receipt.path) !== expectedReceipt) throw new Error('Receipt path does not match its retained job')
const sourceRoot = join(dirname(expectedReceipt), 'outputs')
const files = bake.document.outputs.map((file: { path: string }) => file.path)
if (files.length > 512 || !files.includes('native/scene.blend') || !files.some((file: string) => file.startsWith('cache/'))) throw new Error('Expected a bounded native scene plus explicit cache files')
const source = join(out, 'replay.source.json')
await mkdir(out, { recursive: true })
await writeFile(source, JSON.stringify({ engine: 'blender', entrypoint: { kind: 'blend', path: 'native/scene.blend' }, files }, null, 2) + '\n')
async function cli(label: string, args: string[]) {
  const argv = [process.execPath, join(root, 'apps/desktop/dist/cli/main.js'), ...args, '--json']
  const start = Date.now(), child = Bun.spawn(argv, { cwd: root, stdout: 'pipe', stderr: 'pipe' })
  const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  await writeFile(join(out, `${label}.stdout.json`), stdout)
  await writeFile(join(out, `${label}.stderr.txt`), stderr)
  await writeFile(join(out, `${label}.command.json`), JSON.stringify({ argv, exitCode, milliseconds: Date.now() - start }, null, 2) + '\n')
  if (exitCode !== 0) throw new Error(`${label} failed; inspect ${out}`)
  console.log(JSON.stringify({ label, exitCode, milliseconds: Date.now() - start }))
  return JSON.parse(stdout)
}
const bundle = await cli('replay-bundle', ['studio', 'bundle', source, '--source-root', sourceRoot])
const job = JSON.parse(await readFile(join(out, 'bound.job.json'), 'utf8'))
job.bundleSha256 = bundle.bundleSha256
job.jobId = `studio_showcase_${name}_replay_${Date.now()}`
job.stage = 'render'
job.engine.device = 'gpu'
job.engine.samples = 32
job.render.width = 1280
job.render.height = name === 'cloth' ? 800 : 960
job.limits.timeoutSeconds = 900
job.outputs = [{ kind: 'sequence', id: 'beauty', role: 'beauty', format: 'png', pathPattern: 'frames/%06d.png', interpretation: { kind: 'raster', semantic: 'color', colorSpace: 'srgb', dataType: 'uint8', channels: ['R', 'G', 'B'], alpha: 'opaque', unit: 'unitless' } }]
const bound = join(out, 'replay.job.json')
await writeFile(bound, JSON.stringify(job, null, 2) + '\n')
await cli('replay-probe', ['studio', 'probe', bound, '--blender-bin', blender])
const result = await cli('replay-run', ['studio', 'run', bound, '--allow-trusted-code', '--blender-bin', blender])
if (result.document?.state !== 'succeeded' || result.document?.custody !== 'closed') throw new Error('Fresh replay did not close successfully')
console.log(JSON.stringify({ jobId: job.jobId, receipt: result.receipt, frames: result.document.outputs.length }))
