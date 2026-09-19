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

- **Status:** Implemented on branch `algal-behaviors` (pending phase review)
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

- **Status:** Implemented — pending review
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
- 2026-09-19 — Phase A implemented in `src/spatial-scene/behavior.ts`: `slopcamera.spatial-behavior` document (kind/schemaVersion/behaviorId/entityId/sceneSha256/seed/rangeUs/organisms closure/entry/channels/args) plus the bake-safe `morphogen.organism.v1` subset parser (input/const/fn/repeat/each/organism only; agent/classifier/gate/tool/spawn/slot/store/load and `via` rejected structurally). `behaviorOrganismSha256` mirrors ALGAL `manifestToJson` for the subset — four golden manifests digest byte-identically to `digestCanonical(manifestToJson(parseOrganismManifest(m)))` (tick `6fecd9b9…`, loop `bc8e97b9…`, worker `be29d889…`, fanout `3e29617d…`). `checkSpatialBehavior` reports eleven finding codes: stale-digest, unresolved-entity/entry/manifest/fn, closure-digest-mismatch, invalid-wiring, undeclared-arg, range-outside-scene, unreachable-organism (warning), cyclic-composition, unfed-input (warning — interface inputs without a delivering edge, carry binding, or entry arg; independent review caught that carry-fed inputs must not warn). Contract details discovered while mirroring and encoded as rejections/refinements: `asSafeId` is lowercase kebab (`^[a-z][a-z0-9-]*$`, ≤64) for cell ids, port names, interface names, carry/until/over/guard names; `fn` is a free-form ref (≤`maxRefLen`) so the catalog pattern `*.vN` is a deliberate profile restriction; `many` is consumer-only so producer port maps (input/const outputs — the only declared port maps in the subset) reject it; `until.equals`/`guard.equals` bound at 64; interface required on every manifest (bake profile is stricter than upstream where it is optional). 38 colocated tests green; tsc + eslint clean.
- 2026-09-19 — Phase B implemented in `src/spatial-scene/behavior-fns.ts`: a seven-fn closed catalog — `rng.seeded.v1` (mulberry32 draw stream, chainable `next` state, stream-salted seeds), `behavior.fsm.v1` (generic state machines over tick windows: after/chance/flag/clear/always guards evaluated lazily in declaration order, minDwellUs, transition + state emissions), `behavior.expression.v1` (seeded blink windows, gaze saccades through declared targets, per-tick mood blends, rng state threaded through windows), `behavior.interact.v1` (linear phase sequencer, minUs advancement, emit-on-entry events for attach/release-style effects, loop-or-clamp termination), `channel.emit.v1` (constant per-tick emission), `scene.sample.v1` (distance/contact obs from provided per-tick positions — outputs an fsm-ready window), `behavior.combine.v1` (priority merge per (tUs,channel) with deterministic ordering). Shared conventions: `{ticks:[{tUs,obs?}]}` strictly-increasing windows (≤512 ticks — the host chunks dense simulation so organisms need few repeat rounds), `[{tUs,channel,value}]` emitted records (≤4096/call), opaque bounded state validated before use. `SpatialBehaviorFnError` carries `invalid-input|invalid-state|over-bound` codes — every kernel is total over its declared domain or fails named. Independent review caught two kernel bugs the laws exposed: chance guards now require `obs.draw` only when actually *evaluated* (not whenever any chance guard exists in the machine), and interact `emit` fires on phase *entry* (grasp emits attach). Two-window continuity laws prove split windows emit byte-identically to single-shot — the property that makes chunked baking sound. Contract-test fixtures realigned to real catalog fn names (`behavior.fsm.v1`, `channel.emit.v1`); goldens regenerated against ALGAL (tick `8facb5bd…`, loop `ef2aabe5…`, worker `d3fc3ee7…`, fanout `fa8cfce4…`) and `checkSpatialBehavior` tests now run against `spatialBehaviorFnSignatures()`. 71 tests green across both modules; tsc + eslint clean.
- 2026-09-19 — Phase C implemented. `@hraness/algal` pinned immutably at `github:hraness/algal#121267b` (pushed origin/main head; no tags exist yet — the commit pin satisfies the immutable-release rule until `v0.1.0` is tagged). `src/spatial-scene/behavior-bake.ts` runs an admitted closure through the real runtime: `parseOrganismManifest` re-parses each manifest (ALGAL's own parser stays authoritative), `MemoryStore.putManifest` recomputes `digestCanonical(manifestToJson(m))` and the bake *requires* the stored digest to equal the closure key — `organism-digest-drift` fires if the mirror ever diverges. `executors: []`, no tools/transports/replay; `effect-leak` asserts zero effects and zero agent calls on the receipt. Interface-name args map to ALGAL's cell-keyed `args` via `interface.inputs`; entry `interface.outputs` are the bake surface — every declared output port must carry a bounded emitted-record array, with `undeclared-channel`, `emission-outside-range`, and `emission-missing` rejections. `src/spatial-scene/behavior-trace.ts` adds the emitted record schema, the host-supplied `SpatialBehaviorChannelMap` (clip runs / attach+release pairs / root-trajectory waypoint channels — clip digests, propIds and bones are scene-admission concerns and stay out of the portable doc), the pure `compileSpatialBehaviorDirectives` mapper emitting real `SpatialPerformanceDirective`s plus `prop_*` unresolved intents (clip/trajectory/missing-binding gaps reported, never fabricated — the direction-compile honesty pattern), and the `slopcamera.spatial-behavior-bake` artifact + receipt binding behavior/scene/entry/run/emitted/fn-catalog/channel-map digests plus runtime name+version and work totals. Three catalog kernels added for composition plumbing the runtime surfaced: `emitted.append.v1` (repeat `carry` accumulation — repeat surfaces only final-round outputs), `emitted.flatten.v1` (each collects `emitted[][]` per item), `window.advance.v1` (carried `rest→win` window threading — repeat feeds identical inputs each round so a *time window must be carried*, else `after` dwell guards stall on reprocessed ticks; `done` is a text port so `until` string-compares). Catalog now 10 fns. `SpatialPerformanceDirectiveSchema` exported from performance.ts (additive). 89 tests green across behavior/behavior-fns/behavior-bake; bit-for-bit replay test proves identical bakes; tsc + eslint clean. Dogfood findings sharpened: (a) per-round cell records scale linearly — a `scan`/`collect` mode or round-summary receipts would help dense loops; (b) sequential automata need carried windows — a `repeat`-native iteration input would remove the advance kernel; (c) `until.equals` is string-only so numeric termination needs text sentinel ports; (d) each has no carry — sequential per-item state threading is impossible, only fan-out.
- 2026-09-20 — Phase E implemented. `src/spatial-scene/behavior-stdlib.ts`: four standard-library organisms composing the real fn catalog via the proven `repeat`+`carry`+`window.advance` accumulation pattern. Locomotion FSM (`behavior.fsm.v1`), expression layer (`behavior.expression.v1`), and interaction sequencer (`behavior.interact.v1`) each produce an acc-tick sub-organism (advance→tick→append) wrapped in an acc-loop (repeat+carry: next→state, acc→acc, rest→win; specPort pass-through, seed exposed for convention). Combined organism chains pairwise `emitted.append.v1` (loco+expr→ap-le, ap-le+interact→ap-lei) instead of `behavior.combine.v1` — `combine`'s `layers` port is single-edge (not `many: true`), so three sub-organism traces can't fan into it. Each stdlib export bundles the organism closure map, entry digest, and typed input/output declarations. `src/spatial-scene/behavior-audit.ts`: behavior-trace audit module with four finding kinds — `state-thrash` (sliding 1s window transition count vs configurable threshold), `exact-periodicity` (value sequence period detection, bounded by `maxPeriodicityWindowUs`), `dead-channel` (distinct-value count below `minDistinctValues`), `unreachable-state` (states in `.transition` sub-channel never visited as current value). Options schema with sensible defaults; bounded 128 findings, 64 channels. `scene.behavior.audit@1` op registered in the ops module, default registry (71 ops), OPERATION_KINDS. CLI: `slopcamera scene behavior audit <bake.json> [--output <audit.json>] [--json]` early-returns before scene loading (audit needs no scene). MCP `audit_scene_behavior` tool: readOnly+idempotent, root-confined bake path, bounded finding slice. Capability manifest, help, completions updated. Tests: 8 stdlib tests (check passes, bake through real ALGAL runtime, gallery produces distinct candidates — FSM with always/after guards honestly collapses to 1 candidate), 7 audit tests (clean trace, thrash, dead, periodicity, unreachable, false-positive resistance, custom options), CLI parse tests, MCP handler+admission test, ops registration test (4 behavior ops), registry count 71. 151 tests pass, tsc×2 + eslint clean.
- 2026-09-19 — Phase D implemented. New ops module `apps/desktop/application/operations/spatial-behavior.ts` registers `scene.behavior.check|bake|gallery@1` — bounded 4 MiB input snapshots, owned strict schemas, pure policy, digest/count summaries — wired into `OPERATION_KINDS`, `default-registry`, and the operations barrel (registry.test now 70 ops). CLI: `slopcamera scene behavior check|bake|gallery` in args.ts + help.ts (usage, prose, completions) routed through `spatial-scene-service.ts` — check/bake call the portable kernels directly per direction/effects precedent; bake requires `--output` and publishes the canonical bake artifact (no-replace); `--channel-map` parses through the owned schema. Capability manifest: three operation keys, three command declarations (check pure; bake/gallery local-derived-write), `check_scene_behavior` added to spatial module toolNames — the self-checking manifest test keeps coverage exact. MCP `check_scene_behavior`: readOnly+idempotent+closed-world descriptor, `parseSceneBehaviorArguments` (closed {scene,behavior} key space, root-confined paths), `withSceneAdmission`, bounded finding slice + digest/count summary. New portable module `behavior-gallery.ts`: `slopcamera.spatial-behavior-gallery` plans bake six deterministic seed variants (stride 0,1,2,5,11,23) into content-addressed `slopcamera.spatial-behavior-bake` candidates, dedup on `receipt.emittedSha256` so seed-agnostic organisms honestly collapse to one candidate; planner never selects. Seed convention added so galleries can vary behavior: an entry interface input named `seed` binds `behavior.seed` when no arg supplies it (checker exempts `seed` from unfed-input; explicit `args.seed` still wins). Tests: 5 ops tests through the production registry (incl. bit-identical rebake), 3 gallery tests (6 distinct seeded candidates, honest collapse, stale-binding rejection), seed-convention bake test, CLI parse tests, MCP descriptor list + handler + root-escape tests, registry/manifest counts. **Upstream dogfood**: typecheck surfaced a real algal defect — `interfaceSignature` in graph.ts takes `cellId` it never reads; algal ships raw `.ts` sources so consumers' `noUnusedParameters` typechecks its code and our strict flags broke on the vendored file (pre-existing at the Phase C pin — the earlier "typecheck clean" read was wrong). Fixed upstream on `fix/graph-interface-cellid` (commit `f6991d2`, one commit atop `121267b`; messages now name the embedding cell — the param's evident intent) and re-pinned `package.json`/`bun.lock` to `f6991d2`. Noted for Phase F: algal's own tsconfig lacks `noUnusedParameters`, so upstream `bun run check` doesn't guard the downstream-strictness boundary; also algal `origin/main` moved to `a77fb4a` (+190 files: expr cells, morphogen-compat removal) — re-pinning to head is a breaking sync decision deferred to Phase F. 139 focused tests green; both typechecks + eslint clean.
