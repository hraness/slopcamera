import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SlopcameraCreditsRequiredError } from "./credits.ts"
import {
  generateSlopcameraImageFileHosted,
  resolveSlopcameraGenerationMode,
  resolveSlopcameraHostedGatewayOrigin,
  slopcameraHostedGatewayOrigin,
} from "./hosted-generate.ts"

const DEVICE_TOKEN = `cr_dev_${"A".repeat(43)}`
const webp = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x08, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58,
])
const credits = {
  holdId: "hold_1",
  chargedMicroUsd: 120_000,
  charged: { microUsd: 120_000, credits: 12, usd: "0.12" },
  balance: { microUsd: 7_980_000, availableMicroUsd: 7_980_000 },
  lowBalance: false,
  settled: true,
}
const generation = {
  image: { base64: Buffer.from(webp).toString("base64"), mediaType: "image/webp" },
  model: "recraft/recraft-v4.1-utility",
  provider: "vercel-ai-gateway",
  requestId: `sha256:${"a".repeat(64)}`,
  warnings: ["other sha256:" + "b".repeat(64)],
  credits,
}
const shortfall = {
  error: "credits_required",
  message: "Slopcamera needs $0.31 in credits for hosted image generation; this device has $0.00 available.",
  operation: "image_generate",
  reason: "insufficient_credits",
  required: { microUsd: 312500, credits: 31, usd: "0.31" },
  balance: { microUsd: 0, credits: 0, usd: "0.00", availableMicroUsd: 0 },
  topup: {
    claimId: "clm_8f3k2q",
    url: "https://credits.hraness.com/t/clm_8f3k2q",
    expiresAt: "2026-09-17T22:00:00Z",
    packs: [{ id: "p10", usd: 10, credits: 1000, bonusCredits: 0 }, { id: "p25", usd: 25, credits: 2500, bonusCredits: 150 }],
    suggestedPackId: "p25",
  },
}

interface Seen { url: string; init: RequestInit }

function stubFetch(status: number, body: unknown): { fetch: (input: string | URL, init?: RequestInit) => Promise<Response>; seen: Seen[] } {
  const seen: Seen[] = []
  return {
    seen,
    fetch: async (input, init) => {
      seen.push({ url: String(input), init: init ?? {} })
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } })
    },
  }
}

async function withOutput<T>(callback: (outputPath: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "slopcamera-hosted-"))
  try {
    return await callback(join(root, "illustration.webp"))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

describe("hosted image generation", () => {
  test("posts the direct request shape with the device token and writes the image atomically", async () => {
    const transport = stubFetch(200, generation)
    await withOutput(async outputPath => {
      const result = await generateSlopcameraImageFileHosted(
        { model: "recraft/recraft-v4.1-utility", prompt: "one literal illustration", outputPath },
        { environment: {}, fetch: transport.fetch, subjectToken: DEVICE_TOKEN },
      )
      expect(transport.seen).toHaveLength(1)
      expect(transport.seen[0]!.url).toBe(`${slopcameraHostedGatewayOrigin}/v1/generate`)
      expect(transport.seen[0]!.init.method).toBe("POST")
      expect(transport.seen[0]!.init.redirect).toBe("error")
      expect(transport.seen[0]!.init.headers).toEqual({
        accept: "application/json",
        "content-type": "application/json; charset=utf-8",
        "user-agent": "slopcamera/3.2.8 (hosted)",
        "x-hraness-credits-subject": DEVICE_TOKEN,
      })
      expect(JSON.parse(String(transport.seen[0]!.init.body))).toEqual({
        model: "recraft/recraft-v4.1-utility",
        prompt: "one literal illustration",
      })
      expect(result).toEqual({
        bytes: webp.byteLength,
        mediaType: "image/webp",
        model: "recraft/recraft-v4.1-utility",
        outputPath,
        provider: "vercel-ai-gateway",
        requestId: generation.requestId,
        sha256: new Bun.CryptoHasher("sha256").update(webp).digest("hex"),
        warnings: generation.warnings,
        route: "hosted",
        credits,
      })
      expect(new Uint8Array(await readFile(outputPath))).toEqual(webp)
    })
  })

  test("sends no subject header without a stored token and reads no Gateway credential", async () => {
    const transport = stubFetch(200, generation)
    await withOutput(async outputPath => {
      await generateSlopcameraImageFileHosted(
        { model: "recraft/recraft-v4.1-utility", prompt: "prompt", outputPath },
        { environment: { AI_GATEWAY_API_KEY: "never-sent-key-value" }, fetch: transport.fetch, subjectToken: null },
      )
      expect(Object.keys(transport.seen[0]!.init.headers as Record<string, string>)).not.toContain("x-hraness-credits-subject")
      expect(JSON.stringify(transport.seen)).not.toContain("never-sent-key-value")
    })
  })

  test("turns a 402 into a credits-required error carrying the payment payload", async () => {
    const transport = stubFetch(402, shortfall)
    await withOutput(async outputPath => {
      const failure = await generateSlopcameraImageFileHosted(
        { model: "recraft/recraft-v4.1-utility", prompt: "prompt", outputPath },
        { environment: {}, fetch: transport.fetch, subjectToken: DEVICE_TOKEN },
      ).catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(SlopcameraCreditsRequiredError)
      expect((failure as SlopcameraCreditsRequiredError).payload).toEqual(shortfall as never)
      await expect(readFile(outputPath)).rejects.toThrow()
    })
    const guidance = stubFetch(402, { error: "credits_required", message: "Set up credits first.", operation: "image_generate", reason: "subject_missing" })
    await withOutput(async outputPath => {
      const failure = await generateSlopcameraImageFileHosted(
        { model: "recraft/recraft-v4.1-utility", prompt: "prompt", outputPath },
        { environment: {}, fetch: guidance.fetch, subjectToken: null },
      ).catch((error: unknown) => error)
      expect((failure as SlopcameraCreditsRequiredError).payload).toEqual({
        error: "credits_required", message: "Set up credits first.", operation: "image_generate", reason: "subject_missing",
      })
    })
  })

  test("rejects foreign models locally, mismatched media types, and other gateway failures without retrying", async () => {
    await withOutput(async outputPath => {
      const transport = stubFetch(200, generation)
      await expect(generateSlopcameraImageFileHosted(
        { model: "openai/dall-e-3", prompt: "prompt", outputPath },
        { environment: {}, fetch: transport.fetch, subjectToken: DEVICE_TOKEN },
      )).rejects.toThrow("[INVALID_ARGUMENT]")
      expect(transport.seen).toHaveLength(0)
      await expect(generateSlopcameraImageFileHosted(
        { model: "recraft/recraft-v4.1-utility", prompt: "prompt", outputPath: outputPath.replace(/\.webp$/u, ".png") },
        { environment: {}, fetch: transport.fetch, subjectToken: DEVICE_TOKEN },
      )).rejects.toThrow("does not match the requested image/png")
      const failing = stubFetch(503, { error: "credits_unavailable", message: "later" })
      await expect(generateSlopcameraImageFileHosted(
        { model: "recraft/recraft-v4.1-utility", prompt: "prompt", outputPath },
        { environment: {}, fetch: failing.fetch, subjectToken: DEVICE_TOKEN },
      )).rejects.toThrow("[GENERATION_FAILED] The hosted gateway answered HTTP 503 (credits_unavailable); the request was not retried.")
      expect(failing.seen).toHaveLength(1)
      const tampered = stubFetch(200, { ...generation, image: { base64: Buffer.from("not an image at all").toString("base64"), mediaType: "image/webp" } })
      await expect(generateSlopcameraImageFileHosted(
        { model: "recraft/recraft-v4.1-utility", prompt: "prompt", outputPath },
        { environment: {}, fetch: tampered.fetch, subjectToken: DEVICE_TOKEN },
      )).rejects.toThrow("[GENERATION_INVALID_RESPONSE]")
      await expect(readFile(outputPath)).rejects.toThrow()
    })
  })

  test("selects the route from the flag or the environment and pins the gateway origin", () => {
    expect(resolveSlopcameraGenerationMode({}, false)).toBe("direct")
    expect(resolveSlopcameraGenerationMode({}, true)).toBe("hosted")
    expect(resolveSlopcameraGenerationMode({ SLOPCAMERA_GENERATION_MODE: "hosted" }, false)).toBe("hosted")
    expect(resolveSlopcameraGenerationMode({ SLOPCAMERA_GENERATION_MODE: "direct" }, false)).toBe("direct")
    expect(() => resolveSlopcameraGenerationMode({ SLOPCAMERA_GENERATION_MODE: "cloud" }, false)).toThrow("[INVALID_ARGUMENT]")
    expect(resolveSlopcameraHostedGatewayOrigin({})).toBe("https://gateway.slopcamera.com")
    expect(resolveSlopcameraHostedGatewayOrigin({ SLOPCAMERA_HOSTED_GATEWAY_ORIGIN: "http://127.0.0.1:4310" })).toBe("http://127.0.0.1:4310")
    expect(resolveSlopcameraHostedGatewayOrigin({ SLOPCAMERA_HOSTED_GATEWAY_ORIGIN: "https://gateway.example" })).toBe("https://gateway.example")
    for (const origin of ["http://gateway.example", "https://user:pw@gateway.example", "https://gateway.example/path", "ftp://x"]) {
      expect(() => resolveSlopcameraHostedGatewayOrigin({ SLOPCAMERA_HOSTED_GATEWAY_ORIGIN: origin })).toThrow("[INVALID_ARGUMENT]")
    }
  })
})
