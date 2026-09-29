// Round 2 aggregation: raw step records -> summary.json and summary.md, with the
// preregistered tests (PREREGISTRATION-r2.md): two-sided exact Mann-Whitney U per
// task on all-steps total cost, and a pooled ratio of medians with a bootstrap CI
// stratified by task.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PRICE_PER_MTOK, readRecordsR2, type StepRecordR2 } from "./round2";
import { STEPS_R2, type StepR2 } from "./tasks-r2";

export const BOOTSTRAP_ITERATIONS = 10_000;
export const BOOTSTRAP_SEED = 20261001;

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? (s[m] ?? null) : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2;
}

function ranks(values: readonly number[]): number[] {
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(values.length);
  for (let i = 0; i < order.length;) {
    let j = i;
    while (j + 1 < order.length && order[j + 1]?.[0] === order[i]?.[0]) j++;
    for (let k = i; k <= j; k++) out[order[k]?.[1] ?? 0] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return out;
}

function* combinations(n: number, k: number, start = 0, prefix: number[] = []): Generator<number[]> {
  if (prefix.length === k) {
    yield prefix;
    return;
  }
  for (let i = start; i <= n - (k - prefix.length); i++) yield* combinations(n, k, i + 1, [...prefix, i]);
}

/**
 * Two-sided exact Mann-Whitney U (permutation distribution of midranks, so ties are
 * handled exactly). U counts pairs where the A value exceeds the B value.
 */
export function mannWhitney(a: readonly number[], b: readonly number[]): { u: number; p: number } | null {
  if (a.length === 0 || b.length === 0 || a.length + b.length > 20) return null;
  const r = ranks([...a, ...b]);
  const n1 = a.length;
  const rankSumA = r.slice(0, n1).reduce((s, v) => s + v, 0);
  const u = rankSumA - (n1 * (n1 + 1)) / 2;
  const mean = (n1 * b.length) / 2;
  const observed = Math.abs(u - mean);
  let extreme = 0;
  let total = 0;
  for (const idx of combinations(r.length, n1)) {
    const sum = idx.reduce((s, i) => s + (r[i] ?? 0), 0);
    if (Math.abs(sum - (n1 * (n1 + 1)) / 2 - mean) >= observed - 1e-9) extreme++;
    total++;
  }
  return { u, p: extreme / total };
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Geometric mean over tasks of median(B)/median(A). */
function pooledRatio(strata: readonly { a: readonly number[]; b: readonly number[] }[]): number | null {
  const logs: number[] = [];
  for (const { a, b } of strata) {
    const ma = median(a);
    const mb = median(b);
    if (ma === null || mb === null || ma <= 0 || mb <= 0) return null;
    logs.push(Math.log(mb / ma));
  }
  return logs.length === 0 ? null : Math.exp(logs.reduce((s, v) => s + v, 0) / logs.length);
}

export function stratifiedBootstrap(strata: readonly { a: readonly number[]; b: readonly number[] }[]): { estimate: number | null; lo: number | null; hi: number | null } {
  const estimate = pooledRatio(strata);
  if (estimate === null) return { estimate, lo: null, hi: null };
  const next = rng(BOOTSTRAP_SEED);
  const pick = (xs: readonly number[]): number[] => xs.map(() => xs[Math.floor(next() * xs.length)] ?? 0);
  const stats: number[] = [];
  for (let i = 0; i < BOOTSTRAP_ITERATIONS; i++) {
    const v = pooledRatio(strata.map(({ a, b }) => ({ a: pick(a), b: pick(b) })));
    if (v !== null) stats.push(v);
  }
  stats.sort((x, y) => x - y);
  const q = (f: number): number | null => stats[Math.min(stats.length - 1, Math.floor(f * stats.length))] ?? null;
  return { estimate, lo: q(0.025), hi: q(0.975) };
}

// ---------------------------------------------------------------- sessions

type Phase = "create" | "resumed" | "fresh" | "total";
const PHASES: Readonly<Record<Phase, readonly StepR2[]>> = {
  create: ["create"],
  resumed: ["rev1", "rev2", "rev3"],
  fresh: ["rev4", "rev5"],
  total: STEPS_R2,
};

interface Totals {
  costUsd: number;
  outputTokens: number;
  inputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  costInput: number;
  costCacheWrite: number;
  costCacheRead: number;
  costOutput: number;
  turns: number;
  wallSeconds: number;
  apiSeconds: number;
  outsideApiSeconds: number;
  retries: number;
  steps: number;
  passed: number;
  firstPassed: number;
}
type Metric = keyof Totals;

interface SessionR2 {
  readonly key: string;
  readonly task: string;
  readonly condition: string;
  readonly repeat: number;
  readonly complete: boolean;
  readonly steps: Partial<Record<StepR2, StepRecordR2>>;
  readonly phases: Record<Phase, Totals | null>;
  readonly cumulativeCost: (number | null)[];
}

function totalsOf(records: readonly StepRecordR2[]): Totals {
  const t: Totals = {
    costUsd: 0, outputTokens: 0, inputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0,
    costInput: 0, costCacheWrite: 0, costCacheRead: 0, costOutput: 0,
    turns: 0, wallSeconds: 0, apiSeconds: 0, outsideApiSeconds: 0, retries: 0, steps: 0, passed: 0, firstPassed: 0,
  };
  for (const r of records) {
    t.costUsd += r.costUsd ?? r.pricedCostUsd ?? 0;
    t.outputTokens += r.usage.outputTokens;
    t.inputTokens += r.usage.inputTokens;
    t.cacheWriteTokens += r.usage.cacheCreationInputTokens;
    t.cacheReadTokens += r.usage.cacheReadInputTokens;
    t.costInput += (r.usage.inputTokens * PRICE_PER_MTOK.input) / 1e6;
    t.costCacheWrite += (r.usage.cacheCreationInputTokens * PRICE_PER_MTOK.cacheWrite) / 1e6;
    t.costCacheRead += (r.usage.cacheReadInputTokens * PRICE_PER_MTOK.cacheRead) / 1e6;
    t.costOutput += (r.usage.outputTokens * PRICE_PER_MTOK.output) / 1e6;
    t.turns += r.numTurns ?? 0;
    t.wallSeconds += r.wallSeconds;
    t.apiSeconds += r.apiSeconds ?? 0;
    t.outsideApiSeconds += r.wallSeconds - (r.apiSeconds ?? 0);
    t.retries += r.retriesUsed;
    t.steps += 1;
    t.passed += r.pass ? 1 : 0;
    t.firstPassed += r.firstPass ? 1 : 0;
  }
  return t;
}

function sessionsOf(records: readonly StepRecordR2[]): SessionR2[] {
  const byKey = new Map<string, StepRecordR2[]>();
  for (const r of records) byKey.set(r.key, [...(byKey.get(r.key) ?? []), r]);
  return [...byKey.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, list]) => {
    const steps: Partial<Record<StepR2, StepRecordR2>> = {};
    for (const r of list) steps[r.step] = r;
    const complete = STEPS_R2.every((s) => steps[s] !== undefined);
    const phases = {} as Record<Phase, Totals | null>;
    for (const [phase, names] of Object.entries(PHASES) as [Phase, readonly StepR2[]][]) {
      const rs = names.map((s) => steps[s]);
      phases[phase] = rs.every((r) => r !== undefined) ? totalsOf(rs as StepRecordR2[]) : null;
    }
    let running = 0;
    const cumulativeCost = STEPS_R2.map((s) => {
      const r = steps[s];
      if (r === undefined) return null;
      running += r.costUsd ?? r.pricedCostUsd ?? 0;
      return Math.round(running * 1e4) / 1e4;
    });
    const first = list[0];
    return { key, task: first?.task ?? "", condition: first?.condition ?? "", repeat: first?.repeat ?? 0, complete, steps, phases, cumulativeCost };
  });
}

const round = (v: number | null, d = 4): number | null => (v === null ? null : Math.round(v * 10 ** d) / 10 ** d);
const money = (v: number | null): string => (v === null ? "–" : `$${v.toFixed(2)}`);
const num = (v: number | null): string => (v === null ? "–" : Math.round(v).toLocaleString("en-US"));

async function abortedCost(dir: string): Promise<number> {
  let sum = 0;
  try {
    for (const name of await readdir(join(dir, "aborted"))) {
      if (!name.endsWith(".json")) continue;
      const a = JSON.parse(await readFile(join(dir, "aborted", name), "utf8")) as { costUsd?: number | null };
      sum += a.costUsd ?? 0;
    }
  } catch {
    // none
  }
  return sum;
}

export async function summarizeR2(resultsDir: string): Promise<void> {
  const records = await readRecordsR2(join(resultsDir, "raw"));
  const sessions = sessionsOf(records);
  const complete = sessions.filter((s) => s.complete);
  const tasks = [...new Set(sessions.map((s) => s.task))].sort();
  const metrics: Metric[] = ["costUsd", "outputTokens", "inputTokens", "cacheWriteTokens", "cacheReadTokens", "costInput", "costCacheWrite", "costCacheRead", "costOutput", "turns", "wallSeconds", "apiSeconds", "outsideApiSeconds", "retries"];
  const groups = tasks.flatMap((task) => (["A", "B"] as const).map((condition) => {
    const list = complete.filter((s) => s.task === task && s.condition === condition);
    const medians: Record<string, Record<string, number | null>> = {};
    for (const phase of Object.keys(PHASES) as Phase[]) {
      medians[phase] = Object.fromEntries(metrics.map((m) => [m, round(median(list.map((s) => s.phases[phase]?.[m]).filter((v): v is number => v !== undefined)))]));
    }
    const curve = STEPS_R2.map((_, i) => round(median(list.map((s) => s.cumulativeCost[i]).filter((v): v is number => v !== null && v !== undefined))));
    const perStep = STEPS_R2.map((step) => {
      const rs = list.map((s) => s.steps[step]).filter((r): r is StepRecordR2 => r !== undefined);
      return {
        step,
        medianCostUsd: round(median(rs.map((r) => r.costUsd ?? 0))),
        passed: rs.filter((r) => r.pass).length,
        firstPassed: rs.filter((r) => r.firstPass).length,
        retries: rs.reduce((s, r) => s + r.retriesUsed, 0),
        n: rs.length,
      };
    });
    const steps = list.flatMap((s) => Object.values(s.steps));
    return {
      task, condition, sessions: list.length, medians, cumulativeCostMedian: curve, perStep,
      stepPassRate: steps.length === 0 ? null : round(steps.filter((r) => r.pass).length / steps.length, 3),
      firstPassRate: steps.length === 0 ? null : round(steps.filter((r) => r.firstPass).length / steps.length, 3),
      retriesTotal: steps.reduce((s, r) => s + r.retriesUsed, 0),
      backgroundTasksKilled: steps.reduce((s, r) => s + r.attempts.reduce((n, a) => n + (a.backgroundTasksKilled ?? 0), 0), 0),
      perSession: list.map((s) => ({
        key: s.key,
        costUsd: Object.fromEntries((Object.keys(PHASES) as Phase[]).map((p) => [p, round(s.phases[p]?.costUsd ?? null)])),
        outputTokens: s.phases.total?.outputTokens ?? null,
        retries: s.phases.total?.retries ?? null,
        passedSteps: s.phases.total?.passed ?? null,
        cumulativeCost: s.cumulativeCost,
      })),
    };
  }));
  const totalsFor = (task: string, cond: string, phase: Phase): number[] =>
    complete.filter((s) => s.task === task && s.condition === cond).map((s) => s.phases[phase]?.costUsd).filter((v): v is number => v !== undefined);
  const tests = tasks.map((task) => {
    const a = totalsFor(task, "A", "total");
    const b = totalsFor(task, "B", "total");
    const mw = mannWhitney(a, b);
    const ma = median(a);
    const mb = median(b);
    return { task, nA: a.length, nB: b.length, medianA: round(ma), medianB: round(mb), ratioBoverA: ma !== null && mb !== null && ma > 0 ? round(mb / ma, 3) : null, u: mw?.u ?? null, p: round(mw?.p ?? null) };
  });
  const pooled = Object.fromEntries((Object.keys(PHASES) as Phase[]).map((phase) => [phase, (() => {
    const strata = tasks.map((task) => ({ a: totalsFor(task, "A", phase), b: totalsFor(task, "B", phase) })).filter((s) => s.a.length > 0 && s.b.length > 0);
    const r = stratifiedBootstrap(strata);
    return { tasks: strata.length, ratio: round(r.estimate, 3), ci95: [round(r.lo, 3), round(r.hi, 3)] };
  })()]));
  // H-b: step at which B's median cumulative cost first falls to or below A's (null if never).
  const crossings = tasks.map((task) => {
    const a = groups.find((g) => g.task === task && g.condition === "A")?.cumulativeCostMedian ?? [];
    const b = groups.find((g) => g.task === task && g.condition === "B")?.cumulativeCostMedian ?? [];
    const idx = STEPS_R2.findIndex((_, i) => a[i] !== null && b[i] !== null && a[i] !== undefined && b[i] !== undefined && (b[i] as number) <= (a[i] as number));
    return { task, firstStepBAtOrBelowA: idx < 0 ? null : STEPS_R2[idx], a, b };
  });
  const spent = records.reduce((s, r) => s + (r.costUsd ?? 0), 0) + (await abortedCost(resultsDir));
  const failures = records.filter((r) => !r.pass).map((r) => ({
    key: r.key, step: r.step, status: r.status, retries: r.retriesUsed,
    failedChecks: r.validation.checks.filter((c) => c.gating && !c.ok).map((c) => `${c.name}: ${c.detail}`),
  }));
  const summary = {
    round: 2, generatedFrom: `${records.length} step records, ${sessions.length} sessions (${complete.length} complete)`,
    spentUsd: round(spent, 2), pricePerMTok: PRICE_PER_MTOK, groups, tests, pooled, crossings, failures,
    incompleteSessions: sessions.filter((s) => !s.complete).map((s) => s.key),
  };
  await writeFile(join(resultsDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);

  const md: string[] = [
    "# Round 2 summary", "",
    `${summary.generatedFrom}. Spent ${money(spent)} including aborted invocations.`, "",
    "Cost is Claude Code's reported `total_cost_usd` per invocation (per-invocation difference for resumed sessions); a step's cost includes its fix-up retries.", "",
    "## All-steps cost per task (primary)", "",
    "| Task | n A | n B | median A | median B | B/A | U | two-sided p |", "|---|---|---|---|---|---|---|---|",
    ...tests.map((t) => `| ${t.task} | ${t.nA} | ${t.nB} | ${money(t.medianA)} | ${money(t.medianB)} | ${t.ratioBoverA ?? "–"} | ${t.u ?? "–"} | ${t.p ?? "–"} |`),
    "",
    "## Pooled ratio of medians (B/A), geometric mean over tasks, 95% bootstrap CI stratified by task", "",
    "| Phase | tasks | ratio | 95% CI |", "|---|---|---|---|",
    ...(Object.entries(pooled) as [string, { tasks: number; ratio: number | null; ci95: (number | null)[] }][]).map(([phase, v]) => `| ${phase} | ${v.tasks} | ${v.ratio ?? "–"} | ${v.ci95[0] ?? "–"} to ${v.ci95[1] ?? "–"} |`),
    "",
    "## Medians per phase", "",
    "| Task | Cond | n | create | rev1-3 (resumed) | rev4-5 (fresh) | total | output tok | cache-write $ | cache-read $ | input $ | output $ | turns | API s | outside-API s | retries | step pass | first pass |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...groups.map((g) => {
      const t = g.medians.total ?? {};
      return `| ${g.task} | ${g.condition} | ${g.sessions} | ${money(g.medians.create?.costUsd ?? null)} | ${money(g.medians.resumed?.costUsd ?? null)} | ${money(g.medians.fresh?.costUsd ?? null)} | ${money(t.costUsd ?? null)} | ${num(t.outputTokens ?? null)} | ${money(t.costCacheWrite ?? null)} | ${money(t.costCacheRead ?? null)} | ${money(t.costInput ?? null)} | ${money(t.costOutput ?? null)} | ${num(t.turns ?? null)} | ${num(t.apiSeconds ?? null)} | ${num(t.outsideApiSeconds ?? null)} | ${g.retriesTotal} | ${g.stepPassRate ?? "–"} | ${g.firstPassRate ?? "–"} |`;
    }),
    "",
    "## Median cumulative cost by step", "",
    `| Task | Cond | ${STEPS_R2.join(" | ")} |`, `|---|---|${STEPS_R2.map(() => "---").join("|")}|`,
    ...groups.map((g) => `| ${g.task} | ${g.condition} | ${g.cumulativeCostMedian.map(money).join(" | ")} |`),
    "",
    ...crossings.map((c) => `- ${c.task}: first step where B's median cumulative cost is at or below A's: ${c.firstStepBAtOrBelowA ?? "never"}`),
    "",
    "## Background tasks killed at invocation end", "",
    "`claude -p` stops background tasks when an invocation ends; a render started in the background and not awaited leaves stale or missing output, which the validators then catch.", "",
    "| Task | Cond | killed |", "|---|---|---|",
    ...groups.map((g) => `| ${g.task} | ${g.condition} | ${g.backgroundTasksKilled} |`),
    "",
    "## Per session", "",
    "| Session | create | rev1-3 | rev4-5 | total | retries | passed steps |", "|---|---|---|---|---|---|---|",
    ...groups.flatMap((g) => g.perSession.map((s) => `| ${s.key} | ${money(s.costUsd.create ?? null)} | ${money(s.costUsd.resumed ?? null)} | ${money(s.costUsd.fresh ?? null)} | ${money(s.costUsd.total ?? null)} | ${s.retries ?? "–"} | ${s.passedSteps ?? "–"}/6 |`)),
    "",
    "## Failed steps (after retries)", "",
    ...(failures.length === 0 ? ["None."] : failures.map((f) => `- ${f.key} ${f.step} (${f.status}, ${f.retries} retries): ${f.failedChecks.join("; ") || "no failing check"}`)),
    "",
  ];
  if (summary.incompleteSessions.length > 0) md.push(`Incomplete sessions (excluded from medians and tests): ${summary.incompleteSessions.join(", ")}`, "");
  await writeFile(join(resultsDir, "summary.md"), md.join("\n"));
}

if (import.meta.main) {
  const dir = process.argv[2];
  if (dir === undefined) throw new Error("usage: summarize-r2.ts <results-dir>");
  await summarizeR2(dir);
}
