import { createBoundedJsonSnapshot } from "../../../src/code/json-snapshot";
import {
  SPATIAL_REVIEW_LIMITS,
  SPATIAL_REVIEW_PROMPT,
  SpatialReviewModelOutputSchema,
  SpatialReviewProviderError,
  redactedSpatialReviewProviderError,
  validateSpatialReviewProviderRequest,
  type SpatialReviewModelOutput,
  type SpatialReviewProvider,
  type SpatialReviewProviderResult,
  type ValidatedSpatialReviewProviderRequest,
} from "../../../src/spatial-scene/review";

import { canonicalJson } from "../core/canonical-json";
import type { ActiveGatewayCredential } from "./gateway-credential";
import type { GatewayMediaCatalogTransport } from "./gateway-media-catalog";
import {
  createFixedSceneGatewayFetch,
  sceneFrameDataUrl,
  VERCEL_SCENE_GATEWAY_BASE_URL,
  type SceneAiSdkLoader,
  type SceneAiSdkModule,
} from "./gateway-scene-provider";

const MAXIMUM_CATALOG_BYTES = 8 * 1024 * 1024;
const CATALOG_MODEL_LIMIT = 1_000;
const DEFAULT_REVIEW_GATEWAY_TIMEOUT_MS = 120_000;
const GOOGLE_GEMINI_MODEL = /^google\/gemini-[a-z0-9][a-z0-9._-]{0,239}$/u;

type GatewayFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface AiSdkResult {
  readonly output?: unknown;
  readonly response?: unknown;
  readonly usage?: unknown;
}

async function loadAiSdk(): Promise<SceneAiSdkModule> {
  const [gatewayValue, aiValue]: readonly unknown[] = await Promise.all([
    import("@ai-sdk/gateway-v4"),
    import("ai-v7"),
  ]);
  if (
    typeof gatewayValue !== "object"
    || gatewayValue === null
    || !("createGateway" in gatewayValue)
    || typeof gatewayValue.createGateway !== "function"
    || typeof aiValue !== "object"
    || aiValue === null
    || !("generateText" in aiValue)
    || typeof aiValue.generateText !== "function"
    || !("Output" in aiValue)
    || typeof aiValue.Output !== "object"
    || aiValue.Output === null
    || !("object" in aiValue.Output)
    || typeof aiValue.Output.object !== "function"
  ) {
    throw new Error("The AI SDK review provider is unavailable.");
  }
  return {
    Output: aiValue.Output as SceneAiSdkModule["Output"],
    createGateway: gatewayValue.createGateway as SceneAiSdkModule["createGateway"],
    generateText: aiValue.generateText as SceneAiSdkModule["generateText"],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedModelId(value: unknown): string | null {
  return typeof value === "string"
    && value.length >= 1
    && value.length <= SPATIAL_REVIEW_LIMITS.modelIdChars
    && value.includes("/")
    && !/\s/u.test(value)
    && !value.startsWith("/")
    && !value.endsWith("/")
    && ![...value].some(character => {
      const code = character.codePointAt(0) ?? 0;
      return code <= 31 || code === 127;
    })
    ? value
    : null;
}

function modalityList(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export interface SpatialReviewModelSelection {
  readonly catalogSha256: string;
  readonly modelId: string;
}

/**
 * Scans the fresh raw catalog payload for vision-capable language models:
 * `type: "language"` rows whose input modalities include "image" and output
 * modalities include "text". The media catalog projection drops pure language
 * models, so review validates the untransformed document. Selection is
 * deterministic: google/gemini-* ids first, then lexicographic order.
 */
export function selectSpatialReviewModel(payload: unknown): SpatialReviewModelSelection {
  const snapshot = createBoundedJsonSnapshot(payload, MAXIMUM_CATALOG_BYTES, "Gateway model catalog", {
    maximumDepth: 16, maximumValues: 200_000,
  });
  if (snapshot.sha256 === undefined) {
    throw new SpatialReviewProviderError("gateway-unavailable");
  }
  const value = snapshot.value;
  if (!isRecord(value) || !Array.isArray(value.data) || value.data.length > CATALOG_MODEL_LIMIT) {
    throw new SpatialReviewProviderError("gateway-unavailable");
  }
  const candidates: string[] = [];
  for (const row of value.data) {
    if (!isRecord(row) || row.type !== "language") continue;
    const modalities = isRecord(row.modalities) ? row.modalities : {};
    const input = modalityList(modalities.input);
    const output = modalityList(modalities.output);
    if (!input.includes("image") || !output.includes("text")) continue;
    const id = boundedModelId(row.id);
    if (id === null) continue;
    candidates.push(id);
  }
  if (candidates.length === 0) throw new SpatialReviewProviderError("model-unavailable");
  candidates.sort((left, right) => left.localeCompare(right));
  const preferred = candidates.filter(id => GOOGLE_GEMINI_MODEL.test(id));
  return { catalogSha256: snapshot.sha256, modelId: (preferred[0] ?? candidates[0])! };
}

function userMessage(request: ValidatedSpatialReviewProviderRequest): Readonly<Record<string, unknown>> {
  const content: Readonly<Record<string, unknown>>[] = [{
    text: [
      `Review ${request.frames.length} rendered beauty frame(s) for spatial scene ${request.scene.sceneId}.`,
      `Scene sha256=${request.scene.sceneSha256}; camera ${request.scene.cameraId}; duration ${request.scene.durationUs} microseconds.`,
      `Sampled times (microseconds): ${request.scene.timesUs.join(", ")}.`,
      request.scene.entities.length === 0
        ? "The scene declares no entities."
        : `Declared entity catalog for attribution: ${canonicalJson(request.scene.entities)}.`,
      "Attribute a finding to entityId only when it exactly matches one declared identifier.",
    ].join(" "),
    type: "text",
  }];
  for (const frame of request.frames) {
    content.push({ text: `frameIndex ${frame.index} at ${frame.timeUs} microseconds follows.`, type: "text" });
    content.push({
      image: sceneFrameDataUrl("image/png", frame.bytes),
      mediaType: "image/png",
      type: "image",
    });
  }
  return { content, role: "user" };
}

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return isRecord(value) ? value : null;
}

function tokenCount(value: unknown, key: "inputTokens" | "outputTokens"): number {
  const selected = record(value)?.[key];
  return Number.isSafeInteger(selected) && (selected as number) >= 0
    && (selected as number) <= SPATIAL_REVIEW_LIMITS.tokenCount
    ? selected as number
    : 0;
}

function resolvedModel(value: unknown): string | null {
  const modelId = record(value)?.modelId;
  return boundedModelId(modelId) ?? (typeof modelId === "string" && modelId.length >= 1 && modelId.length <= SPATIAL_REVIEW_LIMITS.modelIdChars ? modelId : null);
}

function providerResponseId(value: unknown): string | undefined {
  const id = record(value)?.id;
  return typeof id === "string" && id.length >= 1 && id.length <= SPATIAL_REVIEW_LIMITS.providerResponseIdChars
    && ![...id].some(character => (character.codePointAt(0) ?? 0) <= 31)
    ? id
    : undefined;
}

function parseReviewProviderOutput(value: unknown): SpatialReviewModelOutput {
  const parsed = SpatialReviewModelOutputSchema.safeParse(value);
  if (!parsed.success) throw new SpatialReviewProviderError("invalid-response");
  return parsed.data;
}

export interface GatewaySpatialReviewProviderOptions {
  /** Lazy credential load: reads the environment only inside the dispatch. */
  readonly credential: () => ActiveGatewayCredential;
  readonly fetch?: GatewayFetch;
  readonly loadAiSdk?: SceneAiSdkLoader;
  readonly timeoutMs?: number;
  /** Fresh catalog transport; the review dispatch performs one refresh. */
  readonly transport: GatewayMediaCatalogTransport;
}

function boundedTimeout(value: number | undefined): number {
  const timeoutMs = value ?? DEFAULT_REVIEW_GATEWAY_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) {
    throw new SpatialReviewProviderError("invalid-request");
  }
  return timeoutMs;
}

function disableAiSdkWarningLogging(): void {
  (
    globalThis as typeof globalThis & {
      AI_SDK_LOG_WARNINGS?: false;
    }
  ).AI_SDK_LOG_WARNINGS = false;
}

function assertReviewDispatchActive(signal: AbortSignal): void {
  if (signal.aborted) throw new SpatialReviewProviderError("aborted");
}

/**
 * One consent-gated critique call against the fixed Gateway origin. The
 * credential is loaded lazily after the fresh catalog proves a vision-capable
 * language model; `maxRetries` is pinned to zero and an ambiguous dispatch is
 * never resubmitted.
 */
export function createGatewaySpatialReviewProvider(
  options: GatewaySpatialReviewProviderOptions,
): SpatialReviewProvider {
  const loader = options.loadAiSdk ?? loadAiSdk;
  const gatewayFetch = createFixedSceneGatewayFetch(options.fetch ?? globalThis.fetch);
  const timeoutMs = boundedTimeout(options.timeoutMs);
  return {
    critique: async (requestInput, signal): Promise<SpatialReviewProviderResult> => {
      const request = validateSpatialReviewProviderRequest(requestInput);
      let dispatched = false;
      let timedOut = false;
      const controller = new AbortController();
      const abortFromCaller = (): void => controller.abort(signal?.reason);
      signal?.addEventListener("abort", abortFromCaller, { once: true });
      if (signal?.aborted === true) {
        signal?.removeEventListener("abort", abortFromCaller);
        throw new SpatialReviewProviderError("aborted");
      }
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
      const interrupted = new Promise<never>((_resolve, reject) => {
        const rejectInterrupted = (): void => reject(
          dispatched
            ? new SpatialReviewProviderError(
                timedOut ? "gateway-outcome-unknown" : "aborted",
                "ambiguous",
              )
            : new SpatialReviewProviderError(
                timedOut ? "gateway-unavailable" : "aborted",
              ),
        );
        controller.signal.addEventListener("abort", rejectInterrupted, { once: true });
        if (controller.signal.aborted) rejectInterrupted();
      });
      try {
        const operation = (async (): Promise<SpatialReviewProviderResult> => {
          const refresh = await options.transport.refresh(undefined, controller.signal);
          assertReviewDispatchActive(controller.signal);
          if (refresh.status !== "modified") {
            throw new SpatialReviewProviderError("gateway-unavailable");
          }
          const selection = selectSpatialReviewModel(refresh.payload);
          disableAiSdkWarningLogging();
          const ai = await loader();
          assertReviewDispatchActive(controller.signal);
          let credential: ActiveGatewayCredential;
          try {
            credential = options.credential();
          } catch {
            throw new SpatialReviewProviderError("credential-missing");
          }
          return await credential.withApiKey(async (apiKey) => {
            assertReviewDispatchActive(controller.signal);
            const gateway = ai.createGateway({
              apiKey,
              baseURL: VERCEL_SCENE_GATEWAY_BASE_URL,
              fetch: gatewayFetch,
            });
            const output = ai.Output.object({
              description: "Bounded advisory beauty-pass findings for one spatial scene review.",
              name: "slopcamera_spatial_review",
              schema: SpatialReviewModelOutputSchema,
            });
            assertReviewDispatchActive(controller.signal);
            dispatched = true;
            const result: AiSdkResult = await ai.generateText({
              abortSignal: controller.signal,
              maxOutputTokens: SPATIAL_REVIEW_LIMITS.responseTokens,
              maxRetries: 0,
              messages: [userMessage(request)],
              model: gateway.languageModel(selection.modelId),
              output,
              providerOptions: {
                gateway: {
                  disallowPromptTraining: true,
                  tags: ["slopcamera", "scene-review", "v1"],
                  zeroDataRetention: true,
                },
              },
              system: SPATIAL_REVIEW_PROMPT,
              temperature: 0,
            });
            const responseId = providerResponseId(result.response);
            return {
              model: {
                catalogSha256: selection.catalogSha256,
                requestedModel: selection.modelId,
                resolvedModel: resolvedModel(result.response),
                ...(responseId === undefined ? {} : { providerResponseId: responseId }),
              },
              output: parseReviewProviderOutput(result.output),
              usage: {
                inputTokens: tokenCount(result.usage, "inputTokens"),
                outputTokens: tokenCount(result.usage, "outputTokens"),
              },
            };
          });
        })();
        return await Promise.race([operation, interrupted]);
      } catch (error) {
        throw redactedSpatialReviewProviderError(error, dispatched);
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abortFromCaller);
      }
    },
  };
}
