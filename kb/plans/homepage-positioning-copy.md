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

## Result

Shipped and verified live at slopcamera.com in PR #209 (squash `e6cef0f`).
Production serves the new h1, FAQ entry, and closing; all CI lanes pass
including `Required`, plus both Vercel deployments.

## Durable memory

- Homepage copy edits are declared through reviewed islands: regions added
  to `examplesIslands`/`refinementIslands` get exact baseline/current
  literals, and sections whose authored height changes are declared in
  `examplesHeightOwners`. Edits outside islands are byte-paired — adding
  words to a non-islanded section fails the pairing, not a test.
- The authored-shell budget (39,000 bytes) binds every homepage sentence;
  compress inside islanded sections to fund additions.
- The canonical definition sentence is pinned verbatim across meta,
  JSON-LD, `llms.txt`, `index.md`, and README — visible summary copy can
  diverge, the canonical string cannot.
- The legacy-identity inventory hashes identity-bearing LINES, so any edit
  on a line containing "studio" (including the JSON-LD blob line) needs a
  fresh `legacyIdentitySnapshot` — run it last, after copy stops moving.

## Second pass — plain-language body copy

Follow-up scope from owner feedback: the page still read technically for a
nontechnical, agent-familiar audience. Rewrote the remaining body sections
toward "tell your agent and go":

- `#install` — install-note now leads with delegation: "Tell your agent:
  “install Slopcamera and its skill.”" The command widget is unchanged
  (pinned structure).
- `#workflow` — summary, quiet-note, and all five step details rewritten in
  plain language ("Tell your agent what you have", "what you approve is
  what ships"). Step labels kept (pinned in `site.test.ts` order test).
- `#interfaces` — card descriptions de-jargoned ("Installs the craft into
  your agent", "for builders", "programs that speak MCP"); pinned boundary
  sentence kept verbatim.
- `#design` — trust-links compressed to two plain sentences while keeping
  the pinned phrases "current user", "without an operating-system
  sandbox", and the security/privacy links.
- `#examples` — techniques heading "Pick a technique; your agent handles
  the rest.", "Contracts:" → "The fine print:", source-build note dropped.
- `#questions` — new "Do I need to write code?" answer for the nontechnical
  reader.
- Facts cell simplified; `index.md` install section mirrors the
  agent-delegation line. Canonical definition, h1, JSON-LD, and all pinned
  phrases unchanged.

### Contract handling, pass two

- Baseline literals for slot-bearing sections (`#install`, `#interfaces`)
  were extracted from a real c56e007 build in a temporary worktree, since
  authored markup cannot reproduce the rendered copy-command widget or
  highlighted code. Both sides were extracted as DOM `outerHTML` via
  pinned Chromium — bare attributes serialize as `attr=""`, which raw
  dist text does not reproduce.
- `examplesIslands` grew to 13: whole-section `#install`, `#workflow`,
  `#interfaces`, `#design`, and `.hraness-marketing-facts` added; the two
  absorbed child islands removed. All eight flow sections are now declared
  height owners — appropriate for a full-body copy pass.
- `refinementIslands` grew to 11 keys with DOM-serialized current literals;
  the interface-grid key was absorbed into `#interfaces`.
- Tests: non-owner flow diagnostic and undeclared-height throw now
  exercise `#maker` (all flow sections are owners); the Sugar High
  assertion moved from the interface-grid key to `#interfaces`, which
  still carries exactly one `sh__line`.
- Authored shell: 38,994 / 39,000 bytes.
- `bun run check` (apps/web), `check:standalone`, and
  `verify-example-sources` pass locally.
