---
type: plan
title: Cinematic character worlds — rigging, direction, construction, effects, and realistic rendering
description: Give agents a bounded, reproducible path to construct detailed 3D worlds, direct rigged character performances and cinematic sequences, apply realistic materials and effects, and verify finished videos.
area: spatial-scenes
status: in-progress
repository_scopes:
  - src/spatial-scene
  - apps/desktop/contracts
  - apps/desktop/core
  - apps/desktop/application
  - apps/desktop/html-overlay
  - apps/desktop/cli
  - apps/desktop/studio
  - skills/slopcamera
  - docs
---

# Cinematic character worlds

## Outcome

An agent can admit or construct a detailed 3D world, admit a bounded rigged GLB, direct character motion and interaction through semantic controls, design cinematic camera coverage, assemble shots with transitions, add realistic PBR materials and bounded effects, render an animatic and final sequence, and inspect deterministic audits plus rendered review evidence before explicitly promoting a result.

The system remains local-first, content-addressed, reproducible, resource-bounded, and closed to arbitrary runtime code. Existing static spatial scenes and project renders remain compatible.

## Context

The completed [[plans/agentic-scene-authoring]] and [[plans/agentic-scene-authoring-phase-2]] plans established strict spatial-scene contracts, deterministic evaluation, asset admission, geometric and rendered audits, and retained generation. [[plans/rendered-review-galleries]] added applied-material, environment, and whole-scene visual review. The active [[plans/agentic-scene-authoring-phase-3]] plan owns relation solving, contract-v1 lighting/material extensions, performance work, MCP tools, and vision critique; this plan consumes those results and must not duplicate or silently fork them.

Parallel architecture spikes established four implementation boundaries:

- Rigged characters extend the closed GLB parser and prepared-asset pipeline; no general `GLTFLoader` or renderer-time IK is introduced.
- Performance, simulation, and secondary motion are deterministically baked to content-addressed clips/channels before ordinary rendering.
- Cinematic sequencing is a content-addressed sidecar over existing spatial shots and project render plans, preserving old render identity when absent.
- PBR, particles, atmosphere, and post-processing are closed declarative data lowered only in the desktop renderer; diagnostic passes remain unprocessed.

## Constraints

- Bun 1.3.14 and the repository `AGENTS.md` gates are authoritative. Every integration candidate must pass focused tests, independent review, generated bundle verification, `bun run check`, and fresh current-head `Required` CI.
- Work executes in dedicated worktrees from `origin/main`; the user-owned modification in `apps/desktop/cli/html-scene.ts` in the primary checkout is never touched.
- Public contracts parse foreign input from `unknown`, use strict bounded schemas, canonical microseconds, deterministic ordering, and content digests. Existing v1 scenes parse unchanged.
- Portable `src/spatial-scene` code remains effect-free. Filesystem, browser, GPU, FFmpeg, Gateway, and native execution stay in desktop host layers.
- No arbitrary shaders, open operation registration, caller-selected remote URLs, runtime package installation, or unretained native output.
- GLB support remains a deliberately closed profile. Unsupported extensions, sparse accessors, unbounded joints/targets, and ambiguous animation interpolation reject before rendering.
- IK, retargeting, physics, cloth, and complex geometry operations compile or bake into retained artifacts. Final frame evaluation does not run an unconstrained solver.
- Beauty post-processing never changes object-ID, depth, motion-vector, or diagnostic evidence.
- Provider and vision calls remain explicit paid/cloud operations with byte digests and opt-in upload acknowledgement. Artifact admission does not claim live qualification without live evidence.
- Parallel workers own disjoint worktrees and file scopes. Shared convergence files (`contracts.ts`, exports, CLI routing, generated `dist`, identity inventory, docs, and this plan) have one integration owner.
- Each phase ends in a reviewable commit/PR. Dependent work stacks on the last required foundation; no force-pushes or history rewrites.

## Phases

| Phase | Deliverable | Depends on | Parallelizable with |
| --- | --- | --- | --- |
| 0 | Reconcile active scene phase 3 | — | — |
| 1 | Rigged GLB admission and character contract | 0 | 3, 4 |
| 2 | Character performance compiler and audits | 1 | 5, 6 after their prerequisites |
| 3 | Cinematic camera rigs and lens model | 0 | 1, 4 |
| 4 | PBR materials, atmosphere, and lighting rigs | 0 | 1, 3 |
| 5 | Shot sequences, transitions, and animatics | 3 | 2, 6 |
| 6 | Geometry construction grammar and asset preparation | 0 | 2, 5 |
| 7 | Particles, post-processing, and deterministic simulation bakes | 4, 6 | — |
| 8 | Agent direction, galleries, temporal review, and MCP/CLI integration | 2, 5, 7 | — |
| 9 | Qualifications, documentation, final review, and delivery | 1–8 | — |

## Phase 0: Reconcile active scene phase 3

- **Status:** Done
- **Depends on:** none
- **Objective:** Establish one current `main` foundation containing or explicitly superseding every prerequisite already owned by `agentic-scene-authoring-phase-3`.
- **Scope:** `kb/plans/agentic-scene-authoring-phase-3.md`, its open PR/worktrees, and integration-only conflict resolution.
- **Out of scope:** reimplementing finished phase-3 work in this plan.
- **Approach:**
  - Inventory open PRs and local phase-3 branches. Verify which of performance, MCP tools, relation solver, contract extensions, vision critique, and leftovers are merged, merge-ready, stale, or blocked.
  - Land valid current-head PRs serially. For unmerged local branches, review against their phase acceptance criteria before publication.
  - Record any deliberately deferred item as an explicit dependency in the relevant later phase here.
- **Acceptance criteria:**
  - The active phase-3 plan truthfully records every phase status and current commit/PR.
  - This plan names no duplicate owner for already implemented behavior.
  - `origin/main` passes `Required` after the reconciliation commits.
- **Validation:** plan-specific focused tests, then hosted current-head CI for each merged prerequisite.

## Phase 1: Rigged GLB admission and character contract

- **Status:** Done
- **Depends on:** Phase 0
- **Objective:** Admit, inspect, evaluate, and render bounded skinned meshes, skeletons, clips, and morph targets without weakening the closed GLB profile.
- **Scope:** `src/spatial-scene/gltf.ts`, `contracts.ts`, `identity.ts`, `evaluate.ts`, `audit.ts`; desktop spatial asset facts/preparation and Three.js spatial lowering; colocated tests.
- **Out of scope:** semantic performance planning, runtime physics, arbitrary glTF extensions, `GLTFLoader`.
- **Approach:**
  - Add a new explicit rigged-GLB profile supporting `JOINTS_0`, `WEIGHTS_0`, inverse-bind matrices, bounded skins, named morph targets, and LINEAR/STEP clips. Retain the existing static profile unchanged.
  - Bound joints, influences, clips, targets, accessor bytes, and total prepared matrices. Reject invalid weights, missing joints, CUBICSPLINE, sparse accessors, and unsupported required extensions.
  - Add additive `character`/`skinned-mesh` scene data, clip bindings, morph weights, and bone attachment placement. Add a strict humanoid mapping metadata document with canonical bone names and source offsets.
  - Extend asset facts with skeleton, joint, morph, clip, and mapping facts. Bind every prepared primitive to exact source bytes and profile.
  - Lower beauty and diagnostic passes through `THREE.SkinnedMesh`; prove object-ID/depth use the same deformed geometry.
- **Acceptance criteria:**
  - A fixture rigged GLB admits, reports exact rig facts, samples a clip deterministically, renders a skinned pose, and supports a prop attached to a named bone.
  - A fixture morph target changes evaluated and rendered geometry.
  - Invalid or oversized rigs reject before browser admission.
  - Existing static GLB fixtures and scene digests remain unchanged.
- **Validation:** focused GLB/evaluation/audit/asset-preparation/renderer tests; SDK and desktop typecheck/lint; browser qualification for one checked-in rig fixture.

## Phase 2: Character performance compiler and audits

- **Status:** In progress
- **Depends on:** Phase 1
- **Objective:** Compile semantic character direction into deterministic clips, blends, IK targets, gaze, expressions, locomotion, and prop events, with objective performance audits.
- **Scope:** new portable character-performance modules and schemas; retained native bake adapter where needed; character audit modules; CLI surfaces and tests.
- **Out of scope:** free-form renderer-time solvers, autonomous promotion, uncached ML motion generation.
- **Approach:**
  - Define bounded directives for clip sequence/trim/loop/time-scale, crossfade, additive layers, body masks, root motion, trajectory warping, look-at, two-bone IK, foot planting, morph expression, attach/release, and secondary spring motion.
  - Compile directives to ordinary scene animation plus a content-addressed performance receipt. Pure deterministic operations stay portable; native retarget/IK emits a pinned retained clip before use.
  - Normalize Mixamo/VRM/custom humanoid mappings through explicit metadata, never name guessing after admission.
  - Add audits for joint limits, foot slide, ground penetration, gaze error, hand/prop drift, clip discontinuity, and character-character/camera collision.
  - Add performance-take galleries using orbit/contact frames and short bounded animatics; selection remains an explicit patch.
- **Acceptance criteria:**
  - A character can walk a planned path, look at a target, reach for and carry a prop, change expression, and transition clips without transform discontinuity.
  - Same scene, rig, directives, solver identity, and seed produce byte-identical compiled channels and receipts.
  - Audit fixtures detect planted-foot slide, gaze miss, joint violation, and attachment drift with entity/bone/time attribution.
  - Missing semantic bones or stale source digests fail before a bake starts.
- **Validation:** portable property tests, host fake-adapter tests, one retained native qualification if the pinned runtime is available, and focused gallery/render tests.

## Phase 3: Cinematic camera rigs and lens model

- **Status:** In progress
- **Depends on:** Phase 0
- **Objective:** Let agents author cinematography as semantic rigs and framing goals rather than raw transform keys.
- **Scope:** spatial camera contract/evaluation/builders, new camera-rig module, spatial render request/lowering, tests.
- **Out of scope:** editorial sequence assembly and FFmpeg transitions.
- **Approach:**
  - Add optional focal length/sensor or equivalent FOV identity, aperture, focus distance, shutter angle, exposure, and color temperature while preserving old projection behavior when absent.
  - Add deterministic dolly, crane, orbit, rail, handheld, chase, tripod, and target-tracking rigs compiled to camera tracks.
  - Add framing goals for close-up, medium, wide, two-shot, over-shoulder, screen-space target, headroom, and rule-of-thirds, solved against known bounds with typed failure when bounds are unavailable.
  - Add layered bounded camera shake and spline easing; no random source without an authored seed.
  - Add camera audits for clipping, collision, acceleration, framing deviation, focus-target error, and excessive angular velocity.
- **Acceptance criteria:**
  - A semantic push-in plus rack-focus request compiles to deterministic camera/lens tracks and renders without changing legacy cameras.
  - Framing goals meet declared screen-space tolerances on fixtures or return a typed unsatisfied report.
  - Camera audit fixtures detect collision, clipped subjects, focus miss, and acceleration spikes.
- **Validation:** camera-track/property tests, evaluation tests, spatial render tests, and beauty-frame qualification.

## Phase 4: PBR materials, atmosphere, and lighting rigs

- **Status:** In progress
- **Depends on:** Phase 0
- **Objective:** Render realistic authored and admitted objects with complete bounded PBR maps, atmospheric depth, shadows, and reusable cinematic lighting rigs.
- **Scope:** spatial material/environment/light contracts, GLB material admission, asset preparation, renderer lowering, material galleries, tests.
- **Out of scope:** arbitrary shader source, runtime-downloaded shader packages, volumetric simulation.
- **Approach:**
  - Build on phase-3 emissive/spot/shadow work. Add base-color, normal, ORM or separate roughness/metalness/AO, emissive, height/displacement, clearcoat, transmission, sheen, anisotropy, IOR, UV transform, and explicit color-space/channel semantics as a closed union.
  - Extend the GLB profile only for reviewed core material fields; preserve byte and decoded-pixel budgets and emit complete material facts.
  - Add deterministic local derivation candidates for normal/roughness/height with provenance and no claim that derived maps equal authored scans.
  - Add linear/height fog and reusable typed lighting rigs such as portrait, product, moonlight, golden-hour, neon-noir, interior-window, and volumetric-stage approximations.
  - Extend material probe galleries to compare the same candidate on plane/sphere/hero geometry under multiple fixed lights.
- **Acceptance criteria:**
  - A checked-in hero-object fixture renders base, normal, roughness, metalness/AO, emissive, clearcoat/transmission, shadows, and environment lighting with correct map color spaces.
  - Missing assets, mismatched dimensions, unsupported channels, or decoded-pixel overflow reject before rendering.
  - Legacy `unlit` and `standard` materials render unchanged.
- **Validation:** material/GLB/property tests, asset-preparation tests, renderer tests, tiled/probe gallery tests, and fixed beauty qualification images.

## Phase 5: Shot sequences, transitions, and animatics

- **Status:** Not started
- **Depends on:** Phase 3
- **Objective:** Assemble spatial shots into content-addressed cinematic sequences with bounded transitions, audio/action synchronization, animatics, and continuity evidence.
- **Scope:** new desktop cinema contracts/core compiler, project render-plan sidecar integration, FFmpeg invocation builder, CLI, tests.
- **Out of scope:** mutating existing project edit-plan identity when no cinema sidecar is supplied; generative video transitions.
- **Approach:**
  - Define a `slopcamera.project-cinema-plan` sidecar bound to project structure/edit digests. It owns shot order, handles, markers, dramatic beats, transitions, looks, and audio cues.
  - Compile cut, dissolve, wipe, dip-to-color, whip-pan, light-flash, spatial/depth transition, and constrained match-cut intents into deterministic existing render/FFmpeg operations. Unsupported perceptual match requests produce advisory evidence rather than invented precision.
  - Build low-resolution animatics from rendered scene frames or retained placeholders before final rendering.
  - Add continuity audits for screen direction, 180-degree rule, eyeline, exposure/focus continuity, jump cuts, and match-on-action timing.
- **Acceptance criteria:**
  - A multi-shot fixture compiles and renders cuts plus at least three timed transitions with exact output duration and synchronized audio.
  - Absence of a cinema sidecar preserves current project render-plan identity and output behavior.
  - Stale sidecars reject on project digest mismatch; filter arguments never pass through a shell.
  - Continuity fixtures produce deterministic findings with shot/time evidence.
- **Validation:** contracts/core property tests, FFmpeg invocation tests, project operation tests, and one local animatic render qualification.

## Phase 6: Geometry construction grammar and asset preparation

- **Status:** Not started
- **Depends on:** Phase 0
- **Objective:** Construct editable detailed objects and architecture from bounded parametric intent, with retained mesh/UV/LOD/collision artifacts for heavy operations.
- **Scope:** new portable geometry/parametric modules, generator contracts/runtime, desktop preparation/native adapters, asset facts/audits, tests.
- **Out of scope:** arbitrary CAD scripts in portable scenes, recursive unbounded CSG, runtime dependency installation.
- **Approach:**
  - Add bounded primitives and modifiers: profile extrusion, revolve/lathe, sweep, bevel, inset, mirror, array, limited boolean, UV projection, and material slots. Cap graph nodes, depth, vertices, triangles, and output bytes before execution.
  - Add parametric architecture generators for walls, floors, stairs, arches, columns, windows, roofs, pipes/cables, trims, and modular scatter with exclusion masks.
  - Keep analytical bounds/UVs and DAG validation portable. Route mesh repair, complex CSG, UV atlas, decimation, convex decomposition, and GLB emission through a pinned retained Studio adapter.
  - Retain LOD and collision facts; renderer selection is deterministic and audits report which LOD/proxy was used.
  - Preserve semantic generator parameters and stable generated keys so edits remain `width`, `archCount`, or `bevelRadius`, not anonymous mesh replacement.
- **Acceptance criteria:**
  - Fixtures construct a parametric room, stair, arch array, product-like revolved object, and seeded scatter with stable identities and correct conservative bounds.
  - Cycles, invalid profiles, triangle-budget overflow, and native output mismatch reject without publication.
  - Re-running identical inputs reuses or reproduces byte-identical retained artifacts and receipts.
- **Validation:** geometry/property tests, generator/patch tests, fake native-adapter tests, asset-admission tests, and rendered fixture qualification.

## Phase 7: Particles, post-processing, and deterministic simulation bakes

- **Status:** Not started
- **Depends on:** Phases 4 and 6
- **Objective:** Add impressive but bounded particles, atmosphere, finishing passes, rigid-body motion, and secondary-motion bakes while preserving deterministic evidence passes.
- **Scope:** effect/simulation contracts, render quality request, locked Three.js post-processing modules, renderer lowering, retained Studio bake adapter, tests.
- **Out of scope:** caller-authored GLSL, network shader catalogs, nondeterministic live physics, post-processing diagnostic passes.
- **Approach:**
  - Add seeded point/volume/surface/spline emitters, bounded forces, size/color/opacity curves, sprite or instanced-mesh particles, collision/kill volumes, and preview/final count tiers.
  - Add beauty-only bloom, depth of field, motion blur approximation, tone mapping/exposure, vignette, chromatic aberration, film grain, flare, and bounded LUT grading through exact locked local modules or reviewed in-repo shaders.
  - Add deterministic fixed-step rigid-body/constraint bake plans. Route cloth, rope, and complex secondary motion through pinned native Studio profiles; retain cache, engine identity, seed, time step, and source digests.
  - Add motion-vector or equivalent bounded evidence needed for temporal effects and audits.
  - Extend resource planning for render targets, texture pixels, particles, simulation steps, and output bytes before browser/native admission.
- **Acceptance criteria:**
  - Seeded rain/embers/dust fixtures render byte-stable prepared inputs and remain within declared budgets.
  - Beauty renders can enable finishing passes while object-ID/depth outputs remain byte-identical to the same scene without post-processing.
  - A rigid-body fixture bakes to deterministic ordinary animation; stale or mismatched caches reject.
  - Preview and final quality plans truthfully report differing costs and never silently exceed host claims.
- **Validation:** parser/property tests, renderer-lowering tests, host-resource plan tests, fake and available-native bake tests, plus browser beauty/AOV qualification.

## Phase 8: Agent direction, galleries, temporal review, and integration

- **Status:** Not started
- **Depends on:** Phases 2, 5, and 7
- **Objective:** Expose the complete workflow as ergonomic typed agent tools that propose, render, audit, compare, and explicitly promote cinematic takes.
- **Scope:** scene/cinema planners, CLI and MCP pure tools, galleries, temporal review/audits, operation routing, skill/docs tests.
- **Out of scope:** automatic source replacement, hidden paid calls, unconstrained natural-language execution.
- **Approach:**
  - Add strict direction documents for dramatic beats, character actions, camera coverage, lighting/effects intent, and sequence structure. A deterministic planner emits inspectable scene/cinema patches; any model-assisted proposal is marked unverified and never auto-applied.
  - Add CLI workflows to inspect rigs/clips/material facts, compile performances/cameras, construct worlds, plan sequences, bake effects, render animatics/finals, and run audits.
  - Add read-only MCP tools for pure inspect/plan/check/audit operations; host-bound render/bake/provider work stays CLI unless an existing closed bridge applies.
  - Extend rendered galleries to character takes, lighting rigs, camera coverage, materials, effects, and whole sequences. Add bounded video contact sheets or short preview reels with per-take source/render provenance.
  - Add temporal review for flicker, clip/cut discontinuity, foot sliding, camera acceleration, exposure jumps, and effect budget spikes; optional vision critique remains advisory and cloud-explicit.
- **Acceptance criteria:**
  - From checked-in fixtures, one documented command flow constructs a world, admits a character, compiles a performance and camera sequence, renders an animatic, audits it, compares variants, and explicitly promotes a selected take.
  - Every tool rejects escaped paths, oversized inputs, stale digests, and unsupported capabilities before paid/native/browser work.
  - Receipts distinguish authored source, generated candidate, baked artifact, rendered evidence, audit, selection, and final output.
- **Validation:** focused CLI/MCP/workflow tests, six-variant bounded concurrency tests, failure-retention tests, package smoke, and one credential-free fixture end-to-end run.

## Phase 9: Qualifications, documentation, final review, and delivery

- **Status:** Not started
- **Depends on:** Phases 1–8
- **Objective:** Prove the integrated system, document honest operating boundaries, and deliver it through protected current-head PRs.
- **Scope:** qualification fixtures, docs, public skill, plan finalization, generated bundles/inventory, full review and CI.
- **Out of scope:** claiming provider/native/GPU qualification not actually run.
- **Approach:**
  - Add checked-in small redistributable fixtures for static PBR, rigged character, morph expression, parametric room, particles, physics cache, and multi-shot cinema plan.
  - Run separate beauty, diagnostic, temporal, package, standalone, and deterministic-rebuild qualifications. Keep hardware/browser/native tests outside ordinary unit lanes where repository policy requires.
  - Update Diátaxis docs and the Slopcamera skill with construction, rig inspection, performance direction, cinematography, effects, auditing, variant review, promotion, and recovery workflows.
  - Run independent phase review after each deliverable and a final whole-feature review across contract, renderer, editor, and provenance boundaries.
  - Rebuild `dist/` and desktop CLI from a clean task worktree, refresh the legacy identity inventory, and verify byte-identical committed outputs.
- **Acceptance criteria:**
  - Focused and complete local gates pass; fresh exact-head `Required` CI passes on every merge candidate.
  - No unresolved review thread remains and no generated bundle drift exists.
  - Documentation distinguishes fixture qualification, hardware qualification, native-runtime qualification, and live-provider qualification.
  - This plan ends `completed` with Result, Durable memory, exact validation evidence, commits, PRs, and remaining explicit limits.
- **Validation:** `bun run check`, `bun run kb:check`, relevant browser/native qualification commands, package smoke, current-head CI, and post-merge `main` CI.

## Verification

- Backward compatibility → existing scene/project fixtures retain canonical parse/evaluation/render identity when new optional data is absent.
- Determinism → property tests compare canonical bytes across repeated compile, bake-plan, gallery, and render-plan generation.
- Bounds → adversarial parser tests prove limits settle before browser, native, network, or paid-resource admission.
- Visual correctness → checked-in fixture qualifications cover beauty and unprocessed object-ID/depth/motion evidence.
- Provenance → receipts bind every admitted asset, mapping, directive, solver/runtime, bake, rendered frame, audit, selection, and final output by digest.
- Agent ergonomics → one credential-free fixture workflow exercises construction through explicit promotion without direct JSON arithmetic for bones or cameras.

## Risks and recovery

- Contract breadth creates integration risk → land additive foundations first, one reviewed PR per phase, and preserve old unions/paths until new fixtures pass.
- Rig/AOV deformation mismatch → require beauty and diagnostic silhouette comparison before enabling rigged assets in final workflows.
- Native solver drift → pin runtime and dependency closure, bind receipts, publish no output on mismatch, and retain the last admitted artifact.
- GPU memory growth → pre-plan render targets/textures/particles by quality tier and reject before browser admission.
- Poor generated or derived assets → retain candidates and review evidence separately; promotion is explicit and reversible through scene/project revisions.
- Concurrent branch drift → merge `origin/main` forward without rebasing, regenerate convergence files only in integration worktrees, and rerun exact-head CI.

## Implementation log

- 2026-09-17 — Parallel read-only spikes mapped character rigging, cinematic direction, PBR/effects, and parametric construction/physics. The plan adopted closed additive contracts, deterministic baked solvers, content-addressed cinema sidecars, and beauty-only post-processing. No implementation files changed during the spikes.
- 2026-09-17 — Phase 0 reconciliation: merged #145 (MCP scene tools, `aadae121`), #147 (bounded consented vision critique, `7022bb51`), #134 (relation solver, `48d4536f`), #146 (contract-v1 extensions, `f7206a15`), and #144 (splat ID proxies/provider metadata/leftovers, `44048552`); closed no-diff perf bookmark #143. Every exact-head product lane and `Required` passed. Merge-forwards resolved generated-bundle conflicts by regeneration and preserved both splat proxy coverage and contract-v2 instance evidence. The work found and fixed a recurring inventory failure class where `--update-legacy-identity-inventory` skips freshly built chunks that are not yet git-tracked: stage generated chunks, update inventory, stage inventory, then verify.
- 2026-09-17 — Phase 1 completed and merged through PR #150 at `3aecd81`. The phase adds an explicit bounded rigged-GLB profile; skin, inverse-bind, morph and clip parsing; deterministic morph-then-skin evaluation; exact rig admission facts; a strict canonical humanoid mapping and named attachment contract; and prepared-geometry binding shared by beauty, object-ID and axial-depth passes. CPU-baked mesh-local deformation intentionally replaces the planned live `THREE.SkinnedMesh` lowering so every pass consumes byte-identical deformed geometry and no browser-side rig state exists. Two independent reviews found and fixed strict-facts rejection, orphan skin attributes, duplicate joints, inconsistent weights, morph topology, matrix-space double transforms, static normal-space drift, accessor validation and unreachable/skeleton-root hierarchy gaps. Validation: 81 focused tests, SDK and desktop typechecks, focused ESLint, 455 SDK tests, 1,748 desktop tests with 25 expected skips, rebuilt SDK/desktop bundles, standalone and packed-consumer verification, then fully green exact-head CI including `Required`.
- 2026-09-17 — Phase 2 implementation and review produced a deterministic compiler/audit core, but review correctly kept the phase open for real analytic two-bone IK, additive/body-mask layers, gallery planning, and retained-native adapter contracts. Phase 3 camera rigs passed independent math review and were published as PR #151 (`225b898`, merge-forward `425fe8e`); exact-head CI is pending. Phase 4 materials/atmosphere implementation started independently from merged Phase 1.
