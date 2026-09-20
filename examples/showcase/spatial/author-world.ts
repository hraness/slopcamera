/** Prepare a saved-world import, or author its camera after a real CLI import.
 * This script never launches a browser or a provider.
 */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { SavedSpatialWorldImportInputSchema, SavedSpatialWorldImportOutputSchema } from "../../../apps/desktop/contracts/spatial-world.ts";
import { inspectSpatialSpz } from "../../../apps/desktop/application/spatial-spz.ts";
import { SpatialRenderRequestSchema } from "../../../apps/desktop/application/spatial-render.ts";
import { compileSpatialCameraRig, parseSpatialScene, spatialSceneSha256 } from "../../../src/spatial-scene/index.ts";

const sourceRoot = resolve("artifacts/showcase/spatial/world-source");
const destinationRoot = resolve("artifacts/slopcamera/generated/showcase-hornedlizard");
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const save = async (root: string, name: string, value: unknown) => writeFile(join(root, name), JSON.stringify(value, null, 2) + "\n");
const sourceReceipt = JSON.parse(await readFile(join(sourceRoot, "conversion-receipt.json"), "utf8"));
async function payload(path: string) {
  const bytes = await readFile(join(sourceRoot, path));
  return { path, sha256: hash(bytes), bytes: bytes.length };
}
const splat = await payload("hornedlizard-even-index-v2.spz");
if (splat.sha256 !== sourceReceipt.derivative.sha256) throw new Error("Derivative source receipt mismatch.");
const inspection = await inspectSpatialSpz(new Uint8Array(await readFile(join(sourceRoot, splat.path))), new AbortController().signal);
await save(sourceRoot, "slopcamera-decoder-admission.json", inspection);
const request = SavedSpatialWorldImportInputSchema.parse({
  splat,
  identities: { assetId: "asset_hornedlizard", entityId: "entity_hornedlizard", name: "Horned lizard — retained even-index SPZ derivative" },
  normalization: {
    // Presentation convention only. The sample supplies no measured metric scale.
    metersPerUnit: 1, sourceUp: "y", sourceHandedness: "right",
    transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
  },
  // The importer's optional receipt currently accepts only WorldLabs receipts.
  // Keep our independent conversion receipt in the source closure instead.
  provenance: { kind: "saved", description: `Niantic MIT hornedlizard.spz at affd0ecea7fbb4c265ee119475af7ee5b2997482; every even original index retained across every attribute section. Conversion receipt SHA256 ${(await payload("conversion-receipt.json")).sha256}. One source unit is displayed as one scene unit, not a measured meter. No collider or editable internal geometry.` },
});
await save(sourceRoot, "import.request.json", request);

const importResultPath = process.argv[2];
if (!importResultPath) {
  console.log(JSON.stringify({ status: "prepared-only", sourceRoot, destinationRoot, request: join(sourceRoot, "import.request.json"), inspection }, null, 2));
} else {
  const imported = SavedSpatialWorldImportOutputSchema.parse(JSON.parse(await readFile(importResultPath, "utf8")));
  if (imported.manifest.splat.payload.sha256 !== splat.sha256) throw new Error("Actual import must match the verified derivative.");
  for (const asset of imported.assets) {
    const bytes = await readFile(join(destinationRoot, asset.payload.path));
    if (hash(bytes) !== asset.payload.sha256 || bytes.length !== asset.payload.bytes) throw new Error(`Imported asset mismatch: ${asset.assetId}`);
  }
  for (const path of ["conversion-receipt.json", "LICENSE-Niantic.txt", "slopcamera-decoder-admission.json"]) {
    await writeFile(join(destinationRoot, path), await readFile(join(sourceRoot, path)));
  }
  const camera = { cameraId: "camera_world", name: "Saved capture orbit", pose: { position: [0, 1.1, 3], rotation: [0, 0, 0, 1] },
    projection: { kind: "perspective", width: 960, height: 540, fx: 740, fy: 740, cx: 480, cy: 270, near: .05, far: 500 } };
  const rig = { kind: "orbit", cameraId: camera.cameraId, startUs: 0, endUs: 6_000_000, easing: "smootherstep",
    center: [0, -.1, 0], radiusM: 3, startAngleRad: -.35, endAngleRad: .35, heightM: 1.2,
    target: { entityId: "entity_hornedlizard", position: [0, -.1, 0], radiusM: 1.3 } };
  const track = compileSpatialCameraRig({ camera, rig, frameRate: { numerator: 24, denominator: 1 }, frameCount: 144 });
  const scene = parseSpatialScene({ kind: "slopcamera.spatial-scene", schemaVersion: 1, sceneId: "scene_hornedlizard_saved_capture",
    coordinates: "right-handed-y-up-meters", durationUs: 6_000_000, entities: [imported.entity], cameras: [track.samples[0]!.camera], assets: imported.assets,
    generators: [], overrides: [], animations: ["position", "rotation"].map(property => ({ channelId: `channel_world_camera_${property}`, targetId: camera.cameraId, property,
      interpolation: property === "rotation" ? "slerp" : "linear", keys: track.samples.map(sample => ({ timeUs: sample.timeUs, value: sample.camera.pose[property as "position" | "rotation"] })) })) });
  const render = SpatialRenderRequestSchema.parse({ cameraId: camera.cameraId, executionProfile: "three-spark-webgl2-hardware-v1", mode: { kind: "beauty" },
    selection: { kind: "video", range: { startUs: 0, endUs: 6_000_000 }, frameRate: { numerator: 24, denominator: 1 } } });
  await save(destinationRoot, "scene.json", scene);
  await save(destinationRoot, "camera-rig.json", rig);
  await save(destinationRoot, "camera-track.json", track);
  await save(destinationRoot, "render.request.json", render);
  await save(destinationRoot, "poster.request.json", SpatialRenderRequestSchema.parse({ ...render, selection: { kind: "frame", timeUs: 3_000_000 } }));
  await save(destinationRoot, "source-lineage.json", { sourceReceipt, importedManifestSha256: imported.manifestSha256, sceneSha256: spatialSceneSha256(scene),
    scale: "presentation-only; source units were not physically calibrated", bounds: inspection.modelBounds, framing: "Authored around the central capture, not the full bounds of distant background splats. Requires visual review." });
  console.log(JSON.stringify({ status: "authored-not-rendered", scene: join(destinationRoot, "scene.json"), sceneSha256: spatialSceneSha256(scene), importedManifestSha256: imported.manifestSha256 }, null, 2));
}
