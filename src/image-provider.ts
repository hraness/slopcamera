import { createHash, randomUUID } from "node:crypto"
import { SlopcameraCloudError } from "./cloud-errors.js"
import {
  generateSlopcameraImage,
  slopcameraMaximumPromptBytes,
  slopcameraMaximumRawImageBytes,
  type SlopcameraGenerateDependencies,
  type SlopcameraResponseMediaType,
} from "./generate.js"

export type SlopcameraImageProvider = "vertex" | "google" | "openai" | "gateway"
export type SlopcameraImageProviderEnvironment = Readonly<Record<string, string | undefined>>
export type SlopcameraImageProviderCredentialSource =
  | "VERTEX_API_KEY"
  | "GOOGLE_CLOUD_API_KEY"
  | "GEMINI_API_KEY"
  | "GOOGLE_API_KEY"
  | "OPENAI_API_KEY"
  | "AI_GATEWAY_API_KEY"
  | "VERCEL_OIDC_TOKEN"

export interface SlopcameraImageProviderReference {
  readonly bytes: Uint8Array
  readonly mediaType: SlopcameraResponseMediaType
}

export interface GenerateSlopcameraProviderImageInput {
  readonly provider: SlopcameraImageProvider
  readonly model: string
  readonly prompt: string
  readonly aspectRatio?: string
  readonly resolution?: "1K" | "2K" | "4K"
  readonly references?: readonly SlopcameraImageProviderReference[]
  readonly allowCloudUpload?: boolean
  readonly signal?: AbortSignal
  readonly timeoutMs?: number
}

export interface GeneratedSlopcameraProviderImage {
  readonly bytes: Uint8Array
  readonly mediaType: SlopcameraResponseMediaType
  readonly provider: SlopcameraImageProvider
  readonly model: string
  readonly requestId: string
  readonly warnings: readonly string[]
}

export interface JudgeSlopcameraProviderImagesInput {
  readonly provider: "vertex" | "google"
  readonly model: string
  readonly prompt: string
  readonly images: readonly SlopcameraImageProviderReference[]
  readonly allowCloudUpload: true
  readonly signal?: AbortSignal
  readonly timeoutMs?: number
}

export interface JudgedSlopcameraProviderImages {
  readonly text: string
  readonly requestId: string
  readonly provider: "vertex" | "google"
  readonly model: string
}

export interface SlopcameraImageProviderDependencies {
  readonly environment?: SlopcameraImageProviderEnvironment
  readonly fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
  readonly maximumResponseBytes?: number
  readonly gateway?: SlopcameraGenerateDependencies
}

const maximumReferenceBytes = 12 * 1024 * 1024
const maximumRequestBytes = 17 * 1024 * 1024
const maximumResponseBytes = 96 * 1024 * 1024
const maximumJudgeTextBytes = 64 * 1024
const imageTypes: readonly SlopcameraResponseMediaType[] = ["image/png", "image/jpeg", "image/webp"]
const geminiAspectRatios = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"]
const geminiFlashAspectRatios = [...geminiAspectRatios, "1:4", "1:8", "4:1", "8:1"]

function fail(code: SlopcameraCloudError["code"], message: string): never {
  throw new SlopcameraCloudError(code, message)
}

function invalid(message: string): never {
  return fail("INVALID_ARGUMENT", message)
}

function invalidResponse(): never {
  return fail("GENERATION_INVALID_RESPONSE", "The image provider returned an invalid bounded response.")
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function provider(value: unknown): SlopcameraImageProvider {
  if (value !== "vertex" && value !== "google" && value !== "openai" && value !== "gateway") {
    invalid("provider must be vertex, google, openai, or gateway.")
  }
  return value
}

function credentialSources(value: SlopcameraImageProvider): readonly SlopcameraImageProviderCredentialSource[] {
  switch (value) {
    case "vertex": return ["VERTEX_API_KEY", "GOOGLE_CLOUD_API_KEY"]
    case "google": return ["GEMINI_API_KEY", "GOOGLE_API_KEY"]
    case "openai": return ["OPENAI_API_KEY"]
    case "gateway": return ["AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN"]
  }
}

function validCredential(value: unknown): value is string {
  return typeof value === "string" && value.length >= 16 && value.length <= 16 * 1024 && /^[\x21-\x7e]+$/u.test(value)
}

/** Reports only credential availability and its environment variable name. */
export function slopcameraImageProviderCredentialStatus(
  selected: SlopcameraImageProvider,
  environment: SlopcameraImageProviderEnvironment = process.env,
): Readonly<{ available: boolean; source: SlopcameraImageProviderCredentialSource | null }> {
  for (const source of credentialSources(provider(selected))) {
    if (environment[source] !== undefined) return { available: validCredential(environment[source]), source }
  }
  return { available: false, source: null }
}

function credential(selected: SlopcameraImageProvider, environment: SlopcameraImageProviderEnvironment): string {
  const status = slopcameraImageProviderCredentialStatus(selected, environment)
  if (!status.available || status.source === null) {
    fail("AUTHENTICATION_REQUIRED", `Set a valid ${credentialSources(selected).join(" or ")} environment credential.`)
  }
  // No credential value is accepted on the input or included in any receipt.
  return environment[status.source]!
}

function prompt(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0 || Buffer.byteLength(value, "utf8") > slopcameraMaximumPromptBytes || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
    invalid(`prompt must contain 1 through ${slopcameraMaximumPromptBytes} UTF-8 bytes without control characters.`)
  }
  return value
}

function model(value: unknown, selected: SlopcameraImageProvider): string {
  const pattern = selected === "gateway" ? /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/iu : /^[a-z0-9][a-z0-9._-]*$/iu
  if (typeof value !== "string" || value.length < 3 || value.length > 128 || !pattern.test(value)) {
    invalid("model must be a bounded native model ID (provider/model for gateway).")
  }
  return value
}

function timeout(value: unknown): number {
  const result = value ?? 5 * 60_000
  if (typeof result !== "number" || !Number.isSafeInteger(result) || result < 1_000 || result > 30 * 60_000) {
    invalid("timeoutMs must be an integer from 1000 through 1800000.")
  }
  return result
}

function validateSignal(value: unknown): void {
  if (value !== undefined && !(value instanceof AbortSignal)) invalid("signal must be an AbortSignal.")
}

function validImage(bytes: Uint8Array, type: SlopcameraResponseMediaType): boolean {
  if (bytes.byteLength < 12 || bytes.byteLength > slopcameraMaximumRawImageBytes) return false
  if (type === "image/png") return Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  if (type === "image/jpeg") return bytes[0] === 255 && bytes[1] === 216 && bytes.at(-2) === 255 && bytes.at(-1) === 217
  return bytes.byteLength >= 16 && Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" && Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP" && Buffer.from(bytes).readUInt32LE(4) === bytes.byteLength - 8 && ["VP8 ", "VP8L", "VP8X"].includes(Buffer.from(bytes.subarray(12, 16)).toString("ascii"))
}

function references(value: unknown, allowCloudUpload: unknown): readonly SlopcameraImageProviderReference[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 8) invalid("references must contain at most eight images.")
  if (value.length > 0 && allowCloudUpload !== true) invalid("Local image references require allowCloudUpload: true.")
  let total = 0
  return value.map((entry: unknown) => {
    if (!object(entry) || !(entry.bytes instanceof Uint8Array) || !imageTypes.includes(entry.mediaType as SlopcameraResponseMediaType)) {
      invalid("Each reference must contain image bytes and a supported mediaType.")
    }
    const type = entry.mediaType as SlopcameraResponseMediaType
    total += entry.bytes.byteLength
    if (total > maximumReferenceBytes || !validImage(entry.bytes, type)) invalid("References must be valid PNG, JPEG, or WebP and total no more than 12 MiB.")
    return { bytes: Uint8Array.from(entry.bytes), mediaType: type }
  })
}

function digest(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`
}

function requestId(response: Response, body: Record<string, unknown>): string {
  const identifier = response.headers.get("x-request-id") ?? response.headers.get("x-goog-request-id") ?? body.responseId
  return typeof identifier === "string" && identifier.length > 0 && identifier.length <= 1024 ? digest(identifier) : randomUUID()
}

function inlineImage(value: unknown, type: unknown): SlopcameraImageProviderReference {
  if (typeof value !== "string" || value.length === 0 || value.length > Math.ceil(slopcameraMaximumRawImageBytes / 3) * 4 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(value) || !imageTypes.includes(type as SlopcameraResponseMediaType)) invalidResponse()
  const bytes = Buffer.from(value, "base64")
  const mediaType = type as SlopcameraResponseMediaType
  if (bytes.toString("base64") !== value || !validImage(bytes, mediaType)) invalidResponse()
  return { bytes, mediaType }
}

function deadline(caller: AbortSignal | undefined, timeoutMs: number): Readonly<{ signal: AbortSignal; interrupted: Promise<never>; dispose(): void }> {
  const controller = new AbortController()
  let reject: ((error: SlopcameraCloudError) => void) | undefined
  const interrupted = new Promise<never>((_resolve, failure) => { reject = failure })
  const interrupt = (): void => {
    controller.abort()
    reject?.(new SlopcameraCloudError("GENERATION_FAILED", "Image provider generation was cancelled or exceeded its deadline; the request was not retried."))
  }
  if (caller?.aborted === true) interrupt()
  caller?.addEventListener("abort", interrupt, { once: true })
  const timer = setTimeout(interrupt, timeoutMs)
  return { signal: controller.signal, interrupted, dispose: () => { clearTimeout(timer); caller?.removeEventListener("abort", interrupt); reject = undefined } }
}

async function readJson(response: Response, limit: number, signal: AbortSignal): Promise<Record<string, unknown>> {
  if (response.redirected || response.status >= 300 && response.status < 400) {
    await response.body?.cancel().catch(() => undefined)
    fail("GENERATION_FAILED", "The image provider redirect was rejected; the request was not retried.")
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined)
    fail(response.status === 401 || response.status === 403 ? "AUTHENTICATION_REQUIRED" : "GENERATION_FAILED", `Image provider request failed (HTTP ${response.status}); the request was not retried.`)
  }
  const declared = response.headers.get("content-length")
  if (declared !== null && (!/^\d+$/u.test(declared) || !Number.isSafeInteger(Number(declared)) || Number(declared) > limit)) {
    await response.body?.cancel().catch(() => undefined)
    invalidResponse()
  }
  if (response.body === null) invalidResponse()
  const reader = response.body.getReader()
  const abort = (): void => { void reader.cancel().catch(() => undefined) }
  signal.addEventListener("abort", abort, { once: true })
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (!signal.aborted) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > limit) { await reader.cancel().catch(() => undefined); invalidResponse() }
      chunks.push(part.value)
    }
    if (signal.aborted) fail("GENERATION_FAILED", "Image provider generation was cancelled or exceeded its deadline; the request was not retried.")
    const parsed: unknown = JSON.parse(Buffer.concat(chunks, size).toString("utf8"))
    if (!object(parsed)) invalidResponse()
    return parsed
  } catch {
    if (signal.aborted) fail("GENERATION_FAILED", "Image provider generation was cancelled or exceeded its deadline; the request was not retried.")
    invalidResponse()
  } finally {
    signal.removeEventListener("abort", abort)
    reader.releaseLock()
  }
}

async function request(
  selected: Exclude<SlopcameraImageProvider, "gateway">,
  nativeModel: string,
  body: Record<string, unknown>,
  input: Readonly<{ signal?: AbortSignal; timeoutMs?: number }>,
  dependencies: SlopcameraImageProviderDependencies,
): Promise<Readonly<{ body: Record<string, unknown>; requestId: string }>> {
  validateSignal(input.signal)
  const key = credential(selected, dependencies.environment ?? process.env)
  const responseLimit = dependencies.maximumResponseBytes ?? maximumResponseBytes
  if (!Number.isSafeInteger(responseLimit) || responseLimit < 1 || responseLimit > maximumResponseBytes) invalid("maximumResponseBytes must be an integer from 1 through 100663296.")
  const encoded = JSON.stringify(body)
  if (Buffer.byteLength(encoded, "utf8") > maximumRequestBytes) invalid("Image provider request exceeds the 17 MiB byte limit.")
  const endpoint = selected === "vertex"
    ? `https://aiplatform.googleapis.com/v1beta1/publishers/google/models/${nativeModel}:generateContent`
    : selected === "google"
      ? `https://generativelanguage.googleapis.com/v1beta/models/${nativeModel}:generateContent`
      : "https://api.openai.com/v1/images/generations"
  const clock = deadline(input.signal, timeout(input.timeoutMs))
  const send = async (): Promise<Readonly<{ body: Record<string, unknown>; requestId: string }>> => {
    if (clock.signal.aborted) return await clock.interrupted
    let response: Response
    try {
      response = await (dependencies.fetch ?? globalThis.fetch)(endpoint, {
        method: "POST", redirect: "error", signal: clock.signal,
        headers: { "content-type": "application/json", ...(selected === "openai" ? { authorization: `Bearer ${key}` } : { "x-goog-api-key": key }) },
        body: encoded,
      })
    } catch {
      fail("GENERATION_FAILED", "Image provider generation failed; the request was not retried.")
    }
    if (clock.signal.aborted) { await response.body?.cancel().catch(() => undefined); return await clock.interrupted }
    const parsed = await readJson(response, responseLimit, clock.signal)
    return { body: parsed, requestId: requestId(response, parsed) }
  }
  try {
    return await Promise.race([send(), clock.interrupted])
  } catch (error) {
    if (error instanceof SlopcameraCloudError) throw error
    fail("GENERATION_FAILED", "Image provider generation failed; the request was not retried.")
  } finally { clock.dispose() }
}

function geminiContents(text: string, images: readonly SlopcameraImageProviderReference[]): unknown[] {
  return [{ role: "user", parts: [{ text }, ...images.map(image => ({ inlineData: { mimeType: image.mediaType, data: Buffer.from(image.bytes).toString("base64") } }))] }]
}

function geminiParts(body: Record<string, unknown>): readonly Record<string, unknown>[] {
  if (!Array.isArray(body.candidates) || body.candidates.length !== 1 || !object(body.candidates[0])) invalidResponse()
  const candidate = body.candidates[0]
  if (candidate.finishReason !== undefined && candidate.finishReason !== "STOP") invalidResponse()
  if (!object(candidate.content) || !Array.isArray(candidate.content.parts) || candidate.content.parts.length > 64 || candidate.content.parts.some((part: unknown) => !object(part))) invalidResponse()
  return candidate.content.parts as Record<string, unknown>[]
}

function openaiSize(nativeModel: string, aspectRatio: string | undefined, resolution: "1K" | "2K" | "4K" | undefined): string {
  const ratio = aspectRatio ?? "1:1"
  const resolutionValue = resolution ?? "1K"
  if (nativeModel === "dall-e-2") {
    if (ratio !== "1:1" || resolutionValue !== "1K") invalid("dall-e-2 supports only a 1:1, 1K image in this interface.")
    return "1024x1024"
  }
  if (nativeModel === "dall-e-3") {
    if (resolutionValue !== "1K" || !["1:1", "7:4", "4:7"].includes(ratio)) invalid("dall-e-3 supports 1K at 1:1, 7:4, or 4:7 in this interface.")
    return ratio === "1:1" ? "1024x1024" : ratio === "7:4" ? "1792x1024" : "1024x1792"
  }
  if (!nativeModel.startsWith("gpt-image-")) invalid("Direct OpenAI generation requires a GPT Image or DALL-E model ID.")
  if (!/^gpt-image-2(?:[.-]|$)/u.test(nativeModel)) {
    if (resolutionValue !== "1K" || !["1:1", "3:2", "2:3"].includes(ratio)) invalid("This GPT Image model supports 1K at 1:1, 3:2, or 2:3 in this interface.")
    return ratio === "1:1" ? "1024x1024" : ratio === "3:2" ? "1536x1024" : "1024x1536"
  }
  const match = /^(\d{1,2}):(\d{1,2})$/u.exec(ratio)
  const widthRatio = Number(match?.[1])
  const heightRatio = Number(match?.[2])
  if (!match || widthRatio < 1 || heightRatio < 1 || Math.max(widthRatio / heightRatio, heightRatio / widthRatio) > 3) invalid("GPT Image 2 aspectRatio must be between 1:3 and 3:1.")
  const edge = resolutionValue === "4K" ? 3840 : resolutionValue === "2K" ? 2048 : 1536
  const long = resolutionValue === "1K" && widthRatio === heightRatio ? 1024 : edge
  const width = Math.round(long * widthRatio / Math.max(widthRatio, heightRatio) / 16) * 16
  const height = Math.round(long * heightRatio / Math.max(widthRatio, heightRatio) / 16) * 16
  if (width * height < 655_360 || width * height > 8_294_400) invalid("This GPT Image 2 size exceeds the model's pixel limits; choose another ratio or resolution.")
  return `${width}x${height}`
}

function prepareImageInput(input: GenerateSlopcameraProviderImageInput): Readonly<{
  provider: SlopcameraImageProvider
  model: string
  prompt: string
  images: readonly SlopcameraImageProviderReference[]
  size?: string
}> {
  if (!object(input)) invalid("Image generation input must be an object.")
  const selected = provider(input.provider)
  const nativeModel = model(input.model, selected)
  const text = prompt(input.prompt)
  timeout(input.timeoutMs)
  validateSignal(input.signal)
  if (input.allowCloudUpload !== undefined && typeof input.allowCloudUpload !== "boolean") invalid("allowCloudUpload must be boolean.")
  const images = references(input.references, input.allowCloudUpload)
  if (input.resolution !== undefined && !["1K", "2K", "4K"].includes(input.resolution)) invalid("resolution must be 1K, 2K, or 4K.")
  if (input.aspectRatio !== undefined && (typeof input.aspectRatio !== "string" || input.aspectRatio.length > 8)) invalid("aspectRatio must be a supported bounded ratio.")
  if (selected === "gateway") {
    if (images.length > 0 || input.aspectRatio !== undefined || input.resolution !== undefined) invalid("The portable Gateway image generator does not support references, aspectRatio, or resolution; choose a direct provider.")
  } else if (selected === "openai") {
    if (images.length > 0) invalid("Direct OpenAI image references require the edits API and are not supported by this generator; choose vertex or google.")
    const size = openaiSize(nativeModel, input.aspectRatio, input.resolution)
    const legacy = nativeModel === "dall-e-2" || nativeModel === "dall-e-3"
    if (legacy && text.length > (nativeModel === "dall-e-2" ? 1000 : 4000)) invalid("The prompt exceeds this DALL-E model's character limit.")
    return { provider: selected, model: nativeModel, prompt: text, images, size }
  } else {
    const family = nativeModel.replace(/-preview$/u, "")
    const knownModels = ["gemini-2.5-flash-image", "gemini-3-pro-image", "gemini-3.1-flash-image", "gemini-3.1-flash-lite-image"]
    if (!knownModels.includes(family) && (input.aspectRatio !== undefined || input.resolution !== undefined)) invalid("Image size options require a qualified Gemini image model ID.")
    const supportedRatios = family === "gemini-3.1-flash-image" ? geminiFlashAspectRatios : geminiAspectRatios
    if (input.aspectRatio !== undefined && !supportedRatios.includes(input.aspectRatio)) invalid("aspectRatio is not supported by this Gemini image model.")
    if ((family === "gemini-2.5-flash-image" || family === "gemini-3.1-flash-lite-image") && input.resolution !== undefined && input.resolution !== "1K") invalid("This Gemini image model supports only 1K resolution.")
  }
  return { provider: selected, model: nativeModel, prompt: text, images }
}

/** Validates generation input without credentials, filesystem writes, or network I/O. */
export function validateSlopcameraProviderImageInput(input: GenerateSlopcameraProviderImageInput): void {
  prepareImageInput(input)
}

/** One provider request, zero retries, environment-only credentials, fixed endpoints. */
export async function generateSlopcameraProviderImage(input: GenerateSlopcameraProviderImageInput, dependencies: SlopcameraImageProviderDependencies = {}): Promise<GeneratedSlopcameraProviderImage> {
  const prepared = prepareImageInput(input)
  const { provider: selected, model: nativeModel, prompt: text, images } = prepared
  if (selected === "gateway") {
    const gatewayDependencies: SlopcameraGenerateDependencies = { ...dependencies.gateway, ...(dependencies.environment === undefined ? {} : { environment: dependencies.environment }), ...(dependencies.fetch === undefined ? {} : { fetch: dependencies.fetch }), ...(dependencies.maximumResponseBytes === undefined ? {} : { maximumResponseBytes: dependencies.maximumResponseBytes }) }
    const result = await generateSlopcameraImage({ model: nativeModel, prompt: text, ...(input.signal === undefined ? {} : { signal: input.signal }), ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }) }, gatewayDependencies)
    return { bytes: Buffer.from(result.image.base64, "base64"), mediaType: result.image.mediaType, provider: selected, model: result.model, requestId: result.requestId, warnings: result.warnings }
  }
  if (selected === "openai") {
    const size = prepared.size ?? invalid("The OpenAI image size was not validated.")
    const legacy = nativeModel === "dall-e-2" || nativeModel === "dall-e-3"
    const response = await request(selected, nativeModel, { model: nativeModel, prompt: text, n: 1, size, ...(legacy ? { response_format: "b64_json" } : { output_format: "png", quality: "high" }) }, input, dependencies)
    if (!Array.isArray(response.body.data) || response.body.data.length !== 1 || !object(response.body.data[0])) invalidResponse()
    const image = inlineImage(response.body.data[0].b64_json, "image/png")
    return { ...image, provider: selected, model: nativeModel, requestId: response.requestId, warnings: [] }
  }
  const resolution = nativeModel.replace(/-preview$/u, "") === "gemini-2.5-flash-image" ? undefined : input.resolution
  const response = await request(selected, nativeModel, {
    contents: geminiContents(text, images),
    generationConfig: { candidateCount: 1, responseModalities: ["TEXT", "IMAGE"], ...(input.aspectRatio === undefined && resolution === undefined ? {} : { imageConfig: { ...(input.aspectRatio === undefined ? {} : { aspectRatio: input.aspectRatio }), ...(resolution === undefined ? {} : { imageSize: resolution }) } }) },
  }, input, dependencies)
  const parts = geminiParts(response.body).filter(part => part.thought !== true)
  const outputs = parts.filter(part => part.inlineData !== undefined)
  if (outputs.length !== 1 || !object(outputs[0]?.inlineData)) invalidResponse()
  const image = inlineImage(outputs[0].inlineData.data, outputs[0].inlineData.mimeType)
  const warnings = parts.flatMap(part => typeof part.text === "string" && part.text.length > 0 ? [`provider-text ${digest(part.text)}`] : [])
  return { ...image, provider: selected, model: nativeModel, requestId: response.requestId, warnings }
}

/** JSON vision judgment is a separate cloud upload; the prompt must request JSON. */
export async function judgeSlopcameraProviderImages(input: JudgeSlopcameraProviderImagesInput, dependencies: SlopcameraImageProviderDependencies = {}): Promise<JudgedSlopcameraProviderImages> {
  if (!object(input)) invalid("Image judgment input must be an object.")
  const selected = provider(input.provider)
  if (selected !== "vertex" && selected !== "google") invalid("Image judgment requires vertex or google.")
  const nativeModel = model(input.model, selected)
  const text = prompt(input.prompt)
  const images = references(input.images, input.allowCloudUpload)
  if (images.length === 0 || input.allowCloudUpload !== true) invalid("Image judgment requires images and allowCloudUpload: true.")
  const response = await request(selected, nativeModel, { contents: geminiContents(text, images), generationConfig: { candidateCount: 1, responseModalities: ["TEXT"], responseMimeType: "application/json", maxOutputTokens: 8192 } }, input, dependencies)
  const parts = geminiParts(response.body).filter(part => part.thought !== true)
  if (parts.some(part => part.inlineData !== undefined)) invalidResponse()
  const result = parts.flatMap(part => typeof part.text === "string" ? [part.text] : []).join("\n")
  if (result.trim().length === 0 || Buffer.byteLength(result, "utf8") > maximumJudgeTextBytes) invalidResponse()
  return { text: result, requestId: response.requestId, provider: selected, model: nativeModel }
}
