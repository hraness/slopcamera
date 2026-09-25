/** Render the AI mythology films through the canonical Slopcamera HTML host. */
import { mkdir, open, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getVisualStyleProfile, sampleVisualStyleExposure, visualStyleFrameVariation } from "../../src/visual-style";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FPS = 24;

export interface MythFilm {
  id: string;
  title: string;
  style: string;
  html: string;
  document?: string;
  libraries?: string[];
  executionProfile?: string;
  width: number;
  durationSeconds: number;
  seed: number;
  cadenceStyle?: string;
  boil?: string[];
  music?: { bpm: number; beatOffsetUs: number; beatsPerBar: number };
  audio?: string;
  stillOffset: number;
}

export async function loadFilms(workspaceRoot = root): Promise<MythFilm[]> {
  const catalog = JSON.parse(await readFile(join(workspaceRoot, "examples/mythology-portfolio/films.json"), "utf8")) as { films: MythFilm[] };
  return catalog.films;
}

/**
 * Precompute the style clock on the TypeScript side with the SDK helpers, so the
 * page receives the exact held exposure time and keyed boil for every output frame.
 */
export function styleClock(film: MythFilm): { exposureUs: string; boil: Record<string, string> } {
  const frames = Math.ceil(film.durationSeconds * FPS);
  const cadence = film.cadenceStyle;
  const exposureUs: number[] = [];
  const exposureIndex: number[] = [];
  for (let frame = 0; frame < frames; frame++) {
    const timeUs = Math.ceil(frame * 1_000_000 / FPS);
    if (cadence === undefined) {
      exposureUs.push(timeUs);
      exposureIndex.push(frame);
    } else {
      const sample = sampleVisualStyleExposure(timeUs, cadence);
      exposureUs.push(sample.exposureTimeUs);
      exposureIndex.push(sample.exposureIndex);
    }
  }
  const boil: Record<string, string> = {};
  for (const channel of film.boil ?? []) {
    boil[channel] = exposureIndex.map(index => visualStyleFrameVariation(film.seed, index, `${film.id}/${channel}`).toFixed(4)).join(",");
  }
  return { exposureUs: exposureUs.join(","), boil };
}

export function htmlScene(film: MythFilm, options: { width: number; still: boolean; offset: number }) {
  const profile = getVisualStyleProfile(film.style);
  if (film.document === undefined) throw new Error(`${film.id} is not an HTML film.`);
  return {
    kind: "slopcamera.html-scene", schemaVersion: 1,
    name: `${film.title} / ${options.still ? "master still" : "film"}`,
    document: { path: film.document },
    canvas: { width: options.width, height: options.width * 9 / 16, deviceScaleFactor: 1 },
    timing: { durationUs: options.still ? 1 : film.durationSeconds * 1_000_000, fps: FPS },
    seed: film.seed, libraries: film.libraries ?? [], resources: [],
    parameters: {
      film: film.id, style: film.style, palette: profile.palette, cadence: profile.cadence,
      timeOffsetSeconds: options.offset, frames: Math.ceil(film.durationSeconds * FPS),
      ...styleClock(film), ...(film.music ? { music: film.music } : {}),
    },
    background: profile.palette.background,
    ...(film.executionProfile ? { executionProfile: film.executionProfile } : {}),
    ...(film.audio && !options.still ? { audio: { path: film.audio, reactivity: { profile: "bands-v1" } } } : {}),
  };
}

export async function renderFilms(args: readonly string[], workspaceRoot = root, log: (message: string) => void = console.log): Promise<void> {
  const flagNames = new Set(["--film", "--width", "--offset", "--run"]);
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
  const run = options.get("--run");
  if (run === undefined || !/^[a-z0-9][a-z0-9-]{0,63}$/u.test(run)) throw new Error("--run <name> is required: a short lowercase filename token, new per attempt.");
  const films = (await loadFilms(workspaceRoot)).filter(film => film.document !== undefined);
  const requested = options.get("--film");
  if ((requested === undefined) === !flags.has("--all")) throw new Error("Choose exactly one of --film <id> or --all.");
  const selected = requested === undefined ? films : films.filter(film => film.id === requested);
  if (selected.length === 0) throw new Error(`HTML film not found. Choose: ${films.map(film => film.id).join(", ")}`);
  const canonicalRoot = await realpath(workspaceRoot);
  const output = join(canonicalRoot, "artifacts", "mythology-portfolio", run);
  await mkdir(output, { recursive: true });
  if (await realpath(output) !== output) throw new Error("Output directories must not be symlinks.");
  for (const film of selected) {
    const width = Number(options.get("--width") ?? (still ? 3840 : film.width));
    if (![1280, 1920, 2560, 3840].includes(width)) throw new Error("--width must be 1280, 1920, 2560, or 3840.");
    const offset = still ? Number(options.get("--offset") ?? film.stillOffset) : 0;
    if (!Number.isFinite(offset) || offset < 0 || offset >= film.durationSeconds) throw new Error(`--offset must lie within ${film.id}'s duration.`);
    const prefix = `${film.id}${still ? ".still" : ""}${flags.has("--dry-run") ? ".plan" : ""}`;
    const resultPath = join(output, `${prefix}.result.json`);
    const requestPath = join(output, `${prefix}.scene.json`);
    const intentPath = join(output, `${prefix}.intent.json`);
    // One intent per attempt: an existing intent is never silently resubmitted.
    try {
      await writeFile(intentPath, JSON.stringify({ kind: "slopcamera.mythology-film-intent", film: film.id, style: film.style,
        html: film.html, requestPath, width, still, offset, mode: flags.has("--dry-run") ? "plan" : "render" }) + "\n", { flag: "wx", mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      log(JSON.stringify({ film: film.id, state: "already-attempted", intentPath, resultPath }));
      continue;
    }
    await writeFile(requestPath, JSON.stringify(htmlScene(film, { width, still, offset }), null, 2) + "\n", { flag: "wx", mode: 0o600 });
    const childArgs = [process.execPath, join(canonicalRoot, "apps/desktop/dist/cli/main.js"), "html", "render", "--input", requestPath, "--json"];
    if (flags.has("--dry-run")) childArgs.push("--dry-run");
    const logPath = join(output, `${prefix}.log`);
    const logFile = await open(logPath, "wx", 0o600);
    const started = Date.now();
    let code: number;
    let stdout: string;
    try {
      const child = Bun.spawn(childArgs, { cwd: canonicalRoot, env: process.env, stdout: "pipe", stderr: logFile.fd });
      [code, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);
    } finally { await logFile.close(); }
    if (code !== 0) {
      await writeFile(join(output, `${prefix}.failed.json`), JSON.stringify({ code, stdout }) + "\n", { flag: "wx" });
      throw new Error(`${film.id} render failed (${code}); inspect ${logPath}. No automatic retry was made.`);
    }
    const result: unknown = JSON.parse(stdout);
    await writeFile(resultPath, JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
    log(JSON.stringify({ film: film.id, state: flags.has("--dry-run") ? "planned" : "rendered", seconds: Math.round((Date.now() - started) / 1000), resultPath }));
  }
}

if (import.meta.main) await renderFilms(process.argv.slice(2));
