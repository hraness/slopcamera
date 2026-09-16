import { expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

import { fixtureCamera, fixtureScene } from "../../../../src/spatial-scene/test-fixture";
import { SpatialRenderedAuditReportSchema } from "../../../../src/spatial-scene/audit-rendered";
import { spatialSceneSha256 } from "../../../../src/spatial-scene/identity";
import type { ApplicationContext } from "../context";
import { bindHtmlOverlayBrowserRuntime } from "../html-overlay-browser-runtime";
import { createHtmlOverlayExecutionBundle } from "../html-overlay-integrity";
import type { OperationExecutionContext } from "../operation";
import { createApplicationOperationRegistry } from "../default-registry";
import {
  bindSpatialRenderedAuditInput, executeSpatialRenderedAudit,
  type SpatialRenderedAuditOperationDependencies,
} from "./spatial-rendered-audit";

const bindRuntime: typeof bindHtmlOverlayBrowserRuntime = async (capability, signal) =>
  await bindHtmlOverlayBrowserRuntime(capability, signal, { allowUnverifiedRuntimeForTesting: true });
const dependencies: SpatialRenderedAuditOperationDependencies = { bindBrowserRuntime: bindRuntime };

function scene(): ReturnType<typeof fixtureScene> {
  const camera = fixtureCamera();
  return { ...fixtureScene(), cameras: [{ ...camera, projection: { ...camera.projection, width: 8, height: 4 } }] };
}

async function objectIdPng(width: number, height: number): Promise<Buffer> {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      if (x < width / 2) { data[offset + 2] = 1; data[offset + 3] = 255; }
    }
  }
  return await sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "slopcamera-rendered-audit-operation-")));
  const privateRoot = join(root, "artifacts", "slopcamera", "private");
  await mkdir(privateRoot, { recursive: true, mode: 0o700 });
  const binary = join(root, "browser");
  await writeFile(binary, "browser-fixture", { mode: 0o700 });
  const sourcePath = join(root, "original.scene.json");
  await writeFile(sourcePath, JSON.stringify(scene(), null, 2));
  let renders = 0;
  const application: ApplicationContext = {
    paths: { repositoryRoot: root, privateRoot, artifactRoot: join(root, "artifacts", "slopcamera", "recordings"), desktopRoot: root, projectRoot: join(root, "artifacts", "slopcamera", "projects") },
    clock: { now: () => new Date(), timestampMilliseconds: () => Date.now() },
    capability: async name => name === "html-browser" ? { name, available: true, command: binary, version: "test" } : { name, available: false },
    capabilities: async () => [],
    runner: { run: async () => { throw new Error("Rendered audit must not run FFmpeg."); } },
    htmlOverlayRenderer: { renderFrames: async rendered => {
      renders++;
      const frames = join(rendered.outputDirectory, "frames");
      await mkdir(frames, { mode: 0o700 });
      const count = rendered.authoring.timing.durationUs / 1_000_000;
      const bytes = await objectIdPng(rendered.authoring.canvas.width, rendered.authoring.canvas.height);
      for (let index = 0; index < count; index++) await writeFile(join(frames, `frame-${String(index).padStart(8, "0")}.png`), bytes, { mode: 0o600 });
      const bundle = createHtmlOverlayExecutionBundle(rendered.authoring, rendered.browserRuntime, rendered.executionProfile);
      return { frameCount: count, framePattern: join(frames, "frame-%08d.png"), executionIntegrity: bundle.integrity, libraryLocks: bundle.libraryLocks };
    } },
  };
  const context: OperationExecutionContext = { application, abortSignal: new AbortController().signal };
  return { root, sourcePath, application, context, renders: () => renders };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function withFixture(run: (f: Fixture) => Promise<void>) {
  const f = await fixture();
  try { await run(f); } finally { await rm(f.root, { recursive: true, force: true }); }
}

test("bind pins source, capabilities, and browser runtime; staged assets stay contained", async () => withFixture(async f => {
  const bound = await bindSpatialRenderedAuditInput(f.application, { source: { path: "original.scene.json" }, request: { cameraId: "camera_main" } }, f.context.abortSignal, bindRuntime);
  expect(bound.capabilityBindings.map(item => item.name)).toEqual(["html-browser"]);
  expect(bound.browserRuntime).toBeDefined();
  expect(bound.assets).toEqual([]);
  expect(bound.source.path).toBe("original.scene.json");
  await expect(bindSpatialRenderedAuditInput(f.application, { source: { path: "missing.scene.json" }, request: { cameraId: "camera_main" } }, f.context.abortSignal, bindRuntime)).rejects.toThrow();
  await expect(bindSpatialRenderedAuditInput(f.application, { source: { path: "original.scene.json" }, request: { cameraId: "camera_other" } }, f.context.abortSignal, bindRuntime)).rejects.toThrow("Unknown camera");
}));

test("execute returns a schema-valid rendered audit without publishing media artifacts", async () => withFixture(async f => {
  const output = await executeSpatialRenderedAudit(f.context, {
    source: { path: "original.scene.json" }, request: { cameraId: "camera_main", timesUs: [0, 500_000, 1_000_000] },
  }, dependencies);
  const report = SpatialRenderedAuditReportSchema.parse(output);
  expect(report.timesUs).toEqual([0, 500_000, 1_000_000]);
  expect(report.summary.renderedPixels).toBe(3 * 16);
  const entity = report.entities.find(item => item.entityId === "entity_box")!;
  expect(entity.totals.rendered).toBe(3);
  expect(entity.samples.every(sample => sample.lowered && sample.rendered)).toBe(true);
  expect(report.sceneSha256).toBe(spatialSceneSha256(scene()));
  expect(report.findings).toEqual([]);
  expect(f.renders()).toBe(1);
}));

test("registry discovery exposes scene.render-audit@1 and rejects unbound workflow input", async () => withFixture(async f => {
  const registry = createApplicationOperationRegistry();
  const description = registry.describe("scene.render-audit", 1);
  expect(description.inputSchemaId).toBe("slopcamera.operation.scene.render-audit.input/v1");
  expect(description.outputSchemaId).toBe("slopcamera.operation.scene.render-audit.output/v1");
  expect(description.policy.resources.map(item => item.resource)).toEqual(["cpu", "local-io", "browser", "ffmpeg"]);
  const workflow: OperationExecutionContext = { ...f.context, workflow: {
    nodeKey: "audit", nodePlanSha256: "a".repeat(64), runId: "run_test",
    workspaceDirectory: f.context.application.paths.privateRoot, beforePublication: async () => {},
  } };
  await expect(executeSpatialRenderedAudit(workflow, {
    source: { path: "original.scene.json" }, request: { cameraId: "camera_main" },
  }, dependencies)).rejects.toThrow();
}));

test("a planned scene digest pins the exact source and rejects drift", async () => withFixture(async f => {
  await expect(bindSpatialRenderedAuditInput(f.application, {
    source: { path: "original.scene.json" }, request: { cameraId: "camera_main" }, sceneSha256: "0".repeat(64),
  }, f.context.abortSignal, bindRuntime)).rejects.toThrow("changed after planning");
  await writeFile(f.sourcePath, JSON.stringify({ ...scene(), sceneId: "scene_tampered" }));
  await expect(bindSpatialRenderedAuditInput(f.application, {
    source: { path: "original.scene.json" }, request: { cameraId: "camera_main" }, sceneSha256: spatialSceneSha256(scene()),
  }, f.context.abortSignal, bindRuntime)).rejects.toThrow("changed after planning");
}));
