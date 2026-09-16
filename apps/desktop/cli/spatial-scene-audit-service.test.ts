import { expect, test } from "bun:test";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditSpatialScene, createSpatialSceneStarter, spatialSceneSha256, type Bounds, type SpatialSceneV1 } from "../../../src/spatial-scene";
import { applySpatialScenePatch } from "../../../src/spatial-scene/patch";
import { fixtureAsset } from "../../../src/spatial-scene/test-fixture";
import { admitSpatialAssetFile } from "../application/spatial-asset-admission";
import { operationApplicationContext } from "../application/operations/test-support";
import { SpatialAssetAdmissionV1Schema, type SpatialAssetAdmissionV1 } from "../contracts/spatial-asset";
import { parseCliArgs } from "./args";
import { CliError } from "./errors";
import { executeSpatialSceneCommand } from "./spatial-scene-service";

async function fixture(run: (application: ReturnType<typeof operationApplicationContext>, root: string) => Promise<void>): Promise<void> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "slopcamera-scene-audit-")));
  try {
    await run(operationApplicationContext(root), root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

/** Original programmatic fixture, mirroring the closed-profile triangle in gltf.test.ts. */
function admittedTriangleGlb(generator = "SLOPCAMERA original GLB parser fixture"): Uint8Array {
  const binary = new Uint8Array(128), data = new DataView(binary.buffer);
  const floats = [0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1];
  floats.forEach((value, index) => data.setFloat32(index * 4, value, true));
  [0, 0, 1, 0, 0, 1].forEach((value, index) => data.setFloat32(72 + index * 4, value, true));
  [0, 1, 2].forEach((value, index) => data.setUint16(96 + index * 2, value, true));
  const payload = binary.slice(0, 104);
  const document = {
    asset: { version: "2.0", generator },
    buffers: [{ byteLength: 104 }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 36 },
      { buffer: 0, byteOffset: 72, byteLength: 24 }, { buffer: 0, byteOffset: 96, byteLength: 6 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [2, 3, 0] },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 2, componentType: 5126, count: 3, type: "VEC2" },
      { bufferView: 3, componentType: 5123, count: 3, type: "SCALAR" },
    ],
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: "triangle" }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.2, 0.4, 0.8, 0.6], metallicFactor: 0.3, roughnessFactor: 0.7 }, alphaMode: "BLEND", doubleSided: true }],
  };
  const raw = new TextEncoder().encode(JSON.stringify(document));
  const json = new Uint8Array(Math.ceil(raw.length / 4) * 4).fill(32); json.set(raw);
  const bin = new Uint8Array(Math.ceil(payload.length / 4) * 4); bin.set(payload);
  const bytes = new Uint8Array(28 + json.length + bin.length), view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, bytes.length, true);
  view.setUint32(12, json.length, true); view.setUint32(16, 0x4e4f534a, true); bytes.set(json, 20);
  view.setUint32(20 + json.length, bin.length, true); view.setUint32(24 + json.length, 0x004e4942, true); bytes.set(bin, 28 + json.length);
  return bytes;
}

/** Admit one fixture GLB and return the persisted admission document. */
async function admitFixture(root: string, file: string, generator?: string): Promise<SpatialAssetAdmissionV1> {
  await writeFile(join(root, file), admittedTriangleGlb(generator));
  const result = await admitSpatialAssetFile({
    filePath: join(root, file), assetRoot: root, metersPerUnit: 1, sourceUp: "y",
    signal: new AbortController().signal,
  });
  return SpatialAssetAdmissionV1Schema.parse({
    kind: "slopcamera.spatial-asset-admission", schemaVersion: 1,
    manifest: result.manifest, factsManifest: result.factsManifest, facts: result.facts,
    bounds: result.bounds, entity: result.entity, artifacts: result.artifacts, operations: result.operations,
  });
}

/** Apply one admission document's operations, as `scene patch` would. */
function patchedScene(scene: SpatialSceneV1, document: SpatialAssetAdmissionV1): SpatialSceneV1 {
  return applySpatialScenePatch(scene, {
    kind: "slopcamera.spatial-scene-patch", schemaVersion: 1,
    expectedSceneSha256: spatialSceneSha256(scene), operations: [...document.operations],
  }).scene;
}

test("parses the audit subcommand like evaluate", () => {
  expect(parseCliArgs(["scene", "audit", "scene.json", "--camera", "camera_hero", "--times-us", "0,500000", "--asset-bounds", "bounds.json", "--json"]))
    .toEqual({ kind: "spatial-scene", action: "audit", path: "scene.json", camera: "camera_hero", timesUs: [0, 500_000], assetBounds: "bounds.json", json: true });
  expect(parseCliArgs(["scene", "audit", "scene.json", "--camera", "camera_hero"]))
    .toEqual({ kind: "spatial-scene", action: "audit", path: "scene.json", camera: "camera_hero", json: false });
  expect(() => parseCliArgs(["scene", "audit", "scene.json"])).toThrow("--camera");
  expect(() => parseCliArgs(["scene", "audit", "scene.json", "--camera", "camera_hero", "--times-us", "0,oops"])).toThrow("--times-us");
});

test("scene audit returns the deterministic report over the scene file", async () => await fixture(async (application, root) => {
  const scene = createSpatialSceneStarter();
  await writeFile(join(root, "scene.json"), JSON.stringify(scene));
  const output = await executeSpatialSceneCommand(application, {
    kind: "spatial-scene", action: "audit", path: "scene.json", camera: "camera_hero", json: true,
  });
  expect(output).toEqual(auditSpatialScene(scene, { cameraId: "camera_hero" }));
}));

test("scene audit honours --times-us and a bounded --asset-bounds file", async () => await fixture(async (application, root) => {
  const splat = {
    entityId: "entity_splat", kind: "splat" as const, name: "Splat", parentId: null,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    placement: { kind: "world" as const }, origin: { kind: "authored" as const }, visible: true,
    assetId: "asset_splat",
  };
  const scene = {
    ...createSpatialSceneStarter(),
    entities: [...createSpatialSceneStarter().entities, splat],
    assets: [{ ...fixtureAsset("asset_splat"), interpretation: { kind: "splat" as const, format: "spz" as const, metersPerUnit: 1, sourceUp: "y" as const } }],
  };
  const assetBounds: Readonly<Record<string, Bounds>> = { asset_splat: { min: [-1, -1, -1], max: [1, 1, 1] } };
  await writeFile(join(root, "scene.json"), JSON.stringify(scene));
  await writeFile(join(root, "bounds.json"), JSON.stringify(assetBounds));
  const output = await executeSpatialSceneCommand(application, {
    kind: "spatial-scene", action: "audit", path: "scene.json", camera: "camera_hero",
    timesUs: [0, 2_000_000], assetBounds: "bounds.json", json: true,
  });
  expect(output).toEqual(auditSpatialScene(scene, { cameraId: "camera_hero", timesUs: [0, 2_000_000], assetBounds }));
  const report = output as ReturnType<typeof auditSpatialScene>;
  expect(report.timesUs).toEqual([0, 2_000_000]);
  expect(report.entities.find(entity => entity.entityId === "entity_splat")!.enclosure).toEqual({ status: "bounded" });
  await writeFile(join(root, "bad-bounds.json"), JSON.stringify({ asset_missing: { min: [0, 0, 0], max: [1, 1, 1] } }));
  await expect(executeSpatialSceneCommand(application, {
    kind: "spatial-scene", action: "audit", path: "scene.json", camera: "camera_hero", assetBounds: "bad-bounds.json", json: true,
  })).rejects.toThrow(/asset_missing/u);
}));

test("scene audit accepts admission documents, facts pairs, and arrays directly", async () => await fixture(async (application, root) => {
  const document = await admitFixture(root, "model.glb");
  const scene = patchedScene(createSpatialSceneStarter(), document);
  await writeFile(join(root, "scene.json"), JSON.stringify(scene));
  const audit = async (assetBounds: string) => await executeSpatialSceneCommand(application, {
    kind: "spatial-scene", action: "audit", path: "scene.json", camera: "camera_hero", assetBounds, json: true,
  });
  const expected = auditSpatialScene(scene, {
    cameraId: "camera_hero", assetBounds: { [document.manifest.assetId]: document.facts.bounds.sceneSpace },
  });
  const expectBounded = (output: unknown) => {
    const report = output as ReturnType<typeof auditSpatialScene>;
    const entity = report.entities.find(item => item.entityId === document.entity.entityId)!;
    expect(entity.enclosure).toEqual({ status: "bounded" });
    expect(entity.samples.every(sample => sample.bounds !== undefined)).toBe(true);
    expect(report.findings.some(finding => finding.kind === "bounds-unknown" && finding.entityId === entity.entityId)).toBe(false);
  };

  // The admit --output document needs no manual reshape.
  await writeFile(join(root, "admission.json"), JSON.stringify(document));
  const admissionOutput = await audit("admission.json");
  expect(admissionOutput).toEqual(expected);
  expectBounded(admissionOutput);

  // A bare facts payload is accepted only with its subject manifest attached.
  await writeFile(join(root, "pair.json"), JSON.stringify({ manifest: document.manifest, facts: document.facts }));
  expect(await audit("pair.json")).toEqual(expected);

  // Arrays merge documents; identical repeats dedupe rather than conflict.
  await writeFile(join(root, "repeat.json"), JSON.stringify([document, { [document.manifest.assetId]: document.facts.bounds.sceneSpace }]));
  expect(await audit("repeat.json")).toEqual(expected);

  // An array of admission documents covers several assets.
  const second = await admitFixture(root, "other.glb", "SLOPCAMERA second fixture");
  const multi = patchedScene(scene, second);
  await writeFile(join(root, "multi.json"), JSON.stringify(multi));
  await writeFile(join(root, "both.json"), JSON.stringify([document, second]));
  const bothOutput = await executeSpatialSceneCommand(application, {
    kind: "spatial-scene", action: "audit", path: "multi.json", camera: "camera_hero", assetBounds: "both.json", json: true,
  });
  expect(bothOutput).toEqual(auditSpatialScene(multi, {
    cameraId: "camera_hero",
    assetBounds: {
      [document.manifest.assetId]: document.facts.bounds.sceneSpace,
      [second.manifest.assetId]: second.facts.bounds.sceneSpace,
    },
  }));
  const bothReport = bothOutput as ReturnType<typeof auditSpatialScene>;
  expect(bothReport.entities.find(item => item.entityId === second.entity.entityId)!.enclosure).toEqual({ status: "bounded" });
}));

test("scene audit rejects conflicting, malformed, and assetId-less bounds files", async () => await fixture(async (application, root) => {
  const document = await admitFixture(root, "model.glb");
  const scene = patchedScene(createSpatialSceneStarter(), document);
  await writeFile(join(root, "scene.json"), JSON.stringify(scene));
  const audit = (assetBounds: string) => executeSpatialSceneCommand(application, {
    kind: "spatial-scene", action: "audit", path: "scene.json", camera: "camera_hero", assetBounds, json: true,
  });
  const failure = async (assetBounds: string) => await audit(assetBounds).then(() => undefined, (error: unknown) => error);

  // Differing bounds for one assetId across documents conflict; never last-write-wins.
  await writeFile(join(root, "conflict.json"), JSON.stringify([document, { [document.manifest.assetId]: { min: [-9, -9, -9], max: [9, 9, 9] } }]));
  const conflict = await failure("conflict.json");
  expect(conflict).toBeInstanceOf(CliError);
  expect((conflict as CliError).code).toBe("conflict");
  expect((conflict as CliError).message).toMatch(new RegExp(`conflicting scene-space bounds for ${document.manifest.assetId}`, "u"));

  // A bare facts payload carries no assetId and is rejected by name.
  await writeFile(join(root, "facts.json"), JSON.stringify(document.facts));
  const facts = await failure("facts.json");
  expect((facts as CliError).code).toBe("invalid-data");
  expect((facts as CliError).message).toMatch(/carries no assetId/u);

  // A pair whose facts describe a different payload is rejected.
  const second = await admitFixture(root, "other.glb", "SLOPCAMERA second fixture");
  await writeFile(join(root, "mismatched.json"), JSON.stringify({ manifest: document.manifest, facts: second.facts }));
  const mismatched = await failure("mismatched.json");
  expect((mismatched as CliError).code).toBe("invalid-data");
  expect((mismatched as CliError).message).toMatch(/do not describe the manifest payload/u);

  // A truncated admission document fails its strict schema.
  await writeFile(join(root, "truncated.json"), JSON.stringify({ kind: "slopcamera.spatial-asset-admission" }));
  expect((await failure("truncated.json")) as CliError).toMatchObject({ code: "invalid-data" });

  // Anything else names the accepted shapes.
  for (const [name, value] of [["scalar.json", 42], ["bare-bounds.json", { min: [0, 0, 0], max: [1, 1, 1] }], ["unknown-kind.json", { kind: "slopcamera.spatial-audit" }]] as const) {
    await writeFile(join(root, name), JSON.stringify(value));
    const rejected = await failure(name);
    expect((rejected as CliError).code).toBe("invalid-data");
    expect((rejected as CliError).message).toMatch(/--asset-bounds accepts/u);
  }
}));
