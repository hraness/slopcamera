---
title: Deepen the slopcamera.com surface for search and clarity
description: Add a per-tool reference cluster, use-case and interface-comparison explanation pages, and bounded homepage polish so people searching for a method or tool land on a real Slopcamera contract.
type: plan
area: site-content
status: in-progress
repository_scopes:
  - apps/web/src/docs
  - apps/web/src/docs-registry.ts
  - apps/web/src/docs/index.md
  - apps/web/src/agent-pages.ts
  - apps/web/src/index.html
aliases:
  - SEO reference surface
tags:
  - documentation
  - seo
---

# Deepen the slopcamera.com surface for search and clarity

## Outcome

Anyone searching for a way to produce an AI or programmatic visual asset with a
specific tool — VTracer, Blender, Manim, CadQuery, Three.js, Motion, p5.js,
Two.js, Paper Shaders, vgpu, FFmpeg, Vercel AI Gateway, MCP, or the
`.diagram.json` format — reaches a Slopcamera page that states the exact local
contract for that tool and routes them to the task guide that uses it. The docs
index, `llms.txt`, `sitemap.md`, `sitemap.xml`, `index.md`, and the homepage all
expose the new pages.

## Context

The site docs already follow Diátaxis: `apps/web/src/docs-registry.ts` splits
pages into `tutorials`, `how-to`, `reference`, and `explanation`, and
`site.test.ts` enforces one H1, unique titles and descriptions, canonical links,
TechArticle JSON-LD, and a `.md` mirror for every registered page. So the
framework question is settled; what is missing is depth on the reference axis
and reader-first entry points.

Current gaps, by reader question:

- "How does Slopcamera use tool X, exactly?" — today one row in
  `reference/engines`, which cannot rank for per-tool queries.
- "What can I make with this?" — the homepage gallery shows outputs but no
  task-first map exists in docs.
- "Which interface should I use?" — `explanation/extending` catalogs extension
  surfaces but does not compare the Skill, CLI, SDK, and MCP as entry choices.

Every new page is a real contract page, not a keyword stub: each states the
tool's job inside Slopcamera, exact versions or bounds, requirements, limits,
and the task guide that exercises it. That is what keeps the pages inside
STYLE.md (no hype, claims next to their limits) and the editorial bar in
`apps/web/AGENTS.md`.

## Scope

### In scope

- Eight reference pages, one per tool family, with search-matched titles:
  - `reference/html-profiles` — the seven browser render profiles (plain,
    Motion 12.42.2, p5.js 2.3.2, Two.js 0.8.24, Paper Shaders 0.0.77,
    Three.js 0.185.1, vgpu 0.3.1), their shared absolute-clock contract, and
    `html catalog`/`scaffold`/`render` surface.
  - `reference/diagram-format` — `.diagram.json` version one, the five
    same-stem exports, `.tldr` interchange, config extension, MCP bounds.
  - `reference/vectorization` — the checksum-pinned VTracer profile, fidelity
    and output gates, duotone, provenance receipts, platform limits.
  - `reference/gateway-generation` — Vercel AI Gateway image, video, speech,
    and batch transcription: credential precedence, live catalog discovery,
    upload acknowledgements, `maxRetries: 0`, quarantine, receipts.
  - `reference/spatial-scenes` — `.scene.json`, stable IDs, typed patches,
    calibrated cameras, `three-webgl2-hardware-v1` and
    `three-spark-webgl2-hardware-v1`, the 500,000-splat bound, `scene
    camera-track`, `scene design`.
  - `reference/native-engines` — the `studio` adapter contract for Blender
    5.2.1 LTS, CadQuery 2.8.0, and Manim Community 0.21.0: retained hash-bound
    bundles, `--allow-trusted-code`, explicit runtimes, GPU no-fallback.
  - `reference/video-pipeline` — the FFmpeg/FFprobe project compositor:
    recording-bundle and render inputs, typed non-destructive edits, analysis,
    captions, and the 16:9/9:16/1:1/4:5 delivery variants.
  - `reference/mcp-tools` — the fixed 17-tool set, root-relative paths, byte
    and shape bounds, and what stays CLI/SDK-only.
- Two explanation pages:
  - `explanation/use-cases` — a job-first map from reader goals (documentation
    diagrams, product and launch videos, social-format cuts, educational
    films, generated assets, parametric studies) to surfaces, requirements,
    and guides, including where Slopcamera is not the right tool.
  - `explanation/choose-an-interface` — an honest comparison of the Agent
    Skill, CLI, TypeScript SDK, MCP server, and hosted tool adapter: who each
    is for, what each can do, and its trust boundary.
- Registry, index, and discovery updates: `docs-registry.ts`, `docs/index.md`,
  `agent-pages.ts` (`llmsTxt`, `sitemapMarkdown`, `homeMarkdown`).
- Bounded homepage polish inside current byte budgets (authored < 39,000
  bytes, built < 65,000): replace the stale `v3.3.1` literal in the techniques
  note, add a compact tool-reference link cluster, and add one FAQ entry
  naming the engine families with links into the reference cluster, mirrored
  in the FAQPage JSON-LD.
- This plan file records the per-route editorial score the `apps/web` guide
  requires.

### Non-goals

- No visual-system or CSS changes, no JavaScript, no new templates; pages use
  the existing docs recipe grammar and markdown subset.
- No `/reading` editorial collection and no competitor "versus" pages; the
  voice and thin-content rules apply unchanged.
- No changes to `docs/` (the repository-runbook tree) or README beyond what
  already links these surfaces.
- No new example media; `::example[]` embeds reuse the reviewed registry.
- The reviewed native marketing lanes (`verify:marketing` family) require an
  independently reviewed baseline manifest and pinned baseline checkout; they
  are called out as the acceptance gate for the homepage copy edits, not run
  here.

## Constraints and decisions

- Each new route records: reader job, three nearest existing URLs, merge
  rationale, evidence owner, refresh trigger, and a reassessment date of
  2026-11-10 (49 days). Scores below are reader utility, original evidence,
  factual confidence, Slopcamera fit, voice integrity, maintenance; each must
  reach 9/12 with no zero.
- Facts are drawn from the installed contract: `src/mcp/tools.ts` (17 tool
  names), `apps/desktop/cli/help.ts` (command grammar), the locked library
  versions in `explanation/html-authoring.md`, engine versions in
  `reference/engines.md`, and the capability boundary in
  `reference/capabilities.md`. No capability is promised beyond what those
  sources state; source-only surfaces are marked as such.
- Docs markdown supports only h2/h3, flat lists, tables, blockquotes, fences,
  links, and `::example[id]`; bodies stay under 64 KiB.
- Titles must be unique across `docPages`; descriptions likewise.
- Homepage changes keep every asserted string in `site.test.ts` unless the
  test is updated in the same change, and stay inside the authored/built byte
  budgets.

## Plan

1. Author the eight reference bodies under `apps/web/src/docs/reference/`.
2. Author the two explanation bodies.
3. Register all ten pages in `docs-registry.ts` and update `docs/index.md`.
4. Update `agent-pages.ts` discovery text and `index.html` copy.
5. `bun install --frozen-lockfile --ignore-scripts` in `apps/web`, then
   `bun run check`; fix failures, updating `site.test.ts` only where copy was
   intentionally changed.
6. Commit on `devin/site-seo-content` and open a PR against `main`.

## Per-route admission record

| Route | Reader job | Nearest URLs | Score | Merge rationale |
| --- | --- | --- | --- | --- |
| reference/html-profiles | pick/debug a browser render profile | explanation/html-authoring, how-to/render-motion-graphics, reference/engines | 12 | engines row is one line; how-to is procedural; this is the contract |
| reference/diagram-format | author/validate the JSON source | tutorials/first-diagram, reference/capabilities, explanation/architecture | 11 | schema contract is absent from the site |
| reference/vectorization | understand tracing limits and receipts | how-to/vectorize-images, reference/engines | 11 | how-to is the task; this is the profile contract |
| reference/gateway-generation | credential, discovery, and billing boundary | how-to/generate-media, reference/capabilities, explanation/why-slopcamera | 12 | trust contract deserves a canonical page |
| reference/spatial-scenes | the .scene.json data contract | how-to/direct-scenes, explanation/html-authoring, reference/engines | 11 | scene data model is undocumented on site |
| reference/native-engines | native trust envelope and engine selection | how-to/native-films, reference/engines, tutorials/first-native-film | 12 | the adapter contract outgrew one table row |
| reference/video-pipeline | edit model, inputs, delivery formats | how-to/edit-video, reference/capabilities, explanation/architecture | 11 | compositor contract is split across pages |
| reference/mcp-tools | exact fixed toolset and bounds | tutorials/mcp, explanation/extending, reference/sdk | 11 | tool names and bounds in one canonical list |
| explanation/use-cases | decide where to start from a goal | docs/index, explanation/why-slopcamera, homepage examples | 11 | index lists pages; this maps jobs to paths |
| explanation/choose-an-interface | pick Skill/CLI/SDK/MCP | explanation/extending, tutorials/*, reference/sdk | 11 | extending catalogs surfaces; this compares entry choices |

Evidence owner for all ten: the authored page plus the registry/test contract
in `site.test.ts`. Refresh trigger: a capability, version, or trust-boundary
change in `reference/capabilities` or `reference/engines`.

## Verification

- `bun run check` in `apps/web` — theme check, preview typecheck, the full
  contract suite, production build, and the pinned-Chromium preview proof.
- New pages appear in built `dist/docs/**`, `sitemap.xml`, and each `.md`
  mirror; titles/descriptions unique by suite enforcement.
- Homepage stays under authored and built byte budgets; only intentionally
  changed copy differs, recorded in the PR.

## Risks and recovery

- A factual slip against the installed contract → ground every claim in the
  sources listed above; `site.test.ts` plus review catch mismatches.
- Byte-budget overflow on the homepage → keep additions compact; the suite
  fails closed on budgets.
- Native marketing acceptance unavailable locally → disclose in the PR that
  the reviewed-manifest lane remains the maintainer gate for the copy edits.

## Execution log

- Implemented all ten pages, registry entries, docs index, `llms.txt`,
  `sitemap.md` (auto-generated from the registry), `index.md` mirror, and the
  homepage techniques block on `devin/site-seo-content`.
- Byte discipline: the homepage tool-link cluster had to fit the authored
  39,000-byte shell budget, so the reference links shipped as a compact
  "Tool contracts" quiet-note paragraph rather than a second list. Final
  authored size: 38,998 bytes.
- The `#examples` section is a reviewed island in
  `scripts/site-examples-profile.ts`; its `current` literal was updated to the
  new markup so the native pairing contract still holds. Only declared
  height-owner sections changed, so downstream geometry pairing is preserved.
- `bun run check` in `apps/web` passed end to end: theme snapshots, preview
  typecheck, all 23 test files, the 88-file production build, and the
  pinned-Chromium (153.0.8010.48) preview proof with zero resource or CSP
  errors. `llms.txt` copy updated the stale v3.3.1 literal; the matching
  assertion in `site-copy-content.test.ts` was updated in the same change.
- `check:standalone` required reviewed `legacy-identity.inventory.json` rows:
  "studio" is the pre-Slopcamera identity sentinel, so the six new pages
  naming the native film studio got `native-film-studio` rows and the five
  touched files got refreshed hashes. Inventory order is `localeCompare`.
- Rebased onto `e568424` (foil wordmark) after the first CI run measured the
  merge at 39,190 authored bytes — the wordmark consumed headroom, so the
  quiet-note was compressed to a single "Contracts:" paragraph and the
  section header was tightened. Final authored size: 38,985 bytes.
- PR: https://github.com/hraness/slopcamera/pull/208 — all checks green
  (site, standalone boundary, SDK, local runtime, desktop, packed consumer,
  hosted API, five VTracer lanes, CodeQL, Required), plus both Vercel
  deploys. The native marketing-acceptance lane (reviewed baseline
  manifest) remains the maintainer gate disclosed in the PR body.
