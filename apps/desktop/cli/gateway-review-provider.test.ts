import { expect, test } from "bun:test";
import { createHash } from "node:crypto";

import {
  SPATIAL_REVIEW_LIMITS,
  SPATIAL_REVIEW_PROMPT,
  SPATIAL_REVIEW_PROMPT_SHA256,
  SPATIAL_REVIEW_PROMPT_VERSION,
  SPATIAL_REVIEW_UPLOAD_POLICY,
  SpatialReviewProviderError,
  type SpatialReviewProviderRequest,
} from "../../../src/spatial-scene/review";
import type { SceneAiSdkModule } from "./gateway-scene-provider";
import { VERCEL_SCENE_GATEWAY_BASE_URL } from "./gateway-scene-provider";
import { ActiveGatewayCredential } from "./gateway-credential";
import type { GatewayCatalogRefresh } from "./gateway-media-catalog";
import {
  createGatewaySpatialReviewProvider,
  selectSpatialReviewModel,
} from "./gateway-review-provider";

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
const ATTEMPT_ID = "11111111-2222-4333-8444-555555555555";
const FRAME_BYTES = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

function catalog(rows: readonly Record<string, unknown>[]): unknown {
  return { data: rows };
}
function languageModel(id: string, input: readonly string[], output: readonly string[] = ["text"]): Record<string, unknown> {
  return { id, type: "language", modalities: { input, output } };
}

test("model selection scans the raw catalog for vision-capable language models", () => {
  const selection = selectSpatialReviewModel(catalog([
    { id: "openai/dall-e-3", type: "image", modalities: { input: ["text"], output: ["image"] } },
    languageModel("openai/gpt-5", ["text"]), // text-only input is not vision-capable
    languageModel("anthropic/claude-sonnet", ["text", "image"]),
    languageModel("google/gemini-3-flash", ["text", "image"]),
    languageModel("google/gemini-3-pro", ["text", "image"]),
    { id: "broken row", type: "language" },
  ]));
  // Deterministic lexicographic order with google/gemini-* preferred.
  expect(selection.modelId).toBe("google/gemini-3-flash");
  expect(selection.catalogSha256).toMatch(/^[a-f0-9]{64}$/u);
  // Without a Gemini candidate the lexicographic winner is used.
  expect(selectSpatialReviewModel(catalog([languageModel("anthropic/claude-sonnet", ["image"])])).modelId)
    .toBe("anthropic/claude-sonnet");
  // A language model whose output is not text never qualifies.
  expect(() => selectSpatialReviewModel(catalog([
    { id: "vendor/embed", type: "language", modalities: { input: ["text", "image"], output: ["embedding"] } },
  ]))).toThrow(SpatialReviewProviderError);
  expect(() => selectSpatialReviewModel({ data: [] })).toThrow("vision-capable");
  expect(() => selectSpatialReviewModel("not-a-catalog")).toThrow("unavailable");
});

function request(): SpatialReviewProviderRequest {
  return {
    attemptId: ATTEMPT_ID,
    cloudUpload: { acknowledgedAt: "2026-08-20T00:00:00.000Z", policy: SPATIAL_REVIEW_UPLOAD_POLICY },
    prompt: { sha256: SPATIAL_REVIEW_PROMPT_SHA256, version: SPATIAL_REVIEW_PROMPT_VERSION },
    scene: {
      sceneId: "scene_fixture", sceneSha256: "a".repeat(64), cameraId: "camera_main",
      durationUs: 1_000_000, timesUs: [0],
      entities: [{ entityId: "entity_box", kind: "mesh", name: "Box" }],
    },
    frames: [{ index: 0, timeUs: 0, width: 8, height: 4, bytes: FRAME_BYTES, sha256: sha256(FRAME_BYTES) }],
  };
}

const VISION_CATALOG = catalog([languageModel("google/gemini-3-flash", ["text", "image"])]);

function provider(overrides: {
  readonly credential?: () => ActiveGatewayCredential;
  readonly loadAiSdk?: () => Promise<SceneAiSdkModule>;
  readonly refresh?: () => Promise<GatewayCatalogRefresh>;
  readonly timeoutMs?: number;
}) {
  let refreshes = 0;
  const created = createGatewaySpatialReviewProvider({
    credential: overrides.credential ?? (() => new ActiveGatewayCredential("AI_GATEWAY_API_KEY", "gateway_test_secret_value")),
    ...(overrides.loadAiSdk === undefined ? {} : { loadAiSdk: overrides.loadAiSdk }),
    ...(overrides.timeoutMs === undefined ? {} : { timeoutMs: overrides.timeoutMs }),
    transport: { refresh: async () => { refreshes += 1; return await (overrides.refresh?.() ?? ({ status: "modified", payload: VISION_CATALOG })); } },
  });
  return { created, refreshes: () => refreshes };
}

test("an invalid request fails before any catalog refresh", async () => {
  const { created, refreshes } = provider({});
  await expect(created.critique({ ...request(), attemptId: "bogus" })).rejects.toMatchObject({ code: "invalid-request" });
  expect(refreshes()).toBe(0);
});

test("a not-modified catalog refresh is a definitive failure before dispatch", async () => {
  const { created } = provider({ refresh: async () => ({ status: "not-modified" }) });
  await expect(created.critique(request())).rejects.toMatchObject({ code: "gateway-unavailable", outcome: "definitive" });
});

test("a catalog without a vision-capable language model is model-unavailable", async () => {
  const { created } = provider({ refresh: async () => ({ status: "modified", payload: catalog([languageModel("openai/gpt-5", ["text"])]) }) });
  await expect(created.critique(request())).rejects.toMatchObject({ code: "model-unavailable" });
});

test("credential loading is lazy, scoped, and reported as credential-missing", async () => {
  let loads = 0;
  const { created } = provider({
    credential: () => { loads += 1; throw new Error("no credential"); },
    loadAiSdk: async () => ({
      Output: { object: () => ({}) },
      createGateway: () => { throw new Error("must not reach dispatch"); },
      generateText: () => { throw new Error("must not reach dispatch"); },
    }),
  });
  await expect(created.critique(request())).rejects.toMatchObject({ code: "credential-missing", outcome: "definitive" });
  expect(loads).toBe(1);
});

test("one critique call dispatches one zero-retry structured request with only selected frames", async () => {
  let observed: Readonly<Record<string, unknown>> | undefined;
  let gatewaySettings: Readonly<Record<string, unknown>> | undefined;
  let apiKeyInside: string | undefined;
  const { created } = provider({
    credential: () => new ActiveGatewayCredential("AI_GATEWAY_API_KEY", "gateway_test_secret_value"),
    loadAiSdk: async () => ({
      Output: { object: input => input },
      createGateway: settings => {
        gatewaySettings = settings as unknown as Record<string, unknown>;
        apiKeyInside = settings.apiKey;
        return { languageModel: (model: string) => `lm:${model}` };
      },
      generateText: async options => {
        observed = options;
        return {
          output: { scene: [{ severity: "info", category: "framing", message: "Centered." }], frames: [] },
          response: { id: "resp_1", modelId: "google/gemini-3-flash-001" },
          usage: { inputTokens: 512, outputTokens: 9 },
        };
      },
    }),
  });
  const result = await created.critique(request());
  expect(result.output.scene[0]!.message).toBe("Centered.");
  expect(result.model).toEqual({
    requestedModel: "google/gemini-3-flash", resolvedModel: "google/gemini-3-flash-001",
    catalogSha256: result.model.catalogSha256, providerResponseId: "resp_1",
  });
  expect(result.usage).toEqual({ inputTokens: 512, outputTokens: 9 });
  expect(observed?.maxRetries).toBe(0);
  expect(observed?.maxOutputTokens).toBe(SPATIAL_REVIEW_LIMITS.responseTokens);
  expect(observed?.model).toBe("lm:google/gemini-3-flash");
  expect(observed?.system).toBe(SPATIAL_REVIEW_PROMPT);
  expect(observed?.temperature).toBe(0);
  const options = observed?.providerOptions as Record<string, unknown>;
  expect(options?.gateway).toMatchObject({ disallowPromptTraining: true, zeroDataRetention: true });
  const messages = observed?.messages as readonly { readonly content: readonly Record<string, unknown>[] }[];
  expect(messages).toHaveLength(1);
  const images = messages[0]!.content.filter(part => part.type === "image");
  expect(images).toHaveLength(1);
  expect(String(images[0]!.image)).toMatch(/^data:image\/png;base64,/u);
  // The credential stayed inside withApiKey and never entered the dispatch options.
  expect((gatewaySettings as { baseURL?: string } | undefined)?.baseURL).toBe(VERCEL_SCENE_GATEWAY_BASE_URL);
  expect(apiKeyInside).toBe("gateway_test_secret_value");
  expect(JSON.stringify(observed)).not.toContain("gateway_test_secret_value");
});

test("a hanging dispatch reports ambiguous outcome and is never retried", async () => {
  let calls = 0;
  const { created } = provider({
    loadAiSdk: async () => ({
      Output: { object: () => ({}) },
      createGateway: () => ({ languageModel: (model: string) => model }),
      generateText: () => { calls += 1; return new Promise(() => undefined); },
    }),
    timeoutMs: 10,
  });
  await expect(created.critique(request())).rejects.toMatchObject({
    code: "gateway-outcome-unknown", outcome: "ambiguous",
  });
  expect(calls).toBe(1);
});

test("a malformed structured output is an invalid-response failure", async () => {
  const { created } = provider({
    loadAiSdk: async () => ({
      Output: { object: () => ({}) },
      createGateway: () => ({ languageModel: (model: string) => model }),
      generateText: async () => ({ output: { scene: "oops" }, response: {}, usage: {} }),
    }),
  });
  await expect(created.critique(request())).rejects.toMatchObject({ code: "invalid-response", outcome: "definitive" });
});
