/** Assemble an offline portfolio from explicitly selected, retained media. */
import { createHash } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import { copyFile, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface GallerySourceFile {
  path: string;
  label?: string;
}

export interface GalleryStudy {
  id: string;
  title: string;
  style: string;
  description: string;
  /** Describe the actual production method, including simulation limits. */
  method: string;
  video: string;
  poster: string;
  width: number;
  height: number;
  durationSeconds: number;
  frameRate?: number;
  receipt: string;
  sourceFiles?: GallerySourceFile[];
  limitations?: string[];
  captions?: string;
  captionLanguage?: string;
  brief?: string;
  reviewPoints?: { label: string; timeSeconds: number }[];
}

export interface GalleryManifest {
  schemaVersion: 1;
  title: string;
  intro?: string;
  /** The ID of a study shown in the opening composition. Defaults to first. */
  hero?: string;
  reel?: GalleryStudy;
  studies: GalleryStudy[];
}

interface SelectedFile {
  input: string;
  output: string;
  sha256: string;
  bytes: number;
}

interface PreparedStudy {
  study: GalleryStudy;
  video: SelectedFile;
  poster: SelectedFile;
  receipt: SelectedFile;
  sources: { label: string; file: SelectedFile }[];
  captions: SelectedFile | undefined;
  facts: { source: "ffprobe" | "supplied-manifest"; width: number; height: number; durationSeconds: number; frameRate: number | undefined };
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const maxManifestBytes = 1024 * 1024;
const maxTotalBytes = 3 * 1024 * 1024 * 1024;
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".json", ".py", ".html", ".css", ".md", ".txt", ".png", ".jpg", ".jpeg", ".webp"]);

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string, max = 1200): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max || value.includes("\0")) {
    throw new Error(`${label} must be nonempty text of at most ${max} characters.`);
  }
  return value.trim();
}

function number(value: unknown, label: string, min: number, max: number, integer = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new Error(`${label} must be ${integer ? "an integer" : "a number"} between ${min} and ${max}.`);
  }
  return value;
}

function optionalString(value: unknown, label: string, max = 1200): string | undefined {
  return value === undefined ? undefined : string(value, label, max);
}

function parseStudy(value: unknown, label: string): GalleryStudy {
  const item = record(value, label);
  const id = string(item.id, `${label}.id`, 64);
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(id)) throw new Error(`${label}.id must be a lowercase filename token.`);
  const sourceFiles = item.sourceFiles;
  if (sourceFiles !== undefined && (!Array.isArray(sourceFiles) || sourceFiles.length > 24)) throw new Error(`${label}.sourceFiles must contain at most 24 explicit files.`);
  const limitations = item.limitations;
  if (limitations !== undefined && (!Array.isArray(limitations) || limitations.length > 12)) throw new Error(`${label}.limitations must contain at most 12 entries.`);
  const frameRate = item.frameRate === undefined ? undefined : number(item.frameRate, `${label}.frameRate`, .1, 240);
  const captions = optionalString(item.captions, `${label}.captions`);
  const captionLanguage = optionalString(item.captionLanguage, `${label}.captionLanguage`, 32);
  if (captionLanguage !== undefined && !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u.test(captionLanguage)) throw new Error(`${label}.captionLanguage must be a language tag.`);
  if (captionLanguage && !captions) throw new Error(`${label}.captionLanguage requires captions.`);
  const brief = optionalString(item.brief, `${label}.brief`, 1600);
  const durationSeconds = number(item.durationSeconds, `${label}.durationSeconds`, .01, 600);
  if (item.reviewPoints !== undefined && (!Array.isArray(item.reviewPoints) || item.reviewPoints.length > 6)) throw new Error(`${label}.reviewPoints must contain at most six points.`);
  const reviewPoints = item.reviewPoints === undefined ? undefined : (item.reviewPoints as unknown[]).map((value, index) => {
    const point = record(value, `${label}.reviewPoints[${index}]`);
    return { label: string(point.label, "Review point label", 60), timeSeconds: number(point.timeSeconds, "Review time", 0, durationSeconds) };
  });
  return {
    id, title: string(item.title, `${label}.title`, 160), style: string(item.style, `${label}.style`, 100),
    description: string(item.description, `${label}.description`), method: string(item.method, `${label}.method`, 240),
    video: string(item.video, `${label}.video`), poster: string(item.poster, `${label}.poster`),
    width: number(item.width, `${label}.width`, 16, 8192, true),
    height: number(item.height, `${label}.height`, 16, 8192, true),
    durationSeconds,
    receipt: string(item.receipt, `${label}.receipt`),
    ...(frameRate === undefined ? {} : { frameRate }),
    ...(captions === undefined ? {} : { captions }),
    ...(captionLanguage === undefined ? {} : { captionLanguage }),
    ...(brief === undefined ? {} : { brief }),
    ...(reviewPoints === undefined ? {} : { reviewPoints }),
    ...(sourceFiles === undefined ? {} : { sourceFiles: sourceFiles.map((source, index) => {
      const file = record(source, `${label}.sourceFiles[${index}]`);
      const sourceLabel = optionalString(file.label, `${label}.sourceFiles[${index}].label`, 160);
      return { path: string(file.path, `${label}.sourceFiles[${index}].path`), ...(sourceLabel ? { label: sourceLabel } : {}) };
    }) }),
    ...(limitations === undefined ? {} : { limitations: limitations.map((text, index) => string(text, `${label}.limitations[${index}]`, 500)) }),
  };
}

function parseManifest(value: unknown): GalleryManifest {
  const input = record(value, "Manifest");
  if (input.schemaVersion !== 1) throw new Error("Manifest.schemaVersion must be 1.");
  if (!Array.isArray(input.studies) || input.studies.length < 1 || input.studies.length > 64) throw new Error("Manifest.studies must contain 1–64 studies.");
  const studies = input.studies.map((study, index) => parseStudy(study, `studies[${index}]`));
  const ids = new Set(studies.map(study => study.id));
  if (ids.size !== studies.length) throw new Error("Study IDs must be unique.");
  const hero = optionalString(input.hero, "Manifest.hero", 64);
  if (hero !== undefined && !ids.has(hero)) throw new Error("Manifest.hero must name a study ID.");
  const reel = input.reel === undefined ? undefined : parseStudy(input.reel, "Manifest.reel");
  if (reel && ids.has(reel.id)) throw new Error("The reel ID must differ from study IDs.");
  const intro = optionalString(input.intro, "Manifest.intro", 800);
  return { schemaVersion: 1, title: string(input.title, "Manifest.title", 160), studies,
    ...(hero === undefined ? {} : { hero }), ...(reel === undefined ? {} : { reel }), ...(intro === undefined ? {} : { intro }) };
}

function within(parent: string, path: string): boolean {
  const rel = relative(parent, path);
  return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith("../"));
}

async function sha256(path: string): Promise<string> {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest("hex");
}

function html(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function url(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function seconds(value: number): string {
  return `${Number(value.toFixed(2))} s`;
}

function rate(value: unknown): number | undefined {
  if (typeof value !== "string" || !/^\d+(?:\/\d+)?$/u.test(value)) return undefined;
  const [top, bottom = "1"] = value.split("/");
  const result = Number(top) / Number(bottom);
  return Number.isFinite(result) && result > 0 ? result : undefined;
}

async function probeVideo(path: string): Promise<PreparedStudy["facts"]> {
  const child = Bun.spawn(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,width,height,avg_frame_rate:format=duration", "-of", "json", path],
    { cwd: root, stdout: "pipe", stderr: "pipe" });
  const timer = setTimeout(() => child.kill(), 30_000);
  try {
    const [status, output, error] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    if (status !== 0) throw new Error(`ffprobe failed (${status}): ${error.slice(-1600)}`);
    const result = record(JSON.parse(output) as unknown, "ffprobe result");
    if (!Array.isArray(result.streams)) throw new Error("ffprobe returned no streams.");
    const streams = result.streams.map((stream, i) => record(stream, `ffprobe stream ${i}`));
    const videos = streams.filter(stream => stream.codec_type === "video");
    if (videos.length !== 1) throw new Error("Each selected film must have one video stream.");
    const stream = videos[0]!;
    const format = record(result.format, "ffprobe format");
    return { source: "ffprobe", width: number(stream.width, "Video width", 16, 8192, true),
      height: number(stream.height, "Video height", 16, 8192, true),
      durationSeconds: number(Number(format.duration), "Video duration", .01, 600), frameRate: rate(stream.avg_frame_rate) };
  } finally { clearTimeout(timer); }
}

function media(item: PreparedStudy, className = ""): string {
  const { study, video, poster } = item;
  const type = extname(video.output) === ".webm" ? "video/webm" : "video/mp4";
  const caption = item.captions ? `<track kind="captions" src="${url(item.captions.output)}" srclang="${html(study.captionLanguage ?? "en")}" label="Captions" default>` : "";
  return `<div class="picture ${className}" style="--frame:${study.width} / ${study.height}">
    <video id="film-${study.id}" controls loop playsinline preload="none" poster="${url(poster.output)}" width="${study.width}" height="${study.height}" aria-labelledby="title-${study.id}" aria-describedby="description-${study.id}">
      <source src="${url(video.output)}" type="${type}">${caption}
      <p>Your browser cannot play this film. <a href="${url(video.output)}">Open ${html(study.title)}</a>.</p>
    </video>
  </div>`;
}

function details(item: PreparedStudy): string {
  const { study, facts } = item;
  const dimensions = `${facts.width} × ${facts.height}`;
  const source = facts.source === "ffprobe" ? "Dimensions and duration read with ffprobe." : "Dimensions and duration supplied in the selected manifest.";
  const sources = item.sources.length ? `<ul class="source-list">${item.sources.map(({ file, label }) => `<li><a href="${url(file.output)}" download>${html(label)}</a></li>`).join("")}</ul>` : "";
  const limitations = study.limitations?.length ? `<ul>${study.limitations.map(text => `<li>${html(text)}</li>`).join("")}</ul>` : "";
  return `<details><summary>Source &amp; render details</summary><div class="detail-body">
    <p>${html(study.method)}. ${html(source)}</p>
    <dl><div><dt>Style</dt><dd>${html(study.style)}</dd></div><div><dt>Film</dt><dd>${dimensions} · ${seconds(facts.durationSeconds)}${facts.frameRate ? ` · ${Number(facts.frameRate.toFixed(3))} fps` : ""}</dd></div></dl>
    ${limitations}<p><a href="${url(item.receipt.output)}" download>Execution receipt</a> <span aria-hidden="true">·</span> <a href="metadata/${study.id}.json">File metadata</a></p>${sources}
  </div></details>`;
}

function caption(item: PreparedStudy, level: "h1" | "h2" | "h3"): string {
  const { study, facts } = item;
  return `<div class="caption"><${level} id="title-${study.id}">${html(study.title)}</${level}>
    <p id="description-${study.id}" class="description">${html(study.description)}</p>
    <p class="method">${html(study.method)}</p>
    <p class="media-facts">${facts.width} × ${facts.height} <span aria-hidden="true">·</span> ${seconds(facts.durationSeconds)} <span aria-hidden="true">·</span> <a href="${url(item.video.output)}" download>Download film</a></p>
    <p class="media-facts"><a href="${url(item.poster.output)}" download>Download still</a></p>
    ${study.reviewPoints?.length ? `<div class="review-points" aria-label="Inspect a moment in ${html(study.title)}">${study.reviewPoints.map(point => `<button type="button" data-study="${study.id}" data-time="${point.timeSeconds}">${html(point.label)} <span>${seconds(point.timeSeconds)}</span></button>`).join("")}</div>` : ""}
    ${study.brief ? `<details><summary>Make a variation</summary><div class="detail-body"><p>${html(study.brief)}</p><p>For a revision, name the time, the change, and what must remain unchanged. Keep the editable source with its media.</p></div></details>` : ""}
    ${details(item)}</div>`;
}

function document(manifest: GalleryManifest, prepared: PreparedStudy[], reel: PreparedStudy | undefined, font: SelectedFile): string {
  const hero = prepared.find(item => item.study.id === manifest.hero) ?? prepared[0]!;
  const remaining = prepared.filter(item => item !== hero);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="description" content="${html(manifest.intro ?? manifest.title)}">
<title>${html(manifest.title)} · Slopcamera</title>
<style>
@font-face{font-family:Portfolio Serif;src:url('${url(font.output)}') format('woff2');font-weight:400;font-style:normal;font-display:swap}
:root{--paper:#faf8f3;--ink:#171612;--muted:#625d54;--line:#d9d4c9;--accent:#754900;--space:clamp(1.2rem,3.6vw,3.5rem);--serif:'Portfolio Serif',Georgia,serif;--sans:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color-scheme:light}
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:2rem}body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);font-size:15px;line-height:1.6}::selection{background:#ded1b5;color:var(--ink)}a{color:inherit;text-underline-offset:.23em;text-decoration-thickness:1px}a:hover{color:var(--accent)}a:focus-visible,summary:focus-visible,video:focus-visible{outline:2px solid var(--accent);outline-offset:5px}p{margin:0}h1,h2,h3{font-family:var(--serif);font-weight:400;line-height:1.06;letter-spacing:-.012em;text-wrap:balance;margin:0}h1{font-size:clamp(2.1rem,3.6vw,3.8rem)}h2{font-size:clamp(2rem,3.5vw,3.6rem)}h3{font-size:clamp(1.7rem,2.1vw,2.3rem)}.skip{position:absolute;left:var(--space);top:-6rem;padding:.7rem;background:var(--paper);z-index:2}.skip:focus{top:1rem}.shell{max-width:1540px;margin-inline:auto;padding-inline:var(--space)}.masthead{min-height:76px;display:flex;align-items:center;justify-content:space-between;gap:1.5rem;padding-block:1rem}.wordmark{font-size:19px;font-weight:650;letter-spacing:-.035em;text-decoration:none}.masthead nav{display:flex;gap:1.4rem;font-size:13px}.opening{display:grid;grid-template-columns:minmax(0,3.2fr) minmax(225px,1fr);gap:clamp(1.5rem,3vw,3.4rem);align-items:end;padding-block:.7rem 4rem}.picture{background:#171612;aspect-ratio:var(--frame);overflow:hidden}.picture video{display:block;width:100%;height:100%;object-fit:contain}.caption{min-width:0}.caption .description{margin-top:.9rem;max-width:60ch;font-size:15px;line-height:1.6}.method{margin-top:1.2rem;color:var(--muted);font-size:12px;line-height:1.5}.media-facts{margin-top:.35rem;color:var(--muted);font-size:12px;line-height:1.8;font-variant-numeric:tabular-nums}.media-facts span{margin-inline:.3rem}.collection-heading{display:flex;align-items:baseline;justify-content:space-between;gap:2rem;margin:3rem 0 2.1rem;padding-top:2rem;border-top:1px solid var(--line)}.collection-heading p{max-width:49ch;color:var(--muted);font-size:14px}.studies{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:clamp(1.3rem,3.5vw,3.7rem);row-gap:4.2rem}.study .caption{margin-top:1.1rem}.study .description{max-width:58ch}.study .method{margin-top:.75rem}details{margin-top:1rem;color:var(--muted);font-size:12px;line-height:1.65}summary{cursor:pointer;width:fit-content;text-decoration:underline;text-underline-offset:.23em;padding:.2rem 0;list-style:disclosure-closed}details[open] summary{list-style:disclosure-open}.detail-body{padding-top:.6rem;max-width:66ch;overflow-wrap:anywhere}.detail-body p+p{margin-top:.7rem}.detail-body dl{margin:.75rem 0}.detail-body dl>div{display:grid;grid-template-columns:3.5rem minmax(0,1fr);gap:.75rem}.detail-body dd{margin:0}.detail-body ul{padding-left:1.1rem}.source-list{margin:.6rem 0 0}.reel{margin-top:5.5rem;padding-top:2rem;border-top:1px solid var(--line)}.reel-layout{display:grid;grid-template-columns:minmax(0,2.7fr) minmax(220px,1fr);align-items:end;gap:2rem;margin-top:1.7rem}.site-footer{margin-top:5.5rem;padding-block:1.8rem 2.6rem;border-top:1px solid var(--line);display:flex;justify-content:space-between;gap:2rem;font-size:12px;color:var(--muted)}.site-footer p{max-width:65ch}.footer-links{display:flex;gap:1.3rem;align-items:baseline;flex-wrap:wrap}body{scrollbar-color:#aaa18f var(--paper);scrollbar-width:thin}
.review-points{display:flex;gap:.5rem 1rem;flex-wrap:wrap;margin-top:.8rem}.review-points button{font:inherit;font-size:12px;background:none;border:0;border-bottom:1px solid var(--line);color:var(--ink);padding:.2rem 0;cursor:pointer}.review-points button span{color:var(--muted);margin-left:.25rem;font-variant-numeric:tabular-nums}.review-points button:hover{border-color:var(--accent);color:var(--accent)}.review-points button:focus-visible{outline:2px solid var(--accent);outline-offset:4px}
@media(max-width:1000px){.opening{grid-template-columns:minmax(0,2fr) minmax(220px,1fr)}.masthead{min-height:64px}.reel-layout{grid-template-columns:1fr}.opening .caption .description{font-size:14px}}
@media(max-width:720px){.opening{display:flex;flex-direction:column;align-items:stretch;gap:1.25rem;padding-bottom:1rem}.opening .caption{display:block}.opening .caption h1{font-size:2.8rem}.masthead{font-size:12px;gap:1rem}.masthead nav{gap:1rem}.studies{grid-template-columns:1fr;row-gap:3rem}.collection-heading{display:block;margin-top:2.6rem}.collection-heading p{margin-top:.9rem}.study .caption{margin-top:1rem}.site-footer{flex-direction:column;gap:1rem;margin-top:3.5rem}.reel{margin-top:3.5rem}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
@media(forced-colors:active){.picture{border:1px solid CanvasText}a:focus-visible,summary:focus-visible,video:focus-visible{outline-color:Highlight}}
</style></head><body id="top"><a class="skip" href="#collection">Skip to the collection</a>
<div class="shell"><header class="masthead"><a class="wordmark" href="#top">Slopcamera</a><nav aria-label="Portfolio"><a href="#collection">The studies</a>${reel ? '<a href="#reel">Watch the reel</a>' : ""}</nav></header>
<main><section class="opening" aria-labelledby="title-${hero.study.id}">${media(hero)}${caption(hero, "h1")}</section>
<section id="collection" aria-labelledby="collection-title"><div class="collection-heading"><h2 id="collection-title">${html(manifest.title)}</h2><p>${html(manifest.intro ?? "Original scenes in different visual languages. Play a film to see its timing; open its source to see how it was made.")}</p></div>
<div class="studies">${remaining.map(item => `<article class="study" aria-labelledby="title-${item.study.id}">${media(item)}${caption(item, "h3")}</article>`).join("\n")}</div></section>
${reel ? `<section class="reel" id="reel" aria-labelledby="reel-heading"><h2 id="reel-heading">The collection in motion</h2><div class="reel-layout">${media(reel)}${caption(reel, "h3")}</div></section>` : ""}
</main><footer class="site-footer"><p>Authored studies made with Slopcamera. Each film retains its production method, source files, and execution evidence.</p><div class="footer-links"><a href="manifest.json">Selected works</a><a href="gallery-receipt.json">Assembly record</a><a href="font-license.txt">Type license</a><a href="#top">Back to top</a></div></footer></div>
<script>
// User-initiated playback only. One film owns motion and audio at a time.
const films = Array.from(document.querySelectorAll('video'));
for (const film of films) film.addEventListener('play', () => { for (const other of films) if (other !== film) other.pause(); });
for (const button of document.querySelectorAll('[data-study][data-time]')) button.addEventListener('click', () => {
  const film = document.getElementById('film-' + button.dataset.study);
  film.pause();
  const seek = () => { film.currentTime = Number(button.dataset.time); film.focus(); };
  if (film.readyState >= 1) seek();
  else { film.addEventListener('loadedmetadata', seek, { once: true }); film.preload = 'metadata'; film.load(); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) for (const film of films) film.pause(); });
</script></body></html>\n`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const positional: string[] = [];
  let trustManifest = false;
  for (const arg of args) {
    if (arg === "--trust-manifest" && !trustManifest) trustManifest = true;
    else if (arg.startsWith("--")) throw new Error(`Unknown or duplicate flag: ${arg}`);
    else positional.push(arg);
  }
  if (positional.length < 1 || positional.length > 2) throw new Error("Usage: bun examples/style-portfolio/build-gallery.ts <manifest.json> [new-artifacts-directory] [--trust-manifest]");
  const canonicalRoot = await realpath(root);
  const manifestPath = await realpath(resolve(positional[0]!));
  const manifestStat = await stat(manifestPath);
  if (!manifestStat.isFile() || manifestStat.size > maxManifestBytes) throw new Error("Manifest must be a regular file no larger than 1 MiB.");
  const manifestBytes = await readFile(manifestPath);
  const manifest = parseManifest(JSON.parse(manifestBytes.toString("utf8")) as unknown);
  const base = dirname(manifestPath);
  const output = resolve(positional[1] ?? resolve(root, "artifacts/style-portfolio/gallery"));
  const artifactsRoot = resolve(canonicalRoot, "artifacts");
  if (output === artifactsRoot || !within(artifactsRoot, output)) throw new Error("Choose a new output directory strictly inside this repository's artifacts directory.");
  const selected = new Map<string, SelectedFile>();
  let totalBytes = 0;

  async function select(path: string, folder: string, extensions: ReadonlySet<string>, maxBytes: number): Promise<SelectedFile> {
    const input = await realpath(resolve(base, path));
    if (!within(canonicalRoot, input)) throw new Error(`Selected input is outside this worktree: ${path}`);
    if (within(resolve(canonicalRoot, "artifacts/style-portfolio/reference"), input)) throw new Error(`Reference material is not a portfolio deliverable: ${path}`);
    if (relative(canonicalRoot, input).split("/").some(part => part.startsWith("."))) throw new Error(`Hidden input paths are not admitted: ${path}`);
    const extension = extname(input).toLowerCase();
    if (!extensions.has(extension)) throw new Error(`Unsupported ${folder} extension for ${path}.`);
    const info = await stat(input);
    if (!info.isFile() || info.size < 1 || info.size > maxBytes) throw new Error(`Selected ${folder} file has an unsupported size: ${path}`);
    const existing = selected.get(input);
    if (existing) return existing;
    totalBytes += info.size;
    if (totalBytes > maxTotalBytes || selected.size >= 512) throw new Error("Selection exceeds 3 GiB or 512 unique files.");
    const hash = await sha256(input);
    const stem = basename(input, extname(input)).toLowerCase().replace(/[^a-z0-9-]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 55) || "file";
    const file = { input, output: `${folder}/${stem}-${hash.slice(0, 16)}${extension}`, sha256: hash, bytes: info.size };
    selected.set(input, file);
    return file;
  }

  async function prepare(study: GalleryStudy): Promise<PreparedStudy> {
    const video = await select(study.video, "films", new Set([".mp4", ".m4v", ".webm"]), 512 * 1024 * 1024);
    const poster = await select(study.poster, "posters", new Set([".png", ".jpg", ".jpeg", ".webp"]), 32 * 1024 * 1024);
    const receipt = await select(study.receipt, "receipts", new Set([".json"]), 4 * 1024 * 1024);
    // Validate JSON without interpreting or following any embedded paths.
    JSON.parse(await readFile(receipt.input, "utf8")) as unknown;
    const facts: PreparedStudy["facts"] = trustManifest
      ? { source: "supplied-manifest", width: study.width, height: study.height, durationSeconds: study.durationSeconds, frameRate: study.frameRate }
      : await probeVideo(video.input);
    if (facts.width !== study.width || facts.height !== study.height || Math.abs(facts.durationSeconds - study.durationSeconds) > .15
      || (study.frameRate !== undefined && (facts.frameRate === undefined || Math.abs(facts.frameRate - study.frameRate) > .05))) {
      throw new Error(`Media facts differ from the manifest for ${study.id}. Inspect the selected file and correct the manifest.`);
    }
    const sources: PreparedStudy["sources"] = [];
    for (const source of study.sourceFiles ?? []) {
      const file = await select(source.path, "sources", sourceExtensions, 8 * 1024 * 1024);
      sources.push({ label: source.label ?? basename(source.path), file });
    }
    const captions = study.captions ? await select(study.captions, "captions", new Set([".vtt"]), 1024 * 1024) : undefined;
    return { study, video, poster, receipt, sources, captions, facts };
  }

  const prepared: PreparedStudy[] = [];
  for (const study of manifest.studies) prepared.push(await prepare(study));
  const reel = manifest.reel ? await prepare(manifest.reel) : undefined;
  const font = await select(resolve(root, "examples/style-portfolio/assets/instrument-serif-latin-400.woff2"), "fonts", new Set([".woff2"]), 1024 * 1024);
  const license = await select(resolve(root, "examples/style-portfolio/assets/instrument-serif-OFL.txt"), "licenses", new Set([".txt"]), 1024 * 1024);
  // Validate the existing ancestor before creating anything. A new output
  // directory is the claim; an existing or incomplete gallery is never reused.
  let ancestor = dirname(output);
  for (;;) {
    try {
      if (await realpath(ancestor) !== ancestor) throw new Error("Output ancestors must not be symlinks.");
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      ancestor = dirname(ancestor);
    }
  }
  await mkdir(dirname(output), { recursive: true });
  if (await realpath(dirname(output)) !== dirname(output)) throw new Error("Output parents must not be symlinks.");
  await mkdir(output);
  await writeFile(resolve(output, "assembly-intent.json"), JSON.stringify({ kind: "slopcamera.style-gallery-intent", schemaVersion: 1,
    selectionSha256: createHash("sha256").update(manifestBytes).digest("hex"), selectedFiles: selected.size, bytes: totalBytes,
    metadataSource: trustManifest ? "supplied-manifest" : "ffprobe", state: "assembly-started" }, null, 2) + "\n", { flag: "wx" });
  const copied = new Set<string>();
  for (const file of selected.values()) {
    if (copied.has(file.output)) continue;
    const destination = resolve(output, file.output);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(file.input, destination, constants.COPYFILE_EXCL);
    if (await sha256(destination) !== file.sha256) throw new Error(`Selected source changed during copying: ${file.input}. Retain this incomplete assembly for inspection.`);
    copied.add(file.output);
  }
  await copyFile(resolve(output, license.output), resolve(output, "font-license.txt"), constants.COPYFILE_EXCL);
  await mkdir(resolve(output, "metadata"));
  function portable(item: PreparedStudy) {
    const { study } = item;
    return { id: study.id, title: study.title, style: study.style, description: study.description, method: study.method,
      video: item.video.output, poster: item.poster.output, width: item.facts.width, height: item.facts.height,
      durationSeconds: item.facts.durationSeconds, ...(item.facts.frameRate ? { frameRate: item.facts.frameRate } : {}),
      receipt: item.receipt.output, sourceFiles: item.sources.map(({ file, label }) => ({ path: file.output, label })),
      ...(study.limitations ? { limitations: study.limitations } : {}),
      ...(study.brief ? { brief: study.brief } : {}),
      ...(study.reviewPoints ? { reviewPoints: study.reviewPoints } : {}),
      ...(item.captions ? { captions: item.captions.output, captionLanguage: study.captionLanguage ?? "en" } : {}) };
  }
  for (const item of [...prepared, ...(reel ? [reel] : [])]) {
    await writeFile(resolve(output, "metadata", `${item.study.id}.json`), JSON.stringify({ kind: "slopcamera.style-gallery-study", schemaVersion: 1,
      ...portable(item), facts: item.facts, files: [item.video, item.poster, item.receipt, ...item.sources.map(source => source.file), ...(item.captions ? [item.captions] : [])]
        .map(file => ({ path: file.output, bytes: file.bytes, sha256: file.sha256 })) }, null, 2) + "\n", { flag: "wx" });
  }
  const portableManifest = { schemaVersion: 1, title: manifest.title, ...(manifest.intro ? { intro: manifest.intro } : {}),
    hero: manifest.hero ?? prepared[0]!.study.id, studies: prepared.map(portable), ...(reel ? { reel: portable(reel) } : {}) };
  await writeFile(resolve(output, "manifest.json"), JSON.stringify(portableManifest, null, 2) + "\n", { flag: "wx" });
  await writeFile(resolve(output, "gallery-receipt.json"), JSON.stringify({ kind: "slopcamera.style-gallery-receipt", schemaVersion: 1,
    selectionSha256: createHash("sha256").update(manifestBytes).digest("hex"), studyCount: prepared.length,
    hasReel: Boolean(reel), metadataSource: trustManifest ? "supplied-manifest" : "ffprobe",
    files: [...selected.values()].map(file => ({ path: file.output, bytes: file.bytes, sha256: file.sha256 })),
    limitations: ["File hashes establish copied bytes; they do not establish visual quality or historical accuracy.",
      "Execution receipts are preserved as selected and may refer to original workspace paths. Embedded receipt paths are not followed."] }, null, 2) + "\n", { flag: "wx" });
  // The entrypoint is written last, after every selected asset and record.
  await writeFile(resolve(output, "index.html"), document(manifest, prepared, reel, font), { flag: "wx" });
  console.log(JSON.stringify({ output, entrypoint: resolve(output, "index.html"), studies: prepared.length, files: copied.size,
    bytes: totalBytes, metadataSource: trustManifest ? "supplied-manifest" : "ffprobe" }));
}

if (import.meta.main) await main();
