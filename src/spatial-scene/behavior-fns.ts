import { z } from "zod"

import type { JsonValue } from "../code/contracts.js"
import type { SpatialBehaviorFnSignature, SpatialBehaviorPortMap } from "./behavior.js"

/**
 * The closed behavior-fn catalog organisms compose.
 *
 * Every entry is a pure, total-over-its-domain kernel: `(inputs) => outputs`
 * over bounded JSON, with no ambient state, clock, IO, or randomness beyond
 * the seeded draw streams its spec declares. The same function invoked twice
 * on equal inputs returns deeply equal outputs — replay determinism is the
 * contract that lets baked takes and receipts verify bit-for-bit.
 *
 * Conventions shared across the catalog:
 * - `window` — `{ticks: [{tUs, obs?}]}` with strictly increasing integer
 *   microsecond times. The host bake loop chunks dense simulation into
 *   windows so organisms need few `repeat` rounds.
 * - `emitted` — `[{tUs, channel, value}]` channel records; the uniform
 *   vocabulary the take compiler maps onto performance directives.
 * - `state` — opaque bounded JSON threaded by `carry`; kernels validate it
 *   before use and reject foreign shapes with a named error.
 */
export const SPATIAL_BEHAVIOR_FN_LIMITS = Object.freeze({
  drawsPerCall: 256,
  emittedPerCall: 4096,
  fsmStates: 16,
  fsmTransitions: 64,
  gazeTargets: 8,
  layers: 8,
  moodChannels: 8,
  obsFlags: 32,
  pairs: 8,
  phases: 8,
  positionsPerTick: 8,
  ticksPerWindow: 512,
})

export class SpatialBehaviorFnError extends Error {
  readonly code: "invalid-input" | "invalid-state" | "over-bound"
  constructor(code: "invalid-input" | "invalid-state" | "over-bound", detail: string) {
    super(detail)
    this.name = "SpatialBehaviorFnError"
    this.code = code
  }
}

type JsonObject = Record<string, JsonValue>

export interface SpatialBehaviorEmitted {
  readonly tUs: number
  readonly channel: string
  readonly value: JsonValue
}

export interface SpatialBehaviorFn {
  readonly signature: SpatialBehaviorFnSignature & { readonly cost: number }
  readonly invoke: (inputs: Readonly<Record<string, JsonValue>>) => Record<string, JsonValue>
}

const uint = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const channelName = z.string().regex(/^[a-z][a-z0-9_.-]{0,62}$/u)
const kebabName = z.string().regex(/^[a-z][a-z0-9-]{0,62}$/u)

function parseSpec<Schema extends z.ZodType>(schema: Schema, input: JsonValue | undefined, fn: string, field: string): z.infer<Schema> {
  const parsed = schema.safeParse(input ?? null)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new SpatialBehaviorFnError(
      field === "state" ? "invalid-state" : "invalid-input",
      `${fn}: ${field} invalid — ${issue?.message ?? "schema mismatch"}`,
    )
  }
  return parsed.data
}

function requireField(inputs: Readonly<Record<string, JsonValue>>, name: string, fn: string): JsonValue {
  const value = inputs[name]
  if (value === undefined) throw new SpatialBehaviorFnError("invalid-input", `${fn}: missing required input ${name}`)
  return value
}

// ------------------------------------------------------------- primitives ---

/** mulberry32 — deterministic 32-bit seeded draw stream. */
function rngNext(state: number): { value: number; next: number } {
  const next = (state + 0x6d2b79f5) >>> 0
  let t = next
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, next }
}

function drawStream(seed: number, count: number): { draws: number[]; next: number } {
  const draws: number[] = []
  let state = seed >>> 0
  for (let i = 0; i < count; i += 1) {
    const drawn = rngNext(state)
    draws.push(drawn.value)
    state = drawn.next
  }
  return { draws, next: state }
}

const obsSchema = z.strictObject({
  draw: z.number().min(0).max(1).optional(),
  flags: z.record(kebabName, z.boolean()).refine((flags) => Object.keys(flags).length <= SPATIAL_BEHAVIOR_FN_LIMITS.obsFlags, {
    message: `At most ${SPATIAL_BEHAVIOR_FN_LIMITS.obsFlags} obs flags per tick.`,
  }).optional(),
  distances: z.record(kebabName, z.number().min(0)).refine((distances) => Object.keys(distances).length <= SPATIAL_BEHAVIOR_FN_LIMITS.obsFlags, {
    message: `At most ${SPATIAL_BEHAVIOR_FN_LIMITS.obsFlags} obs distances per tick.`,
  }).optional(),
})

const windowSchema = z.strictObject({
  ticks: z.array(z.strictObject({
    tUs: uint,
    obs: obsSchema.optional(),
    positions: z.record(kebabName, z.tuple([z.number(), z.number(), z.number()])).refine(
      (positions) => Object.keys(positions).length <= SPATIAL_BEHAVIOR_FN_LIMITS.positionsPerTick,
      { message: `At most ${SPATIAL_BEHAVIOR_FN_LIMITS.positionsPerTick} positions per tick.` },
    ).optional(),
  })).min(1).max(SPATIAL_BEHAVIOR_FN_LIMITS.ticksPerWindow),
}).superRefine((window, context) => {
  for (let i = 1; i < window.ticks.length; i += 1) {
    const previous = window.ticks[i - 1]?.tUs ?? 0
    const current = window.ticks[i]?.tUs ?? 0
    if (current <= previous) {
      context.addIssue({ code: "custom", message: "window.ticks must be strictly increasing in tUs.", path: ["ticks", i, "tUs"] })
    }
  }
})
const emittedSchema = z.array(z.strictObject({
  tUs: uint,
  channel: channelName,
  value: z.unknown(),
})).max(SPATIAL_BEHAVIOR_FN_LIMITS.emittedPerCall)

function emit(emitted: SpatialBehaviorEmitted[], tUs: number, channel: string, value: JsonValue): void {
  if (emitted.length >= SPATIAL_BEHAVIOR_FN_LIMITS.emittedPerCall) {
    throw new SpatialBehaviorFnError("over-bound", `Emitted records exceed ${SPATIAL_BEHAVIOR_FN_LIMITS.emittedPerCall} per call.`)
  }
  emitted.push({ tUs, channel, value })
}

// ------------------------------------------------------------ rng.seeded ---

const rngInputs = z.strictObject({
  seed: uint,
  count: z.number().int().min(1).max(SPATIAL_BEHAVIOR_FN_LIMITS.drawsPerCall),
  stream: uint.optional(),
})

function rngSeeded(inputs: Readonly<Record<string, JsonValue>>): Record<string, JsonValue> {
  const spec = parseSpec(rngInputs, { seed: inputs.seed, count: inputs.count, stream: inputs.stream } as JsonObject, "rng.seeded.v1", "inputs")
  const salted = (spec.seed ^ Math.imul(spec.stream ?? 0, 0x9e3779b9)) >>> 0
  const { draws, next } = drawStream(salted, spec.count)
  return { draws, next }
}

// ---------------------------------------------------------- behavior.fsm ---

const fsmGuardSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("after"), us: uint }),
  z.strictObject({ kind: z.literal("chance"), threshold: z.number().min(0).max(1) }),
  z.strictObject({ kind: z.literal("flag"), name: kebabName }),
  z.strictObject({ kind: z.literal("clear"), name: kebabName }),
  z.strictObject({ kind: z.literal("always") }),
])

const fsmMachineSchema = z.strictObject({
  channel: channelName,
  states: z.array(kebabName).min(1).max(SPATIAL_BEHAVIOR_FN_LIMITS.fsmStates),
  transitions: z.array(z.strictObject({
    from: kebabName,
    to: kebabName,
    guard: fsmGuardSchema,
  })).max(SPATIAL_BEHAVIOR_FN_LIMITS.fsmTransitions),
  minDwellUs: uint.optional(),
}).superRefine((machine, context) => {
  const states = new Set(machine.states)
  if (states.size !== machine.states.length) {
    context.addIssue({ code: "custom", message: "machine.states must be unique.", path: ["states"] })
  }
  for (const [index, transition] of machine.transitions.entries()) {
    if (!states.has(transition.from)) context.addIssue({ code: "custom", message: `Transition from undeclared state ${transition.from}.`, path: ["transitions", index, "from"] })
    if (!states.has(transition.to)) context.addIssue({ code: "custom", message: `Transition to undeclared state ${transition.to}.`, path: ["transitions", index, "to"] })
  }
})
const fsmStateSchema = z.strictObject({ name: kebabName, enteredUs: uint })

function guardPasses(guard: z.infer<typeof fsmGuardSchema>, elapsedUs: number, obs: { draw?: number | undefined; flags?: Record<string, boolean> | undefined; distances?: Record<string, number> | undefined } | undefined, fn: string): boolean {
  switch (guard.kind) {
    case "after":
      return elapsedUs >= guard.us
    case "chance": {
      if (obs?.draw === undefined) {
        throw new SpatialBehaviorFnError("invalid-input", `${fn}: a chance guard fired with no obs.draw supplied for the tick`)
      }
      return obs.draw < guard.threshold
    }
    case "flag":
      return obs?.flags?.[guard.name] === true
    case "clear":
      return obs?.flags?.[guard.name] !== true
    case "always":
      return true
  }
}

function behaviorFsm(inputs: Readonly<Record<string, JsonValue>>): Record<string, JsonValue> {
  const machine = parseSpec(fsmMachineSchema, inputs.machine, "behavior.fsm.v1", "machine")
  const state = parseSpec(fsmStateSchema, requireField(inputs, "state", "behavior.fsm.v1"), "behavior.fsm.v1", "state")
  const window = parseSpec(windowSchema, requireField(inputs, "window", "behavior.fsm.v1"), "behavior.fsm.v1", "window")
  if (!machine.states.includes(state.name)) {
    throw new SpatialBehaviorFnError("invalid-state", `behavior.fsm.v1: state ${state.name} is not declared in machine.states`)
  }
  const emitted: SpatialBehaviorEmitted[] = []
  let current: { name: string; enteredUs: number } = { ...state }
  for (const tick of window.ticks) {
    const elapsedUs = Math.max(0, tick.tUs - current.enteredUs)
    if (machine.minDwellUs === undefined || elapsedUs >= machine.minDwellUs) {
      const fired = machine.transitions.find((transition) => transition.from === current.name && guardPasses(transition.guard, elapsedUs, tick.obs, "behavior.fsm.v1"))
      if (fired !== undefined) {
        emit(emitted, tick.tUs, `${machine.channel}.transition`, { from: current.name, to: fired.to, guard: fired.guard.kind })
        current = { name: fired.to, enteredUs: tick.tUs }
      }
    }
    emit(emitted, tick.tUs, machine.channel, current.name)
  }
  return { next: current as JsonObject, emitted: emitted as unknown as JsonValue[] as JsonObject[] }
}

// ---------------------------------------------------- behavior.expression ---

const expressionSpecSchema = z.strictObject({
  channel: channelName,
  seed: uint,
  blinkEveryUs: z.number().int().min(100_000).max(60_000_000),
  blinkUs: z.number().int().min(10_000).max(1_000_000),
  saccadeEveryUs: z.number().int().min(50_000).max(60_000_000),
  gazeTargets: z.array(kebabName).min(1).max(SPATIAL_BEHAVIOR_FN_LIMITS.gazeTargets),
  mood: z.record(kebabName, z.number().min(0).max(1)).refine((mood) => Object.keys(mood).length <= SPATIAL_BEHAVIOR_FN_LIMITS.moodChannels, {
    message: `At most ${SPATIAL_BEHAVIOR_FN_LIMITS.moodChannels} mood channels.`,
  }),
})

const expressionStateSchema = z.strictObject({
  rng: uint,
  nextBlinkUs: uint,
  nextSaccadeUs: uint,
  gazeIndex: z.number().int().min(0).max(SPATIAL_BEHAVIOR_FN_LIMITS.gazeTargets - 1),
})

function behaviorExpression(inputs: Readonly<Record<string, JsonValue>>): Record<string, JsonValue> {
  const spec = parseSpec(expressionSpecSchema, inputs.spec, "behavior.expression.v1", "spec")
  const state = parseSpec(expressionStateSchema, requireField(inputs, "state", "behavior.expression.v1"), "behavior.expression.v1", "state")
  const window = parseSpec(windowSchema, requireField(inputs, "window", "behavior.expression.v1"), "behavior.expression.v1", "window")
  if (state.gazeIndex >= spec.gazeTargets.length) {
    throw new SpatialBehaviorFnError("invalid-state", `behavior.expression.v1: state.gazeIndex ${state.gazeIndex} exceeds gazeTargets`)
  }
  const emitted: SpatialBehaviorEmitted[] = []
  let { rng, nextBlinkUs, nextSaccadeUs, gazeIndex } = state
  for (const tick of window.ticks) {
    if (tick.tUs >= nextSaccadeUs) {
      const draw = rngNext(rng)
      rng = draw.next
      const step = spec.gazeTargets.length === 1 ? 0 : 1 + Math.floor(draw.value * (spec.gazeTargets.length - 1))
      gazeIndex = (gazeIndex + step) % spec.gazeTargets.length
      const jitter = rngNext(rng)
      rng = jitter.next
      nextSaccadeUs = tick.tUs + spec.saccadeEveryUs + Math.floor(jitter.value * spec.saccadeEveryUs * 0.5)
    }
    if (tick.tUs >= nextBlinkUs + spec.blinkUs) {
      const jitter = rngNext(rng)
      rng = jitter.next
      nextBlinkUs = tick.tUs + spec.blinkEveryUs + Math.floor(jitter.value * spec.blinkEveryUs * 0.5)
    }
    const blinking = tick.tUs >= nextBlinkUs && tick.tUs < nextBlinkUs + spec.blinkUs
    emit(emitted, tick.tUs, `${spec.channel}.blink`, blinking ? 1 : 0)
    emit(emitted, tick.tUs, `${spec.channel}.gaze`, spec.gazeTargets[gazeIndex] ?? spec.gazeTargets[0] ?? "center")
    emit(emitted, tick.tUs, `${spec.channel}.mood`, spec.mood as JsonObject)
  }
  return { next: { rng, nextBlinkUs, nextSaccadeUs, gazeIndex } as JsonObject, emitted: emitted as unknown as JsonValue[] as JsonObject[] }
}

// ----------------------------------------------------- behavior.interact ---

const interactSpecSchema = z.strictObject({
  channel: channelName,
  phases: z.array(z.strictObject({
    name: kebabName,
    minUs: uint,
    emit: z.array(z.strictObject({ channel: channelName, value: z.unknown() })).max(8).optional(),
  })).min(1).max(SPATIAL_BEHAVIOR_FN_LIMITS.phases),
  loop: z.boolean().optional(),
})

const interactStateSchema = z.strictObject({
  phaseIndex: z.number().int().min(0).max(SPATIAL_BEHAVIOR_FN_LIMITS.phases - 1),
  enteredUs: uint,
})

function behaviorInteract(inputs: Readonly<Record<string, JsonValue>>): Record<string, JsonValue> {
  const spec = parseSpec(interactSpecSchema, inputs.spec, "behavior.interact.v1", "spec")
  const state = parseSpec(interactStateSchema, requireField(inputs, "state", "behavior.interact.v1"), "behavior.interact.v1", "state")
  const window = parseSpec(windowSchema, requireField(inputs, "window", "behavior.interact.v1"), "behavior.interact.v1", "window")
  if (state.phaseIndex >= spec.phases.length) {
    throw new SpatialBehaviorFnError("invalid-state", `behavior.interact.v1: state.phaseIndex ${state.phaseIndex} exceeds phases`)
  }
  const emitted: SpatialBehaviorEmitted[] = []
  let { phaseIndex, enteredUs } = state
  for (const tick of window.ticks) {
    let advanced = true
    while (advanced) {
      advanced = false
      const phase = spec.phases[phaseIndex]
      if (phase !== undefined && tick.tUs - enteredUs >= phase.minUs) {
        const last = phaseIndex + 1 >= spec.phases.length
        if (!last || spec.loop === true) {
          const nextIndex = last ? 0 : phaseIndex + 1
          const entered = spec.phases[nextIndex]
          emit(emitted, tick.tUs, `${spec.channel}.phase`, { from: phase.name, to: entered?.name ?? phase.name })
          for (const record of entered?.emit ?? []) {
            emit(emitted, tick.tUs, record.channel, record.value as JsonValue)
          }
          phaseIndex = nextIndex
          enteredUs = tick.tUs
          advanced = true
        }
      }
    }
    emit(emitted, tick.tUs, spec.channel, spec.phases[phaseIndex]?.name ?? "done")
  }
  return { next: { phaseIndex, enteredUs } as JsonObject, emitted: emitted as unknown as JsonValue[] as JsonObject[] }
}

// ------------------------------------------------------------ channel.emit ---

function channelEmit(inputs: Readonly<Record<string, JsonValue>>): Record<string, JsonValue> {
  const channel = parseSpec(channelName, inputs.channel, "channel.emit.v1", "channel")
  const window = parseSpec(windowSchema, requireField(inputs, "window", "channel.emit.v1"), "channel.emit.v1", "window")
  const value = inputs.value ?? null
  const emitted: SpatialBehaviorEmitted[] = []
  for (const tick of window.ticks) emit(emitted, tick.tUs, channel, value)
  return { emitted: emitted as unknown as JsonValue[] as JsonObject[] }
}

// ------------------------------------------------------------ scene.sample ---

const sampleSpecSchema = z.strictObject({
  pairs: z.array(z.strictObject({
    a: kebabName,
    b: kebabName,
    within: z.number().min(0).max(100),
  })).min(1).max(SPATIAL_BEHAVIOR_FN_LIMITS.pairs),
})

function sceneSample(inputs: Readonly<Record<string, JsonValue>>): Record<string, JsonValue> {
  const spec = parseSpec(sampleSpecSchema, inputs.spec, "scene.sample.v1", "spec")
  const window = parseSpec(windowSchema, requireField(inputs, "window", "scene.sample.v1"), "scene.sample.v1", "window")
  const ticks = window.ticks.map((tick) => {
    const positions = tick.positions ?? {}
    const flags: Record<string, boolean> = {}
    const distances: Record<string, number> = {}
    for (const pair of spec.pairs) {
      const a = positions[pair.a]
      const b = positions[pair.b]
      if (a === undefined || b === undefined) {
        throw new SpatialBehaviorFnError("invalid-input", `scene.sample.v1: pair ${pair.a}/${pair.b} missing positions at ${tick.tUs}us`)
      }
      const distance = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
      const key = `${pair.a}-${pair.b}`
      distances[`dist-${key}`] = Math.round(distance * 1_000_000) / 1_000_000
      flags[`contact-${key}`] = distance <= pair.within
    }
    const obs = {
      ...(tick.obs ?? {}),
      flags: { ...(tick.obs?.flags ?? {}), ...flags },
      distances: { ...(tick.obs?.distances ?? {}), ...distances },
    }
    return { tUs: tick.tUs, obs }
  })
  return { window: { ticks: ticks } as JsonObject }
}

// --------------------------------------------------------- behavior.combine ---

const combineInputs = z.strictObject({
  layers: z.array(z.strictObject({
    priority: z.number().int().min(0).max(1_000),
    emitted: emittedSchema,
  })).min(1).max(SPATIAL_BEHAVIOR_FN_LIMITS.layers),
})

function behaviorCombine(inputs: Readonly<Record<string, JsonValue>>): Record<string, JsonValue> {
  const spec = parseSpec(combineInputs, { layers: inputs.layers } as JsonObject, "behavior.combine.v1", "layers")
  const winners = new Map<string, { priority: number; order: number; record: { tUs: number; channel: string; value: JsonValue } }>()
  spec.layers.forEach((layer, layerIndex) => {
    for (const record of layer.emitted) {
      const key = `${record.tUs}${record.channel}`
      const held = winners.get(key)
      if (held === undefined || layer.priority > held.priority) {
        winners.set(key, { priority: layer.priority, order: layerIndex, record: record as { tUs: number; channel: string; value: JsonValue } })
      }
    }
  })
  const merged = [...winners.values()]
    .sort((left, right) => left.record.tUs - right.record.tUs
      || (left.record.channel < right.record.channel ? -1 : left.record.channel > right.record.channel ? 1 : 0)
      || left.order - right.order)
    .map((entry) => entry.record)
  if (merged.length > SPATIAL_BEHAVIOR_FN_LIMITS.emittedPerCall) {
    throw new SpatialBehaviorFnError("over-bound", `behavior.combine.v1: merged emissions exceed ${SPATIAL_BEHAVIOR_FN_LIMITS.emittedPerCall}`)
  }
  return { emitted: merged as unknown as JsonValue[] as JsonObject[] }
}

// ---------------------------------------------------------------- catalog ---

const ports = (map: Record<string, { type: "text" | "json" | "choice" | "ref"; optional?: boolean; many?: boolean }>): SpatialBehaviorPortMap => map

export const SPATIAL_BEHAVIOR_FNS: ReadonlyMap<string, SpatialBehaviorFn> = new Map(Object.entries({
  "rng.seeded.v1": {
    signature: {
      inputs: ports({ seed: { type: "json" }, count: { type: "json" }, stream: { type: "json", optional: true } }),
      outputs: ports({ draws: { type: "json" }, next: { type: "json" } }),
      cost: 50,
    },
    invoke: rngSeeded,
  },
  "behavior.fsm.v1": {
    signature: {
      inputs: ports({ machine: { type: "json" }, state: { type: "json" }, window: { type: "json" } }),
      outputs: ports({ next: { type: "json" }, emitted: { type: "json" } }),
      cost: 200,
    },
    invoke: behaviorFsm,
  },
  "behavior.expression.v1": {
    signature: {
      inputs: ports({ spec: { type: "json" }, state: { type: "json" }, window: { type: "json" } }),
      outputs: ports({ next: { type: "json" }, emitted: { type: "json" } }),
      cost: 200,
    },
    invoke: behaviorExpression,
  },
  "behavior.interact.v1": {
    signature: {
      inputs: ports({ spec: { type: "json" }, state: { type: "json" }, window: { type: "json" } }),
      outputs: ports({ next: { type: "json" }, emitted: { type: "json" } }),
      cost: 200,
    },
    invoke: behaviorInteract,
  },
  "channel.emit.v1": {
    signature: {
      inputs: ports({ channel: { type: "text" }, value: { type: "json", optional: true }, window: { type: "json" } }),
      outputs: ports({ emitted: { type: "json" } }),
      cost: 25,
    },
    invoke: channelEmit,
  },
  "scene.sample.v1": {
    signature: {
      inputs: ports({ spec: { type: "json" }, window: { type: "json" } }),
      outputs: ports({ window: { type: "json" } }),
      cost: 100,
    },
    invoke: sceneSample,
  },
  "behavior.combine.v1": {
    signature: {
      inputs: ports({ layers: { type: "json" } }),
      outputs: ports({ emitted: { type: "json" } }),
      cost: 50,
    },
    invoke: behaviorCombine,
  },
}))

/** Signature-only view of the catalog for `checkSpatialBehavior` admission. */
export function spatialBehaviorFnSignatures(): Map<string, SpatialBehaviorFnSignature> {
  const signatures = new Map<string, SpatialBehaviorFnSignature>()
  for (const [name, entry] of SPATIAL_BEHAVIOR_FNS) {
    signatures.set(name, { inputs: entry.signature.inputs, outputs: entry.signature.outputs })
  }
  return signatures
}
