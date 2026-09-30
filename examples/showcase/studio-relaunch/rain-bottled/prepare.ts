/** Create one fresh, bounded native job. This does not start Blender. */
import { randomUUID } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { parseStudioJob } from "../../../../src/studio"

const modes = { opener: [24, 25, 1920, 1080], ending: [300, 301, 1920, 1080], still: [180, 181, 1920, 1080], hero: [110, 111, 1920, 1080], cyclesStill: [110, 111, 1920, 1080], cyclesCpu: [110, 111, 1920, 1080], masterStill: [180, 181, 3840, 2160],
  motion: [168, 176, 1920, 1080], film: [0, 336, 3840, 2160],
  webFilm: [0, 336, 1920, 1080], revision: [172, 173, 1920, 1080] } as const
const [mode, ...extra] = process.argv.slice(2)
if (!mode || !(mode in modes) || extra.length) throw new Error("Usage: bun prepare.ts " + Object.keys(modes).join("|"))
const root = resolve(import.meta.dir, "../../../..")
const source = resolve(import.meta.dir, "source.json")
const out = resolve(root, "artifacts/studio-relaunch/rain-bottled", mode + "-" + randomUUID())
await mkdir(out, { recursive: true })
const argv = [process.execPath, resolve(root, "apps/desktop/cli/main.ts"), "studio", "bundle", source, "--json"]
const child = Bun.spawn(argv, { cwd: root, stdout: "pipe", stderr: "pipe" })
const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
await writeFile(resolve(out, "bundle.json"), stdout, { flag: "wx" })
await writeFile(resolve(out, "bundle-command.json"), JSON.stringify({ argv, exitCode, stderr }, null, 2) + "\n", { flag: "wx" })
if (exitCode !== 0) throw new Error("Source bundle failed; inspect " + out)
const bundle = JSON.parse(stdout)
const [startFrame, endFrameExclusive, width, height] = modes[mode as keyof typeof modes]
const job = parseStudioJob({ kind: "slopcamera.studio-job", schemaVersion: 1,
  jobId: "studio_rain_" + mode + "_" + randomUUID().replaceAll("-", ""), bundleSha256: bundle.bundleSha256,
  stage: "render", parameters: mode === "revision" ? { weather: "amber", rainStrength: .50 } : {},
  engine: { engine: "blender", renderer: mode.startsWith("cycles") ? "cycles" : "eevee", device: mode === "cyclesCpu" ? "cpu" : "gpu", samples: mode === "cyclesCpu" ? 24 : 48, transparent: false,
    viewTransform: "AgX", denoise: mode.startsWith("cycles"), seed: 719 },
  render: { width, height, frameRate: { numerator: 24, denominator: 1 }, startFrame, endFrameExclusive },
  outputs: [ { id: "beauty", role: "beauty", format: "png", kind: "sequence", pathPattern: "frames/%06d.png",
    interpretation: { kind: "raster", colorSpace: "srgb", alpha: "opaque", dataType: "uint8", channels: ["R", "G", "B"], semantic: "color", unit: "unitless" } },
    { id: "native", role: "native-source", format: "blend", kind: "file", path: "native/scene.blend", interpretation: { kind: "native-source" } } ],
  limits: { timeoutSeconds: endFrameExclusive - startFrame > 24 ? 7200 : 900,
    maximumOutputBytes: endFrameExclusive - startFrame > 24 ? 4 * 1024 ** 3 : 512 * 1024 ** 2,
    maximumOutputFiles: endFrameExclusive - startFrame + 2 },
  execution: { trust: "trusted-current-user", isolation: "none", hermetic: false } })
const path = resolve(out, "job.json")
await writeFile(path, JSON.stringify(job, null, 2) + "\n", { flag: "wx" })
console.log(JSON.stringify({ mode, path, jobId: job.jobId, bundleSha256: job.bundleSha256,
  next: "Plan, probe, and run this exact job explicitly. Review the hardest still and motion spike before a film." }, null, 2))
