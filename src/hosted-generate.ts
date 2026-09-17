import { createHash } from "node:crypto"
import { readStoredDeviceToken } from "@hraness/credits-foundation/node"
import { isMicroUsd } from "@hraness/credits-foundation"
import { SlopcameraCloudError } from "./cloud-errors.js"
import {
  SLOPCAMERA_CREDITS_SUBJECT_HEADER,
  SlopcameraCreditsRequiredError,
  creditsProfile,
  parseSlopcameraCreditsRequiredPayload,
} from "./credits.js"
import {
  isValidSlopcameraImageBytes,
  isValidSlopcameraPrompt,
  slopcameraImageModels,
  slopcameraMaximumRawImageBytes,
  slopcameraOutputMediaType,
  slopcameraResponseMediaTypes,
  validateSlopcameraOutputPath,
  writeSlopcameraImageAtomically,
  type GeneratedSlopcameraImageFile,
  type SlopcameraResponseMediaType,
} from "./generate.js"
import { SLOPCAMERA_VERSION } from "./version.js"

/** The Hraness-operated gateway that meters hosted generation through credits. */
export const slopcameraHostedGatewayOrigin = "https://gateway.slopcamera.com" as const
export const slopcameraHostedGeneratePath = "/v1/generate" as const
export const slopcameraGenerationModes = Object.freeze(["direct", "hosted"] as const)
export type SlopcameraGenerationMode = (typeof slopcameraGenerationModes)[number]

const defaultHostedTimeoutMs = 5 * 60_000
const maximumHostedTimeoutMs = 30 * 60_000
const defaultMaximumHostedResponseBytes = 96 * 1024 * 1024
const maximumErrorBodyBytes = 64 * 1024
const userAgent = `slopcamera/${SLOPCAMERA_VERSION} (hosted)`

type SlopcameraEnvironment = Readonly<Record<string, string | undefined>>
type HostedFetch = (input: string | URL, init?: RequestInit) => Promise<Response>

export interface SlopcameraHostedCreditsReceipt {
  readonly holdId: string
  readonly chargedMicroUsd: number
  readonly charged: Readonly<{ microUsd: number; credits: number; usd: string }>
  readonly balance: Readonly<{ microUsd: number; availableMicroUsd: number }>
  readonly lowBalance: boolean
  /** False when the gateway could not confirm settlement; the hold then expires without a charge. */
  readonly settled: boolean
}

export interface HostedGeneratedSlopcameraImageFile extends GeneratedSlopcameraImageFile {
  readonly route: "hosted"
  readonly credits: SlopcameraHostedCreditsReceipt
}

export interface GenerateSlopcameraImageHostedInput {
  readonly model: string
  readonly prompt: string
  readonly outputPath: string
  readonly signal?: AbortSignal
  readonly timeoutMs?: number
}

export interface SlopcameraHostedGenerateDependencies {
  readonly environment?: SlopcameraEnvironment
  readonly fetch?: HostedFetch
  readonly maximumResponseBytes?: number
  /** Overrides the stored credits device token; null sends none. Tests inject this so no real state is read. */
  readonly subjectToken?: string | null
  /** Overrides the credits state directory read for the device token. */
  readonly stateDirectory?: string
}

function invalidArgument(message: string): never {
  throw new SlopcameraCloudError("INVALID_ARGUMENT", message)
}

/** `--hosted` or `SLOPCAMERA_GENERATION_MODE=hosted` selects the hosted route; anything else stays direct. */
export function resolveSlopcameraGenerationMode(
  env: SlopcameraEnvironment,
  hostedFlag: boolean,
): SlopcameraGenerationMode {
  if (hostedFlag) return "hosted"
  const configured = env.SLOPCAMERA_GENERATION_MODE
  if (configured === undefined || configured === "") return "direct"
  if (!slopcameraGenerationModes.includes(configured as SlopcameraGenerationMode)) {
    invalidArgument(`SLOPCAMERA_GENERATION_MODE must be one of: ${slopcameraGenerationModes.join(", ")}.`)
  }
  return configured as SlopcameraGenerationMode
}

/** The pinned gateway origin, or an https/loopback override for local testing. */
export function resolveSlopcameraHostedGatewayOrigin(env: SlopcameraEnvironment): string {
  const configured = env.SLOPCAMERA_HOSTED_GATEWAY_ORIGIN
  if (configured === undefined || configured === "") return slopcameraHostedGatewayOrigin
  let url: URL
  try {
    url = new URL(configured)
  } catch {
    invalidArgument("SLOPCAMERA_HOSTED_GATEWAY_ORIGIN must be an https origin.")
  }
  const loopback = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  if (
    (url.protocol !== "https:" && !loopback) || url.username !== "" || url.password !== ""
    || url.pathname !== "/" || url.search !== "" || url.hash !== "" || configured.length > 256
  ) {
    invalidArgument("SLOPCAMERA_HOSTED_GATEWAY_ORIGIN must be an https origin.")
  }
  return url.origin
}

function validateModel(value: unknown): string {
  if (typeof value !== "string" || !slopcameraImageModels.includes(value as (typeof slopcameraImageModels)[number])) {
    invalidArgument(`Hosted generation supports only: ${slopcameraImageModels.join(", ")}.`)
  }
  return value
}

function validateTimeout(value: number | undefined): number {
  const timeout = value ?? defaultHostedTimeoutMs
  if (!Number.isSafeInteger(timeout) || timeout < 1_000 || timeout > maximumHostedTimeoutMs) {
    invalidArgument(`timeoutMs must be an integer from 1000 through ${maximumHostedTimeoutMs}.`)
  }
  return timeout
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const present = Object.keys(value)
  return present.length === keys.length && keys.every(key => present.includes(key))
}

function invalidResponse(): never {
  throw new SlopcameraCloudError(
    "GENERATION_INVALID_RESPONSE",
    "The hosted gateway returned an invalid bounded response.",
  )
}

async function readBoundedBytes(response: Response, maximumBytes: number): Promise<Uint8Array> {
  const declared = response.headers.get("content-length")
  if (declared !== null) {
    const value = Number(declared)
    if (!Number.isSafeInteger(value) || value < 0 || value > maximumBytes) {
      await response.body?.cancel().catch(() => undefined)
      invalidResponse()
    }
  }
  if (response.body === null) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      length += next.value.byteLength
      if (length > maximumBytes) {
        await reader.cancel().catch(() => undefined)
        invalidResponse()
      }
      chunks.push(next.value)
    }
  } catch (error) {
    if (error instanceof SlopcameraCloudError) throw error
    invalidResponse()
  }
  return Buffer.concat(chunks)
}

function parseJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
  } catch {
    invalidResponse()
  }
}

function parseCreditsReceipt(value: unknown): SlopcameraHostedCreditsReceipt {
  if (!isRecord(value) || !exactKeys(value, ["holdId", "chargedMicroUsd", "charged", "balance", "lowBalance", "settled"])
    || typeof value.holdId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/u.test(value.holdId)
    || !isMicroUsd(value.chargedMicroUsd) || value.chargedMicroUsd < 0
    || typeof value.lowBalance !== "boolean" || typeof value.settled !== "boolean"
    || !isRecord(value.charged) || !exactKeys(value.charged, ["microUsd", "credits", "usd"])
    || !isMicroUsd(value.charged.microUsd) || !Number.isSafeInteger(value.charged.credits)
    || typeof value.charged.usd !== "string" || !/^-?\d{1,10}\.\d{2}$/u.test(value.charged.usd)
    || !isRecord(value.balance) || !exactKeys(value.balance, ["microUsd", "availableMicroUsd"])
    || !isMicroUsd(value.balance.microUsd) || !isMicroUsd(value.balance.availableMicroUsd)) {
    invalidResponse()
  }
  return Object.freeze({
    holdId: value.holdId,
    chargedMicroUsd: value.chargedMicroUsd,
    charged: Object.freeze({
      microUsd: value.charged.microUsd,
      credits: value.charged.credits as number,
      usd: value.charged.usd,
    }),
    balance: Object.freeze({ microUsd: value.balance.microUsd, availableMicroUsd: value.balance.availableMicroUsd }),
    lowBalance: value.lowBalance,
    settled: value.settled,
  })
}

interface HostedGeneration {
  readonly bytes: Uint8Array
  readonly mediaType: SlopcameraResponseMediaType
  readonly model: string
  readonly requestId: string
  readonly warnings: readonly string[]
  readonly credits: SlopcameraHostedCreditsReceipt
}

function parseGeneration(value: unknown, model: string): HostedGeneration {
  if (!isRecord(value) || !exactKeys(value, ["image", "model", "provider", "requestId", "warnings", "credits"])
    || value.model !== model || value.provider !== "vercel-ai-gateway"
    || typeof value.requestId !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(value.requestId)
    || !Array.isArray(value.warnings) || value.warnings.length > 100
    || !value.warnings.every(warning => typeof warning === "string" && warning.length <= 256 && !/[ -]/u.test(warning))
    || !isRecord(value.image) || !exactKeys(value.image, ["base64", "mediaType"])
    || typeof value.image.base64 !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/u.test(value.image.base64)
    || value.image.base64.length > Math.ceil(slopcameraMaximumRawImageBytes / 3) * 4
    || !slopcameraResponseMediaTypes.includes(value.image.mediaType as SlopcameraResponseMediaType)) {
    invalidResponse()
  }
  const mediaType = value.image.mediaType as SlopcameraResponseMediaType
  const bytes = new Uint8Array(Buffer.from(value.image.base64, "base64"))
  if (!isValidSlopcameraImageBytes(bytes, mediaType)) invalidResponse()
  return {
    bytes,
    mediaType,
    model,
    requestId: value.requestId,
    warnings: Object.freeze([...(value.warnings as string[])]),
    credits: parseCreditsReceipt(value.credits),
  }
}

async function storedSubjectToken(dependencies: SlopcameraHostedGenerateDependencies): Promise<string | null> {
  if (dependencies.subjectToken !== undefined) return dependencies.subjectToken
  const env = dependencies.environment ?? process.env
  const stored = await readStoredDeviceToken(creditsProfile(env), {
    env,
    ...(dependencies.stateDirectory === undefined ? {} : { stateDirectory: dependencies.stateDirectory }),
  })
  return stored.ok ? stored.value : null
}

function creditsRequired(body: Uint8Array): SlopcameraCreditsRequiredError {
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body))
  } catch {
    parsed = undefined
  }
  const payload = parseSlopcameraCreditsRequiredPayload(parsed)
  return new SlopcameraCreditsRequiredError(payload ?? {
    error: "credits_required",
    message: "Hosted generation needs prepaid credits. Run `slopcamera credits topup`, pay in your browser, then run `slopcamera credits wait` and rerun this command.",
    operation: "image_generate",
    reason: "insufficient_credits",
  })
}

function failureMessage(status: number, body: Uint8Array): string {
  let detail = ""
  try {
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body))
    if (isRecord(parsed) && typeof parsed.error === "string" && /^[a-z][a-z_]{0,63}$/u.test(parsed.error)) {
      detail = ` (${parsed.error})`
    }
  } catch {
    detail = ""
  }
  return `The hosted gateway answered HTTP ${status}${detail}; the request was not retried.`
}

/**
 * Generate one image through the Hraness-operated gateway. The gateway holds
 * and settles credits for the device token forwarded in the subject header;
 * the caller's own Gateway credential is never read on this route.
 */
export async function generateSlopcameraImageFileHosted(
  input: GenerateSlopcameraImageHostedInput,
  dependencies: SlopcameraHostedGenerateDependencies = {},
): Promise<HostedGeneratedSlopcameraImageFile> {
  const env = dependencies.environment ?? process.env
  const model = validateModel(input.model)
  if (!isValidSlopcameraPrompt(input.prompt)) {
    invalidArgument("Prompt must be non-empty and within the bounded UTF-8 budget.")
  }
  validateSlopcameraOutputPath(input.outputPath)
  const expected = slopcameraOutputMediaType(input.outputPath)
  const timeoutMs = validateTimeout(input.timeoutMs)
  const maximumResponseBytes = dependencies.maximumResponseBytes ?? defaultMaximumHostedResponseBytes
  if (!Number.isSafeInteger(maximumResponseBytes) || maximumResponseBytes < 1 || maximumResponseBytes > 1024 * 1024 * 1024) {
    invalidArgument("maximumResponseBytes is outside the supported range.")
  }
  const origin = resolveSlopcameraHostedGatewayOrigin(env)
  const token = await storedSubjectToken(dependencies)
  const signal = input.signal === undefined
    ? AbortSignal.timeout(timeoutMs)
    : AbortSignal.any([input.signal, AbortSignal.timeout(timeoutMs)])
  let response: Response
  try {
    response = await (dependencies.fetch ?? globalThis.fetch)(`${origin}${slopcameraHostedGeneratePath}`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json; charset=utf-8",
        "user-agent": userAgent,
        ...(token === null ? {} : { [SLOPCAMERA_CREDITS_SUBJECT_HEADER]: token }),
      },
      body: JSON.stringify({ model, prompt: input.prompt }),
      redirect: "error",
      signal,
    })
  } catch {
    throw new SlopcameraCloudError(
      "GENERATION_FAILED",
      "Hosted image generation failed before the gateway answered; the request was not retried.",
    )
  }
  if (response.status === 402) {
    throw creditsRequired(await readBoundedBytes(response, maximumErrorBodyBytes))
  }
  if (response.status !== 200) {
    const body = await readBoundedBytes(response, maximumErrorBodyBytes)
    throw new SlopcameraCloudError("GENERATION_FAILED", failureMessage(response.status, body))
  }
  const generated = parseGeneration(parseJson(await readBoundedBytes(response, maximumResponseBytes)), model)
  if (generated.mediaType !== expected) {
    throw new SlopcameraCloudError(
      "GENERATION_INVALID_RESPONSE",
      `Generated ${generated.mediaType} does not match the requested ${expected} output path.`,
    )
  }
  const outputPath = await writeSlopcameraImageAtomically(input.outputPath, generated.bytes)
  return {
    bytes: generated.bytes.byteLength,
    mediaType: generated.mediaType,
    model: generated.model,
    outputPath,
    provider: "vercel-ai-gateway",
    requestId: generated.requestId,
    sha256: createHash("sha256").update(generated.bytes).digest("hex"),
    warnings: generated.warnings,
    route: "hosted",
    credits: generated.credits,
  }
}
