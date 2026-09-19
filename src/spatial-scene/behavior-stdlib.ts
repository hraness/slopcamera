import { deepFreezeJson } from "../code/json-snapshot.js"
import { behaviorOrganismSha256, type SpatialBehaviorOrganism } from "./behavior.js"

/**
 * Standard-library organisms that compose the closed behavior-fn catalog
 * into common character-behavior patterns. Each organism is a documented
 * manifest that agents embed in `slopcamera.spatial-behavior` documents;
 * seed convention auto-binds `behavior.seed` at bake so seeded kernels
 * produce deterministic diversity across gallery variants.
 *
 * The four organisms:
 * - `locomotionFsm` — state-machine locomotion (idle/walk/run/etc.) over
 *   a tick window with seeded chance guards and configurable min-dwell.
 * - `expressionLayer` — blink/gaze/mood autonomous expression over ticks.
 * - `interactSequence` — linear phase sequencer for pickup/grasp/release
 *   interactions with emit-on-entry events.
 * - `combinedBehavior` — top-level composition of the three sub-behaviors
 *   via pairwise append into one emitted trace.
 *
 * Each follows the `repeat`+`carry`+`window.advance` accumulation pattern:
 * a sub-organism ticks one kernel over the head chunk of a carried window,
 * appends fresh emissions to a carried accumulator, and advances the window
 * until `done` — all within ALGAL's 16-round `maxRounds` bound.
 */

// --------------------------------------------------- shared sub-organisms ---

/**
 * Build one repeat-round sub-organism: advance the carried window, tick the
 * kernel over the head chunk, append fresh emissions to the carried accumulator.
 *
 * The kernel's spec (machine/spec) is a non-carried pass-through; state and
 * acc are carried outputs→inputs; the window advances via `rest`→`win`.
 */
interface AccTickPorts {
  readonly spec: string
  readonly state: string
  readonly window: string
  readonly next: string
  readonly emitted: string
}

const makeAccTickOrganism = (name: string, kernelFn: string, ports: AccTickPorts): SpatialBehaviorOrganism => deepFreezeJson({
  contract: "morphogen.organism.v1" as const,
  key: `organism:acc-tick-${name}`,
  name: `Acc tick ${name}`,
  cells: [
    {
      id: "in", kind: "input" as const,
      outputs: {
        [ports.state]: { type: "json" as const },
        acc: { type: "json" as const },
        win: { type: "json" as const },
        [ports.spec]: { type: "json" as const },
        step: { type: "json" as const },
      },
    },
    { id: "adv", kind: "fn" as const, fn: "window.advance.v1" },
    { id: "tick", kind: "fn" as const, fn: kernelFn },
    { id: "ap", kind: "fn" as const, fn: "emitted.append.v1" },
  ],
  edges: [
    { from: { cell: "in", port: "win" }, to: { cell: "adv", port: "window" } },
    { from: { cell: "in", port: "step" }, to: { cell: "adv", port: "step" } },
    { from: { cell: "adv", port: "head" }, to: { cell: "tick", port: ports.window } },
    { from: { cell: "in", port: ports.spec }, to: { cell: "tick", port: ports.spec } },
    { from: { cell: "in", port: ports.state }, to: { cell: "tick", port: ports.state } },
    { from: { cell: "in", port: "acc" }, to: { cell: "ap", port: "prior" } },
    { from: { cell: "tick", port: ports.emitted }, to: { cell: "ap", port: "fresh" } },
  ],
  interface: {
    inputs: {
      [ports.state]: { cell: "in", port: ports.state },
      acc: { cell: "in", port: "acc" },
      win: { cell: "in", port: "win" },
      [ports.spec]: { cell: "in", port: ports.spec },
      step: { cell: "in", port: "step" },
    },
    outputs: {
      next: { cell: "tick", port: ports.next },
      acc: { cell: "ap", port: "emitted" },
      rest: { cell: "adv", port: "rest" },
      done: { cell: "adv", port: "done" },
    },
  },
})

/**
 * Build the outer repeat-loop organism: carries `next→state`, `acc→acc`,
 * `rest→win`; passes the spec and step constants; exposes `seed` for the
 * document seed convention.
 */
const makeAccLoopOrganism = (
  name: string,
  accTickDigest: string,
  specPort: string,
  statePort: string,
): SpatialBehaviorOrganism => deepFreezeJson({
  contract: "morphogen.organism.v1" as const,
  key: `organism:acc-loop-${name}`,
  name: `Acc loop ${name}`,
  cells: [
    {
      id: "in", kind: "input" as const,
      outputs: {
        [statePort]: { type: "json" as const },
        [specPort]: { type: "json" as const },
        win: { type: "json" as const },
        seed: { type: "json" as const },
      },
    },
    {
      id: "cfg", kind: "const" as const,
      outputs: {
        step: { type: "json" as const, value: 3 },
        acc: { type: "json" as const, value: [] },
      },
    },
    {
      id: "loop", kind: "repeat" as const,
      manifest: accTickDigest,
      maxRounds: 16,
      carry: { next: statePort, acc: "acc", rest: "win" },
      until: { output: "done", equals: "true" },
    },
  ],
  edges: [
    { from: { cell: "in", port: statePort }, to: { cell: "loop", port: statePort } },
    { from: { cell: "in", port: specPort }, to: { cell: "loop", port: specPort } },
    { from: { cell: "in", port: "win" }, to: { cell: "loop", port: "win" } },
    { from: { cell: "cfg", port: "step" }, to: { cell: "loop", port: "step" } },
    { from: { cell: "cfg", port: "acc" }, to: { cell: "loop", port: "acc" } },
  ],
  interface: {
    inputs: {
      [statePort]: { cell: "in", port: statePort },
      [specPort]: { cell: "in", port: specPort },
      win: { cell: "in", port: "win" },
      seed: { cell: "in", port: "seed" },
    },
    outputs: { trace: { cell: "loop", port: "acc" } },
  },
})

// ---------------------------------------------------------- locomotion fsm ---

const locomotionAccTick = makeAccTickOrganism("locomotion", "behavior.fsm.v1", {
  spec: "machine", state: "state", window: "window", next: "next", emitted: "emitted",
})

const LOCOMOTION_ACC_TICK_DIGEST = behaviorOrganismSha256(locomotionAccTick)

const locomotionAccLoop = makeAccLoopOrganism("locomotion", LOCOMOTION_ACC_TICK_DIGEST, "machine", "state")

const LOCOMOTION_ACC_LOOP_DIGEST = behaviorOrganismSha256(locomotionAccLoop)

/**
 * Locomotion FSM organism: a `repeat`+`carry` loop driving `behavior.fsm.v1`
 * over chunked windows. Entry inputs: `machine` (FSM machine spec), `state`
 * (initial FSM state), `win` (tick window), `seed` (document seed, auto-bound).
 * Entry output: `trace` — accumulated emitted records for `<channel>` and
 * `<channel>.transition` channels.
 */
export const SPATIAL_BEHAVIOR_STDLIB_LOCOMOTION_FSM = deepFreezeJson({
  organisms: {
    [LOCOMOTION_ACC_TICK_DIGEST]: locomotionAccTick,
    [LOCOMOTION_ACC_LOOP_DIGEST]: locomotionAccLoop,
  },
  entry: LOCOMOTION_ACC_LOOP_DIGEST,
  /** Interface inputs the doc must supply via `args`. */
  inputs: { state: "json" as const, machine: "json" as const, win: "json" as const, seed: "json" as const },
  /** Interface outputs the bake surface extracts. */
  outputs: { trace: "json" as const },
})

// ------------------------------------------------------ expression layer ---

const expressionAccTick = makeAccTickOrganism("expression", "behavior.expression.v1", {
  spec: "spec", state: "state", window: "window", next: "next", emitted: "emitted",
})

const EXPRESSION_ACC_TICK_DIGEST = behaviorOrganismSha256(expressionAccTick)

const expressionAccLoop = makeAccLoopOrganism("expression", EXPRESSION_ACC_TICK_DIGEST, "spec", "state")

const EXPRESSION_ACC_LOOP_DIGEST = behaviorOrganismSha256(expressionAccLoop)

/**
 * Expression layer organism: blink, gaze, and mood over chunked tick windows
 * via `behavior.expression.v1`. Entry inputs: `spec` (expression config),
 * `state` (initial expression state), `win` (tick window), `seed` (auto-bound).
 */
export const SPATIAL_BEHAVIOR_STDLIB_EXPRESSION = deepFreezeJson({
  organisms: {
    [EXPRESSION_ACC_TICK_DIGEST]: expressionAccTick,
    [EXPRESSION_ACC_LOOP_DIGEST]: expressionAccLoop,
  },
  entry: EXPRESSION_ACC_LOOP_DIGEST,
  inputs: { state: "json" as const, spec: "json" as const, win: "json" as const, seed: "json" as const },
  outputs: { trace: "json" as const },
})

// ------------------------------------------------- interaction sequence ---

const interactAccTick = makeAccTickOrganism("interact", "behavior.interact.v1", {
  spec: "spec", state: "state", window: "window", next: "next", emitted: "emitted",
})

const INTERACT_ACC_TICK_DIGEST = behaviorOrganismSha256(interactAccTick)

const interactAccLoop = makeAccLoopOrganism("interact", INTERACT_ACC_TICK_DIGEST, "spec", "state")

const INTERACT_ACC_LOOP_DIGEST = behaviorOrganismSha256(interactAccLoop)

/**
 * Interaction sequence organism: linear phase sequencer via
 * `behavior.interact.v1`. Entry inputs: `spec` (interaction phases),
 * `state` (initial phase state), `win` (tick window), `seed` (auto-bound).
 */
export const SPATIAL_BEHAVIOR_STDLIB_INTERACT = deepFreezeJson({
  organisms: {
    [INTERACT_ACC_TICK_DIGEST]: interactAccTick,
    [INTERACT_ACC_LOOP_DIGEST]: interactAccLoop,
  },
  entry: INTERACT_ACC_LOOP_DIGEST,
  inputs: { state: "json" as const, spec: "json" as const, win: "json" as const, seed: "json" as const },
  outputs: { trace: "json" as const },
})

// --------------------------------------------------- combined behavior ---

/**
 * Combined behavior organism: composes locomotion, expression, and interaction
 * sub-organisms into a single merged emitted trace. Each sub-organism runs
 * its own `repeat`+`carry` loop; the combined organism chains pairwise
 * `emitted.append` to concatenate the three traces into sorted order.
 *
 * Entry inputs: `loco-state`, `loco-machine`, `expr-state`, `expr-spec`,
 * `interact-state`, `interact-spec`, `win` (shared tick window), `seed`.
 * Entry output: `trace` — merged emitted records sorted by (tUs, channel).
 */

const combinedOrganism: SpatialBehaviorOrganism = deepFreezeJson({
  contract: "morphogen.organism.v1" as const,
  key: "organism:combined-behavior",
  name: "Combined behavior",
  cells: [
    {
      id: "in", kind: "input" as const,
      outputs: {
        "loco-state": { type: "json" as const },
        "loco-machine": { type: "json" as const },
        "expr-state": { type: "json" as const },
        "expr-spec": { type: "json" as const },
        "interact-state": { type: "json" as const },
        "interact-spec": { type: "json" as const },
        win: { type: "json" as const },
        seed: { type: "json" as const },
      },
    },
    { id: "loco", kind: "organism" as const, manifest: LOCOMOTION_ACC_LOOP_DIGEST },
    { id: "expr", kind: "organism" as const, manifest: EXPRESSION_ACC_LOOP_DIGEST },
    { id: "interact", kind: "organism" as const, manifest: INTERACT_ACC_LOOP_DIGEST },
    { id: "ap-le", kind: "fn" as const, fn: "emitted.append.v1" },
    { id: "ap-lei", kind: "fn" as const, fn: "emitted.append.v1" },
  ],
  edges: [
    // Locomotion sub
    { from: { cell: "in", port: "loco-state" }, to: { cell: "loco", port: "state" } },
    { from: { cell: "in", port: "loco-machine" }, to: { cell: "loco", port: "machine" } },
    { from: { cell: "in", port: "win" }, to: { cell: "loco", port: "win" } },
    { from: { cell: "in", port: "seed" }, to: { cell: "loco", port: "seed" } },
    // Expression sub
    { from: { cell: "in", port: "expr-state" }, to: { cell: "expr", port: "state" } },
    { from: { cell: "in", port: "expr-spec" }, to: { cell: "expr", port: "spec" } },
    { from: { cell: "in", port: "win" }, to: { cell: "expr", port: "win" } },
    { from: { cell: "in", port: "seed" }, to: { cell: "expr", port: "seed" } },
    // Interact sub
    { from: { cell: "in", port: "interact-state" }, to: { cell: "interact", port: "state" } },
    { from: { cell: "in", port: "interact-spec" }, to: { cell: "interact", port: "spec" } },
    { from: { cell: "in", port: "win" }, to: { cell: "interact", port: "win" } },
    { from: { cell: "in", port: "seed" }, to: { cell: "interact", port: "seed" } },
    // Chain appends: loco+expr → ap-le, then ap-le+interact → ap-lei
    { from: { cell: "loco", port: "trace" }, to: { cell: "ap-le", port: "prior" } },
    { from: { cell: "expr", port: "trace" }, to: { cell: "ap-le", port: "fresh" } },
    { from: { cell: "ap-le", port: "emitted" }, to: { cell: "ap-lei", port: "prior" } },
    { from: { cell: "interact", port: "trace" }, to: { cell: "ap-lei", port: "fresh" } },
  ],
  interface: {
    inputs: {
      "loco-state": { cell: "in", port: "loco-state" },
      "loco-machine": { cell: "in", port: "loco-machine" },
      "expr-state": { cell: "in", port: "expr-state" },
      "expr-spec": { cell: "in", port: "expr-spec" },
      "interact-state": { cell: "in", port: "interact-state" },
      "interact-spec": { cell: "in", port: "interact-spec" },
      win: { cell: "in", port: "win" },
      seed: { cell: "in", port: "seed" },
    },
    outputs: { trace: { cell: "ap-lei", port: "emitted" } },
  },
})

const COMBINED_DIGEST = behaviorOrganismSha256(combinedOrganism)

export const SPATIAL_BEHAVIOR_STDLIB_COMBINED = deepFreezeJson({
  organisms: {
    ...SPATIAL_BEHAVIOR_STDLIB_LOCOMOTION_FSM.organisms,
    ...SPATIAL_BEHAVIOR_STDLIB_EXPRESSION.organisms,
    ...SPATIAL_BEHAVIOR_STDLIB_INTERACT.organisms,
    [COMBINED_DIGEST]: combinedOrganism,
  },
  entry: COMBINED_DIGEST,
  inputs: {
    "loco-state": "json" as const,
    "loco-machine": "json" as const,
    "expr-state": "json" as const,
    "expr-spec": "json" as const,
    "interact-state": "json" as const,
    "interact-spec": "json" as const,
    win: "json" as const,
    seed: "json" as const,
  },
  outputs: { trace: "json" as const },
})
