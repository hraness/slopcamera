import { describe, expect, test } from "bun:test"
import {
  imageCallCosts,
  slopcameraImageModelPrices,
  slopcameraPromptTokenAllowance,
  worstCaseImageCostMicroUsd,
} from "./generation-pricing.ts"

const sum = (lines: ReadonlyArray<{ microUsd: number }>) =>
  lines.reduce((total, line) => total + line.microUsd, 0)

describe("Slopcamera provider pricing", () => {
  test("cites OpenAI list prices checked 2026-09-26", () => {
    // developers.openai.com/api/docs/models/<id>: text input per 1M, image
    // output per 1M, and the high-quality 1024x1536 per-image price.
    expect(slopcameraImageModelPrices["openai/gpt-image-1"]).toMatchObject({
      textInputPerMillion: 5_000_000,
      outputPerMillion: 40_000_000,
      worstImage: 250_000,
    })
    expect(slopcameraImageModelPrices["openai/gpt-image-1-mini"]).toMatchObject({
      textInputPerMillion: 2_000_000,
      outputPerMillion: 8_000_000,
      worstImage: 52_000,
    })
    expect(slopcameraImageModelPrices["openai/gpt-image-1.5"]).toMatchObject({
      textInputPerMillion: 5_000_000,
      outputPerMillion: 32_000_000,
      worstImage: 200_000,
    })
    expect(slopcameraImageModelPrices["recraft/recraft-v4.1-utility"]).toMatchObject({
      perImage: 35_000,
    })
  })

  test("the worst image covers the largest high-quality output in tokens", () => {
    // OpenAI bills a high 1024x1536 image as 6,240 output tokens; the
    // published per-image price rounds that bill up.
    for (const model of ["openai/gpt-image-1", "openai/gpt-image-1-mini", "openai/gpt-image-1.5"]) {
      const price = slopcameraImageModelPrices[model]
      if (price?.kind !== "tokens") throw new Error(model)
      expect(price.worstImage).toBeGreaterThanOrEqual(
        Math.ceil((6_240 * price.outputPerMillion) / 1_000_000),
      )
    }
  })

  test("the worst case counts the prompt's input tokens on top of the image", () => {
    const prompt = "a".repeat(1_000)
    expect(worstCaseImageCostMicroUsd("openai/gpt-image-1", prompt)).toBe(
      250_000 + Math.ceil(((1_000 + slopcameraPromptTokenAllowance) * 5_000_000) / 1_000_000),
    )
    // Multi-byte text is bounded by its UTF-8 byte count.
    expect(worstCaseImageCostMicroUsd("openai/gpt-image-1-mini", "é".repeat(100))).toBe(
      52_000 + Math.ceil(((200 + slopcameraPromptTokenAllowance) * 2_000_000) / 1_000_000),
    )
    expect(worstCaseImageCostMicroUsd("recraft/recraft-v4.1-utility", prompt)).toBe(35_000)
    expect(worstCaseImageCostMicroUsd("black-forest-labs/flux-schnell", prompt)).toBeUndefined()
    expect(worstCaseImageCostMicroUsd("toString", prompt)).toBeUndefined()
  })

  test("returned usage is priced per token as reported cost lines", () => {
    const lines = imageCallCosts("openai/gpt-image-1", "prompt", {
      inputTokens: 57,
      outputTokens: 4_160,
    })
    expect(lines).toEqual([
      {
        provider: "vercel-ai-gateway",
        operation: "openai/gpt-image-1 image output",
        microUsd: 166_400,
        basis: "reported",
      },
      {
        provider: "vercel-ai-gateway",
        operation: "openai/gpt-image-1 text input",
        microUsd: 285,
        basis: "reported",
      },
    ])
    // Partial micro-dollars round up, never down.
    expect(sum(imageCallCosts("openai/gpt-image-1-mini", "p", {
      inputTokens: 1,
      outputTokens: 1,
    }))).toBe(2 + 8)
  })

  test("missing or implausible usage falls back to the estimated worst case", () => {
    const prompt = "a lighthouse at dusk"
    const worst = worstCaseImageCostMicroUsd("openai/gpt-image-1.5", prompt)
    for (const usage of [
      undefined,
      {},
      { inputTokens: 10 },
      { inputTokens: 10, outputTokens: 0 },
      { inputTokens: -1, outputTokens: 100 },
      { inputTokens: 1.5, outputTokens: 100 },
    ]) {
      const lines = imageCallCosts("openai/gpt-image-1.5", prompt, usage)
      expect(lines.every(line => line.basis === "estimated")).toBe(true)
      expect(sum(lines)).toBe(worst ?? -1)
    }
    expect(imageCallCosts("recraft/recraft-v4.1-utility", prompt, {
      inputTokens: 1,
      outputTokens: 1,
    })).toEqual([{
      provider: "vercel-ai-gateway",
      operation: "recraft/recraft-v4.1-utility image",
      microUsd: 35_000,
      basis: "estimated",
    }])
  })

  test("an unpriced model reports an unknown cost instead of a guess", () => {
    expect(imageCallCosts("vendor/unpriced", "p", undefined)).toEqual([{
      provider: "vercel-ai-gateway",
      operation: "vendor/unpriced image",
      microUsd: 0,
      basis: "unknown",
    }])
  })

  test("cost operation names fit the Credits 64-character limit", () => {
    for (const model of Object.keys(slopcameraImageModelPrices)) {
      for (const line of imageCallCosts(model, "p", undefined)) {
        expect(line.operation.length).toBeLessThanOrEqual(64)
      }
    }
  })
})
