import { describe, expect, test } from "bun:test";

import { parseSpatialMotionEvidence } from "./motion-evidence";

function evidence(overrides: Record<string, unknown> = {}): unknown {
  return {
    kind: "slopcamera.spatial-motion-evidence",
    schemaVersion: 1,
    entityId: "entity_00000001",
    samples: [{
      id: "sample_01",
      entityId: "entity_00000001",
      viewport: [0, 0, 1920, 1080],
      width: 1920,
      height: 1080,
      samplesPerPixel: 4,
      motionScale: 1,
      exposureUs: 16666,
    }],
    ...overrides,
  };
}

describe("spatial motion evidence", () => {
  test("parses a minimal diagnostic motion sample", () => {
    const s = parseSpatialMotionEvidence(evidence());
    expect(s.samples[0]!.width).toBe(1920);
  });

  test("rejects a sample that exceeds the pixel budget", () => {
    const base = evidence() as any;
    expect(() => parseSpatialMotionEvidence(evidence({ samples: [{ ...base.samples[0], width: 8192, height: 8192 }] }))).toThrow(/pixel budget/);
  });
});
