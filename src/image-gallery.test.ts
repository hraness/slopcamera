import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"
import {
  composeSlopcameraImageGallery,
  galleryPromptFor,
  generateSlopcameraImageGallery,
  parseSlopcameraGalleryVary,
  planSlopcameraGallery,
  slopcameraGalleryLimits,
} from "./image-gallery.ts"
import type { GeneratedSlopcameraImage } from "./generate.ts"

async function fakePng(seed: number): Promise<Uint8Array> {
  return new Uint8Array(await sharp({
    create: {
      width: 64,
      height: 64,
      channels: 4,
      background: { r: (seed * 37) % 256, g: (seed * 91) % 256, b: (seed * 53) % 256, alpha: 255 },
    },
  }).png().toBuffer())
}

function fakeGenerate(): {
  calls: { model: string; prompt: string }[]
  generate: (input: { model: string; prompt: string }) => Promise<GeneratedSlopcameraImage>
} {
  const calls: { model: string; prompt: string }[] = []
  return {
    calls,
    generate: async input => {
      calls.push({ model: input.model, prompt: input.prompt })
      const bytes = await fakePng(calls.length)
      return {
        image: { base64: Buffer.from(bytes).toString("base64"), mediaType: "image/png" },
        model: input.model,
        provider: "vercel-ai-gateway",
        requestId: `sha256:${"0".repeat(56)}${String(calls.length).padStart(8, "0")}`,
        warnings: [],
      }
    },
  }
}

describe("gallery prompt contracts", () => {
  test("locks the kind contract and appends the variation direction", () => {
    const texture = galleryPromptFor("wet cobblestone", "texture", "warm earthy palette")
    expect(texture).toContain("Seamless tileable texture of wet cobblestone")
    expect(texture).toContain("no shadows")
    expect(texture).toContain("Variation direction: warm earthy palette.")
    const skybox = galleryPromptFor("a desert mesa horizon", "skybox")
    expect(skybox).toContain("equirectangular")
    expect(skybox).toContain("horizon")
    expect(skybox).not.toContain("Variation direction")
  })
})

describe("gallery planning", () => {
  test("produces deterministic count candidates when no axes or list are given", () => {
    const plan = planSlopcameraGallery({ subject: "basalt", kind: "texture", count: 3 })
    expect(plan.candidates.map(candidate => candidate.id)).toEqual([
      "candidate-1", "candidate-2", "candidate-3",
    ])
    expect(plan.aspect).toEqual([1, 1])
    expect(new Set(plan.candidates.map(candidate => candidate.prompt)).size).toBe(1)
  })

  test("expands vary axes into a deterministic cartesian product", () => {
    const plan = planSlopcameraGallery({
      subject: "basalt",
      kind: "texture",
      vary: [
        { axis: "palette", values: ["warm", "cool"] },
        { axis: "detail", values: ["sparse", "dense"] },
      ],
    })
    expect(plan.candidates).toHaveLength(4)
    expect(plan.candidates.map(candidate => candidate.id)).toEqual([
      "warm-sparse", "warm-dense", "cool-sparse", "cool-dense",
    ])
    expect(plan.candidates[0]!.prompt).toContain("palette: warm; detail: sparse")
    expect(plan.axes.map(axis => axis.axis)).toEqual(["palette", "detail"])
  })

  test("bare axes use the kind vocabulary within the candidate bound", () => {
    const plan = planSlopcameraGallery({ subject: "sky", kind: "skybox", vary: ["lighting"] })
    expect(plan.candidates).toHaveLength(4)
    expect(plan.aspect).toEqual([2, 1])
    expect(plan.candidates[0]!.prompt).toContain("lighting: golden hour")
  })

  test("explicit candidates accept prompt or variant and reject ambiguity", () => {
    const plan = planSlopcameraGallery({
      subject: "panel",
      kind: "image",
      candidates: [
        { id: "flat", prompt: "a flat gray panel" },
        { id: "warm", variant: "warm palette" },
      ],
    })
    expect(plan.candidates[0]!.prompt).toBe("a flat gray panel")
    expect(plan.candidates[1]!.prompt).toContain("Variation direction: warm palette.")
    expect(() => planSlopcameraGallery({
      subject: "panel",
      candidates: [{ id: "x", prompt: "p", variant: "v" }],
    })).toThrow(/prompt or variant/u)
    expect(() => planSlopcameraGallery({
      subject: "panel",
      vary: ["style"],
      candidates: [{ id: "x", prompt: "p" }],
    })).toThrow(/mutually exclusive/u)
  })

  test("bounds candidate expansion and rejects duplicate ids", () => {
    expect(() => planSlopcameraGallery({
      subject: "x",
      vary: [
        { axis: "style", values: ["a", "b", "c", "d", "e"] },
        { axis: "palette", values: ["a", "b", "c", "d"] },
      ],
    })).toThrow(/bound/u)
    expect(() => planSlopcameraGallery({
      subject: "x",
      count: slopcameraGalleryLimits.candidates + 1,
    })).toThrow(/count/u)
  })
})

describe("gallery generation", () => {
  test("writes labelled candidates, a contact sheet, and a provenance receipt", async () => {
    const dir = await mkdtemp(join(tmpdir(), "slopcamera-gallery-"))
    try {
      const fake = fakeGenerate()
      const receipt = await generateSlopcameraImageGallery(
        { subject: "basalt wall", kind: "texture", count: 4, outputDir: dir, cellEdge: 96 },
        { generate: fake.generate },
      )
      expect(fake.calls).toHaveLength(4)
      expect(receipt.counts).toEqual({ requested: 4, generated: 4, failed: 0 })
      expect(receipt.clientMaxRetries).toBe(0)
      for (const candidate of receipt.candidates) {
        expect(candidate.status).toBe("generated")
        expect(candidate.sha256).toMatch(/^[0-9a-f]{64}$/u)
        expect(candidate.cell).toBeDefined()
      }
      const gallery = await sharp(await readFile(receipt.gallery.path)).metadata()
      // 4 cells at 96 px + 28 px labels in a 2×2 sheet with 8 px gaps.
      expect(gallery.width).toBe(2 * 96 + 8)
      expect(gallery.height).toBe(2 * (96 + 28) + 8)
      const persisted = JSON.parse(await readFile(receipt.receiptPath, "utf8")) as { kind: string }
      expect(persisted.kind).toBe("slopcamera.image-gallery")
      // The label strip must carry visible label pixels, not an empty bar.
      const { data } = await sharp(receipt.gallery.path).raw().toBuffer({ resolveWithObject: true })
      let labelLit = 0
      for (let x = 0; x < 96; x += 1) {
        const index = (10 * (2 * 96 + 8) + x) * 4
        if (data[index]! > 200) labelLit += 1
      }
      expect(labelLit).toBeGreaterThan(4)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("keeps successful candidates and marks failures without retrying", async () => {
    const dir = await mkdtemp(join(tmpdir(), "slopcamera-gallery-"))
    try {
      let call = 0
      const receipt = await generateSlopcameraImageGallery(
        { subject: "panel", kind: "image", count: 3, outputDir: dir, cellEdge: 64 },
        {
          generate: async input => {
            call += 1
            if (call === 2) throw new Error("provider exploded")
            const bytes = await fakePng(call)
            return {
              image: { base64: Buffer.from(bytes).toString("base64"), mediaType: "image/png" },
              model: input.model,
              provider: "vercel-ai-gateway",
              requestId: `sha256:${String(call).padStart(64, "0")}`,
              warnings: [],
            } satisfies GeneratedSlopcameraImage
          },
        },
      )
      expect(call).toBe(3)
      expect(receipt.counts).toEqual({ requested: 3, generated: 2, failed: 1 })
      expect(receipt.candidates[1]!.status).toBe("failed")
      expect(receipt.candidates[1]!.error).toContain("provider exploded")
      expect(receipt.candidates[1]!.path).toBeUndefined()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("retains the receipt then fails when every candidate fails", async () => {
    const dir = await mkdtemp(join(tmpdir(), "slopcamera-gallery-"))
    try {
      await expect(generateSlopcameraImageGallery(
        { subject: "panel", count: 2, outputDir: dir, cellEdge: 64 },
        {
          generate: async () => {
            throw new Error("paid provider down")
          },
        },
      )).rejects.toThrow(/Every gallery candidate failed/u)
      const persisted = JSON.parse(await readFile(join(dir, "receipt.json"), "utf8")) as {
        counts: { failed: number }
      }
      expect(persisted.counts.failed).toBe(2)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe("gallery tiled cells", () => {
  async function splitPng(): Promise<Uint8Array> {
    const pixels = Buffer.alloc(64 * 64 * 4)
    for (let y = 0; y < 64; y += 1) {
      for (let x = 0; x < 64; x += 1) {
        const index = (y * 64 + x) * 4
        pixels[index] = x < 32 ? 255 : 0
        pixels[index + 1] = 0
        pixels[index + 2] = x < 32 ? 0 : 255
        pixels[index + 3] = 255
      }
    }
    return new Uint8Array(await sharp(pixels, {
      raw: { width: 64, height: 64, channels: 4 },
    }).png().toBuffer())
  }

  test("texture plans default to tiled cells that expose seams", async () => {
    const dir = await mkdtemp(join(tmpdir(), "slopcamera-gallery-"))
    try {
      const plan = planSlopcameraGallery({ subject: "basalt", kind: "texture", count: 1 })
      expect(plan.tiled).toBe(true)
      const bytes = await splitPng()
      const receipt = await composeSlopcameraImageGallery({
        candidates: [{
          bytes,
          id: "half",
          index: 1,
          label: "half",
          mediaType: "image/png",
          prompt: plan.candidates[0]!.prompt,
          status: "generated",
        }],
        cellEdge: 64,
        model: "openai/gpt-image-1.5",
        outputDir: dir,
        plan,
      })
      expect(receipt.candidates[0]!.tiled).toBe(true)
      const { data } = await sharp(receipt.gallery.path)
        .raw()
        .toBuffer({ resolveWithObject: true })
      const sheetWidth = 64
      const pixelAt = (x: number, y: number): readonly number[] => {
        const index = (y * sheetWidth + x) * 4
        return [data[index]!, data[index + 1]!, data[index + 2]!]
      }
      const row = 28 + 10 // inside the first cell body, below its label strip
      // The 64px cell repeats the half-red/half-blue tile twice horizontally.
      expect(pixelAt(4, row)).toEqual([255, 0, 0])
      expect(pixelAt(20, row)).toEqual([0, 0, 255])
      expect(pixelAt(36, row)).toEqual([255, 0, 0])
      expect(pixelAt(52, row)).toEqual([0, 0, 255])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("non-texture kinds stay flat and tiled:false disables the repeat", async () => {
    const dir = await mkdtemp(join(tmpdir(), "slopcamera-gallery-"))
    try {
      expect(planSlopcameraGallery({ subject: "x", kind: "image" }).tiled).toBe(false)
      expect(planSlopcameraGallery({ subject: "x", kind: "texture", tiled: false }).tiled).toBe(false)
      expect(planSlopcameraGallery({ subject: "x", kind: "image", tiled: true }).tiled).toBe(true)
      expect(() => planSlopcameraGallery({
        subject: "x",
        tiled: "yes" as unknown as boolean,
      })).toThrow(/tiled/u)

      const plan = planSlopcameraGallery({ subject: "basalt", kind: "texture", count: 1, tiled: false })
      const receipt = await composeSlopcameraImageGallery({
        candidates: [{
          bytes: await splitPng(),
          id: "flat",
          index: 1,
          label: "flat",
          mediaType: "image/png",
          prompt: plan.candidates[0]!.prompt,
          status: "generated",
        }],
        cellEdge: 64,
        model: "openai/gpt-image-1.5",
        outputDir: dir,
        plan,
      })
      expect(receipt.candidates[0]!.tiled).toBeUndefined()
      const { data } = await sharp(receipt.gallery.path)
        .raw()
        .toBuffer({ resolveWithObject: true })
      const row = 28 + 10
      // Untiled: the right half of the cell is blue, not a repeated red.
      const index = (row * 64 + 52) * 4
      expect([data[index]!, data[index + 1]!, data[index + 2]!]).toEqual([0, 0, 255])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe("gallery vary grammar", () => {
  test("parses axes with optional value lists", () => {
    expect(parseSlopcameraGalleryVary("style; palette=warm,cool")).toEqual([
      { axis: "style" },
      { axis: "palette", values: ["warm", "cool"] },
    ])
    expect(() => parseSlopcameraGalleryVary("not-an-axis")).toThrow(/vary axis/u)
    expect(() => parseSlopcameraGalleryVary("style=")).toThrow(/values/u)
    expect(() => parseSlopcameraGalleryVary("  ")).toThrow(/at least one axis/u)
  })
})

describe("gallery composition seam", () => {
  test("keeps pre-published candidate paths, digests, and job references", async () => {
    const dir = await mkdtemp(join(tmpdir(), "slopcamera-gallery-"))
    const durable = await mkdtemp(join(tmpdir(), "slopcamera-gallery-durable-"))
    try {
      const plan = planSlopcameraGallery({ subject: "basalt", kind: "texture", count: 2 })
      const bytes = await fakePng(1)
      const durablePath = join(durable, "candidate.png")
      await Bun.write(durablePath, bytes)
      const sha256 = Buffer.from(
        await crypto.subtle.digest("SHA-256", bytes),
      ).toString("hex")
      const receipt = await composeSlopcameraImageGallery({
        candidates: [
          {
            bytes,
            id: "kept",
            index: 1,
            job: join(durable, "job.json"),
            label: "kept",
            mediaType: "image/png",
            path: durablePath,
            prompt: plan.candidates[0]!.prompt,
            sha256,
            status: "generated",
          },
          {
            error: "provider down",
            id: "lost",
            index: 2,
            job: join(durable, "job-2.json"),
            label: "lost",
            prompt: plan.candidates[1]!.prompt,
            status: "failed",
          },
        ],
        cellEdge: 64,
        model: "openai/gpt-image-1.5",
        outputDir: dir,
        plan,
      })
      expect(receipt.counts).toEqual({ requested: 2, generated: 1, failed: 1 })
      const kept = receipt.candidates[0]!
      expect(kept.path).toBe(durablePath)
      expect(kept.sha256).toBe(sha256)
      expect(kept.job).toBe(join(durable, "job.json"))
      // The pre-published file is referenced, never copied into outputDir.
      await expect(readFile(join(dir, "candidate-01-kept.png"))).rejects.toThrow()
      expect(receipt.candidates[1]!.job).toBe(join(durable, "job-2.json"))
      expect(receipt.candidates[1]!.error).toBe("provider down")
    } finally {
      await rm(dir, { recursive: true, force: true })
      await rm(durable, { recursive: true, force: true })
    }
  })

  test("rejects a pre-published digest that does not match the bytes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "slopcamera-gallery-"))
    try {
      const plan = planSlopcameraGallery({ subject: "basalt", count: 1 })
      await expect(composeSlopcameraImageGallery({
        candidates: [{
          bytes: await fakePng(1),
          id: "mismatch",
          index: 1,
          label: "mismatch",
          mediaType: "image/png",
          path: join(dir, "elsewhere.png"),
          prompt: plan.candidates[0]!.prompt,
          sha256: "0".repeat(64),
          status: "generated",
        }],
        cellEdge: 64,
        model: "openai/gpt-image-1.5",
        outputDir: dir,
        plan,
      })).rejects.toThrow(/digest does not match/u)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
