import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { hasPathCollision, publishReplaceableFile, readBoundedFile } from "./bounded-file.js"
import { composeSlopcameraSoundtrack } from "./soundtrack.js"

const loopText = "title Kit check\nbpm 100\nbars 1\n\ndrums\nkick: x...x...x...x...\n"

async function withDirectory<T>(run: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "slopcamera-bounded-file-"))
  try {
    return await run(directory)
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
}

describe("bounded files", () => {
  test("a linked or differently spelled output never replaces its source", async () => {
    await withDirectory(async (directory) => {
      const real = join(directory, "real.json")
      await writeFile(real, "{}")
      await symlink(real, join(directory, "link.json"))
      expect(await hasPathCollision([join(directory, "link.json"), real])).toBe(true)
      expect(await hasPathCollision([real, join(directory, ".", "real.json")])).toBe(true)
      expect(await hasPathCollision([real, join(directory, "new.json")])).toBe(false)
      expect(await hasPathCollision([real, undefined, join(directory, "missing", "x.json")])).toBe(false)

      await writeFile(join(directory, "loop.compose"), loopText)
      await composeSlopcameraSoundtrack({
        sourcePath: join(directory, "loop.compose"),
        outputPath: real,
      })
      const solved = await readFile(real, "utf8")
      await expect(composeSlopcameraSoundtrack({
        sourcePath: join(directory, "link.json"),
        outputPath: real,
      })).rejects.toMatchObject({ code: "INVALID_SOUNDTRACK_INPUT" })
      expect(await readFile(real, "utf8")).toBe(solved)
    })
  })

  test("case-insensitive spellings of one existing file collide", async () => {
    await withDirectory(async (directory) => {
      await writeFile(join(directory, "case.json"), "{}")
      const insensitive = await readFile(join(directory, "CASE.json")).then(() => true, () => false)
      expect(await hasPathCollision([join(directory, "case.json"), join(directory, "CASE.json")]))
        .toBe(insensitive)
    })
  })

  test("a FIFO source fails the regular-file check instead of blocking", async () => {
    if (process.platform === "win32") return
    await withDirectory(async (directory) => {
      const fifo = join(directory, "pipe.compose")
      expect(Bun.spawnSync(["mkfifo", fifo]).exitCode).toBe(0)
      await expect(readBoundedFile(fifo, 1024, "Source")).rejects.toMatchObject({ code: "SOURCE_NOT_FILE" })
    })
  })

  test("publishing under a long basename stays within the name limit", async () => {
    await withDirectory(async (directory) => {
      const path = join(directory, `${"a".repeat(240)}.json`)
      await publishReplaceableFile(path, "{\"a\":1}")
      await publishReplaceableFile(path, "{\"a\":2}")
      expect(await readFile(path, "utf8")).toBe("{\"a\":2}")
    })
  })
})
