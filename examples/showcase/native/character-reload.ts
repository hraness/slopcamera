/** Reload the retained native rig; inspect its structure and compare three frames. */
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const [flag, blender, pythonFlag, python] = process.argv.slice(2)
if (flag !== '--blender-bin' || !blender || pythonFlag !== '--python-bin' || !python) {
  throw new Error('Usage: bun examples/showcase/native/character-reload.ts --blender-bin <absolute-runtime> --python-bin <numpy-pillow-python>')
}
const stamp = Date.now()
const base = join(root, 'artifacts/showcase/native/character-reload-' + stamp)
await mkdir(base, { recursive: true })

async function cli(label: string, args: string[]) {
  const argv = [process.execPath, join(root, 'apps/desktop/dist/cli/main.js'), ...args, '--json']
  const start = Date.now()
  const child = Bun.spawn(argv, { cwd: root, stdout: 'pipe', stderr: 'pipe' })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
  ])
  await writeFile(join(base, label + '.stdout.json'), stdout)
  await writeFile(join(base, label + '.stderr.txt'), stderr)
  await writeFile(join(base, label + '.command.json'), JSON.stringify({
    argv, exitCode, milliseconds: Date.now() - start,
  }, null, 2) + '\n')
  if (exitCode !== 0) throw new Error(label + ' failed: ' + stderr.slice(-1000))
  console.log(JSON.stringify({ label, exitCode, milliseconds: Date.now() - start }))
  return JSON.parse(stdout)
}

const original = JSON.parse(await readFile(join(root, 'artifacts/showcase/native/character/run.stdout.json'), 'utf8'))
const originalRoot = join(root, dirname(original.receipt.path))
const native = original.document.outputs.find((output: any) => output.role === 'native-source' && output.format === 'blend')
if (original.document.state !== 'succeeded' || original.document.custody !== 'closed' || !native) {
  throw new Error('Original character source incomplete')
}
if (!/^[a-zA-Z0-9_-]{1,160}$/.test(original.document.jobId) ||
    originalRoot !== join(root, 'artifacts/slopcamera/private/studio/jobs', original.document.jobId) ||
    native.path !== 'native/scene.blend') {
  throw new Error('Unexpected retained character identity or source path')
}
const blend = join(originalRoot, 'outputs', native.path)
const nativeSource = join(base, 'native.source.json')
await writeFile(nativeSource, JSON.stringify({
  engine: 'blender', entrypoint: { kind: 'blend', path: native.path }, files: [native.path],
}, null, 2) + '\n')
const bundle = await cli('native-bundle', ['studio', 'bundle', nativeSource, '--source-root', join(originalRoot, 'outputs')])
const job = JSON.parse(await readFile(join(root, 'artifacts/showcase/native/character/bound.job.json'), 'utf8'))
const samples: any[] = []

for (const frame of [0, 72, 143]) {
  const sample = {
    ...job,
    jobId: 'studio_showcase_character_reload_' + frame + '_' + stamp,
    bundleSha256: bundle.bundleSha256,
    limits: { timeoutSeconds: 120, maximumOutputBytes: 33554432, maximumOutputFiles: 4 },
    render: { ...job.render, startFrame: frame, endFrameExclusive: frame + 1 },
    outputs: job.outputs.filter((output: any) => output.role === 'beauty'),
  }
  const path = join(base, 'frame-' + frame + '.job.json')
  await writeFile(path, JSON.stringify(sample, null, 2) + '\n')
  const run = await cli('frame-' + frame, ['studio', 'run', path, '--blender-bin', blender, '--allow-trusted-code'])
  if (run.document.state !== 'succeeded' || run.document.custody !== 'closed') throw new Error('Reload frame incomplete')
  const file = String(frame).padStart(6, '0') + '.png'
  samples.push({
    frame, receipt: run.receipt,
    original: join(originalRoot, 'outputs/frames', file),
    reloaded: join(root, dirname(run.receipt.path), 'outputs/frames', file),
  })
}

const inspection = join(base, 'inspection-source')
await mkdir(inspection, { recursive: true })
await copyFile(blend, join(inspection, 'character.blend'))
await copyFile(join(root, 'examples/showcase/native/character-reload/inspect.py'), join(inspection, 'inspect.py'))
await writeFile(join(inspection, 'source.json'), JSON.stringify({
  engine: 'blender', entrypoint: { kind: 'python', path: 'inspect.py' }, files: ['inspect.py', 'character.blend'],
}, null, 2) + '\n')
const inspectedBundle = await cli('inspection-bundle', ['studio', 'bundle', join(inspection, 'source.json')])
const inspectionJob = {
  ...job,
  jobId: 'studio_showcase_character_reload_inspect_' + stamp,
  bundleSha256: inspectedBundle.bundleSha256,
  stage: 'build',
  engine: { ...job.engine, device: 'cpu', samples: 1 },
  limits: { timeoutSeconds: 120, maximumOutputBytes: 33554432, maximumOutputFiles: 4 },
  outputs: job.outputs.filter((output: any) => output.role === 'native-source'),
}
await writeFile(join(base, 'inspection.job.json'), JSON.stringify(inspectionJob, null, 2) + '\n')
const inspected = await cli('inspection', [
  'studio', 'run', join(base, 'inspection.job.json'), '--blender-bin', blender, '--allow-trusted-code',
])
if (inspected.document.state !== 'succeeded' || inspected.document.custody !== 'closed') throw new Error('Rig inspection incomplete')
const log = await readFile(join(root, dirname(inspected.receipt.path), 'stdout.log'), 'utf8')
const line = log.split('\n').find(line => line.startsWith('SLOPCAMERA_RELOAD_FACTS='))
if (!line) throw new Error('No retained inspection facts')
await writeFile(join(base, 'rig-facts.json'), JSON.stringify({
  receipt: inspected.receipt,
  sourceReceipt: original.receipt,
  facts: JSON.parse(line.slice('SLOPCAMERA_RELOAD_FACTS='.length)),
}, null, 2) + '\n')
await writeFile(join(base, 'samples.json'), JSON.stringify(samples, null, 2) + '\n')
const compare = Bun.spawn([
  python, join(root, 'examples/showcase/native/character-reload/compare.py'), base,
], { cwd: root, stdout: 'inherit', stderr: 'inherit' })
if (await compare.exited !== 0) throw new Error('Reload pixel comparison failed')
