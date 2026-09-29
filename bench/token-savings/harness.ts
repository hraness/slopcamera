#!/usr/bin/env bun
// Token-savings benchmark harness. See README.md for the method.
//
//   bun bench/token-savings/harness.ts setup
//   bun bench/token-savings/harness.ts run --run-id 2026-09-29 --tasks t1,t2,t3,t4 --conditions A,B --repeats 2
//   bun bench/token-savings/harness.ts summarize --run-id 2026-09-29
//
// Sessions run sequentially. A rate-limited step stops the run; rerunning the same
// command resumes from the next unfinished session.
import { spawn } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { appendFile, cp, mkdir, readFile, readdir, readlink, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { FFMPEG, sha256, thumbnail } from "./media";
import { TASKS, isTaskId, loadPrompts, type Step, type TaskId, type Validation } from "./tasks";
import { summarize } from "./summarize";

export const MODEL = "claude-opus-5-5";
export const EFFORT = "medium";
export const TOOLS = "Bash,Read,Write,Edit,Glob,Grep,Skill";
export const STEP_BUDGET_USD = 6;
export const STEP_TIMEOUT_MS = 25 * 60 * 1000;
const RELEASE_VERSION = "3.8.0";
const RELEASE_TGZ = `hraness-slopcamera-${RELEASE_VERSION}.tgz`;
const RELEASE_BASE = `https://github.com/hraness/slopcamera/releases/download/v${RELEASE_VERSION}`;

export type Condition = "A" | "B";
export type Status = "ok" | "capped" | "timeout" | "error" | "skipped";

const BENCH_DIR = dirname(new URL(import.meta.url).pathname);
const REPO_ROOT = resolve(BENCH_DIR, "..", "..");

interface Paths {
  readonly results: string;
  readonly raw: string;
  readonly thumbs: string;
  readonly outputs: string;
  readonly tools: string;
  readonly sandboxes: string;
}

function parseFlags(argv: readonly string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (!arg.startsWith("--")) throw new Error(`unexpected argument ${arg}`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`flag ${arg} needs a value`);
    flags.set(arg.slice(2), value);
    i++;
  }
  return flags;
}

function paths(flags: Map<string, string>, runId: string): Paths {
  const outputRoot = resolve(flags.get("outputs") ?? join(REPO_ROOT, "..", `${basename(REPO_ROOT)}-bench-outputs`));
  // Sandboxes live outside $HOME so Claude Code's ancestor discovery of CLAUDE.md and
  // .claude/ directories cannot reach the user's ~/.claude.
  const sandboxRoot = resolve(flags.get("sandboxes") ?? "/private/tmp/slopcamera-bench");
  const results = join(BENCH_DIR, "results", runId);
  return {
    results,
    raw: join(results, "raw"),
    thumbs: join(results, "thumbs"),
    outputs: join(outputRoot, runId),
    tools: join(outputRoot, "tools"),
    sandboxes: join(sandboxRoot, runId),
  };
}

async function run(
  argv: readonly string[],
  options: { cwd?: string; env?: Record<string, string> } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn([...argv], {
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    ...(options.env === undefined ? {} : { env: options.env }),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, stdout, stderr };
}

async function must(argv: readonly string[], options: { cwd?: string; env?: Record<string, string> } = {}): Promise<string> {
  const result = await run(argv, options);
  if (result.code !== 0) throw new Error(`${argv.join(" ")} failed (${result.code}): ${result.stderr.trim()}`);
  return result.stdout;
}

async function isDir(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- setup

async function setup(p: Paths): Promise<void> {
  await mkdir(p.tools, { recursive: true });
  await ensureBenchBin(p);
  const tgz = join(p.tools, RELEASE_TGZ);
  const sums = await (await fetch(`${RELEASE_BASE}/SHA256SUMS`)).text();
  const expected = sums.split("\n").find((line) => line.endsWith(`  ${RELEASE_TGZ}`))?.split(" ")[0];
  if (expected === undefined) throw new Error("release SHA256SUMS has no tarball entry");
  if ((await sha256(tgz)) !== expected) {
    const response = await fetch(`${RELEASE_BASE}/${RELEASE_TGZ}`);
    if (!response.ok) throw new Error(`download failed: ${response.status}`);
    await writeFile(tgz, new Uint8Array(await response.arrayBuffer()));
  }
  const actual = await sha256(tgz);
  if (actual !== expected) throw new Error(`tarball sha256 ${actual} != release ${expected}`);
  const prefix = join(p.tools, "prefix-b");
  await rm(prefix, { recursive: true, force: true });
  await mkdir(prefix, { recursive: true });
  await must(["bun", "add", "--global", tgz], {
    env: { HOME: process.env.HOME ?? "", PATH: process.env.PATH ?? "", BUN_INSTALL: prefix },
  });
  const version = (await must([join(prefix, "bin", "slopcamera"), "--version"], { env: conditionEnv("B", p, prefix, "/tmp") })).trim();
  if (version !== RELEASE_VERSION) throw new Error(`installed slopcamera reports ${version}`);
  // Shared inputs for T4, generated by the harness so both conditions get identical bytes.
  const inputs = join(p.tools, "t4-inputs");
  await mkdir(inputs, { recursive: true });
  for (const [name, source] of [["clip-a.mp4", "testsrc"], ["clip-b.mp4", "testsrc2"]] as const) {
    await must([
      FFMPEG, "-v", "error", "-y", "-f", "lavfi", "-i", `${source}=size=1280x720:rate=30:duration=4`,
      "-c:v", "libx264", "-threads", "1", "-pix_fmt", "yuv420p", "-preset", "medium", "-crf", "20", "-an",
      join(inputs, name),
    ]);
  }
  const manifest = {
    release: RELEASE_VERSION,
    tarballSha256: actual,
    inputs: {
      "clip-a.mp4": await sha256(join(inputs, "clip-a.mp4")),
      "clip-b.mp4": await sha256(join(inputs, "clip-b.mp4")),
    },
  };
  await writeFile(join(p.tools, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify(manifest, null, 2));
}

// ---------------------------------------------------------------- environment

/** Bench-owned bin dir exposing only bun/bunx from the user's Bun install, not the user's other global binaries. */
function benchBin(p: Paths): string {
  return join(p.tools, "bin");
}

async function ensureBenchBin(p: Paths): Promise<void> {
  const bin = benchBin(p);
  await mkdir(bin, { recursive: true });
  const bun = Bun.which("bun");
  if (bun === null) throw new Error("bun not on PATH");
  for (const name of ["bun", "bunx"]) {
    await rm(join(bin, name), { force: true });
    await Bun.write(join(bin, name), `#!/bin/sh\nexec "${bun}" ${name === "bunx" ? "x " : ""}"$@"\n`);
    await must(["chmod", "+x", join(bin, name)]);
  }
}

/**
 * The only difference between the conditions is the leading PATH entry and the Bun
 * global prefix. The user's Claude settings, CLAUDE.md, plugins, hooks, MCP servers and
 * local model proxy are excluded by the minimal env plus the claude flags below.
 */
function conditionEnv(condition: Condition, p: Paths, bunPrefix: string, tmp: string): Record<string, string> {
  const path = [
    ...(condition === "B" ? [join(bunPrefix, "bin")] : []),
    benchBin(p),
    "/opt/homebrew/bin", "/opt/homebrew/sbin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin",
  ].join(":");
  return {
    HOME: process.env.HOME ?? "",
    USER: process.env.USER ?? "",
    LOGNAME: process.env.LOGNAME ?? process.env.USER ?? "",
    SHELL: "/bin/zsh",
    TERM: "dumb",
    LANG: "en_US.UTF-8",
    TMPDIR: tmp,
    PATH: path,
    BUN_INSTALL: bunPrefix,
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
    DISABLE_AUTOUPDATER: "1",
  };
}

export function claudeArgs(claude: string, sandbox: string, session: { sessionId: string; resume: boolean }): string[] {
  return [
    claude, "-p",
    "--model", MODEL,
    "--effort", EFFORT,
    "--output-format", "stream-json", "--verbose",
    "--setting-sources", "project",
    "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}',
    "--tools", TOOLS,
    "--allowedTools", TOOLS,
    "--permission-mode", "dontAsk",
    "--add-dir", sandbox,
    "--max-budget-usd", String(STEP_BUDGET_USD),
    ...(session.resume ? ["--resume", session.sessionId] : ["--session-id", session.sessionId]),
  ];
}

// ---------------------------------------------------------------- claude session

interface ToolCall {
  readonly name: string;
  readonly input: string;
}

interface StreamSummary {
  init: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  toolCalls: ToolCall[];
  toolInputText: string;
  rateLimitEvents: string[];
}

const RATE_LIMIT = /rate[ _-]?limit|\b429\b|usage limit|limit reached|too many requests|overloaded_error/i;

function summarizeStream(lines: readonly string[]): StreamSummary {
  const summary: StreamSummary = { init: null, result: null, toolCalls: [], toolInputText: "", rateLimitEvents: [] };
  const inputs: string[] = [];
  for (const line of lines) {
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof event !== "object" || event === null) continue;
    const e = event as Record<string, unknown>;
    if (e.type === "system" && e.subtype === "init") summary.init = e;
    if (e.type === "result") summary.result = e;
    if (e.type === "system" && typeof e.subtype === "string" && /retry|rate/i.test(e.subtype) && RATE_LIMIT.test(line)) {
      summary.rateLimitEvents.push(line.slice(0, 500));
    }
    if (e.type === "assistant") {
      const message = e.message as { content?: unknown } | undefined;
      const content = Array.isArray(message?.content) ? message.content : [];
      for (const block of content) {
        if (typeof block === "object" && block !== null && (block as { type?: unknown }).type === "tool_use") {
          const b = block as { name?: unknown; input?: unknown };
          const text = JSON.stringify(b.input ?? null);
          inputs.push(text);
          summary.toolCalls.push({ name: String(b.name), input: text.length > 600 ? `${text.slice(0, 600)}…` : text });
        }
      }
    }
  }
  summary.toolInputText = inputs.join("\n");
  return summary;
}

interface SessionRun {
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly timedOut: boolean;
  readonly wallMs: number;
  readonly stderr: string;
  readonly stream: StreamSummary;
}

async function runClaude(argv: readonly string[], prompt: string, cwd: string, env: Record<string, string>, streamPath: string): Promise<SessionRun> {
  const started = Date.now();
  const [command, ...args] = argv;
  if (command === undefined) throw new Error("empty argv");
  // Own process group so a timeout also stops renderers the agent started.
  const child = spawn(command, args, { cwd, env, detached: true, stdio: ["pipe", "pipe", "pipe"] });
  child.stdin.end(prompt);
  const lines: string[] = [];
  let buffer = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buffer += chunk;
    const parts = buffer.split("\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) if (part.trim() !== "") lines.push(part);
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  let timedOut = false;
  const killGroup = (signal: NodeJS.Signals): void => {
    try {
      if (child.pid !== undefined) process.kill(-child.pid, signal);
    } catch {
      // already gone
    }
  };
  const timer = setTimeout(() => {
    timedOut = true;
    killGroup("SIGTERM");
    setTimeout(() => killGroup("SIGKILL"), 10_000).unref();
  }, STEP_TIMEOUT_MS);
  const [exitCode, signal] = await new Promise<[number | null, string | null]>((done) => {
    child.on("close", (code, sig) => done([code, sig]));
  });
  clearTimeout(timer);
  killGroup("SIGKILL"); // stray background children of the agent
  if (buffer.trim() !== "") lines.push(buffer);
  await writeFile(streamPath, `${lines.join("\n")}\n`);
  return { exitCode, signal, timedOut, wallMs: Date.now() - started, stderr, stream: summarizeStream(lines) };
}

// ---------------------------------------------------------------- records

export interface Usage {
  readonly inputTokens: number;
  readonly cacheCreationInputTokens: number;
  readonly cacheReadInputTokens: number;
  readonly outputTokens: number;
}

export interface StepRecord {
  readonly key: string;
  readonly task: TaskId;
  readonly condition: Condition;
  readonly repeat: number;
  readonly step: Step;
  readonly status: Status;
  readonly pass: boolean;
  readonly sessionId: string;
  readonly startedAt: string;
  readonly command: readonly string[];
  readonly promptSha256: string;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly timedOut: boolean;
  readonly wallSeconds: number;
  readonly resultSubtype: string | null;
  readonly isError: boolean | null;
  readonly numTurns: number | null;
  readonly durationApiMs: number | null;
  readonly costUsd: number | null;
  readonly usage: Usage | null;
  readonly inputSideTokens: number | null;
  readonly modelUsage: unknown;
  readonly resultText: string;
  readonly init: {
    readonly model: unknown;
    readonly permissionMode: unknown;
    readonly tools: unknown;
    readonly skills: unknown;
    readonly slashCommands: unknown;
    readonly mcpServers: unknown;
    readonly plugins: unknown;
    readonly claudeCodeVersion: unknown;
  } | null;
  readonly preflight: Record<string, string>;
  readonly toolCallCounts: Readonly<Record<string, number>>;
  readonly slopcameraCommands: number;
  readonly skillCalls: readonly string[];
  readonly toolCalls: readonly ToolCall[];
  readonly stderrTail: string;
  readonly validation: Validation | null;
  readonly note: string;
}

function numberOr(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function usageOf(result: Record<string, unknown> | null): Usage | null {
  const u = result?.usage as Record<string, unknown> | undefined;
  if (u === undefined) return null;
  return {
    inputTokens: numberOr(u.input_tokens) ?? 0,
    cacheCreationInputTokens: numberOr(u.cache_creation_input_tokens) ?? 0,
    cacheReadInputTokens: numberOr(u.cache_read_input_tokens) ?? 0,
    outputTokens: numberOr(u.output_tokens) ?? 0,
  };
}

function statusOf(session: SessionRun): Status {
  if (session.timedOut) return "timeout";
  const subtype = session.stream.result?.subtype;
  if (typeof subtype === "string" && /budget/i.test(subtype)) return "capped";
  if (session.stream.result === null || session.stream.result.is_error === true || subtype !== "success") return "error";
  return "ok";
}

function isRateLimited(session: SessionRun): string | null {
  const result = session.stream.result;
  const resultText = typeof result?.result === "string" ? result.result : "";
  const failed = result === null || result.is_error === true;
  if (failed && (RATE_LIMIT.test(resultText) || RATE_LIMIT.test(session.stderr))) {
    return `${resultText}\n${session.stderr}`.trim().slice(0, 800);
  }
  return null;
}

async function readRecord(path: string): Promise<StepRecord | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as StepRecord;
  } catch {
    return null;
  }
}

export async function readRecords(rawDir: string): Promise<StepRecord[]> {
  let names: string[] = [];
  try {
    names = await readdir(rawDir);
  } catch {
    return [];
  }
  const records: StepRecord[] = [];
  for (const name of names.sort()) {
    if (!name.endsWith(".json")) continue;
    const record = await readRecord(join(rawDir, name));
    if (record !== null) records.push(record);
  }
  return records;
}

// ---------------------------------------------------------------- run

class RateLimited extends Error {}
class BudgetExhausted extends Error {}

interface RunOptions {
  readonly runId: string;
  readonly tasks: readonly TaskId[];
  readonly conditions: readonly Condition[];
  readonly repeats: number;
  readonly maxTotalUsd: number;
  readonly claude: string;
}

async function spentUsd(p: Paths): Promise<number> {
  const records = [...(await readRecords(p.raw)), ...(await readRecords(join(p.results, "aborted")))];
  return records.reduce((sum, r) => sum + (r.costUsd ?? 0), 0);
}

async function copySandbox(from: string, to: string): Promise<void> {
  await rm(to, { recursive: true, force: true });
  await mkdir(dirname(to), { recursive: true });
  await cp(from, to, {
    recursive: true,
    verbatimSymlinks: true,
    filter: (src) => basename(src) !== "node_modules",
  });
}

async function runSession(
  p: Paths,
  options: RunOptions,
  task: TaskId,
  condition: Condition,
  repeat: number,
): Promise<void> {
  const key = `${task}-${condition}-r${repeat}`;
  const spec = TASKS[task];
  const prompts = await loadPrompts(spec);
  const createPath = join(p.raw, `${key}-create.json`);
  const revisePath = join(p.raw, `${key}-revise.json`);
  if ((await readRecord(revisePath)) !== null) return;

  const sandbox = join(p.sandboxes, key);
  const outDir = join(p.outputs, key);
  const bunPrefix = join(outDir, "bun-prefix");
  const tmp = join(sandbox, ".tmp");
  const env = conditionEnv(condition, p, bunPrefix, tmp);
  await mkdir(outDir, { recursive: true });

  let create = await readRecord(createPath);
  if (create === null) {
    if ((await spentUsd(p)) >= options.maxTotalUsd) throw new BudgetExhausted(`spent >= $${options.maxTotalUsd}`);
    await prepareSandbox(p, condition, sandbox, bunPrefix, env, { taskMd: prompts.taskMd, t4Inputs: task === "t4" });
    const preflight = await preflightOf(sandbox, env);
    create = await runStep(p, options, { key, task, condition, repeat, step: "create", sandbox, env, outDir, preflight }, prompts.createPrompt, randomUUID(), {});
    await writeFile(createPath, `${JSON.stringify(create, null, 2)}\n`);
    await copySandbox(sandbox, join(outDir, "after-create"));
  }

  if (create.status !== "ok") {
    const skipped: StepRecord = { ...create, step: "revise", status: "skipped", pass: false, costUsd: 0, usage: null, inputSideTokens: null, numTurns: null, wallSeconds: 0, toolCalls: [], toolCallCounts: {}, skillCalls: [], slopcameraCommands: 0, validation: null, note: `create ended with status ${create.status}; revise not attempted` };
    await writeFile(revisePath, `${JSON.stringify(skipped, null, 2)}\n`);
    return;
  }
  if ((await spentUsd(p)) >= options.maxTotalUsd) throw new BudgetExhausted(`spent >= $${options.maxTotalUsd}`);
  if (!(await isDir(sandbox))) await copySandbox(join(outDir, "after-create"), sandbox);
  await mkdir(tmp, { recursive: true });
  const preflight = await preflightOf(sandbox, env);
  const revise = await runStep(
    p, options, { key, task, condition, repeat, step: "revise", sandbox, env, outDir, preflight },
    prompts.revisePrompt, create.sessionId, create.validation?.hashes ?? {},
  );
  await writeFile(revisePath, `${JSON.stringify(revise, null, 2)}\n`);
  await copySandbox(sandbox, join(outDir, "after-revise"));
}

/**
 * SlopCamera keeps machine-global state (resource-admission leases, job status,
 * caches) under $HOME. Without this, a benchmark session queues behind the
 * operator's unrelated SlopCamera jobs. The shim gives each session a fresh
 * state home, like a first install, and leaves the agent's own $HOME unchanged
 * so Claude Code authentication works.
 */
async function isolateSlopcameraState(bunPrefix: string): Promise<void> {
  const link = join(bunPrefix, "bin", "slopcamera");
  const target = resolve(dirname(link), await readlink(link));
  const stateHome = join(dirname(bunPrefix), "slopcamera-home");
  await rm(stateHome, { recursive: true, force: true });
  await mkdir(stateHome, { recursive: true });
  await rm(link, { force: true });
  await writeFile(link, `#!/bin/sh\nHOME='${stateHome}' exec '${target}' "$@"\n`, { mode: 0o755 });
}

async function prepareSandbox(
  p: Paths,
  condition: Condition,
  sandbox: string,
  bunPrefix: string,
  env: Record<string, string>,
  content: { readonly taskMd: string | null; readonly t4Inputs: boolean },
): Promise<void> {
  await rm(sandbox, { recursive: true, force: true });
  await rm(bunPrefix, { recursive: true, force: true });
  await mkdir(env.TMPDIR ?? join(sandbox, ".tmp"), { recursive: true });
  if (content.taskMd !== null) await writeFile(join(sandbox, "TASK.md"), content.taskMd);
  if (content.t4Inputs) {
    await mkdir(join(sandbox, "inputs"), { recursive: true });
    for (const name of ["clip-a.mp4", "clip-b.mp4"]) await cp(join(p.tools, "t4-inputs", name), join(sandbox, "inputs", name));
  }
  if (condition === "B") {
    await cp(join(p.tools, "prefix-b"), bunPrefix, { recursive: true, verbatimSymlinks: true });
    await isolateSlopcameraState(bunPrefix);
    // The README's project-scoped Claude Code install.
    await must([join(bunPrefix, "bin", "slopcamera"), "skill", "install", "--target", "claude", "--scope", "project"], { cwd: sandbox, env });
  } else {
    await mkdir(bunPrefix, { recursive: true });
  }
}

const PROBE_PROMPT = [
  "This is an environment check, not a task. Run exactly one Bash command: `command -v slopcamera || echo none; ls -a; ls -a .claude/skills 2>/dev/null || echo no-skills`.",
  "Then reply with four short sections, names only, no commentary:",
  "1. SKILLS: every skill available to you in this session (from your skill list), or none.",
  "2. INSTRUCTIONS: every CLAUDE.md, AGENTS.md, memory file or user instruction block present in your context, with its path, or none.",
  "3. MCP: every MCP server or MCP tool available, or none.",
  "4. BASH: the command output.",
].join("\n");

/** Keeps account details the model may echo from its context out of committed results. */
function redact(value: unknown): string | null {
  return typeof value === "string" ? value.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "<email>") : null;
}

/** Isolation check: the same flags and environment as a benchmark step, with a question instead of a task. */
async function probeIsolation(p: Paths, claude: string): Promise<void> {
  await ensureBenchBin(p);
  await mkdir(p.results, { recursive: true });
  const report: Record<string, unknown> = {};
  for (const condition of ["A", "B"] as const) {
    const sandbox = join(p.sandboxes, `probe-${condition}`);
    const bunPrefix = join(p.outputs, `probe-${condition}`, "bun-prefix");
    const env = conditionEnv(condition, p, bunPrefix, join(sandbox, ".tmp"));
    await prepareSandbox(p, condition, sandbox, bunPrefix, env, { taskMd: null, t4Inputs: false });
    const argv = claudeArgs(claude, sandbox, { sessionId: randomUUID(), resume: false });
    const session = await runClaude(argv, PROBE_PROMPT, sandbox, env, join(p.results, `probe-${condition}.stream.jsonl`));
    const init = session.stream.init;
    report[condition] = {
      command: ["claude", ...argv.slice(1)],
      preflight: await preflightOf(sandbox, env),
      initSkills: init?.skills ?? null,
      initSlashCommands: init?.slash_commands ?? null,
      initMcpServers: init?.mcp_servers ?? null,
      initPlugins: init?.plugins ?? null,
      initTools: init?.tools ?? null,
      memoryPaths: init?.memory_paths ?? null,
      answer: redact(session.stream.result?.result),
      costUsd: session.stream.result?.total_cost_usd ?? null,
      usage: session.stream.result?.usage ?? null,
    };
  }
  await writeFile(join(p.results, "isolation-probe.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

async function preflightOf(sandbox: string, env: Record<string, string>): Promise<Record<string, string>> {
  const probe = await run(["/bin/sh", "-c", "command -v slopcamera || echo 'not on PATH'; slopcamera --version 2>/dev/null; ls .claude/skills 2>/dev/null || echo 'no .claude/skills'"], { cwd: sandbox, env });
  return { path: env.PATH ?? "", bunInstall: env.BUN_INSTALL ?? "", probe: probe.stdout.trim() };
}

interface StepContext {
  readonly key: string;
  readonly task: TaskId;
  readonly condition: Condition;
  readonly repeat: number;
  readonly step: Step;
  readonly sandbox: string;
  readonly env: Record<string, string>;
  readonly outDir: string;
  readonly preflight: Record<string, string>;
}

async function runStep(
  p: Paths,
  options: RunOptions,
  ctx: StepContext,
  prompt: string,
  sessionId: string,
  createHashes: Readonly<Record<string, string | null>>,
): Promise<StepRecord> {
  const argv = claudeArgs(options.claude, ctx.sandbox, { sessionId, resume: ctx.step === "revise" });
  const startedAt = new Date().toISOString();
  console.error(`[${startedAt}] ${ctx.key} ${ctx.step} …`);
  const session = await runClaude(argv, prompt, ctx.sandbox, ctx.env, join(ctx.outDir, `${ctx.step}.stream.jsonl`));
  await writeFile(join(ctx.outDir, `${ctx.step}.stderr.txt`), session.stderr);
  const result = session.stream.result;
  const usage = usageOf(result);
  const status = statusOf(session);
  const validation = await TASKS[ctx.task].validate({
    sandbox: ctx.sandbox,
    step: ctx.step,
    createHashes,
    toolInputText: session.stream.toolInputText,
  });
  const counts: Record<string, number> = {};
  for (const call of session.stream.toolCalls) counts[call.name] = (counts[call.name] ?? 0) + 1;
  const init = session.stream.init;
  const record: StepRecord = {
    key: ctx.key,
    task: ctx.task,
    condition: ctx.condition,
    repeat: ctx.repeat,
    step: ctx.step,
    status,
    pass: status === "ok" && validation.pass,
    sessionId,
    startedAt,
    command: [...argv.slice(0, 1).map(() => "claude"), ...argv.slice(1)],
    promptSha256: createHash("sha256").update(prompt).digest("hex"),
    exitCode: session.exitCode,
    signal: session.signal,
    timedOut: session.timedOut,
    wallSeconds: Math.round(session.wallMs / 100) / 10,
    resultSubtype: typeof result?.subtype === "string" ? result.subtype : null,
    isError: typeof result?.is_error === "boolean" ? result.is_error : null,
    numTurns: numberOr(result?.num_turns),
    durationApiMs: numberOr(result?.duration_api_ms),
    costUsd: numberOr(result?.total_cost_usd),
    usage,
    inputSideTokens: usage === null ? null : usage.inputTokens + usage.cacheCreationInputTokens + usage.cacheReadInputTokens,
    modelUsage: result?.modelUsage ?? null,
    resultText: typeof result?.result === "string" ? result.result.slice(0, 2000) : "",
    init: init === null ? null : {
      model: init.model,
      permissionMode: init.permissionMode,
      tools: init.tools,
      skills: init.skills,
      slashCommands: init.slash_commands,
      mcpServers: init.mcp_servers,
      plugins: init.plugins,
      claudeCodeVersion: init.claude_code_version,
    },
    preflight: ctx.preflight,
    toolCallCounts: counts,
    slopcameraCommands: session.stream.toolCalls.filter((c) => c.name === "Bash" && /\bslopcamera\b/.test(c.input)).length,
    skillCalls: session.stream.toolCalls.filter((c) => c.name === "Skill").map((c) => c.input),
    toolCalls: session.stream.toolCalls,
    stderrTail: session.stderr.slice(-2000),
    validation,
    note: "",
  };
  const limited = isRateLimited(session);
  if (limited !== null) {
    await mkdir(join(p.results, "aborted"), { recursive: true });
    await writeFile(join(p.results, "aborted", `${ctx.key}-${ctx.step}-${Date.now()}.json`), `${JSON.stringify({ ...record, note: "rate limited" }, null, 2)}\n`);
    if (ctx.step === "revise") {
      // A partial revise turn is now in the session history; redo the whole session on resume.
      await rm(join(p.raw, `${ctx.key}-create.json`), { force: true });
      await appendFile(join(p.results, "aborted", "README.txt"), `${ctx.key}: create record moved aside after a rate-limited revise; session reruns from scratch.\n`);
    }
    throw new RateLimited(limited);
  }
  await writeThumbnails(p, ctx);
  return record;
}

async function writeThumbnails(p: Paths, ctx: StepContext): Promise<void> {
  await mkdir(p.thumbs, { recursive: true });
  const spec = TASKS[ctx.task];
  for (const rel of spec.outputs) {
    if (rel.endsWith(".svg")) continue;
    const input = join(ctx.sandbox, rel);
    const name = `${ctx.key}-${ctx.step}-${basename(rel).replace(/\.[^.]+$/, "")}.jpg`;
    await thumbnail(input, join(p.thumbs, name), spec.videoOutputs.includes(rel));
  }
}

async function runAll(p: Paths, options: RunOptions): Promise<number> {
  await mkdir(p.raw, { recursive: true });
  await ensureBenchBin(p);
  if (!(await isDir(join(p.tools, "prefix-b")))) throw new Error("run `harness.ts setup` first");
  const version = (await must([options.claude, "--version"])).trim();
  await writeFile(join(p.results, "run.json"), `${JSON.stringify({
    runId: options.runId,
    claude: version,
    model: MODEL,
    effort: EFFORT,
    tools: TOOLS,
    stepBudgetUsd: STEP_BUDGET_USD,
    stepTimeoutMinutes: STEP_TIMEOUT_MS / 60000,
    tasks: options.tasks,
    conditions: options.conditions,
    repeats: options.repeats,
    commandTemplate: claudeArgs("claude", "<sandbox>", { sessionId: "<uuid>", resume: false }),
    reviseTemplate: claudeArgs("claude", "<sandbox>", { sessionId: "<uuid>", resume: true }),
    toolsManifest: JSON.parse(await readFile(join(p.tools, "manifest.json"), "utf8")) as unknown,
  }, null, 2)}\n`);
  try {
    for (let repeat = 1; repeat <= options.repeats; repeat++) {
      for (const task of options.tasks) {
        for (const condition of options.conditions) {
          await runSession(p, options, task, condition, repeat);
        }
      }
    }
  } catch (error) {
    await summarize(p.results);
    if (error instanceof RateLimited) {
      console.log(`RATE_LIMITED ${error.message}`);
      return 3;
    }
    if (error instanceof BudgetExhausted) {
      console.log(`BUDGET_EXHAUSTED ${error.message}`);
      return 4;
    }
    throw error;
  }
  await summarize(p.results);
  console.log(`done: ${join(p.results, "summary.md")}`);
  return 0;
}

// ---------------------------------------------------------------- main

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);
  const runId = flags.get("run-id") ?? new Date().toISOString().slice(0, 10);
  const p = paths(flags, runId);
  if (command === "setup") {
    await setup(p);
    return 0;
  }
  if (command === "probe") {
    const claude = Bun.which(flags.get("claude") ?? "claude");
    if (claude === null) throw new Error("claude CLI not found");
    await probeIsolation(p, claude);
    return 0;
  }
  if (command === "summarize") {
    await summarize(p.results);
    return 0;
  }
  if (command === "run") {
    const tasks = (flags.get("tasks") ?? "t1,t2,t3,t4").split(",");
    const conditions = (flags.get("conditions") ?? "A,B").split(",");
    if (!tasks.every(isTaskId)) throw new Error(`unknown task in ${tasks.join(",")}`);
    if (!conditions.every((c): c is Condition => c === "A" || c === "B")) throw new Error("conditions are A and/or B");
    const repeats = Number(flags.get("repeats") ?? "2");
    const maxTotalUsd = Number(flags.get("max-total-usd") ?? "200");
    if (!Number.isInteger(repeats) || repeats < 1) throw new Error("--repeats must be a positive integer");
    if (!Number.isFinite(maxTotalUsd) || maxTotalUsd <= 0) throw new Error("--max-total-usd must be positive");
    const claude = Bun.which(flags.get("claude") ?? "claude");
    if (claude === null) throw new Error("claude CLI not found");
    return await runAll(p, { runId, tasks, conditions, repeats, maxTotalUsd, claude });
  }
  console.error("usage: harness.ts setup|probe|run|summarize [--run-id ID] [--tasks t1,..] [--conditions A,B] [--repeats N] [--max-total-usd N] [--outputs DIR] [--sandboxes DIR]");
  return 2;
}

if (import.meta.main) process.exit(await main());
