/** Render original style studies through the canonical Slopcamera host. */
import { mkdir, open, realpath, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getVisualStyleProfile } from "../../src/visual-style";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const studies = ["theatrical-cel", "watercolor-storybook", "pixel-art", "math-explainer",
  "midcentury-limited", "rubber-hose", "cut-paper", "stopmotion-clay", "engraving",
  "ink-sketch", "rotoscope", "clean-motion"] as const;
export async function renderStudies(args: readonly string[], workspaceRoot = root, log: (message: string) => void = console.log): Promise<void> {
  const flagNames = new Set(["--style", "--width", "--offset", "--run"]);
  const options = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--all" || arg === "--still" || arg === "--dry-run") {
      if (flags.has(arg)) throw new Error(`Duplicate flag ${arg}`);
      flags.add(arg);
    } else if (flagNames.has(arg) && args[i + 1] !== undefined) {
      if (options.has(arg)) throw new Error(`Duplicate option ${arg}`);
      options.set(arg, args[++i]!);
    } else throw new Error(`Unknown or incomplete option ${arg}`);
  }
  const still = flags.has("--still");
  const width = Number(options.get("--width") ?? (still ? 3840 : 1920));
  const offset = Number(options.get("--offset") ?? (still ? 3 : 0));
  const run = options.get("--run") ?? (still ? "stills" : "films");
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/u.test(run)) throw new Error("--run must be a short lowercase filename token.");
  if (![1280, 1920, 2560, 3840].includes(width)) throw new Error("--width must be 1280, 1920, 2560, or 3840.");
  if (!Number.isFinite(offset) || offset < 0 || offset >= 6 || (!still && offset !== 0)) throw new Error("--offset must be in [0,6), and requires --still.");
  const requested = options.get("--style");
  if ((requested === undefined) === !flags.has("--all")) throw new Error("Choose exactly one of --style <id> or --all.");
  const selected = requested === undefined ? studies : studies.filter(id => id === requested);
  if (selected.length === 0) throw new Error(`Study not found. Choose: ${studies.join(", ")}`);
  const canonicalRoot = await realpath(workspaceRoot);
  const output = join(canonicalRoot, "artifacts", "style-portfolio", run);
  await mkdir(output, { recursive: true });
  if (await realpath(output) !== output) throw new Error("Output directories must not be symlinks.");
  for (const style of selected) {
    // Plans have their own immutable attempt, so inspecting a new width never
    // replaces an execution's scene, log, result, or native receipt references.
    const prefix = `${style}${flags.has("--dry-run") ? ".plan" : ""}`;
    const resultPath = join(output, `${prefix}.result.json`);
    const requestPath = join(output, `${prefix}.scene.json`);
    const intentPath = join(output, `${prefix}.intent.json`);
    // A retained intent without a result is ambiguous. Inspect its log and host
    // receipts before selecting an explicitly new --run, never auto-resubmit.
    try {
      await writeFile(intentPath, JSON.stringify({ kind: "slopcamera.style-study-intent", style, requestPath, width, still,
        mode: flags.has("--dry-run") ? "plan" : "render" }) + "\n", { flag: "wx", mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      log(JSON.stringify({ style, state: "already-attempted", intentPath, resultPath }));
      continue;
    }
    const profile = getVisualStyleProfile(style);
    const scene = {
      kind: "slopcamera.html-scene", schemaVersion: 1,
      name: `${profile.name} / ${still ? "master still" : "motion study"}`,
      document: { path: "examples/style-portfolio/animation-studies.html" },
      canvas: { width, height: width * 9 / 16, deviceScaleFactor: 1 },
      timing: { durationUs: still ? 1 : 6_000_000, fps: 24 },
      seed: 20260923, libraries: [], resources: [],
      parameters: { style, direction: profile, timeOffsetSeconds: offset },
      background: profile.palette.background,
    };
    await writeFile(requestPath, JSON.stringify(scene, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    const childArgs = [process.execPath, join(canonicalRoot, "apps/desktop/dist/cli/main.js"), "html", "render", "--input", requestPath, "--json"];
    if (flags.has("--dry-run")) childArgs.push("--dry-run");
    const logPath = join(output, `${prefix}.log`);
    const logFile = await open(logPath, "wx", 0o600);
    let code: number;
    let stdout: string;
    try {
      const child = Bun.spawn(childArgs, { cwd: canonicalRoot, env: process.env, stdout: "pipe", stderr: logFile.fd });
      [code, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);
    } finally { await logFile.close(); }
    if (code !== 0) {
      await writeFile(join(output, `${prefix}.failed.json`), JSON.stringify({ code, stdout }) + "\n", { flag: "wx" });
      throw new Error(`${style} render failed (${code}); inspect ${logPath}. No automatic retry was made.`);
    }
    const result: unknown = JSON.parse(stdout);
    await writeFile(resultPath, JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
    log(JSON.stringify({ style, state: flags.has("--dry-run") ? "planned" : "rendered", resultPath }));
  }
}

if (import.meta.main) await renderStudies(process.argv.slice(2));
