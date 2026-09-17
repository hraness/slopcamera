import { expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

import { fixtureCamera, fixtureScene } from "../../../../src/spatial-scene/test-fixture";
import { spatialSceneSha256 } from "../../../../src/spatial-scene/identity";
import {
  SPATIAL_REVIEW_LIMITS, SPATIAL_REVIEW_PROMPT_SHA256, SPATIAL_REVIEW_UPLOAD_POLICY,
  SpatialReviewReportSchema, type SpatialReviewProviderRequest, type SpatialReviewProviderResult,
} from "../../../../src/spatial-scene/review";
import type { ApplicationContext } from "../context";
import { bindHtmlOverlayBrowserRuntime } from "../html-overlay-browser-runtime";
import { createHtmlOverlayExecutionBundle } from "../html-overlay-integrity";
import type { OperationExecutionContext } from "../operation";
import { createApplicationOperationRegistry } from "../default-registry";
import { planSpatialReview } from "../spatial-review";
import {
  bindSpatialReviewInput, executeSpatialReview,
  type SpatialReviewOperationDependencies,
} from "./spatial-review";

const bindRuntime: typeof bindHtmlOverlayBrowserRuntime = async (capability, signal) =>
  await bindHtmlOverlayBrowserRuntime(capability, signal, { allowUnverifiedRuntimeForTesting: true });
const ATTEMPT_ID = "11111111-2222-4333-8444-555555555555";
const ACKNOWLEDGED_AT = "2026-08-20T00:00:00.000Z";
const dependencies: SpatialReviewOperationDependencies = {
  bindBrowserRuntime: bindRuntime,
  nextAttemptId: () => ATTEMPT_ID,
};

function scene(): ReturnType<typeof fixtureScene> {
  const camera = fixtureCamera();
  return { ...fixtureScene(), cameras: [{ ...camera, projection: { ...camera.projection, width: 8, height: 4 } }] };
}

async function beautyPng(width: number, height: number): Promise<Buffer> {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      data[offset] = 40; data[offset + 1] = 80; data[offset + 2] = 160; data[offset + 3] = 255;
    }
  }
  return await sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

function providerResult(request: SpatialReviewProviderRequest): SpatialReviewProviderResult {
  return {
    output: {
      scene: [{ severity: "warning", category: "composition", message: "Subject crowds the left edge." }],
      frames: request.frames.map(frame => ({
        frameIndex: frame.index,
        findings: [{ severity: "info" as const, category: "readability" as const, message: `frame ${frame.index} readable.`, entityId: "entity_box" }],
      })),
    },
    model: {
      requestedModel: "google/gemini-3-pro", resolvedModel: "google/gemini-3-pro",
      catalogSha256: "e".repeat(64), providerResponseId: "resp_test",
    },
    usage: { inputTokens: 120, outputTokens: 30 },
  };
}

async function fixture(options: { readonly authorization?: boolean } = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "slopcamera-review-operation-")));
  const privateRoot = join(root, "artifacts", "slopcamera", "private");
  await mkdir(privateRoot, { recursive: true, mode: 0o700 });
  const binary = join(root, "browser");
  await writeFile(binary, "browser-fixture", { mode: 0o700 });
  const sourcePath = join(root, "original.scene.json");
  await writeFile(sourcePath, JSON.stringify(scene(), null, 2));
  const renders: string[] = [];
  const providerRequests: SpatialReviewProviderRequest[] = [];
  const authorizationRequests: unknown[] = [];
  const application: ApplicationContext = {
    paths: { repositoryRoot: root, privateRoot, artifactRoot: join(root, "artifacts", "slopcamera", "recordings"), desktopRoot: root, projectRoot: join(root, "artifacts", "slopcamera", "projects") },
    clock: { now: () => new Date(), timestampMilliseconds: () => Date.now() },
    capability: async name => name === "html-browser" ? { name, available: true, command: binary, version: "test" } : { name, available: false },
    capabilities: async () => [],
    runner: { run: async () => { throw new Error("Scene review must not run FFmpeg."); } },
    htmlOverlayRenderer: { renderFrames: async rendered => {
      renders.push(rendered.outputDirectory);
      const frames = join(rendered.outputDirectory, "frames");
      await mkdir(frames, { mode: 0o700 });
      const count = rendered.authoring.timing.durationUs / 1_000_000;
      const bytes = await beautyPng(rendered.authoring.canvas.width, rendered.authoring.canvas.height);
      for (let index = 0; index < count; index++) await writeFile(join(frames, `frame-${String(index).padStart(8, "0")}.png`), bytes, { mode: 0o600 });
      const bundle = createHtmlOverlayExecutionBundle(rendered.authoring, rendered.browserRuntime, rendered.executionProfile);
      return { frameCount: count, framePattern: join(frames, "frame-%08d.png"), executionIntegrity: bundle.integrity, libraryLocks: bundle.libraryLocks };
    } },
    ...(options.authorization === false ? {} : {
      spatialReviewAuthorization: { authorize: async request => {
        authorizationRequests.push(request);
        return { acknowledgedAt: ACKNOWLEDGED_AT };
      } },
    }),
    spatialReviewProvider: { critique: async request => {
      providerRequests.push(request);
      return providerResult(request);
    } },
  };
  const context: OperationExecutionContext = { application, abortSignal: new AbortController().signal };
  return { root, sourcePath, application, context, renders, providerRequests, authorizationRequests };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function withFixture(run: (f: Fixture) => Promise<void>, options: { readonly authorization?: boolean } = {}) {
  const f = await fixture(options);
  try { await run(f); } finally { await rm(f.root, { recursive: true, force: true }); }
}

test("plan bounds and scales the review before any capability or provider work", () => {
  const camera = fixtureCamera();
  const wide = {
    ...fixtureScene(),
    cameras: [{ ...camera, projection: { ...camera.projection, width: 2_048, height: 4_096, fx: 2_000, fy: 2_000, cx: 1_024, cy: 2_048 } }],
  };
  const plan = planSpatialReview(wide, { cameraId: "camera_main" });
  expect(plan.timesUs).toEqual([0, 333_333, 666_667, 1_000_000]);
  expect(plan.width).toBe(512); // 2048 * min(1, 1024/2048, 1024/4096)
  expect(plan.height).toBe(1_024);
  expect(plan.sourceWidth).toBe(2_048);
  expect(plan.sourceHeight).toBe(4_096);
  const projection = plan.evaluationScene.cameras[0]!.projection;
  if (projection.kind !== "perspective") throw new Error("expected a perspective projection");
  expect(projection.fx).toBe(500); // 2000 * 512/2048
  expect(projection.cy).toBe(512); // 2048 * 1024/4096
  // An already-bounded projection renders at native size without resampling.
  const small = planSpatialReview(scene(), { cameraId: "camera_main", timesUs: [0] });
  expect(small.width).toBe(8);
  expect(small.evaluationScene).toBe(small.scene);
  expect(() => planSpatialReview(scene(), { cameraId: "camera_other" })).toThrow("Unknown camera");
  expect(() => planSpatialReview(scene(), { cameraId: "camera_main", timesUs: [2_000_000] })).toThrow("outside the scene clock");
  expect(() => planSpatialReview(scene(), { cameraId: "camera_main", timesUs: [5, 5] })).toThrow("unique");
});

test("consent fails closed before capability or provider work", async () => withFixture(async f => {
  await expect(bindSpatialReviewInput(f.application, {
    source: { path: "original.scene.json" }, request: { cameraId: "camera_main" },
  }, f.context.abortSignal, bindRuntime)).rejects.toMatchObject({ code: "authorization-required" });
}, { authorization: false }));

test("the authorization envelope receives the exact bounded upload description", async () => withFixture(async f => {
  const { bound, grant } = await bindSpatialReviewInput(f.application, {
    source: { path: "original.scene.json" }, request: { cameraId: "camera_main", timesUs: [0, 500_000] },
  }, f.context.abortSignal, bindRuntime);
  expect(grant).toEqual({ acknowledgedAt: ACKNOWLEDGED_AT });
  expect(f.authorizationRequests).toEqual([{
    sceneSha256: spatialSceneSha256(scene()),
    cameraId: "camera_main",
    timesUs: [0, 500_000],
    maximumFrames: 2,
    maximumFrameBytes: SPATIAL_REVIEW_LIMITS.pngBytes,
    maximumUploadBytes: SPATIAL_REVIEW_LIMITS.uploadBytes,
  }]);
  expect(bound.capabilityBindings.map(item => item.name)).toEqual(["html-browser"]);
}));

test("execute returns a schema-valid advisory report after exactly one provider critique", async () => withFixture(async f => {
  const output = await executeSpatialReview(f.context, {
    source: { path: "original.scene.json" }, request: { cameraId: "camera_main" },
  }, dependencies);
  const report = SpatialReviewReportSchema.parse(output);
  expect(report.kind).toBe("slopcamera.spatial-review");
  expect(report.status).toBe("model-generated-unverified");
  expect(report.attemptId).toBe(ATTEMPT_ID);
  expect(report.cameraId).toBe("camera_main");
  expect(report.timesUs).toEqual([0, 333_333, 666_667, 1_000_000]);
  expect(report.render).toEqual({ mode: "beauty", width: 8, height: 4, sourceWidth: 8, sourceHeight: 4, excludedEntityIds: [] });
  expect(report.frames).toHaveLength(4);
  expect(report.upload.policy).toBe(SPATIAL_REVIEW_UPLOAD_POLICY);
  expect(report.upload.images).toBe(4);
  expect(report.upload.bytes).toBe(report.frames.reduce((sum, frame) => sum + frame.pngBytes, 0));
  expect(report.model).toMatchObject({
    gateway: "https://ai-gateway.vercel.sh",
    requestedModel: "google/gemini-3-pro",
    resolvedModel: "google/gemini-3-pro",
    promptSha256: SPATIAL_REVIEW_PROMPT_SHA256,
    maxRetries: 0,
  });
  expect(report.findings.scene).toHaveLength(1);
  expect(report.findings.frames).toHaveLength(4);
  expect(f.renders).toHaveLength(1);
  // Exactly one provider dispatch, carrying only the selected bounded frames.
  expect(f.providerRequests).toHaveLength(1);
  const request = f.providerRequests[0]!;
  expect(request.cloudUpload.policy).toBe(SPATIAL_REVIEW_UPLOAD_POLICY);
  expect(request.prompt.sha256).toBe(SPATIAL_REVIEW_PROMPT_SHA256);
  expect(request.scene.timesUs).toEqual(report.timesUs);
  expect(request.frames).toHaveLength(4);
  for (const [index, frame] of request.frames.entries()) {
    expect(frame.index).toBe(index);
    expect(frame.sha256).toBe(report.frames[index]!.pngSha256);
  }
}));

test("an unaccountable provider failure surfaces ambiguous and redacted", async () => withFixture(async f => {
  const failing: ApplicationContext = {
    ...f.application,
    spatialReviewProvider: { critique: async () => { throw new Error("provider internals with secret path /tmp/key"); } },
  };
  await expect(executeSpatialReview({ ...f.context, application: failing }, {
    source: { path: "original.scene.json" }, request: { cameraId: "camera_main" },
  }, dependencies)).rejects.toMatchObject({
    code: "ambiguous",
    message: "The scene review Gateway request outcome is unknown; it was not retried.",
  });
}));

test("registry discovery exposes scene.review@1 and workflow input must be fully bound", async () => withFixture(async f => {
  const registry = createApplicationOperationRegistry();
  const description = registry.describe("scene.review", 1);
  expect(description.inputSchemaId).toBe("slopcamera.operation.scene.review.input/v1");
  expect(description.outputSchemaId).toBe("slopcamera.operation.scene.review.output/v1");
  expect(description.policy.effect).toBe("paid-cloud");
  expect(description.policy.resume).toBe("ambiguous-after-dispatch");
  expect(description.policy.resources.map(item => item.resource))
    .toEqual(["cpu", "local-io", "browser", "ffmpeg", "network", "paid-call"]);
  const workflow: OperationExecutionContext = { ...f.context, workflow: {
    nodeKey: "review", nodePlanSha256: "a".repeat(64), runId: "run_test",
    workspaceDirectory: f.context.application.paths.privateRoot, beforePublication: async () => {},
  } };
  await expect(executeSpatialReview(workflow, {
    source: { path: "original.scene.json" }, request: { cameraId: "camera_main" },
  }, dependencies)).rejects.toThrow();
}));
