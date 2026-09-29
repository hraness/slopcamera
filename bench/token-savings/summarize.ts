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
  const summary = { generatedAt: new Date().toISOString(), spentUsd: Math.round(spent * 10000) / 10000, abortedSteps: aborted.length, perGroup, comparisons, failures };
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
