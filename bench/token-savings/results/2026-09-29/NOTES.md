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
