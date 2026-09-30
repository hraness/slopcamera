/** Produce a hash-bound web derivative; retain the native master and receipt.
 * Usage: bun examples/showcase/studio-relaunch/web-preview.ts master.mp4 sha256 fresh-run
 * The derivative still needs visual/audio review before public admission.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { createDefaultHostResourceCoordinator } from "../../../src/host-resources";
import { physicalHostResourceClaims } from "../../../apps/desktop/code/host-resource-policy";

const [inputArg, expectedSha256, run] = process.argv.slice(2);
assert.ok(inputArg && /^[a-f0-9]{64}$/u.test(expectedSha256 ?? "") && /^[a-z0-9][a-z0-9-]{0,63}$/u.test(run ?? ""),
  "Pass master.mp4 exact-sha256 fresh-run.");
const input = await realpath(inputArg), artifacts = await realpath("artifacts");
assert.ok(input.startsWith(`${artifacts}/`), "Master must be a retained task artifact.");
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const master = await readFile(input);
assert.ok(master.length <= 128 * 1024 * 1024, "Master exceeds the bounded preview input size.");
assert.equal(hash(master), expectedSha256, "Master changed; inspect before deriving another preview.");
const out = resolve("artifacts/studio-relaunch/web-previews", run!);
await mkdir(out, { recursive: true });
assert.equal(await realpath(out), out, "Output cannot be a symlink.");
await writeFile(join(out, "intent.json"), JSON.stringify({ input, expectedSha256, run, crf: 23, preset: "slow", forceKeyFrames: "expr:gte(t,n_forced*2)" }) + "\n", { flag: "wx" });
const coordinator = createDefaultHostResourceCoordinator({ waitTimeoutMilliseconds: 3_600_000 });
const claims = physicalHostResourceClaims([
  { resource: "cpu", amount: 2 }, { resource: "local-io", amount: 1 },
  { resource: "ffmpeg", amount: 1 }, { resource: "project-render", amount: 1 },
], coordinator);
const commands: { label: string; argv: string[]; exitCode: number }[] = [];
await coordinator.withLease(claims, async lease => {
  async function execute(label: string, argv: string[]) {
    const child = Bun.spawn(argv, { stdio: ["ignore", "pipe", "pipe", lease.inheritedFileDescriptor] });
    const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    await writeFile(join(out, `${label}.stdout.txt`), stdout, { flag: "wx" });
    await writeFile(join(out, `${label}.stderr.txt`), stderr, { flag: "wx" });
    commands.push({ label, argv, exitCode });
    await writeFile(join(out, "commands.json"), JSON.stringify(commands, null, 2) + "\n");
    assert.equal(exitCode, 0, `${label} failed; inspect its retained log before a separately named recovery.`);
    await lease.assertOwned();
    return stdout;
  }
  const probe = async (name: string, path: string) => JSON.parse(await execute(name, [
    "ffprobe", "-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", path,
  ]));
  const before = await probe("master-probe", input);
  const video = before.streams.find((s: { codec_type: string }) => s.codec_type === "video");
  assert.ok(video && video.width <= 1920 && video.height <= 1080 && Number(before.format.duration) <= 15,
    "This preview recipe is bounded to landscape HD and fifteen seconds.");
  const ffmpegVersion = (await execute("ffmpeg-version", ["ffmpeg", "-version"])).split("\n")[0];
  const output = join(out, "preview.mp4");
  await execute("encode", ["ffmpeg", "-v", "error", "-nostdin", "-n", "-threads", "2", "-i", input,
    "-map", "0:v:0", "-map", "0:a:0?", "-map_metadata", "-1", "-c:v", "libx264", "-crf", "23", "-preset", "slow",
    "-threads", "2", "-filter_threads", "1", "-force_key_frames", "expr:gte(t,n_forced*2)", "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", output]);
  const after = await probe("preview-probe", output);
  const revisedVideo = after.streams.find((s: { codec_type: string }) => s.codec_type === "video");
  for (const key of ["width", "height", "r_frame_rate", "nb_read_frames"])
    assert.equal(revisedVideo[key], video[key], `Derivative changed ${key}.`);
  assert.ok(Math.abs(Number(after.format.duration) - Number(before.format.duration)) < .05, "Duration changed.");
  await execute("full-decode", ["ffmpeg", "-v", "error", "-nostdin", "-threads", "2", "-i", output, "-map", "0:v:0", "-map", "0:a:0?", "-f", "null", "-"]);
  await execute("poster", ["ffmpeg", "-v", "error", "-nostdin", "-n", "-threads", "2", "-ss", "6", "-i", output,
    "-frames:v", "1", "-c:v", "libwebp", "-quality", "90", "-threads", "2", join(out, "poster.webp")]);
  const bytes = await readFile(output), poster = await readFile(join(out, "poster.webp"));
  const withinSiteBudget = bytes.length <= 4 * 1024 * 1024;
  assert.equal(hash(await readFile(input)), expectedSha256, "Master changed during derivation.");
  const lineage = { master: { path: relative(process.cwd(), input), sha256: expectedSha256, bytes: master.length },
    recipeSha256: hash(await readFile(import.meta.filename)), ffmpegVersion, claims, commands,
    output: { path: relative(process.cwd(), output), sha256: hash(bytes), bytes: bytes.length, withinSiteBudget },
    poster: { path: relative(process.cwd(), join(out, "poster.webp")), sha256: hash(poster), bytes: poster.length },
    probe: after, review: "Needs independent review of this exact derivative before public admission." };
  await writeFile(join(out, "lineage.json"), JSON.stringify(lineage, null, 2) + "\n", { flag: "wx" });
  assert.ok(withinSiteBudget, "Preview exceeds 4MiB; retain this attempt and review a separately named recovery.");
  console.log(JSON.stringify({ out, output: lineage.output, poster: lineage.poster, ffmpegVersion }));
});
