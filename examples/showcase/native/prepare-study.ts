/** Validate a pending native study and optionally prepare fresh job documents.
 * This helper never spawns a process, bundles into Studio storage, or renders.
 */
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { parseStudioJob, parseStudioSourceBundle, planStudioJob, StudioPathSchema, studioSourceBundleSha256 } from "../../../src/studio";

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, "../../..");
const [name, mode, ...rest] = process.argv.slice(2);
if ((name !== "focus-study" && name !== "color-alpha-study") || (mode !== "--check" && mode !== "--write-jobs") || rest.length) {
  throw new Error("Usage: bun examples/showcase/native/prepare-study.ts <focus-study|color-alpha-study> <--check|--write-jobs>");
}
const sourceRoot = join(directory, name);
const descriptor = z.strictObject({ engine: z.literal("blender"), entrypoint: z.strictObject({ kind: z.literal("python"), path: StudioPathSchema }), files: z.array(StudioPathSchema) })
  .parse(JSON.parse(await readFile(join(sourceRoot, "source.json"), "utf8")));
const files = [];
for (const path of descriptor.files) {
  const physical = join(sourceRoot, path);
  const info = await lstat(physical);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 1024 * 1024) throw new Error("Study inputs must be bounded regular source files");
  const bytes = await readFile(physical);
  files.push({ path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
}
const bundle = parseStudioSourceBundle({ kind: "slopcamera.studio-source-bundle", schemaVersion: 1, engine: descriptor.engine, entrypoint: descriptor.entrypoint, files });
const bundleSha256 = studioSourceBundleSha256(bundle);
const names = (await readdir(join(sourceRoot, "jobs"))).filter(path => path.endsWith(".json")).sort();
const plans = [];
for (const filename of names) {
  const job = parseStudioJob(JSON.parse(await readFile(join(sourceRoot, "jobs", filename), "utf8")));
  if (job.bundleSha256 !== bundleSha256) throw new Error("Source changed: review and rebind the exact study job templates before preparing execution");
  const plan = planStudioJob({ bundle, job });
  plans.push({ filename, plan });
}
if (plans.length !== (name === "focus-study" ? 4 : 1)) throw new Error("Unexpected study job count");
if (bundle.files.reduce((sum, file) => sum + file.bytes, 0) > 1024 * 1024) throw new Error("Study source exceeds one MiB");
let outputDirectory: string | null = null;
const preparedJobs = [];
if (mode === "--write-jobs") {
  const nonce = randomUUID().replaceAll("-", "");
  const parent = join(root, "artifacts/showcase/native/pending-studies");
  await mkdir(parent, { recursive: true });
  outputDirectory = join(parent, name + "-" + nonce);
  await mkdir(outputDirectory);
  await writeFile(join(outputDirectory, "source-manifest.json"), JSON.stringify(bundle, null, 2) + "\n", { flag: "wx" });
  for (const { filename, plan } of plans) {
    const job = parseStudioJob({ ...plan.job, jobId: plan.job.jobId + "_" + nonce });
    const path = join(outputDirectory, filename);
    await writeFile(path, JSON.stringify(job, null, 2) + "\n", { flag: "wx" });
    preparedJobs.push({ path, jobId: job.jobId, frames: plan.frameCount });
  }
}
console.log(JSON.stringify({ status: "source-checked-native-render-pending", executed: false,
  sourceRoot, descriptorPath: join(sourceRoot, "source.json"), bundleSha256, sourceBytes: bundle.files.reduce((sum, file) => sum + file.bytes, 0),
  plans: plans.map(({ filename, plan }) => ({ filename, jobId: plan.job.jobId, frameCount: plan.frameCount, outputCount: plan.outputCount, readiness: plan.readiness })),
  outputDirectory, preparedJobs,
  next: "Review source, retain the exact source via studio bundle, then explicitly probe/run only the selected prepared job under your native scheduler. Do not run the focus film before reviewing its three smoke frames." }, null, 2));
