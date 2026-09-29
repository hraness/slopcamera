import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"

// Exact npm versions admitted as immutable Hraness releases (AGENTS.md). The
// integrity is the registry's `dist.integrity`, verified when each was admitted.
const admitted = {
  "@hraness/iconplace": {
    version: "0.1.0",
    integrity: "sha512-ULepQla+5B37ULLSA0tMf48q/C7PyU8r3z1iOa4DNOHw2iJ/U+xod+6YUzgRj5ub7Nzd+sAIu6hKwk3HrBJy4g==",
  },
  "@hraness/soundfish": {
    version: "0.7.0",
    integrity: "sha512-r9ZPw52nVIMElR0XGG4fbo3SKcOuGujGIHq5HryVoVyY6dCXm6GEpsRkr95CV69uxwJp/QvulhOqVg/Op6YHOA==",
  },
} as const

const root = new URL("../", import.meta.url)

test("admitted npm libraries are exact pins whose lockfile integrity matches admission", async () => {
  const manifest = JSON.parse(await readFile(new URL("package.json", root), "utf8")) as {
    readonly dependencies: Record<string, string>
  }
  const lock = await readFile(new URL("bun.lock", root), "utf8")
  for (const [name, { version, integrity }] of Object.entries(admitted)) {
    expect(manifest.dependencies[name]).toBe(version)
    expect(lock).toContain(`"${name}": ["${name}@${version}", "", `)
    const entry = lock.split("\n").find((line) => line.includes(`"${name}": ["${name}@`))
    expect(entry).toContain(`"${integrity}"`)
  }
})

test("only library entry points of admitted libraries are imported", async () => {
  const glob = new Bun.Glob("src/**/*.ts")
  const allowed = new Set([
    "@hraness/iconplace",
    "@hraness/iconplace/scene",
    "@hraness/iconplace/collections",
    "@hraness/soundfish/protocol",
    "@hraness/soundfish/midi",
    "@hraness/soundfish/templates",
  ])
  for await (const path of glob.scan({ cwd: new URL(".", root).pathname })) {
    const source = await readFile(new URL(path, root), "utf8")
    for (const match of source.matchAll(/from\s+"(@hraness\/(?:iconplace|soundfish)[^"]*)"/gu)) {
      expect(allowed.has(match[1]!), `${path} imports ${match[1]}`).toBe(true)
    }
    expect(source, path).not.toMatch(/(?:iconplace|soundfish)\/bin|bin\/(?:iconplace|soundfish)/u)
  }
})
