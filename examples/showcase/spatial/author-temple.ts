/** Original compute temple corridor. Source authoring only: no browser or provider calls.
 * A dark aisle of server racks leads to a lit portal: emissive status strips,
 * ceiling light panels, a rail camera, and a tone-map/bloom/vignette/grain post
 * stack. Rack rows are emitted as individual entities because the overlay
 * renderer does not yet lower the `instances` field.
 * bun examples/showcase/spatial/author-temple.ts
 */
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  auditSpatialCameraTrack, compileSpatialCameraRig,
  parseSpatialScene, planSpatialRenderEffects, spatialSceneSha256,
} from "../../../src/spatial-scene/index.ts";
import { SpatialRenderRequestSchema } from "../../../apps/desktop/application/spatial-render.ts";

const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const out = resolve("artifacts/showcase/spatial/temple");
await mkdir(out, { recursive: true });
const save = async (name: string, value: unknown) => writeFile(join(out, name), JSON.stringify(value, null, 2) + "\n");

await copyFile("src/assets/fonts/nebula-sans/NebulaSans-Book.otf", join(out, "NebulaSans-Book.otf"));
await copyFile("src/assets/fonts/nebula-sans/LICENSE.txt", join(out, "NebulaSans-LICENSE.txt"));

const assets: any[] = [];
async function asset(assetId: string, path: string, interpretation: unknown, description: string) {
  const bytes = await readFile(join(out, path));
  assets.push({ assetId, payload: { path, sha256: hash(bytes), bytes: bytes.length }, interpretation,
    provenance: { source: "imported", description }, dependencies: [] });
}
await asset("asset_font", "NebulaSans-Book.otf", { kind: "font", format: "otf", family: "Nebula Sans" },
  "Repository Nebula Sans Book, retained under its repository OFL license.");

const identity = { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] };
const common = { parentId: null, placement: { kind: "world" }, origin: { kind: "authored" }, visible: true };
const entities: any[] = [];
const q = (x: number, y: number, z: number) => { const n = Math.hypot(x, y, z, 1) || 1; return [x / n, y / n, z / n, 1 / n]; };

/* The aisle: eight racks per side at 1.35m pitch, each carrying three emissive
 * status strips whose cyan/amber/green mix is a deterministic hash of position. */
const rackXs = [-2.05, 2.05];
const rackZs = Array.from({ length: 8 }, (_, i) => -1.5 - i * 1.35);
const ledColors: [string, string][] = [["cyan", "#7fdcff"], ["amber", "#ffbf66"], ["green", "#7dffb0"]];
let rackIndex = 0;
for (const x of rackXs) for (const z of rackZs) {
  entities.push({ ...common, entityId: `entity_rack_${rackIndex}`, name: `Rack ${rackIndex}`, kind: "mesh",
    geometry: { kind: "box", size: [0.9, 2.6, 1.1] },
    transform: { ...identity, position: [x, 1.3, z] },
    material: { kind: "standard", color: "#1a1e27", opacity: 1, roughness: 0.55, metalness: 0.5 },
    castShadow: true, receiveShadow: true });
  const faceX = x + (x < 0 ? 0.47 : -0.47);
  for (let i = 0; i < 3; i++) {
    const [name, color] = ledColors[Math.abs((rackIndex * 7 + i * 5 + Math.round(-z * 3)) % 3)]!;
    entities.push({ ...common, entityId: `entity_led_${rackIndex}_${i}`, name: `${name} strip ${rackIndex}.${i}`, kind: "mesh",
      geometry: { kind: "box", size: [0.03, 0.42, 0.06] },
      transform: { ...identity, position: [faceX, 0.65 + i * 0.62, z + 0.18 - i * 0.2] },
      material: { kind: "standard", color: "#05070a", opacity: 1, roughness: 0.4, metalness: 0.2, emissive: { color, intensity: 3.4 } } });
  }
  rackIndex++;
}

/* Ceiling: cross beams and emissive light panels down the aisle. */
rackZs.forEach((z, i) => {
  entities.push({ ...common, entityId: `entity_beam_${i}`, name: `Ceiling beam ${i}`, kind: "mesh",
    geometry: { kind: "box", size: [5.6, 0.14, 0.34] }, transform: { ...identity, position: [0, 3.15, z - 0.4] },
    material: { kind: "standard", color: "#14161d", opacity: 1, roughness: 0.7, metalness: 0.3 } });
  entities.push({ ...common, entityId: `entity_panel_${i}`, name: `Ceiling light ${i}`, kind: "mesh",
    geometry: { kind: "box", size: [0.55, 0.05, 1.5] }, transform: { ...identity, position: [0, 3.06, z - 0.4] },
    material: { kind: "standard", color: "#0b0d12", opacity: 1, roughness: 0.5, metalness: 0.1, emissive: { color: "#cfe6ff", intensity: 2.2 } } });
});

/* The portal at the aisle end: a lit frame around a bright emissive aperture. */
entities.push({ ...common, entityId: "entity_portal_frame", name: "Portal frame", kind: "mesh",
  geometry: { kind: "box", size: [2.6, 3.4, 0.3] }, transform: { ...identity, position: [0, 1.7, -12.6] },
  material: { kind: "standard", color: "#232833", opacity: 1, roughness: 0.4, metalness: 0.6 } });
entities.push({ ...common, entityId: "entity_portal", name: "Portal aperture", kind: "mesh",
  geometry: { kind: "plane", width: 1.9, height: 2.7 }, transform: { ...identity, position: [0, 1.65, -12.44] },
  material: { kind: "standard", color: "#dff1ff", opacity: 1, roughness: 1, metalness: 0, emissive: { color: "#bfe3ff", intensity: 4.6 } } });
entities.push({ ...common, entityId: "entity_portal_light", name: "Portal spill", kind: "light", light: "point",
  color: "#9fd0ff", intensity: 26, transform: { ...identity, position: [0, 1.8, -11.9] } });
entities.push({ ...common, entityId: "entity_title", name: "Chapter title", kind: "text",
  text: "COMPUTE TEMPLE", fontAssetId: "asset_font", fontSize: 0.3, width: 6.4, color: "#7d93ad", align: "center",
  transform: { ...identity, position: [0, 3.42, -12.42] } });

/* Floor, end wall, and backdrop close the volume. */
entities.push({ ...common, entityId: "entity_floor", name: "Aisle floor", kind: "mesh",
  geometry: { kind: "plane", width: 80, height: 80 },
  transform: { ...identity, position: [0, 0, 0], rotation: [-Math.SQRT1_2, 0, 0, Math.SQRT1_2] },
  material: { kind: "standard", color: "#191c24", opacity: 1, roughness: 0.35, metalness: 0.55 }, receiveShadow: true });
entities.push({ ...common, entityId: "entity_endwall", name: "End wall", kind: "mesh",
  geometry: { kind: "plane", width: 14, height: 4.4 }, transform: { ...identity, position: [0, 2.2, -12.9] },
  material: { kind: "standard", color: "#11141b", opacity: 1, roughness: 0.8, metalness: 0.2 } });
entities.push({ ...common, entityId: "entity_backdrop", name: "Far void", kind: "mesh",
  geometry: { kind: "plane", width: 120, height: 60 }, transform: { ...identity, position: [0, 12, -30] },
  material: { kind: "unlit", color: "#05060a", opacity: 1 } });

entities.push({ ...common, entityId: "entity_ambient", name: "Cold hall ambient", kind: "light", light: "ambient",
  color: "#39424f", intensity: 0.35, transform: identity });
entities.push({ ...common, entityId: "entity_key", name: "Aisle key", kind: "light", light: "directional",
  color: "#cfe0f4", intensity: 0.6, shadow: true,
  transform: { ...identity, position: [0, 5.5, 4], rotation: q(0, 0.35, 0.5) } });
for (const [i, z] of [-3.5, -7.5].entries())
  entities.push({ ...common, entityId: `entity_aisle_${i}`, name: `Aisle point ${i}`, kind: "light", light: "point",
    color: "#8fb8e8", intensity: 6, transform: { ...identity, position: [0, 2.7, z] } });

const camera = { cameraId: "camera_temple", name: "Temple camera", pose: { position: [0, 1.7, 3.5], rotation: [0, 0, 0, 1] },
  projection: { kind: "perspective", width: 1280, height: 720, fx: 1180, fy: 1180, cx: 640, cy: 360, near: 0.1, far: 120 } };
const target = { entityId: "entity_portal", position: [0, 1.7, -12.44], radiusM: 4.5 };
const rig = { kind: "rail", cameraId: camera.cameraId, startUs: 0, endUs: 8_000_000, easing: "smootherstep",
  points: [[0.55, 1.85, 3.6], [0.0, 1.72, -1.6], [-0.4, 1.62, -6.2]], target };
const track = compileSpatialCameraRig({ camera, rig, frameRate: { numerator: 24, denominator: 1 }, frameCount: 192 });
const scene = parseSpatialScene({ kind: "slopcamera.spatial-scene", schemaVersion: 1, sceneId: "scene_compute_temple",
  coordinates: "right-handed-y-up-meters", durationUs: 8_000_000, entities, cameras: [track.samples[0]!.camera], assets, generators: [], overrides: [],
  animations: ["position", "rotation"].map(property => ({ channelId: `channel_camera_${property}`, targetId: camera.cameraId, property,
    interpolation: property === "rotation" ? "slerp" : "linear", keys: track.samples.map(s => ({ timeUs: s.timeUs, value: s.camera.pose[property as "position" | "rotation"] })) })) });
const request = SpatialRenderRequestSchema.parse({ cameraId: camera.cameraId, executionProfile: "three-webgl2-hardware-v1", mode: { kind: "beauty" },
  selection: { kind: "video", range: { startUs: 0, endUs: 8_000_000 }, frameRate: { numerator: 24, denominator: 1 } } });
await save("temple.scene.json", scene); await save("temple.rig.json", rig); await save("temple.track.json", track); await save("temple.request.json", request);
const audit = auditSpatialCameraTrack(track, { subjects: [target], maxFramingDeviation: .12, maxAcceleration: 12 });
await save("temple.camera-audit.json", audit);

const effects = planSpatialRenderEffects({ scene, renderPlan: { kind: "slopcamera.spatial-render-plan", schemaVersion: 1,
  quality: { outputBytes: 2_500_000_000, particleCount: 0, pixelBudget: 1280 * 720, simulationSteps: 0, texturePixelBudget: 16_777_216, tier: "preview" },
  postProcess: { kind: "slopcamera.spatial-post-process", schemaVersion: 1, steps: [
    { kind: "tone-map", exposure: 1.08, whitePoint: 5 },
    { kind: "bloom", intensity: 0.62, radius: 7, threshold: 0.55 },
    { kind: "vignette", intensity: 0.2, radius: 0.78 },
  ] } }, particleSystems: [], simulationBakes: [] });
await save("temple.effects.json", effects);
await save("temple.cinematic.request.json", SpatialRenderRequestSchema.parse({ ...request, effects }));
await save("temple.poster.request.json", { cameraId: camera.cameraId, executionProfile: "three-webgl2-hardware-v1",
  mode: { kind: "beauty" }, selection: { kind: "frame", timeUs: 4_600_000 }, effects });
await save("source-lineage.json", {
  sceneSha256: spatialSceneSha256(scene), cameraRig: rig.kind, frames: track.samples.length, auditFindings: audit.length,
  entities: entities.length,
  authorSourceSha256: hash(await readFile(import.meta.path)) });
console.log(JSON.stringify({ sourceRoot: out, sceneSha256: spatialSceneSha256(scene), entities: entities.length, frames: track.samples.length, auditFindings: audit.length }, null, 2));
