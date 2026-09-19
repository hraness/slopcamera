import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { createSpatialSceneStarter } from "../../../src/spatial-scene/authoring";
import { compileSpatialDesign } from "../../../src/spatial-scene/design";
import { parseSpatialScene } from "../../../src/spatial-scene/identity";
import type { ApplicationContext } from "../application/context";
import { operationApplicationContext } from "../application/operations/test-support";
import { parseCliArgs, type SpatialDesignCommand } from "./args";
import { createCliTestRunner } from "./run-cli-test-helper";
import { executeSpatialDesignCommand } from "./spatial-design-service";

const runCli = createCliTestRunner(import.meta.url);
const design = () => ({
  kind: "slopcamera.spatial-design", schemaVersion: 1, designId: "publication-fixture",
  parameters: [{ name: "width", value: 2, min: 1, max: 4, unit: "m" }],
  stages: [{ kind: "parametric", stageId: "shelf", spec: {
    kind: "floor", width: { $param: "width" }, depth: 0.4, thickness: 0.03,
    material: { kind: "standard", color: "#b98857", opacity: 1, roughness: 0.5, metalness: 0 },
  } }],
});

function command(args: string[]): SpatialDesignCommand {
  const parsed = parseCliArgs(["scene", "design", ...args, "--json"]);
  if (parsed.kind !== "spatial-design") throw new Error("Expected a spatial design command.");
  return parsed;
}

async function fixture(run: (root: string, application: ApplicationContext) => Promise<void>) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "slopcamera-design-publication-")));
  try {
    await writeFile(join(root, "design.json"), JSON.stringify(design()));
    await run(root, operationApplicationContext(root));
  } finally { await rm(root, { recursive: true, force: true }); }
}

function withCustody(application: ApplicationContext, assertOwned: () => Promise<void>): ApplicationContext {
  return { ...application, hostResourceLease: {
    claims: [], inheritedFileDescriptor: -1, inheritedFileDescriptors: [],
    profile: { id: "design-publication-test", capacities: [] }, ticket: "1", assertOwned,
  } };
}

async function stagedCopy(root: string): Promise<string | undefined> {
  try {
    const entries = await readdir(root, { recursive: true });
    const stage = entries.find(path => basename(path).startsWith(".slopcamera-copy-"));
    return stage === undefined ? undefined : join(root, stage);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

test("design publication rejects bytes changed during the final custody callback", async () => fixture(async (root, application) => {
  const bundle = join(root, "bundle");
  let substituted = false;
  const guarded = withCustody(application, async () => {
    if (substituted) return;
    const stage = await stagedCopy(bundle);
    if (stage === undefined) return;
    const bytes = await readFile(stage);
    bytes[0] = (bytes[0] ?? 0) ^ 1;
    await writeFile(stage, bytes);
    substituted = true;
  });
  await expect(executeSpatialDesignCommand(guarded, command(["compile", "design.json", "--output-dir", "bundle"]))).rejects.toThrow("changed during custody");
  expect(substituted).toBe(true);
  const entries = await readdir(bundle, { recursive: true });
  expect(entries).not.toContain("receipt.json");
  expect(entries.some(path => path.endsWith(".glb") || path.endsWith("-facts.json"))).toBe(false);
}));

test("a competing asset publication conflicts without overwriting it or issuing a receipt", async () => fixture(async (root, application) => {
  const compiled = compileSpatialDesign(design()), first = compiled.scene.assets[0]!;
  const matching = compiled.outputs.flatMap(output => output.artifacts).find(artifact => artifact.assetId === first.assetId)!.bytes;
  for (const [index, contents] of [matching, new TextEncoder().encode("competing publication")].entries()) {
    const directory = `bundle-${index}`, bundle = join(root, directory), destination = join(bundle, first.payload.path);
    let competed = false;
    const guarded = withCustody(application, async () => {
      if (competed || await stagedCopy(bundle) === undefined) return;
      await writeFile(destination, contents, { flag: "wx" });
      competed = true;
    });
    await expect(executeSpatialDesignCommand(guarded, command(["compile", "design.json", "--output-dir", directory]))).rejects.toMatchObject({ code: "conflict" });
    expect(competed).toBe(true);
    expect([...await readFile(destination)]).toEqual([...contents]);
    expect(await readdir(bundle)).not.toContain("receipt.json");
  }
}));

test("duplicate payload paths must agree on byte count as well as digest before publication", async () => fixture(async (root, application) => {
  const bytes = "abc", sha256 = createHash("sha256").update(bytes).digest("hex");
  const asset = { payload: { path: "shared.bin", sha256, bytes: 3 }, dependencies: [],
    interpretation: { kind: "image", width: 1, height: 1, mimeType: "image/png", colorSpace: "srgb", alpha: "opaque" },
    provenance: { source: "imported", description: "Fixture asset" } };
  const base = parseSpatialScene({ ...createSpatialSceneStarter(), assets: [
    { ...asset, assetId: "asset_a" }, { ...asset, assetId: "asset_b", payload: { ...asset.payload, bytes: 4 } },
  ] });
  await writeFile(join(root, "shared.bin"), bytes);
  await writeFile(join(root, "base.json"), JSON.stringify(base));
  await expect(executeSpatialDesignCommand(application, command(["compile", "design.json", "--scene", "base.json", "--output-dir", "bundle"]))).rejects.toMatchObject({ code: "conflict" });
  expect(await readdir(root)).not.toContain("bundle");
}));

test("the generated render request prefers the hero camera over a sorted detail camera", async () => fixture(async (root, application) => {
  const base = createSpatialSceneStarter(), hero = base.cameras[0]!;
  const scene = parseSpatialScene({ ...base, cameras: [hero, { ...hero, cameraId: "camera_detail", name: "Detail" }] });
  expect(scene.cameras[0]!.cameraId).toBe("camera_detail");
  await writeFile(join(root, "base.json"), JSON.stringify(scene));
  await executeSpatialDesignCommand(application, command(["compile", "design.json", "--scene", "base.json", "--output-dir", "bundle"]));
  expect(JSON.parse(await readFile(join(root, "bundle/render.json"), "utf8")) as unknown).toMatchObject({ cameraId: "camera_hero" });
}));

test("invalid design and parameter input retain the CLI invalid-data error contract", async () => fixture(async (root, application) => {
  await writeFile(join(root, "invalid.json"), "{ broken json");
  await writeFile(join(root, "values.json"), JSON.stringify({ width: 100 }));
  const cases = [
    ["inspect", "invalid.json"],
    ["set", "design.json", "--parameters", "values.json", "--output", "bad.json"],
  ];
  for (const args of cases) {
    let stderr = "", stdout = "";
    const exitCode = await runCli(["scene", "design", ...args, "--json"], {
      paths: application.paths, stateRoot: join(root, "cli-state"),
      io: { cwd: () => root, env: {}, now: () => new Date("2026-09-19T12:00:00.000Z"), platform: process.platform,
        stderr: value => { stderr += value; }, stdout: value => { stdout += value; } },
      runner: { run: () => Promise.reject(new Error("Invalid input must not spawn a process.")) },
    });
    expect(exitCode).toBe(7);
    expect(JSON.parse(stderr) as unknown).toMatchObject({ error: { code: "invalid-data" } });
    expect(stdout).toBe("");
  }
  expect(await readdir(root)).not.toContain("bad.json");
}));
