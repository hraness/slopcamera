import { expect, test } from "bun:test"
import fc from "fast-check"
import {
  generateSlopcameraProviderImage,
  slopcameraImageProviderCredentialStatus,
  type SlopcameraImageProvider,
} from "./image-provider.ts"

const image = Uint8Array.from([82, 73, 70, 70, 8, 0, 0, 0, 87, 69, 66, 80, 86, 80, 56, 88])
const nativeModel = fc.array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789-_"), { minLength: 3, maxLength: 64 }).map(value => `gemini-${value.join("")}`)

test("native model IDs never escape fixed Google provider origins or introduce query credentials", async () => {
  await fc.assert(fc.asyncProperty(fc.constantFrom("vertex", "google"), nativeModel, async (selected, model) => {
    let count = 0
    const result = await generateSlopcameraProviderImage({ provider: selected as "vertex" | "google", model, prompt: "A future landscape" }, {
      environment: { VERTEX_API_KEY: "vertex-property-test-key", GEMINI_API_KEY: "google-property-test-key" },
      fetch: async url => {
        count++
        const target = new URL(String(url))
        expect(target.origin).toBe(selected === "vertex" ? "https://aiplatform.googleapis.com" : "https://generativelanguage.googleapis.com")
        expect(target.search).toBe("")
        expect(target.username).toBe("")
        expect(target.password).toBe("")
        expect(target.pathname.endsWith(`/${model}:generateContent`)).toBe(true)
        return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/webp", data: Buffer.from(image).toString("base64") } }] } }] })
      },
    })
    expect(count).toBe(1)
    expect(result.bytes).toEqual(image)
  }), { numRuns: 100 })
})

test("credential status never serializes any environment value", () => {
  const providers = fc.constantFrom<SlopcameraImageProvider>("vertex", "google", "openai", "gateway")
  const arbitraryValue = fc.string({ minLength: 1, maxLength: 80 }).map(value => `private-value-${value}`)
  fc.assert(fc.property(providers, arbitraryValue, (selected, value) => {
    const status = slopcameraImageProviderCredentialStatus(selected, { VERTEX_API_KEY: value, GEMINI_API_KEY: value, OPENAI_API_KEY: value, AI_GATEWAY_API_KEY: value })
    expect(Object.keys(status).sort()).toEqual(["available", "source"])
    expect(JSON.stringify(status)).not.toContain(value)
  }), { numRuns: 100 })
})

test("arbitrary transport exception text stays outside public errors and no retry occurs", async () => {
  await fc.assert(fc.asyncProperty(fc.string({ maxLength: 256 }), async secret => {
    let count = 0
    let message = ""
    try {
      await generateSlopcameraProviderImage({ provider: "vertex", model: "gemini-3-pro-image", prompt: "A future landscape" }, {
        environment: { VERTEX_API_KEY: "vertex-property-test-key" },
        fetch: async () => { count++; throw new Error(`private-transport-detail:${secret}`) },
      })
    } catch (error) { message = String(error) }
    expect(count).toBe(1)
    expect(message).toBe("SlopcameraCloudError: [GENERATION_FAILED] Image provider generation failed; the request was not retried.")
  }), { numRuns: 100 })
})
