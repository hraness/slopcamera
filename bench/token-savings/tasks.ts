// Task definitions (prompts come from tasks/*.md verbatim) and harness-owned validators.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  exists, meanAbsDiff, meanLuma, probe, sandboxSourceText, sha256, tinyFrame, type Probe,
} from "./media";

export type TaskId = "t1" | "t2" | "t3" | "t4";
export type Step = "create" | "revise";

export interface Check {
  readonly name: string;
  readonly ok: boolean;
  /** Informational checks are recorded but do not decide pass/fail. */
  readonly gating: boolean;
  readonly detail: string;
}

export interface Validation {
  readonly pass: boolean;
  readonly checks: readonly Check[];
  readonly hashes: Readonly<Record<string, string | null>>;
  readonly sourceFiles: readonly string[];
}

export interface ValidationInput {
  readonly sandbox: string;
  readonly step: Step;
  /** Output hashes recorded after the create step (revise only). */
  readonly createHashes: Readonly<Record<string, string | null>>;
  /** Every tool_use input of this step, serialized; lets text passed on a command line count as evidence. */
  readonly toolInputText: string;
}

export interface TaskSpec {
  readonly id: TaskId;
  readonly file: string;
  readonly outputs: readonly string[];
  readonly videoOutputs: readonly string[];
  readonly validate: (input: ValidationInput) => Promise<Validation>;
}

export interface TaskPrompts {
  readonly taskMd: string;
  readonly createPrompt: string;
  readonly revisePrompt: string;
}

const HERE = new URL(".", import.meta.url).pathname;

function section(markdown: string, heading: string): string {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line === `## ${heading}`);
  if (start < 0) throw new Error(`missing section "## ${heading}"`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^## (TASK\.md|Create prompt|Revise prompt)$/.test(line));
  return (end < 0 ? rest : rest.slice(0, end)).join("\n").trim();
}

export async function loadPrompts(spec: TaskSpec): Promise<TaskPrompts> {
  const markdown = await readFile(join(HERE, "tasks", spec.file), "utf8");
  return {
    taskMd: `${section(markdown, "TASK.md")}\n`,
    createPrompt: section(markdown, "Create prompt"),
    revisePrompt: section(markdown, "Revise prompt"),
  };
}

function check(name: string, ok: boolean, detail: string, gating = true): Check {
  return { name, ok, gating, detail };
}

function near(value: number | null, target: number, tolerance: number): boolean {
  return value !== null && Math.abs(value - target) <= tolerance;
}

function fmt(p: Probe | null): string {
  if (p === null) return "unreadable";
  return `${p.formatName} ${p.codec ?? "?"} ${p.width ?? "?"}x${p.height ?? "?"} fps=${p.fps?.toFixed(3) ?? "?"} dur=${p.duration?.toFixed(3) ?? "?"} frames=${p.frames ?? "?"}`;
}

async function common(
  input: ValidationInput,
  outputs: readonly string[],
): Promise<{ checks: Check[]; hashes: Record<string, string | null>; source: { files: string[]; text: string } }> {
  const checks: Check[] = [];
  const hashes: Record<string, string | null> = {};
  for (const rel of outputs) {
    const path = join(input.sandbox, rel);
    const present = await exists(path);
    checks.push(check(`exists:${rel}`, present, present ? "present" : "missing"));
    hashes[rel] = present ? await sha256(path) : null;
    if (input.step === "revise") {
      const before = input.createHashes[rel] ?? null;
      const changed = present && hashes[rel] !== null && hashes[rel] !== before;
      checks.push(check(`changed:${rel}`, changed, changed ? "hash differs from create" : "unchanged or missing"));
    }
  }
  return { checks, hashes, source: await sandboxSourceText(input.sandbox) };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Finds a phrase in any haystack. An exact, case-insensitive match is preferred. A
 * phrase the agent split across lines or draw calls ("Built To" then "Last") also
 * counts when its words appear in order, each as a whole word, within 400 characters
 * of the previous one; the detail string says which kind of match was found.
 */
function textEvidence(
  name: string,
  needle: string,
  haystacks: Readonly<Record<string, string>>,
  gating: boolean,
): Check {
  const lower = needle.toLowerCase();
  const words = needle.split(/\s+/).filter((w) => w !== "").map(escapeRegExp);
  const split = new RegExp(`\\b${words.join("\\b[\\s\\S]{1,400}?\\b")}\\b`, "i");
  const exact = Object.entries(haystacks).filter(([, text]) => text.toLowerCase().includes(lower)).map(([k]) => k);
  if (exact.length > 0) return check(name, true, `found in ${exact.join(", ")}`, gating);
  const spread = words.length > 1 ? Object.entries(haystacks).filter(([, text]) => split.test(text)).map(([k]) => k) : [];
  if (spread.length > 0) return check(name, true, `found split across lines in ${spread.join(", ")}`, gating);
  return check(name, false, "not found", gating);
}

async function videoChecks(
  path: string,
  label: string,
  expect: { width: number; height: number; fps: number; duration: number; durationTolerance: number },
): Promise<Check[]> {
  const p = await probe(path);
  const checks = [
    check(`format:${label}`, p !== null && p.formatName.includes("mp4") && p.codec === "h264", fmt(p)),
    check(`dimensions:${label}`, p?.width === expect.width && p?.height === expect.height, fmt(p)),
    check(`fps:${label}`, near(p?.fps ?? null, expect.fps, 0.05), fmt(p)),
    check(`duration:${label}`, near(p?.duration ?? null, expect.duration, expect.durationTolerance), fmt(p)),
  ];
  return checks;
}

const T1_LABELS = ["Web Client", "API Gateway", "Auth Service", "Order Service", "Database"];

const t1: TaskSpec = {
  id: "t1",
  file: "t1-diagram.md",
  outputs: ["out/diagram-light.svg", "out/diagram-dark.svg", "out/diagram-light.png", "out/diagram-dark.png"],
  videoOutputs: [],
  async validate(input) {
    const { checks, hashes, source } = await common(input, this.outputs);
    const svgText: Record<string, string> = {};
    for (const rel of ["out/diagram-light.svg", "out/diagram-dark.svg"]) {
      let text = "";
      try {
        text = await readFile(join(input.sandbox, rel), "utf8");
      } catch {
        // missing is already recorded
      }
      svgText[rel] = text;
      checks.push(check(`svg:${rel}`, /<svg[\s>]/.test(text), text.length > 0 ? `${text.length} bytes` : "missing"));
    }
    for (const rel of ["out/diagram-light.png", "out/diagram-dark.png"]) {
      const p = await probe(join(input.sandbox, rel));
      checks.push(check(`png:${rel}`, p !== null && p.codec === "png" && (p.width ?? 0) >= 200 && (p.height ?? 0) >= 100, fmt(p)));
    }
    const light = await meanLuma(join(input.sandbox, "out/diagram-light.png"));
    const dark = await meanLuma(join(input.sandbox, "out/diagram-dark.png"));
    checks.push(check("theme:dark-darker-than-light", light !== null && dark !== null && dark + 30 < light, `light=${light ?? "?"} dark=${dark ?? "?"}`));
    const svgAll = Object.values(svgText).join("\n");
    const haystacks = { svg: svgAll, source: source.text, toolInputs: input.toolInputText };
    const labels = input.step === "create" ? T1_LABELS : T1_LABELS.map((l) => (l === "Order Service" ? "Checkout Service" : l));
    for (const label of labels) checks.push(textEvidence(`label:${label}`, label, haystacks, true));
    for (const label of labels) {
      checks.push(textEvidence(`svg-text:${label}`, label, { svg: svgAll }, false));
    }
    if (input.step === "revise") {
      const stale = svgAll.includes("Order Service");
      checks.push(check("svg-no-old-label", !stale, stale ? "SVG still contains \"Order Service\"" : "absent", false));
    }
    return finish(checks, hashes, source.files);
  },
};

const t2: TaskSpec = {
  id: "t2",
  file: "t2-motion-card.md",
  outputs: ["out/card.mp4"],
  videoOutputs: ["out/card.mp4"],
  async validate(input) {
    const { checks, hashes, source } = await common(input, this.outputs);
    const path = join(input.sandbox, "out/card.mp4");
    checks.push(...(await videoChecks(path, "card", { width: 1080, height: 1920, fps: 30, duration: 6, durationTolerance: 0.1 })));
    const a = await tinyFrame(path, 1);
    const b = await tinyFrame(path, 5);
    const diff = a !== null && b !== null ? meanAbsDiff(a, b) : null;
    checks.push(check("motion:frames-1s-vs-5s-differ", diff !== null && diff > 1, `meanAbsDiff=${diff?.toFixed(2) ?? "?"}`));
    const haystacks = { source: source.text, toolInputs: input.toolInputText };
    const headline = input.step === "create" ? "Ship Faster" : "Built To Last";
    const accent = input.step === "create" ? "FF5A1F" : "2F80ED";
    checks.push(textEvidence(`headline:${headline}`, headline, haystacks, input.step === "revise"));
    checks.push(textEvidence(`accent:${accent}`, accent, haystacks, false));
    return finish(checks, hashes, source.files);
  },
};

const t3: TaskSpec = {
  id: "t3",
  file: "t3-product-shot.md",
  outputs: ["out/product.png"],
  videoOutputs: [],
  async validate(input) {
    const { checks, hashes, source } = await common(input, this.outputs);
    const p = await probe(join(input.sandbox, "out/product.png"));
    checks.push(check("png:product", p !== null && p.codec === "png", fmt(p)));
    checks.push(check("dimensions:product", p?.width === 1920 && p?.height === 1080, fmt(p)));
    const haystacks = { source: source.text, toolInputs: input.toolInputText };
    const color = input.step === "create" ? "D94F30" : "2E7D6B";
    checks.push(textEvidence(`color:${color}`, color, haystacks, false));
    checks.push(textEvidence("mentions-blender", "blender", haystacks, false));
    return finish(checks, hashes, source.files);
  },
};

const t4: TaskSpec = {
  id: "t4",
  file: "t4-edited-video.md",
  outputs: ["out/edit.mp4"],
  videoOutputs: ["out/edit.mp4"],
  async validate(input) {
    const { checks, hashes, source } = await common(input, this.outputs);
    const path = join(input.sandbox, "out/edit.mp4");
    const duration = input.step === "create" ? 7.5 : 6.5;
    checks.push(...(await videoChecks(path, "edit", { width: 1080, height: 1080, fps: 30, duration, durationTolerance: 0.2 })));
    const haystacks = { source: source.text, toolInputs: input.toolInputText };
    const title = input.step === "create" ? "Field Test" : "Night Shift";
    checks.push(textEvidence(`title:${title}`, title, haystacks, input.step === "revise"));
    return finish(checks, hashes, source.files);
  },
};

function finish(checks: Check[], hashes: Record<string, string | null>, sourceFiles: string[]): Validation {
  return { pass: checks.every((c) => !c.gating || c.ok), checks, hashes, sourceFiles };
}

export const TASKS: Readonly<Record<TaskId, TaskSpec>> = { t1, t2, t3, t4 };

export function isTaskId(value: string): value is TaskId {
  return value in TASKS;
}
