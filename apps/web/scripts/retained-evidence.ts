import { readdir, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

// Every site and preview compilation retains its compiler evidence in a fresh
// temporary directory. Keep a day of it for diagnosis and remove older copies
// so repeated local test runs do not grow the temporary directory without bound.
export const retainedEvidencePrefixes = Object.freeze(["slopcamera-web-site-", "slopcamera-web-preview-"])
export const retainedEvidenceMaxAgeMs = 24 * 60 * 60 * 1000

export async function pruneRetainedEvidence(
  directory: string = tmpdir(),
  now: number = Date.now(),
  maxAgeMs: number = retainedEvidenceMaxAgeMs,
): Promise<readonly string[]> {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return []
  }
  const removed: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || !retainedEvidencePrefixes.some(prefix => entry.name.startsWith(prefix))) continue
    const path = join(directory, entry.name)
    try {
      if (now - (await stat(path)).mtimeMs <= maxAgeMs) continue
      await rm(path, { force: true, recursive: true })
      removed.push(entry.name)
    } catch {
      // Another process may own or remove it concurrently; pruning is best effort.
    }
  }
  return removed.sort()
}
