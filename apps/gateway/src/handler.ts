import { randomUUID } from "node:crypto"
import {
  creditsFromMicroUsd,
  formatUsd,
  isCreditsDeviceToken,
  isCreditsOrigin,
  isCreditsProductKey,
  type CreditsFetch,
} from "@hraness/credits-foundation"
import {
  createCreditsClient,
  type CreditsClient,
  type CreditsClientError,
  type CreditsCost,
  type CreditsInsufficientError,
} from "@hraness/credits-foundation/server"
import { SlopcameraCloudError } from "../../../src/cloud-errors.js"
import {
  generateSlopcameraImage,
  isValidSlopcameraPrompt,
  slopcameraImageModels,
  slopcameraMaximumPromptBytes,
  type GeneratedSlopcameraImage,
} from "../../../src/generate.js"
import { holdCeilingMicroUsd, isHostedImageModel, listPriceCost, type HostedImageModel } from "./pricing.js"

/** Requests forward the stored credits device token in this header. */
export const CREDITS_SUBJECT_HEADER = "x-hraness-credits-subject"
export const CREDITS_PRODUCT_ID = "slopcamera"
export const IMAGE_GENERATE_OPERATION = "image_generate"
/** A prompt of 32 KiB plus the JSON envelope around it. */
export const MAXIMUM_REQUEST_BYTES = slopcameraMaximumPromptBytes + 4 * 1024
export const GATEWAY_ROUTE = "/v1/generate"

const TOPUP_COMMANDS = "Run `slopcamera credits topup`, pay in your browser, then run `slopcamera credits wait` and rerun this command."

type Environment = Readonly<Record<string, string | undefined>>
type Generate = (
  input: Readonly<{ model: string; prompt: string; signal?: AbortSignal }>,
) => Promise<GeneratedSlopcameraImage>

export interface GatewayConfiguration {
  readonly creditsOrigin: string
  readonly productKey: string
  readonly gatewayApiKey: string
}

export interface GatewayHandlerDependencies {
  readonly environment: Environment
  /** Transport for the credits service; tests inject an in-process stub. */
  readonly creditsFetch?: CreditsFetch
  /** Image generation; defaults to the SDK's direct Vercel AI Gateway path with the operator's key. */
  readonly generate?: Generate
  readonly requestId?: () => string
  /** Operational log line sink; never receives prompts or tokens. */
  readonly log?: (line: string) => void
}

export type CreditsRequiredReason = "insufficient_credits" | "subject_missing" | "subject_rejected"

interface Money {
  readonly microUsd: number
  readonly credits: number
  readonly usd: string
}

function money(microUsd: number): Money {
  return { microUsd, credits: creditsFromMicroUsd(microUsd), usd: formatUsd(microUsd) }
}

/** Both credits variables and the operator's Gateway key must be present and well formed. */
export function gatewayConfiguration(environment: Environment): GatewayConfiguration | null {
  const creditsOrigin = environment.SLOPCAMERA_CREDITS_SERVICE_ORIGIN
  const productKey = environment.SLOPCAMERA_CREDITS_PRODUCT_KEY
  const gatewayApiKey = environment.AI_GATEWAY_API_KEY
  if (!isCreditsOrigin(creditsOrigin) || !isCreditsProductKey(productKey)) return null
  if (
    typeof gatewayApiKey !== "string" || gatewayApiKey.length < 16 || gatewayApiKey.length > 16 * 1024
    || gatewayApiKey.trim() !== gatewayApiKey || /[^\x21-\x7e]/u.test(gatewayApiKey)
  ) return null
  return { creditsOrigin, productKey, gatewayApiKey }
}

function jsonResponse(status: number, body: unknown, stream = false): Response {
  const bytes = new TextEncoder().encode(`${JSON.stringify(body)}\n`)
  const headers = {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
  }
  if (!stream) return new Response(bytes, { status, headers })
  // Streaming keeps a large image body outside the platform's buffered response limit.
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  }), { status, headers })
}

function errorResponse(status: number, error: string, message: string, fields: Readonly<Record<string, unknown>> = {}): Response {
  return jsonResponse(status, { error, message, ...fields })
}

function creditsRequired(
  reason: CreditsRequiredReason,
  message: string,
  fields: Readonly<Record<string, unknown>> = {},
): Response {
  return errorResponse(402, "credits_required", message, { operation: IMAGE_GENERATE_OPERATION, reason, ...fields })
}

function insufficient(error: CreditsInsufficientError): Response {
  const required = money(error.required.microUsd)
  const balance = { ...money(error.balance.microUsd), availableMicroUsd: error.balance.availableMicroUsd }
  return creditsRequired(
    "insufficient_credits",
    `Slopcamera needs $${required.usd} in credits for hosted image generation; this device has $${formatUsd(balance.availableMicroUsd)} available. Add credits: ${error.topup.url}`,
    {
      required,
      balance,
      topup: {
        claimId: error.topup.claimId,
        url: error.topup.url,
        expiresAt: error.topup.expiresAt,
        packs: error.topup.packs,
        suggestedPackId: error.topup.suggestedPackId,
      },
    },
  )
}

function creditsServiceFailure(error: CreditsClientError): Response {
  if (error.code === "insufficient_credits" && error.status === 402) return insufficient(error as CreditsInsufficientError)
  if (error.status === 404) {
    return creditsRequired(
      "subject_rejected",
      `The credits service does not recognise this device's credits token. Run \`slopcamera credits signout\`, then ${TOPUP_COMMANDS.charAt(0).toLowerCase()}${TOPUP_COMMANDS.slice(1)}`,
    )
  }
  const status = error.status === 0 ? "" : `, HTTP ${error.status}`
  return errorResponse(503, "credits_unavailable", `The credits service failed while reserving credits (${error.code}${status}); nothing was charged.`)
}

async function readBoundedJson(request: Request): Promise<unknown | Response> {
  const type = (request.headers.get("content-type") ?? "").trim()
  if (!/^application\/json(?:\s*;.*)?$/iu.test(type)) {
    return errorResponse(415, "unsupported_media_type", "Send application/json.")
  }
  const declared = request.headers.get("content-length")
  if (declared !== null && (!/^\d{1,9}$/u.test(declared.trim()) || Number(declared) > MAXIMUM_REQUEST_BYTES)) {
    return errorResponse(413, "too_large", `Request bodies are limited to ${MAXIMUM_REQUEST_BYTES} bytes.`)
  }
  if (request.body === null) return errorResponse(400, "invalid_request", "A JSON body is required.")
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      length += next.value.byteLength
      if (length > MAXIMUM_REQUEST_BYTES) {
        await reader.cancel().catch(() => undefined)
        return errorResponse(413, "too_large", `Request bodies are limited to ${MAXIMUM_REQUEST_BYTES} bytes.`)
      }
      chunks.push(next.value)
    }
  } catch {
    return errorResponse(400, "invalid_request", "The request body could not be read.")
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))) as unknown
  } catch {
    return errorResponse(400, "invalid_request", "The request body must be valid JSON.")
  }
}

interface GenerationRequest {
  readonly model: HostedImageModel
  readonly prompt: string
}

function parseGenerationRequest(value: unknown): GenerationRequest | Response {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return errorResponse(400, "invalid_request", "The request body must be a JSON object.")
  }
  const keys = Object.keys(value)
  if (keys.length !== 2 || !keys.includes("model") || !keys.includes("prompt")) {
    return errorResponse(400, "invalid_request", "The request body must contain exactly model and prompt.")
  }
  const { model, prompt } = value as Record<string, unknown>
  if (!isHostedImageModel(model)) {
    return errorResponse(400, "unsupported_model", `Hosted generation supports only: ${slopcameraImageModels.join(", ")}.`)
  }
  if (!isValidSlopcameraPrompt(prompt)) {
    return errorResponse(400, "invalid_request", `Prompt must be non-empty and no more than ${slopcameraMaximumPromptBytes} UTF-8 bytes.`)
  }
  return { model, prompt }
}

function subjectToken(request: Request): string | null | Response {
  const value = request.headers.get(CREDITS_SUBJECT_HEADER)
  if (value === null || value.trim() === "") return null
  const token = value.trim()
  return isCreditsDeviceToken(token) ? token : creditsRequired(
    "subject_rejected",
    `This device's credits token is not usable. Run \`slopcamera credits signout\`, then ${TOPUP_COMMANDS.charAt(0).toLowerCase()}${TOPUP_COMMANDS.slice(1)}`,
  )
}

function generationFailure(error: unknown): Response {
  if (error instanceof SlopcameraCloudError) {
    if (error.code === "INVALID_ARGUMENT") return errorResponse(400, "invalid_request", error.message)
    return errorResponse(502, "generation_failed", `${error.message} Nothing was charged.`)
  }
  return errorResponse(502, "generation_failed", "Image generation failed; the request was not retried and nothing was charged.")
}

function settlementCosts(model: HostedImageModel, generated: GeneratedSlopcameraImage): readonly CreditsCost[] {
  return [generated.cost === undefined
    ? listPriceCost(model)
    : { provider: "vercel-ai-gateway", operation: IMAGE_GENERATE_OPERATION, microUsd: generated.cost.microUsd, basis: "reported" }]
}

export function createGatewayHandler(dependencies: GatewayHandlerDependencies): (request: Request) => Promise<Response> {
  const log = dependencies.log ?? (line => console.warn(line))
  const requestId = dependencies.requestId ?? randomUUID
  let cached: Readonly<{ configuration: GatewayConfiguration; client: CreditsClient; generate: Generate }> | null = null

  function resolve(): typeof cached {
    const configuration = gatewayConfiguration(dependencies.environment)
    if (configuration === null) return null
    if (cached !== null && cached.configuration.creditsOrigin === configuration.creditsOrigin
      && cached.configuration.productKey === configuration.productKey
      && cached.configuration.gatewayApiKey === configuration.gatewayApiKey) return cached
    const client = createCreditsClient({
      origin: configuration.creditsOrigin,
      productKey: configuration.productKey,
      ...(dependencies.creditsFetch === undefined ? {} : { fetch: dependencies.creditsFetch }),
    })
    const generate: Generate = dependencies.generate ?? (input => generateSlopcameraImage(input, {
      environment: { AI_GATEWAY_API_KEY: configuration.gatewayApiKey },
    }))
    cached = { configuration, client, generate }
    return cached
  }

  return async request => {
    if (request.method !== "POST") {
      return new Response(null, { status: 405, headers: { allow: "POST", "cache-control": "no-store" } })
    }
    const resolved = resolve()
    if (resolved === null) {
      return errorResponse(503, "service_unconfigured", "The hosted gateway is not configured.")
    }
    const body = await readBoundedJson(request)
    if (body instanceof Response) return body
    const parsed = parseGenerationRequest(body)
    if (parsed instanceof Response) return parsed
    const token = subjectToken(request)
    if (token instanceof Response) return token
    if (token === null) {
      return creditsRequired(
        "subject_missing",
        `Hosted generation is paid with prepaid credits, and this device has none set up. ${TOPUP_COMMANDS}`,
      )
    }
    const id = requestId()
    const hold = await resolved.client.hold({
      subjectToken: token,
      operation: IMAGE_GENERATE_OPERATION,
      ceilingMicroUsd: holdCeilingMicroUsd(parsed.model),
      idempotencyKey: `${IMAGE_GENERATE_OPERATION}:${id}`,
      context: { model: parsed.model, requestId: id },
    })
    if (!hold.ok) return creditsServiceFailure(hold.error)

    let generated: GeneratedSlopcameraImage
    try {
      generated = await resolved.generate({ model: parsed.model, prompt: parsed.prompt, signal: request.signal })
    } catch (error) {
      const release = await resolved.client.release(hold.value.holdId)
      if (!release.ok) log(`gateway: hold ${hold.value.holdId} release failed (${release.error.code}); it expires on its own`)
      return generationFailure(error)
    }

    const settlement = await resolved.client.settle(hold.value.holdId, { costs: settlementCosts(parsed.model, generated) })
    if (!settlement.ok) log(`gateway: hold ${hold.value.holdId} settle failed (${settlement.error.code}); it expires on its own`)
    const chargedMicroUsd = settlement.ok ? settlement.value.chargedMicroUsd : 0
    return jsonResponse(200, {
      image: generated.image,
      model: generated.model,
      provider: generated.provider,
      requestId: generated.requestId,
      warnings: generated.warnings,
      credits: {
        holdId: hold.value.holdId,
        chargedMicroUsd,
        charged: money(chargedMicroUsd),
        balance: settlement.ok ? settlement.value.balance : hold.value.balance,
        lowBalance: settlement.ok ? settlement.value.lowBalance : false,
        settled: settlement.ok,
      },
    }, true)
  }
}
