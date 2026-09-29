// Round 2 task definitions (prompts come from tasks/r2/*.md verbatim), input
// generators and harness-owned validators. The validators are structural: they
// probe files and look for required text; they do not judge how the output looks.
// PREREGISTRATION-r2.md records a content hash of this file and media.ts; any
// change after that must be disclosed with both results.
import { readFile, readdir, stat, writeFile, mkdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { exists, meanAbsDiff, meanLuma, meanVolume, probe, probeAudio, sha256, tinyFrame } from "./media";
import { check, finish, fmt, near, textEvidence, videoChecks, type Check, type Validation } from "./tasks";

export type TaskIdR2 = "h1" | "h2" | "h3" | "h4" | "h5";
export const STEPS_R2 = ["create", "rev1", "rev2", "rev3", "rev4", "rev5"] as const;
export type StepR2 = (typeof STEPS_R2)[number];
/** Revisions 4 and 5 each start a new Claude Code session in the same sandbox. */
export const FRESH_STEPS: ReadonlySet<StepR2> = new Set(["rev4", "rev5"]);

export interface ValidationInputR2 {
  readonly sandbox: string;
  readonly step: StepR2;
  /** Output hashes after the previous step (empty for create). */
  readonly previousHashes: Readonly<Record<string, string | null>>;
  /** Every tool_use input of this step's invocations, serialized. */
  readonly toolInputText: string;
}

export interface TaskSpecR2 {
  readonly id: TaskIdR2;
  readonly file: string;
  /** Every output the task can have by the given step. */
  outputsAt(step: StepR2): readonly string[];
  readonly videoOutputs: readonly string[];
  readonly inputs: readonly string[];
  readonly validate: (input: ValidationInputR2) => Promise<Validation>;
}

export interface TaskPromptsR2 {
  readonly taskMd: string;
  readonly prompts: Readonly<Record<StepR2, string>>;
}

const HERE = new URL(".", import.meta.url).pathname;
const HEADINGS: Readonly<Record<StepR2, string>> = {
  create: "Create prompt", rev1: "Revision 1", rev2: "Revision 2", rev3: "Revision 3", rev4: "Revision 4", rev5: "Revision 5",
};

function section(markdown: string, heading: string): string {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line === `## ${heading}`);
  if (start < 0) throw new Error(`missing section "## ${heading}"`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^## (TASK\.md|Create prompt|Revision \d)$/.test(line));
  return (end < 0 ? rest : rest.slice(0, end)).join("\n").trim();
}

export async function loadPromptsR2(spec: TaskSpecR2): Promise<TaskPromptsR2> {
  const markdown = await readFile(join(HERE, "tasks", "r2", spec.file), "utf8");
  const prompts = {} as Record<StepR2, string>;
  for (const step of STEPS_R2) prompts[step] = section(markdown, HEADINGS[step]);
  return { taskMd: `${section(markdown, "TASK.md")}\n`, prompts };
}

export function stepIndex(step: StepR2): number {
  return STEPS_R2.indexOf(step);
}

function atLeast(step: StepR2, from: StepR2): boolean {
  return stepIndex(step) >= stepIndex(from);
}

// ---------------------------------------------------------------- inputs

const REGIONS = ["North America", "Europe", "East Asia", "South Asia", "Latin America", "Middle East", "Africa", "Oceania"];
const YEARS = [2021, 2022, 2023, 2024, 2025, 2026];

/** Deterministic xorshift so the CSVs are identical on every run. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export function salesCsv(version: 1 | 2): string {
  const next = rng(20260929);
  const rows: string[] = [`region,${YEARS.join(",")}`];
  const regions = version === 2 ? [...REGIONS, "Central Asia"] : REGIONS;
  for (const [i, region] of regions.entries()) {
    let value = 40 + next() * 160;
    const values: number[] = [];
    for (const [y] of YEARS.entries()) {
      if (y > 0) value *= 0.9 + next() * 0.45;
      values.push(Math.round(value * 10) / 10);
    }
    if (version === 2) {
      // Revised 2026 figures; the ninth region is new in v2.
      if (i < REGIONS.length) values[5] = Math.round((values[5] ?? 0) * (i % 2 === 0 ? 1.18 : 0.86) * 10) / 10;
    }
    rows.push(`${region},${values.join(",")}`);
  }
  return `${rows.join("\n")}\n`;
}

/** Writes the harness inputs for every task into dir and returns [source, sandbox-relative] pairs per task. */
export async function writeInputs(dir: string): Promise<Record<TaskIdR2, [string, string][]>> {
  await mkdir(dir, { recursive: true });
  const v1 = join(dir, "sales.csv");
  const v2 = join(dir, "sales-v2.csv");
  await writeFile(v1, salesCsv(1));
  await writeFile(v2, salesCsv(2));
  return { h1: [], h2: [], h3: [], h4: [[v1, "inputs/sales.csv"], [v2, "inputs/sales-v2.csv"]], h5: [] };
}

// ---------------------------------------------------------------- shared checks

// `.tmp` (the sandbox TMPDIR) is searched: agents often keep their render scripts
// there (pilot change, see PREREGISTRATION-r2.md).
const SKIP_DIRS = new Set(["out", "inputs", ".claude", "node_modules", ".git", ".bench"]);
const MAX_SOURCE_BYTES = 1_000_000;

/**
 * Text of every small, non-binary file the agent left in the sandbox, outside outputs
 * and inputs. Unlike round 1, the harness-written TASK.md is excluded, so a label
 * counts only when the agent wrote it somewhere.
 */
async function agentSourceText(root: string): Promise<{ files: string[]; text: string }> {
  const files: string[] = [];
  const parts: string[] = [];
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 8) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) await walk(path, depth + 1);
      } else if (entry.isFile()) {
        const rel = relative(root, path);
        if (rel === "TASK.md") continue;
        const info = await stat(path);
        if (info.size > MAX_SOURCE_BYTES) continue;
        const bytes = await readFile(path);
        if (bytes.includes(0)) continue;
        files.push(rel);
        parts.push(bytes.toString("utf8"));
      }
    }
  }
  await walk(root, 0);
  return { files: files.sort(), text: parts.join("\n") };
}

interface Base {
  checks: Check[];
  hashes: Record<string, string | null>;
  source: { files: string[]; text: string };
  haystacks: Record<string, string>;
}

/**
 * Existence and hashes of every output due by this step; `mustChange` outputs must
 * differ from the previous step's hash, `keep` outputs are expected unchanged
 * (informational, since re-rendering identical content can change bytes).
 */
async function base(input: ValidationInputR2, spec: TaskSpecR2, mustChange: readonly string[], keep: readonly string[] = []): Promise<Base> {
  const checks: Check[] = [];
  const hashes: Record<string, string | null> = {};
  for (const rel of spec.outputsAt(input.step)) {
    const path = join(input.sandbox, rel);
    const present = await exists(path);
    checks.push(check(`exists:${rel}`, present, present ? "present" : "missing"));
    hashes[rel] = present ? await sha256(path) : null;
  }
  for (const rel of mustChange) {
    const before = input.previousHashes[rel] ?? null;
    const changed = hashes[rel] !== null && hashes[rel] !== undefined && hashes[rel] !== before;
    checks.push(check(`changed:${rel}`, changed, changed ? "hash differs from previous step" : "unchanged or missing"));
  }
  for (const rel of keep) {
    const same = hashes[rel] !== null && hashes[rel] === (input.previousHashes[rel] ?? null);
    checks.push(check(`kept:${rel}`, same, same ? "hash unchanged" : "re-rendered or missing", false));
  }
  const source = await agentSourceText(input.sandbox);
  return { checks, hashes, source, haystacks: { source: source.text, toolInputs: input.toolInputText } };
}

function textCheck(b: Base, name: string, needle: string, gating: boolean, extra: Record<string, string> = {}): void {
  b.checks.push(textEvidence(name, needle, { ...b.haystacks, ...extra }, gating));
}

const CHANNEL = String.raw`(0x[0-9a-f]{1,2}|\d+(?:\.\d+)?|\.\d+)`;
const TRIPLE = new RegExp(`(?<![\\w.])${CHANNEL}\\s*[,\\s]\\s*${CHANNEL}\\s*[,\\s]\\s*${CHANNEL}(?![\\w.])`, "gi");

function channelValue(token: string): number | null {
  const t = token.toLowerCase();
  if (t.startsWith("0x")) return parseInt(t.slice(2), 16);
  const v = Number(t);
  if (!Number.isFinite(v)) return null;
  return t.includes(".") && v <= 1 ? v * 255 : v;
}

/** True when text holds three channel values within 1/255 of rgb, in 0-255, 0xHH or 0-1 float form. */
export function hasRgbTriple(text: string, rgb: readonly [number, number, number]): boolean {
  // Scan with overlapping starts so "(0, 0, 194, 168)" still finds "0, 194, 168".
  const re = new RegExp(TRIPLE.source, "gi");
  for (let m = re.exec(text); m !== null; re.lastIndex = m.index + 1, m = re.exec(text)) {
    const values = [m[1], m[2], m[3]].map((x) => channelValue(x ?? ""));
    if (values.every((v, i) => v !== null && Math.abs(v - (rgb[i] ?? -99)) <= 1.01)) return true;
  }
  return false;
}

/**
 * A hex colour in any common spelling: #RRGGBB, 0xRRGGBB, bare hex, or three channels
 * as 0-255 integers, 0xHH bytes or 0-1 sRGB floats (pilot change: the byte-tuple form
 * `(0x00, 0xC2, 0xA8)` was rejected before). Linear-light floats are not matched.
 */
function colorCheck(b: Base, hex: string, gating: boolean, extra: Record<string, string> = {}): void {
  const h = hex.replace(/^#/, "").toLowerCase();
  const rgb: [number, number, number] = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  const all = { ...b.haystacks, ...extra };
  const hits = Object.entries(all).filter(([, text]) => text.toLowerCase().includes(h) || hasRgbTriple(text, rgb)).map(([k]) => k);
  b.checks.push(check(`color:#${hex.replace(/^#/, "").toUpperCase()}`, hits.length > 0, hits.length > 0 ? `found in ${hits.join(", ")}` : "not found", gating));
}

function absentCheck(b: Base, name: string, needle: string, haystack: string): void {
  const found = haystack.toLowerCase().includes(needle.toLowerCase());
  b.checks.push(check(name, !found, found ? `still contains "${needle}"` : "absent", false));
}

async function audioChecks(path: string, label: string, videoDuration: number): Promise<Check[]> {
  const a = await probeAudio(path);
  const checks = [
    check(`audio:${label}`, a !== null && a.codec === "aac", a === null ? "no audio stream" : `codec=${a.codec ?? "?"} dur=${a.duration?.toFixed(3) ?? "?"}`),
    check(`audio-covers:${label}`, near(a?.duration ?? null, videoDuration, 0.3), `audio dur=${a?.duration?.toFixed(3) ?? "?"} video=${videoDuration}`, false),
  ];
  if (a !== null) {
    const middle = await meanVolume(path, videoDuration / 2, 1);
    const tail = await meanVolume(path, videoDuration - 0.35, 0.3);
    const ok = middle !== null && tail !== null && tail < middle - 6;
    checks.push(check(`audio-fades-out:${label}`, ok, `mean dB middle=${middle ?? "?"} last0.3s=${tail ?? "?"}`, false));
  }
  return checks;
}

async function motionCheck(path: string, label: string, t1: number, t2: number): Promise<Check> {
  const a = await tinyFrame(path, t1);
  const b = await tinyFrame(path, t2);
  const diff = a !== null && b !== null ? meanAbsDiff(a, b) : null;
  return check(`motion:${label}`, diff !== null && diff > 1, `meanAbsDiff(${t1}s,${t2}s)=${diff?.toFixed(2) ?? "?"}`, false);
}

async function pngChecks(sandbox: string, rel: string, width: number, height: number): Promise<Check[]> {
  const p = await probe(join(sandbox, rel));
  return [
    check(`png:${rel}`, p !== null && p.codec === "png", fmt(p)),
    check(`dimensions:${rel}`, p?.width === width && p?.height === height, fmt(p)),
  ];
}

async function readText(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------- H1 explainer

const H1_MAIN = "out/explainer.mp4";
const H1_720 = "out/explainer-720p.mp4";
const H1_NODES = ["Ingest", "Parse", "Index", "Rank", "Cache", "Serve"];

const h1: TaskSpecR2 = {
  id: "h1",
  file: "h1-explainer.md",
  outputsAt: (step) => (atLeast(step, "rev4") ? [H1_MAIN, H1_720] : [H1_MAIN]),
  videoOutputs: [H1_MAIN, H1_720],
  inputs: [],
  async validate(input) {
    const s = input.step;
    const change = s === "rev4" ? [H1_720] : s === "rev5" ? [H1_MAIN, H1_720] : s === "create" ? [] : [H1_MAIN];
    const b = await base(input, this, change, s === "rev4" ? [H1_MAIN] : []);
    const duration = atLeast(s, "rev2") ? 36 : 30;
    const main = join(input.sandbox, H1_MAIN);
    b.checks.push(...(await videoChecks(main, "explainer", { width: 1920, height: 1080, fps: 30, duration, durationTolerance: 0.2 })));
    b.checks.push(...(await audioChecks(main, "explainer", duration)));
    b.checks.push(await motionCheck(main, "explainer", 2, duration - 3));
    if (atLeast(s, "rev4")) {
      const small = join(input.sandbox, H1_720);
      b.checks.push(...(await videoChecks(small, "explainer-720p", { width: 1280, height: 720, fps: 30, duration, durationTolerance: 0.2 })));
      b.checks.push(...(await audioChecks(small, "explainer-720p", duration)));
    }
    const titles = [
      atLeast(s, "rev5") ? "Why It Matters" : "The Problem",
      "How It Works",
      atLeast(s, "rev1") ? "What Changed" : "The Results",
      "Get Started",
    ];
    const nodes = atLeast(s, "rev3") ? [...H1_NODES, "Monitor"] : H1_NODES;
    for (const t of titles) textCheck(b, `title:${t}`, t, true);
    for (const n of nodes) textCheck(b, `node:${n}`, n, true);
    if (atLeast(s, "rev1")) absentCheck(b, "source-no-old-title:The Results", "The Results", b.source.text);
    if (atLeast(s, "rev5")) absentCheck(b, "source-no-old-title:The Problem", "The Problem", b.source.text);
    return finish(b.checks, b.hashes, b.source.files);
  },
};

// ---------------------------------------------------------------- H2 diagram system

const H2_SVGS = ["out/arch-light.svg", "out/arch-dark.svg"];
const H2_PNGS = ["out/arch-light.png", "out/arch-dark.png"];
const H2_SOCIAL = "out/arch-social.png";
const H2_ALL = [...H2_SVGS, ...H2_PNGS, H2_SOCIAL];

const h2: TaskSpecR2 = {
  id: "h2",
  file: "h2-diagram-system.md",
  outputsAt: () => H2_ALL,
  videoOutputs: [],
  inputs: [],
  async validate(input) {
    const s = input.step;
    const change = s === "create" ? [] : s === "rev4" ? [H2_SOCIAL] : H2_ALL;
    const b = await base(input, this, change, s === "rev4" ? [...H2_SVGS, ...H2_PNGS] : []);
    const svg: Record<string, string> = {};
    for (const rel of H2_SVGS) {
      svg[rel] = await readText(join(input.sandbox, rel));
      b.checks.push(check(`svg:${rel}`, /<svg[\s>]/.test(svg[rel] ?? ""), `${(svg[rel] ?? "").length} bytes`));
    }
    for (const rel of H2_PNGS) b.checks.push(...(await pngChecks(input.sandbox, rel, 1920, 1080)));
    const portrait = atLeast(s, "rev4");
    b.checks.push(...(await pngChecks(input.sandbox, H2_SOCIAL, 1080, portrait ? 1350 : 1080)));
    const light = await meanLuma(join(input.sandbox, "out/arch-light.png"));
    const dark = await meanLuma(join(input.sandbox, "out/arch-dark.png"));
    b.checks.push(check("theme:dark-darker-than-light", light !== null && dark !== null && dark + 30 < light, `light=${light ?? "?"} dark=${dark ?? "?"}`));
    const socialLuma = await meanLuma(join(input.sandbox, H2_SOCIAL));
    b.checks.push(check("theme:social-is-light", socialLuma !== null && dark !== null && socialLuma > dark + 30, `social=${socialLuma ?? "?"} dark=${dark ?? "?"}`, false));
    const svgAll = Object.values(svg).join("\n");
    const extra = { svg: svgAll };
    const nodes = [
      "CDN", "Load Balancer", "API Gateway", "Auth",
      "Users", atLeast(s, "rev1") ? "Checkout" : "Orders", "Payments", "Search",
      "Postgres", "Redis", "Event Bus", "Object Store",
      ...(atLeast(s, "rev3") ? ["Rate Limiter"] : []),
    ];
    const groups = [atLeast(s, "rev5") ? "Gateway Tier" : "Edge", "Services", "Data"];
    for (const t of ["Platform Architecture", ...groups, ...nodes]) {
      textCheck(b, `label:${t}`, t, true, extra);
      b.checks.push(textEvidence(`svg-text:${t}`, t, { svg: svgAll }, false));
    }
    colorCheck(b, "#2F80ED", false, extra);
    colorCheck(b, "#27AE60", false, extra);
    colorCheck(b, atLeast(s, "rev2") ? "#7B61FF" : "#F2994A", atLeast(s, "rev2"), extra);
    if (atLeast(s, "rev1")) absentCheck(b, "svg-no-old-label:Orders", ">Orders<", svgAll);
    if (atLeast(s, "rev5")) absentCheck(b, "svg-no-old-label:Edge", ">Edge<", svgAll);
    return finish(b.checks, b.hashes, b.source.files);
  },
};

// ---------------------------------------------------------------- H3 turntable

const H3_VIDEO = "out/turntable.mp4";
const H3_HERO = "out/hero.png";

const h3: TaskSpecR2 = {
  id: "h3",
  file: "h3-turntable.md",
  outputsAt: () => [H3_VIDEO, H3_HERO],
  videoOutputs: [H3_VIDEO],
  inputs: [],
  async validate(input) {
    const s = input.step;
    const change: Record<StepR2, string[]> = {
      create: [], rev1: [H3_VIDEO, H3_HERO], rev2: [H3_VIDEO], rev3: [H3_VIDEO, H3_HERO], rev4: [H3_HERO], rev5: [H3_VIDEO],
    };
    const keep: Record<StepR2, string[]> = { create: [], rev1: [], rev2: [], rev3: [], rev4: [H3_VIDEO], rev5: [H3_HERO] };
    const b = await base(input, this, change[s], keep[s]);
    const video = join(input.sandbox, H3_VIDEO);
    const fps = atLeast(s, "rev5") ? 30 : 24;
    const duration = atLeast(s, "rev2") ? 8 : 5;
    b.checks.push(...(await videoChecks(video, "turntable", { width: 1080, height: 1080, fps, duration, durationTolerance: 0.2 })));
    b.checks.push(await motionCheck(video, "turntable", duration * 0.2, duration * 0.45));
    const hero = atLeast(s, "rev4") ? [2560, 1440] : [1920, 1080];
    b.checks.push(...(await pngChecks(input.sandbox, H3_HERO, hero[0] ?? 0, hero[1] ?? 0)));
    textCheck(b, "mentions-blender", "blender", false);
    // Colours are often converted to linear floats in Blender scripts, so they are informational.
    colorCheck(b, atLeast(s, "rev1") ? "#2E7D6B" : "#1F6FEB", false);
    if (atLeast(s, "rev3")) textCheck(b, "text:AURA", "AURA", true);
    return finish(b.checks, b.hashes, b.source.files);
  },
};

// ---------------------------------------------------------------- H4 data animation

const H4_MAIN = "out/bars.mp4";
const H4_WIDE = "out/bars-16x9.mp4";

const h4: TaskSpecR2 = {
  id: "h4",
  file: "h4-data-animation.md",
  outputsAt: (step) => (atLeast(step, "rev5") ? [H4_MAIN, H4_WIDE] : [H4_MAIN]),
  videoOutputs: [H4_MAIN, H4_WIDE],
  inputs: ["inputs/sales.csv", "inputs/sales-v2.csv"],
  async validate(input) {
    const s = input.step;
    const change = s === "create" ? [] : s === "rev5" ? [H4_WIDE] : [H4_MAIN];
    const b = await base(input, this, change, s === "rev5" ? [H4_MAIN] : []);
    const duration = atLeast(s, "rev3") ? 12 : 10;
    const main = join(input.sandbox, H4_MAIN);
    b.checks.push(...(await videoChecks(main, "bars", { width: 1080, height: 1080, fps: 30, duration, durationTolerance: 0.2 })));
    b.checks.push(await motionCheck(main, "bars", 1, duration - 3));
    if (atLeast(s, "rev5")) {
      const wide = join(input.sandbox, H4_WIDE);
      b.checks.push(...(await videoChecks(wide, "bars-16x9", { width: 1920, height: 1080, fps: 30, duration, durationTolerance: 0.2 })));
    }
    textCheck(b, "reads:sales.csv", "sales", false);
    const title = atLeast(s, "rev1") ? "Regional Revenue in USD Millions" : "Revenue by Region";
    textCheck(b, `title:${title}`, title, true);
    if (atLeast(s, "rev1")) absentCheck(b, "source-no-old-title:Revenue by Region", "Revenue by Region", b.source.text);
    if (atLeast(s, "rev2")) textCheck(b, "reads:sales-v2.csv", "sales-v2", true);
    if (atLeast(s, "rev4")) colorCheck(b, "#2A9D8F", true);
    return finish(b.checks, b.hashes, b.source.files);
  },
};

// ---------------------------------------------------------------- H5 social set

const H5_BASE: readonly [string, number, number][] = [
  ["out/social-9x16.mp4", 1080, 1920],
  ["out/social-1x1.mp4", 1080, 1080],
  ["out/social-16x9.mp4", 1920, 1080],
];
const H5_45: [string, number, number] = ["out/social-4x5.mp4", 1080, 1350];

const h5: TaskSpecR2 = {
  id: "h5",
  file: "h5-social-set.md",
  outputsAt: (step) => [...H5_BASE, ...(atLeast(step, "rev5") ? [H5_45] : [])].map(([rel]) => rel),
  videoOutputs: [...H5_BASE, H5_45].map(([rel]) => rel),
  inputs: [],
  async validate(input) {
    const s = input.step;
    const baseRels = H5_BASE.map(([rel]) => rel);
    const change = s === "create" ? [] : s === "rev5" ? [H5_45[0]] : baseRels;
    const b = await base(input, this, change, s === "rev5" ? baseRels : []);
    const duration = atLeast(s, "rev3") ? 8 : 6;
    const formats = atLeast(s, "rev5") ? [...H5_BASE, H5_45] : H5_BASE;
    for (const [rel, width, height] of formats) {
      const label = rel.replace(/^out\//, "").replace(/\.mp4$/, "");
      const path = join(input.sandbox, rel);
      b.checks.push(...(await videoChecks(path, label, { width, height, fps: 30, duration, durationTolerance: 0.2 })));
      b.checks.push(await motionCheck(path, label, 0.5, duration - 0.5));
    }
    const headline = atLeast(s, "rev1") ? "Ship Week" : "Launch Week";
    textCheck(b, `headline:${headline}`, headline, true);
    textCheck(b, "subline:Starts Monday", "Starts Monday", true);
    colorCheck(b, "#0B0F1A", false);
    colorCheck(b, atLeast(s, "rev2") ? "#00C2A8" : "#FFB000", atLeast(s, "rev2"));
    if (atLeast(s, "rev4")) textCheck(b, "cta:Join us live", "Join us live", true);
    return finish(b.checks, b.hashes, b.source.files);
  },
};

export const TASKS_R2: Readonly<Record<TaskIdR2, TaskSpecR2>> = { h1, h2, h3, h4, h5 };

export function isTaskIdR2(value: string): value is TaskIdR2 {
  return value in TASKS_R2;
}
