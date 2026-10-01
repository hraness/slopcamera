import { randomUUID, createHash } from "node:crypto"
import { link, open, rm } from "node:fs/promises"
import { dirname, join } from "node:path"

/** Publish complete retained bytes atomically, without replacing any existing entry. */
export async function publishSlopcameraRetainedFile(path: string, bytes: Uint8Array | string) {
  const temporary = join(dirname(path), `.slopcamera-retain-${randomUUID()}.tmp`)
  try {
    const file = await open(temporary, "wx", 0o600)
    try { await file.writeFile(bytes); await file.sync() } finally { await file.close() }
    await link(temporary, path)
    const directory = await open(dirname(path), "r")
    try { await directory.sync() } finally { await directory.close() }
  } finally { await rm(temporary, { force: true }) }
  return { path, bytes: typeof bytes === "string" ? Buffer.byteLength(bytes) : bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") }
}
