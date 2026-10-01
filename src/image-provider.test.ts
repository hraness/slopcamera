import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { SlopcameraCloudError } from "./cloud-errors.ts"
import {
  generateSlopcameraProviderImage,
  judgeSlopcameraProviderImages,
  slopcameraImageProviderCredentialStatus,
  validateSlopcameraProviderImageInput,
  type GenerateSlopcameraProviderImageInput,
  type SlopcameraImageProviderDependencies,
} from "./image-provider.ts"

const webp = Uint8Array.from([82, 73, 70, 70, 8, 0, 0, 0, 87, 69, 66, 80, 86, 80, 56, 88])
const reference = { bytes: webp, mediaType: "image/webp" as const }
const secret = "provider-api-key-value-that-must-not-leak"
const imageInput: GenerateSlopcameraProviderImageInput = { provider: "vertex", model: "gemini-3-pro-image", prompt: "a detailed vertical future landscape" }

function imageBody(data: unknown = Buffer.from(webp).toString("base64")): object {
  return { candidates: [{ finishReason: "STOP", content: { parts: [{ inlineData: { mimeType: "image/webp", data } }] } }] }
}

function response(body: unknown = imageBody(), headers: ConstructorParameters<typeof Headers>[0] = {}): Response {
  const values = new Headers(headers)
  values.set("content-type", "application/json")
  return new Response(JSON.stringify(body), { headers: values })
}

function dependencies(fetch: NonNullable<SlopcameraImageProviderDependencies["fetch"]>, environment: SlopcameraImageProviderDependencies["environment"] = { VERTEX_API_KEY: secret }): SlopcameraImageProviderDependencies {
  return { fetch, ...(environment === undefined ? {} : { environment }) }
}

describe("direct image providers", () => {
  test("pure input preflight uses the same transport bounds without credentials or I/O", () => {
    expect(() => validateSlopcameraProviderImageInput({ ...imageInput, aspectRatio: "9:16", resolution: "2K" })).not.toThrow()
    expect(() => validateSlopcameraProviderImageInput({ ...imageInput, prompt: "x".repeat(32769) })).toThrow("INVALID_ARGUMENT")
    expect(() => validateSlopcameraProviderImageInput({ ...imageInput, model: "gemini-2.5-flash-image", resolution: "4K" })).toThrow("supports only 1K")
    expect(() => validateSlopcameraProviderImageInput({ ...imageInput, model: "gemini-3.1-flash-lite-image", resolution: "2K" })).toThrow("supports only 1K")
    expect(() => validateSlopcameraProviderImageInput({ ...imageInput, aspectRatio: "1:8" })).toThrow("not supported")
    expect(() => validateSlopcameraProviderImageInput({ ...imageInput, model: "gemini-3.1-flash-image", aspectRatio: "1:8", resolution: "4K" })).not.toThrow()
    expect(() => validateSlopcameraProviderImageInput({ ...imageInput, model: "unknown-image-model", resolution: "2K" })).toThrow("qualified Gemini")
    expect(() => validateSlopcameraProviderImageInput({ ...imageInput, provider: "openai", model: "gpt-image-1.5", resolution: "4K" })).toThrow("supports 1K")
    expect(() => validateSlopcameraProviderImageInput({ ...imageInput, references: [reference] })).toThrow("allowCloudUpload")
  })

  test("Vertex uses its fixed express endpoint, environment key header and native image options", async () => {
    let calls = 0
    const result = await generateSlopcameraProviderImage({ ...imageInput, aspectRatio: "9:16", resolution: "2K", references: [reference], allowCloudUpload: true }, dependencies(async (url, init) => {
      calls++
      expect(String(url)).toBe("https://aiplatform.googleapis.com/v1beta1/publishers/google/models/gemini-3-pro-image:generateContent")
      expect(String(url)).not.toContain(secret)
      expect(init?.redirect).toBe("error")
      expect(new Headers(init?.headers).get("x-goog-api-key")).toBe(secret)
      expect(JSON.parse(String(init?.body))).toEqual({
        contents: [{ role: "user", parts: [{ text: imageInput.prompt }, { inlineData: { mimeType: "image/webp", data: Buffer.from(webp).toString("base64") } }] }],
        generationConfig: { candidateCount: 1, responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: "9:16", imageSize: "2K" } },
      })
      return response(imageBody(), { "x-request-id": secret })
    }))
    expect(calls).toBe(1)
    expect(result.bytes).toEqual(webp)
    expect(result).toMatchObject({ mediaType: "image/webp", model: imageInput.model, provider: "vertex", requestId: `sha256:${createHash("sha256").update(secret).digest("hex")}`, warnings: [] })
    expect(JSON.stringify(result)).not.toContain(secret)
  })

  test("Google uses its own fixed endpoint and fallback API key", async () => {
    const result = await generateSlopcameraProviderImage({ ...imageInput, provider: "google" }, dependencies(async (url, init) => {
      expect(String(url)).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent")
      expect(new Headers(init?.headers).get("x-goog-api-key")).toBe(secret)
      return response()
    }, { GOOGLE_API_KEY: secret }))
    expect(result.provider).toBe("google")
    expect(result.requestId).toMatch(/^[a-f0-9-]{36}$/u)
  })

  test("credential status exposes availability and source names only, respecting explicit key precedence", () => {
    expect(slopcameraImageProviderCredentialStatus("vertex", { VERTEX_API_KEY: secret, GOOGLE_CLOUD_API_KEY: "fallback-provider-key" })).toEqual({ available: true, source: "VERTEX_API_KEY" })
    expect(slopcameraImageProviderCredentialStatus("vertex", { GOOGLE_CLOUD_API_KEY: secret })).toEqual({ available: true, source: "GOOGLE_CLOUD_API_KEY" })
    expect(slopcameraImageProviderCredentialStatus("google", { GEMINI_API_KEY: secret, GOOGLE_API_KEY: secret })).toEqual({ available: true, source: "GEMINI_API_KEY" })
    expect(slopcameraImageProviderCredentialStatus("openai", { OPENAI_API_KEY: secret })).toEqual({ available: true, source: "OPENAI_API_KEY" })
    expect(slopcameraImageProviderCredentialStatus("gateway", { VERCEL_OIDC_TOKEN: secret })).toEqual({ available: true, source: "VERCEL_OIDC_TOKEN" })
    expect(slopcameraImageProviderCredentialStatus("vertex", {})).toEqual({ available: false, source: null })
    expect(slopcameraImageProviderCredentialStatus("vertex", { VERTEX_API_KEY: "", GOOGLE_CLOUD_API_KEY: secret })).toEqual({ available: false, source: "VERTEX_API_KEY" })
  })

  test("missing or malformed credentials fail without provider I/O", async () => {
    let calls = 0
    for (const environment of [{}, { VERTEX_API_KEY: "short" }, { VERTEX_API_KEY: ` ${secret}` }, { VERTEX_API_KEY: `${secret}\n` }]) {
      await expect(generateSlopcameraProviderImage(imageInput, dependencies(async () => { calls++; return response() }, environment))).rejects.toThrow("AUTHENTICATION_REQUIRED")
    }
    expect(calls).toBe(0)
  })

  test("rejects injection, malformed options and unsupported reference upload before provider I/O", async () => {
    let calls = 0
    const invalidInputs: unknown[] = [
      { ...imageInput, provider: "other" }, { ...imageInput, model: "../../private" }, { ...imageInput, model: "gemini-3-pro-image?key=other" },
      { ...imageInput, prompt: " " }, { ...imageInput, prompt: "secret\u0000" }, { ...imageInput, prompt: "x".repeat(32769) },
      { ...imageInput, resolution: "8K" }, { ...imageInput, aspectRatio: "1:100" }, { ...imageInput, timeoutMs: 999 },
      { ...imageInput, references: [reference] }, { ...imageInput, references: Array.from({ length: 9 }, () => reference), allowCloudUpload: true },
      { ...imageInput, references: [{ bytes: webp, mediaType: "image/png" }], allowCloudUpload: true },
      { ...imageInput, allowCloudUpload: "true" }, { ...imageInput, signal: {} },
    ]
    for (const input of invalidInputs) await expect(generateSlopcameraProviderImage(input as GenerateSlopcameraProviderImageInput, dependencies(async () => { calls++; return response() }))).rejects.toThrow("INVALID_ARGUMENT")
    expect(calls).toBe(0)
  })

  test("snapshots references before async provider work", async () => {
    const mutable = Uint8Array.from(webp)
    await generateSlopcameraProviderImage({ ...imageInput, references: [{ ...reference, bytes: mutable }], allowCloudUpload: true }, dependencies(async (_url, init) => {
      mutable.fill(0)
      const body = JSON.parse(String(init?.body))
      expect(body.contents[0].parts[1].inlineData.data).toBe(Buffer.from(webp).toString("base64"))
      return response()
    }))
  })

  test("sanitizes transport failures including provider-shaped exceptions and performs no retries", async () => {
    let calls = 0
    let caught: unknown
    try {
      await generateSlopcameraProviderImage(imageInput, dependencies(async () => { calls++; throw new SlopcameraCloudError("GENERATION_FAILED", `secret ${secret}`) }))
    } catch (error) { caught = error }
    expect(calls).toBe(1)
    expect(caught).toBeInstanceOf(SlopcameraCloudError)
    expect(String(caught)).toContain("not retried")
    expect(String(caught)).not.toContain(secret)
    expect((caught as Error).cause).toBeUndefined()
  })

  test("sanitizes unsuccessful provider HTTP bodies without returning their message", async () => {
    for (const status of [400, 401, 403, 429, 500]) {
      await expect(generateSlopcameraProviderImage(imageInput, dependencies(async () => new Response(secret, { status })))).rejects.toThrow(`HTTP ${status}`)
    }
  })

  test("rejects provider redirects without following arbitrary URLs", async () => {
    let calls = 0
    await expect(generateSlopcameraProviderImage(imageInput, dependencies(async () => { calls++; return new Response(null, { status: 302, headers: { location: "https://untrusted.example/key" } }) }))).rejects.toThrow("redirect was rejected")
    expect(calls).toBe(1)
  })

  test("bounds declared and streamed response lengths", async () => {
    for (const value of ["1000", "-1", "invalid"]) {
      await expect(generateSlopcameraProviderImage(imageInput, { ...dependencies(async () => response(imageBody(), { "content-length": value })), maximumResponseBytes: 128 })).rejects.toThrow("GENERATION_INVALID_RESPONSE")
    }
    await expect(generateSlopcameraProviderImage(imageInput, { ...dependencies(async () => response()), maximumResponseBytes: 8 })).rejects.toThrow("GENERATION_INVALID_RESPONSE")
  })

  test("bounds response settings before I/O", async () => {
    let calls = 0
    for (const limit of [0, -1, 0.5, 100663297]) await expect(generateSlopcameraProviderImage(imageInput, { ...dependencies(async () => { calls++; return response() }), maximumResponseBytes: limit })).rejects.toThrow("INVALID_ARGUMENT")
    expect(calls).toBe(0)
  })

  test("redacts errors originating from the response stream", async () => {
    let caught: unknown
    try {
      await generateSlopcameraProviderImage(imageInput, dependencies(async () => new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.error(new SlopcameraCloudError("GENERATION_FAILED", secret)) } }))))
    } catch (error) { caught = error }
    expect(String(caught)).toContain("GENERATION_INVALID_RESPONSE")
    expect(String(caught)).not.toContain(secret)
  })

  test("rejects malformed JSON, empty or extra images, malformed base64, incorrect types and unfinished output", async () => {
    const bodies: unknown[] = [null, [], {}, { candidates: [] }, { candidates: [{ content: { parts: [] } }] }, imageBody("not-base64"), imageBody("YQ=="), { candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [] } }] }, { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: Buffer.from(webp).toString("base64") } }] } }] }]
    for (const body of bodies) await expect(generateSlopcameraProviderImage(imageInput, dependencies(async () => response(body)))).rejects.toThrow("GENERATION_INVALID_RESPONSE")
    await expect(generateSlopcameraProviderImage(imageInput, dependencies(async () => new Response(secret)))).rejects.toThrow("GENERATION_INVALID_RESPONSE")
    const duplicate = { candidates: [{ content: { parts: [1, 2].map(() => ({ inlineData: { mimeType: "image/webp", data: Buffer.from(webp).toString("base64") } })) } }] }
    await expect(generateSlopcameraProviderImage(imageInput, dependencies(async () => response(duplicate)))).rejects.toThrow("GENERATION_INVALID_RESPONSE")
  })

  test("does not return provider text, reasoning or secret identifiers as image warnings", async () => {
    const result = await generateSlopcameraProviderImage(imageInput, dependencies(async () => response({ responseId: secret, candidates: [{ content: { parts: [{ thought: true, text: secret }, { text: secret }, { inlineData: { mimeType: "image/webp", data: Buffer.from(webp).toString("base64") } }] } }] })))
    expect(JSON.stringify(result)).not.toContain(secret)
    expect(result.warnings).toEqual([`provider-text sha256:${createHash("sha256").update(secret).digest("hex")}`])
  })

  test("aborted callers fail before the paid request", async () => {
    let calls = 0
    await expect(generateSlopcameraProviderImage({ ...imageInput, signal: AbortSignal.abort(secret) }, dependencies(async () => { calls++; return response() }))).rejects.toThrow("cancelled")
    expect(calls).toBe(0)
  })

  test("cancellation settles a transport that ignores AbortSignal without retries", async () => {
    const controller = new AbortController()
    let calls = 0
    const pending = generateSlopcameraProviderImage({ ...imageInput, signal: controller.signal }, dependencies(async () => { calls++; controller.abort(secret); return await new Promise<Response>(() => undefined) }))
    await expect(pending).rejects.toThrow("cancelled")
    expect(calls).toBe(1)
  })

  test("deadlines settle a noncooperative transport", async () => {
    let calls = 0
    await expect(generateSlopcameraProviderImage({ ...imageInput, timeoutMs: 1000 }, dependencies(async () => { calls++; return await new Promise<Response>(() => undefined) }))).rejects.toThrow("deadline")
    expect(calls).toBe(1)
  })

  test("OpenAI requests bounded single-image generation and parses base64 without downloading URLs", async () => {
    const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])
    const result = await generateSlopcameraProviderImage({ ...imageInput, provider: "openai", model: "gpt-image-1.5", aspectRatio: "2:3" }, dependencies(async (url, init) => {
      expect(String(url)).toBe("https://api.openai.com/v1/images/generations")
      expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${secret}`)
      expect(JSON.parse(String(init?.body))).toEqual({ model: "gpt-image-1.5", prompt: imageInput.prompt, n: 1, size: "1024x1536", output_format: "png", quality: "high" })
      return response({ data: [{ b64_json: Buffer.from(png).toString("base64") }] })
    }, { OPENAI_API_KEY: secret }))
    expect(result).toMatchObject({ provider: "openai", mediaType: "image/png", model: "gpt-image-1.5", warnings: [] })
    expect(result.bytes).toEqual(png)
  })

  test("OpenAI rejects unsupported references, old-model resolutions, and URL-only outputs", async () => {
    let calls = 0
    const deps = dependencies(async () => { calls++; return response({ data: [{ url: "https://untrusted.example/image" }] }) }, { OPENAI_API_KEY: secret })
    await expect(generateSlopcameraProviderImage({ ...imageInput, provider: "openai", model: "gpt-image-1.5", references: [reference], allowCloudUpload: true }, deps)).rejects.toThrow("edits API")
    await expect(generateSlopcameraProviderImage({ ...imageInput, provider: "openai", model: "gpt-image-1.5", resolution: "4K" }, deps)).rejects.toThrow("supports 1K")
    expect(calls).toBe(0)
    await expect(generateSlopcameraProviderImage({ ...imageInput, provider: "openai", model: "gpt-image-1.5" }, deps)).rejects.toThrow("GENERATION_INVALID_RESPONSE")
    expect(calls).toBe(1)
  })

  test("Gateway delegates its established zero-retry generator and preserves default behavior", async () => {
    const result = await generateSlopcameraProviderImage({ provider: "gateway", model: "openai/gpt-image-1.5", prompt: imageInput.prompt }, {
      environment: { AI_GATEWAY_API_KEY: secret }, gateway: { loadRuntime: async () => ({ createGateway: () => ({ imageModel: value => value }), generateImage: async settings => { expect(settings.maxRetries).toBe(0); expect(settings.n).toBe(1); return { images: [{ uint8Array: webp, mediaType: "image/webp" }] } } }) },
    })
    expect(result.provider).toBe("gateway")
    expect(result.bytes).toEqual(webp)
  })

  test("Gateway rejects unsupported inputs rather than dropping requested composition options", async () => {
    await expect(generateSlopcameraProviderImage({ ...imageInput, provider: "gateway", model: "openai/gpt-image-1.5", aspectRatio: "9:16" }, { environment: {} })).rejects.toThrow("does not support")
  })
})

describe("direct vision image judge", () => {
  const input = { provider: "vertex" as const, model: "gemini-2.5-flash", prompt: "Return JSON containing the best candidate and reasons.", images: [reference], allowCloudUpload: true as const }

  test("requests separate bounded text judgment with explicit local image upload", async () => {
    const result = await judgeSlopcameraProviderImages(input, dependencies(async (url, init) => {
      expect(String(url)).toBe("https://aiplatform.googleapis.com/v1beta1/publishers/google/models/gemini-2.5-flash:generateContent")
      const body = JSON.parse(String(init?.body))
      expect(body.generationConfig).toEqual({ candidateCount: 1, responseModalities: ["TEXT"], responseMimeType: "application/json", maxOutputTokens: 8192 })
      expect(body.contents[0].parts).toHaveLength(2)
      return response({ candidates: [{ finishReason: "STOP", content: { parts: [{ thought: true, text: "private reasoning" }, { text: '{"winner":0}' }] } }] })
    }))
    expect(result).toMatchObject({ text: '{"winner":0}', provider: "vertex", model: "gemini-2.5-flash" })
  })

  test("requires a Gemini provider, nonempty images and upload consent before I/O", async () => {
    let calls = 0
    for (const invalid of [{ ...input, provider: "openai" }, { ...input, images: [] }, { ...input, allowCloudUpload: false }]) await expect(judgeSlopcameraProviderImages(invalid as typeof input, dependencies(async () => { calls++; return response() }))).rejects.toThrow("INVALID_ARGUMENT")
    expect(calls).toBe(0)
  })

  test("rejects unexpected image-only judgments and oversized text", async () => {
    await expect(judgeSlopcameraProviderImages(input, dependencies(async () => response()))).rejects.toThrow("GENERATION_INVALID_RESPONSE")
    await expect(judgeSlopcameraProviderImages(input, dependencies(async () => response({ candidates: [{ content: { parts: [{ text: "x".repeat(65537) }] } }] })))).rejects.toThrow("GENERATION_INVALID_RESPONSE")
  })
})
