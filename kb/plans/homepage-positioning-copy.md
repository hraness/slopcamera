---
title: Sharpen the homepage positioning copy
description: Rewrite the hero, trust, FAQ, and closing copy so the homepage states what Slopcamera is, why it beats prompting a bare coding agent, and stays factual inside the reviewed-island contract.
type: plan
area: site-content
status: in-progress
repository_scopes:
  - apps/web/src/index.html
  - apps/web/src/agent-pages.ts
  - apps/web/scripts/site-examples-profile.ts
  - apps/web/scripts/site-refinement-fixtures.ts
tags:
  - marketing
  - copy
---

# Sharpen the homepage positioning copy

## Outcome

The homepage leads with what Slopcamera is ("Give your coding agent a visual
studio"), states the differentiator in mechanism terms (editable sources beside
every render, so a revision is a small field change instead of a full
regeneration), and answers the obvious comparison — "why not just ask the
agent directly?" — in the FAQ. The tone stays factual with a light touch:
"new timing, new framing, new problems."

## Context

The previous pass ([[plans/site-reference-surface|site reference surface]])
added reference pages and discovery wiring; the remaining gap the owner named
is punch: the page described the workflow but never argued the case. Copy
changes are constrained by the reviewed browser-contract lattice:

- Every homepage byte is either inside a reviewed island literal or paired
  verbatim against a fixed baseline in the examples lane.
- Section heights may only change in declared `examplesHeightOwners`.
- The authored shell must stay under 39,000 bytes.
- `STYLE.md` forbids hype, exclamation marks, empty intensifiers, and
  contrast-pair filler.

## Scope

- Hero h1 and summary paragraph.
- Trust-section summary (the "same video twice" argument).
- New first FAQ entry for the raw-agent comparison, plus byte-neutral trims
  across existing answers.
- Closing heading and CTA summary.
- `index.md` mirror lead in `agent-pages.ts`; canonical definition stays
  verbatim in meta, JSON-LD, `llms.txt`, and README (cross-file pinned).

## Non-goals

- No visual/layout changes: the pinned proof-frame, pillars, facts grid, and
  non-islanded sections are untouched.
- No FAQ JSON-LD expansion: the authored FAQPage entity list stays the
  reviewed three-question subset, with texts synced to trimmed answers.
- No changes outside declared height-owner sections.

## Decisions

- Positioning formula: imperative h1 for the what; the summary keeps the
  canonical first sentence for identity, then the editable-source claim.
- The raw-agent argument lives twice on purpose: visible in the trust summary
  and collapsed in the new FAQ, since each surface serves different readers.
- "re-rolling" names the regeneration cost without jargon or mockery.
- New islands were added to `examplesIslands` (`#page-title`, hero summary,
  `#questions`, `#design` trust header, `#closing`) and
  `refinementIslands` rather than expanding byte-paired copy; the three
  absorbed child islands were removed, and `#design`, `#questions`,
  `#closing` were declared as height owners.

## Execution log

- Copy rewritten; authored shell at 38,978 bytes of the 39,000 budget.
- Stale refinement fixture literals refreshed for touched regions; the lane
  additionally carries pre-existing drift outside this change's scope.
- `bun run check` (apps/web), `check:standalone`, and
  `verify-example-sources` all pass locally; legacy-identity inventory
  updated for the new "studio" occurrences.

## Verification

- `bun run check` in `apps/web` — theme snapshots, preview typecheck, the
  full contract suite, 89-file production build, pinned-Chromium preview
  proof with zero resource or CSP errors.
- `bun run check:standalone` — reviewed inventory rows for new "studio"
  occurrences.
- Native marketing acceptance remains the maintainer gate, disclosed in the
  PR.
