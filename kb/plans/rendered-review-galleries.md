---
type: plan
title: Rendered review galleries — applied-material cells, seam checks, and scene-variant contact sheets
description: Upgrade the gallery review loop from flat generated pixels to rendered evidence — textures shown applied to probe geometry with a tiled seam check, skyboxes shown lighting a probe scene, and whole-scene variants composited as rendered stills — while preserving per-candidate durable provenance and explicit promotion.
area: generative-media
status: completed
repository_scopes:
  - src
  - src/spatial-scene
  - apps/desktop/cli
  - apps/desktop/application
  - skills/slopcamera
  - docs
---

# Rendered review galleries

## Outcome

An agent reviewing generated 3D inputs sees how each candidate actually
behaves in a scene, not just how the flat image looks:

- `slopcamera image gallery --kind texture` tiles each cell 2×2 so seams are
  visible in the sheet itself.
- `slopcamera ai image gallery --kind texture|skybox --preview probe` renders
  each durable candidate applied to a canonical probe scene (texture on lit
  geometry; environment as `scene.background`/`scene.environment`) and the
  contact sheet shows those rendered stills.
- `slopcamera ai scene gallery <scene.json>` renders bounded scene variants —
  environment swaps, material changes, lighting/palette axes expressed as
  typed patches — into one labelled contact sheet of beauty stills.

Every cell still resolves to durable artifacts: the generated candidate, the
rendered cell image, and the job record stay separate in the receipt, and no
output ever applies itself to a scene or replaces authored source.

## Context

`plans/generative-image-galleries` shipped the candidate loop: bounded
parallel generation, labelled contact sheet, per-candidate provenance
receipts, durable tracked jobs, and the `material.map` / `environment` /
`set-material` contract surface that promotion consumes. Its deferred list
already names review-time critique and promotion helpers.

Two gaps remain for 3D work specifically:

1. **Flat cells mislead.** A generated texture can look perfect flat and
   tile with obvious seams; a skybox's value is the light it casts, not its
   rectangle. Reviewers need rendered evidence.
2. **Variation lives at the wrong level.** For world building the useful
   unit is the rendered scene — six versions of the world side by side —
   not six loose texture files.

The seams for both already exist: `renderSpatialScene`
(`apps/desktop/application/spatial-render.ts`) produces verified
frame-mode beauty stills through the pinned-browser pipeline, the probe
scene can be expressed entirely in the v1 contract (mesh + `material.map` +
`environment` entity), and `composeSlopcameraImageGallery`
(`src/image-gallery.ts`) already composites pre-published candidate paths —
rendered cells need no new composition machinery.

## Scope

### In scope

- Portable compositor support for tiled repeat cells and for a cell image
  distinct from the candidate artifact.
- Desktop `ai` lane probe-scene rendering for `texture`, `skybox`, and
  `backdrop` candidates, with both candidate and render artifacts retained
  per receipt row.
- A new `ai scene gallery` command: typed bounded scene variants → parallel
  frame renders → labelled contact sheet + receipt.
- Agent-skill and docs updates describing rendered review and explicit
  promotion.

### Non-goals

- Vision-model ranking/critique of candidates (deferred by the parent plan).
- Full PBR map derivation (normal/roughness from base color), winner-seeded
  refinement rounds, 3D-asset (GLB) generation, and material libraries —
  independent follow-ups, not prerequisites here.
- Any change to promotion semantics: selection remains an explicit authored
  patch; galleries never mutate a scene.
- Portable-lane rendering. Scene rendering requires the pinned browser
  pipeline; `image gallery` stays portable pixels-only.

## Constraints and decisions

- Reuse `renderSpatialScene` for every rendered cell and variant — the same
  verified, evidence-carrying render path as `scene render`, not a second
  renderer. Each render is a durable operation with its own evidence.
- Bounded parallelism stays at the gallery limit (`mapBounded`, 4 in
  flight); scene renders are heavier than image calls, so per-variant claims
  go through host-resource admission like other render work.
- The probe scene is a fixed checked-in scene document (lit sphere + ground
  plane + wall, fixed camera), synthesized per candidate by substituting the
  admitted asset — `material.map` for texture cells, an `environment` entity
  for skybox cells. It is never authored by the caller and never persists
  into a project.
- `composeSlopcameraImageGallery` gains an optional per-candidate
  `cellImage` reference (path + sha256) distinct from `path`: the cell shows
  the render, the receipt keeps both. Cells without `cellImage` behave
  exactly as today.
- Rendering failures follow the existing rule: a failed render becomes a
  labelled `failed` cell with the failure message and retained job/render
  record — never a dropped candidate or a retried ambiguous paid call.
- Generated bytes are inputs to render jobs; the render verifies the
  candidate digest before rasterization so the reviewed pixels provably come
  from the tracked artifact.

## Plan

### Phase 1 — Tiled-seam cells

- **Status:** Completed — deterministic 2×2 cell repeat in the compositor
  (sharp `tile: true` offsets the grid by half a tile, so four explicit
  placements are composited instead); `tiled` on plan input/plan/candidate
  receipt rows, default on for `texture`, `--tile|--no-tile` on both the
  portable and `ai image gallery` surfaces, `tiled` on the
  `slopcamera.image.gallery` operation input. Validated by
  `src/image-gallery.test.ts` (pixel-level seam assertions),
  `src/cli.test.ts` (flag mutual exclusion), and
  `apps/desktop/cli/gateway-commands.test.ts` (receipt + summary flag).
- **Depends on:** none
- **Objective:** `texture` (and opt-in `backdrop`) cells show a 2×2 tiled
  repeat so seam artifacts are visible in the sheet.
- **Scope:** `src/image-gallery.ts`, `src/image-gallery.test.ts`,
  `src/cli.ts` flag surface if needed.
- **Out of scope:** any rendering, any desktop-lane change.
- **Approach:** in the composition loop, when the cell is marked tiled,
  resize the candidate to quarter-cell and blit 4 copies. Default tiled on
  for `kind: "texture"`; `--no-tile` or a plan-level flag disables. The
  receipt records `tiled: true` per cell. Watch the existing cell-pixel
  bound — a tiled cell must still fit `slopcameraGalleryLimits`.
- **Acceptance criteria:** a synthetic checkerboard candidate produces a
  visibly continuous 2×2 cell; a deliberately offset-texture candidate shows
  the seam; receipt rows carry the `tiled` flag; non-texture kinds unchanged
  unless flagged.
- **Validation:** `bun test ./src/image-gallery.test.ts`; visual spot-check
  one real texture gallery.

### Phase 2 — Probe-scene rendered cells

- **Status:** Completed — `src/spatial-scene/probe.ts` builds the fixed
  checked-in probe scene per mode (texture → `material.map` on lit subject +
  four adjacent wall tiles exposing seams, skybox → `environment` entity
  lighting a reflective sphere, backdrop → scene surface); `cellImage` on the
  resolved-candidate contract and receipt row keeps the rendered still
  distinct from the generated candidate; `attachGalleryProbePreview` in
  `commands.ts` validates candidate bytes, writes `probe-scene.json` beside
  the durable artifact, renders one beauty frame through `scene.render`, and
  verifies still bytes + SHA-256 before composition. Render-phase
  host-resource claims (`cpu`/`local-io`/`browser`/`output-publication`) are
  acquired per settled candidate so paid provider waits never pin render
  capacity; a failed render keeps the flat candidate with a warning.
  `--preview probe` rejects `image`/`sprite`. Validated by
  `src/spatial-scene/probe.test.ts` (5 tests), `src/image-gallery.test.ts`
  composition-seam cases, and `gateway-commands.test.ts` probe rows (rendered
  still vs candidate provenance, failure fallback, kind rejection). No
  real-credential end-to-end run yet — environment lacks
  `AI_GATEWAY_API_KEY`; the seam is fixture-verified.
- **Depends on:** Phase 1 (shares the compositor).
- **Objective:** `ai image gallery --kind texture|skybox --preview probe`
  composites rendered stills — each candidate applied to the probe scene —
  instead of flat pixels, while keeping the candidate artifact in the
  receipt.
- **Scope:** `apps/desktop/cli/args.ts`, `apps/desktop/cli/commands.ts`,
  `apps/desktop/cli/help.ts`, `apps/desktop/cli/gateway-commands.test.ts`,
  `src/image-gallery.ts` (`cellImage` on the resolved-candidate input and
  receipt row), a new checked-in probe scene fixture under
  `apps/desktop/`.
- **Out of scope:** scene-variant galleries, caller-supplied probe scenes.
- **Approach:** after each candidate's durable job resolves, synthesize a
  probe scene document (fixed fixture; texture → `set-material`-equivalent
  authored material with `map`, skybox → `environment` entity), admit the
  generated artifact as a scene asset, and `renderSpatialScene` a frame-mode
  beauty still. Pass that render as `cellImage` to the composer. Job
  metadata stays secret-free (digests + probe identity, never prompts).
- **Acceptance criteria:** a two-candidate texture gallery yields two
  distinct rendered cells and receipt rows containing candidate path,
  candidate digest, render path, render digest, and job record; a render
  failure keeps the flat candidate cell or a failed cell per the failure
  contract; `--preview probe` on `image`/`sprite` kinds is rejected
  explicitly.
- **Validation:** `bun test
  ./apps/desktop/cli/gateway-commands.test.ts` with a stubbed render seam;
  one real end-to-end run with a Gateway credential; `bun run check:desktop`.

### Phase 3 — Scene-variant galleries

- **Status:** Completed — `src/scene-gallery.ts` parses a bounded
  `slopcamera.scene-variants` document (≤16 variants, typed
  `slopcamera.spatial-scene-patch` ops, `expectedSceneSha256` optional) and
  applies every patch up front with per-variant patch/derived-scene digests
  and diffs. `handleAiSceneGallery` + `dispatchSceneVariant` publish each
  derived scene at `variants/<id>/scene.json` under the output directory,
  stage every declared asset payload beneath the variant directory
  (inherited payloads resolve beside the authored scene; variant-authored
  `add-asset`/`replace-asset` payloads resolve beside the variants file;
  digests verified before copying) so derived scenes are standalone
  re-renderable, pass that complete staged closure as explicit
  repository-relative `scene.render` asset bindings, bind the expected derived
  `sceneSha256`, then render beauty stills through `scene.render` (or the
  `renderGalleryScene` test seam) under `mapBounded` concurrency. The
  compositor accepts a `receipt` descriptor
  (`kind: "slopcamera.scene-gallery"`, `provider: "local"`,
  `baseSceneSha256`); rows carry the derived scene as the candidate artifact
  and the still as `cellImage`, failures stay in the sheet. Command claims
  `cpu`/`local-io`/`browser`/`ffmpeg`/`output-publication` (variants may
  carry video assets); no network or paid work. Validated by
  `src/scene-gallery.test.ts` (8 tests) and three `gateway-commands.test.ts`
  cases asserting byte-identical authored scene, staged payload resolution
  inside the render seam, per-row digests, failure retention, and
  no-replace/camera rejection before any render.
- **Depends on:** Phase 2 (reuses its render-per-candidate wiring and
  `cellImage` contract).
- **Objective:** `slopcamera ai scene gallery <scene.json>` composites one
  labelled contact sheet of beauty stills across bounded typed scene
  variants.
- **Scope:** `apps/desktop/cli/args.ts`, `apps/desktop/cli/commands.ts`,
  `apps/desktop/cli/help.ts`, variant-planning code (new module, e.g.
  `src/spatial-scene/gallery-variants.ts` or an application-layer module if
  it must stay host-side), tests.
- **Out of scope:** paid generation inside variants (variants come from
  typed patches over the authored scene — different authored assets,
  parameters, visibility — not new paid calls); video variants.
- **Approach:** variants are expressed as a bounded list of patch ops plus
  variant metadata (`--variants <file.json>` mirroring `--candidates`, or
  `--vary` over environment/light axes where the scene exposes alternates).
  Each variant produces a derived scene document (canonical sha recorded),
  one `renderSpatialScene` frame still, and one cell. The receipt records
  base scene sha, per-variant patch digest, derived scene sha, render
  artifact, and failure rows.
- **Acceptance criteria:** a base scene with 3 declared variants yields 3
  rendered cells with per-variant provenance; invalid patch input is
  rejected before any render starts; a variant render failure stays in the
  sheet; the gallery never writes back to the source scene path.
- **Validation:** new deterministic tests for variant planning and the
  dispatch loop (bounded parallelism asserted like the image lane);
  `bun run check:desktop`.

## Verification

- Focused suites per phase (`src/image-gallery.test.ts`,
  `apps/desktop/cli/gateway-commands.test.ts`, new variant tests) plus
  `bun run check:standalone` after any inventory-bearing change and
  `bun run check` before handoff.
- Live qualification target, when a paid call is separately authorized: one
  real-credential `ai image gallery --preview probe` run proving provider
  output, rendered cells, digests, and job records line up.
- Generated bundles: `bun run build:sdk` when `src/` changes;
  `bun run build:desktop:cli` when the desktop CLI changes — rebuild from a
  clean tree (see risks).

Final evidence:

- `bun test src/scene-gallery.test.ts src/image-gallery.test.ts
  src/spatial-scene/probe.test.ts apps/desktop/cli/gateway-commands.test.ts
  apps/desktop/cli/args.test.ts`: 80 pass, 0 fail (the ignored checked-out
  content-footer worktree duplicates some unchanged tests).
- SDK and desktop TypeScript checks passed; ESLint passed on every touched
  source and test file.
- SDK and desktop bundles rebuilt without the unrelated `html-scene.ts`
  working-tree change; `bun scripts/check-standalone.ts` passed and the legacy
  identity inventory was refreshed.
- `bun run check` passed end to end after a frozen install corrected local
  `@hraness/design-kit` dependency drift; an isolated temporary HOME avoided
  unrelated machine-global host-resource holders without changing source or
  production configuration.
- `kb percolate plans/rendered-review-galleries --root kb`, `kb refresh
  --root kb`, and `kb check --root kb` passed; the seven reported contextual
  orphans are existing intentional plan leaves.
- No paid live Gateway call was made. Probe rendering is qualified through the
  injected render seam and the repository's real `scene.render` contract;
  live provider behavior remains explicitly unclaimed.

## Risks and recovery

- **Stale-bundle trap (repeat of the #137 incident):** the committed
  `apps/desktop/dist/cli/main.js` embeds whatever source is in the working
  tree at build time — including unrelated uncommitted edits. Rebuild only
  from clean or fully staged state, and treat CI's `Verify committed CLI
  output` as the authority.
- **Render cost.** A 16-candidate probe gallery is 16 browser renders;
  bound it through existing render resource claims and keep the default
  preview mode off for large counts if profiling shows contention.
- **Receipt ambiguity.** Keeping both candidate and render artifacts per row
  is deliberate; the schema must name fields unambiguously (`path` =
  generated candidate, `cellImage.path` = rendered cell) so promotion picks
  the generated artifact, never the review render.

## Result

All three phases were implemented on `feat/rendered-galleries` for
current-head review: texture galleries default to deterministic 2×2 seam
cells; durable texture, skybox, and backdrop galleries can render fixed
probe-scene cells; and `slopcamera ai scene gallery` applies bounded typed
variants, stages and binds their exact asset closures, renders beauty stills
with bounded concurrency, and writes a labelled local gallery receipt.
Candidate artifacts, derived scenes, render stills, scene identities, and
failures remain distinct and digest-bound. No path overwrites the authored
source, no gallery promotes a candidate automatically, and render failure
rows retain any derived scene that was already published.

Final review corrected four cross-phase issues before closeout: texture probe
seams now use four adjacent mapped planes rather than one clamped stretched
map; probe and variant renders bind the expected scene digest; variant renders
receive explicit exact asset bindings in addition to standalone staged
payloads; and failed variant rows retain derived-scene artifact fields. Input,
asset, render, and receipt paths are repository-contained and physical.

## Durable memory

Current operating guidance is owned by `docs/how-to/generate-media.md`,
`docs/spatial-scenes.md`, and
`skills/slopcamera/references/image-galleries.md`; the skill index recommends
that workflow for image and whole-scene alternatives. The reusable contract is
simple: `path`/`sha256` identify the candidate or derived scene,
`cellImage.path`/`sha256` identify review pixels, and explicit promotion always
targets the selected candidate or typed patch—not the rendered cell. No
additional maintained KB concept was needed; this completed plan preserves the
design rationale, execution evidence, and live-qualification proof limit.
