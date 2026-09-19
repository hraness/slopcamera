---
type: plan
title: ALGAL character behaviors — organism graphs as bounded behavior programs
description: Integrate the ALGAL organism model deeply into Slopcamera as the deterministic behavior-program layer for characters and scene objects, dogfooding algal as a second concrete consumer.
area: spatial-scenes
status: in-progress
repository_scopes:
  - src/spatial-scene
  - apps/desktop/application
  - apps/desktop/cli
  - skills/slopcamera
  - docs
---

# ALGAL character behaviors

## Outcome

An agent authors a **behavior organism** — an inert ALGAL manifest admitted under a closed bake-safe profile — that composes deterministic behavior kernels for a character or scene object: locomotion state machines, expression layers, gaze, interaction sequences, and prop/ambient loops. Slopcamera checks, bakes, and audits the emitted performance evidence; galleries produce seeded variants; selection and promotion stay explicit. Render-time evaluation remains replay-pure.

ALGAL is the behavior composition language; Slopcamera owns the vocabulary (a closed behavior-fn registry), the bake, and the receipts. Model judgment stays in authoring organisms outside the bake path.

## Context

[[plans/cinematic-character-worlds]] delivered the semantic-direction loop: direction documents compile to proposed performance/camera/cinema/material/shot documents; `cinematic-world` composes inspect → check → compile → galleries → effects → audit → previews; recipe packs are the inert authoring surface. That plan's direction `actions` enum (`idle|walk|run|turn|gesture|interact|morph`) is a hand-unrolled automaton; this plan generalizes it into composable, seeded, reactive behavior programs.

[[plans/agentic-scene-authoring]] and the `simulation-bake.ts` precedent establish the boundary: anything stochastic or iterative is deterministically baked to content-addressed artifacts before rendering; receipts bind input digests to output digests.

ALGAL (`@hraness/algal`, github.com/hraness/algal) provides the organism contract: inert manifests of typed cells (`input`/`const`/`fn`/`tool`/`agent`/`classifier`/`gate`/`organism`/`repeat`/`each`/`store`/`load`/`slot`/`spawn`), declared budgets, closed host registries, and receipts that replay bit-for-bit. A `repeat` cell re-runs a digest-embedded sub-manifest threading `carry` state between rounds — the iteration primitive a ticked automaton needs — and `each` maps one organism over entity lists. Slopcamera is ALGAL's second concrete consumer; friction found here feeds back upstream.

### Spike evidence (2026-09-19)

A two-state locomotion FSM (`idle↔walk` + seeded fidget) ran end-to-end through `runOrganism` with a host-supplied `fsm.tick.v1` fn: `repeat` maxRounds 8, carried `{state}` between rounds, emitted a deterministic channel trace (`fidget fidget fidget → walk walk → idle idle → fidget`), 18 receipt cell records, canonical receipt digest, zero agent calls. The model fits; the receipt scaling below is the main upstream finding.

## Constraints

- Portable `src/spatial-scene` stays effect-free and dependency-free. ALGAL types are never imported into portable modules; the bake-safe organism profile is parsed from `unknown` with Slopcamera-owned bounded schemas.
- `@hraness/algal` is consumed only in `apps/desktop/` through a pinned immutable commit or release tag (no sibling paths, no floating ranges). The runtime seam is one adapter module owning registry assembly, store wiring, execution, and receipt bridging.
- **Bake organisms are pure**: the bake-safe profile admits only `input`, `const`, `fn`, `repeat`, `each`, `organism`, `store`, `load`, and read-mode `slot` cells. `agent`, `classifier`, `gate`, `tool`, `spawn`, transports, and `via` are rejected at check time. Host fns must be deterministic — seeded draws only, no wall clock, no ambient state — enforced by property tests.
- Every `fn` cell ref must resolve against Slopcamera's admitted behavior-fn catalog; every `repeat`/`organism` digest must resolve inside the document's manifest closure. Reject before execution.
- Bakes emit ordinary `SpatialPerformanceTake`/`SpatialPerformanceReceipt` artifacts. The ALGAL run receipt's digest is recorded inside the receipt; rendered output must not depend on ALGAL at evaluation time.
- Authoring organisms (with `agent`/`tool`/`classifier` cells) run only at authoring time under the existing consent/paid-call envelope — never inside the bake path or the `cinematic-world` graph.
- Selection and promotion remain explicit operations; behavior galleries propose takes, never select.

## Design decisions

- **Behavior document** — `slopcamera.spatial-behavior.v1`: `{ kind, schemaVersion, behaviorId, entityId, seed, rangeUs, organisms, entry, channels }`. `organisms` is a self-contained `record<digest, manifest>` closure (rehashed at admission); `entry` names the entry organism digest; `channels` declares the emitted channel vocabulary. Self-contained like recipe packs — no external store resolution needed to check or bake.
- **Behavior-fn catalog** — `src/spatial-scene/behavior-fns.ts` owns `{name, signature, fn}` records of pure kernels. Fns interpret *spec data delivered through input ports* (FSM tables, expression schedules, interaction plans), keeping the catalog small and closed while agents compose behavior through manifest data. Initial catalog: `rng.seeded.v1`, `behavior.fsm.v1`, `behavior.expression.v1`, `behavior.interact.v1`, `channel.emit.v1`, `scene.sample.v1`, plus reuse of needed `builtinRegistry` glue.
- **Check → bake → gallery ops** — `scene.behavior.check` (parse + profile + fn/digest closure + bounds), `scene.behavior.bake` (host runtime → take + receipt), `scene.behavior.gallery` (N seeds → candidate takes). Mirrors the `scene.effects.check|plan|bake` precedent.
- **Temporal audit extension** — automaton pathologies become findings: state thrash (transition rate over bound), robotic periodicity (exact cycle repetition), dead expression (no morph activity), unreachable states (static analysis).
- **Two organism profiles** — `bake` (pure cells only) and `authoring` (agent/tool cells, authoring-time only). Same runtime, different admission.

## Phases

| Phase | Deliverable | Depends on | Parallelizable with |
| --- | --- | --- | --- |
| A | Behavior contract + bake-safe profile checker | — | B |
| B | Behavior-fn catalog (pure kernels) + determinism tests | — | A |
| C | Host runtime seam: algal pin, registry assembly, bake → take + receipt | A, B | — |
| D | Ops + CLI + manifest + MCP check tool | C | E |
| E | Character behavior stdlib (locomotion/expression/interaction organisms) + gallery + audit findings | D | — |
| F | Authoring-organism example + dogfood feedback upstream + docs/skill | E | — |

## Phase A: Behavior contract and bake-safe profile

- **Status:** Implemented on branch `algal-behaviors` (pending phase review)
- **Objective:** Portable, effect-free admission of behavior documents.
- **Scope:** `slopcamera.spatial-behavior.v1` schema with inline manifest closure; `morphogen.organism.v1` bake-safe subset parser (bounded cells/edges/carry/rounds, closed cell-kind allowlist, interface and port validation); `checkSpatialBehavior` returning findings, resolved fn refs, and the canonical digest; closure verification (manifest digests, fn refs against a caller-supplied admitted list); adversarial bound tests.
- **Acceptance criteria:** foreign values parse from `unknown` through strict bounded schemas; non-bake cells, unresolved fns/digests, and over-bound structures reject with named findings; canonical digest is stable; no filesystem/browser/native/provider access anywhere in the module.
- **Validation:** colocated deterministic + property tests, SDK typecheck, focused lint.

## Phase B: Behavior-fn catalog

- **Status:** Not started
- **Objective:** The closed, pure kernel vocabulary organisms compose.
- **Scope:** `behavior-fns.ts` with signature + pure implementation per fn; `rng.seeded.v1` (mulberry32-style draw stream), `behavior.fsm.v1` (generic state-machine tick: states, dwell guards, weighted/seeded transitions, predicate inputs), `behavior.expression.v1` (blink/gaze/mood schedules → morph channels), `behavior.interact.v1` (approach→align→reach→grasp→release with attach/release emission), `channel.emit.v1`, `scene.sample.v1` (pure over evaluated snapshot input), `behavior.combine.v1` (layer merge with priority).
- **Acceptance criteria:** identical inputs+seed produce identical outputs (property tests); every fn is total over its declared input schema or fails with a named error; spec data is bounded before iteration; no ambient state.
- **Validation:** colocated tests including seeded-draw laws and adversarial spec bounds.

## Phase C: Host runtime seam

- **Status:** Not started
- **Objective:** Execute bake organisms through the real ALGAL runtime inside `apps/desktop`.
- **Scope:** pinned `github:hraness/algal#<immutable-ref>` dependency; `behavior-runtime.ts` adapter assembling the FnRegistry (slopcamera fns + needed builtins), populating a `MemoryStore` from the document's manifest closure, running `runOrganism`, mapping emitted channel traces into `SpatialPerformanceTake`, and bridging the ALGAL `RunReceipt` into `SpatialPerformanceReceipt` (digest recorded).
- **Acceptance criteria:** a checked-in tiny organism bakes a deterministic take end-to-end; receipt binds behavior/scene/seed/range digests to output digests; two runs produce byte-identical receipts; store closure rejects missing digests before execution.
- **Validation:** colocated adapter tests, desktop typecheck/lint, focused ops.

## Phase D: Operations, CLI, manifest, MCP

- **Status:** Not started
- **Objective:** Production operation and command surface.
- **Scope:** `scene.behavior.check|bake|gallery` ops in `application/operations/`, typed `scene.*` builder methods, `slopcamera scene behavior check|bake|gallery` CLI, capability-manifest ownership, `check_scene_behavior` MCP tool (read-only, root-confined).
- **Acceptance criteria:** ops execute through the default registry with schema-parsed I/O and digest-only summaries; manifest entries cover all three ops; CLI help/completion updated; MCP tool carries `readOnlyHint` and inherits root confinement.
- **Validation:** op tests through production registry, manifest tests, CLI arg tests, focused MCP test.

## Phase E: Character behavior stdlib, gallery, audit

- **Status:** Not started
- **Objective:** Real authored behaviors and review evidence.
- **Scope:** checked-in behavior organisms (locomotion FSM, expression layer, interaction sequence, prop loop) as documented manifests; `behavior` gallery via seeded take candidates; temporal-audit findings for thrash/periodicity/dead-expression/unreachable-states; recipe-pack `behaviors` field evaluation.
- **Acceptance criteria:** each stdlib organism passes `scene.behavior.check`; gallery produces distinct seeded candidates bound to the same organism digest; audit findings fire on constructed pathologies; selection/promotion unchanged and explicit.
- **Validation:** organism fixtures through check+bake, gallery tests, audit-finding tests.

## Phase F: Authoring organism, dogfood loop, docs

- **Status:** Not started
- **Objective:** Close the loop — generative authoring through ALGAL and upstream feedback.
- **Scope:** an authoring organism example (agent proposes manifest deltas → `scene.behavior.check` tool → audit evidence → foundry selection) under the consent envelope; `.agents/skills` or docs guidance; upstream ALGAL issues from findings (round-summary receipts, scan/fold primitive, seeded-rng/stdlib fns, bake-safe profile checker, numeric-array port convention); README/docs/Agent Skill updates.
- **Acceptance criteria:** authoring organism runs end-to-end producing a check-passing behavior doc; each upstream finding filed with reproduction; docs match shipped commands exactly.
- **Validation:** live-or-fixture authoring run, docs/skill validators, `bun run check`.

## Verification

- Determinism → identical behavior doc + seed + scene digest produce byte-identical takes and receipts; rerun property proven in tests.
- Bounds → parser tests prove cells/edges/rounds/carry/channels/ticks limits settle before store resolution or execution.
- Purity → bake-organism profile tests reject every effect-bearing cell kind; fn determinism property tests.
- Provenance → receipts bind organism closure digest, scene digest, seed, range, fn catalog version, and emitted take digests.
- Dogfood → every upstream ALGAL finding is recorded with reproduction and the mitigations used.

## Risks and recovery

- ALGAL churn (v0.1.0, early) → pin immutable ref; keep the seam inside one adapter module; baked takes are ordinary artifacts so only re-bakes are affected by upgrades. Track upstream releases deliberately; each bump is a reviewed PR.
- Dense-tick receipt bloat → chunk ticks inside fns (a `repeat` round can simulate K ticks through spec data) while upstream lands round-summary or scan/fold primitives; bound `maxRounds` and accumulated carry size in the contract.
- Semantic drift between the bake-safe subset parser and upstream contract → golden manifests in `examples/` validated against both parsers in CI; a drift finding is a blocking failure, not a warning.
- Agents overfit audit metrics → galleries keep evidence-first review and explicit selection; audit findings advise, they never promote.
- No wall-clock/ambient leakage → property tests replay every catalog fn; a nondeterministic fn is a release blocker.

## Implementation log

- 2026-09-19 — Plan opened on branch `algal-behaviors`. Spike evidence recorded above: repeat+carry expresses ticked state machines through the stock ALGAL runtime with host-supplied fns; per-round cell records scale linearly (18 records over 8 ticks), and `repeat` surfaces only final-round outputs, so emitted channels accumulate through carried state — both recorded as upstream feedback candidates. Phase A started: behavior contract + bake-safe profile checker.
- 2026-09-19 — Phase A implemented in `src/spatial-scene/behavior.ts`: `slopcamera.spatial-behavior` document (kind/schemaVersion/behaviorId/entityId/sceneSha256/seed/rangeUs/organisms closure/entry/channels/args) plus the bake-safe `morphogen.organism.v1` subset parser (input/const/fn/repeat/each/organism only; agent/classifier/gate/tool/spawn/slot/store/load and `via` rejected structurally). `behaviorOrganismSha256` mirrors ALGAL `manifestToJson` for the subset — four golden manifests digest byte-identically to `digestCanonical(manifestToJson(parseOrganismManifest(m)))` (tick `6fecd9b9…`, loop `bc8e97b9…`, worker `be29d889…`, fanout `3e29617d…`). `checkSpatialBehavior` reports eleven finding codes: stale-digest, unresolved-entity/entry/manifest/fn, closure-digest-mismatch, invalid-wiring, undeclared-arg, range-outside-scene, unreachable-organism (warning), cyclic-composition, unfed-input (warning — interface inputs without a delivering edge, carry binding, or entry arg; independent review caught that carry-fed inputs must not warn). Contract details discovered while mirroring and encoded as rejections/refinements: `asSafeId` is lowercase kebab (`^[a-z][a-z0-9-]*$`, ≤64) for cell ids, port names, interface names, carry/until/over/guard names; `fn` is a free-form ref (≤`maxRefLen`) so the catalog pattern `*.vN` is a deliberate profile restriction; `many` is consumer-only so producer port maps (input/const outputs — the only declared port maps in the subset) reject it; `until.equals`/`guard.equals` bound at 64; interface required on every manifest (bake profile is stricter than upstream where it is optional). 35 colocated tests green; tsc + eslint clean.
