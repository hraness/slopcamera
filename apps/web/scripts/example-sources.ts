import { createHash } from "node:crypto"
import { join } from "node:path"
import type { WorkflowExample } from "../src/example-registry"
import { readPreviewFile } from "./preview-file"

/** Repository admission is separate from the independently buildable website. */
export async function verifyExampleSources(repository: string, examples: readonly WorkflowExample[]): Promise<number> {
  const expected = new Map<string, string>()
  for (const example of examples) {
    for (const source of example.source.files) {
      const previous = expected.get(source.path)
      if (previous !== undefined && previous !== source.sha256) throw new Error(`Conflicting example source identity: ${source.path}`)
      expected.set(source.path, source.sha256)
    }
  }
  if (expected.size > 512) throw new Error("Example source closure exceeds 512 files")
  let total = 0
  for (const [path, sha256] of expected) {
    if (!/^examples\/showcase\/[a-z0-9-]+\/[A-Za-z0-9_./-]+$/u.test(path) || path.split("/").includes("..")) {
      throw new Error(`Unsafe example source: ${path}`)
    }
    const bytes = await readPreviewFile(join(repository, path), 1024 * 1024)
    total += bytes.byteLength
    if (total > 32 * 1024 * 1024) throw new Error("Example source closure exceeds 32 MiB")
    if (createHash("sha256").update(bytes).digest("hex") !== sha256) {
      throw new Error(`Published example source changed: ${path}. Reproduce and review the output before updating its identity.`)
    }
  }
  return expected.size
}
