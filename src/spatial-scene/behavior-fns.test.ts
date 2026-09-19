import { describe, expect, test } from "bun:test"

import { canonicalJson } from "../code/canonical-json.js"
import type { JsonValue } from "../code/contracts.js"
import {
  SPATIAL_BEHAVIOR_FNS,
  SpatialBehaviorFnError,
  spatialBehaviorFnSignatures,
} from "./behavior-fns"

function invoke(name: string, inputs: Record<string, JsonValue>): Record<string, JsonValue> {
  const entry = SPATIAL_BEHAVIOR_FNS.get(name)
  if (entry === undefined) throw new Error(`catalog missing ${name}`)
  return entry.invoke(inputs)
}

function window(ticks: number[], obsPerTick?: (index: number) => Record<string, JsonValue>): JsonValue {
  return {
    ticks: ticks.map((tUs, index) => ({
      tUs,
      ...(obsPerTick === undefined ? {} : { obs: obsPerTick(index) }),
    })),
  }
}

const fsmMachine = {
  channel: "locomotion",
  states: ["idle", "walk", "sit"],
  transitions: [
    { from: "idle", to: "walk", guard: { kind: "after", us: 100_000 } },
    { from: "walk", to: "sit", guard: { kind: "flag", name: "tired" } },
    { from: "walk", to: "idle", guard: { kind: "clear", name: "moving" } },
    { from: "sit", to: "idle", guard: { kind: "chance", threshold: 0.5 } },
  ],
}

describe("catalog shape", () => {
  test("every catalog fn exposes bounded signatures and an invoke kernel", () => {
    expect(SPATIAL_BEHAVIOR_FNS.size).toBe(7)
    for (const [name, entry] of SPATIAL_BEHAVIOR_FNS) {
      expect(name).toMatch(/\.v[0-9]+$/)
      expect(Object.keys(entry.signature.inputs).length).toBeGreaterThan(0)
      expect(Object.keys(entry.signature.outputs).length).toBeGreaterThan(0)
      expect(entry.signature.cost).toBeGreaterThan(0)
    }
  })

  test("signature view drops implementations for admission checks", () => {
    const signatures = spatialBehaviorFnSignatures()
    expect(signatures.size).toBe(SPATIAL_BEHAVIOR_FNS.size)
    expect(signatures.get("behavior.fsm.v1")).toEqual({
      inputs: { machine: { type: "json" }, state: { type: "json" }, window: { type: "json" } },
      outputs: { next: { type: "json" }, emitted: { type: "json" } },
    })
  })
})

describe("determinism laws", () => {
  const cases: [string, Record<string, JsonValue>][] = [
    ["rng.seeded.v1", { seed: 42, count: 8 }],
    ["rng.seeded.v1", { seed: 42, count: 8, stream: 3 }],
    ["behavior.fsm.v1", {
      machine: fsmMachine,
      state: { name: "idle", enteredUs: 0 },
      window: window([0, 50_000, 150_000, 250_000], () => ({ draw: 0.25, flags: { moving: true } })),
    }],
    ["behavior.expression.v1", {
      spec: { channel: "expression", seed: 7, blinkEveryUs: 200_000, blinkUs: 50_000, saccadeEveryUs: 150_000, gazeTargets: ["lead", "prop"], mood: { calm: 0.8, alert: 0.2 } },
      state: { rng: 7, nextBlinkUs: 80_000, nextSaccadeUs: 120_000, gazeIndex: 0 },
      window: window([0, 100_000, 200_000, 300_000]),
    }],
    ["behavior.interact.v1", {
      spec: { channel: "interact", phases: [{ name: "approach", minUs: 100_000 }, { name: "grasp", minUs: 50_000, emit: [{ channel: "interact.attach", value: { target: "cup" } }] }] },
      state: { phaseIndex: 0, enteredUs: 0 },
      window: window([0, 120_000, 180_000]),
    }],
    ["channel.emit.v1", { channel: "ambient.loop", value: "steam", window: window([0, 33_333]) }],
    ["scene.sample.v1", {
      spec: { pairs: [{ a: "hero", b: "cup", within: 0.5 }] },
      window: {
        ticks: [
          { tUs: 0, positions: { hero: [0, 0, 0], cup: [1, 0, 0] } },
          { tUs: 100, positions: { hero: [0, 0, 0], cup: [0.4, 0, 0] } },
        ],
      },
    }],
    ["behavior.combine.v1", {
      layers: [
        { priority: 1, emitted: [{ tUs: 0, channel: "a", value: "low" }] },
        { priority: 5, emitted: [{ tUs: 0, channel: "a", value: "high" }, { tUs: 0, channel: "b", value: "keep" }] },
      ],
    }],
  ]

  test.each(cases)("%s returns deeply equal and canonically identical outputs on repeated invokes", (name, inputs) => {
    const first = invoke(name, inputs)
    const second = invoke(name, inputs)
    expect(second).toEqual(first)
    expect(canonicalJson(second)).toBe(canonicalJson(first))
  })

  test("different seeds produce controlled deterministic differences", () => {
    const a = invoke("rng.seeded.v1", { seed: 1, count: 4 })
    const b = invoke("rng.seeded.v1", { seed: 2, count: 4 })
    expect(a.draws).not.toEqual(b.draws)
    expect(invoke("rng.seeded.v1", { seed: 1, count: 4 }).draws).toEqual(a.draws)
    const s1 = invoke("rng.seeded.v1", { seed: 1, count: 4, stream: 0 })
    const s2 = invoke("rng.seeded.v1", { seed: 1, count: 4, stream: 1 })
    expect(s1.draws).not.toEqual(s2.draws)
  })

  test("rng draws land in [0,1) and chain through next", () => {
    const first = invoke("rng.seeded.v1", { seed: 9, count: 3 })
    const chained = invoke("rng.seeded.v1", { seed: first.next as number, count: 3 })
    const whole = invoke("rng.seeded.v1", { seed: 9, count: 6 })
    expect([...(first.draws as number[]), ...(chained.draws as number[])]).toEqual(whole.draws as number[])
    for (const draw of whole.draws as number[]) {
      expect(draw).toBeGreaterThanOrEqual(0)
      expect(draw).toBeLessThan(1)
    }
  })
})

describe("behavior.fsm.v1", () => {
  test("transitions fire on after-guards and emit state plus transition records", () => {
    const out = invoke("behavior.fsm.v1", {
      machine: fsmMachine,
      state: { name: "idle", enteredUs: 0 },
      window: window([0, 50_000, 150_000], () => ({ flags: { moving: true } })),
    })
    const emitted = out.emitted as { tUs: number; channel: string; value: JsonValue }[]
    const states = emitted.filter((record) => record.channel === "locomotion").map((record) => record.value)
    expect(states).toEqual(["idle", "idle", "walk"])
    const transition = emitted.find((record) => record.channel === "locomotion.transition")
    expect(transition).toMatchObject({ tUs: 150_000, value: { from: "idle", to: "walk", guard: "after" } })
    expect(out.next).toEqual({ name: "walk", enteredUs: 150_000 })
  })

  test("flag and clear guards route on obs flags", () => {
    const flags = (index: number) => ({ flags: { moving: index !== 2 } })
    const out = invoke("behavior.fsm.v1", {
      machine: fsmMachine,
      state: { name: "walk", enteredUs: 0 },
      window: window([0, 50_000, 100_000], flags),
    })
    const states = (out.emitted as { channel: string; value: JsonValue }[])
      .filter((record) => record.channel === "locomotion").map((record) => record.value)
    expect(states).toEqual(["walk", "walk", "idle"])
  })

  test("minDwellUs suppresses transitions inside the dwell window", () => {
    const out = invoke("behavior.fsm.v1", {
      machine: { ...fsmMachine, minDwellUs: 200_000 },
      state: { name: "idle", enteredUs: 0 },
      window: window([0, 150_000, 250_000], () => ({ flags: { moving: true } })),
    })
    const states = (out.emitted as { channel: string; value: JsonValue }[])
      .filter((record) => record.channel === "locomotion").map((record) => record.value)
    expect(states).toEqual(["idle", "idle", "walk"])
  })

  test("chance guards require obs.draw on every tick", () => {
    expect(() => invoke("behavior.fsm.v1", {
      machine: fsmMachine,
      state: { name: "sit", enteredUs: 0 },
      window: window([0, 50_000]),
    })).toThrow(SpatialBehaviorFnError)
    const out = invoke("behavior.fsm.v1", {
      machine: fsmMachine,
      state: { name: "sit", enteredUs: 0 },
      window: window([0, 50_000], () => ({ draw: 0.9 })),
    })
    expect((out.next as { name: string }).name).toBe("sit")
  })

  test("state threads across windows for continuous machines", () => {
    const first = invoke("behavior.fsm.v1", {
      machine: fsmMachine,
      state: { name: "idle", enteredUs: 0 },
      window: window([0, 50_000], () => ({ flags: { moving: true } })),
    })
    const second = invoke("behavior.fsm.v1", {
      machine: fsmMachine,
      state: first.next as JsonValue,
      window: window([150_000], () => ({ flags: { moving: true } })),
    })
    const oneShot = invoke("behavior.fsm.v1", {
      machine: fsmMachine,
      state: { name: "idle", enteredUs: 0 },
      window: window([0, 50_000, 150_000], () => ({ flags: { moving: true } })),
    })
    const splitEmitted = [
      ...(first.emitted as unknown[]),
      ...(second.emitted as unknown[]),
    ]
    expect(splitEmitted).toEqual(oneShot.emitted as unknown[])
    expect(second.next as JsonValue | undefined).toEqual(oneShot.next)
  })

  test("rejects undeclared machine states and foreign state shapes", () => {
    expect(() => invoke("behavior.fsm.v1", {
      machine: fsmMachine,
      state: { name: "fly", enteredUs: 0 },
      window: window([0], () => ({ flags: {} })),
    })).toThrow(/not declared/)
    expect(() => invoke("behavior.fsm.v1", {
      machine: fsmMachine,
      state: { bogus: true },
      window: window([0]),
    })).toThrow(SpatialBehaviorFnError)
  })
})

describe("behavior.expression.v1", () => {
  const spec = {
    channel: "expression", seed: 3,
    blinkEveryUs: 200_000, blinkUs: 60_000, saccadeEveryUs: 150_000,
    gazeTargets: ["lead", "prop", "camera"], mood: { calm: 1 },
  }
  const state = { rng: 3, nextBlinkUs: 100_000, nextSaccadeUs: 120_000, gazeIndex: 0 }

  test("blink pulses honor the blink window duration", () => {
    const out = invoke("behavior.expression.v1", { spec, state, window: window([0, 100_000, 140_000, 200_000]) })
    const blinks = (out.emitted as { tUs: number; channel: string; value: JsonValue }[])
      .filter((record) => record.channel === "expression.blink").map((record) => record.value)
    expect(blinks).toEqual([0, 1, 1, 0])
  })

  test("gaze saccades advance deterministically through declared targets", () => {
    const out = invoke("behavior.expression.v1", { spec, state, window: window([0, 120_000, 300_000, 600_000]) })
    const gazes = (out.emitted as { channel: string; value: JsonValue }[])
      .filter((record) => record.channel === "expression.gaze").map((record) => record.value)
    expect(gazes[0]).toBe("lead")
    expect(new Set(gazes).size).toBeGreaterThan(1)
    expect(gazes.every((gaze) => spec.gazeTargets.includes(gaze as string))).toBe(true)
  })

  test("rng state threads so schedules stay continuous across windows", () => {
    const first = invoke("behavior.expression.v1", { spec, state, window: window([0, 100_000]) })
    const second = invoke("behavior.expression.v1", {
      spec,
      state: first.next as JsonValue,
      window: window([200_000, 300_000, 400_000]),
    })
    const oneShot = invoke("behavior.expression.v1", { spec, state, window: window([0, 100_000, 200_000, 300_000, 400_000]) })
    expect([...(first.emitted as unknown[]), ...(second.emitted as unknown[])]).toEqual(oneShot.emitted as unknown[])
    expect(second.next as JsonValue | undefined).toEqual(oneShot.next)
  })
})

describe("behavior.interact.v1", () => {
  const spec = {
    channel: "interact",
    phases: [
      { name: "approach", minUs: 100_000 },
      { name: "grasp", minUs: 50_000, emit: [{ channel: "interact.attach", value: { target: "cup" } }] },
      { name: "hold", minUs: 1_000_000 },
    ],
  }

  test("phases advance by minUs and emit declared events on entry", () => {
    const out = invoke("behavior.interact.v1", {
      spec,
      state: { phaseIndex: 0, enteredUs: 0 },
      window: window([0, 120_000, 200_000]),
    })
    const emitted = out.emitted as { channel: string; value: JsonValue }[]
    const phases = emitted.filter((record) => record.channel === "interact").map((record) => record.value)
    expect(phases).toEqual(["approach", "grasp", "hold"])
    const attach = emitted.find((record) => record.channel === "interact.attach")
    expect(attach).toMatchObject({ tUs: 120_000, value: { target: "cup" } })
    expect(out.next).toMatchObject({ phaseIndex: 2 })
  })

  test("clamps on the last phase unless loop wraps", () => {
    const longWindow = window([0, 120_000, 200_000, 2_000_000])
    const clamped = invoke("behavior.interact.v1", { spec, state: { phaseIndex: 0, enteredUs: 0 }, window: longWindow })
    expect((clamped.next as { phaseIndex: number }).phaseIndex).toBe(2)
    const looped = invoke("behavior.interact.v1", {
      spec: { ...spec, loop: true },
      state: { phaseIndex: 0, enteredUs: 0 },
      window: longWindow,
    })
    expect((looped.next as { phaseIndex: number }).phaseIndex).toBe(0)
  })
})

describe("channel.emit.v1", () => {
  test("emits the bound value at every tick", () => {
    const out = invoke("channel.emit.v1", { channel: "ambient.hum", value: 0.5, window: window([0, 33_333, 66_666]) })
    expect(out.emitted).toEqual([
      { tUs: 0, channel: "ambient.hum", value: 0.5 },
      { tUs: 33_333, channel: "ambient.hum", value: 0.5 },
      { tUs: 66_666, channel: "ambient.hum", value: 0.5 },
    ])
  })
})

describe("scene.sample.v1", () => {
  const spec = { pairs: [{ a: "hero", b: "cup", within: 0.5 }] }

  test("computes distances and contact flags from provided positions", () => {
    const out = invoke("scene.sample.v1", {
      spec,
      window: {
        ticks: [
          { tUs: 0, positions: { hero: [0, 0, 0], cup: [1, 0, 0] } },
          { tUs: 100, positions: { hero: [0, 0, 0], cup: [0.4, 0, 0] } },
        ],
      },
    })
    const ticks = (out.window as { ticks: { tUs: number; obs: { flags: Record<string, boolean>; distances: Record<string, number> } }[] }).ticks
    expect(ticks[0]?.obs.distances["dist-hero-cup"]).toBe(1)
    expect(ticks[0]?.obs.flags["contact-hero-cup"]).toBe(false)
    expect(ticks[1]?.obs.distances["dist-hero-cup"]).toBeCloseTo(0.4, 5)
    expect(ticks[1]?.obs.flags["contact-hero-cup"]).toBe(true)
  })

  test("merges computed obs with existing flags", () => {
    const out = invoke("scene.sample.v1", {
      spec,
      window: {
        ticks: [{ tUs: 0, positions: { hero: [0, 0, 0], cup: [1, 0, 0] }, obs: { flags: { moving: true } } }],
      },
    })
    const obs = (out.window as { ticks: { obs: { flags: Record<string, boolean> } }[] }).ticks[0]?.obs
    expect(obs?.flags["moving"]).toBe(true)
    expect(obs?.flags["contact-hero-cup"]).toBe(false)
  })

  test("missing positions fail with a named error", () => {
    expect(() => invoke("scene.sample.v1", {
      spec,
      window: { ticks: [{ tUs: 0, positions: { hero: [0, 0, 0] } }] },
    })).toThrow(/missing positions/)
  })
})

describe("behavior.combine.v1", () => {
  test("highest priority wins per (tUs, channel) with deterministic order", () => {
    const out = invoke("behavior.combine.v1", {
      layers: [
        { priority: 1, emitted: [{ tUs: 0, channel: "a", value: "low" }, { tUs: 0, channel: "b", value: "low-b" }] },
        { priority: 9, emitted: [{ tUs: 0, channel: "a", value: "high" }] },
      ],
    })
    expect(out.emitted).toEqual([
      { tUs: 0, channel: "a", value: "high" },
      { tUs: 0, channel: "b", value: "low-b" },
    ])
  })

  test("equal priority keeps the earlier layer", () => {
    const out = invoke("behavior.combine.v1", {
      layers: [
        { priority: 5, emitted: [{ tUs: 0, channel: "a", value: "first" }] },
        { priority: 5, emitted: [{ tUs: 0, channel: "a", value: "second" }] },
      ],
    })
    expect(out.emitted).toEqual([{ tUs: 0, channel: "a", value: "first" }])
  })
})

describe("bounds and totality", () => {
  test("rejects non-increasing tick windows", () => {
    expect(() => invoke("channel.emit.v1", { channel: "a", value: 1, window: { ticks: [{ tUs: 100 }, { tUs: 100 }] } })).toThrow(SpatialBehaviorFnError)
    expect(() => invoke("channel.emit.v1", { channel: "a", value: 1, window: { ticks: [{ tUs: 200 }, { tUs: 100 }] } })).toThrow(SpatialBehaviorFnError)
  })

  test("rejects over-bound draw counts and foreign inputs", () => {
    expect(() => invoke("rng.seeded.v1", { seed: 1, count: 300 })).toThrow(SpatialBehaviorFnError)
    expect(() => invoke("rng.seeded.v1", { seed: "x", count: 4 })).toThrow(SpatialBehaviorFnError)
    expect(() => invoke("rng.seeded.v1", { count: 4 })).toThrow(SpatialBehaviorFnError)
  })

  test("fsm rejects machines referencing undeclared states", () => {
    expect(() => invoke("behavior.fsm.v1", {
      machine: { channel: "m", states: ["a"], transitions: [{ from: "a", to: "ghost", guard: { kind: "always" } }] },
      state: { name: "a", enteredUs: 0 },
      window: window([0]),
    })).toThrow(/undeclared state/)
  })

  test("interact rejects phaseIndex outside declared phases", () => {
    expect(() => invoke("behavior.interact.v1", {
      spec: { channel: "i", phases: [{ name: "a", minUs: 0 }] },
      state: { phaseIndex: 4, enteredUs: 0 },
      window: window([0]),
    })).toThrow(SpatialBehaviorFnError)
  })
})
