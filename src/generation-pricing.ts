/**
 * Provider list prices for the image models Slopcamera can bill, and the
 * cost of one Vercel AI Gateway image call derived from them.
 *
 * The AI Gateway charges the provider's list price with no markup
 * (https://vercel.com/docs/ai-gateway/pricing, checked 2026-09-26), so the
 * OpenAI and Recraft list prices below are what one call costs. Every price
 * is integer micro-USD.
 *
 * A request never sets size or quality, so OpenAI chooses them ("auto"). The
 * worst case is therefore the highest quality at the largest size, plus the
 * prompt's text input tokens. Slopcamera never sends reference or edit
 * images, so every input token is a text token.
 */

export type ProviderCostBasis = "reported" | "contractual" | "estimated" | "unknown"

/** One provider cost line, in the shape Hraness Credits accepts. */
export interface SlopcameraProviderCost {
  readonly provider: string
  readonly operation: string
  readonly microUsd: number
  readonly basis: ProviderCostBasis
}

/** Token counts a Gateway image call returned, as the AI SDK reports them. */
export interface SlopcameraImageUsage {
  readonly inputTokens?: number | undefined
  readonly outputTokens?: number | undefined
}

interface TokenPricedImageModel {
  readonly kind: "tokens"
  /** Text input tokens, micro-USD per million. */
  readonly textInputPerMillion: number
  /**
   * Output tokens, micro-USD per million. This is the image output rate,
   * which is the highest output rate the model has, so it also bounds any
   * text output tokens.
   */
  readonly outputPerMillion: number
  /** OpenAI's published price for one high-quality 1024x1536 image. */
  readonly worstImage: number
  readonly source: string
}

interface ImagePricedModel {
  readonly kind: "image"
  /** Flat price for one image in the style Slopcamera requests (none). */
  readonly perImage: number
  readonly source: string
}

export type SlopcameraImageModelPrice = TokenPricedImageModel | ImagePricedModel

export const slopcameraProviderPricesCheckedAt = "2026-09-26"

/**
 * Cited list prices. A model without an entry here cannot be billed: the
 * hosted service refuses it before any hold.
 */
export const slopcameraImageModelPrices: Readonly<
  Record<string, SlopcameraImageModelPrice>
> = Object.freeze({
  "openai/gpt-image-1": Object.freeze({
    kind: "tokens",
    textInputPerMillion: 5_000_000,
    outputPerMillion: 40_000_000,
    worstImage: 250_000,
    source: "https://developers.openai.com/api/docs/models/gpt-image-1",
  }),
  "openai/gpt-image-1-mini": Object.freeze({
    kind: "tokens",
    textInputPerMillion: 2_000_000,
    outputPerMillion: 8_000_000,
    worstImage: 52_000,
    source: "https://developers.openai.com/api/docs/models/gpt-image-1-mini",
  }),
  "openai/gpt-image-1.5": Object.freeze({
    kind: "tokens",
    textInputPerMillion: 5_000_000,
    outputPerMillion: 32_000_000,
    worstImage: 200_000,
    source: "https://developers.openai.com/api/docs/models/gpt-image-1.5",
  }),
  "recraft/recraft-v4.1-utility": Object.freeze({
    kind: "image",
    perImage: 35_000,
    source: "https://vercel.com/ai-gateway/models/recraft-v4.1-utility",
  }),
})

/**
 * Tokens allowed on top of the prompt's UTF-8 byte count when no usage came
 * back. A byte-level BPE token covers at least one byte, so the byte count
 * bounds the prompt's own tokens; the allowance covers request framing.
 */
export const slopcameraPromptTokenAllowance = 64

export const slopcameraCostProvider = "vercel-ai-gateway"

export function slopcameraImageModelPrice(
  model: string,
): SlopcameraImageModelPrice | undefined {
  return Object.hasOwn(slopcameraImageModelPrices, model)
    ? slopcameraImageModelPrices[model]
    : undefined
}

function tokenCost(tokens: number, perMillion: number): number {
  // Round up so a partial micro-dollar is never dropped.
  return Math.ceil((tokens * perMillion) / 1_000_000)
}

function promptBytes(prompt: string): number {
  return Buffer.byteLength(prompt, "utf8")
}

function validTokenCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
}

/**
 * The most one image call for this model and prompt can cost: highest
 * quality at the largest size, and every prompt byte counted as a token.
 */
export function worstCaseImageCostMicroUsd(
  model: string,
  prompt: string,
): number | undefined {
  const price = slopcameraImageModelPrice(model)
  if (price === undefined) return undefined
  if (price.kind === "image") return price.perImage
  return (
    price.worstImage +
    tokenCost(
      promptBytes(prompt) + slopcameraPromptTokenAllowance,
      price.textInputPerMillion,
    )
  )
}

function estimatedLines(
  model: string,
  prompt: string,
  price: SlopcameraImageModelPrice,
): SlopcameraProviderCost[] {
  if (price.kind === "image") {
    return [{
      provider: slopcameraCostProvider,
      operation: `${model} image`,
      microUsd: price.perImage,
      basis: "estimated",
    }]
  }
  return [
    {
      provider: slopcameraCostProvider,
      operation: `${model} image output`,
      microUsd: price.worstImage,
      basis: "estimated",
    },
    {
      provider: slopcameraCostProvider,
      operation: `${model} text input`,
      microUsd: tokenCost(
        promptBytes(prompt) + slopcameraPromptTokenAllowance,
        price.textInputPerMillion,
      ),
      basis: "estimated",
    },
  ]
}

/**
 * Cost lines for one image call that reached the provider. Returned usage
 * prices the call at the official per-token rates (basis "reported");
 * without usage, the worst case stands in (basis "estimated").
 */
export function imageCallCosts(
  model: string,
  prompt: string,
  usage: SlopcameraImageUsage | undefined,
): SlopcameraProviderCost[] {
  const price = slopcameraImageModelPrice(model)
  if (price === undefined) {
    return [{
      provider: slopcameraCostProvider,
      operation: `${model} image`,
      microUsd: 0,
      basis: "unknown",
    }]
  }
  if (
    price.kind === "tokens" &&
    usage !== undefined &&
    validTokenCount(usage.inputTokens) &&
    validTokenCount(usage.outputTokens) &&
    usage.outputTokens > 0
  ) {
    return [
      {
        provider: slopcameraCostProvider,
        operation: `${model} image output`,
        microUsd: tokenCost(usage.outputTokens, price.outputPerMillion),
        basis: "reported",
      },
      {
        provider: slopcameraCostProvider,
        operation: `${model} text input`,
        microUsd: tokenCost(usage.inputTokens, price.textInputPerMillion),
        basis: "reported",
      },
    ]
  }
  return estimatedLines(model, prompt, price)
}
