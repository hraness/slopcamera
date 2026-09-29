import { createHash, randomUUID } from "node:crypto"
import { constants } from "node:fs"
import { mkdir, open, rename, rm, stat } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"

/**
 * Bounded local file reads and atomic replaceable writes shared by the
 * icon-scene and soundtrack operations. Reads check the size before and
 * after reading so a growing file cannot exceed the declared bound.
 */

export class BoundedFileError extends Error {
  readonly code: "SOURCE_NOT_FOUND" | "SOURCE_NOT_FILE" | "SOURCE_TOO_LARGE" | "SOURCE_UNREADABLE"

  constructor(code: BoundedFileError["code"], message: string) {
    super(message)
    this.name = "BoundedFileError"
    this.code = code
  }
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { readonly code: unknown }).code)
    : undefined
}

export async function readBoundedFile(
  path: string,
  maximumBytes: number,
  label: string,
): Promise<Uint8Array> {
  let handle
  try {
    // Non-blocking so a FIFO or device fails the regular-file check instead of hanging.
    handle = await open(path, constants.O_RDONLY | constants.O_NONBLOCK)
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      throw new BoundedFileError("SOURCE_NOT_FOUND", `${label} does not exist.`)
    }
    throw new BoundedFileError("SOURCE_UNREADABLE", `${label} could not be opened.`)
  }
  try {
    const metadata = await handle.stat()
    if (!metadata.isFile()) {
      throw new BoundedFileError("SOURCE_NOT_FILE", `${label} must be a regular file.`)
    }
    if (metadata.size > maximumBytes) {
      throw new BoundedFileError(
        "SOURCE_TOO_LARGE",
        `${label} exceeds the ${String(maximumBytes)}-byte limit.`,
      )
    }
    // Read one byte past the bound so a file that grew after stat fails closed.
    const buffer = new Uint8Array(maximumBytes + 1)
    let length = 0
    for (;;) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length)
      if (bytesRead === 0) break
      length += bytesRead
      if (length > maximumBytes) {
        throw new BoundedFileError(
          "SOURCE_TOO_LARGE",
          `${label} exceeds the ${String(maximumBytes)}-byte limit.`,
        )
      }
    }
    return buffer.slice(0, length)
  } finally {
    await handle.close()
  }
}

export function decodeUtf8Source(bytes: Uint8Array, label: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes)
  } catch {
    throw new BoundedFileError("SOURCE_UNREADABLE", `${label} must be UTF-8 text.`)
  }
}

export function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex")
}

/** Replace `path` atomically with `value`, creating its parent directory. */
export async function publishReplaceableFile(
  path: string,
  value: string | Uint8Array,
): Promise<void> {
  const directory = dirname(path)
  await mkdir(directory, { recursive: true })
  // A fixed-length name stays under NAME_MAX whatever the target's basename.
  const temporaryPath = join(directory, `.slopcamera-${randomUUID()}.tmp`)
  try {
    const handle = await open(temporaryPath, "wx")
    try {
      await handle.writeFile(value)
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(temporaryPath, path)
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined)
  }
}

/**
 * True when two declared paths name the same file, such as an output that
 * would replace its source. Equal resolved spellings collide; existing files
 * also collide by device and inode, which catches links and case-insensitive
 * spellings of one file.
 */
export async function hasPathCollision(paths: readonly (string | undefined)[]): Promise<boolean> {
  const spellings = new Set<string>()
  const identities = new Set<string>()
  for (const path of paths) {
    if (path === undefined) continue
    const absolute = resolve(path)
    if (spellings.has(absolute)) return true
    spellings.add(absolute)
    let identity: string
    try {
      const metadata = await stat(absolute, { bigint: true })
      identity = `${String(metadata.dev)}:${String(metadata.ino)}`
    } catch (error) {
      if (errorCode(error) === "ENOENT" || errorCode(error) === "ENOTDIR") continue
      throw new BoundedFileError("SOURCE_UNREADABLE", "A declared path could not be inspected.")
    }
    if (identities.has(identity)) return true
    identities.add(identity)
  }
  return false
}
