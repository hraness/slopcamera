/** Author a portable scene from an actually admitted native-character derivative.
 * Usage: bun examples/showcase/spatial/author-character.ts <asset.manifest.json>
 * The admission directory must retain adaptation.json and bound.job.json.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { SpatialAssetManifestSchema, SpatialEntitySchema } from "../../../src/spatial-scene/contracts.ts";
import { compileSpatialCameraRig, parseSpatialScene, spatialSceneSha256 } from "../../../src/spatial-scene/index.ts";
import { parseSpatialGlb } from "../../../src/spatial-scene/gltf.ts";
import { planSpatialRender, SpatialRenderRequestSchema } from "../../../apps/desktop/application/spatial-render.ts";
import { parseStudioJob, parseStudioReceipt, studioJobSha256 } from "../../../src/studio/index.ts";

const manifestPath = process.argv[2];
if (!manifestPath) throw new Error("Pass an actual scene asset admission JSON.");
const originalRoot = dirname(resolve(manifestPath));
const admissionBytes = await readFile(manifestPath);
const admitted = JSON.parse(admissionBytes.toString("utf8"));
const manifest = SpatialAssetManifestSchema.parse(admitted.manifest);
const factsManifest = SpatialAssetManifestSchema.parse(admitted.factsManifest);
const sourceEntity = SpatialEntitySchema.parse(admitted.entity);
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const root = resolve("artifacts/showcase/spatial/character-source");
await mkdir(root, { recursive: true });
for (const asset of [manifest, factsManifest]) {
  const bytes = await readFile(join(originalRoot, asset.payload.path));
  if (hash(bytes) !== asset.payload.sha256 || bytes.length !== asset.payload.bytes) throw new Error("Admitted asset bytes changed.");
  await mkdir(dirname(join(root, asset.payload.path)), { recursive: true });
  await writeFile(join(root, asset.payload.path), bytes);
}
const model = parseSpatialGlb(new Uint8Array(await readFile(join(root, manifest.payload.path))));
if (model.rigFacts?.skins[0]?.jointNodeIndices.length !== 9 || model.rigFacts.clips[0]?.name !== "Wave baked from IK") throw new Error("Expected the qualified nine-joint baked-wave derivative.");
if (model.clipDurationsSeconds[0] !== 6) throw new Error("Expected the complete six-second baked phrase.");
const sidecars = new Map<string, Buffer>();
for (const path of ["adaptation.json", "bound.job.json", "joint-channels.json"]) sidecars.set(path, await readFile(join(originalRoot, path)));
try {
  sidecars.set("adaptation-public.json", await readFile(join(originalRoot, "adaptation-public.json")));
} catch (error) {
  if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
}
const boundJob = parseStudioJob(JSON.parse(sidecars.get("bound.job.json")!.toString("utf8")));
for (const path of ["adaptation.json", "adaptation-public.json"]) {
  const bytes = sidecars.get(path);
  if (!bytes) continue;
  const proof = JSON.parse(bytes.toString("utf8"));
  if (proof.output?.sha256 !== manifest.payload.sha256 || proof.output?.bytes !== manifest.payload.bytes || proof.allAccessorBytesEqual !== true) {
    throw new Error(`${path} does not prove byte-preserving adaptation of this admitted model.`);
  }
  if (typeof proof.nativeJob?.path !== "string") throw new Error(`${path} lacks the actual native receipt.`);
  const receiptBytes = await readFile(resolve(proof.nativeJob.path));
  if (hash(receiptBytes) !== proof.nativeJob.sha256 || receiptBytes.length !== proof.nativeJob.bytes) throw new Error("Native receipt identity changed.");
  const receipt = parseStudioReceipt(JSON.parse(receiptBytes.toString("utf8")));
  if (receipt.jobId !== boundJob.jobId || receipt.jobSha256 !== studioJobSha256(boundJob) || receipt.bundleSha256 !== boundJob.bundleSha256 || receipt.state !== "succeeded") {
    throw new Error("Adaptation receipt does not bind the retained successful native job.");
  }
  if (!receipt.outputs.some(output => output.format === "glb" && output.sha256 === proof.input?.sha256 && output.bytes === proof.input?.bytes)) {
    throw new Error("Adaptation input does not match a native GLB output.");
  }
  sidecars.set("native-job.receipt.json", receiptBytes);
}
for (const [path, bytes] of sidecars) await writeFile(join(root, path), bytes);
await writeFile(join(root, "asset-admission.json"), admissionBytes);
const save = async (name: string, value: unknown) => writeFile(join(root, name), JSON.stringify(value, null, 2) + "\n");
const identity = { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] };
const common = { parentId: null, placement: { kind: "world" }, origin: { kind: "authored" }, visible: true };
const camera = { cameraId: "camera_character", name: "Portable character portrait", pose: { position: [1.8, 1.8, 4.7], rotation: [0, 0, 0, 1] },
  projection: { kind: "perspective", width: 960, height: 540, fx: 820, fy: 820, cx: 480, cy: 270, near: .05, far: 120 } };
const rig = { kind: "orbit", cameraId: camera.cameraId, startUs: 0, endUs: 6_000_000, easing: "smootherstep",
  center: [.15, .94, 0], radiusM: 4.4, startAngleRad: -.12, endAngleRad: .18, heightM: .7,
  target: { entityId: "entity_portable_character", position: [.15, .94, 0], radiusM: 1 } };
const track = compileSpatialCameraRig({ camera, rig, frameRate: { numerator: 24, denominator: 1 }, frameCount: 144 });
const entities = [
  { ...sourceEntity, entityId: "entity_portable_character", name: "Nine-joint character — baked wave", castShadow: true,
    geometry: { kind: "asset", assetId: manifest.assetId, materialMode: "source", clip: { index: 0, offsetUs: 0, playback: "once" } } },
  { ...common, entityId: "entity_pedestal", name: "Low display pedestal", kind: "mesh", geometry: { kind: "box", size: [2.25, .12, 1.35] },
    transform: { ...identity, position: [.15, -.06, 0] }, material: { kind: "standard", color: "#355852", opacity: 1, roughness: .6, metalness: .1 }, receiveShadow: true },
  { ...common, entityId: "entity_floor", name: "Cream studio floor", kind: "mesh", geometry: { kind: "plane", width: 100, height: 100 },
    transform: { ...identity, position: [0, -.125, 0], rotation: [-Math.SQRT1_2, 0, 0, Math.SQRT1_2] },
    material: { kind: "standard", color: "#e4dfce", opacity: 1, roughness: 1, metalness: 0 }, receiveShadow: true },
  { ...common, entityId: "entity_back", name: "Cream backdrop", kind: "mesh", geometry: { kind: "plane", width: 100, height: 100 },
    transform: { ...identity, position: [0, 15, -25] }, material: { kind: "unlit", color: "#e4dfce", opacity: 1 } },
  { ...common, entityId: "entity_ambient", name: "Soft sky fill", kind: "light", light: "ambient", color: "#e7f1ee", intensity: 1.4, transform: identity },
  { ...common, entityId: "entity_key", name: "Warm portrait key", kind: "light", light: "directional", color: "#ffefd5", intensity: 2.2, shadow: true,
    transform: { ...identity, position: [-3, 6, 5], rotation: [-.3, -.2, -.08, Math.sqrt(1-.3**2-.2**2-.08**2)] } },
];
const scene = parseSpatialScene({ kind: "slopcamera.spatial-scene", schemaVersion: 1, sceneId: "scene_portable_character_wave", coordinates: "right-handed-y-up-meters",
  durationUs: 6_000_000, entities, cameras: [track.samples[0]!.camera], assets: [manifest, factsManifest], generators: [], overrides: [],
  animations: ["position", "rotation"].map(property => ({ channelId: `channel_character_camera_${property}`, targetId: camera.cameraId, property,
    interpolation: property === "rotation" ? "slerp" : "linear", keys: track.samples.map(sample => ({ timeUs: sample.timeUs, value: sample.camera.pose[property as "position" | "rotation"] })) })) });
const request = SpatialRenderRequestSchema.parse({ cameraId: camera.cameraId, executionProfile: "three-webgl2-hardware-v1", mode: { kind: "beauty" },
  selection: { kind: "video", range: { startUs: 0, endUs: 6_000_000 }, frameRate: { numerator: 24, denominator: 1 } } });
const plan = planSpatialRender(scene, request);
await save("wave.scene.json", scene); await save("wave.request.json", request); await save("wave.plan.json", plan);
await save("poster.request.json", SpatialRenderRequestSchema.parse({ ...request, selection: { kind: "frame", timeUs: 2_500_000 } }));
await save("camera-rig.json", rig); await save("camera-track.json", track);
await save("source-lineage.json", { originalAdmission: manifestPath, admissionSha256: hash(admissionBytes), modelSha256: manifest.payload.sha256,
  sidecars: [...sidecars].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: hash(bytes) })),
  authorSourceSha256: hash(await readFile(import.meta.path)), sceneSha256: spatialSceneSha256(scene), clip: { index: 0, name: model.rigFacts.clips[0]!.name, durationSeconds: 6 },
  limitations: ["Nine actual joints; no complete canonical humanoid mapping", "Native IK was baked; no live IK solver survives this export", "Facial clips are separate and not blended into this wave playback", "No ALGAL performance mapping is claimed"] });
console.log(JSON.stringify({ status: "authored-not-rendered", root, sceneSha256: spatialSceneSha256(scene), modelSha256: manifest.payload.sha256, clip: 0, frames: 144 }, null, 2));
