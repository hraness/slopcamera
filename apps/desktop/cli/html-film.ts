/**
 * Launch-film tooling around `html render`: stills and contact-sheet previews
 * from the real injected overlay runtime, and web delivery of a rendered film.
 */
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { z } from "zod";

import type { ApplicationContext } from "../application/context";
import {
  bindExactCapabilities, ExactCapabilityApplicationRunner, type ExactCapabilityBinding,
} from "../application/capability-binding";
import { bindHtmlOverlayBrowserRuntime } from "../application/html-overlay-browser-runtime";
import { createNodeBundleFileSystem } from "../core/storage";
import { CliError } from "./errors";
import { readHtmlSceneSource } from "./html-scene";
import { ensurePhysicalPrivateDirectoryWithin } from "./paths";
import { HTML_FILM_CUTS, type HtmlFilmCommand, type HtmlFilmCut } from "./html-film-names";
import { readSpatialJson } from "./spatial-scene-service";

export { HTML_FILM_CUTS, type HtmlFilmCommand, type HtmlFilmCut };

const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const MAX_STILLS = 120;
const PROCESS_TIMEOUT_MS = 10 * 60_000;

export interface HtmlFilmDependencies {
  readonly bindBrowser?: typeof bindHtmlOverlayBrowserRuntime;
  readonly bindTools?: typeof bindExactCapabilities;
  readonly progress?: (message: string) => void;
}

/** Web delivery budgets in bytes. A file over its budget fails the command. */
export const HTML_FILM_BUDGETS = { mp4: 12_000_000, webm: 10_000_000, jpg: 250_000 } as const;

/** Per-beat clip length bounds in seconds, sized for social posts. */
export const BEAT_CLIP_SECONDS = { min: 6, max: 10 } as const;

// Frame selection

export interface HtmlFilmFrameSelection {
  /** Requested time in seconds, in the order given. */
  readonly at: number;
  readonly frame: number;
}

/**
 * Maps requested seconds onto frame indexes. Times past the end land on the
 * last frame. The renderer needs its frames distinct and ascending, so
 * `frames` is sorted and deduplicated while `selection` keeps request order.
 */
export function selectHtmlFilmFrames(
  at: readonly number[],
  fps: number,
  frameCount: number,
): { readonly selection: readonly HtmlFilmFrameSelection[]; readonly frames: readonly number[] } {
  if (at.length === 0) throw new CliError("usage", "Name at least one time in seconds.");
  if (at.length > MAX_STILLS) throw new CliError("usage", `Name at most ${String(MAX_STILLS)} times.`);
  const selection = at.map(seconds => {
    if (!Number.isFinite(seconds) || seconds < 0) throw new CliError("usage", `Times must be seconds at or after 0; got ${String(seconds)}.`);
    return { at: seconds, frame: Math.min(frameCount - 1, Math.round(seconds * fps)) };
  });
  const frames = [...new Set(selection.map(item => item.frame))].sort((a, b) => a - b);
  return { selection, frames };
}

/** Times for a preview contact sheet: 0, every, 2*every, … before the end. */
export function previewTimes(durationSeconds: number, every: number): readonly number[] {
  if (!(every > 0)) throw new CliError("usage", "--every must be more than 0 seconds.");
  const times: number[] = [];
  for (let index = 0; index * every < durationSeconds && times.length < MAX_STILLS; index++) {
    times.push(Math.round(index * every * 1000) / 1000);
  }
  return times;
}

export function stillFileName(seconds: number): string {
  return `still-${seconds.toFixed(2).padStart(6, "0")}s.png`;
}

// Delivery planning

export interface HtmlFilmBeat { readonly id: string; readonly start: number; readonly end: number; readonly caption?: string | undefined }

export const HtmlFilmBeatsSchema = z.object({
  duration: z.number().positive(),
  beats: z.array(z.object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/u),
    start: z.number().min(0),
    end: z.number().positive(),
    caption: z.string().max(2000).optional(),
  }).refine(beat => beat.end > beat.start, "A beat must end after it starts.")).min(1).max(64),
});

/**
 * A 6 to 10 second window for each beat. Short beats grow forward (or back,
 * near the end) so the clip holds the whole beat plus what follows. Beats
 * that start at or after the rendered duration are left out.
 */
export function beatClipWindows(beats: readonly HtmlFilmBeat[], duration: number): readonly HtmlFilmBeat[] {
  // A draft render can be shorter than the beats file; a beat the film never
  // reaches has no clip rather than a copy of the film's last seconds.
  return beats.filter(beat => beat.start < duration).map(beat => {
    const length = Math.min(BEAT_CLIP_SECONDS.max, Math.max(BEAT_CLIP_SECONDS.min, beat.end - beat.start), duration);
    const start = Math.max(0, Math.min(beat.start, duration - length));
    return { ...beat, start: round3(start), end: round3(start + length) };
  });
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export type HtmlFilmDeliverableRole = "mp4" | "webm" | "poster" | "social" | "cut" | "clip";

export interface HtmlFilmDeliverable {
  readonly role: HtmlFilmDeliverableRole;
  readonly file: string;
  readonly budget: number;
  /** ffmpeg arguments after the executable; `{input}` and `{passlog}` are filled at run time. */
  readonly passes: readonly (readonly string[])[];
  readonly beat?: string;
  readonly cut?: HtmlFilmCut;
}

const CUT_SIZES: Readonly<Record<HtmlFilmCut, readonly [number, number]>> = {
  "1:1": [1080, 1080],
  "4:5": [1080, 1350],
  "9:16": [1080, 1920],
};

const H264 = ["-an", "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-tune", "animation",
  "-pix_fmt", "yuv420p", "-profile:v", "high", "-movflags", "+faststart"] as const;

function seconds(value: number): string {
  return value.toFixed(3);
}

/**
 * The files `html deliver` writes, in order, with their ffmpeg arguments.
 * Pure, so the encode settings and budgets are testable without media.
 */
export function planHtmlFilmDelivery(options: {
  readonly basename: string;
  readonly duration: number;
  readonly posterAt: number;
  readonly socialAt: number;
  readonly cuts: readonly HtmlFilmCut[];
  readonly beats?: readonly HtmlFilmBeat[];
}): readonly HtmlFilmDeliverable[] {
  const name = options.basename;
  if (!/^[a-z0-9][a-z0-9._-]{0,80}$/u.test(name)) {
    throw new CliError("usage", "--basename must be lowercase letters, digits, dots, dashes or underscores.");
  }
  for (const [flag, value] of [["--poster-at", options.posterAt], ["--social-at", options.socialAt]] as const) {
    if (!(value >= 0 && value < options.duration)) {
      throw new CliError("usage", `${flag} must be within the film, 0 to ${seconds(options.duration)} seconds.`);
    }
  }
  const still = (at: number, filter?: string): readonly string[] => [
    "-ss", seconds(at), "-i", "{input}", "-frames:v", "1", ...(filter === undefined ? [] : ["-vf", filter]), "-q:v", "4",
  ];
  const vp9 = ["-i", "{input}", "-an", "-c:v", "libvpx-vp9", "-crf", "36", "-b:v", "0", "-row-mt", "1", "-pix_fmt", "yuv420p"];
  const out: HtmlFilmDeliverable[] = [
    { role: "mp4", file: `${name}.mp4`, budget: HTML_FILM_BUDGETS.mp4, passes: [["-i", "{input}", ...H264]] },
    {
      role: "webm", file: `${name}.webm`, budget: HTML_FILM_BUDGETS.webm, passes: [
        [...vp9, "-pass", "1", "-passlogfile", "{passlog}", "-f", "null"],
        [...vp9, "-pass", "2", "-passlogfile", "{passlog}"],
      ],
    },
    { role: "poster", file: `${name}-poster.jpg`, budget: HTML_FILM_BUDGETS.jpg, passes: [still(options.posterAt)] },
    {
      role: "social", file: `${name}-social.jpg`, budget: HTML_FILM_BUDGETS.jpg,
      passes: [still(options.socialAt, "scale=1200:630:force_original_aspect_ratio=increase,crop=1200:630")],
    },
  ];
  for (const cut of [...new Set(options.cuts)]) {
    const [width, height] = CUT_SIZES[cut];
    // The whole frame stays visible over a blurred fill, so no copy is cropped.
    const filter = `split[a][b];[a]scale=${String(width)}:${String(height)}:force_original_aspect_ratio=increase,crop=${String(width)}:${String(height)},boxblur=40:2,eq=brightness=-0.08[bg];`
      + `[b]scale=${String(width)}:${String(height)}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1`;
    out.push({
      role: "cut", cut, file: `${name}-${cut.replace(":", "x")}.mp4`, budget: HTML_FILM_BUDGETS.mp4,
      passes: [["-i", "{input}", "-filter_complex", filter, ...H264]],
    });
  }
  for (const beat of beatClipWindows(options.beats ?? [], options.duration)) {
    out.push({
      role: "clip", beat: beat.id, file: `${name}-${beat.id}.mp4`, budget: HTML_FILM_BUDGETS.mp4,
      passes: [["-ss", seconds(beat.start), "-t", seconds(beat.end - beat.start), "-i", "{input}", ...H264]],
    });
  }
  return out;
}

export interface HtmlFilmDeliveredFile {
  readonly role: HtmlFilmDeliverableRole;
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly budget: number;
  readonly withinBudget: boolean;
  readonly beat?: string;
  readonly cut?: HtmlFilmCut;
}

export function formatDeliveryLine(file: HtmlFilmDeliveredFile): string {
  const size = (bytes: number) => bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(2)} MB` : `${String(Math.round(bytes / 1000))} KB`;
  return `${file.withinBudget ? "ok  " : "OVER"} ${basename(file.path)} ${size(file.bytes)} (max ${size(file.budget)})`;
}

// Execution

const ExportSchema = z.object({
  kind: z.literal("slopcamera.html-scene-export"),
  output: z.object({ path: z.string().min(1), bytes: z.number().int().positive(), sha256: z.string().regex(/^[0-9a-f]{64}$/u) }),
});

const ProbeSchema = z.object({ format: z.object({ duration: z.string() }) });

async function sha256File(path: string): Promise<{ readonly bytes: number; readonly sha256: string }> {
  const data = await readFile(path);
  return { bytes: data.byteLength, sha256: createHash("sha256").update(data).digest("hex") };
}

async function outputDirectory(application: ApplicationContext, requested: string): Promise<string> {
  const root = application.paths.repositoryRoot;
  const absolute = resolve(root, requested);
  const inside = relative(root, absolute);
  if (inside === "" || inside.startsWith("..") || isAbsolute(inside)) {
    throw new CliError("unsafe-path", `The output directory must be inside ${root}.`);
  }
  await mkdir(absolute, { recursive: true });
  const real = await realpath(absolute);
  const realInside = relative(root, real);
  if (realInside === "" || realInside.startsWith("..") || isAbsolute(realInside)) {
    throw new CliError("unsafe-path", "The output directory resolves outside the project.");
  }
  return real;
}

async function requireLease(application: ApplicationContext, signal: AbortSignal, command: string): Promise<void> {
  if (signal.aborted) throw new CliError("cancelled", `${command} was cancelled.`);
  if (application.hostResourceLease === undefined) throw new CliError("unavailable", `${command} requires an admitted host-resource lease.`);
  await application.hostResourceLease.assertOwned();
}

function capabilityRunner(application: ApplicationContext, tools: readonly ExactCapabilityBinding[], signal: AbortSignal) {
  const runner = new ExactCapabilityApplicationRunner(application.runner, tools, application.paths.privateRoot);
  const tool = (name: string): string => {
    const found = tools.find(candidate => candidate.name === name);
    if (found === undefined) throw new CliError("unavailable", `Missing capability: ${name}`);
    return found.command;
  };
  const run = async (argv: readonly [string, ...string[]]) => {
    await requireLease(application, signal, "The film step");
    const result = await runner.run(argv, {
      abortSignal: signal, timeoutMs: PROCESS_TIMEOUT_MS, maxOutputBytes: 1024 * 1024,
      ...(application.hostResourceLease === undefined ? {} : { inheritedFileDescriptors: application.hostResourceLease.inheritedFileDescriptors }),
    });
    if (result.exitCode !== 0) throw new CliError("subprocess", `A film media step failed: ${result.stderr.trim().slice(0, 1000) || String(result.exitCode)}`);
    return result;
  };
  return { tool, run };
}

/** Renders the selected frames of a scene with the real overlay runtime. */
async function renderSceneFrames(
  application: ApplicationContext,
  inputPath: string,
  times: readonly number[],
  signal: AbortSignal,
  dependencies: HtmlFilmDependencies,
  extraTools: readonly ("ffmpeg")[] = [],
) {
  await requireLease(application, signal, "Rendering stills");
  const input = await readSpatialJson(resolve(application.paths.repositoryRoot, inputPath), MAX_REQUEST_BYTES);
  const source = await readHtmlSceneSource(application, input, signal);
  if (application.htmlOverlayRenderer === undefined) throw new CliError("unavailable", "The HTML scene renderer is unavailable.");
  const { selection, frames } = selectHtmlFilmFrames(times, source.request.timing.fps, source.frameCount);
  const tools = await (dependencies.bindTools ?? bindExactCapabilities)(application, ["html-browser", ...extraTools]);
  const browserTool = tools.find(candidate => candidate.name === "html-browser");
  if (browserTool === undefined) throw new CliError("unavailable", "Missing capability: html-browser");
  dependencies.progress?.("browser");
  const browserRuntime = await (dependencies.bindBrowser ?? bindHtmlOverlayBrowserRuntime)(browserTool, signal);
  const jobDirectory = await ensurePhysicalPrivateDirectoryWithin(application.paths.repositoryRoot,
    `artifacts/slopcamera/generated/html-stills/stills_${randomUUID().replaceAll("-", "")}`);
  const rootFs = createNodeBundleFileSystem(application.paths.repositoryRoot);
  await ensurePhysicalPrivateDirectoryWithin(jobDirectory, "source");
  const resources = [];
  for (const { declaration, loaded } of source.resources) {
    const destination = join(jobDirectory, "source", `${declaration.name}-${loaded.artifact.sha256}`);
    await rootFs.copyFileNoReplace!(loaded.artifact.path, relative(application.paths.repositoryRoot, destination), loaded.artifact,
      async () => { await requireLease(application, signal, "Rendering stills"); });
    const { path: _path, ...resource } = declaration;
    resources.push({ ...resource, bytes: loaded.artifact.bytes, sha256: loaded.artifact.sha256, absolutePath: destination });
  }
  dependencies.progress?.("frames");
  const renderDirectory = await ensurePhysicalPrivateDirectoryWithin(jobDirectory, "render");
  const result = await application.htmlOverlayRenderer.renderFrames({
    authoring: source.authoring, browserRuntime, outputDirectory: renderDirectory, resources, frames,
    ...(source.request.executionProfile === undefined ? {} : { executionProfile: source.request.executionProfile }),
  }, signal);
  if (result.frameCount !== frames.length) throw new CliError("invalid-data", "The renderer returned a different number of stills than requested.");
  const framePath = (frame: number) => result.framePattern.replace("%08d", String(frame).padStart(8, "0"));
  return { source, selection, framePath, jobDirectory, tools };
}

export interface HtmlFilmStillsResult {
  readonly kind: "slopcamera.html-film-stills";
  readonly schemaVersion: 1;
  readonly scene: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly stills: readonly { readonly at: number; readonly frame: number; readonly path: string; readonly bytes: number; readonly sha256: string }[];
  readonly contactSheet?: string;
}

async function writeStills(
  application: ApplicationContext,
  command: { readonly input: string; readonly output: string },
  times: readonly number[],
  signal: AbortSignal,
  dependencies: HtmlFilmDependencies,
  contactSheet: boolean,
): Promise<HtmlFilmStillsResult> {
  const rendered = await renderSceneFrames(application, command.input, times, signal, dependencies, contactSheet ? ["ffmpeg"] : []);
  const directory = await outputDirectory(application, command.output);
  const stills = [];
  for (const item of rendered.selection) {
    const path = join(directory, stillFileName(item.at));
    await copyFile(rendered.framePath(item.frame), path);
    stills.push({ ...item, path: relative(application.paths.repositoryRoot, path), ...await sha256File(path) });
  }
  let sheet: string | undefined;
  if (contactSheet) {
    const { tool, run } = capabilityRunner(application, rendered.tools, signal);
    const sequence = await ensurePhysicalPrivateDirectoryWithin(rendered.jobDirectory, "sheet");
    for (const [index, item] of rendered.selection.entries()) {
      await copyFile(rendered.framePath(item.frame), join(sequence, `tile-${String(index).padStart(4, "0")}.png`));
    }
    const columns = Math.min(4, rendered.selection.length);
    const rows = Math.ceil(rendered.selection.length / columns);
    sheet = join(directory, "contact-sheet.png");
    dependencies.progress?.("contact sheet");
    await run([tool("ffmpeg"), "-nostdin", "-v", "error", "-y", "-framerate", "1", "-start_number", "0",
      "-i", join(sequence, "tile-%04d.png"), "-vf", `scale=480:-2,tile=${String(columns)}x${String(rows)}:padding=8:margin=8:color=0x111214`,
      "-frames:v", "1", sheet]);
    sheet = relative(application.paths.repositoryRoot, sheet);
  }
  return {
    kind: "slopcamera.html-film-stills", schemaVersion: 1, scene: command.input,
    width: rendered.source.width, height: rendered.source.height, fps: rendered.source.request.timing.fps,
    stills, ...(sheet === undefined ? {} : { contactSheet: sheet }),
  };
}

export interface HtmlFilmDeliveryResult {
  readonly kind: "slopcamera.html-film-delivery";
  readonly schemaVersion: 1;
  readonly source: { readonly path: string; readonly bytes: number; readonly sha256: string; readonly duration: number };
  readonly outputDirectory: string;
  readonly receipt: string;
  readonly files: readonly HtmlFilmDeliveredFile[];
  readonly withinBudget: boolean;
}

async function deliver(
  application: ApplicationContext,
  command: Extract<HtmlFilmCommand, { readonly action: "deliver" }>,
  signal: AbortSignal,
  dependencies: HtmlFilmDependencies,
): Promise<HtmlFilmDeliveryResult> {
  await requireLease(application, signal, "Delivering the film");
  const root = application.paths.repositoryRoot;
  const exportPath = resolve(root, command.exportPath);
  let exported: z.infer<typeof ExportSchema>;
  try {
    exported = ExportSchema.parse(JSON.parse(await readFile(exportPath, "utf8")) as unknown);
  } catch (error) {
    throw new CliError("invalid-data", `${command.exportPath} is not an html render --json export: ${error instanceof Error ? error.message : String(error)}`);
  }
  const master = resolve(root, exported.output.path);
  const actual = await sha256File(master).catch(() => {
    throw new CliError("not-found", `The rendered film is missing: ${exported.output.path}. Run html deliver from the directory html render ran in.`);
  });
  if (actual.sha256 !== exported.output.sha256 || actual.bytes !== exported.output.bytes) {
    throw new CliError("conflict", "The rendered film changed after its export receipt was written.");
  }
  const tools = await (dependencies.bindTools ?? bindExactCapabilities)(application, ["ffmpeg", "ffprobe"]);
  const { tool, run } = capabilityRunner(application, tools, signal);
  const probe = ProbeSchema.parse(JSON.parse((await run([tool("ffprobe"), "-v", "error", "-show_entries", "format=duration", "-of", "json", master])).stdout) as unknown);
  const duration = Number(probe.format.duration);
  if (!(duration > 0)) throw new CliError("invalid-data", "The rendered film has no duration.");
  let beats: readonly HtmlFilmBeat[] | undefined;
  if (command.perBeatClips) {
    const beatsPath = resolve(root, command.beats ?? join(dirname(command.exportPath), "beats.json"));
    try {
      beats = HtmlFilmBeatsSchema.parse(JSON.parse(await readFile(beatsPath, "utf8")) as unknown).beats;
    } catch (error) {
      throw new CliError("invalid-data", `--per-beat-clips needs a beats file (${relative(root, beatsPath)}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const plan = planHtmlFilmDelivery({
    basename: command.basename, duration, posterAt: command.posterAt, socialAt: command.socialAt, cuts: command.cuts,
    ...(beats === undefined ? {} : { beats }),
  });
  const directory = await outputDirectory(application, command.output ?? join(dirname(command.exportPath), "deliver"));
  const work = await ensurePhysicalPrivateDirectoryWithin(root, `artifacts/slopcamera/generated/html-deliver/deliver_${randomUUID().replaceAll("-", "")}`);
  const files: HtmlFilmDeliveredFile[] = [];
  for (const item of plan) {
    dependencies.progress?.(item.file);
    const destination = join(directory, item.file);
    for (const [index, pass] of item.passes.entries()) {
      const argv = pass.map(value => value === "{input}" ? master : value === "{passlog}" ? join(work, `${item.role}-pass`) : value);
      const last = index === item.passes.length - 1;
      await run([tool("ffmpeg"), "-nostdin", "-hide_banner", "-v", "error", "-y", "-threads", "2", ...argv, last ? destination : "/dev/null"]);
    }
    const measured = await sha256File(destination);
    files.push({
      role: item.role, path: relative(root, destination), ...measured, budget: item.budget, withinBudget: measured.bytes <= item.budget,
      ...(item.beat === undefined ? {} : { beat: item.beat }), ...(item.cut === undefined ? {} : { cut: item.cut }),
    });
  }
  const receiptPath = join(directory, `${command.basename}-receipt.json`);
  const withinBudget = files.every(file => file.withinBudget);
  const result: HtmlFilmDeliveryResult = {
    kind: "slopcamera.html-film-delivery", schemaVersion: 1,
    source: { path: exported.output.path, ...actual, duration },
    outputDirectory: relative(root, directory), receipt: relative(root, receiptPath), files, withinBudget,
  };
  await writeFile(receiptPath, `${JSON.stringify({ ...result, deliveredAt: application.clock.now().toISOString(), budgets: HTML_FILM_BUDGETS }, null, 2)}\n`);
  if ((await stat(receiptPath)).size === 0) throw new CliError("internal", "The delivery receipt is empty.");
  return result;
}

export async function executeHtmlFilmCommand(
  application: ApplicationContext,
  command: HtmlFilmCommand,
  signal: AbortSignal,
  dependencies: HtmlFilmDependencies = {},
): Promise<HtmlFilmStillsResult | HtmlFilmDeliveryResult> {
  switch (command.action) {
    case "still":
      return await writeStills(application, command, command.at, signal, dependencies, false);
    case "preview": {
      const input = await readSpatialJson(resolve(application.paths.repositoryRoot, command.input), MAX_REQUEST_BYTES);
      const source = await readHtmlSceneSource(application, input, signal);
      return await writeStills(application, command, previewTimes(source.durationUs / 1_000_000, command.every), signal, dependencies, true);
    }
    case "deliver":
      return await deliver(application, command, signal, dependencies);
  }
}

export function formatHtmlFilmResult(result: HtmlFilmStillsResult | HtmlFilmDeliveryResult): string {
  if (result.kind === "slopcamera.html-film-stills") {
    return [
      ...result.stills.map(still => `${still.path} (${still.at.toFixed(2)} s, frame ${String(still.frame)})`),
      ...(result.contactSheet === undefined ? [] : [`contact sheet ${result.contactSheet}`]),
    ].join("\n");
  }
  return [
    ...result.files.map(formatDeliveryLine),
    `receipt ${result.receipt}`,
    ...(result.withinBudget ? [] : ["One or more files are over budget. Shorten the film, lower detail, or raise -crf and deliver again."]),
  ].join("\n");
}
