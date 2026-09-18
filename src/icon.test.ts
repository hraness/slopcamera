import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"
import {
  extractIconLineArt,
  generateSlopcameraIcon,
  iconPromptFor,
  iconVisualGateProblems,
  slopcameraIconDefaultInk,
  type IconCritique,
} from "./icon.ts"
import { parseHexColor } from "./vectorize/metrics.ts"
import type { VectorizeResult } from "./vectorize/types.ts"

function solidRgba(
  width: number,
  height: number,
  color: readonly [number, number, number, number],
): Uint8Array {
  const pixels = new Uint8Array(width * height * 4)
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = color[0]
    pixels[index + 1] = color[1]
    pixels[index + 2] = color[2]
    pixels[index + 3] = color[3]
  }
  return pixels
}

function setPixel(
  pixels: Uint8Array,
  width: number,
  x: number,
  y: number,
  color: readonly [number, number, number, number],
): void {
  const index = (y * width + x) * 4
  pixels[index] = color[0]
  pixels[index + 1] = color[1]
  pixels[index + 2] = color[2]
  pixels[index + 3] = color[3]
}

describe("icon prompt", () => {
  test("locks the isometric line-art style and ink into the prompt", () => {
    const prompt = iconPromptFor("a paper airplane", { ink: "#2474d4" })
    expect(prompt).toContain("a paper airplane")
    expect(prompt).toContain("isometric")
    expect(prompt).toContain("#2474d4")
    expect(prompt).toContain("no hairlines")
    const revised = iconPromptFor("a cube", { feedback: "remove the shadow" })
    expect(revised).toContain("remove the shadow")
    const mark = iconPromptFor("a sponge", { purpose: "mark" })
    expect(mark).toContain("bold masses")
    expect(mark).toContain("16 pixels")
    expect(mark).toContain("no thin outlines")
  })
})

describe("icon visual gates", () => {
  test("keeps compact marks bold and simple", () => {
    expect(iconVisualGateProblems("mark", { coverageRatio: 0.3, height: 80, width: 80 }, 3)).toEqual([])
    expect(iconVisualGateProblems("mark", { coverageRatio: 0.05, height: 80, width: 160 }, 20)).toEqual([
      "the subject is too narrow or elongated",
      "the mark has too little bold visual mass",
      "the mark has too many separate vector paths",
    ])
  })

  test("bounds illustration density without requiring favicon mass", () => {
    expect(iconVisualGateProblems("illustration", { coverageRatio: 0.12, height: 100, width: 120 }, 20)).toEqual([])
    expect(iconVisualGateProblems("illustration", { coverageRatio: 0.7, height: 100, width: 100 }, 60)).toEqual([
      "the illustration is too visually dense",
      "the illustration has too much vector detail",
    ])
  })
})

describe("icon line-art extraction", () => {
  test("normalizes ink to the canonical hex with antialiased coverage alpha", () => {
    const width = 64
    const height = 64
    const pixels = solidRgba(width, height, [252, 252, 252, 255])
    for (let x = 16; x <= 48; x += 1) {
      setPixel(pixels, width, x, 24, [36, 116, 212, 255])
      setPixel(pixels, width, x, 25, [148, 180, 236, 255])
      setPixel(pixels, width, x, 40, [36, 116, 212, 255])
    }
    const result = extractIconLineArt(pixels, width, height)
    expect(result.background).toBe("#fcfcfc")
    expect(result.measuredInk).toMatch(/^#[0-9a-f]{6}$/u)
    const [red, green, blue] = parseHexColor(slopcameraIconDefaultInk)
    for (let index = 0; index < result.pixels.length; index += 4) {
      expect(result.pixels[index]).toBe(red)
      expect(result.pixels[index + 1]).toBe(green)
      expect(result.pixels[index + 2]).toBe(blue)
    }
    expect(result.coverageRatio).toBeGreaterThan(0)
    // Cropped to the stroked rows plus margin, not the full 64×64 frame.
    expect(result.width).toBeLessThan(width)
    expect(result.height).toBeLessThan(height)
  })

  test("drops isolated speckle components below the area floor", () => {
    const width = 64
    const height = 64
    const pixels = solidRgba(width, height, [252, 252, 252, 255])
    for (let x = 16; x <= 48; x += 1) {
      for (let y = 24; y <= 40; y += 1) {
        setPixel(pixels, width, x, y, [36, 116, 212, 255])
      }
    }
    setPixel(pixels, width, 4, 4, [36, 116, 212, 255])
    setPixel(pixels, width, 5, 4, [36, 116, 212, 255])
    const result = extractIconLineArt(pixels, width, height)
    expect(result.removedComponents).toBe(1)
  })

  test("rejects a raster with no ink strokes", () => {
    const pixels = solidRgba(32, 32, [252, 252, 252, 255])
    expect(() => extractIconLineArt(pixels, 32, 32)).toThrow(
      "[GENERATION_INVALID_RESPONSE]",
    )
  })
})

async function lineArtPng(): Promise<string> {
  const width = 64
  const height = 64
  const pixels = solidRgba(width, height, [252, 252, 252, 255])
  for (let x = 16; x <= 48; x += 1) {
    setPixel(pixels, width, x, 24, [36, 116, 212, 255])
    setPixel(pixels, width, x, 40, [36, 116, 212, 255])
  }
  for (let y = 24; y <= 40; y += 1) {
    setPixel(pixels, width, 16, y, [36, 116, 212, 255])
    setPixel(pixels, width, 48, y, [36, 116, 212, 255])
  }
  return Buffer.from(
    await sharp(pixels, { raw: { channels: 4, height, width } })
      .png()
      .toBuffer(),
  ).toString("base64")
}

function vectorizeStub(): {
  readonly calls: number
  vectorize: (input: unknown, options?: unknown) => Promise<VectorizeResult>
} {
  const state = { calls: 0 }
  return {
    get calls() {
      return state.calls
    },
    vectorize: async (input, options) => {
      state.calls += 1
      expect(input instanceof Uint8Array).toBe(true)
      expect(
        (options as { outputPath?: string } | undefined)?.outputPath,
      ).toBeUndefined()
      return {
        outputPath: null,
        svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">\n  <path d="M16,24 L48,24 L48,40 L16,40 Z" fill="#2474d4"/>\n</svg>\n',
        receipt: {
          alphaCutoff: 8,
          bytes: 200,
          candidatesEvaluated: 1,
          format: "png",
          height: 64,
          inputBytes: 100,
          outputMode: "color",
          pathCount: 1,
          profile: "balanced",
          provenance: {
            arch: process.arch,
            platform: process.platform,
            sharp: "test",
            sharpVersions: {},
            vips: "test",
            vtracerSha256: "0".repeat(64),
            vtracerSource: "override",
            vtracerVersion: "test",
          },
          quality: {
            alphaRmse: 0,
            colorRmse: 0,
            outsideAlphaRatio: 0,
            sampleHeight: 64,
            sampleWidth: 64,
            supportRecall: 1,
          },
          receiptVersion: 1,
          representation: "color-paths",
          sourceSha256: "1".repeat(64),
          svgSha256: "2".repeat(64),
          width: 64,
        },
      }
    },
  }
}

function critiqueStub(score: number, pass: boolean) {
  const seen: { ink: string; model: string; pngBytes: number; purpose: string; subject: string }[] =
    []
  return {
    seen,
    critique: async (input: {
      ink: string
      model: string
      png: Uint8Array
      purpose: "illustration" | "mark"
      subject: string
    }): Promise<IconCritique> => {
      seen.push({
        ink: input.ink,
        model: input.model,
        pngBytes: input.png.byteLength,
        purpose: input.purpose,
        subject: input.subject,
      })
      return {
        pass,
        problems: pass ? [] : ["shading present"],
        promptFix: pass ? "" : "remove all shading",
        resolvedModel: input.model,
        score,
      }
    },
  }
}

describe("icon generation pipeline", () => {
  test("generates, extracts, traces, critiques, and publishes the SVG", async () => {
    const root = await mkdtemp(join(tmpdir(), "slopcamera-icon-"))
    try {
      const output = join(root, "bolt.svg")
      const raster = await lineArtPng()
      const vectorize = vectorizeStub()
      const critique = critiqueStub(92, true)
      const prompts: string[] = []
      const receipt = await generateSlopcameraIcon(
        { subject: "a lightning bolt", outputPath: output, rounds: 2 },
        {
          critique: critique.critique,
          generate: async (input) => {
            prompts.push(input.prompt)
            return {
              image: { base64: raster, mediaType: "image/png" },
              model: "recraft/recraft-v4.1-utility",
              provider: "vercel-ai-gateway",
              requestId: "req_one",
              warnings: [],
            }
          },
          rasterize: async () => Uint8Array.from([1, 2, 3]),
          vectorize: vectorize.vectorize,
        },
      )
      expect(prompts.length).toBe(1)
      expect(prompts[0]).toContain("a lightning bolt")
      expect(critique.seen).toEqual([
        {
          ink: slopcameraIconDefaultInk,
          model: "google/gemini-3-flash",
          pngBytes: 3,
          purpose: "illustration",
          subject: "a lightning bolt",
        },
      ])
      expect(receipt.attempts).toMatchObject([
        { pass: true, round: 1, score: 92, status: "selected" },
      ])
      expect(receipt.selectedRound).toBe(1)
      expect(receipt.purpose).toBe("illustration")
      const svg = await readFile(output, "utf8")
      expect(svg).toContain('fill="#2474d4"')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("feeds critique problems into the next round's prompt", async () => {
    const root = await mkdtemp(join(tmpdir(), "slopcamera-icon-retry-"))
    try {
      const output = join(root, "cube.svg")
      const raster = await lineArtPng()
      const vectorize = vectorizeStub()
      const critiques = [
        critiqueStub(40, false).critique,
        critiqueStub(88, true).critique,
      ]
      let critiquesSeen = 0
      const prompts: string[] = []
      const receipt = await generateSlopcameraIcon(
        { subject: "a cube", outputPath: output, rounds: 3 },
        {
          critique: async (input) => {
            const result = await critiques[critiquesSeen]!(input)
            critiquesSeen += 1
            return result
          },
          generate: async (input) => {
            prompts.push(input.prompt)
            return {
              image: { base64: raster, mediaType: "image/png" },
              model: "recraft/recraft-v4.1-utility",
              provider: "vercel-ai-gateway",
              requestId: `req_${prompts.length}`,
              warnings: [],
            }
          },
          rasterize: async () => Uint8Array.from([1]),
          vectorize: vectorize.vectorize,
        },
      )
      expect(prompts.length).toBe(2)
      expect(prompts[0]).not.toContain("rejected")
      expect(prompts[1]).toContain("shading present")
      expect(receipt.selectedRound).toBe(2)
      expect(receipt.attempts.map(attempt => attempt.status)).toEqual([
        "candidate",
        "selected",
      ])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("does not publish when every completed design critique fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "slopcamera-icon-critique-fail-"))
    try {
      const output = join(root, "rejected.svg")
      const raster = await lineArtPng()
      const vectorize = vectorizeStub()
      await expect(generateSlopcameraIcon(
        { subject: "a cube", outputPath: output, rounds: 2 },
        {
          critique: critiqueStub(40, false).critique,
          generate: async () => ({
            image: { base64: raster, mediaType: "image/png" },
            model: "recraft/recraft-v4.1-utility",
            provider: "vercel-ai-gateway",
            requestId: "req_rejected",
            warnings: [],
          }),
          rasterize: async () => Uint8Array.from([1]),
          vectorize: vectorize.vectorize,
        },
      )).rejects.toThrow("Every generated illustration failed its design critique")
      expect(await Bun.file(output).exists()).toBe(false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("stops after one round when rounds is 1 and never critiques", async () => {
    const root = await mkdtemp(join(tmpdir(), "slopcamera-icon-single-"))
    try {
      const output = join(root, "dot.svg")
      const raster = await lineArtPng()
      const vectorize = vectorizeStub()
      let critiques = 0
      const receipt = await generateSlopcameraIcon(
        { subject: "a dot", outputPath: output, rounds: 1 },
        {
          critique: async () => {
            critiques += 1
            throw new Error("unreachable")
          },
          generate: async () => ({
            image: { base64: raster, mediaType: "image/png" },
            model: "recraft/recraft-v4.1-utility",
            provider: "vercel-ai-gateway",
            requestId: "req_single",
            warnings: [],
          }),
          vectorize: vectorize.vectorize,
        },
      )
      expect(critiques).toBe(0)
      expect(receipt.attempts).toHaveLength(1)
      expect(receipt.attempts[0]!.score).toBeUndefined()
      expect(receipt.attempts[0]!.status).toBe("selected")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("rejects invalid subjects and outputs before any paid call", async () => {
    let calls = 0
    const dependencies = {
      generate: async () => {
        calls += 1
        throw new Error("unreachable")
      },
    }
    await expect(
      generateSlopcameraIcon(
        { subject: "  ", outputPath: "icon.svg" },
        dependencies,
      ),
    ).rejects.toThrow("[INVALID_ARGUMENT]")
    await expect(
      generateSlopcameraIcon(
        { subject: "bolt", outputPath: "icon.png" },
        dependencies,
      ),
    ).rejects.toThrow("[INVALID_ARGUMENT]")
    await expect(
      generateSlopcameraIcon(
        { subject: "bolt", outputPath: "icon.svg", rounds: 9 },
        dependencies,
      ),
    ).rejects.toThrow("[INVALID_ARGUMENT]")
    expect(calls).toBe(0)
  })

  test("fails after the final round when generation keeps failing", async () => {
    const root = await mkdtemp(join(tmpdir(), "slopcamera-icon-fail-"))
    try {
      const output = join(root, "never.svg")
      let calls = 0
      await expect(
        generateSlopcameraIcon(
          { subject: "bolt", outputPath: output, rounds: 2 },
          {
            generate: async () => {
              calls += 1
              throw new Error("provider down")
            },
          },
        ),
      ).rejects.toThrow("provider down")
      expect(calls).toBe(2)
      expect(await Bun.file(output).exists()).toBe(false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
