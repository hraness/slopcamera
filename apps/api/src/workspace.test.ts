import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import {
  harvestOutputs,
  materializeWorkspace,
  validateRelativePath,
} from "./workspace.js"

const LIMITS = { maximumInlineBytes: 64, maximumUploadBytes: 1024 }

describe("validateRelativePath", () => {
  test("admits plain nested names", () => {
    expect(validateRelativePath("a/b/c.json")).toBe("a/b/c.json")
    expect(validateRelativePath("file.png")).toBe("file.png")
  })

  test("rejects traversal, absolutes, and control bytes", () => {
    for (const bad of [
      "../x",
      "a/../b",
      "/abs",
      "a//b",
      "a/./b",
      "a\\b",
      "x\ny",
      "",
    ]) {
      expect(() => validateRelativePath(bad)).toThrow()
    }
  })
})

describe("materializeWorkspace", () => {
  test("writes text and base64 inputs and cleans up", async () => {
    const workspace = await materializeWorkspace(
      {
        "doc.json": { text: "{\"ok\":true}" },
        "bin/x.dat": { base64: Buffer.from("hi").toString("base64") },
      },
      LIMITS,
      undefined,
    )
    expect(await readFile(join(workspace.directory, "doc.json"), "utf8")).toBe(
      "{\"ok\":true}",
    )
    expect(workspace.inputNames.has("doc.json")).toBe(true)
    await workspace.cleanup()
    await expect(
      readFile(join(workspace.directory, "doc.json")),
    ).rejects.toThrow()
  })

  test("enforces the inline byte limit and the file-count bound", async () => {
    await expect(
      materializeWorkspace(
        { big: { text: "x".repeat(65) } },
        LIMITS,
        undefined,
      ),
    ).rejects.toThrow()

    const many = Object.fromEntries(
      Array.from({ length: 25 }, (_, index) => [`f${index}`, { text: "x" }]),
    )
    await expect(
      materializeWorkspace(many, LIMITS, undefined),
    ).rejects.toThrow()
  })

  test("upload references require storage and a valid id", async () => {
    await expect(
      materializeWorkspace(
        { f: { upload: "not-a-uuid" } },
        LIMITS,
        undefined,
      ),
    ).rejects.toThrow()
  })
})

describe("harvestOutputs", () => {
  test("returns only files the caller did not supply", async () => {
    const workspace = await materializeWorkspace(
      { "in.json": { text: "{}" } },
      LIMITS,
      undefined,
    )
    try {
      const { writeFile, mkdir } = await import("node:fs/promises")
      await mkdir(join(workspace.directory, "generated"), { recursive: true })
      await writeFile(join(workspace.directory, "generated/out.png"), "png")
      const harvested = await harvestOutputs(
        workspace.directory,
        workspace.inputNames,
      )
      expect(harvested.map((file) => file.relativePath)).toEqual([
        "generated/out.png",
      ])
    } finally {
      await workspace.cleanup()
    }
  })
})
