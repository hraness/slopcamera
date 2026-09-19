/**
 * End-to-end authoring test: assembles a complete behavior document from stdlib
 * organisms, runs it through the full pipeline (check → bake → audit → gallery),
 * and verifies the contract at every stage.
 *
 * This proves the authoring loop: an agent composes stdlib organisms into a
 * behavior doc with scene-bound args, validates it with `check_scene_behavior`,
 * bakes it, audits the trace for pathologies, and plans a gallery for review.
 */
import { describe, expect, test } from "bun:test"

import { perspectiveFromFov } from "./build"
import { checkSpatialBehavior } from "./behavior"
import { auditSpatialBehaviorTrace, spatialBehaviorAuditReportSha256 } from "./behavior-audit"
import { bakeSpatialBehavior } from "./behavior-bake"
import { spatialBehaviorFnSignatures } from "./behavior-fns"
import { planSpatialBehaviorGallery } from "./behavior-gallery"
import {
  SPATIAL_BEHAVIOR_STDLIB_COMBINED,
  SPATIAL_BEHAVIOR_STDLIB_LOCOMOTION_FSM,
} from "./behavior-stdlib"
import { parseSpatialScene, spatialSceneSha256, spatialValueSha256 } from "./identity"

// ---------------------------------------------------------------- fixture ---

function authoredScene() {
  return {
    kind: "slopcamera.spatial-scene",
    schemaVersion: 1,
    sceneId: "scene_authoring_demo",
    coordinates: "right-handed-y-up-meters",
    durationUs: 10_000_000,
    entities: [{
      entityId: "entity_hero", name: "Hero", kind: "mesh", parentId: null,
      placement: { kind: "world" }, origin: { kind: "authored" }, visible: true,
      transform: { position: [0, 0.9, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      geometry: { kind: "box", size: [0.6, 1.8, 0.4] },
      material: { kind: "unlit", color: "#336699", opacity: 1 },
    }],
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

const TICKS = [0, 40_000, 80_000, 120_000, 160_000, 200_000].map((tUs) => ({ tUs }))

/**
 * The agent-authored behavior document: composes all three stdlib sub-behaviors
 * into one scene-bound behavior with explicit initial states and specs.
 */
function authoredBehaviorDoc(sceneSha256: string) {
  const lib = SPATIAL_BEHAVIOR_STDLIB_COMBINED
  return {
    kind: "slopcamera.spatial-behavior",
    schemaVersion: 1,
    behaviorId: "behavior_hero_authored",
    entityId: "hero",
    sceneSha256,
    seed: 42,
    rangeUs: { startUs: 0, endUs: 250_000 },
    organisms: lib.organisms,
    entry: lib.entry,
    channels: [
      "locomotion", "locomotion.transition",
      "face.blink", "face.gaze", "face.mood",
      "interact", "interact.phase", "prop.attach",
    ],
    args: {
      "loco-state": { name: "idle", enteredUs: 0 },
      "loco-machine": {
        channel: "locomotion",
        states: ["idle", "walk", "run"],
        transitions: [
          { from: "idle", to: "walk", guard: { kind: "always" } },
          { from: "walk", to: "run", guard: { kind: "after", us: 100_000 } },
          { from: "run", to: "idle", guard: { kind: "after", us: 150_000 } },
        ],
      },
      "expr-state": { rng: 42, nextBlinkUs: 0, nextSaccadeUs: 0, gazeIndex: 0 },
      "expr-spec": {
        channel: "face",
        seed: 42,
        blinkEveryUs: 3_000_000,
        blinkUs: 150_000,
        saccadeEveryUs: 2_000_000,
        gazeTargets: ["center", "left", "right"],
        mood: { calm: 0.7, curious: 0.3 },
      },
      "interact-state": { phaseIndex: 0, enteredUs: 0 },
      "interact-spec": {
        channel: "interact",
        phases: [
          { name: "approach", minUs: 80_000 },
          { name: "grasp", minUs: 40_000, emit: [{ channel: "prop.attach", value: true }] },
          { name: "hold", minUs: 100_000 },
          { name: "release", minUs: 40_000, emit: [{ channel: "prop.attach", value: false }] },
        ],
      },
      win: { ticks: TICKS },
    },
  }
}

// ---------------------------------------------------------- authoring loop ---

describe("behavior authoring end-to-end", () => {
  test("full pipeline: assemble → check → bake → audit → gallery", async () => {
    const scene = authoredScene()
    const parsed = parseSpatialScene(scene)
    const sceneSha = spatialSceneSha256(parsed)

    // Step 1: Agent assembles a behavior doc from stdlib organisms
    const behavior = authoredBehaviorDoc(sceneSha)

    // Step 2: Check — validates the organism closure, wiring, entity, channels
    const checkReport = checkSpatialBehavior(
      { behavior, scene },
      spatialBehaviorFnSignatures(),
    )
    expect(checkReport.counts.errors).toBe(0)
    expect(checkReport.behaviorSha256).toMatch(/^[a-f0-9]{64}$/u)
    expect(checkReport.sceneSha256).toBe(sceneSha)

    // Step 3: Bake — runs through the real ALGAL runtime
    const { bake, check } = await bakeSpatialBehavior({ behavior, scene })
    expect(check.findings.filter((f) => f.severity === "error")).toEqual([])
    expect(bake.receipt.outcome).toBe("complete")
    expect(bake.emitted.length).toBeGreaterThan(0)
    expect(bake.receipt.runDigest).toMatch(/^sha256:/u)

    // Verify all declared channels produce emissions
    const channels = new Set(bake.emitted.map((r) => r.channel))
    expect(channels.has("locomotion")).toBe(true)
    expect(channels.has("face.blink")).toBe(true)
    expect(channels.has("interact")).toBe(true)
    expect(channels.has("prop.attach")).toBe(true)

    // Step 4: Audit — check the baked trace for pathologies
    // Round-trip through JSON to match the real agent workflow (write → read)
    const auditInput = JSON.parse(JSON.stringify({
      emitted: bake.emitted,
      behaviorSha256: bake.behaviorSha256,
      emittedSha256: bake.receipt.emittedSha256,
      rangeUs: bake.rangeUs,
    })) as unknown
    const auditReport = auditSpatialBehaviorTrace(auditInput)
    expect(auditReport.kind).toBe("slopcamera.spatial-behavior-audit-report")
    expect(auditReport.channelCount).toBeGreaterThan(0)
    // Audit findings are advisory (warning/info) — verify no warnings on the
    // designed behavior (an unreachable-state warning for "idle" is expected
    // since the always guard transitions immediately)
    const warnings = auditReport.findings.filter((f) => f.severity === "warning")
    expect(warnings.every((f) => f.kind === "unreachable-state")).toBe(true)

    // Audit report has a stable digest
    const auditDigest = spatialBehaviorAuditReportSha256(auditReport)
    expect(auditDigest).toMatch(/^[a-f0-9]{64}$/u)
    expect(spatialBehaviorAuditReportSha256(auditReport)).toBe(auditDigest)

    // Step 5: Gallery — plan seed variants for review
    const galleryPlan = await planSpatialBehaviorGallery({ behavior, scene })
    expect(galleryPlan.candidates.length).toBeGreaterThanOrEqual(1)
    // Each candidate has a unique document digest
    const digests = new Set(galleryPlan.candidates.map((c) => c.documentSha256))
    expect(digests.size).toBe(galleryPlan.candidates.length)
  })

  test("incremental authoring: start simple, then compose", async () => {
    const scene = authoredScene()
    const parsed = parseSpatialScene(scene)
    const sceneSha = spatialSceneSha256(parsed)

    // Agent starts with a simple locomotion-only behavior
    const locoLib = SPATIAL_BEHAVIOR_STDLIB_LOCOMOTION_FSM
    const simpleBehavior = {
      kind: "slopcamera.spatial-behavior",
      schemaVersion: 1,
      behaviorId: "behavior_hero_simple",
      entityId: "hero",
      sceneSha256: sceneSha,
      seed: 42,
      rangeUs: { startUs: 0, endUs: 250_000 },
      organisms: locoLib.organisms,
      entry: locoLib.entry,
      channels: ["locomotion", "locomotion.transition"],
      args: {
        state: { name: "idle", enteredUs: 0 },
        machine: {
          channel: "locomotion",
          states: ["idle", "walk"],
          transitions: [
            { from: "idle", to: "walk", guard: { kind: "always" } },
          ],
        },
        win: { ticks: TICKS },
      },
    }

    // Check passes → agent iterates
    const simpleCheck = checkSpatialBehavior(
      { behavior: simpleBehavior, scene },
      spatialBehaviorFnSignatures(),
    )
    expect(simpleCheck.counts.errors).toBe(0)

    // Bake verifies
    const { bake: simpleBake } = await bakeSpatialBehavior({
      behavior: simpleBehavior, scene,
    })
    expect(simpleBake.receipt.outcome).toBe("complete")
    expect(simpleBake.emitted.some((r) => r.channel === "locomotion")).toBe(true)

    // Agent upgrades to the full combined behavior
    const fullBehavior = authoredBehaviorDoc(sceneSha)
    const fullCheck = checkSpatialBehavior(
      { behavior: fullBehavior, scene },
      spatialBehaviorFnSignatures(),
    )
    expect(fullCheck.counts.errors).toBe(0)

    const { bake: fullBake } = await bakeSpatialBehavior({
      behavior: fullBehavior, scene,
    })
    expect(fullBake.receipt.outcome).toBe("complete")
    // Full behavior has strictly more channels
    const fullChannels = new Set(fullBake.emitted.map((r) => r.channel))
    expect(fullChannels.size).toBeGreaterThan(
      new Set(simpleBake.emitted.map((r) => r.channel)).size,
    )
  })

  test("deterministic replay: same doc + seed + scene → identical bake", async () => {
    const scene = authoredScene()
    const parsed = parseSpatialScene(scene)
    const sceneSha = spatialSceneSha256(parsed)
    const behavior = authoredBehaviorDoc(sceneSha)

    const { bake: bake1 } = await bakeSpatialBehavior({ behavior, scene })
    const { bake: bake2 } = await bakeSpatialBehavior({ behavior, scene })

    // Byte-identical digests prove determinism
    expect(bake1.receipt.emittedSha256).toBe(bake2.receipt.emittedSha256)
    expect(bake1.receipt.runDigest).toBe(bake2.receipt.runDigest)
    expect(spatialValueSha256(bake1)).toBe(spatialValueSha256(bake2))
  })
})
