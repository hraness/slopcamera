/** Source-only planning + a real ALGAL pure bake. No renderer, provider or project mutation. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  auditSpatialBehaviorTrace, bakeSpatialBehavior, checkSpatialDirection,
  compileSpatialDirection, parseSpatialScene, planSpatialDirectionGallery,
  SPATIAL_BEHAVIOR_STDLIB_LOCOMOTION_FSM, spatialSceneSha256,
} from "../../../src/spatial-scene/index.ts";

const root = "artifacts/showcase/spatial/source";
const scene = parseSpatialScene(JSON.parse(await readFile(join(root, "orbit.scene.json"), "utf8")));
const sceneSha256 = spatialSceneSha256(scene);
const save = async (name: string, value: unknown) => writeFile(join(root, name), JSON.stringify(value, null, 2) + "\n");
const direction = {
  kind: "slopcamera.spatial-direction", schemaVersion: 1, entityId: "bezel", projectDigest: sceneSha256,
  beats: [
    { id: "beat_establish", startUs: 0, endUs: 4_000_000, intent: "Establish the screen and process board as physical surfaces.", emotion: "precise" },
    { id: "beat_reveal", startUs: 4_000_000, endUs: 8_000_000, intent: "Reveal the foreground fin and the editable display finishes.", emotion: "curious" },
  ],
  actions: [],
  coverage: [
    { id: "coverage_establish", startUs: 0, endUs: 4_000_000, rigKind: "dolly", framing: "wide", subjectId: "bezel" },
    { id: "coverage_reveal", startUs: 4_000_000, endUs: 8_000_000, rigKind: "orbit", framing: "medium-wide", subjectId: "bezel" },
  ],
  looks: [{ id: "look_studio", startUs: 0, endUs: 8_000_000, lighting: "Soft warm key across matte green materials", atmosphere: "Quiet editorial studio" }],
};
const checked = checkSpatialDirection({ direction, scene });
if (checked.counts.errors) throw new Error(JSON.stringify(checked));
const compilation = compileSpatialDirection({ direction, scene, cameraId: "camera_stage" });
await save("showroom.direction.json", direction);
await save("showroom.direction-check.json", checked);
await save("showroom.direction-plan.json", compilation);
await save("showroom.camera-gallery.json", planSpatialDirectionGallery({ direction, scene, axis: "camera", cameraId: "camera_stage" }));

// This state trace is intentionally not represented as an applied character performance.
// A retained clip/rig mapping is required before emitted intentions can animate a character.
const lib = SPATIAL_BEHAVIOR_STDLIB_LOCOMOTION_FSM;
const behavior = {
  kind: "slopcamera.spatial-behavior", schemaVersion: 1, behaviorId: "behavior_display_cues", entityId: "accent_cube",
  sceneSha256, seed: 719, rangeUs: { startUs: 0, endUs: 8_000_000 }, organisms: lib.organisms, entry: lib.entry,
  channels: ["display", "display.transition"],
  args: {
    state: { name: "establish", enteredUs: 0 },
    machine: { channel: "display", states: ["establish", "reveal", "hold"], transitions: [
      { from: "establish", to: "reveal", guard: { kind: "after", us: 2_000_000 } },
      { from: "reveal", to: "hold", guard: { kind: "after", us: 3_000_000 } },
    ] },
    win: { ticks: Array.from({ length: 16 }, (_, index) => ({ tUs: index * 500_000 })) },
  },
};
const result = await bakeSpatialBehavior({ behavior, scene });
const audit = auditSpatialBehaviorTrace(JSON.parse(JSON.stringify({ emitted: result.bake.emitted,
  behaviorSha256: result.bake.behaviorSha256, rangeUs: result.bake.rangeUs, emittedSha256: result.bake.receipt.emittedSha256 })));
await save("display-cues.behavior.json", behavior);
await save("display-cues.behavior-check.json", result.check);
await save("display-cues.behavior-bake.json", result.bake);
await save("display-cues.behavior-audit.json", audit);
console.log(JSON.stringify({ directionVerified: compilation.verified, directionErrors: checked.counts.errors,
  behaviorOutcome: result.bake.receipt.outcome, emittedRecords: result.bake.emitted.length,
  behaviorAppliedToScene: false, reason: "Unmapped semantic cues remain proposals; no character clip or rig was supplied." }, null, 2));
