// Aggregates raw step records into summary.json and summary.md.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { StepRecord } from "./harness";

type Metric = "inputSideTokens" | "outputTokens" | "costUsd" | "numTurns" | "wallSeconds";
const METRICS: readonly Metric[] = ["inputSideTokens", "outputTokens", "costUsd", "numTurns", "wallSeconds"];

function metric(record: StepRecord, name: Metric): number | null {
  switch (name) {
    case "inputSideTokens": return record.inputSideTokens;
    case "outputTokens": return record.usage?.outputTokens ?? null;
    case "costUsd": return record.costUsd;
    case "numTurns": return record.numTurns;
    case "wallSeconds": return record.wallSeconds;
  }
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] ?? null) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

async function records(dir: string): Promise<StepRecord[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const out: StepRecord[] = [];
  for (const name of names.sort()) {
    if (name.endsWith(".json")) out.push(JSON.parse(await readFile(join(dir, name), "utf8")) as StepRecord);
  }
  return out;
}

interface Session {
  readonly key: string;
  readonly task: string;
  readonly condition: string;
  readonly create: StepRecord | null;
  readonly revise: StepRecord | null;
  readonly success: boolean;
}

type Medians = Record<"create" | "revise" | "total", Record<Metric, number | null>>;

function mediansOf(sessions: readonly Session[]): Medians {
  const build = (pick: (s: Session) => number | null): number | null =>
    median(sessions.map(pick).filter((v): v is number => v !== null));
  const out = { create: {}, revise: {}, total: {} } as Medians;
  for (const m of METRICS) {
    out.create[m] = build((s) => (s.create === null ? null : metric(s.create, m)));
    out.revise[m] = build((s) => (s.revise === null ? null : metric(s.revise, m)));
    out.total[m] = build((s) => {
      if (s.create === null || s.revise === null) return null;
      const a = metric(s.create, m);
      const b = metric(s.revise, m);
      return a === null || b === null ? null : a + b;
    });
  }
  return out;
}

/**
 * List prices per million tokens that reproduce every step's total_cost_usd for
 * claude-opus-5-5 in this run (cache writes use the one-hour rate). The summary
 * checks each step against them and reports the largest residual.
 */
export const PRICE_PER_MTOK = { input: 4, cacheWrite: 8, cacheRead: 0.2, output: 20 } as const;

interface CostParts { readonly input: number; readonly cacheWrite: number; readonly cacheRead: number; readonly output: number }

function costParts(r: StepRecord): CostParts | null {
  const u = r.usage;
  if (u === null) return null;
  return {
    input: (u.inputTokens * PRICE_PER_MTOK.input) / 1e6,
    cacheWrite: (u.cacheCreationInputTokens * PRICE_PER_MTOK.cacheWrite) / 1e6,
    cacheRead: (u.cacheReadInputTokens * PRICE_PER_MTOK.cacheRead) / 1e6,
    output: (u.outputTokens * PRICE_PER_MTOK.output) / 1e6,
  };
}

const sumParts = (c: CostParts): number => c.input + c.cacheWrite + c.cacheRead + c.output;

const fmt = (v: number | null, digits = 0): string => (v === null ? "–" : v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits }));

export async function summarize(resultsDir: string): Promise<void> {
  const raw = await records(join(resultsDir, "raw"));
  const aborted = await records(join(resultsDir, "aborted"));
  const byKey = new Map<string, { create: StepRecord | null; revise: StepRecord | null; task: string; condition: string }>();
  for (const r of raw) {
    const entry = byKey.get(r.key) ?? { create: null, revise: null, task: r.task, condition: r.condition };
    entry[r.step] = r;
    byKey.set(r.key, entry);
  }
  const sessions: Session[] = [...byKey.entries()].map(([key, e]) => ({
    key, ...e, success: e.create?.pass === true && e.revise?.pass === true,
  }));
  const groups = new Map<string, Session[]>();
  for (const s of sessions) {
    const g = `${s.task}/${s.condition}`;
    groups.set(g, [...(groups.get(g) ?? []), s]);
  }
  const perGroup = [...groups.entries()].sort().map(([group, list]) => {
    const [task, condition] = group.split("/");
    const ok = list.filter((s) => s.success);
    return {
      task, condition,
      sessions: list.length,
      successes: ok.length,
      successfulMedians: mediansOf(ok),
      allCompletedMedians: mediansOf(list.filter((s) => s.create !== null && s.revise !== null && s.revise.status !== "skipped")),
    };
  });
  const failures = raw.filter((r) => !r.pass).map((r) => ({
    key: r.key, step: r.step, status: r.status, subtype: r.resultSubtype,
    failedChecks: r.validation?.checks.filter((c) => c.gating && !c.ok).map((c) => `${c.name}: ${c.detail}`) ?? [],
    costUsd: r.costUsd, note: r.note,
  }));
  const spent = [...raw, ...aborted].reduce((sum, r) => sum + (r.costUsd ?? 0), 0);
  const comparisons: Record<string, unknown>[] = [];
  const tasks = [...new Set(perGroup.map((g) => g.task))];
  for (const task of tasks) {
    const a = perGroup.find((g) => g.task === task && g.condition === "A");
    const b = perGroup.find((g) => g.task === task && g.condition === "B");
    if (a === undefined || b === undefined) continue;
    const row: Record<string, unknown> = { task, successesA: a.successes, successesB: b.successes };
    for (const phase of ["create", "revise", "total"] as const) {
      for (const m of ["outputTokens", "costUsd"] as const) {
        const va = a.successfulMedians[phase][m];
        const vb = b.successfulMedians[phase][m];
        row[`${phase}.${m}.ratioBoverA`] = va !== null && vb !== null && va > 0 ? Math.round((vb / va) * 1000) / 1000 : null;
      }
    }
    comparisons.push(row);
  }
  // Per-session create+revise totals, so ranges can be compared, not only medians.
  const sessionTotals = sessions
    .filter((s) => s.create !== null && s.revise !== null)
    .map((s) => {
      const c = s.create as StepRecord;
      const r = s.revise as StepRecord;
      const add = (a: number | null, b: number | null): number | null => (a === null || b === null ? null : a + b);
      // duration_api_ms is cumulative over a resumed session, like total_cost_usd,
      // so the revise step's figure already covers both steps.
      const apiSeconds = r.durationApiMs ?? null;
      return {
        key: s.key, task: s.task, condition: s.condition, success: s.success,
        outputTokens: add(c.usage?.outputTokens ?? null, r.usage?.outputTokens ?? null),
        costUsd: add(c.costUsd, r.costUsd),
        inputSideTokens: add(c.inputSideTokens, r.inputSideTokens),
        wallSeconds: c.wallSeconds + r.wallSeconds,
        apiSeconds: apiSeconds === null ? null : apiSeconds / 1000,
        outsideApiSeconds: apiSeconds === null ? null : c.wallSeconds + r.wallSeconds - apiSeconds / 1000,
        slopcameraCommands: c.slopcameraCommands + r.slopcameraCommands,
        skillLoaded: c.skillCalls.length + r.skillCalls.length > 0,
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
  type Range = { readonly min: number; readonly max: number };
  const rangeOf = (vals: readonly (number | null)[]): Range | null => {
    const v = vals.filter((x): x is number => x !== null);
    return v.length === 0 ? null : { min: Math.min(...v), max: Math.max(...v) };
  };
  const relation = (a: Range | null, b: Range | null): string => {
    if (a === null || b === null) return "–";
    if (b.max < a.min) return "B lower, ranges do not overlap";
    if (b.min > a.max) return "B higher, ranges do not overlap";
    if (b.max === a.min || b.min === a.max) return "ranges touch";
    return "ranges overlap";
  };
  const ranges = tasks.map((task) => {
    const pick = (cond: string, m: "outputTokens" | "costUsd"): Range | null =>
      rangeOf(sessionTotals.filter((s) => s.task === task && s.condition === cond && s.success).map((s) => s[m]));
    const out = { a: pick("A", "outputTokens"), b: pick("B", "outputTokens") };
    const cost = { a: pick("A", "costUsd"), b: pick("B", "costUsd") };
    return { task, outputTokens: { ...out, relation: relation(out.a, out.b) }, costUsd: { ...cost, relation: relation(cost.a, cost.b) } };
  });
  // Price-weighted cost by token type. Input-side token counts add together
  // tokens with very different prices, so cost is the primary metric.
  const byCondition = ["A", "B"].map((condition) => {
    const rows = raw.filter((r) => r.condition === condition);
    const parts = rows.map(costParts).filter((c): c is CostParts => c !== null);
    const total = (k: keyof CostParts): number => parts.reduce((sum, c) => sum + c[k], 0);
    const tok = (k: "inputTokens" | "cacheCreationInputTokens" | "cacheReadInputTokens" | "outputTokens"): number =>
      rows.reduce((sum, r) => sum + (r.usage?.[k] ?? 0), 0);
    return {
      condition, steps: rows.length,
      tokens: { input: tok("inputTokens"), cacheWrite: tok("cacheCreationInputTokens"), cacheRead: tok("cacheReadInputTokens"), output: tok("outputTokens") },
      costUsd: { input: total("input"), cacheWrite: total("cacheWrite"), cacheRead: total("cacheRead"), output: total("output") },
      reportedCostUsd: rows.reduce((sum, r) => sum + (r.costUsd ?? 0), 0),
    };
  });
  const maxPriceResidualUsd = raw.reduce((worst, r) => {
    const c = costParts(r);
    return c === null || r.costUsd === null ? worst : Math.max(worst, Math.abs(sumParts(c) - r.costUsd));
  }, 0);
  const promptGroups = new Map<string, Set<string>>();
  for (const r of raw) {
    const g = `${r.task}/${r.step}`;
    promptGroups.set(g, (promptGroups.get(g) ?? new Set()).add(r.promptSha256));
  }
  const promptsIdentical = [...promptGroups.values()].every((set) => set.size === 1);

  const summary = { generatedAt: new Date().toISOString(), spentUsd: Math.round(spent * 10000) / 10000, abortedSteps: aborted.length, perGroup, comparisons, failures,
    sessionTotals, ranges, costByTokenType: { pricePerMTok: PRICE_PER_MTOK, maxPriceResidualUsd, byCondition }, promptsIdentical };
  await writeFile(join(resultsDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);

  const lines: string[] = [];
  lines.push("# Token-savings benchmark summary", "");
  lines.push(`Generated ${summary.generatedAt}. Spent $${fmt(spent, 2)} across ${raw.length} recorded steps and ${aborted.length} aborted steps.`, "");
  lines.push("## Medians over successful sessions (create and revise both passed)", "");
  lines.push("| Task | Cond | Sessions | Passed | Out create | Out revise | Out total | $ create | $ revise | $ total | In-side total | Turns total | Wall s total |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const g of perGroup) {
    const m = g.successfulMedians;
    lines.push(`| ${g.task} | ${g.condition} | ${g.sessions} | ${g.successes} | ${fmt(m.create.outputTokens)} | ${fmt(m.revise.outputTokens)} | ${fmt(m.total.outputTokens)} | ${fmt(m.create.costUsd, 2)} | ${fmt(m.revise.costUsd, 2)} | ${fmt(m.total.costUsd, 2)} | ${fmt(m.total.inputSideTokens)} | ${fmt(m.total.numTurns)} | ${fmt(m.total.wallSeconds)} |`);
  }
  if (comparisons.length > 0) {
    lines.push("", "## B / A ratio of medians (below 1 means SlopCamera used less)", "");
    lines.push("| Task | Passed A | Passed B | Out create | Out revise | Out total | $ create | $ revise | $ total |");
    lines.push("|---|---|---|---|---|---|---|---|---|");
    for (const c of comparisons) {
      const r = (k: string): string => (typeof c[k] === "number" ? (c[k] as number).toFixed(2) : "–");
      lines.push(`| ${String(c.task)} | ${String(c.successesA)} | ${String(c.successesB)} | ${r("create.outputTokens.ratioBoverA")} | ${r("revise.outputTokens.ratioBoverA")} | ${r("total.outputTokens.ratioBoverA")} | ${r("create.costUsd.ratioBoverA")} | ${r("revise.costUsd.ratioBoverA")} | ${r("total.costUsd.ratioBoverA")} |`);
    }
  }
  lines.push("", "## Per-session create plus revise totals", "");
  lines.push("With two sessions per cell a median is the mean of two sessions, so the ranges matter more than the medians.", "");
  lines.push("| Session | Pass | Out | $ | In-side | Wall s | API s | Outside API s | slopcamera cmds | Skill loaded |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|");
  for (const s of sessionTotals) {
    lines.push(`| ${s.key} | ${s.success ? "yes" : "no"} | ${fmt(s.outputTokens)} | ${fmt(s.costUsd, 3)} | ${fmt(s.inputSideTokens)} | ${fmt(s.wallSeconds)} | ${fmt(s.apiSeconds)} | ${fmt(s.outsideApiSeconds)} | ${s.slopcameraCommands} | ${s.condition === "A" ? "–" : s.skillLoaded ? "yes" : "no"} |`);
  }
  lines.push("", "## Per-session ranges, A versus B", "");
  lines.push("| Task | Out A | Out B | Output | $ A | $ B | Cost |");
  lines.push("|---|---|---|---|---|---|---|");
  const rng = (r: Range | null, digits: number): string => (r === null ? "–" : `${fmt(r.min, digits)}–${fmt(r.max, digits)}`);
  for (const r of ranges) {
    lines.push(`| ${r.task} | ${rng(r.outputTokens.a, 0)} | ${rng(r.outputTokens.b, 0)} | ${r.outputTokens.relation} | ${rng(r.costUsd.a, 3)} | ${rng(r.costUsd.b, 3)} | ${r.costUsd.relation} |`);
  }
  lines.push("", "## Cost by token type, all steps", "");
  lines.push(`Prices per million tokens: input $${PRICE_PER_MTOK.input}, cache write $${PRICE_PER_MTOK.cacheWrite}, cache read $${PRICE_PER_MTOK.cacheRead}, output $${PRICE_PER_MTOK.output}. They reproduce every step's reported cost to within $${maxPriceResidualUsd.toFixed(6)}.`, "");
  lines.push("| Cond | Steps | Input tok | Cache write tok | Cache read tok | Output tok | $ input | $ cache write | $ cache read | $ output | $ total |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const c of byCondition) {
    lines.push(`| ${c.condition} | ${c.steps} | ${fmt(c.tokens.input)} | ${fmt(c.tokens.cacheWrite)} | ${fmt(c.tokens.cacheRead)} | ${fmt(c.tokens.output)} | ${fmt(c.costUsd.input, 3)} | ${fmt(c.costUsd.cacheWrite, 3)} | ${fmt(c.costUsd.cacheRead, 3)} | ${fmt(c.costUsd.output, 3)} | ${fmt(c.reportedCostUsd, 2)} |`);
  }
  lines.push("", `Prompts identical across conditions and repeats for every task and step: ${promptsIdentical ? "yes" : "no"}.`);
  lines.push("", "## Failures", "");
  if (failures.length === 0) lines.push("None.");
  for (const f of failures) lines.push(`- ${f.key} ${f.step}: ${f.status}${f.subtype === null ? "" : ` (${f.subtype})`}, $${fmt(f.costUsd, 2)}${f.failedChecks.length > 0 ? `; failed checks: ${f.failedChecks.join("; ")}` : ""}${f.note === "" ? "" : `; ${f.note}`}`);
  lines.push("", "## All steps", "");
  lines.push("| Key | Step | Status | Pass | In-side | Out | $ | Turns | Wall s | slopcamera cmds | Skill calls | Tools |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const r of raw) {
    const tools = Object.entries(r.toolCallCounts).map(([k, v]) => `${k}×${v}`).join(" ");
    lines.push(`| ${r.key} | ${r.step} | ${r.status} | ${r.pass ? "yes" : "no"} | ${fmt(r.inputSideTokens)} | ${fmt(r.usage?.outputTokens ?? null)} | ${fmt(r.costUsd, 2)} | ${fmt(r.numTurns)} | ${fmt(r.wallSeconds)} | ${r.slopcameraCommands} | ${r.skillCalls.length} | ${tools} |`);
  }
  await writeFile(join(resultsDir, "summary.md"), `${lines.join("\n")}\n`);
}
