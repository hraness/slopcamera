/** Assemble a successful native film, with original sound, through Slopcamera. */
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const [job, run, ...extra] = process.argv.slice(2);
if (!job || !/^studio_rain_webFilm_[a-f0-9]{32}$/u.test(job) || !run ||
    !/^[a-z0-9][a-z0-9-]{0,63}$/u.test(run) || extra.length) {
  throw new Error("Usage: bun finish.ts <successful studio_rain_webFilm_id> <fresh-run-token>");
}
const root = resolve(import.meta.dir, "../../../..");
const out = join(root, "artifacts/studio-relaunch/rain-bottled", run);
await mkdir(out, { recursive: true });
if (await realpath(out) !== out) throw new Error("Output must be a physical directory.");
await writeFile(join(out, "finish.intent.json"), JSON.stringify({ job, run }) + "\n", { flag: "wx", mode: 0o600 });
const cli = [process.execPath, join(root, "apps/desktop/cli/main.ts")];
const ffmpeg = Bun.which("ffmpeg"), python = Bun.which("python3");
if (!ffmpeg || !python) throw new Error("FFmpeg and Python 3 are required; run slopcamera doctor.");

async function command(name: string, argv: string[]) {
  const child = Bun.spawn(argv, { cwd: root, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
  ]);
  await writeFile(join(out, `${name}.command.json`), JSON.stringify({ argv, exitCode, stderr }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  await writeFile(join(out, `${name}.result.json`), stdout || "null\n", { flag: "wx", mode: 0o600 });
  if (exitCode !== 0) throw new Error(`${name} failed; inspect ${out}. No automatic retry.`);
  return { stdout, stderr };
}
function loudness(stderr: string) {
  // FFmpeg can append its final stream/size statistics after the JSON report.
  const start = stderr.lastIndexOf("{"), end = stderr.indexOf("}", start);
  if (start < 0 || end < start) throw new Error("FFmpeg did not emit a loudness report.");
  const data = JSON.parse(stderr.slice(start, end + 1)) as Record<string, string>;
  for (const key of ["input_i", "input_tp", "input_lra", "input_thresh", "target_offset"]) {
    if (!Number.isFinite(Number(data[key]))) throw new Error(`Missing measured loudness: ${key}`);
  }
  return data;
}

// Inspection reconciles retained source/output evidence before any assembly.
const inspected = JSON.parse((await command("inspect", [...cli, "studio", "inspect", job!, "--json"])).stdout);
if (inspected.document?.state !== "succeeded" || inspected.document?.custody !== "closed") {
  throw new Error("The native film must have a successful, closed receipt.");
}
const raw = join(out, "original-score.wav"), sound = join(out, "normalized-score.wav");
await command("compose", [python, join(import.meta.dir, "sound.py"), raw]);
const base = [ffmpeg, "-hide_banner", "-nostdin", "-nostats", "-threads", "1", "-filter_threads", "1"];
const target = "loudnorm=I=-16:TP=-1.5:LRA=9";
const measure = loudness((await command("measure-score", [...base, "-i", raw, "-af", `${target}:print_format=json`, "-f", "null", "-"])).stderr);
const measured = `${target}:measured_I=${measure.input_i}:measured_TP=${measure.input_tp}:measured_LRA=${measure.input_lra}:measured_thresh=${measure.input_thresh}:offset=${measure.target_offset}:linear=true:print_format=json`;
const normalization = await command("normalize-score", [...base, "-n", "-i", raw, "-af", measured, "-ar", "48000", "-ac", "2", "-c:a", "pcm_s24le", sound]);
const verification = loudness((await command("verify-score", [...base, "-i", sound, "-af", `${target}:print_format=json`, "-f", "null", "-"])).stderr);
if (Math.abs(Number(verification.input_i) + 16) > .5 || Number(verification.input_tp) > -1.4) {
  throw new Error("Normalized score is outside the loudness target; inspect before assembly.");
}
await writeFile(join(out, "audio-review.json"), JSON.stringify({ target: { integratedLUFS: -16, truePeakDbTP: -1.5, loudnessRangeLU: 9 }, measured: measure, normalized: loudness(normalization.stderr), verified: verification, listening: "pending; signal measurements do not establish listening" }, null, 2) + "\n", { flag: "wx" });
const assembly = JSON.parse((await command("assemble", [...cli, "studio", "assemble", job!, "--output-id", "beauty", "--name", "Rain, bottled", "--json"])).stdout);
if (typeof assembly.projectId !== "string" || typeof assembly.projectPath !== "string") throw new Error("Assembly did not return an ordinary project.");
const project = assembly.projectId;
await command("add-score", [...cli, "project", "add", project, sound, "--role", "music", "--at", "0s", "--json"]);
const render = [project, "--width", "1920", "--height", "1080", "--fps", "24", "--output", "renders/rain-bottled.mp4", "--allow-unverified-sync", "--json"];
await command("render-plan", [...cli, "project", "render", "plan", ...render]);
const rendered = JSON.parse((await command("render", [...cli, "project", "render", "run", ...render])).stdout);
console.log(JSON.stringify({ out, projectId: project, projectPath: assembly.projectPath, rendered, synchronization: "Authored zero-offset score; not measured speech alignment.", review: "Inspect complete audiovisual playback before public admission." }, null, 2));
