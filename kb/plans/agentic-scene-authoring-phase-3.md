---
type: plan
title: Agentic scene authoring phase 3 — verification depth, contract v2, and performance
description: Close the remaining deferred items — live-rendered evidence, MCP scene tools, a relation solver, contract v1 extensions (emissive, spot lights, shadows, extra GLB maps, instancing), vision critique, splat ID proxies, provider-metadata retention — plus a dedicated performance pass on evaluation and audit.
area: spatial-scenes
status: in-progress
repository_scopes:
  - src/spatial-scene
  - src/mcp
  - apps/desktop/cli
  - apps/desktop/application
  - apps/desktop/html-overlay
  - apps/desktop/contracts
  - skills/slopcamera/references
---

# Agentic scene authoring phase 3

## Overview

Phases 1–2 (`[[plans/agentic-scene-authoring]]`, `[[plans/agentic-scene-authoring-phase-2]]`)
shipped the authoring layer and both audit tiers. The user has now directed the
remaining deferred work with an explicit bar: *thorough, performant, industry
leading*. This plan picks up every deferred item plus a dedicated performance
pass:

- **Performance** — audit/evaluate hoist static work out of the per-sample
  loop; instancing makes `scatter`-heavy scenes cheap to render. A scene
  authored by an agent should evaluate and audit in milliseconds, not scale
  linearly with entity count in the hot path.
- **MCP scene tools** — the pure scene operations belong in `slopcamera mcp`
  so agents never leave the tool surface; host-bound operations stay CLI-only
  unless a clean desktop bridge emerges.
- **Relation solver** — goal-directed placement: declarative relation goals
  (`onTopOf`, `nextTo`, `facing`, alignment chains) resolved to concrete
  transforms, composed over the phase-1 immediate primitives. Bounded, pure,
  deterministic.
- **Contract v1 extensions** — additive fields only, never a schemaVersion
  bump: `emissive` on standard material, `spot` light kind with cone
  parameters, `castShadow`/`receiveShadow` flags, extended GLB admission
  (normal/ORM/emissive textures), and `instances` on mesh entities.
- **Vision critique** — `scene review` sends bounded beauty frames to the
  Gateway vision model behind the established `--allow-cloud-upload`
  discipline; structured findings only, never auto-patched.
- **Splat object-ID proxies + provider-metadata retention + deeper World
  Labs fields** — the honest-attribution leftover and the two small
  metadata leftovers.

## Constraints

- Portable layer (`src/spatial-scene/`, `src/mcp/`) stays effect-free. Solver,
  MCP tool definitions, and contract additions are pure data/pure functions.
- **Contract additions are additive v1 fields.** Old scenes parse unchanged;
  new fields optional with schema-strict validation. The `metadata`
  interpretation enum is the precedent for additive enum growth.
- Renderer work lives in `apps/desktop/html-overlay/` lowering only — the
  evaluated contract is the boundary; Three.js details never leak into
  `src/spatial-scene/`.
- Vision critique is a paid cloud call: same `--allow-cloud-upload`
  acknowledgement discipline as scene analysis; bounded frames, typed
  findings, provenance digests on every uploaded byte. Never auto-apply its
  suggestions.
- MCP tools must honor the existing bounds discipline (workspace-root
  confinement, bounded inputs, no source execution). `execute_slopcamera`
  already exists for the 5 public ops — scene tools are dedicated tools,
  not new enum entries (the enum is the public capability projection).
- Instancing must not change authored identity: an `instances` list is
  authored data inside one entity, not N entities — `entityId` stays
  singular, diff/patch treat it as one value.
- The `DeepReadonly<z.infer>` instantiation hazard (phase-1 finding) applies
  to every new report schema — structural interfaces + parse-site assignment.
- Validation: focused `bun test` per lane, then `bun run check` on each PR;
  `dist/` rebuild + `--update-legacy-identity-inventory` per the phase-2
  pattern; per-lane PRs, current-head, squash merge.

## Phases

| Phase | Name | Depends on | Parallelizable with |
| --- | --- | --- | --- |
| 1 | Evaluation/audit performance | — | 2, 3, 4, 5, 6 |
| 2 | MCP scene tools | — | 1, 3, 4, 5, 6 |
| 3 | Relation solver | — | 1, 2, 4, 5, 6 |
| 4 | Contract v1 extensions | — | 1, 2, 3, 5, 6 |
| 5 | Vision critique | — | 1, 2, 3, 4, 6 |
| 6 | Leftovers: splat ID proxies, metadata retention, WL fields | — | 1, 2, 3, 4, 5 |
| 7 | Docs, skill, plan finalization | 1–6 | — |

Phases 1, 4 both touch `evaluate.ts`; phases 4, 6 both touch `contracts.ts`
and `apps/desktop/html-overlay/spatial.ts`; phases 2, 3 both touch
`src/spatial-scene/index.ts`. Sequential merges resolve shared files the
same way phase 2 did — each later PR merges `origin/main` and regenerates
`dist/` + the identity inventory.

## Phase 1: Evaluation/audit performance

- **Status:** Merged-ready — PR #132
- **Depends on:** none
- **Objective:** `evaluateSpatialScene` and `auditSpatialScene` stop doing
  per-sample work that is constant across the scene — entity indexing,
  channel resolution, static placement — while keeping outputs bit-identical.
- **Scope:** `src/spatial-scene/evaluate.ts`, `src/spatial-scene/audit.ts`,
  `src/spatial-scene/audit-rendered.ts`; a colocated benchmark test.
- **Out of scope:** contract changes, renderer work, output shape changes.
- **Approach:**
  - Profile first: time `auditSpatialScene` on a generated scene (e.g.
    500 entities × 8 samples) before touching anything. The phase-1 log noted
    audit re-parses per sample — verify what `evaluateSpatialScene` actually
    re-derives per call (entity index maps, camera lookup, static channels,
    animation sampling).
  - Hoist a per-scene immutable evaluation context (parsed once, reused
    across all samples): entity-by-id map, camera-by-id map, sorted channel
    lists per entity, static placements resolved once.
  - Keep `evaluateSpatialScene`'s public signature and output unchanged —
    the context is an internal or optional-seam detail.
  - Add a benchmark test asserting audit on the fixture scene completes
    within a generous bound (e.g. <2 s for 500×8 on CI hardware) and — more
    importantly — that outputs are byte-identical to the pre-hoist path.
- **Acceptance criteria:**
  - Measurable speedup on the benchmark (record before/after numbers).
  - Zero output diff on the same scene+samples.
  - No new dependencies, no effects.
- **Validation:** `bun test src/spatial-scene/evaluate.test.ts
  src/spatial-scene/audit.test.ts src/spatial-scene/audit-rendered.test.ts`
  + benchmark evidence.

## Phase 2: MCP scene tools

- **Status:** Not started
- **Depends on:** none
- **Objective:** `slopcamera mcp` gains dedicated scene tools for the pure
  operations — agents can check, inspect, audit, diff, and evaluate scenes
  without leaving the MCP session.
- **Scope:** `src/mcp/tools.ts`, `src/mcp/types.ts`, `src/mcp/tools.test.ts`,
  `src/mcp/server.test.ts`.
- **Out of scope:** host-bound operations (`scene render`, `render-audit`,
  `generate`, `patch` writes, `asset admit` reads), new public operation
  codes, a desktop-registry bridge.
- **Approach:**
  - New tools, each root-relative-path confined like `check_diagram`:
    `check_scene` (parse + validate a scene JSON under the workspace root),
    `inspect_scene` (editable-controls snapshot), `audit_scene` (geometric
    audit; `--asset-bounds` equivalent takes an inline JSON value or a second
    root-relative path), `diff_scenes` (two root-relative paths), and
    `evaluate_scene` (camera + timeUs → evaluated snapshot).
  - All five are pure functions already exported from
    `src/spatial-scene/` — the tools wrap `readWorkspaceFile` + the pure call
    + bounded result, matching `check_diagram`'s exact pattern (schema
    `unknown` parse, `ToolFailure` codes, bounded outputs).
  - `audit_scene` respects `SPATIAL_AUDIT_LIMITS`; return the report directly
    as structured content (it's already bounded JSON).
  - Do **not** extend `slopcameraOperationCodes` — that enum is the portable
    public capability projection (5 ops). Scene ops are host operations;
    these dedicated tools bypass the operation registry by design, same as
    `check_diagram`/`render_diagram` already do.
  - Tool annotations honest: `readOnlyHint: true` for all five (they read
    workspace files, write nothing).
- **Acceptance criteria:**
  - All five tools list in `tools/list` and execute against fixture scenes.
  - Paths outside the workspace root reject; oversized scenes reject;
    malformed input returns typed `ToolFailure` codes.
  - `execute_slopcamera` and the 5 public op codes unchanged.
- **Validation:** `bun test src/mcp/tools.test.ts src/mcp/server.test.ts`.

## Phase 3: Relation solver

- **Status:** Merged-ready — PR #134
- **Depends on:** none
- **Objective:** `solveSpatialRelations` turns a declarative goal set —
  entity keys plus relation constraints — into concrete transforms and a
  ready-to-apply `scene patch`, so agents state intent instead of deriving
  arithmetic.
- **Scope:** new `src/spatial-scene/solve.ts` + tests; `index.ts` export;
  possibly a `scene solve` CLI surface emitting a patch document.
- **Out of scope:** arbitrary CSP, optimization objectives, animation
  solving, physics.
- **Approach:**
  - Input: `{ goals: [{ entityKey, relations: [{ kind: "onTopOf"|"nextTo"|"facing"|"align"|"at", ... }] }], bases: Record<entityKey, {transform, bounds}> }` —
    bounded strict schema; bases carry the known static anchors.
  - Solve as a dependency DAG: topologically order goals by which entity's
    transform another's relations reference; detect cycles and reject with a
    typed error naming the cycle. Within one entity, relations apply in
    declared order (later relations see earlier results) — deterministic.
  - Each relation resolves through the phase-1 primitives (`onTopOf`,
    `nextTo`, `facing`, `align`) — the solver is a composer, not a
    reimplementation. Missing bounds → typed `bounds-unknown` failure naming
    the entity.
  - Output: `{ transforms: Record<entityKey, Transform>, patch: PatchDocument }`
    — the patch carries `expectedSceneSha256` left blank for the caller to
    fill, with one `update-entity` op per goal entity.
  - CLI: `slopcamera scene solve <scene.json> --goals <goals.json>` emits the
    patch document to stdout/`--output` — agents inspect before applying via
    `scene patch`.
- **Acceptance criteria:**
  - A 3-entity chain (A onTopOf B, B nextTo C, C facing camera) solves to
    transforms identical to hand-applying the primitives in order.
  - Cyclic goals reject naming the cycle; unknown entity keys reject;
    missing bounds reject with `bounds-unknown`.
  - Same input → byte-identical output (property test).
- **Validation:** `bun test src/spatial-scene/solve.test.ts` + CLI parse
  test.

## Phase 4: Contract v1 extensions

- **Status:** Not started
- **Depends on:** none
- **Objective:** five additive contract capabilities land end-to-end —
  schema → evaluation → renderer lowering → builders → audit — with tests.
- **Scope:** `src/spatial-scene/contracts.ts`, `evaluate.ts`, `inspect.ts`,
  `build.ts`, `index.ts`, `audit.ts`, `audit-rendered.ts`;
  `apps/desktop/html-overlay/spatial.ts` (Three.js lowering);
  `src/spatial-scene/gltf.ts` (admission profile);
  `apps/desktop/cli/spatial-asset-service.ts` (admission emits new facts).
- **Out of scope:** schemaVersion 2, removing/renaming existing fields,
  splat format changes, volumetrics, post-processing stacks.
- **Approach (in dependency order inside the lane):**
  1. `emissive` on `standard` material: `{ color, intensity }` optional
     fields → `MeshStandardMaterial.emissive`/`emissiveIntensity`.
  2. `spot` in the light enum: `{ angle, penumbra, distance?, decay? }` →
     `THREE.SpotLight` with the entity transform orienting the cone.
  3. `castShadow`/`receiveShadow` optional booleans on mesh/asset entities +
     `shadows` on directional/spot/point lights → renderer shadow-map enable
     (`renderer.shadowMap.enabled`, `light.castShadow`, mesh flags). Audit
     notes unshadowed lights honestly.
  4. Extended GLB admission: allow normal/ORM/emissive textures in the
     closed profile (`gltf.ts` whitelist grows); facts manifest records which
     maps each material carries so agents can audit material completeness.
  5. `instances` on `mesh` entities: optional bounded array of transforms
     (≤4096) rendered as one `THREE.InstancedMesh`; builders' `scatter` gains
     an `instanced: true` option emitting one entity instead of N. Audit
     reports instance count; object-ID pass attributes all instances to the
     host entity's selection code.
  - Every addition is optional → old scenes parse byte-identically. Renderer
    must no-op gracefully on absent fields. Follow the phase-1 D2 lesson:
    check whether additions belong on the strict unions or sibling facts.
  - `inspect` should surface new editable fields (emissive intensity, spot
    angle, instance count) in the controls list.
- **Acceptance criteria:**
  - Scene using each feature renders correctly (evaluated snapshot carries
    the fields; overlay lowering produces the Three.js node — host test
    asserts the lowered graph, not pixels).
  - Old scenes' digests unchanged (byte-identical parse of existing
    fixtures).
  - `scatter(..., { instanced: true })` emits 1 entity; render-audit counts
    its pixels under the host entity's code.
- **Validation:** colocated tests per module + `bun test` on every touched
  test file; desktop typecheck.

## Phase 5: Vision critique

- **Status:** Not started
- **Depends on:** none
- **Objective:** `scene review` renders bounded beauty frames and sends them
  to the Gateway vision model for a structured compositional critique —
  closing the "beauty pass" gap both audit tiers explicitly disclaim.
- **Scope:** `apps/desktop/application/spatial-review.ts` +
  `operations/spatial-review.ts`; CLI surface + args + help; contracts for
  the findings report. Provider plumbing reuses the established Gateway
  scene-analysis path.
- **Out of scope:** auto-patching from critique, video critique, training
  or feedback loops, beauty-pass changes.
- **Approach:**
  - `slopcamera scene review <scene.json> --camera <id> [--times-us <csv>]
    --allow-cloud-upload` — the flag is required and acknowledged exactly
    like scene analysis; without it the command fails closed.
  - Render ≤4 bounded beauty frames (reuse `planSpatialRender` partitions;
    cap dimensions ≤1024², PNG ≤4 MiB each) in a private workspace; compute
    per-frame sha256 before upload; the receipt lists exactly what bytes
    left the machine.
  - Prompt is a fixed bounded rubric (composition, framing, clipping,
    lighting plausibility, readable negatives) — caller cannot inject prompt
    text. Model resolved from the live catalog (image-language kind) with
    local validation; `maxRetries: 0`; one call total.
  - Output: strict-schema `SpatialReviewReport` — per-frame findings with
    severity + category + entity attribution when the model names one;
    `status: "model-generated-unverified"`; frame digests + model identity +
    attempt provenance recorded. Findings are advisory; nothing auto-applies.
  - `scene.review@1` operation; policy claims browser + gateway + cpu +
    local-io, no output-publication (report is the output), maxDuration
    bounded, `paidCall` policy matching the Gateway precedent.
- **Acceptance criteria:**
  - Without `--allow-cloud-upload` the command refuses before any render.
  - With a stubbed provider the report parses through its schema; frame
    digests in the receipt match the rendered bytes.
  - Model findings can never name entities absent from the scene (validate
    attributions against the entity set, demote unmatched to scene-level).
- **Validation:** stubbed-provider host tests + schema tests; live call is
  the user's manual gate (documented in plan, not run by the lane).

## Phase 6: Leftovers

- **Status:** Not started
- **Depends on:** none
- **Objective:** three small deferred items land together.
- **Scope:** `apps/desktop/html-overlay/spatial.ts` (splat proxy),
  `src/spatial-scene/audit-rendered.ts` (splat coverage semantics),
  `apps/desktop/contracts/spatial-world.ts` + `spatial-world-import.ts` +
  `spatial-world-metadata.ts` (retention + deeper fields),
  `src/spatial-scene/contracts.ts` (one metadata enum value).
- **Approach:**
  - **Splat object-ID proxies:** in `object-id` mode only, splats lower as
    their bounding-box proxy mesh writing their selection code — rendered
    audit reports `proxy-coverage` (approximate) rather than
    `unsupported-kind`. Beauty pass unchanged. If the proxy proves
    misleading, keep `unsupported-kind` and document why.
  - **Provider-metadata retention:** admit the `providerMetadata` artifact as
    a published content-addressed metadata asset — one additive enum value
    on the `metadata` interpretation union (the D2 sibling-facts pattern),
    preserving the raw provider bytes verbatim.
  - **Deeper World Labs fields:** extend `spatial-world-metadata.ts` to
    recognized nested shapes (e.g. `environment`, `capture` objects) still
    under the tolerant unknown-keys-ignored discipline; only add mappings
    whose semantics are actually documented.
- **Acceptance criteria:**
  - Splat entities report `proxy-coverage` in rendered audit (or documented
    `unsupported-kind` with rationale recorded in this plan).
  - Import with providerMetadata retains it as an asset + still emits
    `suggestedNormalization`; byte-for-byte same suggestion values.
- **Validation:** colocated tests for each item.

## Phase 7: Docs, skill, plan finalization

- **Status:** Not started
- **Depends on:** 1–6
- **Objective:** `scene-building.md` documents the solver, new contract
  fields, and `scene review`; SKILL.md routing covers them; this plan gets
  Result + Durable memory.
- **Validation:** `bun run check:skill`, `check:standalone`, kb
  percolate/refresh/check.

## Implementation log

- **Phase 1 (perf):** `createSpatialEvaluationContext` hoists parse + indexing
  (entity/camera maps, topological order, authored visibility, channel
  partition, base overrides, asset digests, scene digest); `InContext`
  variants for evaluate/audit/rendered-audit; `prepareCameraView` shares the
  camera inverse across a sample's corner projections. ~1.75× on
  512 entities × 8 samples (≈750 ms vs ≈1330 ms). Public signatures and
  output bytes unchanged; new `evaluate-context.test.ts` proves context vs
  standalone identity. Decision: the context is an exported optional seam —
  host callers with many samples build it once. `visible` is provably
  hoistable: the override/channel schemas write only
  color/opacity/transform/position/rotation/scale.
- **Phase 3 (solver):** `solveSpatialRelations` — goal→goal-target DAG,
  declared-order topological sort, `relation-cycle` names a concrete cycle,
  `bounds-unknown` names the entity. Relations compose `onTopOf`/`nextTo`/
  `facing`/`groundSnap`/`align`/`at` over per-entity state; `distribute`
  excluded (multi-mover, doesn't fit single-mover goal model). Patch ops are
  `set-transform` with `SPATIAL_SOLVE_PENDING_SCENE_SHA256` placeholder;
  `scene solve` CLI seeds bases from world-placed authored transforms +
  `spatialEntityLocalBounds` + `--asset-bounds`; generated/parented/
  view-placed/transform-animated goal entities reject `conflict`.
- **CI drift gate:** the SDK job rebuilds `dist/` and fails on any diff —
  `src/` changes require **both** `bun run build:sdk` (dist/code/index.js)
  *and* `bun run build:desktop:cli` (apps/desktop/dist/cli/main.js), then the
  identity-inventory rehash. The solver lane initially rebuilt only the
  desktop bundle and CI caught `dist/code/index.js` drift.
