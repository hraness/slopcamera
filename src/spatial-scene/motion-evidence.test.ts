import { describe, expect, test } from "bun:test"

import { parseSpatialMotionEvidence, spatialMotionEvidenceSha256 } from "./motion-evidence"

const REQUEST_SHA256 = "1".repeat(64)
const RENDERER_SHA256 = "2".repeat(64)
const MOTION_SHA256 = "3".repeat(64)

function sample(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    byteLength: 1920 * 1080 * 4,
    encoding: "rg16f",
    entityId: "entity_00000001",
    exposureUs: 16_666,
    height: 1080,
    id: "sample_01",
    motionScale: 1,
    motionSha256: MOTION_SHA256,
    previousTimeUs: 0,
    sampleTimeUs: 16_666,
    samplesPerPixel: 4,
    viewport: [0, 0, 1920, 1080],
    width: 1920,
    ...overrides,
  }
}

function evidence(overrides: Record<string, unknown> = {}): unknown {
  return {
    entityId: "entity_00000001",
    kind: "slopcamera.spatial-motion-evidence",
    renderRequestSha256: REQUEST_SHA256,
    rendererSha256: RENDERER_SHA256,
    samples: [sample()],
    schemaVersion: 1,
    ...overrides,
  }
}

describe("spatial motion evidence", () => {
  test("parses content-bound diagnostic motion samples", () => {
    const parsed = parseSpatialMotionEvidence(evidence())
    expect(parsed.samples[0]!.width).toBe(1920)
    expect(parsed.samples[0]!.motionSha256).toBe(MOTION_SHA256)
    expect(spatialMotionEvidenceSha256(parsed)).toMatch(/^[a-f0-9]{64}$/u)
  })

  test("rejects pixel, viewport, byte, and clock mismatches", () => {
    expect(() => parseSpatialMotionEvidence(evidence({ samples: [sample({ byteLength: 1, height: 8192, viewport: [0, 0, 8192, 8192], width: 8192 })] }))).toThrow(/pixel budget/)
    expect(() => parseSpatialMotionEvidence(evidence({ samples: [sample({ viewport: [100, 0, 1920, 1080] })] }))).toThrow(/viewport escapes/)
    expect(() => parseSpatialMotionEvidence(evidence({ samples: [sample({ byteLength: 1 })] }))).toThrow(/byteLength/)
    expect(() => parseSpatialMotionEvidence(evidence({ samples: [sample({ previousTimeUs: 16_666 })] }))).toThrow(/before sampleTimeUs/)
  })

  test("rejects duplicate, unordered, and cross-entity samples", () => {
    expect(() => parseSpatialMotionEvidence(evidence({ samples: [sample(), sample()] }))).toThrow(/Duplicate motion sample/)
    expect(() => parseSpatialMotionEvidence(evidence({ samples: [sample(), sample({ id: "sample_02", previousTimeUs: 1, sampleTimeUs: 2 })] }))).toThrow(/strictly ordered/)
    expect(() => parseSpatialMotionEvidence(evidence({ samples: [sample({ entityId: "entity_00000002" })] }))).toThrow(/different entity/)
  })
})
