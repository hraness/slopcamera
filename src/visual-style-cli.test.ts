import { expect, test } from "bun:test"
import { main } from "./cli.ts"
import { VISUAL_STYLE_IDS, getVisualStyleProfile } from "./visual-style.ts"

test("style list and show expose bounded local direction without a model or useful-result notification", async () => {
  const output: string[] = []
  let notifications = 0
  const dependencies = { log: (line: string) => { output.push(line) }, onUsefulResult: () => { notifications += 1 } }
  await main(["style", "list", "--json"], dependencies)
  const list = JSON.parse(output.pop()!) as { schemaVersion: number; styles: { id: string }[] }
  expect(list.schemaVersion).toBe(1)
  expect(list.styles.map(style => style.id)).toEqual([...VISUAL_STYLE_IDS])
  await main(["style", "show", "pixel-art", "--json"], dependencies)
  expect(JSON.parse(output.pop()!)).toEqual({ schemaVersion: 1, style: getVisualStyleProfile("pixel-art") })
  await main(["style", "show", "documentary-16mm"], dependencies)
  const direction = output.pop()!
  expect(direction).toContain("period street furniture")
  expect(direction).toContain("Review actual frames and motion")
  expect(notifications).toBe(0)
})

test("style discovery rejects extra positional arguments, duplicate flags, and unsupported options", async () => {
  for (const args of [
    ["style"], ["style", "list", "unused"], ["style", "list", "--json", "--json"],
    ["style", "list", "--output", "result.json"], ["style", "show"],
    ["style", "show", "noir-35mm", "super8-color"], ["style", "show", "--json"],
    ["style", "show", "noir-35mm", "--json", "--json"], ["style", "show", "https://example.invalid"],
  ]) {
    const output: string[] = []
    await expect(main(args, { log: value => { output.push(value) } })).rejects.toThrow()
    expect(output).toEqual([])
  }
})
