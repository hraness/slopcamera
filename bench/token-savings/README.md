# Token-savings benchmark

This benchmark measures whether a coding agent spends fewer tokens to make and
then revise a media deliverable when SlopCamera and its agent skill are
installed. It compares the same agent, prompts and machine with and without
SlopCamera. A null or negative result is a valid outcome and is reported as
measured.

The results are a controlled benchmark on one Mac with one model. They are not
a general claim about every agent, task or machine.

## Conditions

Both conditions run headless Claude Code (`claude -p`) with model
`claude-opus-5-5` at `--effort medium`, from a fresh sandbox directory under
`/private/tmp/slopcamera-bench/<run-id>/`. The prompts are identical and never
mention SlopCamera.

- **A (bare):** the sandbox holds only `TASK.md` (plus `inputs/` for T4). The
  agent may use anything installed on the machine: ffmpeg, Blender, Python,
  Bun and packages it installs.
- **B (installed):** the same sandbox, plus the SlopCamera v3.8.0 release
  installed with `bun add --global` into a per-session `BUN_INSTALL` prefix
  that is first on `PATH`, and the skill installed the way the README tells
  Claude Code users to install it:
  `slopcamera skill install --target claude --scope project`, which writes
  `.claude/skills/slopcamera/` into the sandbox.

Condition A has no SlopCamera binary on `PATH` and no `.claude/skills/`
directory. Each session gets its own empty Bun global prefix, so a package one
session installs is not visible to the next.

### Isolation from the operator's Claude Code setup

`--bare` would be the simplest isolation, but it accepts only
`ANTHROPIC_API_KEY` authentication, and the benchmark runs on a logged-in
account. The harness instead combines:

- a minimal environment (`HOME`, `USER`, `PATH`, `TMPDIR`, `BUN_INSTALL`,
  locale) with no inherited `ANTHROPIC_*` or proxy variables;
- `--setting-sources project`, so user settings, hooks, plugins and user
  `CLAUDE.md` are not loaded;
- `--strict-mcp-config --mcp-config '{"mcpServers":{}}'`, so no MCP servers
  load;
- sandboxes outside `$HOME`, so no ancestor `CLAUDE.md` or `.claude/` is
  discovered;
- `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`.

SlopCamera keeps machine-global state under `$HOME`, including the
resource-admission leases that serialize renders across processes. In
condition B, `slopcamera` on `PATH` is a two-line shim that runs the installed
CLI with `HOME` set to an empty per-session directory. Without it, a benchmark
session waits behind any unrelated SlopCamera job on the machine, which
happened in the first pilot. The agent's own `$HOME` is unchanged.

`harness.ts probe` runs one short session per condition with the same flags
and asks the agent to list its skills, instruction files and MCP servers. It
writes `results/<run-id>/isolation-probe.json`. Claude Code's built-in skills
(for example `dataviz` and `design`) remain available in both conditions; they
ship with Claude Code and are the same in A and B.

### Permissions

The session runs with `--permission-mode dontAsk`, `--tools` and
`--allowedTools` set to `Bash,Read,Write,Edit,Glob,Grep,Skill`, and
`--add-dir <sandbox>`. Anything outside the allowed tools is denied without a
prompt. `bypassPermissions` is not used.

## Tasks

Each task is one session with two steps: a create step, then one revision step
that resumes the same session (`--resume <session-id>`). The exact `TASK.md`
contents and both prompts are in [`tasks/`](tasks/).

| Task | Create | Revise |
|---|---|---|
| T1 diagram | 5-node flow diagram, light and dark SVG and PNG | rename a node, add an edge, re-export all four |
| T2 motion card | 6 s 1080x1920 30 fps H.264 MP4 with animated text and moving background | change headline and accent color |
| T3 product shot | Blender PNG 1920x1080, stylized product on a pedestal, three-point light | change material color, orbit camera 20 degrees |
| T4 edited video | two harness-generated clips cut to one 1080x1080 MP4 with a title and a 0.5 s crossfade | change the title, trim clip A by 1 s |

The harness generates the T4 source clips with ffmpeg `testsrc` and `testsrc2`
during `setup`, and copies identical bytes into both conditions.

## Limits per step

- `--max-budget-usd 6`
- 25-minute wall-clock timeout; the harness kills the whole process group
- a capped, timed-out or errored step is a failure; a failed create step skips
  its revise step, which is recorded as skipped

Sessions run one at a time. Repeat 1 runs A then B for each task; repeat 2
runs B then A, so prompt-cache warmth or time-of-day drift does not always
favor the same condition.

## Validation

Validation is automated, owned by the harness and identical in both
conditions. It checks file existence, format, codec, dimensions, duration and
frame rate with ffprobe; for revisions, it checks that every output's hash
changed and that the new label, headline or title appears in an output SVG, a
source file the agent wrote, or a tool-call argument. It does not score
aesthetics. Outputs are kept for human review; see the thumbnails in
`results/<run-id>/thumbs/`.

Each check is recorded with a detail string. Gating checks decide pass or fail;
informational checks (such as whether the old label is gone from the SVG) are
recorded but do not decide the result.

Text checks accept an exact, case-insensitive match, or the phrase's words in
order as whole words within 400 characters of each other, because agents often
split a headline or a wrapped label across lines or draw calls. The detail
string says which match was found. `harness.ts revalidate` reruns every check
on the saved sandbox snapshots without calling the agent.

## Metrics

Per step, from the `result` event of `--output-format stream-json`:

- input-side tokens: `input_tokens + cache_creation_input_tokens +
  cache_read_input_tokens`
- `output_tokens`
- cost: `total_cost_usd` for a create step. Claude Code reports
  `total_cost_usd` and `modelUsage` cumulatively over a resumed session while
  `usage` is per invocation, so a revise step's cost is its session total minus
  the create step's cost; the raw figure is kept as `sessionCostUsd`.
  `harness.ts recount` recomputes this from the transcripts and fails if the
  revise `modelUsage` output tokens are not create plus revise.
- `num_turns`
- wall-clock seconds and API milliseconds
- pass or fail, with each check
- tool-call counts, the number of Bash calls that invoke `slopcamera`, and
  Skill tool calls

`--max-budget-usd` applies to the whole resumed session, so a revise step's
effective cap is 6 dollars minus the create step's cost.

The primary comparison is median output tokens and median cost for create,
revise, and create plus revise, over sessions where both steps passed.
Failures are listed and counted separately.

## Run it

```sh
bun bench/token-savings/harness.ts setup --run-id 2026-09-29
bun bench/token-savings/harness.ts probe --run-id 2026-09-29
bun bench/token-savings/harness.ts run --run-id 2026-09-29 --tasks t1,t2,t3,t4 --conditions A,B --repeats 2
bun bench/token-savings/harness.ts summarize --run-id 2026-09-29
```

`setup` downloads the v3.8.0 release tarball, checks it against the release's
`SHA256SUMS`, installs it into a benchmark-local prefix and generates the T4
inputs. `run` accepts `--max-total-usd` (default 200) and stops before starting
a step once recorded spend reaches it.

A rerun of the same `run` command resumes at the first unfinished session. If
a step fails because of a rate limit or usage limit, the harness records it
under `results/<run-id>/aborted/`, writes the summary, prints a line starting
with `RATE_LIMITED`, and exits with status 3. It never retries in a loop.

## Where results go

- `results/<run-id>/raw/<task>-<condition>-r<n>-<step>.json`: one record per
  step, including the exact command line, `init` event (tools, skills,
  plugins, MCP servers), usage, validation and tool calls
- `results/<run-id>/summary.json` and `summary.md`: medians, B/A ratios,
  failures and all raw rows
- `results/<run-id>/thumbs/`: small JPEG thumbnails of every raster and video
  output
- `results/<run-id>/contact/<task>.png`: one contact sheet per task, one row
  per session and one column per output after create and after revise
- `../<worktree>-bench-outputs/<run-id>/<key>/`: full stream-json transcripts,
  stderr, and sandbox snapshots after each step, including MP4s; kept outside
  the repository
