# Run notes, 2026-09-29

Full matrix: 4 tasks, 2 conditions, 2 repeats, create then revise, run
sequentially with harness commit 1563e87 plus the fixes below. No pilot step
was reused. All 32 steps passed. No rate limit, budget cap or timeout was hit.

Harness fixes made after the run, applied to saved transcripts and sandbox
snapshots without calling the agent again:

- `recount`: the `slopcamera` invocation pattern missed commands wrapped in
  quotes (`bash -c "slopcamera ..."`) and matched `$slopcamera` variables. The
  pattern was corrected and counts recomputed. Counts are descriptive only.
- `revalidate`: the headline check failed `t2-A-r2` revise because the agent
  drew "Built To" and "Last" as two `drawtext` calls; the contact sheet shows
  the correct headline. Text checks now also accept the words in order across
  lines. This changed that step from fail to pass and turned the informational
  wrapped-label check in both `t1-B` revise steps from fail to pass.
- Revise cost: Claude Code reports `total_cost_usd` cumulatively for a resumed
  session while `usage` is per invocation, so revise costs were first recorded
  as create plus revise. Revise cost is now the session total minus the create
  cost, cross-checked against cumulative `modelUsage` output tokens. The pilot
  report's revise costs and 1.40x ratio were inflated by the same error.

Condition B sessions did not always use SlopCamera: `t4-B-r1` never loaded the
skill or ran `slopcamera`, and `t4-B-r2` loaded the skill but ran it once.
They are counted as condition B regardless, since B measures having it
installed.

Two sessions per cell is too few for a stable median. The ratios here are not
a publishable claim of savings.

## Audit corrections

An independent review of the raw rows, transcripts and summary found the
medians correct and made these corrections and additions:

- The first run report said the lower output-token medians on t1, t3 and t4
  were all within the variation between repeats. That is wrong for t3: both B
  sessions wrote fewer output tokens (8,502 and 8,887) than both A sessions
  (10,193 and 12,798), yet both still cost more ($0.579 and $0.602 against
  $0.473 and $0.565). `summary.md` now lists per-session totals and says for
  each task whether the A and B ranges overlap.
- "Input-side tokens" adds input, cache-write and cache-read tokens, which are
  priced very differently. B's 3.18M input-side tokens against A's 1.44M is
  mostly cache reads (2.95M). Weighted by price, B's extra cost is mostly cache
  writes ($1.87 against $1.13). Output cost was about equal ($0.91 against
  $0.94). `summary.md` now shows cost by token type; the prices it uses
  reproduce every step's reported cost exactly. Cost, not the input-side token
  count, is the primary metric.
- `duration_api_ms` is cumulative over a resumed session, like
  `total_cost_usd`. The raw revise rows keep the cumulative figure; the
  per-session table uses it once. Most of B's wall time on t2 was outside API
  calls (758 s of 851 s and 474 s of 534 s): SlopCamera rendering, and possibly
  first-run setup, since each B session starts with an empty SlopCamera home.
  Wall time says nothing about agent token efficiency.
- The text check was loosened after the results were seen. It changed one
  step, `t2-A-r2` revise, from fail to pass, which helps condition A in that
  cell. Without the change, t2 A rests on one session (5,183 output tokens,
  $0.223), and B still costs more on t2.
- `t4` is effectively "installed but mostly unused": one B session never used
  SlopCamera and the other ran it once. Its B/A ratio is an intention-to-treat
  result and says little about what using SlopCamera costs.
- Isolation removed the operator's configuration, not everything. Both
  conditions still loaded Claude Code's built-in skills, two built-in plugins
  and the session's system reminder. They were the same in A and B, so they do
  not bias the comparison. Every raw row records the `init` event so this can
  be checked per step.
- With two sessions per cell, no test can reach significance: the smallest
  possible two-sided Mann-Whitney p-value at 2 against 2 is 0.33. No p-values
  or confidence intervals are reported.

What the data supports: having SlopCamera installed did not reduce the agent's
token spend or cost in this benchmark. Median create-plus-revise cost was
higher with SlopCamera on every task (B/A 1.14 to 2.69), with overlapping or
touching per-session ranges on t1 and t4. It does not support any savings
figure, a general "fewer output tokens" claim, a cost multiple as a general
figure, wall-time claims, quality claims, or claims about other models,
agents, versions or tasks.
