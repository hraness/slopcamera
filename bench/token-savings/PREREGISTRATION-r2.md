# Round 2 preregistration

Written and committed before the main run. Anything that changes after this
commit is listed under "Deviations" in the run's `NOTES.md`, with the reason and,
for a validator change, both the original and the changed results.

## Question

Round 1 (`results/2026-09-29/`) found that median create-plus-revise cost was
higher with SlopCamera installed on four easy tasks, with two sessions per cell.
The extra came from input tokens: reading the skill, `--help` output and
rendered frames. Round 1 did not test harder tasks where a first attempt can
fail, many revisions, revisions in a new session, or the cost of retries.
Round 2 tests those. A null or negative result is reported as measured.

## Conditions

Unchanged from round 1 (see `README.md`): headless Claude Code 2.1.284,
`claude-opus-5-5`, `--effort medium`, tools `Bash,Read,Write,Edit,Glob,Grep,Skill`,
`--permission-mode dontAsk`, `--setting-sources project`, empty strict MCP
config, minimal environment, sandboxes under `/private/tmp`, auto memory
disabled, email redaction.

- **A:** sandbox with `TASK.md` and any harness inputs.
- **B:** the same, plus SlopCamera v3.8.0 installed into a per-session Bun
  prefix first on `PATH` (with the per-session `HOME` shim) and the project
  skill installed with `slopcamera skill install --target claude --scope project`.

Prompts are identical across conditions and never mention SlopCamera.

## Tasks

Five tasks in `tasks/r2/`. Each file holds `TASK.md`, the create prompt and five
revision prompts, sent verbatim.

| Task | Deliverable | Revisions (1-3 resumed; 4-5 new session) |
|---|---|---|
| H1 explainer | 30 s 1920x1080 30 fps MP4, 4 titled scenes, animated 6-node pipeline in scene 2, 0.5 s crossfades, ffmpeg `sine` music bed with 1 s fade out | 1 retitle scene 3; 2 extend to 36 s; 3 add a 7th node; 4 add a 1280x720 copy; 5 retitle scene 1 in both files |
| H2 diagram system | 12-node, 3-group architecture diagram as light and dark SVG and 1920x1080 PNG, plus a 1080x1080 light social PNG | 1 rename a node; 2 recolour a group; 3 add a 13th node and reroute an arrow; 4 social crop becomes 1080x1350; 5 rename a group |
| H3 turntable | Blender: 5 s 1080x1080 24 fps turntable MP4 of a stylized product with three-point lighting, plus a 1920x1080 hero PNG | 1 body colour; 2 8 s rotation; 3 add 3D text "AURA"; 4 hero at 2560x1440; 5 turntable at 30 fps |
| H4 data animation | 10 s 1080x1080 30 fps animated bar chart from `inputs/sales.csv` (8 regions x 6 years) with period and value labels | 1 retitle; 2 switch to `inputs/sales-v2.csv` (9 regions); 3 extend to 12 s; 4 single bar colour; 5 add a 1920x1080 version |
| H5 social set | Kinetic-typography title card as 1080x1920, 1080x1080 and 1920x1080 MP4s, 6 s each, same timing and palette | 1 new headline; 2 accent colour; 3 extend to 8 s; 4 add a CTA line; 5 add a 1080x1350 version |

The CSV inputs are generated deterministically by `salesCsv()` in `tasks-r2.ts`
and are byte-identical for both conditions. Manim is not installed and no task
needs it.

## Procedure

- A session is one task, one condition, one repeat. Steps in order: create,
  rev1, rev2, rev3 (each `--resume` of the create conversation), rev4 and rev5
  (each a new Claude Code session in the same sandbox, with no conversation
  memory). The sandbox persists across all six steps.
- After every invocation the harness runs the step's validators. If any gating
  check fails, or the invocation did not end with `success`, the harness sends
  up to 2 follow-up prompts in the same conversation containing only
  `These checks failed:`, one line per failing gating check, and
  `Fix and re-render.` The tokens, cost and time of retries count toward that
  step. A step that still fails after 2 retries is recorded as failed; later
  steps still run.
- Budget cap: `--max-budget-usd` is 8 x (number of invocations in the
  conversation including the current one), because Claude Code applies the
  cap to the cumulative cost of a resumed session. Each invocation therefore
  has at least $8 of headroom. The harness stops before any invocation once
  recorded spend reaches `--max-total-usd 220` and reports instead of trimming
  the design.
- Timeout: 25 minutes per invocation, as in round 1.
- Repeats: 4 per task per condition, 40 sessions. Order: for repeat r, tasks in
  order h1..h5; within a task, A then B on odd repeats and B then A on even
  repeats (ABBA). Concurrency 3 (sessions run three at a time from that queue),
  the same as the pilot; wall time is therefore a secondary, noisy metric.
- Rate limits: if an invocation reports a usage or rate limit, the harness
  saves the aborted invocation under `aborted/`, writes the summary, prints
  `RATE_LIMITED <reset>` and exits with status 3. It never retries. A rerun
  resumes at the first unfinished step, restoring the sandbox snapshot and the
  conversation transcript from after the previous step, and redoes the aborted
  step from its first attempt. Aborted invocations count toward total spend but
  not toward any step's cost.

## Metrics

Primary: **cost in USD of all six steps of a session**, including retries,
from Claude Code's reported `total_cost_usd` (for a resumed conversation, the
difference from the previous invocation's cumulative figure).

Secondary, per step and per phase (create; rev1-3 resumed; rev4-5 new
session; all steps): output tokens; input, cache-write and cache-read tokens
with price-weighted cost parts at $4 / $8 / $0.20 / $20 per million (input /
cache write / cache read / output, the rates that reproduced round 1's
`total_cost_usd`); turns; wall time split into API time and time outside the
API; retries used; pass after retries; pass on the first attempt; and the
median cumulative cost after each step.

## Hypotheses and tests

All tests are two-sided. With 4 vs 4 sessions the smallest possible exact
Mann-Whitney p is 2/70 = 0.029. Five per-task tests are reported without
correction and are read as five separate results, not as one family-wise
claim; any statement across tasks uses the pooled estimate.

- **H-a (primary).** B's all-steps cost is lower than A's on the harder tasks.
  Per task: exact two-sided Mann-Whitney U on the all-steps cost of complete
  sessions (4 vs 4). Pooled: geometric mean over tasks of median(B)/median(A)
  of all-steps cost, with a 95% percentile bootstrap CI (10,000 resamples of
  sessions within each task and condition, seed 20261001). H-a is supported
  only if the pooled CI lies entirely below 1. A CI entirely above 1 supports
  the opposite. Anything else is inconclusive.
- **H-b.** B's per-revision cost is lower, so cumulative cost curves cross.
  Reported per task: median cumulative cost after each step for A and B, and
  the first step at which B's median is at or below A's. Tested with the pooled
  ratio and CI on the revisions-only cost (rev1-5), computed from the same
  procedure as H-a. H-b is supported only if that CI lies entirely below 1;
  crossings are reported descriptively.
- **H-c.** B has a higher first-attempt pass rate and uses fewer retries.
  Reported: per task and condition, steps passing on the first attempt out of
  6 x 4, retries used and steps failed after retries. Pooled across tasks:
  first-attempt pass count A vs B (out of 120 steps each), described with
  counts only. No significance claim is made unless the difference is at least
  one full retry per session on average in the same direction on at least 4 of
  5 tasks; otherwise it is described as no clear difference.
- **H-d.** Revisions in a new session cost less with B. Pooled ratio of
  medians with bootstrap CI on the rev4-5 cost; per-task Mann-Whitney on the
  rev4-5 cost is reported as secondary. Same decision rule as H-a.

No other claim is made from round 2. Cost differences are not converted to
claims about quality, since validators are structural.

## Exclusions

- A session is included in the tests only when all six steps have a record.
  Failed steps (after retries) stay in: their cost counts, and failures are
  reported. A session is incomplete only because the harness stopped (budget
  or rate limit) and was not resumed; incomplete sessions are listed and
  excluded from medians and tests.
- An invocation aborted by a rate limit is excluded from step cost and redone.
- No session is excluded for its cost, output quality or agent behaviour.
- Infrastructure failures outside the agent (disk full, machine sleep,
  harness crash) void the affected step: it is redone from the snapshot, and
  the voided attempt is listed in `NOTES.md` with its cost.

## Validators

Harness-owned, structural, identical per condition, in `tasks-r2.ts` with
helpers in `tasks.ts` and `media.ts`. A step passes when the invocation ended
with `success` and every gating check passes. Informational checks are
recorded but never trigger a retry or a failure.

Common to every step: every output due by that step exists; every output the
step's revision targets has a different SHA-256 from the previous step
(`changed:`); outputs a revision says to leave alone are checked for an
unchanged hash (`kept:`, informational, since a re-render can change bytes
without changing content). Text checks search the agent's own files in the
sandbox (small non-binary files outside `out/`, `inputs/`, `.claude/`, and not
the harness `TASK.md`), the agent's tool-call inputs, and for H2 the SVGs. A
phrase counts when found exactly, case-insensitively, or split across lines
with its words in order (round 1's `textEvidence`).

Gating checks per task (informational in brackets):

- **H1:** `explainer.mp4` H.264 MP4, 1920x1080, 30 fps, 30 s (36 s from rev2)
  ±0.2 s, AAC audio; from rev4 also `explainer-720p.mp4` 1280x720 with the same
  checks; titles for the step (The Problem / Why It Matters from rev5; How It
  Works; The Results / What Changed from rev1; Get Started); node labels
  Ingest, Parse, Index, Rank, Cache, Serve, plus Monitor from rev3. [audio
  duration within 0.3 s of video; last 0.3 s at least 6 dB quieter than the
  middle; frame difference between 2 s and the end; old titles absent from
  the agent's files; `kept:` on rev4]
- **H2:** both SVGs contain `<svg`; both PNGs 1920x1080; social PNG 1080x1080
  (1080x1350 from rev4); dark PNG mean luma at least 30 below the light PNG;
  labels Platform Architecture, the three group names (Edge becomes Gateway
  Tier at rev5), the 12 node names (Orders becomes Checkout at rev1; Rate
  Limiter added at rev3); from rev2 colour #7B61FF found. [each label in the
  SVG text; colours #2F80ED, #27AE60, #F2994A before rev2; social luma above
  dark; old labels absent from SVGs; `kept:` on rev4]
- **H3:** `turntable.mp4` H.264 MP4, 1080x1080, 24 fps (30 fps at rev5), 5 s
  (8 s from rev2) ±0.2 s; `hero.png` PNG 1920x1080 (2560x1440 from rev4); from
  rev3 the text AURA found. [frame difference within the turntable; "blender"
  mentioned; body colour hex found (Blender scripts often use linear floats);
  `kept:` on rev4 and rev5]
- **H4:** `bars.mp4` H.264 MP4, 1080x1080, 30 fps, 10 s (12 s from rev3)
  ±0.2 s; from rev5 also `bars-16x9.mp4` 1920x1080 30 fps same duration; title
  "Revenue by Region" (then "Regional Revenue in USD Millions" from rev1);
  from rev2 `sales-v2` referenced; from rev4 colour #2A9D8F found. ["sales"
  referenced; frame difference; old title absent; `kept:` on rev5]
- **H5:** three MP4s (four from rev5 with `social-4x5.mp4` 1080x1350), each
  H.264 at its size, 30 fps, 6 s (8 s from rev3) ±0.2 s; headline "Launch
  Week" (then "Ship Week" from rev1); subline "Starts Monday"; from rev2 colour
  #00C2A8; from rev4 "Join us live". [frame difference per file; background
  #0B0F1A; accent #FFB000 before rev2; `kept:` on rev5]

`changed:` is gating for: H1 main video at rev1-3 and rev5, the 720p copy at
rev4 and rev5; H2 all five files at rev1-3 and rev5, the social PNG at rev4; H3
both files at rev1 and rev3, the turntable at rev2 and rev5, the hero at rev4;
H4 the main video at rev1-4, the 16:9 video at rev5; H5 the three videos at
rev1-4, the 4:5 video at rev5.

Frozen validator content hash (SHA-256 of the concatenation, in this order, of
`tasks-r2.ts`, `tasks.ts`, `media.ts`):

```
VALIDATOR_HASH
```

Recompute with:

```sh
cd bench/token-savings && cat tasks-r2.ts tasks.ts media.ts | shasum -a 256
```

## Pilot

PILOT_SECTION
