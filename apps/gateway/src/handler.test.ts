import { describe, expect, test } from "bun:test"
import type { CreditsFetch } from "@hraness/credits-foundation"
import { SlopcameraCloudError } from "../../../src/cloud-errors.js"
import { slopcameraMaximumPromptBytes, type GeneratedSlopcameraImage } from "../../../src/generate.js"
import {
  CREDITS_SUBJECT_HEADER,
  MAXIMUM_REQUEST_BYTES,
  createGatewayHandler,
  gatewayConfiguration,
} from "./handler.js"
import { holdCeilingCapMicroUsd, holdCeilingMicroUsd, hostedImageListPriceMicroUsd } from "./pricing.js"

const ORIGIN = "https://credits.hraness.com"
const PRODUCT_KEY = `cr_prod_${"C".repeat(43)}`
const DEVICE_TOKEN = `cr_dev_${"A".repeat(43)}`
const EXPIRES_AT = "2026-09-17T22:00:00Z"
const environment = {
  SLOPCAMERA_CREDITS_SERVICE_ORIGIN: ORIGIN,
  SLOPCAMERA_CREDITS_PRODUCT_KEY: PRODUCT_KEY,
  AI_GATEWAY_API_KEY: "operator-gateway-key-0001",
}
const webp = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x08, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58,
])
const packs = [
  { id: "p10", usd: 10, credits: 1000, bonusCredits: 0, label: "$10 pack" },
  { id: "p25", usd: 25, credits: 2500, bonusCredits: 150, label: "$25 pack" },
]
const holdBody = {
  holdId: "hold_1",
  ceilingMicroUsd: 312500,
  balance: { microUsd: 8_100_000, availableMicroUsd: 7_787_500 },
  expiresAt: EXPIRES_AT,
}
const settleBody = {
  holdId: "hold_1",
  state: "settled",
  chargedMicroUsd: 120_000,
  balance: { microUsd: 7_980_000, availableMicroUsd: 7_980_000 },
  lowBalance: false,
}
const releaseBody = { holdId: "hold_1", state: "released", balance: { microUsd: 8_100_000, availableMicroUsd: 8_100_000 } }
const shortfall = {
  error: "insufficient_credits",
  message: "Add credits to continue.",
  required: { microUsd: 312500, credits: 31, usd: "0.31" },
  balance: { microUsd: 0, credits: 0, usd: "0.00", availableMicroUsd: 0 },
  topup: { claimId: "clm_8f3k2q", url: `${ORIGIN}/t/clm_8f3k2q`, expiresAt: EXPIRES_AT, packs, suggestedPackId: "p25" },
}

interface Call {
  readonly url: string
  readonly headers: Readonly<Record<string, string>>
  readonly body: unknown
}
type Route = (call: Call) => Readonly<{ status: number; body: unknown }>

function creditsStub(route: Route): { fetch: CreditsFetch; calls: Call[] } {
  const calls: Call[] = []
  const fetch: CreditsFetch = async (url, init) => {
    const call = { url, headers: { ...init.headers }, body: init.body === undefined ? undefined : JSON.parse(init.body) }
    calls.push(call)
    const reply = route(call)
    if (reply.status === 0) throw new TypeError("fetch failed")
    return new Response(JSON.stringify(reply.body), {
      status: reply.status,
      headers: { "content-type": "application/json; charset=utf-8" },
    })
  }
  return { fetch, calls }
}

const ledger: Route = call => {
  if (call.url.endsWith("/v1/holds")) return { status: 201, body: holdBody }
  if (call.url.endsWith("/settle")) return { status: 200, body: settleBody }
  if (call.url.endsWith("/release")) return { status: 200, body: releaseBody }
  return { status: 404, body: { error: "not_found" } }
}

function generated(cost?: number): GeneratedSlopcameraImage {
  return {
    image: { base64: Buffer.from(webp).toString("base64"), mediaType: "image/webp" },
    model: "recraft/recraft-v4.1-utility",
    provider: "vercel-ai-gateway",
    requestId: `sha256:${"a".repeat(64)}`,
    warnings: [],
    ...(cost === undefined ? {} : { cost: { basis: "reported" as const, microUsd: cost } }),
  }
}

function request(body: unknown, headers: Record<string, string> = { [CREDITS_SUBJECT_HEADER]: DEVICE_TOKEN }, method = "POST"): Request {
  return new Request("https://gateway.slopcamera.com/v1/generate", {
    method,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
    ...(method === "POST" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
  })
}

const prompt = { model: "recraft/recraft-v4.1-utility", prompt: "one literal illustration" }

describe("hosted generation gateway", () => {
  test("holds, generates, and settles with the reported cost in that order", async () => {
    const credits = creditsStub(ledger)
    const prompts: string[] = []
    const handler = createGatewayHandler({
      environment,
      creditsFetch: credits.fetch,
      requestId: () => "11111111-1111-4111-8111-111111111111",
      generate: async input => {
        prompts.push(input.prompt)
        expect(credits.calls).toHaveLength(1)
        return generated(96_000)
      },
    })
    const response = await handler(request(prompt))
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    const body = await response.json()
    expect(body).toEqual({
      image: generated().image,
      model: "recraft/recraft-v4.1-utility",
      provider: "vercel-ai-gateway",
      requestId: `sha256:${"a".repeat(64)}`,
      warnings: [],
      credits: {
        holdId: "hold_1",
        chargedMicroUsd: 120_000,
        charged: { microUsd: 120_000, credits: 12, usd: "0.12" },
        balance: settleBody.balance,
        lowBalance: false,
        settled: true,
      },
    })
    expect(prompts).toEqual(["one literal illustration"])
    expect(credits.calls.map(call => call.url)).toEqual([`${ORIGIN}/v1/holds`, `${ORIGIN}/v1/holds/hold_1/settle`])
    expect(credits.calls[0]!.headers.authorization).toBe(`Bearer ${PRODUCT_KEY}`)
    expect(credits.calls[0]!.body).toEqual({
      subjectToken: DEVICE_TOKEN,
      operation: "image_generate",
      ceilingMicroUsd: holdCeilingMicroUsd("recraft/recraft-v4.1-utility"),
      idempotencyKey: "image_generate:11111111-1111-4111-8111-111111111111",
      context: { model: "recraft/recraft-v4.1-utility", requestId: "11111111-1111-4111-8111-111111111111" },
    })
    expect(credits.calls[1]!.body).toEqual({
      costs: [{ provider: "vercel-ai-gateway", operation: "image_generate", microUsd: 96_000, basis: "reported" }],
    })
    expect(JSON.stringify(credits.calls)).not.toContain("one literal illustration")
  })

  test("settles with the estimated list price when the Gateway reports no cost", async () => {
    const credits = creditsStub(ledger)
    const handler = createGatewayHandler({ environment, creditsFetch: credits.fetch, generate: async () => generated() })
    expect((await handler(request(prompt))).status).toBe(200)
    expect(credits.calls[1]!.body).toEqual({
      costs: [{
        provider: "vercel-ai-gateway",
        operation: "image_generate",
        microUsd: hostedImageListPriceMicroUsd["recraft/recraft-v4.1-utility"],
        basis: "estimated",
      }],
    })
  })

  test("releases the hold and charges nothing when generation fails", async () => {
    const credits = creditsStub(ledger)
    const handler = createGatewayHandler({
      environment,
      creditsFetch: credits.fetch,
      generate: async () => {
        throw new SlopcameraCloudError("GENERATION_FAILED", "Vercel AI Gateway image generation failed; the request was not retried.")
      },
    })
    const response = await handler(request(prompt))
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: "generation_failed",
      message: "[GENERATION_FAILED] Vercel AI Gateway image generation failed; the request was not retried. Nothing was charged.",
    })
    expect(credits.calls.map(call => call.url)).toEqual([`${ORIGIN}/v1/holds`, `${ORIGIN}/v1/holds/hold_1/release`])
  })

  test("passes the service's insufficient_credits envelope through as credits_required", async () => {
    const credits = creditsStub(() => ({ status: 402, body: shortfall }))
    let generations = 0
    const handler = createGatewayHandler({
      environment,
      creditsFetch: credits.fetch,
      generate: async () => {
        generations += 1
        return generated()
      },
    })
    const response = await handler(request(prompt))
    expect(response.status).toBe(402)
    expect(await response.json()).toEqual({
      error: "credits_required",
      message: `Slopcamera needs $0.31 in credits for hosted image generation; this device has $0.00 available. Add credits: ${ORIGIN}/t/clm_8f3k2q`,
      operation: "image_generate",
      reason: "insufficient_credits",
      required: { microUsd: 312500, credits: 31, usd: "0.31" },
      balance: { microUsd: 0, credits: 0, usd: "0.00", availableMicroUsd: 0 },
      topup: shortfall.topup,
    })
    expect(generations).toBe(0)
    expect(credits.calls).toHaveLength(1)
  })

  test("answers a missing or malformed device token with credits_required before any hold", async () => {
    const credits = creditsStub(ledger)
    const handler = createGatewayHandler({ environment, creditsFetch: credits.fetch, generate: async () => generated() })
    const missing = await handler(request(prompt, {}))
    expect(missing.status).toBe(402)
    expect(await missing.json()).toMatchObject({ error: "credits_required", reason: "subject_missing", operation: "image_generate" })
    const malformed = await handler(request(prompt, { [CREDITS_SUBJECT_HEADER]: "cr_dev_short" }))
    expect(malformed.status).toBe(402)
    expect(await malformed.json()).toMatchObject({ error: "credits_required", reason: "subject_rejected" })
    const rejected = await createGatewayHandler({
      environment,
      creditsFetch: creditsStub(() => ({ status: 404, body: { error: "not_found" } })).fetch,
      generate: async () => generated(),
    })(request(prompt))
    expect(rejected.status).toBe(402)
    expect(await rejected.json()).toMatchObject({ error: "credits_required", reason: "subject_rejected" })
    expect(credits.calls).toHaveLength(0)
  })

  test("admits only the CLI's model allowlist and bounded prompts", async () => {
    const credits = creditsStub(ledger)
    const handler = createGatewayHandler({ environment, creditsFetch: credits.fetch, generate: async () => generated() })
    const foreignModel = await handler(request({ model: "openai/dall-e-3", prompt: "x" }))
    expect(foreignModel.status).toBe(400)
    expect(await foreignModel.json()).toMatchObject({ error: "unsupported_model" })
    const extraKey = await handler(request({ ...prompt, n: 4 }))
    expect(extraKey.status).toBe(400)
    const control = await handler(request({ model: prompt.model, prompt: "badprompt" }))
    expect(control.status).toBe(400)
    const long = await handler(request({ model: prompt.model, prompt: "p".repeat(slopcameraMaximumPromptBytes + 1) }))
    expect(long.status).toBe(400)
    expect(credits.calls).toHaveLength(0)
  })

  test("bounds request bytes by declared length and by streamed length", async () => {
    const credits = creditsStub(ledger)
    const handler = createGatewayHandler({ environment, creditsFetch: credits.fetch, generate: async () => generated() })
    const declared = await handler(new Request("https://gateway.slopcamera.com/v1/generate", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": String(MAXIMUM_REQUEST_BYTES + 1), [CREDITS_SUBJECT_HEADER]: DEVICE_TOKEN },
      body: "{}",
    }))
    expect(declared.status).toBe(413)
    const streamed = await handler(request(`{"model":"${prompt.model}","prompt":"${"p".repeat(MAXIMUM_REQUEST_BYTES)}"}`))
    expect(streamed.status).toBe(413)
    const wrongType = await handler(new Request("https://gateway.slopcamera.com/v1/generate", {
      method: "POST",
      headers: { "content-type": "text/plain", [CREDITS_SUBJECT_HEADER]: DEVICE_TOKEN },
      body: JSON.stringify(prompt),
    }))
    expect(wrongType.status).toBe(415)
    expect((await handler(request(prompt, {}, "GET"))).status).toBe(405)
    expect(credits.calls).toHaveLength(0)
  })

  test("returns the paid image when settlement cannot be confirmed and reports it", async () => {
    const credits = creditsStub(call => call.url.endsWith("/settle") ? { status: 0, body: undefined } : ledger(call))
    const lines: string[] = []
    const handler = createGatewayHandler({ environment, creditsFetch: credits.fetch, generate: async () => generated(), log: line => lines.push(line) })
    const response = await handler(request(prompt))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      credits: { holdId: "hold_1", chargedMicroUsd: 0, settled: false, balance: holdBody.balance },
    })
    expect(lines).toEqual(["gateway: hold hold_1 settle failed (unreachable); it expires on its own"])
  })

  test("refuses to run without complete configuration and never charges", async () => {
    const credits = creditsStub(ledger)
    for (const partial of [
      {},
      { ...environment, SLOPCAMERA_CREDITS_PRODUCT_KEY: "cr_dev_nope" },
      { ...environment, AI_GATEWAY_API_KEY: " short " },
      { ...environment, SLOPCAMERA_CREDITS_SERVICE_ORIGIN: "http://credits.example" },
    ]) {
      expect(gatewayConfiguration(partial)).toBeNull()
      const response = await createGatewayHandler({ environment: partial, creditsFetch: credits.fetch })(request(prompt))
      expect(response.status).toBe(503)
      expect(await response.json()).toMatchObject({ error: "service_unconfigured" })
    }
    expect(credits.calls).toHaveLength(0)
  })

  test("caps every hold ceiling at one dollar and uplifts the list price by a quarter", () => {
    expect(holdCeilingMicroUsd("recraft/recraft-v4.1-utility")).toBe(50_000)
    expect(holdCeilingMicroUsd("openai/gpt-image-1.5")).toBe(312_500)
    for (const model of Object.keys(hostedImageListPriceMicroUsd) as (keyof typeof hostedImageListPriceMicroUsd)[]) {
      expect(holdCeilingMicroUsd(model)).toBeLessThanOrEqual(holdCeilingCapMicroUsd)
      expect(holdCeilingMicroUsd(model)).toBeGreaterThanOrEqual(hostedImageListPriceMicroUsd[model])
    }
  })
})
