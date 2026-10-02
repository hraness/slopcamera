import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { runSlopcameraOilPaintCli } from "./oil-paint-cli.ts"

const source = JSON.stringify({
  version: 1, width: 16, height: 16,
  tubes: [{ name: "white", color: "#f4eee0" }, { name: "blue", color: "#24448e" }],
  piles: [{ name: "mix", ingredients: [{ tube: "white", amount: 1 }, { tube: "blue", amount: 1 }], knifePasses: 2 }],
  layers: [{ strokes: [{ pile: "mix", points: [[2, 8], [13, 8]] }] }],
})

test("oil-paint CLI writes bounded PPM and a replay log", async () => {
  const root = await mkdtemp(join(tmpdir(), "slopcamera-oil-cli-"))
  try {
    await writeFile(join(root, "source.json"), source)
    const output: string[] = []
    await runSlopcameraOilPaintCli(["source.json", "--output", "paint.ppm", "--log", "paint.json", "--json"], { cwd: () => root, log: line => output.push(line) })
    const receipt = JSON.parse(output[0]!) as { outputPath: string; logPath: string | null; bytes: number }
    expect(receipt.outputPath).toBe(join(root, "paint.ppm"))
    expect(receipt.logPath).toBe(join(root, "paint.json"))
    expect((await readFile(join(root, "paint.ppm"))).subarray(0, 2).toString()).toBe("P6")
    expect((await readFile(join(root, "paint.json"))).byteLength).toBeGreaterThan(100)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
