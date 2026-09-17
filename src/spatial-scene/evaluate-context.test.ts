import { describe, expect, test } from "bun:test"
import { auditSpatialScene } from "./audit.js"
import {
  createSpatialEvaluationContext, evaluateSpatialScene, evaluateSpatialSceneInContext,
} from "./evaluate.js"
import type { SpatialEntity, SpatialSceneV1 } from "./contracts.js"
import { fixtureEntity, fixtureScene, fixtureTransform } from "./test-fixture.js"

/** 512 entities: a 64-deep chain plus scattered siblings, several animated. */
function scaledScene(count = 512): SpatialSceneV1 {
  const entities: SpatialEntity[] = []
  for (let index = 0; index < count; index++) {
    const chained = index < 64
    entities.push({
      ...fixtureEntity(`entity_${index}`),
      parentId: chained && index > 0 ? `entity_${index - 1}` : null,
      transform: {
        ...fixtureTransform,
        position: [chained ? 0.5 : (index % 16) * 3 - 24, chained ? 0.5 : Math.floor(index / 64) * 2 - 8, chained ? 0 : -10 - (index % 4) * 5],
      },
    })
  }
  return {
    ...fixtureScene(), durationUs: 4_000_000, entities,
    animations: [
      { channelId: "channel_move", targetId: "entity_63", property: "position" as const, interpolation: "linear" as const, keys: [{ timeUs: 0, value: [0, 0, 0] }, { timeUs: 4_000_000, value: [1, 1, 1] }] },
      { channelId: "channel_fade", targetId: "entity_200", property: "opacity" as const, interpolation: "step" as const, keys: [{ timeUs: 0, value: 1 }, { timeUs: 2_000_000, value: 0.5 }] },
      { channelId: "channel_pan", targetId: "camera_main", property: "rotation" as const, interpolation: "slerp" as const, keys: [{ timeUs: 0, value: [0, 0, 0, 1] }, { timeUs: 4_000_000, value: [0, 0, 0, 1] }] },
    ],
  }
}

const timesUs = [0, 500_000, 1_000_000, 1_500_000, 2_000_000, 2_500_000, 3_000_000, 4_000_000]

describe("spatial evaluation context", () => {
  test("context evaluation is byte-identical to standalone evaluation at every sample", () => {
    const scene = scaledScene()
    const context = createSpatialEvaluationContext(scene)
    for (const timeUs of timesUs) {
      const standalone = evaluateSpatialScene(scene, { timeUs, cameraId: "camera_main" })
      const shared = evaluateSpatialSceneInContext(context, { timeUs, cameraId: "camera_main" })
      expect(shared).toEqual(standalone)
      expect(shared.stateSha256).toBe(standalone.stateSha256)
      expect(shared.viewSha256).toBe(standalone.viewSha256)
    }
  })

  test("independent contexts over equal scene values produce identical snapshots", () => {
    const scene = scaledScene()
    const first = createSpatialEvaluationContext(scene)
    const second = createSpatialEvaluationContext(structuredClone(scene))
    for (const timeUs of timesUs) {
      expect(evaluateSpatialSceneInContext(second, { timeUs, cameraId: "camera_main" }))
        .toEqual(evaluateSpatialSceneInContext(first, { timeUs, cameraId: "camera_main" }))
    }
  })

  test("per-call overrides still merge and validate against the shared context", () => {
    const scene = scaledScene()
    const context = createSpatialEvaluationContext(scene)
    const options = { timeUs: 0, cameraId: "camera_main",
      overrides: [{ entityId: "entity_10", property: "opacity" as const, value: 0.25 }] }
    expect(evaluateSpatialSceneInContext(context, options)).toEqual(evaluateSpatialScene(scene, options))
    expect(() => evaluateSpatialSceneInContext(context,
      { timeUs: 0, cameraId: "camera_main", overrides: [{ entityId: "entity_missing", property: "opacity" as const, value: 1 }] }))
      .toThrow(/Missing reference entity_missing/u)
  })

  test("audit is deterministic across runs and bounded on a 512-entity scene", () => {
    const scene = scaledScene()
    const started = performance.now()
    const first = auditSpatialScene(scene, { cameraId: "camera_main", timesUs })
    const elapsedMs = performance.now() - started
    const second = auditSpatialScene(structuredClone(scene), { cameraId: "camera_main", timesUs })
    expect(second).toEqual(first)
    // Generous CI bound; the point is the report, not the stopwatch.
    expect(elapsedMs).toBeLessThan(30_000)
    expect(first.summary.entities.total).toBe(512)
  })
})
