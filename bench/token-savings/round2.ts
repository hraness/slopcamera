// Round 2 runner: harder tasks, a create step and five revisions per session,
// harness-owned fix-up retries. Reached through `harness.ts <command> --round 2`.
// It reuses round 1's agent command, isolation, per-session SlopCamera HOME shim,
// email redaction and condition B install; see PREREGISTRATION-r2.md.
import { randomUUID, createHash } from "node:crypto";
import { appendFile, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import {
  BENCH_DIR, BudgetExhausted, EFFORT, MODEL, REPO_ROOT, RateLimited, STEP_TIMEOUT_MS, TOOLS,
  claudeArgs, conditionEnv, countSlopcameraCommands, ensureBenchBin, isDir, isRateLimited, must,
  numberOr, preflightOf, prepareSandbox, redact, runClaude, statusOf, summarizeStream, usageOf,
  type Condition, type Status, type ToolCall, type Usage,
} from "./harness";
import { thumbnail } from "./media";
import { summarizeR2 } from "./summarize-r2";
import type { Check, Validation } from "./tasks";
import {
  FRESH_STEPS, STEPS_R2, TASKS_R2, isTaskIdR2, loadPromptsR2, stepIndex, writeInputs,
  type StepR2, type TaskIdR2,
} from "./tasks-r2";

/** Per invocation. A resumed session's cap is cumulative, so it is scaled by invocations so far. */
export const STEP_BUDGET_USD_R2 = 8;
export const MAX_RETRIES = 2;
export const PRICE_PER_MTOK = { input: 4, cacheWrite: 8, cacheRead: 0.2, output: 20 } as const;

export interface PathsR2 {
  readonly results: string;
  readonly raw: string;
  readonly thumbs: string;
  readonly outputs: string;
  readonly tools: string;
  readonly sandboxes: string;
  readonly inputs: string;
}

function pathsR2(flags: Map<string, string>, runId: string): PathsR2 {
  const outputRoot = resolve(flags.get("outputs") ?? join(REPO_ROOT, "..", `${basename(REPO_ROOT)}-bench-outputs`));
  const sandboxRoot = resolve(flags.get("sandboxes") ?? "/private/tmp/slopcamera-bench");
  const results = join(BENCH_DIR, "results", runId);
  return {
    results,
    raw: join(results, "raw"),
    thumbs: join(results, "thumbs"),
    outputs: join(outputRoot, "r2", runId),
    tools: join(outputRoot, "tools"),
    sandboxes: join(sandboxRoot, `r2-${runId}`),
    inputs: join(outputRoot, "r2", runId, "inputs"),
  };
}

// ---------------------------------------------------------------- records

export interface Attempt {
  /** 0 is the step prompt; 1 and 2 are fix-up retries. */
  readonly attempt: number;
  readonly prompt: string;
  readonly promptSha256: string;
  readonly startedAt: string;
  readonly status: Status;
  readonly budgetCapUsd: number;
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly wallSeconds: number;
  /** This invocation's own API time (duration_api_ms is cumulative over a resumed session). */
  readonly apiSeconds: number | null;
  readonly numTurns: number | null;
  /** This invocation's own cost: reported session total minus the previous invocation's. */
  readonly costUsd: number | null;
  readonly sessionCostUsd: number | null;
  /** The same cost priced from this invocation's usage, as a cross-check. */
  readonly pricedCostUsd: number | null;
  readonly usage: Usage | null;
  readonly resultSubtype: string | null;
  readonly resultText: string;
  readonly toolCallCounts: Readonly<Record<string, number>>;
  readonly slopcameraCommands: number;
  readonly skillCalls: readonly string[];
  readonly toolCalls: readonly ToolCall[];
  readonly stderrTail: string;
  /**
   * Background tasks Claude Code killed when the invocation ended (`claude -p` stops
   * them at exit), for example a render started with run_in_background and not
   * awaited. Descriptive; the validators see whatever the killed task left behind.
   */
  readonly backgroundTasksKilled: number;
  readonly validation: Validation;
  readonly pass: boolean;
}

export interface StepRecordR2 {
  readonly round: 2;
  readonly key: string;
  readonly task: TaskIdR2;
  readonly condition: Condition;
  readonly repeat: number;
  readonly step: StepR2;
  readonly stepIndex: number;
  readonly fresh: boolean;
  readonly sessionId: string;
  /** Invocations in this conversation before this step. */
  readonly priorInvocations: number;
  readonly command: readonly string[];
  readonly preflight: Record<string, string>;
  readonly init: Record<string, unknown> | null;
  readonly attempts: readonly Attempt[];
  readonly retriesUsed: number;
  readonly firstPass: boolean;
  readonly pass: boolean;
  readonly status: Status;
  readonly costUsd: number | null;
  readonly pricedCostUsd: number | null;
  readonly usage: Usage;
  readonly wallSeconds: number;
  readonly apiSeconds: number | null;
  readonly numTurns: number | null;
  readonly slopcameraCommands: number;
  /** Final validation (after the last attempt). */
  readonly validation: Validation;
  readonly note: string;
}

export function pricedCost(u: Usage | null): number | null {
  if (u === null) return null;
  return (u.inputTokens * PRICE_PER_MTOK.input + u.cacheCreationInputTokens * PRICE_PER_MTOK.cacheWrite
    + u.cacheReadInputTokens * PRICE_PER_MTOK.cacheRead + u.outputTokens * PRICE_PER_MTOK.output) / 1e6;
}

function round7(n: number): number {
  return Math.round(n * 1e7) / 1e7;
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

export async function readRecordsR2(rawDir: string): Promise<StepRecordR2[]> {
  let names: string[] = [];
  try {
    names = await readdir(rawDir);
  } catch {
    return [];
  }
  const out: StepRecordR2[] = [];
  for (const name of names.sort()) {
    if (!name.endsWith(".json")) continue;
    const r = await readJson<StepRecordR2>(join(rawDir, name));
    if (r !== null && r.round === 2) out.push(r);
  }
  return out;
}

async function spentUsdR2(p: PathsR2): Promise<number> {
  const done = (await readRecordsR2(p.raw)).reduce((sum, r) => sum + (r.costUsd ?? 0), 0);
  let aborted = 0;
  try {
    for (const name of await readdir(join(p.results, "aborted"))) {
      if (!name.endsWith(".json")) continue;
      const a = await readJson<{ costUsd?: number | null }>(join(p.results, "aborted", name));
      aborted += a?.costUsd ?? 0;
    }
  } catch {
    // none
  }
  return done + aborted;
}

// ---------------------------------------------------------------- filesystem

/** APFS clone copy: near-free until files diverge, which keeps per-step snapshots cheap. */
async function cloneDir(from: string, to: string): Promise<void> {
  await rm(to, { recursive: true, force: true });
  await must(["/bin/cp", "-cR", from, to]);
}

/** Counts `task_updated` events with status `killed` in a stream-json transcript. */
export async function countKilledBackgroundTasks(streamPath: string): Promise<number> {
  let text = "";
  try {
    text = await readFile(streamPath, "utf8");
  } catch {
    return 0;
  }
  let killed = 0;
  for (const line of text.split("\n")) {
    if (!line.includes("task_updated")) continue;
    try {
      const event = JSON.parse(line) as { type?: unknown; subtype?: unknown; patch?: { status?: unknown } };
      if (event.type === "system" && event.subtype === "task_updated" && event.patch?.status === "killed") killed++;
    } catch {
      // A truncated final line is not an event.
    }
  }
  return killed;
}

const PRUNE_BYTES = 20 * 1024 * 1024;

/**
 * After a session completes, drops large intermediate files (render caches, frame
 * dumps) from a snapshot. Outputs under out/ and all small files stay, so the
 * validators can still be rerun on every step.
 */
async function pruneSnapshot(dir: string): Promise<void> {
  await must(["/usr/bin/find", dir, "-type", "f", "-size", `+${PRUNE_BYTES / 1024}k`, "-not", "-path", `${dir}/out/*`, "-delete"]).catch(() => "");
  await must(["/usr/bin/find", dir, "-type", "d", "-name", "frames", "-prune", "-exec", "/bin/rm", "-rf", "{}", "+"]).catch(() => "");
}

const PROJECTS = join(process.env.HOME ?? "", ".claude", "projects");

async function transcriptOf(sessionId: string): Promise<string | null> {
  let dirs: string[] = [];
  try {
    dirs = await readdir(PROJECTS);
  } catch {
    return null;
  }
  for (const dir of dirs) {
    if (!dir.includes("slopcamera-bench-r2-")) continue;
    const path = join(PROJECTS, dir, `${sessionId}.jsonl`);
    if (await Bun.file(path).exists()) return path;
  }
  return null;
}

// ---------------------------------------------------------------- run

interface RunOptionsR2 {
  readonly runId: string;
  readonly tasks: readonly TaskIdR2[];
  readonly conditions: readonly Condition[];
  readonly repeats: readonly number[];
  readonly maxTotalUsd: number;
  readonly claude: string;
  readonly concurrency: number;
}

function failingMessage(checks: readonly Check[], status: Status): string {
  const lines = checks.filter((c) => c.gating && !c.ok).map((c) => `- ${c.name}: ${c.detail}`);
  if (status !== "ok") lines.unshift(`- run: the previous turn ended with status "${status}"`);
  return `These checks failed:\n${lines.join("\n")}\nFix and re-render.`;
}

function resetTimeOf(text: string): string {
  const m = /resets?\s*(?:at|in)?\s*([^\n.|"]{1,60})/i.exec(text);
  return m?.[1]?.trim() ?? "";
}

export class RateLimitedR2 extends RateLimited {
  constructor(message: string, readonly resetTime: string) {
    super(message);
  }
}

interface StepCtx {
  readonly p: PathsR2;
  readonly options: RunOptionsR2;
  readonly key: string;
  readonly task: TaskIdR2;
  readonly condition: Condition;
  readonly repeat: number;
  readonly step: StepR2;
  readonly sandbox: string;
  readonly env: Record<string, string>;
  readonly outDir: string;
}

async function runStepR2(
  ctx: StepCtx,
  prompt: string,
  conversation: { sessionId: string; priorInvocations: number; priorSessionCostUsd: number; priorApiMs: number },
  previousHashes: Readonly<Record<string, string | null>>,
): Promise<StepRecordR2> {
  const spec = TASKS_R2[ctx.task];
  const preflight = await preflightOf(ctx.sandbox, ctx.env);
  const attempts: Attempt[] = [];
  let init: Record<string, unknown> | null = null;
  let sessionCost = conversation.priorSessionCostUsd;
  let apiMs = conversation.priorApiMs;
  let text = prompt;
  let firstArgv: string[] = [];
  let validation: Validation | null = null;
  const toolInputs: string[] = [];
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const invocations = conversation.priorInvocations + attempt;
    if ((await spentUsdR2(ctx.p)) >= ctx.options.maxTotalUsd) throw new BudgetExhausted(`spent >= $${ctx.options.maxTotalUsd} before ${ctx.key} ${ctx.step} attempt ${attempt}`);
    const cap = STEP_BUDGET_USD_R2 * (invocations + 1);
    const argv = claudeArgs(ctx.options.claude, ctx.sandbox, { sessionId: conversation.sessionId, resume: invocations > 0 }, cap);
    if (attempt === 0) firstArgv = argv;
    const startedAt = new Date().toISOString();
    console.error(`[${startedAt}] ${ctx.key} ${ctx.step} attempt ${attempt} (cap $${cap}) …`);
    const streamPath = join(ctx.outDir, `${ctx.step}.a${attempt}.stream.jsonl`);
    const session = await runClaude(argv, text, ctx.sandbox, ctx.env, streamPath);
    await writeFile(join(ctx.outDir, `${ctx.step}.a${attempt}.stderr.txt`), session.stderr);
    const result = session.stream.result;
    init ??= session.stream.init;
    const usage = usageOf(result);
    const reported = numberOr(result?.total_cost_usd);
    const reportedApi = numberOr(result?.duration_api_ms);
    const costUsd = reported === null ? pricedCost(usage) : round7(reported - sessionCost);
    const ownApiMs = reportedApi === null ? null : reportedApi - apiMs;
    if (reported !== null) sessionCost = reported;
    if (reportedApi !== null) apiMs = reportedApi;
    toolInputs.push(session.stream.toolInputText);
    const limited = isRateLimited(session);
    const status = statusOf(session);
    const counts: Record<string, number> = {};
    for (const call of session.stream.toolCalls) counts[call.name] = (counts[call.name] ?? 0) + 1;
    if (limited !== null) {
      await mkdir(join(ctx.p.results, "aborted"), { recursive: true });
      const spentBefore = attempts.reduce((s, a) => s + (a.costUsd ?? 0), 0);
      await writeFile(join(ctx.p.results, "aborted", `${ctx.key}-${ctx.step}-${Date.now()}.json`), `${JSON.stringify({
        key: ctx.key, step: ctx.step, attempt, costUsd: (costUsd ?? 0) + spentBefore, note: "rate limited; step discarded and redone on resume",
        resultText: redact(result?.result), stderrTail: session.stderr.slice(-2000),
      }, null, 2)}\n`);
      throw new RateLimitedR2(limited, resetTimeOf(limited));
    }
    validation = await spec.validate({ sandbox: ctx.sandbox, step: ctx.step, previousHashes, toolInputText: toolInputs.join("\n") });
    const pass = status === "ok" && validation.pass;
    attempts.push({
      attempt,
      prompt: text,
      promptSha256: createHash("sha256").update(text).digest("hex"),
      startedAt,
      status,
      budgetCapUsd: cap,
      exitCode: session.exitCode,
      timedOut: session.timedOut,
      wallSeconds: Math.round(session.wallMs / 100) / 10,
      apiSeconds: ownApiMs === null ? null : Math.round(ownApiMs / 100) / 10,
      numTurns: numberOr(result?.num_turns),
      costUsd,
      sessionCostUsd: reported,
      pricedCostUsd: pricedCost(usage),
      usage,
      resultSubtype: typeof result?.subtype === "string" ? result.subtype : null,
      resultText: redact(typeof result?.result === "string" ? result.result.slice(0, 2000) : "") ?? "",
      toolCallCounts: counts,
      slopcameraCommands: countSlopcameraCommands(session.stream.bashCommands),
      skillCalls: session.stream.toolCalls.filter((c) => c.name === "Skill").map((c) => c.input),
      toolCalls: session.stream.toolCalls,
      stderrTail: session.stderr.slice(-2000),
      backgroundTasksKilled: await countKilledBackgroundTasks(streamPath),
      validation,
      pass,
    });
    if (pass) break;
    text = failingMessage(validation.checks, status);
  }
  if (validation === null) throw new Error("unreachable: no attempt ran");
  const sum = (pick: (a: Attempt) => number | null): number | null =>
    attempts.some((a) => pick(a) === null) ? null : round7(attempts.reduce((s, a) => s + (pick(a) ?? 0), 0));
  const usage: Usage = {
    inputTokens: attempts.reduce((s, a) => s + (a.usage?.inputTokens ?? 0), 0),
    cacheCreationInputTokens: attempts.reduce((s, a) => s + (a.usage?.cacheCreationInputTokens ?? 0), 0),
    cacheReadInputTokens: attempts.reduce((s, a) => s + (a.usage?.cacheReadInputTokens ?? 0), 0),
    outputTokens: attempts.reduce((s, a) => s + (a.usage?.outputTokens ?? 0), 0),
  };
  const last = attempts[attempts.length - 1];
  return {
    round: 2,
    key: ctx.key,
    task: ctx.task,
    condition: ctx.condition,
    repeat: ctx.repeat,
    step: ctx.step,
    stepIndex: stepIndex(ctx.step),
    fresh: FRESH_STEPS.has(ctx.step),
    sessionId: conversation.sessionId,
    priorInvocations: conversation.priorInvocations,
    command: ["claude", ...firstArgv.slice(1)],
    preflight,
    init: init === null ? null : {
      model: init.model, permissionMode: init.permissionMode, tools: init.tools, skills: init.skills,
      slashCommands: init.slash_commands, mcpServers: init.mcp_servers, plugins: init.plugins,
      claudeCodeVersion: init.claude_code_version,
    },
    attempts,
    retriesUsed: attempts.length - 1,
    firstPass: attempts[0]?.pass ?? false,
    pass: last?.pass ?? false,
    status: last?.status ?? "error",
    costUsd: sum((a) => a.costUsd),
    pricedCostUsd: sum((a) => a.pricedCostUsd),
    usage,
    wallSeconds: Math.round(attempts.reduce((s, a) => s + a.wallSeconds, 0) * 10) / 10,
    apiSeconds: sum((a) => a.apiSeconds),
    numTurns: sum((a) => a.numTurns),
    slopcameraCommands: attempts.reduce((s, a) => s + a.slopcameraCommands, 0),
    validation,
    note: "",
  };
}

async function writeThumbs(p: PathsR2, key: string, task: TaskIdR2, step: StepR2, sandbox: string): Promise<void> {
  await mkdir(p.thumbs, { recursive: true });
  const spec = TASKS_R2[task];
  for (const rel of spec.outputsAt(step)) {
    if (rel.endsWith(".svg")) continue;
    const name = `${key}-${step}-${basename(rel).replace(/\.[^.]+$/, "")}.jpg`;
    await thumbnail(join(sandbox, rel), join(p.thumbs, name), spec.videoOutputs.includes(rel));
  }
}

function conversationOf(records: readonly StepRecordR2[], step: StepR2): { sessionId: string; priorInvocations: number; priorSessionCostUsd: number; priorApiMs: number } {
  if (FRESH_STEPS.has(step) || step === "create") return { sessionId: randomUUID(), priorInvocations: 0, priorSessionCostUsd: 0, priorApiMs: 0 };
  // rev1..rev3 resume the create conversation.
  const same = records.filter((r) => !r.fresh);
  const last = same[same.length - 1];
  if (last === undefined) throw new Error(`no create record before ${step}`);
  const lastAttempt = last.attempts[last.attempts.length - 1];
  const invocations = same.reduce((s, r) => s + r.attempts.length, 0);
  const apiMs = same.flatMap((r) => r.attempts).reduce((s, a) => s + (a.apiSeconds ?? 0) * 1000, 0);
  return { sessionId: last.sessionId, priorInvocations: invocations, priorSessionCostUsd: lastAttempt?.sessionCostUsd ?? 0, priorApiMs: apiMs };
}

async function runSessionR2(p: PathsR2, options: RunOptionsR2, inputs: Record<TaskIdR2, [string, string][]>, task: TaskIdR2, condition: Condition, repeat: number): Promise<void> {
  const key = `${task}-${condition}-r${repeat}`;
  const prompts = await loadPromptsR2(TASKS_R2[task]);
  const sandbox = join(p.sandboxes, key);
  const outDir = join(p.outputs, key);
  const bunPrefix = join(outDir, "bun-prefix");
  const env = conditionEnv(condition, p, bunPrefix, join(sandbox, ".tmp"));
  await mkdir(outDir, { recursive: true });
  const records: StepRecordR2[] = [];
  for (const step of STEPS_R2) {
    const recordPath = join(p.raw, `${key}-${step}.json`);
    const existing = await readJson<StepRecordR2>(recordPath);
    if (existing !== null) {
      records.push(existing);
      continue;
    }
    const prev = records[records.length - 1];
    if (step === "create") {
      await prepareSandbox(p, condition, sandbox, bunPrefix, env, { taskMd: prompts.taskMd, t4Inputs: false, extraInputs: inputs[task] });
    } else {
      // Resuming after an interruption: restore the sandbox and transcript as they were after the previous step.
      const snapshot = join(outDir, `after-${prev?.step ?? "create"}`);
      await cloneDir(snapshot, sandbox);
      const conv = conversationOf(records, step);
      if (!FRESH_STEPS.has(step)) {
        const backup = join(outDir, "transcripts", `${conv.sessionId}.after-${prev?.step}.jsonl`);
        const live = await transcriptOf(conv.sessionId);
        if (live !== null && (await Bun.file(backup).exists())) await cp(backup, live);
      }
    }
    await mkdir(join(sandbox, ".tmp"), { recursive: true });
    const conv = conversationOf(records, step);
    const record = await runStepR2(
      { p, options, key, task, condition, repeat, step, sandbox, env, outDir },
      prompts.prompts[step], conv, prev?.validation.hashes ?? {},
    );
    await mkdir(p.raw, { recursive: true });
    await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`);
    await cloneDir(sandbox, join(outDir, `after-${step}`));
    const live = await transcriptOf(record.sessionId);
    if (live !== null) {
      await mkdir(join(outDir, "transcripts"), { recursive: true });
      await cp(live, join(outDir, "transcripts", `${record.sessionId}.after-${step}.jsonl`));
    }
    await writeThumbs(p, key, task, step, sandbox);
    records.push(record);
  }
  // The B install is a copy of tools/prefix-b; drop it to save disk once the session is complete.
  await rm(bunPrefix, { recursive: true, force: true });
  for (const step of STEPS_R2) await pruneSnapshot(join(outDir, `after-${step}`));
  await rm(sandbox, { recursive: true, force: true });
}

/** ABBA: odd repeats run the conditions in the given order, even repeats reversed. */
export function scheduleR2(tasks: readonly TaskIdR2[], conditions: readonly Condition[], repeats: readonly number[]): [TaskIdR2, Condition, number][] {
  const out: [TaskIdR2, Condition, number][] = [];
  for (const repeat of repeats) {
    const order = repeat % 2 === 1 ? conditions : [...conditions].reverse();
    for (const task of tasks) for (const condition of order) out.push([task, condition, repeat]);
  }
  return out;
}

async function runAllR2(p: PathsR2, options: RunOptionsR2): Promise<number> {
  await mkdir(p.raw, { recursive: true });
  await ensureBenchBin(p);
  if (!(await isDir(join(p.tools, "prefix-b")))) throw new Error("run `harness.ts setup` (round 1) first; round 2 reuses its tools");
  const inputs = await writeInputs(p.inputs);
  const version = (await must([options.claude, "--version"])).trim();
  await writeFile(join(p.results, "run.json"), `${JSON.stringify({
    round: 2,
    runId: options.runId,
    claude: version,
    model: MODEL,
    effort: EFFORT,
    tools: TOOLS,
    stepBudgetUsdPerInvocation: STEP_BUDGET_USD_R2,
    budgetCapRule: "--max-budget-usd = 8 x (invocations in this conversation including the current one); the cap is cumulative over a resumed session",
    maxRetries: MAX_RETRIES,
    stepTimeoutMinutes: STEP_TIMEOUT_MS / 60000,
    maxTotalUsd: options.maxTotalUsd,
    concurrency: options.concurrency,
    tasks: options.tasks,
    conditions: options.conditions,
    repeats: options.repeats,
    schedule: scheduleR2(options.tasks, options.conditions, options.repeats).map(([t, c, r]) => `${t}-${c}-r${r}`),
    commandTemplate: claudeArgs("claude", "<sandbox>", { sessionId: "<uuid>", resume: false }, STEP_BUDGET_USD_R2),
    resumeTemplate: claudeArgs("claude", "<sandbox>", { sessionId: "<uuid>", resume: true }, STEP_BUDGET_USD_R2 * 2),
    toolsManifest: JSON.parse(await readFile(join(p.tools, "manifest.json"), "utf8")) as unknown,
  }, null, 2)}\n`);
  const queue = scheduleR2(options.tasks, options.conditions, options.repeats);
  let stop: unknown = null;
  const worker = async (): Promise<void> => {
    while (stop === null) {
      const next = queue.shift();
      if (next === undefined) return;
      try {
        await runSessionR2(p, options, inputs, ...next);
      } catch (error) {
        stop ??= error;
      }
    }
  };
  await Promise.all(Array.from({ length: options.concurrency }, worker));
  await summarizeR2(p.results);
  if (stop instanceof RateLimitedR2) {
    await appendFile(join(p.results, "rate-limited.txt"), `${new Date().toISOString()} ${stop.resetTime} ${stop.message.slice(0, 400)}\n`);
    console.log(`RATE_LIMITED ${stop.resetTime}`);
    return 3;
  }
  if (stop instanceof BudgetExhausted) {
    console.log(`BUDGET_EXHAUSTED ${stop.message}`);
    return 4;
  }
  if (stop !== null) throw stop;
  console.log(`done: ${join(p.results, "summary.md")}`);
  return 0;
}

/** Reruns the frozen validators on saved per-step snapshots (used only for disclosed post-hoc changes). */
async function revalidateR2(p: PathsR2): Promise<void> {
  const records = await readRecordsR2(p.raw);
  const byKey = new Map<string, StepRecordR2[]>();
  for (const r of records) byKey.set(r.key, [...(byKey.get(r.key) ?? []), r]);
  for (const list of byKey.values()) {
    list.sort((a, b) => a.stepIndex - b.stepIndex);
    for (const [i, r] of list.entries()) {
      const outDir = join(p.outputs, r.key);
      const toolInputText = (await Promise.all(r.attempts.map(async (a) => {
        const lines = (await readFile(join(outDir, `${r.step}.a${a.attempt}.stream.jsonl`), "utf8")).split("\n").filter((l) => l.trim() !== "");
        return summarizeStream(lines).toolInputText;
      }))).join("\n");
      const validation = await TASKS_R2[r.task].validate({
        sandbox: join(outDir, `after-${r.step}`), step: r.step, previousHashes: list[i - 1]?.validation.hashes ?? {}, toolInputText,
      });
      const pass = r.status === "ok" && validation.pass;
      if (pass === r.pass) continue;
      console.log(`${r.key} ${r.step}: final pass ${r.pass} -> ${pass}`);
      const note = [r.note, `revalidated ${new Date().toISOString()}; original pass=${r.pass}`].filter((n) => n !== "").join("; ");
      await writeFile(join(p.raw, `${r.key}-${r.step}.json`), `${JSON.stringify({ ...r, validation, pass, originalPass: r.pass, note }, null, 2)}\n`);
    }
  }
}

export async function mainR2(command: string | undefined, flags: Map<string, string>): Promise<number> {
  const runId = flags.get("run-id") ?? `${new Date().toISOString().slice(0, 10)}-r2`;
  const p = pathsR2(flags, runId);
  if (command === "summarize") {
    await summarizeR2(p.results);
    return 0;
  }
  if (command === "revalidate") {
    await revalidateR2(p);
    return 0;
  }
  if (command === "inputs") {
    console.log(JSON.stringify(await writeInputs(p.inputs), null, 2));
    return 0;
  }
  if (command === "run") {
    const tasks = (flags.get("tasks") ?? "h1,h2,h3,h4,h5").split(",");
    const conditions = (flags.get("conditions") ?? "A,B").split(",");
    if (!tasks.every(isTaskIdR2)) throw new Error(`unknown task in ${tasks.join(",")}`);
    if (!conditions.every((c): c is Condition => c === "A" || c === "B")) throw new Error("conditions are A and/or B");
    const repeatsFlag = flags.get("repeats") ?? "4";
    const repeats = repeatsFlag.includes("-")
      ? (() => {
          const [a, b] = repeatsFlag.split("-").map(Number);
          return Array.from({ length: (b ?? 0) - (a ?? 0) + 1 }, (_, i) => (a ?? 1) + i);
        })()
      : Array.from({ length: Number(repeatsFlag) }, (_, i) => i + 1);
    if (repeats.length === 0 || !repeats.every((r) => Number.isInteger(r) && r >= 1)) throw new Error("--repeats is N or FROM-TO");
    const maxTotalUsd = Number(flags.get("max-total-usd") ?? "220");
    const concurrency = Number(flags.get("concurrency") ?? "1");
    if (!Number.isFinite(maxTotalUsd) || maxTotalUsd <= 0) throw new Error("--max-total-usd must be positive");
    if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error("--concurrency must be a positive integer");
    const claude = Bun.which(flags.get("claude") ?? "claude");
    if (claude === null) throw new Error("claude CLI not found");
    return await runAllR2(p, { runId, tasks, conditions, repeats, maxTotalUsd, claude, concurrency });
  }
  console.error("usage: harness.ts run|summarize|revalidate|inputs --round 2 [--run-id ID] [--tasks h1,..] [--conditions A,B] [--repeats N|FROM-TO] [--max-total-usd N] [--concurrency N]");
  return 2;
}
