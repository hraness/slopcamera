/** Original spatial showroom. Source authoring only: no browser or provider calls.
 * Run after the HTML editorial example, passing its exact render result JSON.
 * bun examples/showcase/spatial/author-stage.ts artifacts/showcase/html/editorial.render.json
 */
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import { canonicalJsonSha256 } from "../../../src/code/canonical-json.ts";
import { HtmlSceneInputSchema } from "../../../apps/desktop/html-overlay/scene.ts";
import {
  applySpatialScenePatch, auditSpatialCameraTrack, compileSpatialCameraRig,
  parseSpatialScene, planSpatialRenderEffects, spatialSceneSha256,
} from "../../../src/spatial-scene/index.ts";
import { SpatialRenderRequestSchema } from "../../../apps/desktop/application/spatial-render.ts";

const resultPath = process.argv[2];
if (!resultPath) throw new Error("Pass the exact successful editorial html-render JSON.");
const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const Artifact = z.object({ path: z.string().regex(/^artifacts\/slopcamera\/generated\/html-scenes\/html_[a-z0-9]+\/[A-Za-z0-9_./-]+$/u)
  .refine(path => !path.split("/").some(part => part === ".." || part === ".")), bytes: z.number().int().min(1).max(32 * 1024 * 1024), sha256: z.string().regex(/^[a-f0-9]{64}$/u) });
const Verification = z.object({ width: z.literal(1280), height: z.literal(720), frameCount: z.literal(192), durationUs: z.literal(8_000_000), audio: z.null() });
async function boundedRead(path: string, maximum: number) {
  const before = await stat(path);
  if (!before.isFile() || before.size > maximum) throw new Error("Editorial source exceeds its declared bounds.");
  const bytes = await readFile(path);
  if (bytes.length !== before.size || bytes.length > maximum) throw new Error("Editorial source changed while reading.");
  return bytes;
}
async function verifiedArtifact(input: unknown, maximum: number) {
  const artifact = Artifact.parse(input), bytes = await boundedRead(artifact.path, maximum);
  if (bytes.length !== artifact.bytes || hash(bytes) !== artifact.sha256) throw new Error("Editorial artifact identity mismatch.");
  return bytes;
}
const htmlResult = z.object({ kind: z.literal("slopcamera.html-scene-export"), schemaVersion: z.literal(1), receipt: Artifact, source: Artifact,
  output: Artifact, verification: Verification }).parse(JSON.parse((await boundedRead(resultPath, 64 * 1024)).toString()));
const htmlReceipt = z.object({ kind: z.literal("slopcamera.html-scene-receipt"), schemaVersion: z.literal(1), source: Artifact, document: Artifact,
  authoring: Artifact, video: Artifact, output: Artifact, verification: Verification }).parse(JSON.parse((await verifiedArtifact(htmlResult.receipt, 64 * 1024)).toString()));
if (canonicalJsonSha256(htmlReceipt.source) !== canonicalJsonSha256(htmlResult.source)
  || canonicalJsonSha256(htmlReceipt.output) !== canonicalJsonSha256(htmlResult.output)) throw new Error("Editorial result and receipt disagree.");
const sourceBytes = await verifiedArtifact(htmlReceipt.source, 64 * 1024);
const retainedSource = HtmlSceneInputSchema.parse(JSON.parse(sourceBytes.toString()));
const expectedSource = HtmlSceneInputSchema.parse(JSON.parse((await boundedRead("examples/showcase/html/editorial.json", 64 * 1024)).toString()));
const documentBytes = await verifiedArtifact(htmlReceipt.document, 512 * 1024);
const expectedDocument = await boundedRead("examples/showcase/html/editorial.html", 512 * 1024);
if (!("path" in retainedSource.document) || retainedSource.document.path !== htmlReceipt.document.path
  || canonicalJsonSha256({ ...retainedSource, document: expectedSource.document }) !== canonicalJsonSha256(expectedSource)
  || hash(documentBytes) !== hash(expectedDocument)) throw new Error("Retained render does not match the declared editorial source.");
const authoring = JSON.parse((await verifiedArtifact(htmlReceipt.authoring, 1024 * 1024)).toString());
if (canonicalJsonSha256(authoring) !== canonicalJsonSha256({ kind: "slopcamera.html-overlay", schemaVersion: 1, canvas: expectedSource.canvas,
  timing: expectedSource.timing, libraries: expectedSource.libraries, parameters: expectedSource.parameters, resources: [], seed: expectedSource.seed,
  html: expectedDocument.toString() })) throw new Error("Editorial authoring differs from its source.");
const videoBytes = await verifiedArtifact(htmlReceipt.video, 32 * 1024 * 1024);
await verifiedArtifact(htmlReceipt.output, 32 * 1024 * 1024);
const out = resolve("artifacts/showcase/spatial/source");
await mkdir(out, { recursive: true });
const save = async (name: string, value: unknown) => writeFile(join(out, name), JSON.stringify(value, null, 2) + "\n");
await writeFile(join(out, "editorial-rgb.mp4"), videoBytes);
await copyFile("src/assets/fonts/nebula-sans/NebulaSans-Book.otf", join(out, "NebulaSans-Book.otf"));
await copyFile("src/assets/fonts/nebula-sans/LICENSE.txt", join(out, "NebulaSans-LICENSE.txt"));

const diagram = {
  version: 1, name: "source-to-screen", canvas: { width: 560, height: 720 },
  shapes: [
    { id: "source", type: "rect", x: 80, y: 85, width: 400, height: 120, label: "01  EDIT SOURCE", labelFontSize: 34 },
    { id: "camera", type: "rect", x: 80, y: 300, width: 400, height: 120, label: "02  DIRECT CAMERA", labelFontSize: 34 },
    { id: "render", type: "rect", x: 80, y: 515, width: 400, height: 120, label: "03  RENDER FILM", labelFontSize: 34 },
  ],
  edges: [{ id: "source-camera", from: "source", to: "camera" }, { id: "camera-render", from: "camera", to: "render" }],
};
await save("process-diagram.json", diagram);
const assets: any[] = [];
async function asset(assetId: string, path: string, interpretation: unknown, description: string, dependencies: string[] = []) {
  const bytes = await readFile(join(out, path));
  assets.push({ assetId, payload: { path, sha256: hash(bytes), bytes: bytes.length }, interpretation,
    provenance: { source: assetId === "asset_font" ? "imported" : assetId === "asset_editorial" ? "derived" : "authored", description }, dependencies });
}
await asset("asset_editorial", "editorial-rgb.mp4", { kind: "video", width: 1280, height: 720,
  durationUs: 8_000_000, frameRate: { numerator: 24, denominator: 1 }, alpha: "opaque", colorSpace: "srgb" },
  "Original Slopcamera editorial HTML film; exact retained RGB scene derivative, bound to its HTML receipt.");
await asset("asset_font", "NebulaSans-Book.otf", { kind: "font", format: "otf", family: "Nebula Sans" },
  "Repository Nebula Sans Book, retained under its repository OFL license.");
await asset("asset_diagram", "process-diagram.json", { kind: "diagram", schemaVersion: 1, theme: "light" },
  "Original editable three-step diagram authored for this showroom.", ["asset_font"]);
const identity = { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] };
const common = { parentId: null, placement: { kind: "world" }, origin: { kind: "authored" }, visible: true };
const entities: any[] = [];
function box(id: string, name: string, size: number[], position: number[], color: string, roughness = .6) {
  entities.push({ ...common, entityId: `entity_${id}`, name, kind: "mesh", geometry: { kind: "box", size },
    transform: { ...identity, position }, material: { kind: "standard", color, opacity: 1, roughness, metalness: .08 },
    // Keep the ground shadow while avoiding self-shadow acne on thin display boxes.
    castShadow: true, receiveShadow: false });
}
box("plinth", "Continuous display plinth", [8.3, .22, 2.6], [0, .11, -.1], "#b8c5b8");
box("bezel", "Screen bezel — editable finish", [5.02, 2.92, .18], [-1.3, 1.78, -.03], "#36443b", .35);
box("screen_stem", "Screen support", [.16, .48, .18], [-1.3, .4, -.1], "#36443b");
box("diagram_back", "Diagram board", [2.31, 3.06, .13], [2.6, 1.81, -.12], "#ddd6c6");
box("foreground_fin", "Foreground fin — intentional depth occluder", [.32, 3.8, .6], [-3.4, 1.9, 2.05], "#e88662", .75);
box("accent_cube", "Coral calibration cube", [.44, .44, .44], [2.85, .46, 1.1], "#e88662", .45);
entities.push({ ...common, entityId: "entity_video", name: "Live editorial video plane", kind: "video", assetId: "asset_editorial",
  width: 4.8, height: 2.7, fit: "contain", opacity: 1, sourceOffsetUs: 0, playback: "loop",
  transform: { ...identity, position: [-1.3, 1.78, .071] } });
entities.push({ ...common, entityId: "entity_diagram", name: "Editable process diagram plane", kind: "diagram", assetId: "asset_diagram",
  width: 2.19, height: 2.94, fit: "contain", opacity: 1, transform: { ...identity, position: [2.6, 1.81, -.045] } });
entities.push({ ...common, entityId: "entity_floor", name: "Matte studio floor", kind: "mesh", geometry: { kind: "plane", width: 200, height: 200 },
  transform: { ...identity, position: [0, -.01, 0], rotation: [-Math.SQRT1_2, 0, 0, Math.SQRT1_2] },
  material: { kind: "standard", color: "#d7d7c9", opacity: 1, roughness: 1, metalness: 0 }, receiveShadow: true });
entities.push({ ...common, entityId: "entity_backdrop", name: "Warm backdrop", kind: "mesh", geometry: { kind: "plane", width: 120, height: 60 },
  transform: { ...identity, position: [0, 15, -30] }, material: { kind: "unlit", color: "#c8ccbd", opacity: 1 } });
entities.push({ ...common, entityId: "entity_dust", name: "Optional restrained dust volume", kind: "group", transform: { ...identity, position: [0, 2, .4] } });
entities.push({ ...common, entityId: "entity_ambient", name: "Soft ambient", kind: "light", light: "ambient", color: "#e6ece2", intensity: 1.4, transform: identity });
entities.push({ ...common, entityId: "entity_key", name: "Broad warm key", kind: "light", light: "directional", color: "#fff0d8", intensity: 2.5,
  shadow: true, transform: { ...identity, position: [0, 6, 5], rotation: [-.32, -.2, -.07, Math.sqrt(1-.32**2-.2**2-.07**2)] } });
const camera = { cameraId: "camera_stage", name: "Showroom camera", pose: { position: [0, 3.1, 11], rotation: [0, 0, 0, 1] },
  projection: { kind: "perspective", width: 960, height: 540, fx: 890, fy: 890, cx: 480, cy: 270, near: .1, far: 180 } };
const target = { entityId: "entity_bezel", position: [0, 1.6, 0], radiusM: 4.2 };
const base = { cameraId: camera.cameraId, startUs: 0, endUs: 8_000_000, easing: "smootherstep", target };
const rigs = [
  { ...base, kind: "orbit", center: [0, 1.6, 0], radiusM: 11.5, startAngleRad: -.15, endAngleRad: .19, heightM: 1.7 },
  { ...base, kind: "dolly", from: [0, 3.2, 13], to: [0, 2.65, 10.6] },
  { ...base, kind: "crane", from: [0, 2.25, 11.8], to: [0, 5.0, 11.8] },
  { ...base, kind: "rail", points: [[-2.8, 3.1, 11.8], [-.8, 3.1, 11.8], [2.5, 3.1, 11.8]] },
  { ...base, kind: "tripod", pose: camera.pose },
  { ...base, kind: "handheld", pose: camera.pose, shake: { seed: 719, amplitudeM: .027, frequencyHz: .55, layers: 3 } },
  { ...base, kind: "chase", offset: [0, 1.55, 11.5], fromTarget: [-.6, 1.6, 0], toTarget: [.6, 1.6, 0] },
  { ...base, kind: "target-tracking", from: [-1.2, 3.1, 11.5], to: [1.2, 3.1, 11.5], targetEnd: [.5, 1.6, 0] },
];
const summary: any[] = [];
for (const rig of rigs) {
  const track = compileSpatialCameraRig({ camera, rig, frameRate: { numerator: 24, denominator: 1 }, frameCount: 192 });
  const scene = parseSpatialScene({ kind: "slopcamera.spatial-scene", schemaVersion: 1, sceneId: `scene_showroom_${rig.kind.replaceAll("-", "_")}`,
    coordinates: "right-handed-y-up-meters", durationUs: 8_000_000, entities, cameras: [track.samples[0]!.camera], assets, generators: [], overrides: [],
    animations: ["position", "rotation"].map(property => ({ channelId: `channel_camera_${property}`, targetId: camera.cameraId, property,
      interpolation: property === "rotation" ? "slerp" : "linear", keys: track.samples.map(s => ({ timeUs: s.timeUs, value: s.camera.pose[property as "position" | "rotation"] })) })) });
  const request = SpatialRenderRequestSchema.parse({ cameraId: camera.cameraId, executionProfile: "three-webgl2-hardware-v1", mode: { kind: "beauty" },
    selection: { kind: "video", range: { startUs: 0, endUs: 8_000_000 }, frameRate: { numerator: 24, denominator: 1 } } });
  await save(`${rig.kind}.scene.json`, scene); await save(`${rig.kind}.rig.json`, rig); await save(`${rig.kind}.track.json`, track); await save(`${rig.kind}.request.json`, request);
  const audit = auditSpatialCameraTrack(track, { subjects: [target], maxFramingDeviation: .12, maxAcceleration: 12 });
  await save(`${rig.kind}.camera-audit.json`, audit);
  summary.push({ rig: rig.kind, sceneSha256: spatialSceneSha256(scene), frames: track.samples.length, auditFindings: audit.length });
  if (rig.kind === "orbit") {
    const patch = { kind: "slopcamera.spatial-scene-patch", schemaVersion: 1, expectedSceneSha256: spatialSceneSha256(scene), operations: [
      { kind: "set-color", entityId: "entity_bezel", color: "#e9dfc9" },
      { kind: "set-color", entityId: "entity_plinth", color: "#3b5b55" },
      { kind: "set-color", entityId: "entity_foreground_fin", color: "#b1caa0" },
    ] };
    const revised = applySpatialScenePatch(scene, patch);
    await save("warm-finish.patch.json", patch); await save("warm-finish.scene.json", revised.scene); await save("warm-finish.diff.json", revised.diff);
    const effects = planSpatialRenderEffects({ scene, renderPlan: { kind: "slopcamera.spatial-render-plan", schemaVersion: 1,
      quality: { outputBytes: 2_500_000_000, particleCount: 48, pixelBudget: 960*540, simulationSteps: 0, texturePixelBudget: 16_777_216, tier: "preview" },
      postProcess: { kind: "slopcamera.spatial-post-process", schemaVersion: 1, steps: [
        { kind: "vignette", intensity: .12, radius: .8 }, { kind: "grain", intensity: .018, seed: 719 },
      ] } }, particleSystems: [{ kind: "slopcamera.spatial-particle-system", schemaVersion: 1, entityId: "entity_dust", countTier: "preview", maxCount: 48,
      forces: [{ kind: "drag", coefficient: .1 }], killVolumes: [], collisionVolumes: [], renderer: { kind: "sprite", billboard: true },
      emitters: [{ id: "dust", seed: 719, burst: 24, rate: 3, lifetimeUs: [5_000_000, 8_000_000], shape: { kind: "box", size: [8, 3, 2], volume: true },
        velocity: [.015, .035, 0], velocitySpread: [.05, .025, .015], colorOverLife: [[1, .96, .8, 1], [1, .96, .8, 1]],
        opacityOverLife: { keys: [{ t: 0, value: 0 }, { t: .2, value: .22 }, { t: .8, value: .22 }, { t: 1, value: 0 }] },
        sizeOverLife: { keys: [{ t: 0, value: .016 }, { t: 1, value: .026 }] } }],
    }], simulationBakes: [] });
    await save("cinematic.effects.json", effects); await save("cinematic.request.json", SpatialRenderRequestSchema.parse({ ...request, effects }));
    await save("poster.request.json", { cameraId: camera.cameraId, executionProfile: "three-webgl2-hardware-v1", mode: { kind: "beauty" }, selection: { kind: "frame", timeUs: 3_000_000 } });
  }
}
await save("source-lineage.json", { inputHtmlResult: resultPath, htmlReceiptSha256: htmlResult.receipt.sha256, videoSha256: htmlReceipt.video.sha256,
  htmlSourceSha256: htmlReceipt.source.sha256, htmlDocumentSha256: htmlReceipt.document.sha256, htmlAuthoringSha256: htmlReceipt.authoring.sha256,
  authorSourceSha256: hash(await readFile(import.meta.path)), sourceSceneCount: rigs.length, cameraRigs: summary });
console.log(JSON.stringify({ sourceRoot: out, cameraRigs: summary }, null, 2));
