import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { LANGUAGE_IDS, LIBRARY } from "@hraness/iconplace"
import { COLLECTION_PRESETS } from "@hraness/iconplace/collections"
import { DEFAULT_SCENE_RENDER, parseSceneRenderOptions } from "@hraness/iconplace/scene"
import {
  assertInertIconSvg,
  composeSlopcameraIcon,
  renderSlopcameraIcon,
  slopcameraIconEngine,
  SlopcameraIconError,
  slopcameraIconLanguages,
  slopcameraIconPalettes,
  slopcameraIconSceneLimits,
} from "./icon-scene.js"
import { executeSlopcameraOperation } from "./operations.js"

const root = new URL("../", import.meta.url)

async function withDirectory<T>(run: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "slopcamera-icon-scene-"))
  try {
    return await run(directory)
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
}

async function writeJson(path: string, value: unknown): Promise<string> {
  await writeFile(path, JSON.stringify(value))
  return path
}

const collection = COLLECTION_PRESETS.find(({ id }) => id === "gothic-window")!.composition
const program = LIBRARY[0]!.program

describe("icon engine admission", () => {
  test("pins the exact admitted library version everywhere it is recorded", async () => {
    const manifest = JSON.parse(await readFile(new URL("package.json", root), "utf8")) as {
      readonly dependencies: Readonly<Record<string, string>>
    }
    const installed = JSON.parse(
      await readFile(new URL("node_modules/@hraness/iconplace/package.json", root), "utf8"),
    ) as { readonly version: string; readonly license: string }
    expect(manifest.dependencies[slopcameraIconEngine.package]).toBe(slopcameraIconEngine.version)
    expect(installed.version).toBe(slopcameraIconEngine.version)
    expect(installed.license).toBe("MIT")
  })

  test("desktop help lists every construction-program language", async () => {
    const help = (await readFile(new URL("apps/desktop/cli/help.ts", root), "utf8")).replace(/\s+/gu, " ")
    expect(help).toContain(`Construction-program languages: ${slopcameraIconLanguages.join(", ")}.`)
  })

  test("owned palette and language lists match the library's", () => {
    expect([...slopcameraIconLanguages]).toEqual([...LANGUAGE_IDS])
    for (const palette of slopcameraIconPalettes) {
      expect(parseSceneRenderOptions({ ...DEFAULT_SCENE_RENDER, palette }).palette).toBe(palette)
    }
    expect(() => parseSceneRenderOptions({ ...DEFAULT_SCENE_RENDER, palette: "neon" })).toThrow()
  })
})

// Rendering every language or preset is CPU-bound; shared CI runners need headroom.
const heavyIconTestTimeout = 30_000

describe("slopcamera.icon.compose and render", () => {
  test("compose then render gives the same SVG digest as rendering the source", async () => {
    await withDirectory(async (directory) => {
      const source = await writeJson(join(directory, "scene.json"), collection)
      const composed = await composeSlopcameraIcon({
        sourcePath: source,
        outputPath: join(directory, "scene.solved.json"),
      })
      expect(composed).toMatchObject({
        operation: "slopcamera.icon.compose",
        form: "scene",
        source: { format: "collection" },
        elementCount: 1,
      })
      expect(composed.output?.path).toBe(join(directory, "scene.solved.json"))

      const direct = await renderSlopcameraIcon({
        sourcePath: source,
        outputPath: join(directory, "direct.svg"),
        palette: "ink",
      })
      const solved = await renderSlopcameraIcon({
        sourcePath: join(directory, "scene.solved.json"),
        outputPath: join(directory, "solved.svg"),
        palette: "ink",
      })
      expect(solved.source.format).toBe("scene")
      expect(solved.digests).toEqual(direct.digests)
      expect(solved.output.sha256).toBe(direct.output.sha256)
      expect(direct.digests.document).toBe(composed.digests.document)
      expect(direct.digests.geometry).toBe(composed.digests.geometry)

      // Composing the solved document is a fixed point.
      const again = await composeSlopcameraIcon({ sourcePath: join(directory, "scene.solved.json") })
      expect(again.digests).toEqual(composed.digests)
      expect(again.output).toBeNull()
    })
  })

  test("a replayed scene recipe matches its source and fixes its settings", async () => {
    await withDirectory(async (directory) => {
      const source = await writeJson(join(directory, "scene.json"), collection)
      const first = await renderSlopcameraIcon({
        sourcePath: source,
        outputPath: join(directory, "first.svg"),
        recipePath: join(directory, "first.recipe.json"),
        size: 256,
        background: true,
        palette: "earth",
      })
      const replay = await renderSlopcameraIcon({
        sourcePath: join(directory, "first.recipe.json"),
        outputPath: join(directory, "replay.svg"),
      })
      expect(replay.replayed).toBe(true)
      expect(replay.source.format).toBe("scene-recipe")
      expect(replay.render).toEqual(first.render)
      expect(replay.digests).toEqual(first.digests)
      expect(replay.output.sha256).toBe(first.output.sha256)
      expect(replay.width).toBe(256)

      await expect(renderSlopcameraIcon({
        sourcePath: join(directory, "first.recipe.json"),
        outputPath: join(directory, "resized.svg"),
        size: 128,
      })).rejects.toMatchObject({ code: "INVALID_ICON_INPUT" })
    })
  })

  test("a replayed program recipe matches its source in every language", async () => {
    await withDirectory(async (directory) => {
      const source = await writeJson(join(directory, "program.json"), program)
      for (const language of ["outline", "woodcut", "stipple"] as const) {
        const first = await renderSlopcameraIcon({
          sourcePath: source,
          outputPath: join(directory, `${language}.svg`),
          recipePath: join(directory, `${language}.recipe.json`),
          size: 128,
          language,
        })
        const replay = await renderSlopcameraIcon({
          sourcePath: join(directory, `${language}.recipe.json`),
          outputPath: join(directory, `${language}.replay.svg`),
        })
        expect(first.form).toBe("program")
        expect(first.render.language).toBe(language)
        expect(replay.replayed).toBe(true)
        expect(replay.digests).toEqual(first.digests)
        expect(replay.output.sha256).toBe(first.output.sha256)
      }
    })
  }, heavyIconTestTimeout)

  test("rejects a tampered recipe", async () => {
    await withDirectory(async (directory) => {
      const source = await writeJson(join(directory, "scene.json"), collection)
      await renderSlopcameraIcon({
        sourcePath: source,
        outputPath: join(directory, "a.svg"),
        recipePath: join(directory, "a.recipe.json"),
      })
      const recipe = JSON.parse(await readFile(join(directory, "a.recipe.json"), "utf8")) as {
        scene: { title: string }
      }
      recipe.scene.title = "Tampered"
      await writeJson(join(directory, "a.recipe.json"), recipe)
      await expect(renderSlopcameraIcon({
        sourcePath: join(directory, "a.recipe.json"),
        outputPath: join(directory, "b.svg"),
      })).rejects.toMatchObject({ code: "INVALID_ICON_SOURCE" })
    })
  })

  test("renders every bundled collection preset to inert SVG", async () => {
    await withDirectory(async (directory) => {
      for (const preset of COLLECTION_PRESETS) {
        const source = await writeJson(join(directory, `${preset.id}.json`), preset.composition)
        const receipt = await renderSlopcameraIcon({
          sourcePath: source,
          outputPath: join(directory, `${preset.id}.svg`),
          size: 64,
        })
        expect(receipt.output.bytes).toBeLessThanOrEqual(slopcameraIconSceneLimits.outputBytes)
        assertInertIconSvg(await readFile(receipt.output.path, "utf8"))
      }
    })
  }, heavyIconTestTimeout)

  test("fails closed on bad sources, sizes, paths and option mismatches", async () => {
    await withDirectory(async (directory) => {
      const scene = await writeJson(join(directory, "scene.json"), collection)
      const programPath = await writeJson(join(directory, "program.json"), program)
      await writeFile(join(directory, "bad.json"), "{not json")
      await writeJson(join(directory, "unknown.json"), { version: "other.v1" })
      await writeFile(join(directory, "huge.json"), " ".repeat(slopcameraIconSceneLimits.sourceBytes + 1))

      const cases: readonly [() => Promise<unknown>, string][] = [
        [() => composeSlopcameraIcon({ sourcePath: join(directory, "bad.json") }), "INVALID_ICON_SOURCE"],
        [() => composeSlopcameraIcon({ sourcePath: join(directory, "unknown.json") }), "INVALID_ICON_SOURCE"],
        [() => composeSlopcameraIcon({ sourcePath: join(directory, "huge.json") }), "SOURCE_TOO_LARGE"],
        [() => composeSlopcameraIcon({ sourcePath: join(directory, "missing.json") }), "SOURCE_NOT_FOUND"],
        [() => composeSlopcameraIcon({ sourcePath: scene, outputPath: scene }), "INVALID_ICON_INPUT"],
        [() => composeSlopcameraIcon({ sourcePath: scene, outputPath: join(directory, "x.svg") }), "INVALID_ICON_INPUT"],
        [() => renderSlopcameraIcon({ sourcePath: scene, outputPath: join(directory, "x.png") }), "INVALID_ICON_INPUT"],
        [() => renderSlopcameraIcon({ sourcePath: scene, outputPath: join(directory, "x.svg"), size: 8 }), "INVALID_ICON_INPUT"],
        [() => renderSlopcameraIcon({ sourcePath: scene, outputPath: join(directory, "x.svg"), language: "woodcut" }), "INVALID_ICON_INPUT"],
        [() => renderSlopcameraIcon({ sourcePath: programPath, outputPath: join(directory, "x.svg"), palette: "ink" }), "INVALID_ICON_INPUT"],
      ]
      for (const [run, code] of cases) {
        await expect(run()).rejects.toMatchObject({ code })
      }
    })
  })

  test("runs through the operation registry with parsed input", async () => {
    await withDirectory(async (directory) => {
      const source = await writeJson(join(directory, "scene.json"), collection)
      const receipt = await executeSlopcameraOperation("slopcamera.icon.render", {
        sourcePath: source,
        outputPath: join(directory, "out.svg"),
        size: 96,
      })
      expect(receipt).toMatchObject({ operation: "slopcamera.icon.render", width: 96, height: 96 })
      await expect(executeSlopcameraOperation("slopcamera.icon.render", {
        sourcePath: source,
        outputPath: join(directory, "out.svg"),
        extra: true,
      })).rejects.toMatchObject({ code: "INVALID_OPERATION_INPUT" })
    })
  })
})

describe("inert SVG gate", () => {
  const base = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10">'
  test("admits static shapes with local references", () => {
    expect(() => assertInertIconSvg(
      `${base}<defs><clipPath id="c"><rect x="0" y="0" width="5" height="5"/></clipPath></defs><path d="M0 0L1 1" clip-path="url(#c)"/></svg>`,
    )).not.toThrow()
  })

  test.each([
    ["script", `${base}<script>alert(1)</script></svg>`],
    ["style", `${base}<style>*{}</style></svg>`],
    ["image", `${base}<image href="x.png"/></svg>`],
    ["handler", `${base}<path d="M0 0" onload="x()"/></svg>`],
    ["external url", `${base}<path d="M0 0" fill="url(https://x/y#z)"/></svg>`],
    ["unknown id", `${base}<path d="M0 0" fill="url(#nope)"/></svg>`],
    ["doctype", `<!DOCTYPE svg>${base}</svg>`],
    ["entity", `${base}<title>&xxe;</title></svg>`],
    ["foreignObject", `${base}<foreignObject/></svg>`],
    ["unquoted attribute", `${base}<path d=M0/></svg>`],
  ])("rejects %s", (_name, svg) => {
    expect(() => assertInertIconSvg(svg)).toThrow(SlopcameraIconError)
  })

  test("rejects malformed markup and scans hostile input in linear time", () => {
    const wrap = (body: string): string => `${base}${body}</svg>`
    const malformed = [
      `<path d="M0 0"fill="none"/>`,
      `<path d="M0 0 fill="none"/>`,
      `<path d="M0 0" /`,
      `<path d="x"></ path>`,
      `<path fill="url(#a"/>`,
      `<path d="<g/>"/>`,
    ]
    for (const body of malformed) {
      expect(() => assertInertIconSvg(wrap(body))).toThrow(SlopcameraIconError)
    }
    expect(() => assertInertIconSvg(wrap(`<g id="a"><path d="M0 0" fill="url(#a)"/></g>`))).not.toThrow()

    const hostile = [
      wrap(`<path${" ".repeat(1_000_000)}`),
      wrap(`<path fill="${"url(".repeat(250_000)}"/>`),
      wrap(`<path d="M0 0"${" a=\"\"".repeat(200_000)}`),
    ]
    const started = performance.now()
    for (const svg of hostile) expect(() => assertInertIconSvg(svg)).toThrow(SlopcameraIconError)
    expect(performance.now() - started).toBeLessThan(2_000)
  })
})
