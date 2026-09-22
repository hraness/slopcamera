/** Retain, bind, and run one native showcase. Native source executes as your user. */
import { dirname, join, resolve } from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const sources = dirname(fileURLToPath(import.meta.url))
const root = resolve(sources, '../../..')
const names = ['product', 'character', 'cloth', 'fluid', 'cad', 'education']
const [inputName, ...runtime] = process.argv.slice(2)
const name = inputName ?? ""
if (!names.includes(name ?? '') || runtime.length !== 2 ||
    runtime[0] !== (['cad', 'education'].includes(name) ? '--python' : '--blender-bin')) {
  throw new Error('Usage: bun examples/showcase/native/render.ts <product|character|cloth|fluid|cad|education> <--blender-bin|--python> <absolute-runtime-path>')
}
const out = join(root, 'artifacts/showcase/native', name)
await mkdir(out, { recursive: true })
async function cli(label: string, arguments_: string[]) {
  const argv = [process.execPath, join(root, 'apps/desktop/dist/cli/main.js'), ...arguments_, '--json']
  const start = Date.now()
  const process_ = Bun.spawn(argv, { cwd: root, stdout: 'pipe', stderr: 'pipe' })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process_.stdout).text(), new Response(process_.stderr).text(), process_.exited,
  ])
  await writeFile(join(out, `${label}.stdout.json`), stdout)
  await writeFile(join(out, `${label}.stderr.txt`), stderr)
  await writeFile(join(out, `${label}.command.json`), JSON.stringify({ argv, exitCode, milliseconds: Date.now() - start }, null, 2) + '\n')
  if (exitCode !== 0) throw new Error(`${label} failed; inspect ${out}`)
  const result = JSON.parse(stdout)
  console.log(JSON.stringify({ label, exitCode, milliseconds: Date.now() - start }))
  return result
}
const bundle = await cli('bundle', ['studio', 'bundle', join(sources, name, 'source.json')])
const job = JSON.parse(await readFile(join(sources, name, 'job.json'), 'utf8'))
job.bundleSha256 = bundle.bundleSha256
// A new job ID preserves the earlier receipt if the source or parameters changed.
job.jobId = `studio_showcase_${name}_${Date.now()}`
const bound = join(out, 'bound.job.json')
await writeFile(bound, JSON.stringify(job, null, 2) + '\n')
await cli('plan', ['studio', 'plan', bound])
await cli('probe', ['studio', 'probe', bound, ...runtime])
const result = await cli('run', ['studio', 'run', bound, '--allow-trusted-code', ...runtime])
if (result.document?.state !== 'succeeded' || result.document?.custody !== 'closed') throw new Error('Native job did not close successfully')
console.log(JSON.stringify({ jobId: job.jobId, receipt: result.receipt, outputCount: result.outputs?.length }))
