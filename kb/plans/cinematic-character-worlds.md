---
type: plan
title: Cinematic character worlds — rigging, direction, construction, effects, and realistic rendering
description: Give agents a bounded, reproducible path to construct detailed 3D worlds, direct rigged character performances and cinematic sequences, apply realistic materials and effects, and verify finished videos.
area: spatial-scenes
status: completed
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

- **Status:** Done
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

- **Status:** Done
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

- **Status:** Done
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

- **Status:** Merged (PR #155, `78bcb9a`)
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

- **Status:** Merged (PR #156, `63acd80`)
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

- **Status:** Partial — contract foundation merged (PR #157, `18f3abf`); runtime completion moved to Phase 11
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

- **Status:** Partial — direction schema merged (PR #159, `e8561d3`); product completion moved to Phases 12–13
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

- **Status:** Partial — first guide merged (PR #160, `b5a5f47`); qualification and public-surface completion moved to Phases 14–15
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

## Completion audit and extension architecture

The 2026-09-19 merge audit distinguishes merged commits from completed product behavior:

- Phase 7 currently exports `SpatialRenderPlan`, `SpatialParticleSystem`, `SpatialSimulationPlan`, and `SpatialMotionEvidence`. The desktop render request, resource plan, HTML/Three lowering, retained native bake path, receipts, and browser qualifications do not consume them. Chromatic aberration and flare are absent. Several cross-field laws are incomplete: particle lifetimes and curves are not ordered, spline points incorrectly reject negative coordinates, simulation bodies are not unique, and cache receipts cannot be reconciled.
- Phase 8 currently exports only `SpatialDirection`. It does not compile direction into performance/camera/cinema/effect plans, and it lacks strict time validation for actions, coverage, and looks. There are no corresponding CLI commands, operation definitions, MCP tools, sequence galleries, temporal audits, or integrated workflow.
- Phase 9 currently adds one repository how-to file. It is not registered in the public website documentation, and some example commands do not match the installed CLI. No cinematic fixture bundle, complete qualification, README/skill update, public-site story, or final cross-feature review has occurred.

Two external designs inform the extension boundary:

- [GhostGet](https://ghostget.com/) demonstrates a strong local agent contract: each request selects one named, versioned action; capability discovery is authoritative; transport, risk, and account/runtime identity are bound before dispatch; contract drift fails closed; and uncertain mutations are not retried blindly. Slopcamera adopts those principles for media capabilities, resource admission, receipts, and discovery.
- [pi.dev extensions](https://pi.dev/docs/latest/extensions) demonstrate excellent agent ergonomics: typed tools, lifecycle hooks, commands, UI, session state, explicit project trust, and packageable examples. Pi also states that extensions execute with full user permissions. Slopcamera therefore does not copy its hot-loaded operation registration into the portable or complete host; trusted TypeScript remains an explicit authoring surface, while production capabilities remain reviewed and statically assembled.

The resulting four extension tiers are deliberate:

1. **Declarative composition.** Users and agents compose the fixed operation catalog through graphs, built-in workflows, direction documents, patches, galleries, and recipes. These values are strict, bounded, inert, content-addressed, and capability-checked before effects.
2. **Trusted authoring modules.** Explicitly selected Bun workflows and spatial generator closures may run as the current user. Their complete source closure is retained and hash-bound. They never register a new host operation, widen a renderer profile, or smuggle credentials/authority into serialized input.
3. **Reviewed capability modules.** New host powers enter through a source-owned module descriptor that binds operation definitions, policy, schemas, resource claims, receipts, optional CLI/MCP projections, docs, and qualification status. The production catalog imports an explicit static list; there is no directory scan or ambient plugin discovery.
4. **Native adapters.** Blender, CadQuery, Manim, and future native engines remain separately installed, pinned profiles behind retained request/receipt reconciliation and invocation-scoped trusted-current-user authorization.

A canonical capability manifest will project the reviewed static catalog to CLI/SDK/Agent Skill consumers. It reports exact IDs and versions, effect/resume classes, resource claims, interface exposure, runtime requirements, and qualification status. CLI, MCP, docs, and site copy consume or test against that manifest instead of maintaining unverified parallel capability lists.

## Phase 10: Contract hardening and capability-module foundation

- **Status:** Completed — merged through PR #164 at `2c1b88d` with all exact-head checks including `Required` green
- **Depends on:** Phases 0–9 merged foundations
- **Objective:** Repair the incomplete cinematic contracts and establish one static, discoverable extension architecture without opening runtime registration.
- **Scope:** strict contract laws, module/manifest contracts, static catalog projection, portable discovery, tests and architecture documentation.
- **Approach:**
  - Harden render/effect, particle, simulation, motion-evidence, and direction documents with unique IDs, ordered clocks/curves, reference closure, safe integer and byte limits, canonical digests, and structured error codes.
  - Introduce a frozen `SlopcameraCapabilityModule` descriptor and manifest compiler. A module can describe only statically imported operation/workflow/tool/profile identities; registry assembly remains explicit and exhaustive.
  - Project portable and complete-host manifests from the same source descriptors, including interface exposure and truthful qualification states (`unit`, `fixture`, `browser`, `native`, `provider`).
  - Add a pure CLI-facing manifest command and SDK export. Do not dynamically load packages or workspace source.
- **Acceptance criteria:** invalid cross-field/reference states reject before host work; manifest bytes are deterministic; duplicate IDs/versions/exposures reject; every registered production operation has exactly one manifest owner; adding a test-only module requires no central switch beyond the explicit catalog list.
- **Validation:** parser/property tests, registry parity tests, SDK typecheck/lint/build, standalone and package smoke.

## Phase 11: Executable effects, particles, simulation bakes, and diagnostic evidence

- **Status:** In progress — executable-effects vertical slice merged through PR #165 at `29fab10` with all checks including `Required` green; native secondary-motion adapter and browser/native live qualification remain open (Phase 15 scope)
- **Depends on:** Phase 10
- **Objective:** Complete Phase 7 from authored contracts through admitted resources, deterministic lowering, retained receipts, and honest qualification.
- **Scope:** render request integration, resource planner, CPU-prepared particle simulation, locked beauty post-processing, motion evidence, deterministic rigid-body bake and native secondary-motion adapter.
- **Approach:**
  - Bind one optional render-effects document by digest into `SpatialRenderRequest`, render-plan identity, operation input/output, and receipt.
  - Plan exact render-target pixels/bytes, texture pixels, particle states, simulation steps, and output bytes before browser/native admission; preview/final tier differences are explicit.
  - Prepare seeded point/volume/surface/spline particles into canonical instance buffers on the host CPU. Renderer input is ordinary retained data, not live nondeterministic simulation.
  - Lower bloom, depth of field, temporal sampling/motion blur, tone mapping/exposure, vignette, chromatic aberration, grain, flare, and bounded LUT grading only for beauty. Object-ID, axial-depth, and motion evidence bypass the stack byte-for-byte.
  - Bake bounded rigid bodies/constraints through a deterministic fixed-step reference adapter. Route cloth/rope/complex secondary motion through a pinned native profile and reconcile exact request, engine, cache, source, output, and receipt digests.
- **Acceptance criteria:** rain/embers/dust prepared bytes are stable; beauty effects visibly alter beauty but not diagnostic bytes; stale caches reject; preview/final costs differ truthfully; cancellation or mismatched native output publishes nothing.
- **Validation:** unit/property/lowering tests, fake native tests, browser beauty/AOV fixture, available-native qualification where installed, package/standalone gates.

## Phase 12: Direction compiler, temporal audit, cinematic galleries, CLI, and MCP

- **Status:** Merged through PR #168 at `862d85c` with all exact-head checks including `Required` green; package bounds raised 13→14 MB unpacked for reviewed growth (mirrors PR #154 precedent)
- **Depends on:** Phases 10–11
- **Objective:** Turn semantic direction into inspectable deterministic plans and expose the complete pure planning/review loop to coding agents.
- **Scope:** direction compiler, temporal review, sequence/take gallery plans, operation definitions, CLI commands, read-only MCP tools, tests.
- **Approach:**
  - Compile beats/actions/coverage/looks into proposed performance, camera, cinema, material-lighting, and effect documents. Outputs retain source digest, compiler identity, advisories, unresolved intents, and `verified: false`; they are never auto-applied.
  - Audit sampled sequence evidence for flicker, clip/cut discontinuity, foot sliding, camera acceleration/jerk, exposure/focus jumps, and resource spikes with exact shot/time evidence.
  - Build bounded six-variant galleries and preview-reel plans across performance, camera, lighting, materials, effects, and sequence structure. Keep source, render, audit, and selection identities separate.
  - Add `scene direction check|plan`, `scene effects check|plan|bake`, `project cinema audit|gallery`, and `capabilities` CLI surfaces using the existing root-confined read and no-replace publication patterns.
  - Add only pure/read-only MCP tools for direction/effects/cinema planning and temporal audit. Rendering, baking, provider calls, project mutation, and promotion remain CLI/workflow operations.
- **Acceptance criteria:** all tools reject escaped paths, oversized data, stale digests, and unsupported capabilities before effects; outputs are deterministic; MCP annotations stay read-only/open-world false; no CLI prose duplicates schema authority.
- **Validation:** focused CLI/MCP/operation tests, property laws, six-variant bounds, path/security tests, generated help tests.

## Phase 13: Complete agent workflow and safe extension authoring kit

- **Status:** Merged through PR #169 (`c27148b`) with all checks including `Required` green on the exact head
- **Depends on:** Phase 12
- **Objective:** Give coding agents one ergonomic, durable, recoverable workflow from world construction through explicit take promotion, plus stable ways to extend composition.
- **Scope:** built-in workflow, semantic builder, declarative recipe-pack contract, scaffold/examples for trusted workflows and Pi integration, receipts and recovery tests.
- **Approach:**
  - Add a `cinematic-world` built-in workflow that consumes already-admitted sources, compiles direction/camera/performance/effects, renders bounded previews/finals, audits, constructs a matrix, and requires a separate explicit selection/promotion operation.
  - Add inert, content-addressed recipe packs that can parameterize and compose existing operations but cannot register executors, source paths, permissions, secrets, or runtime URLs.
  - Publish source templates and a checked Pi extension example that shells only to fixed Slopcamera discovery/planning commands after explicit project trust. State clearly that the Pi process executes trusted TypeScript with user permissions.
  - Preserve completed receipts on failure, serialize expensive renders by default, and retain ambiguous-effect custody.
- **Acceptance criteria:** a checked credential-free fixture completes construct → direct → plan → preview → audit → compare → select → promote; six candidates obey concurrency/resource limits; interrupted work resumes without duplicating effects; recipe-pack capability drift rejects.
- **Validation:** workflow graph tests, scheduler/failure-retention tests, package consumer tests, fixture end-to-end run.

## Phase 14: Product documentation, Agent Skill, README, and marketing site

- **Status:** Merged through PR #170 (`b743dff`) with all checks including `Required` green on the exact head
- **Depends on:** Phase 12; may develop in parallel with Phase 13 against frozen manifests
- **Objective:** Explain and demonstrate the real product with high-polish, test-bound public surfaces and an honest extension model.
- **Scope:** README, Diátaxis docs, public web docs and homepage, Agent Skill references, examples, structured metadata, screenshots/visual evidence where generated locally.
- **Approach:**
  - Replace nonexistent commands in the initial cinematic guide, register canonical docs on the website, and add tutorial/how-to/reference/explanation coverage for direction, cinematography, character performance, effects, galleries, promotion, qualification, and extension architecture.
  - Expand README around the end-to-end cinematic agent loop while keeping released-vs-current-source availability explicit.
  - Update the Agent Skill’s routing table and references with exact discovery-first commands, review gates, resource/trust boundaries, and recovery.
  - Upgrade the homepage hero, cinematic proof flow, capability cards, extension story, trust model, and cross-links using current design-system primitives. No claim appears without a manifest/fixture/doc test.
  - Add GhostGet/pi comparison only as architectural context, without implying integration, endorsement, or equivalent security.
- **Acceptance criteria:** every command example parses or is fixture-tested; docs/site/skill capability lists agree with the manifest; site remains static, accessible, responsive, no-account, and production-only analytics; metadata and Markdown mirrors stay correct.
- **Validation:** docs/skill validators, site contract/content/browser tests, accessibility/visual checks, README link/command checks, `bun run check:web`.

## Phase 15: Qualification, independent review, and protected delivery

- **Status:** Completed on branch `p15-close` — all gates green, browser qualification recorded across three profiles, independent review clean, native/provider limits explicit
- **Depends on:** Phases 10–14
- **Objective:** Prove the integrated system and close the plan without overstating hardware, native, or provider evidence.
- **Scope:** redistributable fixtures, deterministic rebuild, beauty/diagnostic/temporal qualifications, final whole-feature review, generated outputs, KB completion and current-head CI.
- **Acceptance criteria:** all focused and complete local gates pass; generated SDK/CLI/site outputs are clean; package smoke passes; browser evidence is recorded when available; unavailable native/provider qualifications remain explicit; independent review has no unresolved blocker; exact-head `Required` and post-merge main CI pass.
- **Validation:** `bun run check`, `bun run kb:check`, fixture determinism runs, relevant browser/native qualifiers, package smoke, current-head and post-merge CI.

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
- 2026-09-18 — Phase 3 completed and merged through PR #151 at `5592376` after a bounded cross-platform package-capacity fix (`bf9068d`, 4.32 MB packed cap for Linux archive variance); every lane including `Required` passed on the exact head. Phase 2 closed its remaining scope — analytic two-bone IK with pole/stretch/preserve policies, additive clip layers with canonical body masks, content-addressed take galleries with stale-digest rejection, and retained-native bake request/receipt contracts — plus a review-found attachment world-position fix, and was published as PR #152 (implementation `8bc1c26`, merge-forward `432d658`, 64 focused tests, package smoke inside raised bounds). Phase 4 added the reviewed completion scope — closed KHR extension allowlist, deterministic derivation executor bound to exact source bytes, content-addressed probe galleries with hero manifest binding, complete map preparation/MeshPhysicalMaterial lowering, and linear fog with explicit height-fog rejection — and was published as PR #153 (`ca492c9`, merge-forward `773c70f`, 264 focused tests). Exact-head CI is pending on both PRs. Phase 5 sequence/transition work started against merged Phase 3.
- 2026-09-19 — Phase 4 merged at `1303fdd` (PR #153) after final merge-forward and bundle/identity regeneration; all `Required` checks passed. Phase 2 merged at `c953123` (PR #152) after the canonical package-bounds release. Phase 5 implemented the `slopcamera.project-cinema-plan` sidecar, sequence compiler for cuts/dissolve/wipe/dip/flash/whip-pan/spatial/constrained match-cut, animatic preview with placeholder handling, and deterministic continuity audits; 22 focused contract/core tests pass, desktop lint/typecheck and package smoke pass, published as PR #155. Phase 6 implemented bounded geometry DAG, parametric architecture generators, and retained native-geometry adapter contract; 308 focused spatial tests pass, package smoke and standalone pass, published as PR #156. Phase 7 started with a bounded `SpatialRenderPlan` and closed post-process stack contracts; 6 focused parser/policy tests pass, draft PR #157.
- 2026-09-19 — Rebuilt and re-committed `apps/desktop/dist/cli/main.js` and `scripts/legacy-identity.inventory.json` for PRs #155 and #156 after the local-runtime/standalone check caught identity-bearing line drift. Phase 7 extended to `SpatialParticleSystem` (5 tests) and `SpatialSimulationPlan` (3 tests), giving seeded bounded emitters, forces, kill volumes, preview/final tiers, and deterministic rigid-body/constraint bake plans with cache and source-digest binding; 14 focused tests pass and the draft PR is updated.
- 2026-09-19 — Phase 5 merged at `78bcb9a` (PR #155); all `Required` checks passed. Phase 6 had to merge-forward past the p5 merge because of generated bundle/identity inventory conflicts; the merge-forward `c4699ab` was pushed and fresh exact-head CI is running.
- 2026-09-19 — Phase 6 merged at `63acd80` (PR #156) after the merge-forward; all `Required` checks passed. Phase 7 was merged-forward past both p5 and p6, fixed lint casts, and promoted from draft to ready; `gh pr merge --auto` is active on PR #157. The phase now contains contracts for `SpatialRenderPlan`, post-processing, particle systems, simulation-bake plans, and motion evidence; renderer lowering, bake adapter, and browser qualifications remain out of scope for this workstream.
- 2026-09-19 — Phase 7 merged at `18f3abf` (PR #157) through auto-merge; all `Required` checks passed. Phase 8 opened as PR #159 with the `SpatialDirection` agent-direction contract (3 tests, SDK lint/typecheck/build/standalone green). Phase 9 opened as PR #160 with a `docs/how-to/cinematic-character-worlds.md` guide and updated legacy identity inventory.
- 2026-09-19 — Phase 8 merged at `e8561d3` (PR #159) and Phase 9 merged at `b5a5f47` (PR #160) through auto-merge; all `Required` checks passed. The cinematic-character-worlds workstream is now in `main` from Phase 0 through Phase 9.
- 2026-09-18 — Phase 10 implementation and structured review completed locally. A static, bounded, content-addressed manifest now projects the exact production operation, built-in workflow, and MCP-tool inventories into source-owned capability modules with trust, lifecycle, effect, cache, resource, preparation, resume, runtime-profile, and qualification metadata. Foreign manifests revalidate global ownership and portable-host trust even when their outer digest is recomputed. `slopcamera capabilities [--json]` dispatches before repository discovery or host probing, claims no resources, loads no plugins, and the portable manifest is exported by the SDK. Review also hardened the incomplete Phase 7–8 contracts: safe effect budgets plus chromatic aberration/flare/LUT closure; ordered bounded particle curves and signed spline coordinates; pinned simulation-engine identity, unique bodies/constraints, output budgets, and stale/tampered bake-receipt rejection; request/renderer/artifact-bound motion evidence; and strict direction clocks, IDs, references, and proposal verification. Validation: 48 focused manifest/contract/CLI tests, 331 spatial tests, isolated `check:sdk` with 621 tests plus release/schema/skill checks, `check:desktop` with 1,776 passes and 25 expected native/browser skips, `check:web` including browser layout verification, standalone verification across 1,194 source files, and package smoke across 487 packed files (4,466,875 packed bytes; 12,684,972 unpacked bytes). The first concurrent SDK run had one 5-second vectorizer timeout under simultaneous desktop/browser/package load; the isolated rerun passed in 849 ms without a code change.
- 2026-09-19 — Phase 10 merged through PR #164 at `2c1b88d` with every check including `Required` green. Phase 11 implemented the executable-effects vertical slice on branch `p11-effects`: a content-addressed `SpatialRenderEffectsDocument` binds scene/render-plan/particle-system/simulation-bake digests into the render request, plan costs, batch metadata, and receipts; deterministic CPU particle preparation emits canonical 64-byte little-endian instance records staged privately and re-verified by SHA-256 in the browser; the generated WebGL2 runtime now executes the ordered post-process stack (tone map, vignette, chromatic aberration, grain, depth of field, motion blur, bloom, flare, LUT grading) through half-float linear ping-pong targets with deterministic shader constants, and diagnostic modes structurally omit effect payloads rather than bypassing them by shader behavior. A new `motion` render mode renders per-entity packed `rg16un` velocity evidence from chained previous snapshots, which the host decodes, hashes, stages, publishes content-addressedly, and binds into `SpatialRenderReceipt.motionEvidence`. LUT assets gained a dedicated unbound `lutAssetIds` preparation path with `s²×s` strip layout and two-slice linear lookup. A portable deterministic rigid-body bake (`simulation-bake.ts`) handles gravity, spring/fixed constraints, and free rigid rotation while rejecting hinge and native profiles fail-closed. Review fixes en route: velocity transforms now compose world×primitive matrices consistently for prepared geometry, partitioning passes previous snapshots only when velocity is required, and generated-script syntax is verified by extraction and bundling. Validation so far: 417 focused tests across 33 files green, SDK and desktop typechecks clean, generated script bundles at ~45 KB. Remaining: full `bun run check` gates, KB refresh, PR, and honest browser/native qualification.
- 2026-09-19 — Phase 11 merged through PR #165 at `29fab10`; all 20 checks including `Required` passed on the exact head. Gate iteration found and fixed three integration faults before delivery: an unused-import typecheck failure in the new bake module, two narrowing errors in the new tests, and a registry JSON-Schema description failure where a legacy `.transform()` compatibility curve became reachable only through the new effects field — input descriptions now emit `io: "input"` schemas, which is the honest accepted-input surface. A late-bound review also added a plan-time motion-sample budget so oversized evidence requests reject before any rendering. Remaining open scope: the native secondary-motion adapter (currently fail-closed) and real GPU/browser qualification, both Phase 15.
- 2026-09-19 — Phase 12 merged through PR #168 at `862d85c`; all checks including `Required` passed on the exact head. The phase added the portable direction compiler (`direction-compile.ts`) lowering beats/actions/coverage/looks into proposed performance, camera-rig, cinema, material-lighting, and shot documents with `verified: false` and unresolved intents; a sampled temporal-audit module reporting flicker, foot sliding, camera jerk, cut discontinuities, and pacing findings; bounded six-variant gallery planning across camera/lighting/materials/effects/performance/sequence axes that never selects a candidate; effects check/plan helpers producing self-verifying `SpatialRenderEffectsBinding` documents; `scene direction check|plan`, `scene effects check|plan|bake`, `project cinema audit|gallery`, and `capabilities` CLI surfaces; and six read-only MCP tools. Package bounds were raised 13→14 MB unpacked following the PR #154 precedent (493 files, 4.57 MB packed, 13.1 MB unpacked). One recurring inventory fault — the updater filtering freshly built chunks that were not yet git-tracked — was fixed by rerunning the updater after generated files were staged.
- 2026-09-19 — Phase 13 implemented on branch `p13-workflow`. Six closed pure operations (`scene.direction.check|compile|gallery`, `scene.effects.check|plan`, `scene.temporal-audit`) wrap the Phase 12 portable kernels with bounded JSON snapshots, abort checks, schema-parsed outputs, and digest-only summaries; they are registered in the default registry, owned by the capability manifest, and lowered through new typed `scene.*` semantic-builder methods. The `cinematic-world` built-in workflow composes inspect → direction-check → direction-compile → per-axis galleries → optional effects plans → optional temporal audit → declared preview renders under stable `planning/`/`galleries/`/`previews/` namespaces; effects bindings flow into render requests as nested graph references, and the graph contains no selection or promotion operation. The safe extension authoring kit is the `slopcamera.spatial-recipe-pack` portable contract: a bounded, strict, content-addressed, scene-digest-bound JSON document that names one direction, gallery axes, preview render requests, an optional effects block (declarative render plan plus particle systems and bake receipts), and optional temporal-audit inputs — inert data, never code. A `.agents/skills/cinematic-pack-authoring` skill teaches coding agents the author → plan → review → iterate loop while keeping selection/promotion explicit. Review found and fixed a genuine integration fault: `scene.effects.plan` originally recomputed the host render plan internally; the operation now takes the declarative `SpatialRenderPlan` document the pack carries, matching the CLI draft flow exactly. Validation: 775 focused tests across 86 files green, SDK and desktop typechecks clean, capability-manifest ownership tests pass. Remaining: full `bun run check` gates, PR, and delivery.
- 2026-09-19 — Phase 13 merged through PR #169 (`c27148b`); all checks including `Required` passed on the exact head.
- 2026-09-19 — Phase 14 implemented on branch `p14-docs`. The stale `slopcamera cinema check|audit`, `rendered review`, and `project promote` commands in the cinematic-character-worlds guide were replaced with the real `scene inspect|direction check|direction plan|direction gallery|effects plan|effects check|effects bake|temporal-audit|render-audit|project cinema audit|gallery|scene project add-candidate|select-candidate` surfaces; the guide now teaches the semantic-direction loop end to end. New `docs/extension-architecture.md` records the closed registry, static capability manifests, the four-rung trust ladder (inert documents → declarative graphs → trusted workflow modules → the native-authoring exception), the recipe-pack extension kit, and why no open plugin hook exists, with GhostGet and pi.dev cited as architectural context only. New `docs/how-to/direct-cinematic-worlds.md` plus the site mirror `apps/web/src/docs/how-to/cinematic-worlds.md` teach the recipe-pack → `workflows plan|run cinematic-world` loop; the site page is registered in the docs registry, index, sitemap, and llms task list. Stale claims reconciled across README, repo docs, site docs, `agent-pages.ts`, and the Agent Skill: the rigged `slopcamera.glb-rigged-morph-skin-v1` profile replaces the universal "rejects skins" claim; MCP is the fixed 15-tool surface; `execute_slopcamera` admits six portable operation codes; the complete host enumerates 67 operation kinds; `cinematic-world` joins the built-in workflow lists. The homepage gained the cinematic-worlds docs link and a corrected MCP card inside the authored budget. Validation: `bun run check` in `apps/web` green (396 tests, 22 files; 74-file static build; 11-case browser preview verification), `check:skill` valid, authored shell at 35,938 bytes under the 36,000 ceiling. Remaining: PR, exact-head CI, and merge.
- 2026-09-19 — Phase 14 merged through PR #170 (`b743dff`); all checks including `Required` passed on the exact head, and the post-merge main run on `b743dff` completed green across all 17 listed checks.
- 2026-09-19 — Phase 15 close review executed on branch `p15-close` over merged main `b743dff`. Complete `bun run check` green: cost-surface check, standalone boundary verified across 1,220 source files, SDK 673 tests, desktop 1,813 tests, web 396 tests including browser layout verification, and package smoke over 496 packed files (4,580,871 packed bytes; 13,177,596 unpacked bytes under the 14 MB bound). Full `kb check` clean with catalog current and 47 agent guides mapped; three pre-existing contextual orphan advisories remain. End-to-end review found no unresolved blocker: the six Phase 13 operations execute through the closed registry with manifest ownership; `cinematic-world` compiles inspect → direction-check → direction-compile → per-axis galleries → optional effects/audit → declared preview renders under stable `planning/`/`galleries/`/`previews/` namespaces with no selection or promotion node; compiled direction stays `verified: false`; all 15 MCP tools carry correct read-only/destructive annotations and inherit root-confined paths through `boundary.readSource`; workflow coverage matches the repository convention of graph shape at workflow level plus production-path execution at operation and qualification level. Browser qualification ran against the installed Chrome 153.0.8010.48 and FFmpeg 7.1.5 through the real host scheduler: the default profile passed 7 checks (beauty contact sheets, edit deltas, retained-source immutability, shared evaluated world across cameras, 30000/1001 MOV cadence, byte-identical retained replay); `--hardware` passed 11 checks adding real-GPU object-id and axial-depth diagnostic captures, cancellation settling with browser ownership released, and context-loss rejection; `--reference` passed 10 checks including the full 450-frame 1920×1080 render whose MOV digest is byte-identical across two runs (`16122386…63bd`), warm in-page seek p50 6.2 ms / p95 57.6 ms over 435 samples, 811 evaluated frames per second in-page, and 224.6 ms cancellation settlement. The provisional 500 ms warm-preview and 10 s contact-sheet targets are honestly reported as missed (19.2 s and 22.7 s observed, dominated by per-render signed-runtime verification), and GPU-memory/aggregate-child-RSS fields are explicitly null rather than estimated. The first `--reference` attempt also produced real evidence of the integrity boundary working: the signed-provenance check failed closed when Chrome's 152→153 auto-update mutated the runtime tree mid-verification; the settled tree passed cleanly on re-run. Explicitly unavailable qualifications recorded: the native secondary-motion adapter remains fail-closed (no native host admitted), and no provider/Gateway live qualification ran — artifact admission only, never live evidence.

## Result

All sixteen phases (0–15) shipped to `main` through reviewed pull requests — the phase merge commits run `3aecd81` (Phase 1) through `b743dff` (Phase 14) — with `Required` green on every exact head and post-merge main CI green on the final merge. The delivered loop matches the outcome statement: an agent can admit or construct a bounded 3D world, admit a rigged GLB under the explicit `slopcamera.glb-rigged-morph-skin-v1` profile, direct performances through semantic direction documents, design cinematic camera coverage, assemble sequenced shots with transitions, apply PBR materials and bounded effects, render animatic and final output, and inspect deterministic audits plus rendered review evidence before explicitly selecting and promoting a result. The extension model stayed closed by design: agents author inert documents (scenes, directions, recipe packs) and declarative graphs against a fixed host-owned operation registry — no plugin API or open operation-registration hook was added or is planned. Residuals kept honest rather than fixed quietly: the native secondary-motion adapter is fail-closed until a native host is admitted, provisional warm-render latency targets are measured and missed rather than hidden, and provider live qualification was never claimed from artifact admission.

## Durable memory

- Current operating truth lives in checked documentation and executable contracts per [[notes/documentation-ownership]]: `docs/how-to/cinematic-character-worlds.md`, `docs/how-to/direct-cinematic-worlds.md`, `docs/extension-architecture.md`, `docs/reference/capabilities.md`, the Agent Skill under `skills/slopcamera/`, and the authoring skill under `.agents/skills/cinematic-pack-authoring/`.
- The extension contract owners are code, not prose: `src/spatial-scene/recipe-pack.ts` (inert pack schema and bounds), `apps/desktop/workflows/cinematic-world.ts` (the composed planning graph), and `docs/extension-architecture.md` (the four-rung trust ladder and why the registry stays closed).
- Qualification evidence is retained under ignored `artifacts/spatial-qualification/` as `slopcamera.spatial-scene-qualification` reports; `apps/desktop/qualification/` owns the opt-in fixtures and their honest-limits conventions.
- Delivery mechanics validated the [[notes/repository-seams]] model across fifteen phases of parallel lanes: frozen manifests and contracts first, one integration owner for convergence files (generated `dist`, the legacy-identity inventory, this plan), and merge-forwards instead of rebases.
- Two recurring operational lessons now live in the gates themselves: stage freshly built generated chunks before running the legacy-identity inventory updater, and emit `io: "input"` JSON-Schema descriptions for transform-bearing contracts so output-side description does not fail on the compatibility transform.
