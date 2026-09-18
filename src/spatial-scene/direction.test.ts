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
    expect(() => parseSpatialDirection(direction({ beats: [{ id: "beat_01", startUs: 1_000_000, endUs: 0, intent: "x", emotion: "x" }] }))).toThrow(/positive duration/);
  });

  test("defaults proposal verification to false", () => {
    const d = parseSpatialDirection(direction());
    expect(d.beats[0]!.verified).toBe(false);
  });

  test("rejects duplicate ids, unsorted entries, and overlapping camera coverage", () => {
    expect(() => parseSpatialDirection(direction({
      actions: [{ id: "beat_01", characterId: "character_one", startUs: 0, endUs: 1, action: "idle" }],
    }))).toThrow(/globally unique/);
    expect(() => parseSpatialDirection(direction({
      beats: [
        { id: "beat_later", startUs: 10, endUs: 20, intent: "later", emotion: "calm" },
        { id: "beat_earlier", startUs: 0, endUs: 5, intent: "earlier", emotion: "calm" },
      ],
    }))).toThrow(/ordered/);
    expect(() => parseSpatialDirection(direction({
      coverage: [
        { id: "coverage_a", startUs: 0, endUs: 10, rigKind: "tripod", framing: "medium" },
        { id: "coverage_b", startUs: 5, endUs: 20, rigKind: "dolly", framing: "wide" },
      ],
    }))).toThrow(/must not overlap/);
  });

  test("requires targets only for interactions and bounds the project digest", () => {
    expect(() => parseSpatialDirection(direction({
      actions: [{ id: "action_one", characterId: "character_one", startUs: 0, endUs: 1, action: "interact" }],
    }))).toThrow(/require a targetId/);
    expect(() => parseSpatialDirection(direction({ projectDigest: "not-a-digest" }))).toThrow();
  });
});
