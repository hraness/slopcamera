/**
 * Assemble the gallery manifest for the AI mythology set from completed runs.
 *
 *   bun examples/mythology-portfolio/build-selection.ts --films <run> --stills <run> \
 *     --posters <dir> --finished <dir> --council <run> [--film-run <id>=<run>]... \
 *     [--still-run <id>=<run>]... --out <new-manifest.json>
 *
 * Every path is a run or directory name under artifacts/; `--film-run` takes one
 * film's master from a later run (a re-render after review) instead of the
 * `--films` run, `--still-run` does the same for its master still, and each may
 * repeat for different HTML films. The manifest that
 * results points at the exact files those runs produced and is read by
 * examples/style-portfolio/build-gallery.ts, which re-probes each film. Nothing
 * here renders or finishes media: a missing input is reported, never repaired.
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFilms, type MythFilm } from "./render";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FPS = 24;
const NAME = /^[a-z0-9][a-z0-9-]{0,63}$/u;

interface CatalogFilm extends MythFilm {
  beat: string;
  myth: string;
  direction: string;
  look: string;
  finish?: string;
  techniques: string[];
}

interface Study {
  id: string; title: string; style: string; description: string; method: string;
  video: string; poster: string; width: number; height: number; durationSeconds: number; frameRate: number;
  receipt: string; sourceFiles: { path: string; label: string }[]; limitations: string[]; brief: string;
  reviewPoints: { label: string; timeSeconds: number }[];
}

interface FilmResult {
  output: { path: string; sha256: string; bytes: number };
  receipt: { path: string; sha256: string };
  source: { path: string };
  verification: { frameCount: number; width: number; height: number; durationUs: number };
}

async function sha256(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function regularFile(path: string, what: string): Promise<string> {
  const info = await stat(path).catch(() => undefined);
  if (info === undefined || !info.isFile() || info.size < 1) throw new Error(`${what} is missing or empty: ${relative(root, path)}`);
  return path;
}

/** Read a render result and confirm its output still has the bytes the host recorded. */
async function filmResult(path: string, base: string): Promise<FilmResult> {
  const result = JSON.parse(await readFile(await regularFile(path, "Render result"), "utf8")) as FilmResult;
  const output = await regularFile(join(base, result.output.path), "Rendered film");
  if (await sha256(output) !== result.output.sha256) throw new Error(`Rendered film changed since its result was written: ${result.output.path}`);
  await regularFile(join(base, result.receipt.path), "Render receipt");
  return result;
}

/** Confirm a render used, byte for byte, the scene document that the gallery links as its source. */
async function renderedFrom(result: FilmResult, document: string, what: string, base: string): Promise<void> {
  const source = JSON.parse(await readFile(await regularFile(join(base, result.source.path), `${what} source`), "utf8")) as { document?: { path?: unknown } };
  if (typeof source.document?.path !== "string") throw new Error(`${what}: the render source names no scene document.`);
  const rendered = await regularFile(join(base, source.document.path), `${what} scene document`);
  if (await sha256(rendered) !== await sha256(document)) throw new Error(`${what} was rendered from a different scene document than ${relative(base, document)}; select the run that matches it.`);
}

function reviewPoints(film: CatalogFilm): Study["reviewPoints"] {
  const points = [
    { label: "Opening", timeSeconds: 0.5 },
    { label: "Midpoint", timeSeconds: Math.round(film.durationSeconds * 5) / 10 },
    { label: "Master still frame", timeSeconds: film.stillOffset },
  ];
  return points.filter((point, index) => points.findIndex(other => Math.abs(other.timeSeconds - point.timeSeconds) < .25) === index)
    .sort((a, b) => a.timeSeconds - b.timeSeconds);
}

export async function buildSelection(args: readonly string[], workspaceRoot = root): Promise<{ manifestPath: string; studies: number }> {
  const options = new Map<string, string>();
  const filmRuns = new Map<string, string>();
  const stillRuns = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    const value = args[i + 1];
    if ((arg === "--film-run" || arg === "--still-run") && value !== undefined) {
      const runs = arg === "--film-run" ? filmRuns : stillRuns;
      const [id, run, extra] = value.split("=");
      if (id === undefined || run === undefined || extra !== undefined || !NAME.test(id) || !NAME.test(run) || runs.has(id)) {
        throw new Error(`${arg} takes one <film-id>=<run> per film: ${value}`);
      }
      runs.set(id, run);
      i++;
      continue;
    }
    if (!/^--(films|stills|posters|finished|council|out)$/u.test(arg) || value === undefined || options.has(arg)) throw new Error(`Unknown, duplicate or incomplete option ${arg}`);
    options.set(arg, args[++i]!);
  }
  const need = (flag: string) => {
    const value = options.get(flag);
    if (value === undefined) throw new Error(`${flag} is required.`);
    return value;
  };
  const films = need("--films"); const stills = need("--stills"); const posters = need("--posters");
  const finished = need("--finished"); const council = need("--council");
  for (const name of [films, stills, posters, finished, council]) if (!NAME.test(name)) throw new Error(`Run and directory names must match ${NAME}: ${name}`);
  const canonicalRoot = await realpath(workspaceRoot);
  const manifestPath = resolve(canonicalRoot, need("--out"));
  const base = dirname(manifestPath);
  if (relative(join(canonicalRoot, "artifacts"), base).startsWith("..") || !manifestPath.endsWith(".json")) throw new Error("--out must be a new .json inside artifacts/.");
  const rel = (absolute: string) => relative(base, absolute);
  const setDir = join(canonicalRoot, "artifacts", "mythology-portfolio");
  const catalog = (await loadFilms(canonicalRoot)) as CatalogFilm[];
  for (const [flag, runs] of [["--film-run", filmRuns], ["--still-run", stillRuns]] as const) {
    for (const id of runs.keys()) {
      if (!catalog.some((film) => film.id === id && film.document !== undefined)) throw new Error(`${flag} names a film that is not one of the HTML films: ${id}`);
    }
  }
  const studies: Study[] = [];
  for (const film of catalog) {
    const sourceFiles: Study["sourceFiles"] = [
      { path: rel(join(canonicalRoot, "examples/mythology-portfolio/films.json")), label: "Catalog entry (films.json)" },
    ];
    const limitations: string[] = [];
    let video: string; let poster: string; let receipt: string; let width: number; let height: number; let durationSeconds: number;
    if (film.document !== undefined) {
      const filmRun = filmRuns.get(film.id) ?? films;
      const master = await filmResult(join(setDir, filmRun, `${film.id}.result.json`), canonicalRoot);
      const still = await filmResult(join(setDir, stillRuns.get(film.id) ?? stills, `${film.id}.still.result.json`), canonicalRoot);
      const documentPath = join(canonicalRoot, film.document);
      await renderedFrom(master, documentPath, `${film.id} film`, canonicalRoot);
      await renderedFrom(still, documentPath, `${film.id} master still`, canonicalRoot);
      width = master.verification.width; height = master.verification.height;
      durationSeconds = master.verification.durationUs / 1_000_000;
      if (master.verification.frameCount !== Math.ceil(durationSeconds * FPS)) throw new Error(`${film.id}: frame count does not match its duration.`);
      receipt = rel(join(canonicalRoot, master.receipt.path));
      sourceFiles.push(
        { path: rel(join(canonicalRoot, film.document)), label: "Scene document (HTML)" },
        { path: rel(join(canonicalRoot, "examples/mythology-portfolio/render.ts")), label: "Render command (render.ts)" },
        { path: rel(join(setDir, filmRun, `${film.id}.scene.json`)), label: "Submitted scene request" },
        { path: rel(join(canonicalRoot, still.receipt.path)), label: `Master still receipt (${still.verification.width} × ${still.verification.height})` },
      );
      poster = rel(await regularFile(join(setDir, posters, `${film.id}.png`), "Poster"));
      if (film.finish !== undefined) {
        const finishedPath = join(canonicalRoot, "artifacts", "style-portfolio", finished, `${film.id}.${film.finish}.mp4`);
        video = rel(await regularFile(finishedPath, "Finished film"));
        // The delivered file is the finished one, so its receipt leads; the master render's receipt stays linked as a source.
        sourceFiles.push(
          { path: receipt, label: "Master render receipt" },
          { path: rel(await regularFile(`${finishedPath}.intent.json`, "Finish intent")), label: `Finish intent (${film.finish})` },
        );
        const finishReceiptPath = await regularFile(`${finishedPath}.receipt.json`, "Finish receipt");
        const finish = JSON.parse(await readFile(finishReceiptPath, "utf8")) as { inputSha256?: unknown; outputSha256?: unknown };
        // A finish made from another attempt would pair the delivered film with the wrong master receipt.
        if (finish.inputSha256 !== master.output.sha256) throw new Error(`${film.id}: the finished film was not made from the selected master; choose its run with --film-run.`);
        if (finish.outputSha256 !== await sha256(finishedPath)) throw new Error(`Finished film changed since its receipt was written: ${relative(root, finishedPath)}`);
        receipt = rel(finishReceiptPath);
        limitations.push(`The gallery film carries the ${film.finish} look applied by ffmpeg; the finish receipt names the clean master by sha256, and the master's own receipt is linked as a source.`);
      } else {
        video = rel(join(canonicalRoot, master.output.path));
      }
      if (film.audio !== undefined) {
        sourceFiles.push({ path: rel(await regularFile(join(canonicalRoot, "examples/mythology-portfolio/synth-many-heads.py"), "Soundtrack synth")), label: "Soundtrack synthesis (Python)" });
      }
    } else {
      const councilDir = join(setDir, council);
      const render = JSON.parse(await readFile(await regularFile(join(councilDir, `${film.id}.render.json`), "Council render"), "utf8")) as
        { receipt: { path: string }; render: { width: number; height: number; frameCount: number } };
      const stillRender = JSON.parse(await readFile(await regularFile(join(councilDir, `${film.id}.still-render.json`), "Council still"), "utf8")) as
        { artifact: { path: string; sha256: string } };
      const audit = JSON.parse(await readFile(await regularFile(join(councilDir, `${film.id}.render-audit.json`), "Render audit"), "utf8")) as
        { findings: { severity: string; kind: string; entityId: string }[] };
      const temporal = JSON.parse(await readFile(await regularFile(join(councilDir, `${film.id}.temporal-audit.json`), "Temporal audit"), "utf8")) as { findings: unknown[] };
      video = rel(await regularFile(join(councilDir, `${film.id}.mp4`), "Council film"));
      const stillPath = await regularFile(join(canonicalRoot, stillRender.artifact.path), "Council still");
      if (await sha256(stillPath) !== stillRender.artifact.sha256) throw new Error("Council still changed since it was rendered.");
      poster = rel(stillPath);
      receipt = rel(await regularFile(join(canonicalRoot, render.receipt.path), "Council receipt"));
      width = render.render.width; height = render.render.height; durationSeconds = render.render.frameCount / FPS;
      sourceFiles.push(
        { path: rel(join(canonicalRoot, "examples/mythology-portfolio/render-council.ts")), label: "Scene author and pipeline (render-council.ts)" },
        { path: rel(join(councilDir, `${film.id}.scene.json`)), label: "Spatial scene (JSON)" },
        { path: rel(join(councilDir, `${film.id}.temporal-audit.json`)), label: `Temporal audit (${temporal.findings.length} findings)` },
        { path: rel(join(councilDir, `${film.id}.render-audit.json`)), label: `Render audit (${audit.findings.length} findings)` },
      );
      for (const finding of audit.findings) limitations.push(`Render audit ${finding.severity}: ${finding.entityId} ${finding.kind}.`);
      limitations.push("The council film is an H.264 transcode of the host's ProRes render; the receipt describes the ProRes original.");
    }
    // Each catalog technique list already names its HTML profile or native scene path.
    const method = film.techniques.join("; ");
    if (method.length > 240) throw new Error(`${film.id}: its techniques run to ${method.length} characters; the gallery method admits 240, so shorten them in films.json.`);
    studies.push({
      id: film.id, title: film.title, style: film.style,
      description: `${film.beat}. ${film.direction}`,
      method,
      video, poster, width, height, durationSeconds, frameRate: FPS, receipt, sourceFiles,
      limitations, brief: `${film.myth}\n\n${film.look}`, reviewPoints: reviewPoints(film),
    });
  }
  const manifest = {
    schemaVersion: 1 as const,
    title: "An AI mythology",
    intro: "Nine invented myths about machine intelligence in the grammar of the old cycles, each rendered with a technique the first portfolio did not use.",
    hero: "first-token",
    studies,
  };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
  return { manifestPath, studies: studies.length };
}

if (import.meta.main) {
  const { manifestPath, studies } = await buildSelection(process.argv.slice(2));
  console.log(JSON.stringify({ manifestPath, studies }));
}
