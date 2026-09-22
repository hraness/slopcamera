import { afterEach, describe, expect, spyOn, test } from "bun:test"
import { mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { main } from "./cli.ts"
import { starterDrawingSource } from "./drawing.ts"
import type { HostResourceClaim, HostResourceCoordinator } from "./host-resources.ts"
import { slopcameraApi } from "./index.ts"

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(async root => await rm(root, { recursive: true, force: true })))
})

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "slopcamera-drawing-cli-"))
  roots.push(root)
  return root
}

function runner() {
  const output: string[] = []
  const claims: HostResourceClaim[][] = []
  let completions = 0
  const profile = { id: "slopcamera.drawing-cli-test/v1", capacities: [] } as const
  const coordinator: HostResourceCoordinator = {
    profile,
    scope: "process",
    async withLease(admitted, callback) {
      claims.push([...admitted])
      return await callback({
        claims: admitted,
        inheritedFileDescriptor: 83,
        profile,
        ticket: String(claims.length),
        assertOwned: () => Promise.resolve(),
      })
    },
  }
  return {
    claims,
    output,
    completions: () => completions,
    run: async (args: readonly string[]) => await main(args, {
      hostResourceCoordinator: coordinator,
      log: value => output.push(value),
      onUsefulResult: () => { completions += 1 },
    }),
  }
}

describe("drawing sheets CLI", () => {
  test("keeps executable JSON stdout clean and reports usage failures on stderr", async () => {
    const root = await workspace()
    const run = async (args: readonly string[]) => {
      const child = Bun.spawn([process.execPath, join(import.meta.dir, "cli.ts"), "diagram", "sheets", ...args], {
        cwd: root,
        env: { ...process.env, HRANESS_SUPPORT_AUDIENCE: "off", HRANESS_SUPPORT_EMAIL: "off" },
        stdout: "pipe",
        stderr: "pipe",
      })
      const [code, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ])
      return { code, stdout, stderr }
    }
    const created = await run(["init", "sensor.drawing.json", "--json"])
    expect(created.code).toBe(0)
    expect(created.stderr).toBe("")
    expect(JSON.parse(created.stdout)).toEqual({ command: "diagram.sheets.init", source: join(await realpath(root), "sensor.drawing.json") })
    expect(created.stdout.trim().split("\n")).toHaveLength(1)
    const rejected = await run(["check", "sensor.drawing.json", "--json", "--json"])
    expect(rejected.code).toBe(1)
    expect(rejected.stdout).toBe("")
    expect(rejected.stderr).toContain("--json may be supplied at most once")
  })

  test("initializes once, checks without writing, and emits one JSON value per command", async () => {
    const root = await workspace()
    const source = join(root, "sensor.drawing.json")
    const cli = runner()
    await cli.run(["diagram", "sheets", "init", source, "--json"])
    expect(cli.output).toEqual([JSON.stringify({ command: "diagram.sheets.init", source })])
    const bytes = await readFile(source)
    expect(JSON.parse(bytes.toString())).toEqual(starterDrawingSource())
    await expect(cli.run(["diagram", "sheets", "init", source])).rejects.toThrow("Refusing to overwrite")
    await cli.run(["diagram", "sheets", "check", source, "--json"])
    expect(JSON.parse(cli.output[1]!)).toMatchObject({
      command: "diagram.sheets.check",
      source,
      profile: "patent-line-art-v1",
      sheetCount: 2,
      findings: [],
    })
    expect(await readFile(source)).toEqual(bytes)
    expect(await readdir(root)).toEqual(["sensor.drawing.json"])
    expect(cli.output).toHaveLength(2)
    expect(cli.completions()).toBe(1)
    expect(cli.claims).toEqual([[{ resource: "cpu", amount: 1 }, { resource: "local-io", amount: 1 }]])
  })

  test("init refuses a symlink without changing its target", async () => {
    const root = await workspace()
    const target = join(root, "notes.txt")
    const source = join(root, "sensor.drawing.json")
    await writeFile(target, "retained")
    await symlink(target, source)
    await expect(runner().run(["diagram", "sheets", "init", source])).rejects.toThrow("Refusing to overwrite")
    expect(await readFile(target, "utf8")).toBe("retained")
  })

  test.each([
    [[], "Use slopcamera diagram sheets"],
    [["unknown"], "Use slopcamera diagram sheets"],
    [["init"], "requires exactly one drawing file"],
    [["check"], "requires exactly one drawing file"],
    [["render"], "requires exactly one drawing file"],
    [["check", "source.json"], "must end in .drawing.json"],
    [["init", "a.drawing.json", "b.drawing.json"], "requires exactly one drawing file"],
    [["check", "a.drawing.json", "--out-dir", "out"], "Unknown diagram sheets check option"],
    [["init", "a.drawing.json", "--out-dir", "out"], "Unknown diagram sheets init option"],
    [["render", "a.drawing.json", "--out-dir"], "--out-dir requires a directory"],
    [["render", "a.drawing.json", "--out-dir", "--json"], "--out-dir requires a directory"],
    [["render", "a.drawing.json", "--out-dir", ""], "--out-dir requires a directory"],
    [["render", "a.drawing.json", "--out-dir", "a", "--out-dir", "b"], "at most once"],
    [["check", "a.drawing.json", "--json", "--json"], "at most once"],
    [["render", "a.drawing.json", "--scale", "2"], "Unknown diagram sheets render option"],
    [["check", "a.drawing.json", "--json=true"], "Unknown diagram sheets check option"],
    [["check", "a.drawing.json", "-x"], "Unknown diagram sheets check option"],
  ] as const)("rejects invalid grammar %j before host admission", async (args, message) => {
    const cli = runner()
    await expect(cli.run(["diagram", "sheets", ...args])).rejects.toThrow(message)
    expect(cli.claims).toEqual([])
    expect(cli.output).toEqual([])
    expect(cli.completions()).toBe(0)
  })

  test("renders the checked source to PDF, outlined SVG sheets and a receipt", async () => {
    const root = await workspace()
    const source = join(root, "sensor.drawing.json")
    const outDirectory = join(root, "derived")
    const cli = runner()
    await cli.run(["diagram", "sheets", "init", source, "--json"])
    const sourceBytes = await readFile(source)
    await cli.run(["diagram", "sheets", "render", source, "--out-dir", outDirectory, "--json"])
    const rendered = JSON.parse(cli.output[1]!) as {
      command: string
      artifacts: { source: string; pdf: string; sheets: string[]; receipt: string }
      checks: { sheetCount: number }
    }
    expect(rendered.command).toBe("diagram.sheets.render")
    expect(rendered.checks.sheetCount).toBe(2)
    expect(rendered.artifacts.source).toBe(source)
    expect(rendered.artifacts.sheets).toHaveLength(2)
    expect((await readFile(rendered.artifacts.pdf, "utf8")).startsWith("%PDF-")).toBe(true)
    for (const sheet of rendered.artifacts.sheets) {
      const svg = await readFile(sheet, "utf8")
      expect(svg).toContain("<svg")
      expect(svg).toContain("<path")
      expect(svg).not.toContain("<text")
    }
    expect(JSON.parse(await readFile(rendered.artifacts.receipt, "utf8"))).toBeObject()
    expect(await readdir(outDirectory)).toHaveLength(4)
    expect(await readFile(source)).toEqual(sourceBytes)
    expect(cli.output).toHaveLength(2)
    expect(cli.completions()).toBe(2)
    expect(cli.claims).toEqual([[{ resource: "cpu", amount: 1 }, { resource: "local-io", amount: 1 }]])
  })

  test.each(["{invalid json", " ".repeat(1024 * 1024 + 1)])(
    "rejects invalid or oversized source before creating an output directory",
    async bytes => {
      const root = await workspace()
      const source = join(root, "invalid.drawing.json")
      await writeFile(source, bytes)
      const cli = runner()
      await expect(cli.run([
        "diagram", "sheets", "render", source, "--out-dir", join(root, "output"), "--json",
      ])).rejects.toThrow()
      expect(await readdir(root)).toEqual(["invalid.drawing.json"])
      expect(await readFile(source, "utf8")).toBe(bytes)
      expect(cli.output).toEqual([])
    },
  )

  test("exposes drawing helpers on the root SDK without changing legacy five-output rendering", async () => {
    expect(slopcameraApi.starterDrawingSource).toBe(starterDrawingSource)
    for (const member of [
      "checkDrawingFile", "drawingPageGeometry", "parseDrawingSource", "readDrawingFile",
      "renderDrawing", "renderDrawingFile", "DrawingValidationError",
    ] as const) expect(slopcameraApi[member]).toBeFunction()
    const root = await workspace()
    const source = join(root, "legacy.diagram.json")
    const outDirectory = join(root, "legacy")
    const log = spyOn(console, "log").mockImplementation(() => {})
    try {
      const cli = runner()
      await cli.run(["diagram", "init", source])
      await cli.run(["diagram", "render", source, "--out-dir", outDirectory])
      expect((await readdir(outDirectory)).sort()).toEqual([
        "example-flow.dark.png", "example-flow.dark.svg", "example-flow.light.png", "example-flow.light.svg", "example-flow.tldr",
      ])
    } finally {
      log.mockRestore()
    }
  })
})
