import { describe, expect, test } from "bun:test"

import { perspectiveFromFov } from "./build"
import { parseSpatialScene, spatialValueSha256 } from "./identity"
import { parseSpatialDirection } from "./direction"
import {
  checkSpatialDirection,
  compileSpatialDirection,
  SPATIAL_DIRECTION_COMPILER_ID,
  spatialDirectionCompilationSha256,
} from "./direction-compile"

function scene(overrides: Record<string, unknown> = {}): unknown {
  return {
    kind: "slopcamera.spatial-scene",
    schemaVersion: 1,
    sceneId: "scene_directed",
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
      {
        entityId: "entity_prop", name: "Prop", kind: "mesh", parentId: null,
        placement: { kind: "world" }, origin: { kind: "authored" }, visible: true,
        transform: { position: [1.5, 0.4, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
        geometry: { kind: "box", size: [0.8, 0.8, 0.8] },
        material: { kind: "unlit", color: "#663322", opacity: 1 },
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
    ...overrides,
  }
}

function sceneSha(overrides: Record<string, unknown> = {}): string {
  return spatialValueSha256(parseSpatialScene(scene(overrides)))
}

function direction(overrides: Record<string, unknown> = {}): unknown {
  return {
    kind: "slopcamera.spatial-direction",
    schemaVersion: 1,
    entityId: "hero",
    projectDigest: sceneSha(),
    beats: [{
      id: "beat_arrival", startUs: 0, endUs: 6_000_000,
      intent: "Hero crosses the room and inspects the prop.", emotion: "curious",
    }],
    actions: [
      { id: "action_walk", characterId: "hero", startUs: 0, endUs: 3_000_000, action: "walk" },
      { id: "action_take", characterId: "hero", startUs: 3_000_000, endUs: 4_000_000, action: "interact", targetId: "prop" },
      { id: "action_smile", characterId: "hero", startUs: 4_000_000, endUs: 5_000_000, action: "morph" },
    ],
    coverage: [
      { id: "coverage_wide", startUs: 0, endUs: 2_000_000, rigKind: "dolly", framing: "wide", subjectId: "hero" },
      { id: "coverage_close", startUs: 2_000_000, endUs: 4_000_000, rigKind: "tripod", framing: "close-up", subjectId: "hero" },
      { id: "coverage_orbit", startUs: 4_000_000, endUs: 6_000_000, rigKind: "orbit", framing: "medium", subjectId: "hero" },
    ],
    looks: [{
      id: "look_dusk", startUs: 0, endUs: 6_000_000,
      lighting: "low warm key from the left", atmosphere: "quiet evening interior",
    }],
    ...overrides,
  }
}

function compile(dir: unknown = direction(), scn: unknown = scene()): ReturnType<typeof compileSpatialDirection> {
  return compileSpatialDirection({ direction: dir, scene: scn })
}

describe("spatial direction compilation", () => {
  test("compiles actions, coverage, and looks into verified:false proposals bound to both digests", () => {
    const compilation = compile()
    expect(compilation.kind).toBe("slopcamera.spatial-direction-compilation")
    expect(compilation.verified).toBe(false)
    expect(compilation.compilerVersion).toBe(SPATIAL_DIRECTION_COMPILER_ID)
    expect(compilation.sceneSha256).toBe(sceneSha())
    expect(compilation.directionSha256).toBe(spatialValueSha256(parseSpatialDirection(direction())))
    expect(compilation.cameraId).toBe("camera_main")

    expect(compilation.proposals.performance).toHaveLength(3)
    const walk = compilation.proposals.performance[0]!
    expect(walk.clipKind).toBe("walk-cycle")
    expect(walk.characterEntityId).toBe("entity_hero")
    expect(walk.unresolved).toEqual(["clip-digest", "rig-digest", "mapping-digest"])
    const take = compilation.proposals.performance[1]!
    expect(take.clipKind).toBe("interact")
    expect(take.targetEntityId).toBe("entity_prop")
    const smile = compilation.proposals.performance[2]!
    expect(smile.clipKind).toBe("expression")

    expect(compilation.proposals.cameraRigs).toHaveLength(3)
    expect(compilation.proposals.cameraRigs.map((rig) => rig.kind)).toEqual(["dolly", "tripod", "orbit"])
    expect(compilation.proposals.shots).toHaveLength(3)
    for (const shot of compilation.proposals.shots) {
      expect(shot.sceneSha256).toBe(sceneSha())
      expect(shot.cameraId).toBe("camera_main")
      expect(shot.playback).toBe("once")
    }
    const staticShot = compilation.proposals.shots[1]!
    expect(staticShot.cameraPoseOverride).toBeDefined()

    expect(compilation.proposals.lookIntents).toHaveLength(1)
    expect(compilation.proposals.lookIntents[0]!.unresolved).toEqual(["material-lighting", "post-process"])
    expect(compilation.unresolvedIntents.length).toBeGreaterThan(0)
  })

  test("is deterministic: equal inputs compile to equal output and digest", () => {
    const first = compile()
    const second = compile()
    expect(spatialDirectionCompilationSha256(first)).toBe(spatialDirectionCompilationSha256(second))
    expect(first).toEqual(second)
  })

  test("resolves subject world positions into rig targets", () => {
    const compilation = compile()
    const dolly = compilation.proposals.cameraRigs[0]!
    if (dolly.kind !== "dolly") throw new Error("expected dolly")
    expect(dolly.target.entityId).toBe("entity_hero")
    expect(dolly.target.position).toEqual([0, 0.9, 0])
    expect(dolly.target.radiusM).toBeGreaterThan(0)
  })

  test("flags a stale project digest as advisory and check error without failing compilation", () => {
    const compilation = compile(direction({ projectDigest: "f".repeat(64) }))
    expect(compilation.advisories.some((item) => item.code === "stale-digest")).toBe(true)
    const report = checkSpatialDirection({ direction: direction({ projectDigest: "f".repeat(64) }), scene: scene() })
    expect(report.findings.some((item) => item.code === "stale-digest" && item.severity === "error")).toBe(true)
    expect(report.counts.errors).toBeGreaterThanOrEqual(1)
  })

  test("reports unresolved characters and targets without failing compilation", () => {
    const dir = direction({
      actions: [{ id: "action_walk", characterId: "ghost", startUs: 0, endUs: 1_000_000, action: "walk" }],
    })
    const compilation = compile(dir)
    expect(compilation.advisories.some((item) => item.code === "unresolved-reference")).toBe(true)
    const proposal = compilation.proposals.performance[0]!
    expect(proposal.characterEntityId).toBeUndefined()
    expect(proposal.unresolved).toContain("character-entity")
    expect(compilation.unresolvedIntents.some((item) => item.slot === "character-entity")).toBe(true)
    const report = checkSpatialDirection({ direction: dir, scene: scene() })
    expect(report.findings.filter((item) => item.code === "unresolved-reference" && item.severity === "error")).not.toHaveLength(0)
  })

  test("defaults to the sorted-first camera with an advisory when several exist", () => {
    const scn = scene({
      cameras: [
        { cameraId: "camera_zeta", name: "Z", pose: { position: [0, 1, 5], rotation: [0, 0, 0, 1] }, projection: perspectiveFromFov({ fovDeg: 50, width: 640, height: 480, near: 0.1, far: 100 }) },
        { cameraId: "camera_alpha", name: "A", pose: { position: [0, 1, 5], rotation: [0, 0, 0, 1] }, projection: perspectiveFromFov({ fovDeg: 50, width: 640, height: 480, near: 0.1, far: 100 }) },
      ],
    })
    const dir = direction({ projectDigest: spatialValueSha256(parseSpatialScene(scn)) })
    const compilation = compile(dir, scn)
    expect(compilation.cameraId).toBe("camera_alpha")
    expect(compilation.advisories.some((item) => item.code === "defaulted-camera")).toBe(true)
  })

  test("honors an explicit cameraId and rejects an unknown one", () => {
    const scn = scene({
      cameras: [
        { cameraId: "camera_zeta", name: "Z", pose: { position: [0, 1, 5], rotation: [0, 0, 0, 1] }, projection: perspectiveFromFov({ fovDeg: 50, width: 640, height: 480, near: 0.1, far: 100 }) },
        { cameraId: "camera_alpha", name: "A", pose: { position: [0, 1, 5], rotation: [0, 0, 0, 1] }, projection: perspectiveFromFov({ fovDeg: 50, width: 640, height: 480, near: 0.1, far: 100 }) },
      ],
    })
    const dir = direction({ projectDigest: spatialValueSha256(parseSpatialScene(scn)) })
    expect(compileSpatialDirection({ direction: dir, scene: scn, cameraId: "camera_zeta" }).cameraId).toBe("camera_zeta")
    expect(() => compileSpatialDirection({ direction: dir, scene: scn, cameraId: "camera_missing" })).toThrow(/Unknown camera/)
  })

  test("scenes always declare a camera, so compilation always resolves one", () => {
    expect(() => parseSpatialScene(scene({ cameras: [] }))).toThrow()
    const compilation = compile()
    expect(compilation.cameraId).toBe("camera_main")
  })

  test("warns when coverage escapes every beat and when intervals exceed scene duration", () => {
    const dir = direction({
      coverage: [{ id: "coverage_late", startUs: 8_000_000, endUs: 9_000_000, rigKind: "tripod", framing: "wide" }],
    })
    const report = checkSpatialDirection({ direction: dir, scene: scene() })
    expect(report.findings.some((item) => item.code === "coverage-ungrouped" && item.severity === "warning")).toBe(true)
    const over = direction({
      beats: [{ id: "beat_a", startUs: 0, endUs: 20_000_000, intent: "over", emotion: "calm" }],
      coverage: [], actions: [], looks: [],
    })
    const overReport = checkSpatialDirection({ direction: over, scene: scene() })
    expect(overReport.findings.some((item) => item.code === "interval-outside-scene" && item.severity === "error")).toBe(true)
  })

  test("rejects malformed direction or scene input", () => {
    expect(() => compileSpatialDirection({ direction: { kind: "nope" }, scene: scene() })).toThrow()
    expect(() => compileSpatialDirection({ direction: direction(), scene: { kind: "nope" } })).toThrow()
    expect(() => checkSpatialDirection({ direction: "x", scene: scene() })).toThrow()
  })

  test("compilation parses its own canonical output and keeps verified false", () => {
    const compilation = compile()
    const roundTrip = compileSpatialDirection({ direction: direction(), scene: scene() })
    expect(roundTrip.verified).toBe(false)
    expect(compilation).toEqual(roundTrip)
  })
})
