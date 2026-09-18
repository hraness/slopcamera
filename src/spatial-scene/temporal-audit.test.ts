import { describe, expect, test } from "bun:test"

import { perspectiveFromFov } from "./build"
import { evaluateSpatialScene } from "./evaluate"
import { parseSpatialScene } from "./identity"
import {
  auditSpatialTemporalEvidence,
  spatialTemporalAuditReportSha256,
} from "./temporal-audit"

const SHA = "a".repeat(64)

const boxEntity = (entityId: string, position: [number, number, number]) => ({
  entityId, name: entityId, kind: "mesh", parentId: null,
  placement: { kind: "world" }, origin: { kind: "authored" }, visible: true,
  transform: { position, rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
  geometry: { kind: "box", size: [1, 1, 1] },
  material: { kind: "unlit", color: "#112233", opacity: 1 },
})

const identityMatrix = (position: [number, number, number]): number[] => [
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, position[0], position[1], position[2], 1,
]

const baseCamera = {
  cameraId: "camera_main", name: "Main",
  pose: { position: [0, 1.6, 6], rotation: [0, 0, 0, 1] },
  projection: perspectiveFromFov({ fovDeg: 50, width: 640, height: 480, near: 0.1, far: 200 }),
}

function snapshot(timeUs: number, overrides: Record<string, unknown> = {}): unknown {
  return {
    kind: "slopcamera.spatial-snapshot", schemaVersion: 1,
    sceneSha256: SHA, stateSha256: SHA, viewSha256: SHA,
    timeUs,
    camera: baseCamera,
    entities: [
      { entity: boxEntity("entity_hero", [0, 0.5, 0]), worldMatrix: identityMatrix([0, 0.5, 0]), visible: true, selectionId: 1 },
    ],
    assets: [],
    ...overrides,
  }
}

function movingScene(overrides: Record<string, unknown> = {}): unknown {
  return {
    kind: "slopcamera.spatial-scene", schemaVersion: 1, sceneId: "scene_motion",
    coordinates: "right-handed-y-up-meters", durationUs: 4_000_000,
    entities: [boxEntity("entity_hero", [0, 0.5, 0])],
    cameras: [baseCamera],
    animations: [{
      channelId: "channel_step", targetId: "entity_hero", property: "position",
      interpolation: "step",
      keys: [
        { timeUs: 0, value: [0, 0.5, 0] },
        { timeUs: 2_000_000, value: [30, 0.5, 0] },
      ],
    }],
    assets: [], generators: [], overrides: [],
    ...overrides,
  }
}

const evaluateAll = (scn: unknown, timesUs: readonly number[]) => {
  const parsed = parseSpatialScene(scn)
  return timesUs.map((timeUs) => evaluateSpatialScene(parsed, { timeUs, cameraId: "camera_main" }))
}

describe("spatial temporal audit", () => {
  test("a calm run produces a bounded report with zero findings", () => {
    const snapshots = [snapshot(0), snapshot(1_000_000), snapshot(2_000_000)]
    const report = auditSpatialTemporalEvidence({ snapshots })
    expect(report.kind).toBe("slopcamera.spatial-temporal-audit-report")
    expect(report.findings).toHaveLength(0)
    expect(report.omittedFindings).toBe(0)
    expect(report.sampleCount).toBe(3)
    expect(report.cameraId).toBe("camera_main")
    expect(report.sceneSha256).toBe(SHA)
  })

  test("flags a step-teleporting entity at the exact boundary sample", () => {
    const snapshots = evaluateAll(movingScene(), [0, 1_000_000, 2_000_000, 3_000_000])
    const report = auditSpatialTemporalEvidence({ snapshots })
    const discontinuity = report.findings.filter((item) => item.kind === "transform-discontinuity")
    expect(discontinuity).toHaveLength(1)
    expect(discontinuity[0]!.sampleIndex).toBe(2)
    expect(discontinuity[0]!.timeUs).toBe(2_000_000)
    expect(discontinuity[0]!.entityId).toBe("entity_hero")
    expect(discontinuity[0]!.measured).toBeGreaterThan(5)
  })

  test("suppresses discontinuity at a declared cut boundary", () => {
    const snapshots = evaluateAll(movingScene(), [0, 1_000_000, 2_000_000, 3_000_000])
    const report = auditSpatialTemporalEvidence({ snapshots, options: { cutBeforeUs: [2_000_000] } })
    expect(report.findings.filter((item) => item.kind === "transform-discontinuity")).toHaveLength(0)
  })

  test("flags planted-contact sliding only inside the contact window", () => {
    const scn = movingScene({
      animations: [{
        channelId: "channel_walk", targetId: "entity_hero", property: "position",
        interpolation: "linear",
        keys: [
          { timeUs: 0, value: [0, 0.5, 0] },
          { timeUs: 4_000_000, value: [4, 0.5, 0] },
        ],
      }],
    })
    const snapshots = evaluateAll(scn, [0, 1_000_000, 2_000_000, 3_000_000, 4_000_000])
    const report = auditSpatialTemporalEvidence({
      snapshots,
      options: { contacts: [{ entityId: "entity_hero", groundY: 0, startUs: 1_000_000, endUs: 2_000_000 }] },
    })
    const slides = report.findings.filter((item) => item.kind === "foot-slide")
    expect(slides).toHaveLength(1)
    expect(slides[0]!.sampleIndex).toBe(2)
    expect(report.contactCount).toBe(1)
  })

  test("flags camera acceleration and jerk on abrupt camera motion", () => {
    const scn = movingScene({
      animations: [{
        channelId: "channel_cam", targetId: "camera_main", property: "position",
        interpolation: "step",
        keys: [
          { timeUs: 0, value: [0, 1.6, 6] },
          { timeUs: 2_000_000, value: [0, 1.6, 46] },
        ],
      }],
    })
    const snapshots = evaluateAll(scn, [0, 500_000, 1_000_000, 1_500_000, 2_000_000, 2_500_000, 3_000_000])
    const report = auditSpatialTemporalEvidence({ snapshots })
    expect(report.findings.some((item) => item.kind === "camera-acceleration" && item.timeUs === 2_000_000)).toBe(true)
    expect(report.findings.some((item) => item.kind === "camera-jerk")).toBe(true)
  })

  test("flags visibility toggles, exposure and focus jumps, and resource spikes on crafted evidence", () => {
    const flickerEntity = (visible: boolean) => ({
      entity: boxEntity("entity_ghost", [0, 0.5, 0]), worldMatrix: identityMatrix([0, 0.5, 0]), visible, selectionId: 2,
    })
    const lensCamera = (exposureEv: number, focusDistanceM: number) => ({
      ...baseCamera, lens: { focalLengthMm: 50, sensorWidthMm: 36, exposureEv, focusDistanceM },
    })
    const asset = (assetId: string) => ({
      assetId,
      payload: { path: `assets/${assetId}.bin`, sha256: "c".repeat(64), bytes: 4 },
      interpretation: { kind: "metadata", format: "json", schema: "slopcamera.provider-metadata" },
      dependencies: [],
      provenance: { source: "authored", description: "fixture asset" },
    })
    const snapshots = [
      snapshot(0, { entities: [flickerEntity(false)] }),
      snapshot(1_000_000, { entities: [flickerEntity(true)], camera: lensCamera(0, 2), assets: [] }),
      snapshot(2_000_000, { entities: [flickerEntity(false)], camera: lensCamera(3, 9), assets: Array.from({ length: 12 }, (_, index) => asset(`asset_new_${index}`)) }),
      snapshot(3_000_000, { entities: [flickerEntity(true)], camera: lensCamera(3, 9) }),
    ]
    const report = auditSpatialTemporalEvidence({ snapshots })
    expect(report.findings.some((item) => item.kind === "visibility-flicker" && item.entityId === "entity_ghost")).toBe(true)
    expect(report.findings.some((item) => item.kind === "exposure-jump" && item.timeUs === 2_000_000 && item.measured === 3)).toBe(true)
    expect(report.findings.some((item) => item.kind === "focus-jump" && item.timeUs === 2_000_000 && item.measured === 7)).toBe(true)
    expect(report.findings.some((item) => item.kind === "resource-spike" && item.timeUs === 2_000_000 && item.measured === 12)).toBe(true)
  })

  test("rejects unsorted, mixed-scene, mixed-camera, or too-short evidence", () => {
    expect(() => auditSpatialTemporalEvidence({ snapshots: [snapshot(0)] })).toThrow()
    expect(() => auditSpatialTemporalEvidence({ snapshots: [snapshot(1_000_000), snapshot(0)] })).toThrow(/strictly increasing/)
    expect(() => auditSpatialTemporalEvidence({ snapshots: [snapshot(0), snapshot(1_000_000, { sceneSha256: "b".repeat(64) })] })).toThrow(/different scene digest/)
    const otherCamera = { ...baseCamera, cameraId: "camera_other" }
    expect(() => auditSpatialTemporalEvidence({ snapshots: [snapshot(0), snapshot(1_000_000, { camera: otherCamera })] })).toThrow(/different camera/)
  })

  test("is deterministic and bounds findings with omittedFindings accounting", () => {
    const many = Array.from({ length: 300 }, (_, index) => ({
      entity: boxEntity(`entity_m_${index}`, [0, 0.5, 0]), worldMatrix: identityMatrix([0, 0.5, 0]), visible: true, selectionId: index + 1,
    }))
    const jumped = many.map((item, index) => ({
      ...item,
      entity: { ...item.entity, transform: { ...item.entity.transform, position: [100, 0.5, 0] } },
      worldMatrix: identityMatrix([100, 0.5, 0]),
      selectionId: index + 1,
    }))
    const snapshots = [
      snapshot(0, { entities: many }),
      snapshot(1_000_000, { entities: jumped }),
      snapshot(2_000_000, { entities: jumped }),
    ]
    const first = auditSpatialTemporalEvidence({ snapshots })
    const second = auditSpatialTemporalEvidence({ snapshots })
    expect(spatialTemporalAuditReportSha256(first)).toBe(spatialTemporalAuditReportSha256(second))
    expect(first.findings.length + first.omittedFindings).toBeGreaterThanOrEqual(300)
    expect(first.findings.every((item) => item.kind === "transform-discontinuity")).toBe(true)
  })
})
