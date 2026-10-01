import { expect, test } from "bun:test"
import { mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"
import { generateSlopcameraProviderImageFile } from "./image-provider-file.js"
import { publishSlopcameraRetainedFile } from "./retained-file.js"

const input = { provider: "google" as const, model: "gemini-3-pro-image", prompt: "Orbital architecture", resolution: "2K" as const }
async function fixture() {
  const png = await sharp({ create: { width: 8, height: 8, channels: 4, background: "white" } }).png().toBuffer()
  let calls = 0
  return {
    count: () => calls,
    dependencies: {
      environment: { GEMINI_API_KEY: "inert-file-test-key" },
      fetch: async () => {
        calls++
        return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ inlineData: { mimeType: "image/png", data: png.toString("base64") } }] } }] })
      },
    },
  }
}
test("file generation checks prompt bounds before retaining any attempt", async () => {
  const root = await mkdtemp(join(tmpdir(), "slopcamera-provider-bound-"))
  try {
    const fake = await fixture()
    await expect(generateSlopcameraProviderImageFile({ ...input, prompt: "x".repeat(32769), outputPath: join(root, "output.png") }, fake.dependencies)).rejects.toThrow()
    expect(await readdir(root)).toEqual([])
    expect(fake.count()).toBe(0)
  } finally { await rm(root, { recursive: true, force: true }) }
})
test("a dangling output link or stale sidecar rejects before provider dispatch", async () => {
  const root = await mkdtemp(join(tmpdir(), "slopcamera-provider-existing-"))
  try {
    const fake = await fixture()
    const outputPath = join(root, "output.png")
    await symlink(join(root, "missing"), outputPath)
    await expect(generateSlopcameraProviderImageFile({ ...input, outputPath }, fake.dependencies)).rejects.toThrow("overwrite")
    await rm(outputPath)
    await writeFile(`${outputPath}.generated.jpg`, "retained original")
    await expect(generateSlopcameraProviderImageFile({ ...input, outputPath }, fake.dependencies)).rejects.toThrow("overwrite")
    expect(fake.count()).toBe(0)
    expect(await readFile(`${outputPath}.generated.jpg`, "utf8")).toBe("retained original")
  } finally { await rm(root, { recursive: true, force: true }) }
})
test("retains provider original, converts the selected format, and never resubmits the same identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "slopcamera-provider-output-"))
  try {
    const fake = await fixture()
    const outputPath = join(root, "output.webp")
    const result = await generateSlopcameraProviderImageFile({ ...input, outputPath }, fake.dependencies)
    expect((await sharp(await readFile(outputPath)).metadata()).format).toBe("webp")
    expect(result.source.path).toEndWith(".generated.png")
    expect(result.mediaType).toBe("image/webp")
    expect(await readFile(`${outputPath}.receipt.json`, "utf8")).not.toContain("inert-file-test-key")
    await expect(generateSlopcameraProviderImageFile({ ...input, outputPath }, fake.dependencies)).rejects.toThrow("overwrite")
    expect(fake.count()).toBe(1)
    expect((await readdir(root)).filter(path => path.endsWith(".tmp"))).toEqual([])
  } finally { await rm(root, { recursive: true, force: true }) }
})
test("atomic retained publication has one winner and preserves existing bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "slopcamera-retained-race-"))
  try {
    const target = join(root, "receipt.json")
    const results = await Promise.allSettled([publishSlopcameraRetainedFile(target, "first"), publishSlopcameraRetainedFile(target, "second")])
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1)
    expect(["first", "second"]).toContain(await readFile(target, "utf8"))
    expect(await readdir(root)).toEqual(["receipt.json"])
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("file attempts snapshot request fields and reference bytes before filesystem awaits", async () => {
  const root = await mkdtemp(join(tmpdir(), "slopcamera-provider-snapshot-"))
  try {
    const png = await sharp({ create: { width: 8, height: 8, channels: 4, background: "white" } }).png().toBuffer()
    const referenceBytes = Uint8Array.from(png)
    const outputPath = join(await realpath(root), "output.png")
    const request = { ...input, outputPath, references: [{ bytes: referenceBytes, mediaType: "image/png" as const }], allowCloudUpload: true }
    let calls = 0
    const pending = generateSlopcameraProviderImageFile(request, {
      environment: { GEMINI_API_KEY: "inert-snapshot-test-key" },
      fetch: async (_url, init) => {
        calls++
        const body = JSON.parse(init!.body as string) as { contents: { parts: { text?: string; inlineData?: { data: string } }[] }[] }
        const parts = body.contents[0]!.parts
        expect(parts.some(part => part.text === input.prompt)).toBe(true)
        expect(parts.find(part => part.inlineData !== undefined)!.inlineData!.data).toBe(png.toString("base64"))
        return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ inlineData: { mimeType: "image/png", data: png.toString("base64") } }] } }] })
      },
    })
    request.prompt = "Changed after the file attempt started"
    request.model = "gemini-3.1-flash-image"
    request.outputPath = join(root, "changed.png")
    referenceBytes.fill(0)
    const result = await pending
    expect(calls).toBe(1)
    expect(result.outputPath).toBe(outputPath)
    expect(result.model).toBe(input.model)
    const retained = JSON.parse(await readFile(`${outputPath}.request.json`, "utf8")) as { prompt: string; model: string }
    expect(retained.prompt).toBe(input.prompt)
    expect(retained.model).toBe(input.model)
    expect(await readdir(root)).not.toContain("changed.png")
  } finally { await rm(root, { recursive: true, force: true }) }
})
