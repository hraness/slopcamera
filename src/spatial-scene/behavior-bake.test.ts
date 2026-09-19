import { describe, expect, test } from "bun:test"

import { perspectiveFromFov } from "./build"
import { behaviorOrganismSha256, type SpatialBehaviorOrganism } from "./behavior"
import { bakeSpatialBehavior } from "./behavior-bake"
import { spatialValueSha256, parseSpatialScene, SpatialSceneError } from "./identity"

// Organisms below are authored against the bake-safe profile; closure keys
// are computed through the same ALGAL-mirroring projection the checker and
// the runtime CAS use, so nothing here needs golden digests.

const FSM_MACHINE = {
  channel: "locomotion",
  states: ["idle", "walk", "done"],
  transitions: [
    { from: "idle", to: "walk", guard: { kind: "always" } },
    { from: "walk", to: "done", guard: { kind: "after", us: 100_000 } },
  ],
}

const TICKS = [0, 40_000, 80_000, 120_000, 160_000, 200_000].map((tUs) => ({ tUs }))

const emitOrganism: SpatialBehaviorOrganism = {
  contract: "morphogen.organism.v1",
  key: "organism:emit-window",
  name: "Emit window",
  cells: [
    { id: "in", kind: "input", outputs: { win: { type: "json" } } },
    {
      id: "cfg", kind: "const",
      outputs: {
        channel: { type: "text", value: "alert" },
        value: { type: "json", value: "ping" },
      },
    },
    { id: "emit", kind: "fn", fn: "channel.emit.v1" },
  ],
  edges: [
    { from: { cell: "in", port: "win" }, to: { cell: "emit", port: "window" } },
    { from: { cell: "cfg", port: "channel" }, to: { cell: "emit", port: "channel" } },
    { from: { cell: "cfg", port: "value" }, to: { cell: "emit", port: "value" } },
  ],
  interface: {
    inputs: { win: { cell: "in", port: "win" } },
    outputs: { out: { cell: "emit", port: "emitted" } },
  },
}

// One repeat round: advance the carried window, tick the fsm over the head
// chunk, append fresh emissions to the carried accumulator.
const accTickOrganism: SpatialBehaviorOrganism = {
  contract: "morphogen.organism.v1",
  key: "organism:acc-tick",
  name: "Accumulating tick",
  cells: [
    {
      id: "in", kind: "input",
      outputs: {
        state: { type: "json" }, acc: { type: "json" }, win: { type: "json" },
        machine: { type: "json" }, step: { type: "json" },
      },
    },
    { id: "adv", kind: "fn", fn: "window.advance.v1" },
    { id: "tick", kind: "fn", fn: "behavior.fsm.v1" },
    { id: "ap", kind: "fn", fn: "emitted.append.v1" },
  ],
  edges: [
    { from: { cell: "in", port: "win" }, to: { cell: "adv", port: "window" } },
    { from: { cell: "in", port: "step" }, to: { cell: "adv", port: "step" } },
    { from: { cell: "adv", port: "head" }, to: { cell: "tick", port: "window" } },
    { from: { cell: "in", port: "machine" }, to: { cell: "tick", port: "machine" } },
    { from: { cell: "in", port: "state" }, to: { cell: "tick", port: "state" } },
    { from: { cell: "in", port: "acc" }, to: { cell: "ap", port: "prior" } },
    { from: { cell: "tick", port: "emitted" }, to: { cell: "ap", port: "fresh" } },
  ],
  interface: {
    inputs: {
      state: { cell: "in", port: "state" },
      acc: { cell: "in", port: "acc" },
      win: { cell: "in", port: "win" },
      machine: { cell: "in", port: "machine" },
      step: { cell: "in", port: "step" },
    },
    outputs: {
      next: { cell: "tick", port: "next" },
      acc: { cell: "ap", port: "emitted" },
      rest: { cell: "adv", port: "rest" },
      done: { cell: "adv", port: "done" },
    },
  },
}

const EMIT_DIGEST = behaviorOrganismSha256(emitOrganism)
const ACC_TICK_DIGEST = behaviorOrganismSha256(accTickOrganism)

const accLoopOrganism: SpatialBehaviorOrganism = {
  contract: "morphogen.organism.v1",
  key: "organism:acc-loop",
  name: "Accumulating loop",
  cells: [
    { id: "in", kind: "input", outputs: { state: { type: "json" }, win: { type: "json" } } },
    {
      id: "cfg", kind: "const",
      outputs: {
        machine: { type: "json", value: FSM_MACHINE },
        step: { type: "json", value: 2 },
        acc: { type: "json", value: [] },
      },
    },
    {
      id: "loop", kind: "repeat",
      manifest: ACC_TICK_DIGEST,
      maxRounds: 8,
      carry: { next: "state", acc: "acc", rest: "win" },
      until: { output: "done", equals: "true" },
    },
  ],
  edges: [
    { from: { cell: "in", port: "state" }, to: { cell: "loop", port: "state" } },
    { from: { cell: "in", port: "win" }, to: { cell: "loop", port: "win" } },
    { from: { cell: "cfg", port: "machine" }, to: { cell: "loop", port: "machine" } },
    { from: { cell: "cfg", port: "step" }, to: { cell: "loop", port: "step" } },
    { from: { cell: "cfg", port: "acc" }, to: { cell: "loop", port: "acc" } },
  ],
  interface: {
    inputs: { state: { cell: "in", port: "state" }, win: { cell: "in", port: "win" } },
    outputs: { trace: { cell: "loop", port: "acc" } },
  },
}
const ACC_LOOP_DIGEST = behaviorOrganismSha256(accLoopOrganism)

const fanoutOrganism: SpatialBehaviorOrganism = {
  contract: "morphogen.organism.v1",
  key: "organism:fanout",
  name: "Fanout flatten",
  cells: [
    { id: "in", kind: "input", outputs: { items: { type: "json" } } },
    { id: "fan", kind: "each", manifest: EMIT_DIGEST, over: "win", maxItems: 4 },
    { id: "fl", kind: "fn", fn: "emitted.flatten.v1" },
  ],
  edges: [
    { from: { cell: "in", port: "items" }, to: { cell: "fan", port: "win" } },
    { from: { cell: "fan", port: "out" }, to: { cell: "fl", port: "nested" } },
  ],
  interface: {
    inputs: { items: { cell: "in", port: "items" } },
    outputs: { out: { cell: "fl", port: "emitted" } },
  },
}
const FANOUT_DIGEST = behaviorOrganismSha256(fanoutOrganism)

function scene(): unknown {
  return {
    kind: "slopcamera.spatial-scene",
    schemaVersion: 1,
    sceneId: "scene_behaved",
    coordinates: "right-handed-y-up-meters",
    durationUs: 10_000_000,
    entities: [
      {
        entityId: "entity_hero", name: "Hero", kind: "mesh", parentId: null,
        placement: { kind: "world" }, origin: { kind: "authored" }, visible: true,
        transform: { position: [0, 0.9, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
        geometry: { kind: "box", size: [0.6, 1.8, 0.4] },
        material: { kind: "unlit", color: "#224466", opacity: 1 },
      },
    ],
    cameras: [{
      cameraId: "camera_main", name: "Main",
      pose: { position: [0, 1.6, 6], rotation: [0, 0, 0, 1] },
      projection: perspectiveFromFov({ fovDeg: 50, width: 1920, height: 1080, near: 0.1, far: 200 }),
    }],
    animations: [],
    assets: [],
    generators: [],
    overrides: [],
  }
}

const sceneSha = () => spatialValueSha256(parseSpatialScene(scene()))

function behavior(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "slopcamera.spatial-behavior",
    schemaVersion: 1,
    behaviorId: "behavior_baked",
    entityId: "hero",
    sceneSha256: sceneSha(),
    seed: 42,
    rangeUs: { startUs: 0, endUs: 250_000 },
    organisms: {
      [ACC_TICK_DIGEST]: accTickOrganism,
      [ACC_LOOP_DIGEST]: accLoopOrganism,
    },
    entry: ACC_LOOP_DIGEST,
    channels: ["locomotion", "locomotion.transition"],
    args: { state: { name: "idle", enteredUs: 0 }, win: { ticks: TICKS } },
    ...overrides,
  }
}

describe("bakeSpatialBehavior", () => {
  test("bakes a repeat-carried automaton into a sorted emitted trace with a bound receipt", async () => {
    const { bake, check } = await bakeSpatialBehavior({ behavior: behavior(), scene: scene() })
    expect(check.findings.filter((finding) => finding.severity === "error")).toEqual([])
    expect(bake.kind).toBe("slopcamera.spatial-behavior-bake")
    expect(bake.receipt.outcome).toBe("complete")
    expect(bake.receipt.manifestDigest).toBe(ACC_LOOP_DIGEST)
    expect(bake.receipt.runDigest).toMatch(/^sha256:[a-f0-9]{64}$/u)
    expect(bake.receipt.runtime.name).toBe("morphogen")
    expect(bake.receipt.work.steps).toBeGreaterThan(0)
    expect(bake.receipt.work.agentCalls).toBe(0)

    // 3 rounds × step 2 across 6 ticks: state and transition channels in
    // deterministic (tUs, channel) order.
    expect(bake.emitted.map((record) => [record.tUs, record.channel, record.value])).toEqual([
      [0, "locomotion", "walk"],
      [0, "locomotion.transition", { from: "idle", to: "walk", guard: "always" }],
      [40_000, "locomotion", "walk"],
      [80_000, "locomotion", "walk"],
      [120_000, "locomotion", "done"],
      [120_000, "locomotion.transition", { from: "walk", to: "done", guard: "after" }],
      [160_000, "locomotion", "done"],
      [200_000, "locomotion", "done"],
    ])
    expect(bake.receipt.emittedSha256).toBe(spatialValueSha256(bake.emitted))
  })

  test("replays bit-for-bit: identical behavior and scene produce an identical bake", async () => {
    const first = await bakeSpatialBehavior({ behavior: behavior(), scene: scene() })
    const second = await bakeSpatialBehavior({ behavior: behavior(), scene: scene() })
    expect(spatialValueSha256(second.bake)).toBe(spatialValueSha256(first.bake))
    expect(second.bake.receipt.runDigest).toBe(first.bake.receipt.runDigest)
    expect(second.bake.receipt.fnCatalogSha256).toBe(first.bake.receipt.fnCatalogSha256)
  })

  test("compiles clip directives from mapped channels and reports unbound values", async () => {
    const clipDigest = "a".repeat(64)
    const { bake } = await bakeSpatialBehavior({
      behavior: behavior(),
      scene: scene(),
      channelMap: {
        clips: {
          locomotion: {
            walk: { clipDigest, durationUs: 80_000 },
          },
        },
      },
    })
    const clips = bake.directives.filter((directive) => directive.kind === "clip")
    expect(clips).toEqual([
      {
        directiveId: clips[0]!.directiveId,
        kind: "clip",
        clipDigest,
        startUs: 0,
        endUs: 120_000,
        trimStartUs: 0,
        trimEndUs: 80_000,
        loop: 2,
        timeScale: 1,
        mode: "override",
      },
    ])
    // "done" emits with no clip binding → unresolved intent, not a fabricated directive.
    expect(bake.unresolvedIntents).toEqual([
      expect.objectContaining({ domain: "behavior", slot: "clip-binding", referenceId: "locomotion:done" }),
    ])
    expect(bake.receipt.channelMapSha256).toMatch(/^[a-f0-9]{64}$/u)
  })

  test("flattens an each fan-out into one emitted trace", async () => {
    const doc = behavior({
      organisms: { [EMIT_DIGEST]: emitOrganism, [FANOUT_DIGEST]: fanoutOrganism },
      entry: FANOUT_DIGEST,
      channels: ["alert"],
      args: { items: [{ ticks: [{ tUs: 0 }] }, { ticks: [{ tUs: 33_333 }] }] },
    })
    const { bake } = await bakeSpatialBehavior({ behavior: doc, scene: scene() })
    expect(bake.emitted).toEqual([
      { tUs: 0, channel: "alert", value: "ping" },
      { tUs: 33_333, channel: "alert", value: "ping" },
    ])
  })

  test("rejects emissions on undeclared channels", async () => {
    const doc = behavior({ channels: ["locomotion"] })
    await expect(bakeSpatialBehavior({ behavior: doc, scene: scene() }))
      .rejects.toThrow(/undeclared-channel/)
  })

  test("rejects a channel map binding undeclared channels", async () => {
    await expect(bakeSpatialBehavior({
      behavior: behavior(),
      scene: scene(),
      channelMap: { clips: { "not-declared": { walk: { clipDigest: "b".repeat(64), durationUs: 1_000 } } } },
    })).rejects.toThrow(/undeclared-channel/)
  })

  test("rejects when admission findings contain errors", async () => {
    const doc = behavior({ sceneSha256: "0".repeat(64) })
    await expect(bakeSpatialBehavior({ behavior: doc, scene: scene() }))
      .rejects.toThrow(/behavior-check-failed.*stale-digest/)
  })

  test("surfaces a failed run with the ALGAL failure", async () => {
    const doc = behavior({ args: { state: { name: "ghost", enteredUs: 0 }, win: { ticks: TICKS } } })
    await expect(bakeSpatialBehavior({ behavior: doc, scene: scene() }))
      .rejects.toThrow(/behavior-run-failed.*not declared in machine\.states/)
  })

  test("rejects interface outputs that are not emitted arrays", async () => {
    const badEntry: SpatialBehaviorOrganism = {
      ...accLoopOrganism,
      key: "organism:bad-surface",
      interface: {
        inputs: { state: { cell: "in", port: "state" }, win: { cell: "in", port: "win" } },
        outputs: { trace: { cell: "loop", port: "rest" } },
      },
    }
    const badDigest = behaviorOrganismSha256(badEntry)
    const doc = behavior({ organisms: { [ACC_TICK_DIGEST]: accTickOrganism, [badDigest]: badEntry }, entry: badDigest })
    const failure = await bakeSpatialBehavior({ behavior: doc, scene: scene() }).then(
      () => undefined,
      (error: unknown) => error,
    )
    expect(failure).toBeInstanceOf(SpatialSceneError)
    expect((failure as SpatialSceneError).path).toContain("interface output trace")
  })

  test("rejects emissions outside the declared range", async () => {
    const doc = behavior({ rangeUs: { startUs: 0, endUs: 100_000 } })
    await expect(bakeSpatialBehavior({ behavior: doc, scene: scene() }))
      .rejects.toThrow(/emission-outside-range/)
  })
})

// An entry interface input named `seed` binds the document seed by convention:
// seeded kernels consume it without the doc duplicating it into args, and
// galleries vary it for candidate diversity.
const seededOrganism: SpatialBehaviorOrganism = {
  contract: "morphogen.organism.v1",
  key: "organism:seeded-draws",
  name: "Seeded draws",
  cells: [
    { id: "in", kind: "input", outputs: { seed: { type: "json" }, win: { type: "json" } } },
    { id: "cfg", kind: "const", outputs: { count: { type: "json", value: 2 }, channel: { type: "text", value: "seed.draws" } } },
    { id: "rng", kind: "fn", fn: "rng.seeded.v1" },
    { id: "emit", kind: "fn", fn: "channel.emit.v1" },
  ],
  edges: [
    { from: { cell: "in", port: "seed" }, to: { cell: "rng", port: "seed" } },
    { from: { cell: "cfg", port: "count" }, to: { cell: "rng", port: "count" } },
    { from: { cell: "in", port: "win" }, to: { cell: "emit", port: "window" } },
    { from: { cell: "cfg", port: "channel" }, to: { cell: "emit", port: "channel" } },
    { from: { cell: "rng", port: "draws" }, to: { cell: "emit", port: "value" } },
  ],
  interface: {
    inputs: { seed: { cell: "in", port: "seed" }, win: { cell: "in", port: "win" } },
    outputs: { out: { cell: "emit", port: "emitted" } },
  },
}
const SEEDED_DIGEST = behaviorOrganismSha256(seededOrganism)

const seededBehavior = (seed: number): Record<string, unknown> => ({
  kind: "slopcamera.spatial-behavior",
  schemaVersion: 1,
  behaviorId: "behavior_seeded",
  entityId: "hero",
  sceneSha256: sceneSha(),
  seed,
  rangeUs: { startUs: 0, endUs: 250_000 },
  organisms: { [SEEDED_DIGEST]: seededOrganism },
  entry: SEEDED_DIGEST,
  channels: ["seed.draws"],
  args: { win: { ticks: [{ tUs: 0 }] } },
})

describe("document seed convention", () => {
  test("binds behavior.seed to a declared seed interface input without an arg", async () => {
    const { bake, check } = await bakeSpatialBehavior({ behavior: seededBehavior(11), scene: scene() })
    expect(check.findings).toEqual([])
    const [record] = bake.emitted
    expect(record?.channel).toBe("seed.draws")
    const draws = record?.value as readonly number[]
    expect(draws).toHaveLength(2)
    const other = await bakeSpatialBehavior({ behavior: seededBehavior(12), scene: scene() })
    expect(other.bake.emitted[0]?.value).not.toEqual(record?.value)
    // The same seed replays bit-for-bit.
    const replay = await bakeSpatialBehavior({ behavior: seededBehavior(11), scene: scene() })
    expect(replay.bake).toEqual(bake)
  })
})
