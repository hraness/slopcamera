/** Render the original authored films through Slopcamera's retained HTML host. */
import { mkdir, open, realpath, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
export async function renderFilm(film: "last-tram" | "paper-ocean" | "laundromat", args: readonly string[]): Promise<void> {
  const values = new Map<string, string>(), flags = new Set<string>();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index]!;
    if (["--still", "--dry-run"].includes(flag)) {
      if (flags.has(flag)) throw new Error(`Duplicate ${flag}`);
      flags.add(flag);
    } else if (["--run", "--width", "--time", "--variant", "--audio"].includes(flag) && args[index + 1] !== undefined) {
      if (values.has(flag)) throw new Error(`Duplicate ${flag}`);
      values.set(flag, args[++index]!);
    } else throw new Error(`Unknown or incomplete argument: ${flag}`);
  }
  const still = flags.has("--still"), dry = flags.has("--dry-run");
  const width = Number(values.get("--width") ?? 1920), time = Number(values.get("--time") ?? (still ? 6 : 0));
  const run = values.get("--run");
  if (!run || !/^[a-z0-9][a-z0-9-]{0,63}$/u.test(run)) throw new Error("Supply a fresh --run lowercase filename token.");
  if (![960, 1280, 1920, 3840].includes(width)) throw new Error("Width must be 960,1280,1920,or3840.");
  if (!Number.isFinite(time) || time < 0 || time >= 12 || (!still && time !== 0)) throw new Error("Time must be in[0,12)and requires --still.");
  const variant = values.get("--variant") ?? (film === "last-tram" ? "moonrise" : film === "paper-ocean" ? "whale" : "dance");
  const allowed = film === "last-tram" ? ["original", "moonrise"] : film === "paper-ocean" ? ["quiet", "whale"] : ["dance"];
  if (!allowed.includes(variant)) throw new Error(`Variant must be one of: ${allowed.join(", ")}`);
  const out = join(root, "artifacts/studio-relaunch", film, run);
  await mkdir(out, { recursive: true });
  if (await realpath(out) !== out) throw new Error("Output must not be a symlink.");
  const prefix = dry ? "plan" : "render", request = join(out, `${prefix}.scene.json`);
  // A retained intent is never silently retried: inspect its logs and scheduler
  // receipt before deliberately choosing a new run ID.
  await writeFile(join(out, `${prefix}.intent.json`), JSON.stringify({ film, variant, width, time, still, dry }) + "\n", { flag: "wx", mode: 0o600 });
  const audio = values.get("--audio");
  if (still && audio) throw new Error("A still request must omit audio.");
  const scene = {
    kind: "slopcamera.html-scene", schemaVersion: 1,
    name: `${film} / ${variant}`,
    document: { path: `examples/showcase/studio-relaunch/${film}/scene.html` },
    canvas: { width, height: width * 9 / 16, deviceScaleFactor: 1 },
    timing: { durationUs: still ? 1 : 12_000_000, fps: 24 },
    seed: 20260930, libraries: [], resources: [],
    parameters: { variant, timeOffsetSeconds: time },
    background: film === "last-tram" ? "#071d29" : "#e9e0cc",
    ...(audio ? { audio: { path: resolve(audio) } } : {}),
  };
  await writeFile(request, JSON.stringify(scene, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  const argv = [process.execPath, join(root, "apps/desktop/cli/main.ts"), "html", "render", "--input", request, "--json", ...(dry ? ["--dry-run"] : [])];
  const log = await open(join(out, `${prefix}.log`), "wx", 0o600);
  let code: number, stdout: string;
  try { const p = Bun.spawn(argv, { cwd: root, env: process.env, stdout: "pipe", stderr: log.fd });
    [code, stdout] = await Promise.all([p.exited, new Response(p.stdout).text()]);
  } finally { await log.close(); }
  await writeFile(join(out, `${prefix}.${code === 0 ? "result" : "failed"}.json`), stdout || JSON.stringify({ code }), { flag: "wx", mode: 0o600 });
  if (code !== 0) throw new Error(`Render exited ${code}; inspect ${out}. No automatic retry.`);
  console.log(JSON.stringify({ film, variant, out, result: JSON.parse(stdout) }));
}
if (import.meta.main) await renderFilm("last-tram", process.argv.slice(2));
