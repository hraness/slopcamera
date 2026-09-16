---
type: plan
title: Agentic scene authoring phase 2 — rendered audit and closure seams
description: Complete the deferred verification half of agentic scene creation — object-id/depth rendered audit — plus the three integration seams the phase-1 prototypes left open (facts→audit bounds join, world-import provider metadata, multi-file generator closure).
area: spatial-scenes
status: completed
repository_scopes:
  - src/spatial-scene
  - apps/desktop/cli
  - apps/desktop/application
  - apps/desktop/contracts
  - skills/slopcamera/references
---

# Agentic scene authoring phase 2

## Overview

Phase 1 (`[[plans/agentic-scene-authoring]]`, merged `311325d` + `9002881`)
shipped the authoring and geometric-verification layer: builders, GLB asset
admission with persisted bounds, `scene.audit` geometric sampling,
`scene diff`, and trusted generator modules. Its deferred list recorded what
remained. This plan picks up the items that are **not** gated on usage
evidence:

- **Rendered-tier audit** — the plan's "facts that verify scenes" half that
  geometric bounds cannot reach: per-entity rendered visibility %, occlusion
  deltas, and never-rendered findings from the object-id pass.
- **Facts→audit join** — `scene audit --asset-bounds` should accept the
  admission/facts documents `scene asset admit` already emits, closing the
  admit→audit loop without a manual JSON reshape.
- **World import provider metadata** — `scene world import` consumes a
  provider metadata artifact (e.g. World Labs `semantics_metadata`) as
  *suggested* normalization so agents stop guessing scale/ground.
- **Generator multi-file closure** — transitive relative imports with a
  `closureSha256` that covers the real file set, staged content-addressed.

Still deferred by the phase-1 decision gate (no usage evidence yet):
schemaVersion-2 contract items (instancing, spot light, shadows, emissive,
extra GLB maps), MCP scene tools, DFS constraint solver, Gateway vision
critique. Revisit only when measured usage shows the current surfaces are
insufficient.

## Constraints

- Portable layer (`src/spatial-scene/`) stays effect-free: pixel *analysis*
  belongs there as pure functions over caller-supplied decoded data; PNG
  decode, browser admission, and artifact publication stay host-side.
- Rendered audit must honor aux-pass truth honestly: splats report
  object-id/depth `unsupported` (the Spark profile declares both
  unsupported); it is never a substitute for beauty-pass inspection.
- Reuse, don't fork: rendered audit composes `planSpatialRender` +
  `createSpatialOverlayBatch` evidence + `spatialSelectionColor` /
  `decodeSpatialAxialDepth` decode; it does not reimplement rendering.
- The render path is browser-admitted heavyweight machinery — rendered audit
  is a separate operation/command class from pure `scene.audit`, with its own
  resource claims and honest cost statement.
- All new foreign input parses from `unknown` through bounded strict zod
  schemas; follow `apps/desktop/cli/AGENTS.md` containment, no-replace
  publication, and receipt rules.
- Validation gate: focused `bun test <file>` during development, then
  `bun run check` on the integration branch; `dist/` rebuilds per policy,
  with `--update-legacy-identity-inventory` for generated rows.
- Each phase lands reviewable on the integration branch; phases 1–4
  parallel-prototype in worktrees then cherry-pick.

## Phases

| Phase | Name | Depends on | Parallelizable with |
| --- | --- | --- | --- |
| 1 | Audit bounds join | — | 2, 3, 4 |
| 2 | Rendered-tier audit | — | 1, 3, 4 |
| 3 | World import provider metadata | — | 1, 2, 4 |
| 4 | Generator multi-file closure | — | 1, 2, 3 |
| 5 | Docs, skill, plan finalization | 1–4 | — |

Phases 1 and 2 both touch `apps/desktop/cli/spatial-scene-service.ts`,
`args.ts`, and `help.ts` — integration resolves the command-surface overlap
the same way phase 1 did (`audit` keeps its verb; the rendered tier decides
between `--mode rendered` on audit vs. a separate `scene render-audit` verb).

## Phase 1: Audit bounds join

- **Status:** Completed — merged PR #127 (`f5072a3`)
- **Depends on:** none
- **Objective:** `scene audit --asset-bounds <file>` accepts the documents
  `scene asset admit` produces — the admission document and/or the facts
  manifest payload — in addition to the existing raw
  `{assetId: {min, max}}` map.
- **Scope:** `apps/desktop/cli/spatial-scene-service.ts` (the assetBounds
  read at line ~106), possibly a small pure normalizer in
  `src/spatial-scene/audit.ts`; colocated tests.
- **Out of scope:** audit report schema changes, renderer work, admission
  changes.
- **Approach:**
  - Parse the `--asset-bounds` file once, detect its shape, and normalize to
    the existing `Record<assetId, {min,max}>`:
    - raw map (current behavior, unchanged)
    - `slopcamera.spatial-asset-admission` document →
      `{ [manifest.assetId]: facts.bounds.sceneSpace }`
    - `slopcamera.spatial-asset-facts` payload alone has no assetId — needs
      its subject manifest; accept `{ manifest, facts }` pair or the
      admission doc which bundles both. Decide the accepted shapes in code
      review; keep them strict-schematized in
      `apps/desktop/contracts/spatial-asset.ts`.
    - optionally an array of admission docs for multi-asset scenes.
  - Conflicting bounds for one assetId across supplied docs reject
    explicitly, never last-write-wins.
  - `sceneSpace` bounds only — modelSpace is not scene-relative and must not
    silently substitute.
- **Acceptance criteria:**
  - `scene asset admit` output feeds `scene audit --asset-bounds` directly;
    the admitted entity reports `bounded` instead of `bounds-unknown`.
  - Raw-map input is byte-for-byte equivalent to today.
  - Malformed/mismatched shapes reject with typed errors.
- **Validation:** `bun test apps/desktop/cli/spatial-scene-audit-service.test.ts`
  plus a focused admit→audit fixture test.

## Phase 2: Rendered-tier audit

- **Status:** Completed — merged PR #130
- **Depends on:** none (soft: Phase 1 supplies asset bounds for comparing
  rendered footprints to geometric estimates)
- **Objective:** a rendered audit reports per-entity pixel visibility facts
  from the object-id pass — who actually draws, how much of the frame they
  cover, and which authored-visible entities produce zero pixels.
- **Scope:** new pure analyzer module `src/spatial-scene/audit-rendered.ts`;
  host orchestration in `apps/desktop/` (application + cli service); args,
  help; colocated tests.
- **Out of scope:** beauty-pass critique, vision models, renderer changes,
  splat pixel truth (unsupported stays unsupported).
- **Approach:**
  - Command surface decision (prototype resolves): `--mode rendered` on
    `scene audit` vs. separate `scene render-audit`. The pure geometric audit
    and the browser-admitted rendered audit have different resource claims —
    a separate `scene.render-audit@1` operation is the cleaner policy split;
    confirm during implementation.
  - Flow: evaluate/plan N samples (bounded, reuse audit sample policy ≤64) →
    render `object-id` mode frames in one overlay batch (the renderer already
    supports multi-sample batches) → decode RGBA via the existing sharp/
    `loadRaster` path → per-pixel `selectionId` via
    `spatialSelectionColor`'s byte order → join through the batch's per-frame
    `objects` evidence (`entityId ↔ selectionId`).
  - Pure analyzer input: per-sample per-entity pixel counts + the geometric
    context audit already computes (frustum state, pixelFootprint estimate).
    Output: strict-schema report — visibility %, rendered-vs-estimated
    footprint delta (occlusion signal), never-rendered findings,
    unsupported-kinds notes (splat, and text/view-layer caveats as measured).
  - `axial-depth` pass is available (`decodeSpatialAxialDepth` exists);
    include nearest-depth-per-entity facts only if the lane shows it cheap —
    otherwise leave a documented follow-up.
  - Render receipts/artifact handling follow `spatial-render.ts` conventions;
    the report itself publishes as bounded JSON.
- **Acceptance criteria:**
  - A scene with an authored-visible but fully occluded (or object-id
    invisible) entity reports it; a normal scene reports plausible
    visibility %.
  - Splats and unsupported kinds report honest notes, never fake pixels.
  - Same scene + same samples → identical report (deterministic under the
    qualified renderer; document any rasterization variance policy).
  - Report parses through its strict schema; geometric `scene audit` output
    is unchanged.
- **Validation:** focused analyzer tests (pure, deterministic) + a host
  orchestration test using the existing CLI test helper (in-process, no
  machine-global admission); real-browser end-to-end noted for the gate.

## Phase 3: World import provider metadata

- **Status:** Completed — merged PR #128 (`2a96b72`)
- **Depends on:** none
- **Objective:** `scene world import` can consume a declared provider
  metadata artifact (World Labs `semantics_metadata` shape) and surface it
  as *suggested* normalization in the import output — agents get scale and
  ground hints without inventing values.
- **Scope:** `apps/desktop/contracts/spatial-world.ts`,
  `apps/desktop/application/spatial-world-import.ts`,
  `apps/desktop/cli/spatial-world-service.ts`; colocated tests.
- **Out of scope:** auto-applying suggestions (normalization stays
  caller-explicit), new provider calls, collider semantics.
- **Approach:**
  - Add an optional declared artifact to `SavedSpatialWorldImportInputSchema`
    (same `{path, sha256, bytes}` discipline as the splat/collider inputs);
    captured through the existing `readExact` path.
  - Parse through a bounded strict schema that tolerates unknown provider
    keys but extracts recognized ones (scale factor, ground plane offset/
    axis, up axis) into a typed `suggestedNormalization` record.
  - Output manifest records the suggestion + the metadata artifact's digest
    for provenance; the scene entity still uses the caller's explicit
    `normalization` — the suggestion is advisory, never silently applied.
  - If the provider shape is unverifiable, record raw extracted fields
    honestly rather than claiming interpretation.
- **Acceptance criteria:**
  - Import with a metadata artifact emits `suggestedNormalization`; import
    without it is byte-identical to today.
  - Malformed/oversized metadata rejects; unknown keys don't break parsing.
  - Output records the metadata digest (provenance), not just values.
- **Validation:** focused contract + import-service tests with a fixture
  metadata JSON.

## Phase 4: Generator multi-file closure

- **Status:** Completed — merged PR #129 (`6848867`)
- **Depends on:** none
- **Objective:** `scene generate` accepts generator modules with relative
  imports; the retained `closureSha256` covers the complete transitive
  relative file set.
- **Scope:** `apps/desktop/cli/spatial-generate-service.ts`,
  `src/spatial-scene/generate.ts` if the record schema needs it;
  `examples/scene-generators/` may gain a multi-file example; tests.
- **Out of scope:** bare/package specifier pinning (documented ambient
  dependency gap stays documented — decide in the lane whether multi-file
  mode tightens it), execution sandboxing (none — trusted code).
- **Approach:**
  - Walk transitive relative imports with `Bun.Transpiler` scanning
    (`assertSingleFileGeneratorModule` already scans the entry); bound file
    count and total bytes; reject cycles escaping a declared module root,
    absolute paths, symlinks, and non-`.ts/.js` payloads.
  - Stage the closure under a content-addressed directory tree (same
    no-stale-import rationale as `stageGeneratorModule`); import the staged
    entry.
  - `sourceSha256` stays the entry-file digest; `closureSha256` becomes the
    digest of the sorted `{relativePath, sha256}` closure manifest — distinct
    and honest. Single-file modules keep `closureSha256 == sourceSha256`.
  - Re-read each closure file with the existing inode/mtime/ctime
    change-detection before import.
- **Acceptance criteria:**
  - A two-file generator (entry + helper) runs; its retained record's
    `closureSha256` covers both files; editing the helper changes the digest.
  - Escapes (absolute imports, `..` past the module root, symlinked closure
    files) reject.
  - Single-file modules produce identical records to phase-1 behavior.
- **Validation:** focused service tests + an example multi-file generator.

## Phase 5: Docs, skill, plan finalization

- **Status:** In progress — skill reference updated with the rendered tier;
  this plan finalized and shipped in the closing PR
- **Depends on:** 1–4
- **Objective:** `skills/slopcamera/references/scene-building.md` and
  `docs/spatial-scenes.md` document whatever actually lands; this plan gets
  Result/Durable memory.
- **Approach:** terse allowlist additions; honest rendered-audit limits
  (occlusion signal is a delta, not pixel truth for splats; rendered audit
  needs the browser profile); update audit usage for the bounds join.
- **Validation:** `bun run check:skill`, docs consistency with real flags.

## Implementation log

- Four worktrees created off `9002881`; all lanes parallel-prototyped.
- **Phase 1 merged as PR #127** (`f5072a3`): `normalizeSpatialAuditAssetBounds`
  in `spatial-scene-service.ts` accepts raw map, admission document,
  `{manifest, facts}` pair, and mixed arrays; bare facts payload rejects (no
  assetId). Only `sceneSpace` is consumed; `facts.subject` sha256/bytes are
  verified against `manifest.payload`; conflicting bounds for one assetId →
  `conflict`. 5 focused tests pass. **Found and fixed a shipped defect**:
  `help.ts` on `main` carried unresolved merge-conflict markers from `311325d`
  inside the scene help literal — the PR resolves them keeping both audit and
  generate entries.
- **Phase 3 merged as PR #128** (`2a96b72`): optional `providerMetadata`
  artifact input (`{path, sha256, bytes}` under `sourceRoot`, `readExact`
  verified, ≤1 MiB, counted in source-byte accounting). Tolerant parser in
  `spatial-world-metadata.ts` recognizes Marble `semantics_metadata` fields
  (snake_case, camelCase, one-level wrapper; unknown keys ignored, mistyped
  recognized keys reject). Manifest gains `suggestedNormalization` with
  `status: unverified-provider-declared`, declared values, mapped suggestion,
  artifact digest. Advisory only — entity construction unchanged; no-metadata
  import is byte-identical. Residual: metadata bytes are digest-bound but not
  retained as a published asset (would need a new portable metadata enum).
  17 focused tests pass.
- **Phase 4 merged as PR #129** (`6848867`): `resolveGeneratorModuleClosure`
  does BFS over `Bun.Transpiler.scan` imports with Bun-mirroring candidate
  probing (.ts/.js/.json, .js→.ts fallback, index.* for dirs), realpath
  containment inside the entry's real directory, symlink rejection
  (`O_NOFOLLOW` leaf + realpath≠candidate interior), verified reads with
  ino/mtime/ctime change detection per member. `closureSha256` = canonical
  digest of sorted `{relativePath, sha256}` manifest; single-file keeps
  `closureSha256 == sourceSha256` (byte-identical records). Content-addressed
  `<closureSha256>/<relpath>` staging tree, atomic rename, concurrent-winner
  tolerated. `require`, dynamic `import`, `import.meta.glob/resolve/require`
  rejected in every file; absolute specifiers (`/`, `\`, drive-letter,
  `file:`) rejected in both modes. Bare/package/builtin specifiers remain
  ambient-undigested — documented gap unchanged. Bounds: ≤64 files, ≤1 MiB
  aggregate. 8 focused tests pass incl. escape/symlink/invisible-form
  rejections and digest verification. Lane also resolved the same `help.ts`
  conflict markers (second independent fix — merged coherently).
- CI integration note: each lane's rebuilt `dist/cli/main.js` changed
  identity-bearing lines → `--update-legacy-identity-inventory` rehash needed
  per PR (generated-row auto-accept, same as phase 1). Sequential merges
  made each subsequent PR's bundle+inventory rows conflict — resolved by
  merging `origin/main`, rebuilding dist, re-rehashing.
- **Phase 2 merged as PR #130** (`596e570`): command-surface
  decision resolved as a **separate `scene render-audit` verb** +
  `scene.render-audit@1` operation (cleaner policy split — different resource
  claims: browser capability, no `output-publication` since nothing is
  published). Portable `audit-rendered.ts` (614 lines) stays effect-free over
  caller-supplied decoded counts: eligibility taxonomy
  (renderable/view-masked/no-surface/unsupported-kind), per-entity rendered
  pixels + frame % + coverage ratio vs geometric estimate (occlusion signal),
  findings for never-rendered/occluded/unattributed-pixels/empty-render.
  Host `spatial-rendered-audit.ts` composes the real render path
  (`withPreparedSpatialAssets` + `partitionSpatialRenderWindow` + bound
  runtime + integrity/Three.js-lock verification) — splats filtered before
  lowering and reported `unsupported-kind`, never faked. `verifyPng` now
  returns the decoded RGBA it already produced. Per-frame `pngSha256`
  provenance; per-sample joins verify batch evidence `timeUs`. 36 focused
  tests green. Residual: live-Chrome object-ID e2e is the follow-up evidence
  gate (host tests use the injected renderer seam).

## Result

All four phases merged to `main` as separate PRs, each current-head with
full green CI including `Required` and `Slopcamera local runtime`:

- #127 `f5072a3` — admit documents feed `--asset-bounds` directly
- #130 `596e570` — `scene render-audit` / `scene.render-audit@1`
- #128 `2a96b72` — advisory provider-metadata normalization on world import
- #129 `6848867` — multi-file generator closure with `closureSha256`

The phase-1 agentic loop is now closed end-to-end: an agent can author with
builders or generators (multi-file), admit GLB assets, feed the admission
document straight into `scene audit`, verify *rendered* visibility with
`scene render-audit`, and iterate via `scene diff` + typed `scene patch` —
with provenance and deterministic identity at every step.

## Durable memory

- **`help.ts` shipped unresolved merge markers in `311325d`** — they lived
  inside a template literal so nothing compiled or tested caught them.
  Three independent phase-2 lanes re-found and re-fixed them. A `grep -c
  '<<<<<<<'` sanity check on conflicted files before committing a merge is
  the durable guard.
- **Generated `dist/cli/main.js` identity rows rehash per PR** — any lane
  changing help text shifts identity-bearing lines in the rebuilt bundle;
  `check:standalone -- --update-legacy-identity-inventory` is the sanctioned
  fix, and sequential PRs re-conflict on the bundle+inventory rows (resolve
  by rebuilding both after merging main, never by hand-editing either file).
- **Separate verb beat `--mode` for rendered audit** — different resource
  claims (browser vs pure geometry) and no output publication made
  `scene.render-audit@1` its own operation rather than an `audit` flag.
- **Advisory-by-construction for provider metadata** — the World Labs
  suggestion surfaces as `unverified-provider-declared` fields, never
  applied; that pattern generalizes to any future provider artifact.
- **closureSha256 = digest of sorted {relpath, sha256} manifest**, with
  `== sourceSha256` for single-file — backward-compatible retention without
  a schema version bump.
- Deferred unchanged: v2 contract items, MCP scene tools, DFS solver,
  vision critique, live-Chrome object-ID e2e evidence gate, splat object-ID
  support — all still gated on usage evidence per the phase-1 gate.
