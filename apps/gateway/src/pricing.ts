import type { CreditsCost } from "@hraness/credits-foundation/server"
import { slopcameraImageModels } from "../../../src/generate.js"

export type HostedImageModel = (typeof slopcameraImageModels)[number]

/**
 * Maximum per-image list price of each hosted model in integer micro-USD, read
 * from the provider's public price list on 2026-09-17 (largest size, highest
 * quality). Review these rows when the model allowlist or a price list changes.
 * They bound a hold before generation and stand in for the cost when the
 * Gateway reports none; the credits service, not this table, decides the price.
 */
export const hostedImageListPriceMicroUsd: Readonly<Record<HostedImageModel, number>> = Object.freeze({
  "openai/gpt-image-1.5": 250_000,
  "recraft/recraft-v4.1-utility": 40_000,
})

/** Percent applied to the list price when reserving a hold. */
export const holdCeilingUpliftPercent = 125
/** No hold reserves more than one dollar per image. */
export const holdCeilingCapMicroUsd = 1_000_000

export function isHostedImageModel(value: unknown): value is HostedImageModel {
  return typeof value === "string" && slopcameraImageModels.includes(value as HostedImageModel)
}

/** `min(ceil(list × 1.25), $1.00)` in micro-USD. */
export function holdCeilingMicroUsd(model: HostedImageModel): number {
  const list = hostedImageListPriceMicroUsd[model]
  const uplifted = Math.ceil((list * holdCeilingUpliftPercent) / 100)
  return Math.min(uplifted, holdCeilingCapMicroUsd)
}

/** The settlement cost row for a generation the Gateway did not price itself. */
export function listPriceCost(model: HostedImageModel): CreditsCost {
  return {
    provider: "vercel-ai-gateway",
    operation: "image_generate",
    microUsd: hostedImageListPriceMicroUsd[model],
    basis: "estimated",
  }
}
