/** Immutable requests for the original Canvas/synthesis film; uses the canonical host. */
import { mkdir, open, realpath, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const values = new Map<string, string>(), flags = new Set<string>();
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i]!;
  if (["--still", "--dry-run"].includes(arg)) { if (flags.has(arg)) throw new Error(`Duplicate ${arg}`); flags.add(arg); }
  else if (["--run", "--width", "--time", "--audio"].includes(arg) && process.argv[i + 1] !== undefined) {
    if (values.has(arg)) throw new Error(`Duplicate ${arg}`); values.set(arg, process.argv[++i]!);
  } else throw new Error(`Unknown/incomplete option: ${arg}`);
}
const still = flags.has("--still"), dry = flags.has("--dry-run"), width = Number(values.get("--width") ?? 1920);
const time = Number(values.get("--time") ?? (still ? 9.25 : 0)), run = values.get("--run"), audio = values.get("--audio");
if (!run || !/^[a-z0-9][a-z0-9-]{0,63}$/u.test(run)) throw new Error("Supply a fresh --run token.");
if (![960, 1280, 1920, 3840].includes(width)) throw new Error("Width must be 960,1280,1920,or3840.");
if (!Number.isFinite(time) || time < 0 || time >= 12 || (!still && time !== 0)) throw new Error("Time requires a still, in [0,12).");
if (still && audio) throw new Error("A still omits audio.");
const out = join(root, "artifacts/studio-relaunch/jazz-wave", run), prefix = dry ? "plan" : "render";
await mkdir(out, { recursive: true });
if (await realpath(out) !== out) throw new Error("Output cannot be a symlink.");
await writeFile(join(out, `${prefix}.intent.json`), JSON.stringify({ width, time, still, dry, audio: audio ?? null }) + "\n", { flag: "wx", mode: 0o600 });
const request = join(out, `${prefix}.scene.json`);
await writeFile(request, JSON.stringify({ kind: "slopcamera.html-scene", schemaVersion: 1, name: "A square wave auditions for jazz",
  document: { path: "examples/showcase/studio-relaunch/jazz-wave/scene.html" }, canvas: { width, height: width * 9 / 16, deviceScaleFactor: 1 },
  timing: { durationUs: still ? 1 : 12_000_000, fps: 24 }, seed: 20260930, libraries: [], parameters: { timeOffsetSeconds: time }, background: "#10252b",
  resources: [
    { name: "sans", path: "examples/showcase/studio-relaunch/assets/fonts/nebula-sans/NebulaSans-Book.woff2", urlPath: "fonts/sans.woff2", mediaType: "font/woff2" },
    { name: "bold", path: "examples/showcase/studio-relaunch/assets/fonts/nebula-sans/NebulaSans-Bold.woff2", urlPath: "fonts/bold.woff2", mediaType: "font/woff2" },
    { name: "serif", path: "examples/showcase/studio-relaunch/assets/fonts/instrument-serif/instrument-serif-latin-400.woff2", urlPath: "fonts/serif.woff2", mediaType: "font/woff2" },
  ], ...(audio ? { audio: { path: resolve(audio) } } : {}),
}, null, 2) + "\n", { flag: "wx", mode: 0o600 });
const log = await open(join(out, `${prefix}.log`), "wx", 0o600);
let code: number, stdout: string;
try {
  const child = Bun.spawn([process.execPath, join(root, "apps/desktop/cli/main.ts"), "html", "render", "--input", request, "--json", ...(dry ? ["--dry-run"] : [])], { cwd: root, env: process.env, stdout: "pipe", stderr: log.fd });
  [code, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);
} finally { await log.close(); }
await writeFile(join(out, `${prefix}.${code === 0 ? "result" : "failed"}.json`), stdout || JSON.stringify({ code }), { flag: "wx", mode: 0o600 });
if (code !== 0) throw new Error(`Render exited ${code}. Inspect ${out}; do not automatically retry.`);
console.log(JSON.stringify({ out, result: JSON.parse(stdout) }));
