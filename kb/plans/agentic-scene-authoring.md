---
type: plan
title: Agentic scene authoring and verification
description: Give coding agents a code-first path to author, generate, and verify Slopcamera spatial scenes — builders, asset admission, geometric audit, and the dormant generator contract — without changing the renderer or trust boundaries.
area: spatial-scenes
status: in-progress
repository_scopes:
  - src/spatial-scene
  - apps/desktop/cli
  - apps/desktop/application
  - skills/slopcamera/references
---

# Agentic scene authoring and verification

## Overview

Slopcamera's spatial-scene contract is a strong substrate — bounded deterministic
JSON, canonical SHA-256 identity, typed patches with optimistic concurrency,
calibrated cameras, and a `generators` record designed for retained procedural
output. What agents lack is everything state-of-the-art agentic world creation
says makes it work: **code that authors the scene** (fable51-worlds, SceneCraft,
SceneCode) and **facts that verify it** (camera-match QA, per-entity visibility).

Today agents hand-write scene JSON: `examples/studio/hybrid-scene.ts` hand-rolls
quaternion `lookAt` and bakes easing into 41 dense animation keys. `inspect`
bounds stop at primitives ("requires-asset-decoding" for GLB/splat). The
object-id/depth render passes produce pixels nothing analyzes. The `generators`
contract is unreachable — only qualification fixtures construct
`origin: generated` entities.

This plan adds a pure authoring layer, asset admission with persisted bounds, a
geometric audit command, scene diffing, and a trusted-module generator command —
all emitting or consuming the unchanged v1 contract. Renderer, patch semantics,
and trust boundaries are untouched.

## Constraints

- Portable layer stays effect-free: `src/spatial-scene/` parses and computes but
  never reads files, executes authored source, decodes media, or launches a
  renderer (per `src/spatial-scene/AGENTS.md`).
- Everything emitted must round-trip `parseSpatialScene` — builders emit plain
  `SpatialSceneV1` JSON; no contract fields are added in Phases 1–5.
- Trusted-code execution (Phase 5) follows the existing precedent: explicitly
  imported Bun modules are trusted current-user code, like `slopcamera.studio.run`
  and workflow modules. It is authoring-time only; render never reruns source.
- All new foreign input parses from `unknown` through bounded strict zod schemas.
- Validation gate: `bun run check` (or focused `bun test <file>` during
  development). Keep `dist/` rebuild policy per CONTRIBUTING.md.
- Each phase lands as reviewable, committable work on the integration branch.
- Deferred: `spatial-scene` schemaVersion 2 candidates (instancing, spot light,
  shadows, emissive, GLB normal/ORM/emissive maps), rendered-tier audit
  (object-id pass analysis), MCP scene tools, DFS constraint solver, World API
  generation. See "Deferred and open questions".

## Phases

| Phase | Name | Depends on | Parallelizable with |
| --- | --- | --- | --- |
| 1 | Scene builder helpers | — | 2, 3, 4, 5 |
| 2 | Scene asset admission with bounds | — | 1, 3, 4, 5 |
| 3 | Geometric scene audit | 2 (bounds; soft) | 1, 4, 5 |
| 4 | Scene diff command | — | 1, 2, 3, 5 |
| 5 | Generator execution + examples | 1 | — |
| 6 | Skill reference + docs | 1, 3, 5 | — |

All of Phases 1–5 were parallel-prototyped in isolated worktrees against
`main@df282a7` and integrated on branch `agentic-scene-authoring` (cherry-picks
`cabda0a` diff, `c8f1713` build, `04bbfa8` admit, `2cd76a1` audit, `f361450`
generate, plus test-narrowing fixup `64ea597`). Prototype lane branches remain
under `slopcamera-worktrees/proto-*` for reference.

## Phase 1: Scene builder helpers

- **Status:** Implemented (prototype `f02d2d8` → `c8f1713`)
- **Depends on:** none
- **Objective:** Agents author scenes through small pure helpers instead of
  hand-deriving quaternions, easing keys, and layout arithmetic.
- **Scope:** new `src/spatial-scene/build/` module (or flat
  `src/spatial-scene/build.ts` if it stays small); exports wired through
  `src/spatial-scene/index.ts` (hence `./code`); colocated tests.
- **Out of scope:** contracts.ts changes, renderer changes, CLI commands.
- **Approach:**
  - Helpers return plain data the caller feeds `parseSpatialScene` or a patch —
    never a mutable builder class holding hidden state.
  - Camera math: `perspectiveFromFov(fovDeg, width, height, near, far)` →
    projection; `lookAtPose(position, target)` → `SpatialPose`; `orbitRig`,
    `dollyRig`, `waypointFlythrough(waypoints, targets)` → `{position, rotation}`
    channel key arrays (slerp-interpolated rotation, linear position).
  - Easing: `easeKeys(property, keys, easing)` bakes cubic-bezier /
    smoothstep / linear-ease-out curves into bounded dense keys; enforce
    `keysPerChannel` limit and document the key-count policy the prototype
    settles (target ≤ 33 keys/segment).
  - Layout: `align`, `distribute`, `grid`, `row`, `column`, `stack` operating on
    entity transforms + bounds; `groundSnap(entityIds, floorY)`; seeded
    `scatter(seed, region, count)` using a checked-in deterministic RNG (no
    ambient randomness).
  - Placement relations resolved immediately to transforms: `onTopOf`,
    `nextTo`, `facing` — computed from authored bounds, not a solver.
  - Read `src/spatial-scene/math.ts` first (all primitives exist), then
    `authoring.ts` and `examples/studio/hybrid-scene.ts` for the pain points.
- **Acceptance criteria:**
  - `lookAtPose` orients −Z at target; property-tested against `projectPoint`
    (target projects to image center).
  - `easeKeys` output reproduces a smoothstep curve within tolerance; passes
    `parseSpatialScene` and evaluates at all times.
  - Layout ops are deterministic, seeded scatter is reproducible across runs.
  - `hybrid-scene.ts` rewritten with helpers drops its hand-rolled `lookAt`
    and dense-key baking while emitting an equivalent scene (test asserts).
- **Validation:** `bun test src/spatial-scene/build` (or colocated tests).

## Phase 2: Scene asset admission with bounds

- **Status:** Implemented (prototype `a4cb509` → `04bbfa8`)
- **Depends on:** none
- **Objective:** `slopcamera scene asset admit <file>` turns a local GLB into a
  verified manifest with computed bounds, closing the external-GLB → scene gap.
- **Scope:** `apps/desktop/cli/` (args, service), `apps/desktop/application/`
  (admission op), contracts touched only if the bounds-home decision requires
  it; colocated tests.
- **Out of scope:** network acquisition (Poly Haven remains studio-scoped),
  renderer changes, splat admission (world import already owns it).
- **Approach:**
  - Parse GLB through existing `parseSpatialGlb`; derive scene-space bounds from
    accessor min/max through node transforms (check whether `gltf.ts` already
    computes a model bounds — reuse if so).
  - **Open question D2 (prototype resolves):** where computed bounds persist.
    Options: (a) extend `interpretation.gltf` with a `bounds` field — schema
    change to `SpatialAssetInterpretationSchema`; (b) sibling `metadata` asset
    recording bounds — zero contract change, additive. Prefer (b) unless (a)
    proves trivially safe; record the decision in this plan.
  - Emit the manifest JSON + a ready `add-asset` patch fragment so agents can
    apply it in one step.
  - Follow `readExact`-style admission: verify bytes/sha256 at read time,
    publish beneath the generated artifact root, never overwrite.
- **Acceptance criteria:**
  - Admitting the qualification GLB yields a manifest that `scene inspect`
    reports with non-"unknown" bounds (or the metadata-asset equivalent).
  - Tampered bytes, symlinked paths, and out-of-profile GLBs reject with
    typed errors.
  - No change to `SpatialSceneV1Schema` beyond the decided bounds mechanism.
- **Validation:** focused tests + `scene asset admit` on a fixture GLB.

## Phase 3: Geometric scene audit

- **Status:** Implemented (prototype `a47ad88` → `2cd76a1`)
- **Depends on:** Phase 2 for decoded-asset bounds (geometric tier degrades to
  "unknown" bounds without it); parallelizable with 1, 4, 5.
- **Objective:** `slopcamera scene audit <scene> --camera <id>` reports
  per-entity spatial facts at sampled times without opening a browser.
- **Scope:** `apps/desktop/cli/` (args, service); may add a pure audit function
  in `src/spatial-scene/`; colocated tests.
- **Out of scope:** rendered audit (object-id pixel analysis — deferred),
  vision-model critique.
- **Approach:**
  - Sample `evaluateSpatialScene` at N times (request-bounded, e.g. ≤ 64).
  - Per entity per sample: world bounds (authored + admitted), frustum
    containment (project the 8 bounds corners via `projectPoint`), pixel
    footprint estimate, off-screen/behind-camera/clipped flags.
  - Scene-level: entity counts by kind, animation coverage vs durationUs,
    entities never visible in any sample, camera/entity collisions at samples.
  - Output: machine-readable JSON (findings with entityId + severity), honest
    "unknown" where bounds require decode Phase 2 hasn't supplied.
  - Pure core + thin CLI so the same report can back future MCP/workflow use.
- **Acceptance criteria:**
  - Audit of the starter scene flags nothing; audit of a deliberately
    off-camera entity reports it at the right samples.
  - Deterministic output; all bounds claims trace to authored or admitted data.
  - Runs without Chrome/GPU admission.
- **Validation:** focused tests + `scene audit` on starter and hybrid fixtures.

## Phase 4: Scene diff command

- **Status:** Implemented (prototype `e55dbc0` → `cabda0a`)
- **Depends on:** none
- **Objective:** `slopcamera scene diff <a> <b>` exposes the structural diff
  already computed inside `applySpatialScenePatch`.
- **Scope:** `apps/desktop/cli/` (args, service); may export the diff helper
  from `src/spatial-scene/patch.ts` (export, not logic change).
- **Approach:** reuse `diffCollection` logic; sort stable; include
  added/removed/changed per collection with changed property names.
- **Acceptance criteria:** diff of starter vs. starter-with-color-patch lists
  exactly `entities/entity_product` changed with `material`; identical scenes
  diff empty.
- **Validation:** focused tests.

## Phase 5: Generator execution + examples

- **Status:** Implemented (prototype `871ce9c` → `f361450`)
- **Depends on:** Phase 1 (examples use builders; interface informed by what
  generator code looks like with them).
- **Objective:** `slopcamera scene generate --module <path>` runs a trusted Bun
  module producing generated entities, retained under the existing `generators`
  contract.
- **Scope:** `apps/desktop/cli/` (args, service); `examples/` for generator
  modules; possibly a small pure wrapper in `src/spatial-scene/` for the
  `generate()` result shape.
- **Out of scope:** renderer changes (generated output is ordinary retained
  entities; render never reruns source), workflow-runtime integration, MCP.
- **Approach:**
  - **Open question D4 (prototype resolves):** module interface. Leaning:
    `export function generate(ctx: { seed: number; parameters: object }):
    { entities: unknown[]; editableKeys: {key,properties}[] }` — entities get
    `origin: {kind:"generated", generatorId, key}` stamped by the host, not the
    module. Validate output through `SpatialEntitySchema` + scene parse.
  - Host computes sourceSha256/closureSha256/parametersSha256/seed/outputSha256
    and writes `execution: {kind:"attempt", attemptId, runtimeSha256}`.
  - Key rule to enforce: module cannot set `origin`, `entityId` outside its
    `generator_<id>__<key>` namespace, or asset references outside declared
    inputs; `editableKeys` must reference produced keys.
  - Ship 2–3 example generators (`grid-city`, `turntable`, `panel-in-world`)
    that double as templates — `scene init --template` stays unneeded.
  - Trust/docs: command help states trusted-current-user execution, mirroring
    studio.run phrasing; no sandbox claims.
- **Acceptance criteria:**
  - Running an example generator yields a scene that parses, inspects with
    declared `editableControls` on generated parts, and renders.
  - `replace-generator-output` round-trips; stale patches reject.
  - Malformed module output (bad origin, foreign assetId, oversized entity
    list) rejects before scene publication.
- **Validation:** focused tests + end-to-end generate→inspect→render on an
  example.

## Phase 6: Skill reference + docs

- **Status:** Not started
- **Depends on:** 1, 3, 5 (documents the shipped surfaces).
- **Objective:** `skills/slopcamera/references/scene-building.md` teaches the
  allowlist and the create→audit→patch loop; `directed-scenes.md` and
  `docs/spatial-scenes.md` link it.
- **Approach:** short allowlist over API dump (paint-with-code finding);
  one worked generate→audit→patch example; generator module authoring guide;
  honest capability notes (what audit can and cannot see, splat aux-pass
  limits).
- **Acceptance criteria:** skill passes existing skill checks; commands in the
  doc are real and current.
- **Validation:** `bun run check` skill-related gates.

## Deferred and open questions

- **Deferred (needs schemaVersion 2, separate plan):** instanced entity kind
  (draw-call ceiling is the real wall for scatter scenes), spot light +
  shadow flags, emissive material, GLB normal/ORM/emissive maps. Decision gate:
  only fields P0/P1 usage proves unbakeable earn the version bump.
- **Deferred:** rendered-tier audit (object-id readback → per-entity
  visibility %, occlusion facts); vision critique via Gateway
  (`--allow-cloud-upload` pattern exists).
- **Deferred:** MCP scene tools — cheap pure-function exposure, but a second
  surface to maintain; revisit when an MCP-first host needs it.
- **Deferred:** World API generation — deliberately removed previously; the
  reachable improvement is `scene world import` consuming `semantics_metadata`
  (scale/ground) as suggested normalization. Consider separately.
- **Resolved by prototyping:**
  - **D1 — ease-bake key policy:** measured dense-sampled error over a 4s span;
    default `segments = clamp(ceil(durationUs / 166_667), 16, 64)` ≈ 6
    segments/second → 25 keys on 4s at 0.128% max parameter error (~8× under the
    1% bar, ~1.85 KB/channel). 16 keys also passes (0.32%) but with only ~3×
    margin; 25 chosen. See `src/spatial-scene/build.ts` header comment.
  - **D2 — bounds persistence:** sibling `slopcamera.spatial-asset-facts`
    metadata asset (option b). `SpatialAssetInterpretationSchema` is a strict
    discriminated union — any field there changes manifest identity and makes
    old parsers reject previously written manifests. The facts doc is
    content-addressed, depends on the subject manifest, and records
    `subjectManifestSha256`; one additive `metadata` enum value is the only
    contract change. Cost: old readers reject scenes referencing the new enum
    value — accepted, package versions ship together.
  - **D4 — generator module interface:** modules export
    `generate(ctx: {seed, parameters, lib: {entityId(key)}})` returning
    `{entities, editableKeys?}`; entities carry only a caller `key`, never
    `entityId`/`origin`. The host stamps `origin: generated` + derived
    `generator_<id>__<key>` IDs, hashes the single-file module
    (`closureSha256 == sourceSha256` in v1), defaults seed from the source
    digest, bounds parameters (64 KiB / depth 16 / 8,192 values), and stages the
    module content-addressed before import so reruns never read stale source.
    Asset references and non-`import type` imports reject in v1. Regeneration
    refuses to orphan overrides/animations. Execution is authoring-time only —
    no render/evaluate path runs module code.
  - **D5 — audit surface:** new `scene audit` verb + `scene.audit@1`
    operation, not an `inspect` extension. Inspect is a snapshot-at-t0 contract
    with a closed output schema; audit is a sampled temporal artifact.
    Registering it as an operation (same exposure as `scene.evaluate`) makes it
    graph-addressable — deliberate, worth reviewer awareness that
    `OPERATION_KINDS` grew by one.

## Implementation log

- 2026-09-16 — Plan authored from architecture assessment + SOTA review
  (fable51-worlds, SceneCraft, SceneCode, Holodeck 2.0, 3DHarnessBench, World
  API, asset-ladder economics, paint-with-code allowlist finding). Adversarial
  review cut: scene DSL (→ emit-only builders), full constraint solver (→
  immediate-relation ops), v2 contract items (8 → 3 + 2 candidates), World API
  provider (→ metadata-consumption enhancement), MCP tools (deferred).
- 2026-09-16 — Five parallel prototype lanes landed and integrated onto
  `agentic-scene-authoring`; all four open decisions (D1/D2/D4/D5) resolved with
  running code (see "Resolved by prototyping"). Integration findings:
  - `SpatialSceneCommand` needed `path` moved per-variant because `generate`
    has no positional scene path — the only structural merge conflict.
  - Cross-lane schema friction found by prototype tests: quaternion components
    can normalize to `1.0000000000000002` (clamped in `unitQuaternion`);
    `from + (to−from)·ease(1)` is not bit-exact (endpoints emit verbatim);
    orbit loop closure needed angle mod 2π for bit-exact wrap.
  - One test needed union narrowing via `toMatchObject` instead of direct
    `.geometry` access (`64ea597`).
- Follow-ups recorded for later phases: `scene.audit` consumers should accept
  the `spatial-asset-facts` doc as `--asset-bounds` input (audit already
  accepts the shape; admit emits it — the decode path that joins them is the
  remaining seam); generator multi-file closure should reuse the source-bundle
  machinery; audit currently re-parses the scene per sample (bounded 64×);
  `apps/desktop/dist/cli` rebuild lands with `check:desktop`.
