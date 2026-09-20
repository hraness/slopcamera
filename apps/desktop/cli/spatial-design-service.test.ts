import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSpatialSceneStarter } from "../../../src/spatial-scene/authoring";
import { parseSpatialScene, spatialSceneSha256 } from "../../../src/spatial-scene/identity";
import { parseSpatialGlb } from "../../../src/spatial-scene/gltf";
import { operationApplicationContext } from "../application/operations/test-support";
import { parseCliArgs, type SpatialDesignCommand } from "./args";
import { executeSpatialDesignCommand } from "./spatial-design-service";

const source = () => ({
  kind: "slopcamera.spatial-design", schemaVersion: 1, designId: "bookcase",
  parameters: [{ name: "width", value: 3, min: 1, max: 6, step: 0.5, unit: "m" }],
  stages: [{ kind: "parametric", stageId: "shelf", name: "Shelf", spec: {
    kind: "floor", width: { $param: "width" }, depth: 0.4, thickness: 0.03,
    material: { kind: "standard", color: "#b98857", opacity: 1, roughness: 0.5, metalness: 0 },
  } }],
});
async function fixture(run: (root: string, execute: (args: string[]) => Promise<unknown>) => Promise<void>) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "slopcamera-design-")));
  const application = operationApplicationContext(root);
  try {
    await writeFile(join(root, "design.json"), JSON.stringify(source()));
    await writeFile(join(root, "base.json"), JSON.stringify(createSpatialSceneStarter()));
    await run(root, async args => {
      const command = parseCliArgs(["scene", "design", ...args, "--json"]);
      if (command.kind !== "spatial-design") throw new Error("Wrong command parser.");
      return executeSpatialDesignCommand(application, command);
    });
  } finally { await rm(root, { recursive: true, force: true }); }
}

const readJson = async (path: string) => JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;

describe("parametric design CLI", () => {
  test("routes bounded grammar and rejects unused flags", () => {
    expect(parseCliArgs(["scene", "design", "catalog", "--json"])).toEqual({ kind: "spatial-design", action: "catalog", json: true });
    expect(parseCliArgs(["scene", "design", "init", "draft", "--template", "spiral-stair"])).toMatchObject({ action: "init", directory: "draft", template: "spiral-stair" });
    expect(parseCliArgs(["scene", "design", "compile", "design.json", "--scene", "base.json", "--output-dir", "v1"])).toMatchObject({ action: "compile", scene: "base.json", outputDir: "v1" });
    expect(() => parseCliArgs(["scene", "design", "compile", "design.json"])).toThrow("--output-dir");
    expect(() => parseCliArgs(["scene", "design", "gallery", "design.json", "--output-dir", "v1"])).toThrow("--variants");
    expect(() => parseCliArgs(["scene", "design", "inspect", "design.json", "--output", "bad"])).toThrow();
    expect(() => parseCliArgs(["scene", "design", "catalog", "extra"])).toThrow();
  });

  test("compiles a standalone retained bundle with valid GLB and exact source", async () => fixture(async (root, execute) => {
    await execute(["compile", "design.json", "--scene", "base.json", "--output-dir", "v1"]);
    const scene = parseSpatialScene(await readJson(join(root, "v1/scene.json")));
    expect(scene.entities.some(entity => entity.entityId === "entity_product")).toBe(true);
    const manifest = scene.assets.find(asset => asset.interpretation.kind === "gltf")!;
    const bytes = new Uint8Array(await readFile(join(root, "v1", manifest.payload.path)));
    expect(bytes.byteLength).toBe(manifest.payload.bytes);
    expect(parseSpatialGlb(bytes)).toBeDefined();
    const receipt = await readJson(join(root, "v1/receipt.json"));
    expect(receipt.sceneSha256).toBe(spatialSceneSha256(scene));
    expect(await readJson(join(root, "v1/design.json"))).toMatchObject({ designId: "bookcase" });
    expect(await readJson(join(root, "v1/render.json"))).toMatchObject({ cameraId: "camera_hero", mode: { kind: "beauty" } });
    const original = await readFile(join(root, "v1/receipt.json"), "utf8");
    await expect(execute(["compile", "design.json", "--output-dir", "v1"])).rejects.toThrow("already exists");
    expect(await readFile(join(root, "v1/receipt.json"), "utf8")).toBe(original);
  }));

  test("parameter edits create revisions and invalid batches publish nothing", async () => fixture(async (root, execute) => {
    await writeFile(join(root, "values.json"), JSON.stringify({ width: 4 }));
    await execute(["set", "design.json", "--parameters", "values.json", "--output", "edited.json"]);
    expect(await readJson(join(root, "design.json"))).toEqual(source());
    expect(await readJson(join(root, "edited.json"))).toMatchObject({ parameters: [{ value: 4 }] });
    await writeFile(join(root, "values.json"), JSON.stringify({ width: 7 }));
    await expect(execute(["set", "design.json", "--parameters", "values.json", "--output", "bad.json"])).rejects.toThrow();
    expect(await readdir(root)).not.toContain("bad.json");
    await writeFile(join(root, "values.json"), JSON.stringify({ unknown: 1 }));
    await expect(execute(["set", "design.json", "--parameters", "values.json", "--output", "bad.json"])).rejects.toThrow();
  }));

  test("copies preserved base assets and regenerates current design assets", async () => fixture(async (root, execute) => {
    await execute(["compile", "design.json", "--scene", "base.json", "--output-dir", "v1"]);
    // A second design has a different generator namespace; its source assets must survive relocation.
    await writeFile(join(root, "other.json"), JSON.stringify({ ...source(), designId: "other" }));
    await execute(["compile", "other.json", "--scene", "v1/scene.json", "--output-dir", "v2"]);
    const before = parseSpatialScene(await readJson(join(root, "v1/scene.json")));
    const after = parseSpatialScene(await readJson(join(root, "v2/scene.json")));
    for (const asset of before.assets) {
      expect(after.assets.some(item => item.assetId === asset.assetId)).toBe(true);
      expect(await readFile(join(root, "v2", asset.payload.path))).toEqual(await readFile(join(root, "v1", asset.payload.path)));
    }
    await rm(join(root, "v1"), { recursive: true });
    for (const asset of after.assets) expect((await readFile(join(root, "v2", asset.payload.path))).byteLength).toBe(asset.payload.bytes);
  }));

  test("rejects tampered imported bytes before creating the destination", async () => fixture(async (root, execute) => {
    await execute(["compile", "design.json", "--output-dir", "v1"]);
    const scene = parseSpatialScene(await readJson(join(root, "v1/scene.json")));
    const asset = scene.assets[0]!;
    const payload = join(root, "v1", asset.payload.path);
    const bytes = await readFile(payload); bytes[0] = (bytes[0] ?? 0) ^ 1; await writeFile(payload, bytes);
    await writeFile(join(root, "other.json"), JSON.stringify({ ...source(), designId: "other" }));
    await expect(execute(["compile", "other.json", "--scene", "v1/scene.json", "--output-dir", "bad"])).rejects.toThrow("identity differs");
    expect(await readdir(root)).not.toContain("bad");
  }));

  test("rejects symlink sources, symlink outputs, workspace escape and pre-cancellation", async () => fixture(async (root, execute) => {
    await symlink(join(root, "design.json"), join(root, "linked.json"));
    await expect(execute(["inspect", "linked.json"])).rejects.toThrow();
    await symlink(root, join(root, "redirect"));
    await expect(execute(["compile", "design.json", "--output-dir", "redirect/out"])).rejects.toThrow();
    await expect(execute(["compile", "design.json", "--output-dir", "../escape"])).rejects.toThrow();
    const controller = new AbortController(); controller.abort(new Error("cancelled"));
    const command: SpatialDesignCommand = { kind: "spatial-design", action: "compile", path: "design.json", outputDir: "cancelled", json: true };
    await expect(executeSpatialDesignCommand(operationApplicationContext(root), command, controller.signal)).rejects.toThrow("cancelled");
    expect(await readdir(root)).not.toContain("cancelled");
  }));

  test("builds explicit variants without claiming they were rendered", async () => fixture(async (root, execute) => {
    await writeFile(join(root, "variants.json"), JSON.stringify({ kind: "slopcamera.spatial-design-variants", schemaVersion: 1, variants: [
      { id: "compact", label: "Compact", parameters: { width: 2 } }, { id: "wide", label: "Wide", parameters: { width: 5 } },
    ] }));
    await execute(["gallery", "design.json", "--variants", "variants.json", "--scene", "base.json", "--output-dir", "gallery"]);
    expect(await readJson(join(root, "gallery/gallery.json"))).toMatchObject({ rendered: false });
    const small = parseSpatialScene(await readJson(join(root, "gallery/compact/scene.json")));
    const wide = parseSpatialScene(await readJson(join(root, "gallery/wide/scene.json")));
    expect(spatialSceneSha256(small)).not.toBe(spatialSceneSha256(wide));
    expect(small.entities.map(item => item.entityId)).toEqual(wide.entities.map(item => item.entityId));
    const invalid = { kind: "slopcamera.spatial-design-variants", schemaVersion: 1, variants: [
      { id: "compact", label: "Compact", parameters: { width: 2 } }, { id: "invalid", label: "Invalid", parameters: { width: 50 } },
    ] };
    await writeFile(join(root, "invalid.json"), JSON.stringify(invalid));
    await expect(execute(["gallery", "design.json", "--variants", "invalid.json", "--output-dir", "bad"])).rejects.toThrow();
    expect(await readdir(root)).not.toContain("bad");
  }));
});
