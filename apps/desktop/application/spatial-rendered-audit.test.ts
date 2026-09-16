import { createHash } from "node:crypto";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";
import sharp from "sharp";

import type { SpatialEntity, SpatialSceneV1 } from "../../../src/spatial-scene/contracts";
import { fixtureAsset, fixtureCamera, fixtureEntity, fixtureScene, fixtureTransform } from "../../../src/spatial-scene/test-fixture";
import type { ApplicationContext } from "./context";
import { bindHtmlOverlayBrowserRuntime } from "./html-overlay-browser-runtime";
import { createHtmlOverlayExecutionBundle } from "./html-overlay-integrity";
import type { HtmlOverlayFrameRenderRequest, HtmlOverlayRenderer } from "./html-overlay-renderer";
import type { OperationExecutionContext } from "./operation";
import {
  auditSpatialSceneRenderedHost, planSpatialRenderedAudit, spatialRenderedAuditCapabilityNames,
  type SpatialRenderedAuditDependencies,
} from "./spatial-rendered-audit";

const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });

function scene(): SpatialSceneV1 {
  const camera = fixtureCamera();
  // Center the principal point so the fixture box covers the frame geometrically.
  const projection = camera.projection.kind === "perspective"
    ? { ...camera.projection, width: 8, height: 4, cx: 4, cy: 2 }
    : camera.projection;
  return { ...fixtureScene(), cameras: [{ ...camera, projection }] };
}
const request = { cameraId: "camera_main" } as const;
const dependencies: SpatialRenderedAuditDependencies = {
  bindBrowserRuntime: async (capability, signal) => await bindHtmlOverlayBrowserRuntime(capability, signal, { allowUnverifiedRuntimeForTesting: true }),
};

/** One pixel colour decision per (x, y, frame): RGBA8 object-ID data. */
type Paint = (x: number, y: number, frame: number) => readonly [number, number, number, number];
const noHit = [0, 0, 0, 0] as const;
const selection = (code: number) => [Math.floor(code / 65_536), Math.floor(code / 256) % 256, code % 256, 255] as const;
/** entity_box is the canonical first selection code; paint the left half of the frame. */
const halfBox: Paint = x => (x < 4 ? selection(1) : noHit);

async function objectIdPng(width: number, height: number, frame: number, paint: Paint): Promise<Buffer> {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [red, green, blue, alpha] = paint(x, y, frame);
      const offset = (y * width + x) * 4;
      data[offset] = red; data[offset + 1] = green; data[offset + 2] = blue; data[offset + 3] = alpha;
    }
  }
  return await sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

interface Host {
  readonly root: string;
  readonly context: OperationExecutionContext;
  readonly requests: HtmlOverlayFrameRenderRequest[];
}
async function fixture(options: {
  readonly paint?: Paint;
  readonly renderer?: (base: HtmlOverlayRenderer) => HtmlOverlayRenderer;
  readonly omitRenderer?: boolean;
} = {}): Promise<Host> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "slopcamera-rendered-audit-")));
  directories.push(root);
  const privateRoot = join(root, "artifacts", "slopcamera", "private");
  await mkdir(privateRoot, { recursive: true, mode: 0o700 });
  const binary = join(root, "bin", "html-browser");
  await mkdir(join(root, "bin"));
  await writeFile(binary, "fixture-html-browser\n", { mode: 0o700 });
  const requests: HtmlOverlayFrameRenderRequest[] = [];
  const paint = options.paint ?? halfBox;
  const base: HtmlOverlayRenderer = {
    async renderFrames(rendered) {
      requests.push(rendered);
      const frames = join(rendered.outputDirectory, "frames");
      await mkdir(frames, { mode: 0o700 });
      const count = rendered.authoring.timing.durationUs / 1_000_000;
      for (let index = 0; index < count; index++) {
        await writeFile(join(frames, `frame-${String(index).padStart(8, "0")}.png`),
          await objectIdPng(rendered.authoring.canvas.width, rendered.authoring.canvas.height, index, paint), { mode: 0o600 });
      }
      const bundle = createHtmlOverlayExecutionBundle(rendered.authoring, rendered.browserRuntime, rendered.executionProfile);
      return { executionIntegrity: bundle.integrity, libraryLocks: bundle.libraryLocks, frameCount: count, framePattern: join(frames, "frame-%08d.png") };
    },
  };
  const application: ApplicationContext = {
    paths: { repositoryRoot: root, privateRoot, artifactRoot: join(root, "artifacts", "slopcamera", "recordings"), desktopRoot: root, projectRoot: join(root, "artifacts", "slopcamera", "projects") },
    clock: { now: () => new Date("2026-09-08T00:00:00Z"), timestampMilliseconds: () => 0 },
    capability: async name => name === "html-browser" ? { name, available: true, command: binary, version: "test fixture 1" } : { name, available: false },
    capabilities: () => Promise.resolve([]),
    ...(options.omitRenderer === true ? {} : { htmlOverlayRenderer: options.renderer?.(base) ?? base }),
    runner: { run: async () => { throw new Error("Rendered audit must not run FFmpeg for this scene."); } },
  };
  return { root, requests, context: { application, abortSignal: new AbortController().signal } };
}
const audit = (host: Host, input: Partial<Parameters<typeof auditSpatialSceneRenderedHost>[1]> = {}) =>
  auditSpatialSceneRenderedHost(host.context, { scene: scene(), assetRoot: host.root, request, ...input }, dependencies);

describe("planSpatialRenderedAudit", () => {
  test("rejects unknown cameras, out-of-range samples, and oversized requests before any host work", () => {
    expect(planSpatialRenderedAudit(scene(), request).timesUs).toEqual([0, 125_000, 250_000, 375_000, 500_000, 625_000, 750_000, 875_000, 1_000_000]);
    expect(() => planSpatialRenderedAudit(scene(), { cameraId: "camera_missing" })).toThrow("Unknown camera");
    expect(() => planSpatialRenderedAudit(scene(), { ...request, timesUs: [1_000_001] })).toThrow("outside the scene clock");
    expect(() => planSpatialRenderedAudit(scene(), { ...request, timesUs: [-1] })).toThrow();
    expect(() => planSpatialRenderedAudit(scene(), { ...request, timesUs: Array.from({ length: 65 }, (_, index) => index) })).toThrow();
    const camera = scene().cameras[0]!;
    const giant = { ...scene(), cameras: [{ ...camera, projection: { ...camera.projection, width: 16_384, height: 4 } }] };
    expect(() => planSpatialRenderedAudit(giant, request)).toThrow("raster budget");
    const crowded = { ...scene(), entities: Array.from({ length: 4_096 }, (_, index) => fixtureEntity(`entity_${index}`)) };
    expect(() => planSpatialRenderedAudit(crowded, { ...request, timesUs: Array.from({ length: 64 }, (_, index) => index * 10) })).toThrow("entity-sample budget");
  });
});

describe("auditSpatialSceneRenderedHost", () => {
  test("counts object-ID pixels per sampled time through the browser boundary", async () => {
    const host = await fixture();
    const report = await audit(host);
    expect(report.kind).toBe("slopcamera.spatial-rendered-audit");
    expect(report.cameraId).toBe("camera_main");
    expect(report.mode).toEqual({ kind: "object-id", coverage: { kind: "alpha-threshold", threshold: 0.5 } });
    expect(report.frame).toEqual({ width: 8, height: 4, pixels: 32 });
    expect(report.timesUs).toHaveLength(9);
    expect(host.requests).toHaveLength(1);
    expect(host.requests[0]!.authoring.html).toContain('"object-id"');
    expect(host.requests[0]!.authoring.libraries).toEqual(["three"]);
    const entity = report.entities.find(item => item.entityId === "entity_box")!;
    expect(entity.eligibility).toBe("renderable");
    expect(entity.totals).toEqual({ expected: 9, lowered: 9, rendered: 9, pixels: 144, maxPixels: 16, maxFramePercent: 50 });
    expect(entity.samples.every(sample => sample.rendered && sample.pixels === 16 && sample.coverageRatio !== undefined)).toBe(true);
    expect(report.summary.renderedPixels).toBe(144);
    expect(report.summary.unattributedPixels).toBe(0);
    expect(report.summary.entitiesNeverRendered).toEqual([]);
    expect(report.findings).toEqual([]);
    expect(report.frames).toHaveLength(9);
    expect(report.frames.every(frame => frame.renderedPixels === 16 && frame.loweredEntities === 1 && /^[0-9a-f]{64}$/u.test(frame.pngSha256))).toBe(true);
  });

  test("explicit times select one browser frame each and an empty pass reports warnings", async () => {
    const host = await fixture({ paint: () => noHit });
    const report = await audit(host, { request: { cameraId: "camera_main", timesUs: [500_000, 0] } });
    expect(report.timesUs).toEqual([0, 500_000]);
    expect(host.requests).toHaveLength(1);
    expect(report.summary.renderedPixels).toBe(0);
    expect(report.summary.entitiesNeverRendered).toEqual(["entity_box"]);
    const kinds = report.findings.map(finding => finding.kind);
    expect(kinds).toContain("never-rendered");
    expect(kinds).toContain("empty-render");
  });

  test("view surfaces attribute their selection code; splats stay unsupported without pixels", async () => {
    const splatBytes = new TextEncoder().encode("fixture spz payload");
    const splatSha256 = createHash("sha256").update(splatBytes).digest("hex");
    const image = await sharp({ create: { width: 2, height: 1, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
    const splat: SpatialEntity = {
      entityId: "entity_splat", kind: "splat", name: "Splat", parentId: null, transform: fixtureTransform,
      origin: { kind: "authored" }, placement: { kind: "world" }, visible: true, assetId: "asset_splat",
    };
    const hud: SpatialEntity = {
      entityId: "entity_hud", kind: "image", name: "HUD", parentId: null, transform: fixtureTransform,
      origin: { kind: "authored" }, placement: { kind: "view", cameraId: "camera_main", units: "normalized", order: 0 }, visible: true,
      assetId: "asset_hud", width: 1, height: 1, fit: "stretch", opacity: 1,
    };
    const splatAsset = fixtureAsset("asset_splat");
    const hudAsset = fixtureAsset("asset_hud");
    const input: SpatialSceneV1 = {
      ...scene(), entities: [fixtureEntity(), splat, hud],
      assets: [
        { ...splatAsset, payload: { ...splatAsset.payload, path: "assets/cloud.spz", sha256: splatSha256, bytes: splatBytes.byteLength },
          interpretation: { kind: "splat", format: "spz", metersPerUnit: 1, sourceUp: "y" } },
        { ...hudAsset, payload: { ...hudAsset.payload, path: "assets/hud.png", sha256: createHash("sha256").update(image).digest("hex"), bytes: image.byteLength },
          interpretation: { kind: "image", mimeType: "image/png", width: 2, height: 1, colorSpace: "srgb", alpha: "opaque" } },
      ],
    };
    const host = await fixture({ paint: (x, y) => (y === 0 ? selection(2) : x < 4 ? selection(1) : noHit) });
    await mkdir(join(host.root, "assets"));
    await writeFile(join(host.root, "assets", "cloud.spz"), splatBytes);
    await writeFile(join(host.root, "assets", "hud.png"), image);
    const report = await audit(host, { scene: input });
    const byId = new Map(report.entities.map(entity => [entity.entityId, entity]));
    expect(byId.get("entity_splat")!.eligibility).toBe("unsupported-kind");
    expect(byId.get("entity_splat")!.totals.pixels).toBe(0);
    expect(byId.get("entity_splat")!.samples.every(sample => !sample.lowered)).toBe(true);
    expect(byId.get("entity_hud")!.eligibility).toBe("view-masked");
    expect(byId.get("entity_hud")!.totals.pixels).toBe(9 * 8);
    expect(byId.get("entity_hud")!.totals.rendered).toBe(9);
    expect(report.summary.entitiesUnsupported).toEqual(["entity_splat"]);
    expect(report.summary.entitiesViewMasked).toEqual(["entity_hud"]);
    expect(report.summary.unattributedPixels).toBe(0);
    expect(report.findings.filter(finding => finding.kind === "unsupported-kind").map(finding => finding.entityId).sort()).toEqual(["entity_hud", "entity_splat"]);
  });

  test("unattributed codes are warnings; malformed pixels and foreign frames fail closed", async () => {
    const foreign = await fixture({ paint: x => (x < 2 ? selection(1) : x < 4 ? selection(4_096) : noHit) });
    const report = await audit(foreign, { request: { cameraId: "camera_main", timesUs: [0] } });
    expect(report.summary.unattributedPixels).toBe(8);
    expect(report.findings.some(finding => finding.kind === "unattributed-pixels" && finding.severity === "warning")).toBe(true);

    const malformed = await fixture({ paint: () => [0, 0, 1, 128] });
    await expect(audit(malformed, { request: { cameraId: "camera_main", timesUs: [0] } })).rejects.toThrow("alpha-255");

    const miscoded = await fixture({ paint: () => [0, 16, 1, 255] }); // code 4097
    await expect(audit(miscoded, { request: { cameraId: "camera_main", timesUs: [0] } })).rejects.toThrow();
  });

  test("renderer integrity, lock, frame-count, and pattern mismatches fail closed", async () => {
    const integrity = await fixture({ renderer: base => ({ async renderFrames(rendered, signal) {
      const result = await base.renderFrames(rendered, signal);
      return { ...result, executionIntegrity: { ...result.executionIntegrity, rootSha256: "f".repeat(64) } };
    } }) });
    await expect(audit(integrity, { request: { cameraId: "camera_main", timesUs: [0] } })).rejects.toThrow("integrity different");

    const locks = await fixture({ renderer: base => ({ async renderFrames(rendered, signal) {
      const result = await base.renderFrames(rendered, signal);
      return { ...result, libraryLocks: [] };
    } }) });
    await expect(audit(locks, { request: { cameraId: "camera_main", timesUs: [0] } })).rejects.toThrow("integrity different");

    const count = await fixture({ renderer: base => ({ async renderFrames(rendered, signal) {
      const result = await base.renderFrames(rendered, signal);
      return { ...result, frameCount: result.frameCount + 1 };
    } }) });
    await expect(audit(count, { request: { cameraId: "camera_main", timesUs: [0] } })).rejects.toThrow("frame count");

    const pattern = await fixture({ renderer: base => ({ async renderFrames(rendered, signal) {
      const result = await base.renderFrames(rendered, signal);
      return { ...result, framePattern: join(rendered.outputDirectory, "elsewhere", "frame-%08d.png") };
    } }) });
    await expect(audit(pattern, { request: { cameraId: "camera_main", timesUs: [0] } })).rejects.toThrow("frame count");

    const missing = await fixture({ renderer: base => ({ async renderFrames(rendered, signal) {
      const result = await base.renderFrames(rendered, signal);
      await rm(join(rendered.outputDirectory, "frames", "frame-00000000.png"));
      return result;
    } }) });
    await expect(audit(missing, { request: { cameraId: "camera_main", timesUs: [0] } })).rejects.toThrow("directory entry");
  });

  test("requires the renderer port and respects abort signals", async () => {
    const withoutRenderer = await fixture({ omitRenderer: true });
    await expect(audit(withoutRenderer, { request: { cameraId: "camera_main", timesUs: [0] } })).rejects.toThrow("qualified spatial browser renderer");
    const controller = new AbortController();
    const host = await fixture();
    const context = { ...host.context, abortSignal: controller.signal };
    controller.abort();
    await expect(auditSpatialSceneRenderedHost(context, { scene: scene(), assetRoot: host.root, request: { cameraId: "camera_main", timesUs: [0] } }, dependencies)).rejects.toThrow();
  });

  test("capability names follow declared video assets only", () => {
    expect(spatialRenderedAuditCapabilityNames(scene())).toEqual(["html-browser"]);
    const videoAsset = fixtureAsset("asset_video");
    const withVideo: SpatialSceneV1 = {
      ...scene(),
      assets: [{ ...videoAsset, interpretation: { kind: "video", width: 8, height: 4, colorSpace: "srgb", alpha: "opaque", durationUs: 1_000_000, frameRate: { numerator: 30, denominator: 1 } } }],
    };
    expect(spatialRenderedAuditCapabilityNames(withVideo)).toEqual(["ffmpeg", "ffprobe", "html-browser"]);
  });
});
