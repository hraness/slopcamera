import { describe, expect, test } from "bun:test"

import { perspectiveFromFov } from "./build"
import {
  behaviorOrganismSha256,
  checkSpatialBehavior,
  parseSpatialBehavior,
  spatialBehaviorSha256,
  type SpatialBehaviorFnSignature,
  type SpatialBehaviorOrganism,
} from "./behavior"
import { parseSpatialScene, spatialValueSha256 } from "./identity"

// The four manifests below are also digested by ALGAL's own
// `digestCanonical(manifestToJson(parseOrganismManifest(m)))`; the golden
// literals pin byte-exact digest parity between this mirror and the ALGAL
// runtime so drift fails loudly here instead of corrupting closure checks.

const TICK_DIGEST = "sha256:6fecd9b95f75704906202dadccb56bd50e4d5d2a145db90bd99680c00e596345"
const LOOP_DIGEST = "sha256:bc8e97b90742935af7aa82adcc9bf2309f05ef07654bea8fc6bbda85d9e29c4a"
const WORKER_DIGEST = "sha256:be29d889e639c748bef2d8e7d4e27be26efcc1da0b6c12c5329b7b85aa32bb96"
const FANOUT_DIGEST = "sha256:3e29617d534e867b0e1de2b95450add2568128882eb2cc1e6bc41746aba8a387"

const tickManifest: SpatialBehaviorOrganism = {
  contract: "morphogen.organism.v1",
  key: "organism:fsm-tick",
  name: "FSM tick",
  cells: [
    { id: "s", kind: "input", outputs: { state: { type: "json" } } },
    { id: "tick", kind: "fn", fn: "fsm.tick.v1" },
  ],
  edges: [
    { from: { cell: "s", port: "state" }, to: { cell: "tick", port: "state" } },
  ],
  interface: {
    inputs: { state: { cell: "s", port: "state" } },
    outputs: {
      next: { cell: "tick", port: "next" },
      emitted: { cell: "tick", port: "emitted" },
    },
  },
}

const loopManifest: SpatialBehaviorOrganism = {
  contract: "morphogen.organism.v1",
  key: "organism:fsm-loop",
  name: "FSM loop",
  cells: [
    { id: "start", kind: "input", outputs: { state: { type: "json" } } },
    {
      id: "loop", kind: "repeat",
      manifest: TICK_DIGEST,
      maxRounds: 8,
      carry: { next: "state" },
      until: { output: "next", field: "mode", equals: "halt" },
    },
  ],
  edges: [
    { from: { cell: "start", port: "state" }, to: { cell: "loop", port: "state" } },
  ],
  interface: {
    inputs: { state: { cell: "start", port: "state" } },
    outputs: { final: { cell: "loop", port: "next" } },
  },
}

const workerManifest: SpatialBehaviorOrganism = {
  contract: "morphogen.organism.v1",
  key: "organism:each-worker",
  name: "Each worker",
  cells: [
    { id: "cfg", kind: "const", outputs: { gain: { type: "json", value: 2 } } },
    { id: "item", kind: "input", outputs: { value: { type: "json" } } },
    { id: "sub", kind: "organism", manifest: TICK_DIGEST },
    { id: "work", kind: "fn", fn: "behavior.emit.v1" },
  ],
  edges: [
    { from: { cell: "item", port: "value" }, to: { cell: "sub", port: "state" } },
    { from: { cell: "sub", port: "emitted" }, to: { cell: "work", port: "trace" } },
    { from: { cell: "cfg", port: "gain" }, to: { cell: "work", port: "gain" } },
  ],
  interface: {
    inputs: { value: { cell: "item", port: "value" } },
    outputs: { out: { cell: "work", port: "out" } },
  },
}

const fanoutManifest: SpatialBehaviorOrganism = {
  contract: "morphogen.organism.v1",
  key: "organism:fanout",
  name: "Fan out",
  cells: [
    { id: "list", kind: "input", outputs: { items: { type: "json" } } },
    { id: "each", kind: "each", manifest: WORKER_DIGEST, over: "value", maxItems: 8 },
  ],
  edges: [
    { from: { cell: "list", port: "items" }, to: { cell: "each", port: "value" } },
  ],
  interface: {
    inputs: { items: { cell: "list", port: "items" } },
    outputs: { outs: { cell: "each", port: "out" } },
  },
}

const catalog = new Map<string, SpatialBehaviorFnSignature>([
  ["fsm.tick.v1", {
    inputs: { state: { type: "json" } },
    outputs: { next: { type: "json" }, emitted: { type: "json" } },
  }],
  ["behavior.emit.v1", {
    inputs: { trace: { type: "json" }, gain: { type: "json", optional: true } },
    outputs: { out: { type: "json" } },
  }],
])

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

function sceneSha(): string {
  return spatialValueSha256(parseSpatialScene(scene()))
}

function behavior(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "slopcamera.spatial-behavior",
    schemaVersion: 1,
    behaviorId: "behavior_fanout",
    entityId: "hero",
    sceneSha256: sceneSha(),
    seed: 42,
    rangeUs: { startUs: 0, endUs: 5_000_000 },
    organisms: {
      [TICK_DIGEST]: tickManifest,
      [WORKER_DIGEST]: workerManifest,
      [FANOUT_DIGEST]: fanoutManifest,
    },
    entry: FANOUT_DIGEST,
    channels: ["locomotion.walk", "expression.fidget"],
    args: { items: [{ t: 0 }, { t: 33333 }] },
    ...overrides,
  }
}

function report(doc: unknown = behavior(), fns: ReadonlyMap<string, SpatialBehaviorFnSignature> = catalog) {
  return checkSpatialBehavior({ behavior: doc, scene: scene() }, fns)
}

function codes(doc: unknown = behavior()): string[] {
  return report(doc).findings.map((finding) => finding.code)
}

describe("spatial behavior parse", () => {
  test("parses a valid behavior document and deep-freezes it", () => {
    const parsed = parseSpatialBehavior(behavior())
    expect(parsed.behaviorId).toBe("behavior_fanout")
    expect(parsed.entry).toBe(FANOUT_DIGEST)
    const tick = parsed.organisms[TICK_DIGEST]
    if (tick === undefined) throw new Error("entry manifest missing")
    expect(Object.isFrozen(tick)).toBe(true)
    expect(Object.isFrozen(tick.cells)).toBe(true)
  })

  test("digest is deterministic and order-insensitive", () => {
    const a = parseSpatialBehavior(behavior())
    const reordered = {
      ...behavior(),
      organisms: {
        [FANOUT_DIGEST]: fanoutManifest,
        [TICK_DIGEST]: tickManifest,
        [WORKER_DIGEST]: workerManifest,
      },
    }
    expect(spatialBehaviorSha256(parseSpatialBehavior(reordered))).toBe(spatialBehaviorSha256(a))
  })

  test.each([
    "agent", "classifier", "gate", "tool", "spawn", "slot", "store", "load",
  ])("rejects bake-unsafe %s cells at parse", (kind) => {
    const manifest = {
      ...tickManifest,
      cells: [{ id: "bad", kind, prompt: "p" }],
    }
    expect(() => parseSpatialBehavior(behavior({ organisms: { [TICK_DIGEST]: manifest }, entry: TICK_DIGEST })))
      .toThrow(/discriminator/i)
  })

  test("rejects via transports on composition cells", () => {
    const manifest = {
      ...loopManifest,
      cells: loopManifest.cells.map((cell) => cell.id === "loop" ? { ...cell, via: "transport:x" } : cell),
    }
    expect(() => parseSpatialBehavior(behavior({ organisms: { [TICK_DIGEST]: tickManifest, [LOOP_DIGEST]: manifest } })))
      .toThrow(/via/i)
  })

  test("rejects many on producer ports", () => {
    const manifest = {
      ...fanoutManifest,
      cells: [
        { id: "list", kind: "input", outputs: { items: { type: "json", many: true } } },
        fanoutManifest.cells[1],
      ],
    }
    expect(() => parseSpatialBehavior(behavior({ organisms: { [WORKER_DIGEST]: workerManifest, [TICK_DIGEST]: tickManifest, [FANOUT_DIGEST]: manifest } })))
      .toThrow(/many/i)
  })

  test("rejects duplicate cell ids", () => {
    const manifest = { ...tickManifest, cells: [tickManifest.cells[0], tickManifest.cells[0]] }
    expect(() => parseSpatialBehavior(behavior({ organisms: { [TICK_DIGEST]: manifest } }))).toThrow(/Duplicate cell id/)
  })

  test("rejects labels on non-choice ports", () => {
    const manifest = {
      ...tickManifest,
      cells: [{ id: "s", kind: "input", outputs: { state: { type: "json", labels: ["a"] } } }, tickManifest.cells[1]],
    }
    expect(() => parseSpatialBehavior(behavior({ organisms: { [TICK_DIGEST]: manifest } }))).toThrow(/labels/i)
  })

  test("rejects non-sha256 organism record keys", () => {
    expect(() => parseSpatialBehavior(behavior({ organisms: { "deadbeef": tickManifest } }))).toThrow(/sha256/i)
  })

  test("rejects inverted ranges", () => {
    expect(() => parseSpatialBehavior(behavior({ rangeUs: { startUs: 5_000_000, endUs: 1_000 } }))).toThrow(/rangeUs/)
  })
})

describe("behavior organism digest", () => {
  test.each([
    [tickManifest, TICK_DIGEST],
    [loopManifest, LOOP_DIGEST],
    [workerManifest, WORKER_DIGEST],
    [fanoutManifest, FANOUT_DIGEST],
  ] as const)("matches the ALGAL canonical digest", (manifest, expected) => {
    const parsed = parseSpatialBehavior(behavior({
      organisms: { [expected]: manifest, [TICK_DIGEST]: tickManifest, [WORKER_DIGEST]: workerManifest },
    })).organisms[expected]
    if (parsed === undefined) throw new Error("closure member missing")
    expect(behaviorOrganismSha256(parsed)).toBe(expected)
  })
})

describe("checkSpatialBehavior", () => {
  test("accepts a well-formed closure with no findings", () => {
    const checked = report()
    expect(checked.counts).toMatchObject({ organisms: 3, cells: 8, edges: 5, fnRefs: 2, errors: 0, warnings: 0 })
    expect(checked.findings).toEqual([])
    expect(checked.behaviorSha256).toBe(spatialBehaviorSha256(parseSpatialBehavior(behavior())))
  })

  test("reports closure-digest-mismatch when a manifest drifts from its key", () => {
    const tampered = { ...tickManifest, name: "Renamed after admission" }
    const found = report(behavior({
      organisms: { [TICK_DIGEST]: tampered, [WORKER_DIGEST]: workerManifest, [FANOUT_DIGEST]: fanoutManifest },
    }))
    expect(found.findings.map((finding) => finding.code)).toContain("closure-digest-mismatch")
    expect(found.counts.errors).toBeGreaterThan(0)
  })

  test("reports unresolved-manifest for absent composition targets", () => {
    const found = report(behavior({ organisms: { [FANOUT_DIGEST]: fanoutManifest } }))
    expect(codes()).not.toContain("unresolved-manifest")
    expect(found.findings.map((finding) => finding.code)).toContain("unresolved-manifest")
  })

  test("reports unresolved-fn for catalog misses", () => {
    const found = report(behavior(), new Map())
    expect(found.findings.filter((finding) => finding.code === "unresolved-fn")).toHaveLength(2)
  })

  test("reports unresolved-entry when the entry digest is absent", () => {
    const found = report(behavior({
      organisms: { [TICK_DIGEST]: tickManifest },
      entry: FANOUT_DIGEST,
    }))
    expect(found.findings.map((finding) => finding.code)).toContain("unresolved-entry")
  })

  test("reports invalid-wiring for edges into input and const cells", () => {
    const bad = {
      ...workerManifest,
      edges: [
        ...workerManifest.edges,
        { from: { cell: "sub", port: "next" }, to: { cell: "cfg", port: "gain" } },
      ],
    }
    const found = report(behavior({
      organisms: { [TICK_DIGEST]: tickManifest, [WORKER_DIGEST]: bad, [FANOUT_DIGEST]: fanoutManifest },
    }))
    expect(found.findings.map((finding) => finding.code)).toContain("invalid-wiring")
  })

  test("reports invalid-wiring for undeclared edge ports", () => {
    const bad = {
      ...tickManifest,
      edges: [{ from: { cell: "s", port: "ghost" }, to: { cell: "tick", port: "state" } }],
    }
    const found = report(behavior({ organisms: { [TICK_DIGEST]: bad }, entry: TICK_DIGEST }))
    expect(found.findings.map((finding) => finding.code)).toContain("invalid-wiring")
  })

  test("reports invalid-wiring for interface endpoints on non-input cells", () => {
    const bad = {
      ...tickManifest,
      interface: {
        inputs: { state: { cell: "tick", port: "state" } },
        outputs: tickManifest.interface.outputs,
      },
    }
    const found = report(behavior({ organisms: { [TICK_DIGEST]: bad }, entry: TICK_DIGEST }))
    expect(found.findings.map((finding) => finding.code)).toContain("invalid-wiring")
  })

  test("reports invalid-wiring for repeat carry and until outside the sub-manifest interface", () => {
    const bad = {
      ...loopManifest,
      cells: loopManifest.cells.map((cell) => cell.id === "loop"
        ? { ...cell, carry: { ghost: "state" }, until: { output: "phantom", equals: "x" } }
        : cell),
    }
    const found = report(behavior({
      organisms: { [TICK_DIGEST]: tickManifest, [LOOP_DIGEST]: bad },
      entry: LOOP_DIGEST,
      args: { state: { mode: "idle" } },
    }))
    const invalid = found.findings.filter((finding) => finding.code === "invalid-wiring")
    expect(invalid).toHaveLength(2)
  })

  test("reports invalid-wiring when an each over port lacks a delivering edge", () => {
    const bad = { ...fanoutManifest, edges: [] }
    const found = report(behavior({
      organisms: { [TICK_DIGEST]: tickManifest, [WORKER_DIGEST]: workerManifest, [FANOUT_DIGEST]: bad },
    }))
    expect(found.findings.map((finding) => finding.code)).toContain("invalid-wiring")
  })

  test("reports undeclared-arg for entry args outside the interface", () => {
    const found = report(behavior({ args: { items: [], bonus: 1 } }))
    expect(found.findings.map((finding) => finding.code)).toContain("undeclared-arg")
  })

  test("reports unfed-input for embedded inputs without a delivering edge", () => {
    const bad = {
      ...workerManifest,
      edges: workerManifest.edges.filter((edge) => !(edge.to.cell === "sub" && edge.to.port === "state")),
    }
    const found = report(behavior({
      organisms: { [TICK_DIGEST]: tickManifest, [WORKER_DIGEST]: bad, [FANOUT_DIGEST]: fanoutManifest },
    }))
    const unfed = found.findings.filter((finding) => finding.code === "unfed-input")
    expect(unfed).toHaveLength(1)
    expect(unfed[0]?.severity).toBe("warning")
    expect(unfed[0]?.detail).toContain("state")
  })

  test("reports unfed-input for entry interface inputs without args", () => {
    const doc = behavior({
      organisms: { [TICK_DIGEST]: tickManifest, [LOOP_DIGEST]: loopManifest },
      entry: LOOP_DIGEST,
    })
    delete doc["args"]
    const found = report(doc)
    expect(found.findings.map((finding) => finding.code)).toContain("unfed-input")
  })

  test("does not report unfed-input for repeat inputs fed by carry", () => {
    const found = report(behavior({
      organisms: { [TICK_DIGEST]: tickManifest, [LOOP_DIGEST]: loopManifest },
      entry: LOOP_DIGEST,
      args: { state: { mode: "idle" } },
    }))
    expect(found.findings.map((finding) => finding.code)).not.toContain("unfed-input")
  })

  test("reports cyclic-composition for manifest-reference cycles", () => {
    const digestA = `sha256:${"a".repeat(64)}`
    const digestB = `sha256:${"b".repeat(64)}`
    const cycleA = {
      ...tickManifest,
      key: "organism:cycle-a",
      cells: [{ id: "sub", kind: "organism", manifest: digestB }],
      interface: { inputs: {}, outputs: {} },
      edges: [],
    }
    const cycleB = {
      ...tickManifest,
      key: "organism:cycle-b",
      cells: [{ id: "sub", kind: "organism", manifest: digestA }],
      interface: { inputs: {}, outputs: {} },
      edges: [],
    }
    const found = report(behavior({
      organisms: { [digestA]: cycleA, [digestB]: cycleB },
      entry: digestA,
    }))
    expect(found.findings.map((finding) => finding.code)).toContain("cyclic-composition")
  })

  test("reports unreachable-organism as a warning", () => {
    const found = report(behavior({
      organisms: {
        [TICK_DIGEST]: tickManifest,
        [WORKER_DIGEST]: workerManifest,
        [FANOUT_DIGEST]: fanoutManifest,
        [LOOP_DIGEST]: loopManifest,
      },
    }))
    const unreachable = found.findings.filter((finding) => finding.code === "unreachable-organism")
    expect(unreachable).toHaveLength(1)
    expect(unreachable[0]?.severity).toBe("warning")
    expect(found.counts.errors).toBe(0)
  })

  test("reports stale-digest when sceneSha256 drifts", () => {
    const found = report(behavior({ sceneSha256: "0".repeat(64) }))
    expect(found.findings.map((finding) => finding.code)).toContain("stale-digest")
  })

  test("reports unresolved-entity and range-outside-scene", () => {
    const found = report(behavior({ entityId: "ghost", rangeUs: { startUs: 0, endUs: 99_000_000 } }))
    const foundCodes = found.findings.map((finding) => finding.code)
    expect(foundCodes).toContain("unresolved-entity")
    expect(foundCodes).toContain("range-outside-scene")
  })
})
