/** Original spatial premiere wall. Source authoring only: no browser or provider calls.
 * Mounts two reviewed published films and an editable diagram inside one directed
 * showroom, then emits the scene, camera request, effects plan, and poster request.
 * bun examples/showcase/spatial/author-premiere.ts
 */
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  applySpatialScenePatch, auditSpatialCameraTrack, compileSpatialCameraRig,
  parseSpatialScene, planSpatialRenderEffects, spatialSceneSha256,
} from "../../../src/spatial-scene/index.ts";
import { SpatialRenderRequestSchema } from "../../../apps/desktop/application/spatial-render.ts";

const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const out = resolve("artifacts/showcase/spatial/premiere");
await mkdir(out, { recursive: true });
const save = async (name: string, value: unknown) => writeFile(join(out, name), JSON.stringify(value, null, 2) + "\n");

/** Bind a published, reviewed example film by its declared sha256. */
async function published(name: string, sha256: string) {
  const path = join("apps/web/media", name);
  const bytes = new Uint8Array(await readFile(path));
  if (hash(bytes) !== sha256) throw new Error(`Published example ${name} does not match its reviewed identity.`);
  await writeFile(join(out, name), bytes);
}
await published("island-pulse-video-df235020e4b9.mp4", "df235020e4b98d0d5330bca47a55d4319b6f1f2024a0f6bc31e60ce186364842");
await published("interference-field-poster-869cf2dd72af.webp", "869cf2dd72afd1960dad38262bdbc1aaaf8a27a038e785319ec36bfe9653729a");
/* The main screen plays the full reviewed film; the side panel mounts its
 * poster as a print. Video preparation decodes per batch, so one live screen
 * is the bounded shape — the print keeps a second authored film in frame. */
{
  const { spawnSync } = await import("node:child_process");
  for (const args of [
    ["-i", join(out, "island-pulse-video-df235020e4b9.mp4"), "-vf", "scale=960:540", join(out, "island-pulse-540.mp4")],
    ["-i", join(out, "interference-field-poster-869cf2dd72af.webp"), join(out, "interference-print.png")],
  ]) {
    const ffmpeg = spawnSync("ffmpeg", ["-y", ...args, "-an"], { stdio: "pipe" });
    if (ffmpeg.status !== 0) throw new Error(`ffmpeg derivative failed: ${ffmpeg.stderr?.toString()}`);
  }
}
await copyFile("src/assets/fonts/nebula-sans/NebulaSans-Book.otf", join(out, "NebulaSans-Book.otf"));
await copyFile("src/assets/fonts/nebula-sans/LICENSE.txt", join(out, "NebulaSans-LICENSE.txt"));

const diagram = {
  version: 1, name: "premiere-assembly", canvas: { width: 560, height: 720 },
  shapes: [
    { id: "author", type: "rect", x: 80, y: 85, width: 400, height: 120, label: "01  AUTHOR MEDIA", labelFontSize: 34 },
    { id: "mount", type: "rect", x: 80, y: 300, width: 400, height: 120, label: "02  MOUNT IN SCENE", labelFontSize: 34 },
    { id: "direct", type: "rect", x: 80, y: 515, width: 400, height: 120, label: "03  DIRECT CAMERA", labelFontSize: 34 },
  ],
  edges: [{ id: "author-mount", from: "author", to: "mount" }, { id: "mount-direct", from: "mount", to: "direct" }],
};
await save("premiere-diagram.json", diagram);

const assets: any[] = [];
async function asset(assetId: string, path: string, interpretation: unknown, description: string, dependencies: string[] = []) {
  const bytes = await readFile(join(out, path));
  assets.push({ assetId, payload: { path, sha256: hash(bytes), bytes: bytes.length }, interpretation,
    provenance: { source: assetId === "asset_font" ? "imported" : assetId.startsWith("asset_") && path.endsWith(".mp4") ? "derived" : "authored", description }, dependencies });
}
await asset("asset_island", "island-pulse-540.mp4", { kind: "video", width: 960, height: 540,
  durationUs: 8_000_000, frameRate: { numerator: 24, denominator: 1 }, alpha: "opaque", colorSpace: "srgb" },
  "Bounded 960×540 derivative of the reviewed published Island Pulse film (sha256-pinned source).");
await asset("asset_field", "interference-print.png", { kind: "image", width: 1280, height: 720, mimeType: "image/png", colorSpace: "srgb", alpha: "opaque" },
  "Raster print of the reviewed published Interference Field poster (sha256-pinned source).");
await asset("asset_font", "NebulaSans-Book.otf", { kind: "font", format: "otf", family: "Nebula Sans" },
  "Repository Nebula Sans Book, retained under its repository OFL license.");
await asset("asset_diagram", "premiere-diagram.json", { kind: "diagram", schemaVersion: 1, theme: "dark" },
  "Original editable three-step diagram authored for this premiere wall.", ["asset_font"]);

const identity = { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] };
const common = { parentId: null, placement: { kind: "world" }, origin: { kind: "authored" }, visible: true };
const entities: any[] = [];
function box(id: string, name: string, size: number[], position: number[], color: string, roughness = .6, receiveShadow = false) {
  entities.push({ ...common, entityId: `entity_${id}`, name, kind: "mesh", geometry: { kind: "box", size },
    transform: { ...identity, position }, material: { kind: "standard", color, opacity: 1, roughness, metalness: .08 },
    castShadow: true, receiveShadow });
}
/* A cinema-dressed wall: deep charcoal backing, warm brass trims, a matte floor
 * that takes the shadows, and a foreground column for camera parallax. */
box("plinth", "Continuous dark display plinth", [12.6, .24, 3.1], [0, .12, -.15], "#23262e");
box("bezel_main", "Main screen bezel", [5.05, 2.95, .2], [-2.1, 1.85, -.02], "#15171d", .3);
box("stem_main", "Main screen support", [.18, .55, .2], [-2.1, .42, -.1], "#15171d");
box("bezel_side", "Side screen bezel", [3.55, 2.1, .18], [1.9, 1.6, -.05], "#15171d", .3);
box("stem_side", "Side screen support", [.15, .6, .18], [1.9, .45, -.08], "#15171d");
box("diagram_back", "Diagram board", [2.31, 3.06, .14], [4.6, 1.81, -.1], "#3a3125");
box("brass_rail", "Warm brass wall rail", [12.4, .06, .06], [0, 3.42, -.32], "#c8924a", .35);
box("foreground_fin", "Foreground column — intentional depth occluder", [.5, 4.6, .7], [-4.1, 2.3, 3.4], "#3d4a56", .8);
box("accent_cube", "Brass calibration cube", [.5, .5, .5], [3.6, .5, 1.5], "#c8924a", .4);
entities.push({ ...common, entityId: "entity_video_main", name: "Island Pulse live film", kind: "video", assetId: "asset_island",
  width: 4.8, height: 2.7, fit: "contain", opacity: 1, sourceOffsetUs: 0, playback: "loop",
  transform: { ...identity, position: [-2.1, 1.85, .081] } });
entities.push({ ...common, entityId: "entity_video_side", name: "Interference Field mounted print", kind: "image", assetId: "asset_field",
  width: 3.36, height: 1.89, fit: "contain", opacity: 1,
  transform: { ...identity, position: [1.9, 1.6, .045] } });
entities.push({ ...common, entityId: "entity_diagram", name: "Editable premiere diagram", kind: "diagram", assetId: "asset_diagram",
  width: 2.19, height: 2.94, fit: "contain", opacity: 1, transform: { ...identity, position: [4.6, 1.81, -.03] } });
entities.push({ ...common, entityId: "entity_floor", name: "Matte cinema floor", kind: "mesh", geometry: { kind: "plane", width: 200, height: 200 },
  transform: { ...identity, position: [0, -.01, 0], rotation: [-Math.SQRT1_2, 0, 0, Math.SQRT1_2] },
  material: { kind: "standard", color: "#22242c", opacity: 1, roughness: .9, metalness: .04 }, receiveShadow: true });
entities.push({ ...common, entityId: "entity_backdrop", name: "Midnight backdrop", kind: "mesh", geometry: { kind: "plane", width: 160, height: 80 },
  transform: { ...identity, position: [0, 16, -34] }, material: { kind: "unlit", color: "#101116", opacity: 1 } });
entities.push({ ...common, entityId: "entity_ambient", name: "Low cool ambient", kind: "light", light: "ambient", color: "#5d6a80", intensity: 1.15, transform: identity });
entities.push({ ...common, entityId: "entity_key", name: "Warm projection key", kind: "light", light: "directional", color: "#ffdfae", intensity: 2.6,
  shadow: true, transform: { ...identity, position: [0, 6.5, 6], rotation: [-.3, -.18, -.06, Math.sqrt(1-.3**2-.18**2-.06**2)] } });
entities.push({ ...common, entityId: "entity_fill", name: "Cool side fill", kind: "light", light: "directional", color: "#6f87b8", intensity: .8,
  transform: { ...identity, position: [-6, 3, 2], rotation: [.35, .3, .1, Math.sqrt(1-.35**2-.3**2-.1**2)] } });

const camera = { cameraId: "camera_premiere", name: "Premiere camera", pose: { position: [0, 2.9, 12.5], rotation: [0, 0, 0, 1] },
  projection: { kind: "perspective", width: 1280, height: 720, fx: 1160, fy: 1160, cx: 640, cy: 360, near: .1, far: 200 } };
const target = { entityId: "entity_bezel_main", position: [.4, 1.95, 0], radiusM: 5.2 };
const rig = { kind: "rail", cameraId: camera.cameraId, startUs: 0, endUs: 8_000_000, easing: "smootherstep",
  points: [[-3.2, 3.15, 13.2], [-.4, 2.75, 10.8], [2.3, 2.45, 8.6]], target };
const track = compileSpatialCameraRig({ camera, rig, frameRate: { numerator: 24, denominator: 1 }, frameCount: 192 });
const scene = parseSpatialScene({ kind: "slopcamera.spatial-scene", schemaVersion: 1, sceneId: "scene_premiere_wall",
  coordinates: "right-handed-y-up-meters", durationUs: 8_000_000, entities, cameras: [track.samples[0]!.camera], assets, generators: [], overrides: [],
  animations: ["position", "rotation"].map(property => ({ channelId: `channel_camera_${property}`, targetId: camera.cameraId, property,
    interpolation: property === "rotation" ? "slerp" : "linear", keys: track.samples.map(s => ({ timeUs: s.timeUs, value: s.camera.pose[property as "position" | "rotation"] })) })) });
const request = SpatialRenderRequestSchema.parse({ cameraId: camera.cameraId, executionProfile: "three-webgl2-hardware-v1", mode: { kind: "beauty" },
  selection: { kind: "video", range: { startUs: 0, endUs: 8_000_000 }, frameRate: { numerator: 24, denominator: 1 } } });
await save("premiere.scene.json", scene); await save("premiere.rig.json", rig); await save("premiere.track.json", track); await save("premiere.request.json", request);
const audit = auditSpatialCameraTrack(track, { subjects: [target], maxFramingDeviation: .12, maxAcceleration: 12 });
await save("premiere.camera-audit.json", audit);

const effects = planSpatialRenderEffects({ scene, renderPlan: { kind: "slopcamera.spatial-render-plan", schemaVersion: 1,
  quality: { outputBytes: 2_500_000_000, particleCount: 0, pixelBudget: 1280*720, simulationSteps: 0, texturePixelBudget: 16_777_216, tier: "preview" },
  postProcess: { kind: "slopcamera.spatial-post-process", schemaVersion: 1, steps: [
    { kind: "vignette", intensity: .16, radius: .82 }, { kind: "grain", intensity: .02, seed: 719 },
  ] } }, particleSystems: [], simulationBakes: [] });
/* Particle instances prepare one resource per sample; a live film already
 * spends most of the 64-resource batch ceiling, so the wall keeps post grain
 * and vignette and leaves particles out of this published shape. */
await save("premiere.effects.json", effects); await save("premiere.cinematic.request.json", SpatialRenderRequestSchema.parse({ ...request, effects }));
await save("premiere.poster.request.json", { cameraId: camera.cameraId, executionProfile: "three-webgl2-hardware-v1", mode: { kind: "beauty" }, selection: { kind: "frame", timeUs: 4_200_000 } });
await save("source-lineage.json", {
  publishedFilms: assets.filter(a => a.interpretation?.kind === "video").map(a => ({ assetId: a.assetId, path: a.payload.path, sha256: a.payload.sha256 })),
  sceneSha256: spatialSceneSha256(scene), cameraRig: rig.kind, frames: track.samples.length, auditFindings: audit.length,
  authorSourceSha256: hash(await readFile(import.meta.path)) });
console.log(JSON.stringify({ sourceRoot: out, sceneSha256: spatialSceneSha256(scene), frames: track.samples.length, auditFindings: audit.length }, null, 2));
