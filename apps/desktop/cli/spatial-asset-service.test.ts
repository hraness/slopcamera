import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { applySpatialScenePatch } from "../../../src/spatial-scene/patch";
import { spatialSceneSha256 } from "../../../src/spatial-scene/identity";
import { fixtureScene } from "../../../src/spatial-scene/test-fixture";
import { operationApplicationContext } from "../application/operations/test-support";
import { SpatialAssetAdmissionV1Schema } from "../contracts/spatial-asset";
import { parseCliArgs } from "./args";
import type { CliIo } from "./io";
import { createCliTestRunner } from "./run-cli-test-helper";

const runCli = createCliTestRunner(import.meta.url);

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

function testIo(root: string, output: string[], errors: string[]): CliIo {
  return { cwd: () => root, env: {}, now: () => new Date(), platform: process.platform, stdout: value => output.push(value), stderr: value => errors.push(value) };
}

function dependencies(root: string, io: CliIo) {
  return { io, paths: operationApplicationContext(root).paths, stateRoot: join(root, "state") };
}

async function workspace(name: string): Promise<{ readonly root: string; readonly cleanup: () => Promise<void> }> {
  const root = await realpath(await mkdtemp(join(tmpdir(), `slopcamera-asset-admit-${name}-`)));
  return { root, cleanup: async () => await rm(root, { recursive: true, force: true }) };
}

function errorCode(errors: readonly string[]): string | undefined {
  for (const line of errors) {
    try {
      const parsed = JSON.parse(line) as { error?: { code?: string } };
      if (parsed.error?.code !== undefined) return parsed.error.code;
    } catch { /* human output */ }
  }
  return undefined;
}

describe("scene asset admit", () => {
  test("parses its bounded options and rejects malformed invocations", () => {
    expect(parseCliArgs(["scene", "asset", "admit", "model.glb", "--output", "manifest.json"]))
      .toMatchObject({ kind: "spatial-asset", action: "admit", file: "model.glb", output: "manifest.json", metersPerUnit: 1, sourceUp: "y", json: false });
    expect(parseCliArgs(["scene", "asset", "admit", "model.glb", "--output", "manifest.json", "--source-root", "imports", "--asset-id", "asset_tree", "--meters-per-unit", "0.01", "--source-up", "z", "--json"]))
      .toMatchObject({ sourceRoot: "imports", assetId: "asset_tree", metersPerUnit: 0.01, sourceUp: "z", json: true });
    for (const argv of [
      ["scene", "asset", "admit", "model.glb"],
      ["scene", "asset", "admit", "model.glb", "--output", "m.json", "--source-up", "w"],
      ["scene", "asset", "admit", "model.glb", "--output", "m.json", "--meters-per-unit", "0"],
      ["scene", "asset", "admit", "model.glb", "--output", "m.json", "--meters-per-unit", "abc"],
      ["scene", "asset", "admit", "model.glb", "--output", "m.json", "--asset-id", "tree"],
      ["scene", "asset", "admit", "model.glb", "--output", "m.json", "--asset-id", "asset_"],
      ["scene", "asset", "admit", "model.glb", "--output", "m.json", "--unknown"],
      ["scene", "asset", "admit", "a.glb", "b.glb", "--output", "m.json"],
      ["scene", "asset", "admit", "model.glb", "--output", "m.json", "--output", "n.json"],
      ["scene", "asset", "list"],
    ]) expect(() => parseCliArgs(argv)).toThrow();
  });

  test("publishes a content-addressed GLB, derived facts and a ready-to-apply patch", async () => {
    const { root, cleanup } = await workspace("happy");
    try {
      const bytes = admittedTriangleGlb();
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      await writeFile(join(root, "model.glb"), bytes);
      const output: string[] = [], errors: string[] = [];
      expect(await runCli(["scene", "asset", "admit", "model.glb", "--output", "manifest.json", "--json"], dependencies(root, testIo(root, output, errors)))).toBe(0);
      expect(errors).toEqual([]);
      const result = JSON.parse(output.at(-1)!) as {
        output: string; assetId: string; factsAssetId: string; entityId: string;
        bounds: unknown; artifacts: { payload: { path: string; sha256: string; bytes: number; disposition: string } }; document: unknown;
      };
      expect(result.output).toBe("manifest.json");
      expect(result.assetId).toBe(`asset_admitted_${sha256}`);
      expect(result.entityId).toBe(`entity_admitted_${sha256}`);
      expect(result.artifacts.payload).toEqual({ path: `assets/${sha256}.glb`, sha256, bytes: bytes.length, disposition: "created" });
      expect(result.bounds).toEqual({ modelSpace: { min: [0, 0, 0], max: [2, 3, 0] }, sceneSpace: { min: [0, 0, 0], max: [2, 3, 0] } });
      const document = SpatialAssetAdmissionV1Schema.parse(result.document);
      expect(document.manifest.interpretation).toEqual({ kind: "gltf", format: "glb", metersPerUnit: 1, sourceUp: "y" });
      expect(document.manifest.payload).toEqual({ path: `assets/${sha256}.glb`, sha256, bytes: bytes.length });
      expect(document.factsManifest.interpretation).toEqual({ kind: "metadata", format: "json", schema: "slopcamera.spatial-asset-facts" });
      expect(document.factsManifest.dependencies).toEqual([document.manifest.assetId]);
      expect(document.facts.subject).toEqual(document.manifest.payload);
      expect(document.facts.profile).toBe("slopcamera.glb-triangles-trs-pbr-basecolor-v1");
      expect(document.facts.nodeCount).toBe(1);
      expect(document.facts.bounds).toEqual(document.bounds);
      expect(document.entity).toMatchObject({ kind: "mesh", name: "model", geometry: { kind: "asset", assetId: document.manifest.assetId } });
      expect(document.operations.map(operation => operation.kind)).toEqual(["add-asset", "add-asset", "add-entity"]);
      expect(await readFile(join(root, "assets", `${sha256}.glb`))).toEqual(Buffer.from(bytes));
      const factsText = await readFile(join(root, "assets", `${document.factsManifest.payload.sha256}.json`), "utf8");
      expect(JSON.parse(factsText)).toEqual(JSON.parse(JSON.stringify(document.facts)));
      expect(document.artifacts.facts).toMatchObject({ path: `assets/${document.factsManifest.payload.sha256}.json`, disposition: "created" });
      const persisted = SpatialAssetAdmissionV1Schema.parse(JSON.parse(await readFile(join(root, "manifest.json"), "utf8")));
      expect(persisted).toEqual(document);
      // The emitted fragment applies to an existing scene inside one patch.
      const scene = fixtureScene();
      const patched = applySpatialScenePatch(scene, {
        kind: "slopcamera.spatial-scene-patch", schemaVersion: 1,
        expectedSceneSha256: spatialSceneSha256(scene), operations: document.operations,
      });
      expect(patched.scene.assets.map(asset => asset.assetId)).toEqual([document.manifest.assetId, document.factsManifest.assetId]);
      expect(patched.scene.entities.map(entity => entity.entityId)).toContain(document.entity.entityId);
    } finally { await cleanup(); }
  });

  test("honors --asset-id and converts scene-space bounds by --meters-per-unit and --source-up", async () => {
    const { root, cleanup } = await workspace("options");
    try {
      await writeFile(join(root, "model.glb"), admittedTriangleGlb());
      const output: string[] = [], errors: string[] = [];
      expect(await runCli(["scene", "asset", "admit", "model.glb", "--output", "manifest.json", "--asset-id", "asset_tree", "--meters-per-unit", "0.5", "--source-up", "z", "--json"], dependencies(root, testIo(root, output, errors)))).toBe(0);
      const result = JSON.parse(output.at(-1)!) as { document: unknown };
      const document = SpatialAssetAdmissionV1Schema.parse(result.document);
      expect(document.manifest.assetId).toBe("asset_tree");
      expect(document.manifest.interpretation).toEqual({ kind: "gltf", format: "glb", metersPerUnit: 0.5, sourceUp: "z" });
      expect(document.entity.geometry).toMatchObject({ kind: "asset", assetId: "asset_tree" });
      expect(document.bounds.modelSpace).toEqual({ min: [0, 0, 0], max: [2, 3, 0] });
      // Z-up sources rotate -90 degrees around X and scale into Y-up meters.
      expect(document.bounds.sceneSpace.min[0]).toBeCloseTo(0, 10);
      expect(document.bounds.sceneSpace.max[0]).toBeCloseTo(1, 10);
      expect(document.bounds.sceneSpace.min[2]).toBeCloseTo(-1.5, 10);
      expect(document.bounds.sceneSpace.max[2]).toBeCloseTo(0, 10);
    } finally { await cleanup(); }
  });

  test("retries settle identical content-addressed bytes as exists and never overwrite", async () => {
    const { root, cleanup } = await workspace("retry");
    try {
      const bytes = admittedTriangleGlb();
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      await writeFile(join(root, "model.glb"), bytes);
      const output: string[] = [], errors: string[] = [];
      const io = testIo(root, output, errors);
      expect(await runCli(["scene", "asset", "admit", "model.glb", "--output", "first.json", "--json"], dependencies(root, io))).toBe(0);
      const first = JSON.parse(output.at(-1)!) as { document: { manifest: { assetId: string } } };
      expect(await runCli(["scene", "asset", "admit", "model.glb", "--output", "second.json", "--json"], dependencies(root, io))).toBe(0);
      const second = JSON.parse(output.at(-1)!) as {
        artifacts: { payload: { disposition: string }; facts: { disposition: string } };
        document: { manifest: { assetId: string } };
      };
      expect(second.artifacts.payload.disposition).toBe("exists");
      expect(second.artifacts.facts.disposition).toBe("exists");
      expect(second.document.manifest.assetId).toBe(first.document.manifest.assetId);
      expect(await readFile(join(root, "assets", `${sha256}.glb`))).toEqual(Buffer.from(bytes));
      // Different valid bytes publish under their own content address.
      await writeFile(join(root, "other.glb"), admittedTriangleGlb("SLOPCAMERA second fixture"));
      output.length = 0; errors.length = 0;
      expect(await runCli(["scene", "asset", "admit", "other.glb", "--output", "third.json", "--json"], dependencies(root, io))).toBe(0);
      const third = JSON.parse(output.at(-1)!) as { artifacts: { payload: { path: string; disposition: string } } };
      expect(third.artifacts.payload.disposition).toBe("created");
      expect(third.artifacts.payload.path).not.toBe(`assets/${sha256}.glb`);
    } finally { await cleanup(); }
  });

  test("conflicts on different bytes at the content address and retains publication evidence", async () => {
    const { root, cleanup } = await workspace("conflict");
    try {
      const bytes = admittedTriangleGlb();
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      await writeFile(join(root, "model.glb"), bytes);
      await mkdir(join(root, "assets"), { recursive: true });
      await writeFile(join(root, "assets", `${sha256}.glb`), "different bytes under the same name");
      const output: string[] = [], errors: string[] = [];
      const exit = await runCli(["scene", "asset", "admit", "model.glb", "--output", "manifest.json", "--json"], dependencies(root, testIo(root, output, errors)));
      expect(exit).toBe(4);
      expect(errorCode(errors)).toBe("conflict");
      expect(errors.join("")).toContain("publication evidence");
      const detail = JSON.parse(errors.at(-1)!) as { error: { details?: { attempted?: readonly { path: string }[] } } };
      expect(detail.error.details?.attempted?.[0]?.path).toBe(`assets/${sha256}.glb`);
      expect(await readFile(join(root, "assets", `${sha256}.glb`), "utf8")).toBe("different bytes under the same name");
    } finally { await cleanup(); }
  });

  test("rejects non-GLB and out-of-profile GLB sources as invalid data", async () => {
    const { root, cleanup } = await workspace("invalid");
    try {
      await writeFile(join(root, "notes.txt"), "not a binary model");
      const output: string[] = [], errors: string[] = [];
      const io = testIo(root, output, errors);
      expect(await runCli(["scene", "asset", "admit", "notes.txt", "--output", "one.json", "--json"], dependencies(root, io))).toBe(7);
      expect(errorCode(errors)).toBe("invalid-data");
      // glTF magic alone is not enough; the closed profile still applies.
      const malformed = admittedTriangleGlb();
      new DataView(malformed.buffer).setUint32(12, 0xffffffff, true);
      await writeFile(join(root, "broken.glb"), malformed);
      errors.length = 0;
      expect(await runCli(["scene", "asset", "admit", "broken.glb", "--output", "two.json", "--json"], dependencies(root, io))).toBe(7);
      expect(errorCode(errors)).toBe("invalid-data");
      // A .glb name cannot launder non-GLB bytes.
      await writeFile(join(root, "fake.glb"), "still not a glb");
      errors.length = 0;
      expect(await runCli(["scene", "asset", "admit", "fake.glb", "--output", "three.json", "--json"], dependencies(root, io))).toBe(7);
    } finally { await cleanup(); }
  });

  test("rejects symlink leaves, escapes beyond --source-root and existing outputs", async () => {
    const { root, cleanup } = await workspace("unsafe");
    try {
      const bytes = admittedTriangleGlb();
      await writeFile(join(root, "real.glb"), bytes);
      await mkdir(join(root, "incoming"));
      await writeFile(join(root, "incoming", "model.glb"), bytes);
      await symlink(join(root, "real.glb"), join(root, "linked.glb"));
      const output: string[] = [], errors: string[] = [];
      const io = testIo(root, output, errors);
      expect(await runCli(["scene", "asset", "admit", "linked.glb", "--output", "one.json", "--json"], dependencies(root, io))).toBe(6);
      expect(errorCode(errors)).toBe("unsafe-path");
      errors.length = 0;
      expect(await runCli(["scene", "asset", "admit", "../real.glb", "--source-root", "incoming", "--output", "two.json", "--json"], dependencies(root, io))).toBe(6);
      expect(errorCode(errors)).toBe("unsafe-path");
      errors.length = 0;
      expect(await runCli(["scene", "asset", "admit", "model.glb", "--source-root", "incoming", "--output", "three.json", "--json"], dependencies(root, io))).toBe(0);
      // An existing output path conflicts before any artifact is attempted.
      errors.length = 0;
      expect(await runCli(["scene", "asset", "admit", "model.glb", "--source-root", "incoming", "--output", "three.json", "--json"], dependencies(root, io))).toBe(4);
      expect(errorCode(errors)).toBe("conflict");
      errors.length = 0;
      expect(await runCli(["scene", "asset", "admit", "missing.glb", "--output", "four.json", "--json"], dependencies(root, io))).toBe(3);
      expect(errorCode(errors)).toBe("not-found");
    } finally { await cleanup(); }
  });

  test("reports cancellation without publication evidence loss", async () => {
    const { root, cleanup } = await workspace("cancel");
    try {
      await writeFile(join(root, "model.glb"), admittedTriangleGlb());
      const output: string[] = [], errors: string[] = [];
      const controller = new AbortController();
      controller.abort();
      const exit = await runCli(["scene", "asset", "admit", "model.glb", "--output", "manifest.json", "--json"], {
        ...dependencies(root, testIo(root, output, errors)), abortSignal: controller.signal,
      });
      expect(exit).toBe(11);
      expect(errorCode(errors)).toBe("cancelled");
    } finally { await cleanup(); }
  });
});
