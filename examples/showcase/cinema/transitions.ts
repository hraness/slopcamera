/** One controlled two-shot comparison, compiled by the actual cinema renderer.
 * Prepare, review all six plans, then render with an explicit reviewed Git SHA.
 * All mutation is confined to a fresh project owned by this recipe identity.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, statfs, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { ProjectCinemaPlanV1Schema, VideoProjectV1Schema } from "../../../apps/desktop/contracts";
import { hashCinemaPlanComposition } from "../../../apps/desktop/core/cinema-plan";
import { hashProjectStructure, hashProjectEditPlan } from "../../../apps/desktop/core/project-plan";
import { canonicalJson } from "../../../apps/desktop/core/canonical-json";
import { createNodeBundleFileSystem, loadProjectCinemaPlan, loadProjectEditPlan, saveProjectCinemaPlan, saveProjectCinemaRevision } from "../../../apps/desktop/core/storage";
import { HtmlSceneInputSchema } from "../../../apps/desktop/html-overlay/scene";

const [jobId, editorialResultPath, phase, expectedRevision, ...extra] = process.argv.slice(2);
assert.ok(jobId && /^studio_[A-Za-z0-9_-]+$/.test(jobId), "Pass the successful product studio job ID");
assert.ok(editorialResultPath && extra.length === 0 && (phase === "prepare" || phase === "render"),
  "Usage: transitions.ts <product-job-id> <editorial-result.json> prepare|render [reviewed-engine-SHA]");
const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const Artifact = z.object({ path: z.string().regex(/^artifacts\/slopcamera\/generated\/html-scenes\/html_[a-z0-9]+\/[A-Za-z0-9_./-]+$/u)
  .refine(path => !path.split("/").some(part => part === "." || part === "..")), bytes: z.number().int().positive().max(32 * 1024 ** 2), sha256: z.string().regex(/^[a-f0-9]{64}$/u) });
const Verification = z.object({ width: z.literal(1280), height: z.literal(720), frameCount: z.literal(192), durationUs: z.literal(8_000_000), audio: z.null() });
async function boundedRead(path: string, maximum: number) {
  const info = await lstat(path);
  assert.ok(info.isFile() && !info.isSymbolicLink() && info.size <= maximum, "Expected a bounded regular file");
  const bytes = await readFile(path);
  assert.equal(bytes.length, info.size, "Input changed while reading");
  return bytes;
}
async function verifyArtifact(input: unknown, maximum: number) {
  const artifact = Artifact.parse(input), bytes = await boundedRead(artifact.path, maximum);
  assert.equal(bytes.length, artifact.bytes); assert.equal(hash(bytes), artifact.sha256);
  return bytes;
}
const result = z.object({ kind: z.literal("slopcamera.html-scene-export"), schemaVersion: z.literal(1), receipt: Artifact,
  source: Artifact, output: Artifact, verification: Verification }).parse(JSON.parse((await boundedRead(editorialResultPath, 64 * 1024)).toString()));
const receipt = z.object({ kind: z.literal("slopcamera.html-scene-receipt"), schemaVersion: z.literal(1), source: Artifact,
  document: Artifact, authoring: Artifact, output: Artifact, verification: Verification })
  .parse(JSON.parse((await verifyArtifact(result.receipt, 64 * 1024)).toString()));
assert.deepEqual(receipt.source, result.source); assert.deepEqual(receipt.output, result.output);
const retainedSource = HtmlSceneInputSchema.parse(JSON.parse((await verifyArtifact(receipt.source, 64 * 1024)).toString()));
const declaredSource = HtmlSceneInputSchema.parse(JSON.parse((await boundedRead("examples/showcase/html/editorial.json", 64 * 1024)).toString()));
assert.deepEqual({ ...retainedSource, document: declaredSource.document }, declaredSource);
assert.ok("path" in retainedSource.document && retainedSource.document.path === receipt.document.path);
const document = await verifyArtifact(receipt.document, 512 * 1024);
assert.equal(hash(document), hash(await boundedRead("examples/showcase/html/editorial.html", 512 * 1024)));
const authoring = JSON.parse((await verifyArtifact(receipt.authoring, 1024 * 1024)).toString());
assert.equal(canonicalJson(authoring), canonicalJson({ kind: "slopcamera.html-overlay", schemaVersion: 1,
  canvas: declaredSource.canvas, timing: declaredSource.timing, libraries: declaredSource.libraries,
  parameters: declaredSource.parameters, resources: [], seed: declaredSource.seed, html: document.toString() }));
await verifyArtifact(result.output, 32 * 1024 ** 2);
const cases = [
  { id: "cut", transition: { kind: "cut" } },
  { id: "dissolve", transition: { kind: "dissolve", durationUs: 500_000 } },
  { id: "wipe", transition: { kind: "wipe", direction: "left", durationUs: 500_000 } },
  { id: "dip", transition: { kind: "dip-to-color", color: "#132720", durationUs: 500_000 } },
  { id: "whip", transition: { kind: "whip-pan", direction: "left", blurSigma: 12, durationUs: 500_000 } },
  { id: "flash", transition: { kind: "light-flash", durationUs: 500_000, peakHoldUs: 0 } },
] as const;
const revision = await run(["git", "rev-parse", "HEAD"]); assert.equal(revision.exitCode, 0);
const engineRevision = revision.stdout.trim();
if (phase === "render") assert.equal(engineRevision, expectedRevision, "Use the explicitly reviewed engine revision");
const clean = await run(["git", "diff", "--quiet", "HEAD", "--", "apps/desktop/cli", "apps/desktop/core", "apps/desktop/contracts", "apps/desktop/application", "src"]);
assert.equal(clean.exitCode, 0, "The renderer, project core and contracts must match the recorded commit");
const sourceSha256 = hash(await readFile(import.meta.filename));
const recipeSha256 = hash(canonicalJson({ jobId, editorialReceipt: result.receipt.sha256, cases, sourceSha256, engineRevision }));
const output = `artifacts/showcase/cinema/transitions-${recipeSha256.slice(0, 16)}`;
await mkdir(output, { recursive: true });
async function run(argv: readonly string[]) {
  assert.ok(argv[0]);
  const child = spawn(argv[0], argv.slice(1), { detached: true, stdio: ["ignore", "pipe", "pipe"] });
  let bytes = 0, failure: Error | undefined, killTimer: ReturnType<typeof setTimeout> | undefined;
  const stdout: Buffer[] = [], stderr: Buffer[] = [];
  const signalGroup = (signal: NodeJS.Signals) => {
    if (!child.pid) return;
    try { process.kill(-child.pid, signal); }
    catch (error) { if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error; }
  };
  const stop = (reason: string) => {
    if (failure) return;
    failure = new Error(reason);
    signalGroup("SIGTERM");
    killTimer = setTimeout(() => signalGroup("SIGKILL"), 3_000);
  };
  const deadline = setTimeout(() => stop("CLI exceeded the ten-minute command deadline"), 600_000);
  const abort = () => stop("Recipe interrupted; collecting its owned child process group");
  process.once("SIGTERM", abort); process.once("SIGINT", abort);
  const collect = (chunks: Buffer[]) => (chunk: Buffer) => {
    bytes += chunk.length;
    if (bytes > 8 * 1024 ** 2) stop("CLI output exceeded eight MiB");
    if (!failure) chunks.push(chunk);
  };
  child.stdout.on("data", collect(stdout)); child.stderr.on("data", collect(stderr));
  try {
    const exitCode = await new Promise<number>((resolve, reject) => {
      child.once("error", reject); child.once("close", code => resolve(code ?? 128));
    });
    const groupExists = () => {
      if (!child.pid) return false;
      try { process.kill(-child.pid, 0); return true; }
      catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ESRCH") return false;
        throw error;
      }
    };
    if (groupExists()) {
      stop("CLI exited with remaining members in its owned process group");
      const collectBy = Date.now() + 6_000;
      while (groupExists() && Date.now() < collectBy) await new Promise(resolve => setTimeout(resolve, 50));
      assert.ok(!groupExists(), "Owned process-group custody remains open after TERM/KILL; inspect before retrying");
    }
    if (failure) throw failure;
    return { stdout: Buffer.concat(stdout).toString(), stderr: Buffer.concat(stderr).toString(), exitCode };
  } finally {
    clearTimeout(deadline); if (killTimer) clearTimeout(killTimer);
    process.removeListener("SIGTERM", abort); process.removeListener("SIGINT", abort);
  }
}
async function cli(label: string, args: readonly string[]) {
  const argv = [process.execPath, "apps/desktop/cli/main.ts", ...args, "--json"];
  const request = `${output}/${label}.command.json`, resultPath = `${output}/${label}.json`;
  if (await Bun.file(request).exists()) {
    const previous = z.object({ argv: z.array(z.string()), exitCode: z.literal(0), resultSha256: z.string() }).parse(await Bun.file(request).json());
    assert.deepEqual(previous.argv, argv, "Only exact successful requests may be reused");
    assert.equal(hash(await boundedRead(resultPath, 8 * 1024 ** 2)), previous.resultSha256);
  } else {
    const executed = await run(argv);
    await writeFile(resultPath, executed.stdout, { flag: "wx" });
    await writeFile(`${output}/${label}.stderr.txt`, executed.stderr, { flag: "wx" });
    await writeFile(request, JSON.stringify({ argv, exitCode: executed.exitCode, resultSha256: hash(executed.stdout) }, null, 2) + "\n", { flag: "wx" });
    assert.equal(executed.exitCode, 0, `${label} failed; preserve and inspect the retained attempt`);
  }
  console.log(JSON.stringify({ label, output }));
  return JSON.parse((await boundedRead(resultPath, 8 * 1024 ** 2)).toString()) as unknown;
}
async function treeBytes(path: string): Promise<number> {
  const info = await lstat(path); assert.ok(!info.isSymbolicLink(), "No symlinks in the owned output tree");
  if (info.isFile()) return info.size;
  let bytes = 0;
  for (const name of await readdir(path)) bytes += await treeBytes(join(path, name));
  return bytes;
}
async function guard(projectRoot?: string) {
  const disk = await statfs(output);
  assert.ok(disk.bavail * disk.bsize >= 1.5 * 1024 ** 3, "Cinema comparison requires 1.5 GiB free before each operation");
  const bytes = await treeBytes(output) + (projectRoot ? await treeBytes(projectRoot) : 0);
  assert.ok(bytes <= 100 * 1024 ** 2, "Cinema comparison exceeds its 100 MiB retained-output budget");
}
await guard();
const assembly = z.object({ projectId: z.string().regex(/^project_[A-Za-z0-9_-]+$/u) }).parse(await cli("assemble", [
  "studio", "assemble", jobId, "--output-id", "beauty", "--name", `Transition study / ${recipeSha256.slice(0, 12)}`,
]));
const projectId = assembly.projectId, projectRoot = `artifacts/slopcamera/projects/${projectId}`;
await guard(projectRoot);
await cli("add-editorial", ["project", "add", projectId, result.output.path, "--role", "b-roll", "--at", "6s"]);
const project = VideoProjectV1Schema.parse(await Bun.file(`${projectRoot}/project.json`).json());
assert.equal(project.placements.length, 2);
const product = project.placements.find(placement => placement.sync.anchors[0]?.projectTimeUs === 0);
const editorial = project.placements.find(placement => placement.sync.anchors[0]?.projectTimeUs === 6_000_000);
assert.ok(product && editorial && product.video.length === 1 && editorial.video.length === 1);
const initialized = z.object({ plan: ProjectCinemaPlanV1Schema }).parse(await cli("cinema-init", ["project", "cinema", "init", projectId]));
const fs = createNodeBundleFileSystem(projectRoot);
const plans = cases.map(item => {
  const raw = ProjectCinemaPlanV1Schema.parse({ ...initialized.plan,
    output: { background: "#132720ff", frameRate: 24, pixelWidth: 960, pixelHeight: 540 },
    shots: [product, editorial].map((placement, index) => ({ shotId: `cshot_transition_${index}`,
      fit: "contain", handles: { preRollUs: 500_000, postRollUs: 500_000 },
      source: { kind: "placement", placementId: placement.placementId, streamId: placement.video[0]!.streamId,
        range: { startUs: index * 6_000_000 + 500_000, endUs: index * 6_000_000 + 2_500_000 } } })),
    transitions: [item.transition], audioCues: [], beats: [], markers: [], looks: [],
  });
  return { id: item.id, plan: ProjectCinemaPlanV1Schema.parse({ ...raw, cinemaPlanSha256: hashCinemaPlanComposition(raw) }) };
});
const allowed = new Set([initialized.plan.cinemaPlanSha256, ...plans.map(item => item.plan.cinemaPlanSha256)]);
const evidence = [];
for (const item of plans) {
  await guard(projectRoot);
  const freshProject = VideoProjectV1Schema.parse(await Bun.file(`${projectRoot}/project.json`).json());
  assert.equal(hashProjectStructure(freshProject), initialized.plan.projectStructureSha256, "The owned project changed after preparation");
  assert.equal(hashProjectEditPlan(await loadProjectEditPlan(fs)), initialized.plan.projectEditPlanSha256, "The owned edit plan changed after preparation");
  const current = await loadProjectCinemaPlan(fs);
  assert.ok(current && allowed.has(current.cinemaPlanSha256), "Refusing to replace a sidecar not owned by this recipe");
  assert.equal(hashCinemaPlanComposition(current), current.cinemaPlanSha256, "Current sidecar is corrupt or edited");
  const contents = canonicalJson(item.plan) + "\n";
  await saveProjectCinemaRevision(fs, contents, hash(contents));
  await saveProjectCinemaPlan(fs, item.plan);
  const retained = `${output}/${item.id}.cinema.json`;
  if (await Bun.file(retained).exists()) assert.equal(await Bun.file(retained).text(), contents);
  else await writeFile(retained, contents, { flag: "wx" });
  await cli(`${item.id}-check`, ["project", "cinema", "check", projectId]);
  const planned = z.object({ planPath: z.string(), plan: z.object({ output: z.object({ durationUs: z.number() }) }).passthrough() })
    .parse(await cli(`${item.id}-plan`, ["project", "cinema", "plan", projectId]));
  assert.equal(planned.plan.output.durationUs, item.id === "cut" ? 4_000_000 : 4_500_000);
  const renderArgs = ["project", "cinema", "run", projectId, "--output", `renders/transition-${item.id}.mp4`];
  await cli(`${item.id}-dry-run`, [...renderArgs, "--dry-run"]);
  const rendered = phase === "render" ? await cli(`${item.id}-render`, renderArgs) : null;
  await guard(projectRoot);
  evidence.push({ id: item.id, cinemaPlanSha256: item.plan.cinemaPlanSha256, planPath: planned.planPath, rendered });
}
const summary = { status: phase === "prepare" ? "plans-await-independent-review" : "rendered-await-all-frame-review",
  phase, recipeSha256, sourceSha256, engineRevision, jobId, editorialReceipt: result.receipt, projectId, evidence };
await writeFile(`${output}/${phase}.json`, JSON.stringify(summary, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, phase, projectId, cases: evidence.length }));
