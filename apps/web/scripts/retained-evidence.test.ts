import { expect, test } from "bun:test"
import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { pruneRetainedEvidence, retainedEvidenceMaxAgeMs } from "./retained-evidence"

test("prunes only compiler evidence directories older than a day", async () => {
  const root = await mkdtemp(join(tmpdir(), "slopcamera-evidence-prune-"))
  try {
    const now = Date.now()
    const old = new Date(now - retainedEvidenceMaxAgeMs - 60_000)
    for (const name of ["slopcamera-web-site-old", "slopcamera-web-preview-old", "slopcamera-web-site-new", "slopcamera-web-production-old", "unrelated-old"]) {
      await mkdir(join(root, name))
      await writeFile(join(root, name, "evidence.json"), "{}")
      if (name.endsWith("-old")) await utimes(join(root, name), old, old)
    }
    await writeFile(join(root, "slopcamera-web-site-file"), "")
    await utimes(join(root, "slopcamera-web-site-file"), old, old)

    expect(await pruneRetainedEvidence(root, now)).toEqual(["slopcamera-web-preview-old", "slopcamera-web-site-old"])
    expect((await readdir(root)).sort()).toEqual([
      "slopcamera-web-production-old", "slopcamera-web-site-file", "slopcamera-web-site-new", "unrelated-old",
    ])
    expect(await pruneRetainedEvidence(join(root, "missing"), now)).toEqual([])
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})
