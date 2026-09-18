import { describe, expect, test } from "bun:test";

import { parseSpatialDirection } from "./direction";

function direction(overrides: Record<string, unknown> = {}): unknown {
  return {
    kind: "slopcamera.spatial-direction",
    schemaVersion: 1,
    entityId: "direction_00000001",
    projectDigest: "0".repeat(64),
    beats: [{
      id: "beat_01",
      startUs: 0,
      endUs: 1_000_000,
      intent: "A character enters and pauses.",
      emotion: "curious",
    }],
    actions: [],
    coverage: [],
    looks: [],
    ...overrides,
  };
}

describe("spatial direction", () => {
  test("parses a minimal direction document", () => {
    const d = parseSpatialDirection(direction());
    expect(d.beats[0]!.emotion).toBe("curious");
  });

  test("rejects a beat with inverted time", () => {
    expect(() => parseSpatialDirection(direction({ beats: [{ id: "beat_01", startUs: 1_000_000, endUs: 0, intent: "x", emotion: "x" }] }))).toThrow(/startUs/);
  });

  test("rejects an unverified flag default", () => {
    const d = parseSpatialDirection(direction());
    expect(d.beats[0]!.verified).toBe(false);
  });
});
