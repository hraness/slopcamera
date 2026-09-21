import { mkdtemp, readdir, readFile, rm, stat, writeFile, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, normalize, sep } from "node:path"
import { ApiError, invalidRequest, isRecord } from "./errors.js"
import type { ObjectStore } from "./r2.js"

/**
 * Per-request ephemeral workspaces. Inputs arrive as an inline `files` map —
 * `{ "name": {"text": …} | {"base64": …} | {"upload": "<id>"} }` — or as
 * presigned R2 uploads fetched server-side. The directory is removed after
 * every call.
 */

const MAX_FILES = 24
const MAX_PATH_LENGTH = 512
const MAX_HARVEST_FILES = 24
const MAX_HARVEST_BYTES = 96 * 1024 * 1024
const UPLOAD_FETCH_MAX_BYTES = 64 * 1024 * 1024

export function validateRelativePath(name: string): string {
  if (
    typeof name !== "string" ||
    name.length === 0 ||
    name.length > MAX_PATH_LENGTH ||
    name.includes("\0") ||
    name.includes("\\") ||
    name.startsWith("/") ||
    /[\u0000-\u001f\u007f]/u.test(name)
  ) {
    throw invalidRequest("File names must be printable root-relative paths.")
  }
  const normalized = normalize(name)
  if (
    normalized === "." ||
    normalized.startsWith("..") ||
    normalized.split(sep).includes("..") ||
    name.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw invalidRequest("File names may not contain traversal or empty segments.")
  }
  return name
}

export interface MaterializedWorkspace {
  readonly directory: string
  readonly inputNames: ReadonlySet<string>
  cleanup(): Promise<void>
}

export async function materializeWorkspace(
  files: unknown,
  limits: { maximumInlineBytes: number; maximumUploadBytes: number },
  r2: ObjectStore | undefined,
): Promise<MaterializedWorkspace> {
  const directory = await mkdtemp(join(tmpdir(), "slopcamera-api-"))
  const inputNames = new Set<string>()
  try {
    if (files === undefined) {
      return { directory, inputNames, cleanup }
    }
    if (!isRecord(files) || Object.keys(files).length > MAX_FILES) {
      throw invalidRequest(`files must be an object with at most ${MAX_FILES} entries.`)
    }
    for (const [rawName, spec] of Object.entries(files)) {
      const name = validateRelativePath(rawName)
      inputNames.add(name)
      const target = join(directory, name)
      await mkdir(dirname(target), { recursive: true })
      if (!isRecord(spec)) {
        throw invalidRequest(`files.${name} must be an object.`)
      }
      if (typeof spec.text === "string") {
        const bytes = Buffer.byteLength(spec.text, "utf8")
        if (bytes > limits.maximumInlineBytes) {
          throw new ApiError(413, "too_large", `files.${name} exceeds the inline byte limit.`)
        }
        await writeFile(target, spec.text, "utf8")
      } else if (typeof spec.base64 === "string") {
        const bytes = Buffer.from(spec.base64, "base64")
        if (bytes.byteLength > limits.maximumInlineBytes) {
          throw new ApiError(413, "too_large", `files.${name} exceeds the inline byte limit.`)
        }
        await writeFile(target, bytes)
      } else if (typeof spec.upload === "string") {
        if (r2 === undefined) {
          throw new ApiError(503, "storage_unavailable", "Upload references require artifact storage.")
        }
        if (!/^[0-9a-f-]{36}$/iu.test(spec.upload)) {
          throw invalidRequest(`files.${name}.upload must be an upload id.`)
        }
        const bytes = await r2.getObject(`u/${spec.upload}`, UPLOAD_FETCH_MAX_BYTES)
        if (bytes === undefined) {
          throw new ApiError(404, "not_found", `Upload ${spec.upload} was not found.`)
        }
        if (bytes.byteLength > limits.maximumUploadBytes) {
          throw new ApiError(413, "too_large", `Upload ${spec.upload} exceeds the upload byte limit.`)
        }
        await writeFile(target, bytes)
      } else {
        throw invalidRequest(`files.${name} needs one of text, base64, or upload.`)
      }
    }
    return { directory, inputNames, cleanup }
  } catch (error) {
    await cleanup()
    throw error
  }

  async function cleanup(): Promise<void> {
    await rm(directory, { recursive: true, force: true })
  }
}

export interface HarvestedFile {
  readonly relativePath: string
  readonly bytes: Uint8Array
}

/** New files the tool wrote, excluding caller-supplied inputs. */
export async function harvestOutputs(
  directory: string,
  inputNames: ReadonlySet<string>,
): Promise<HarvestedFile[]> {
  const harvested: HarvestedFile[] = []
  let totalBytes = 0

  async function walk(relative: string): Promise<void> {
    const absolute = join(directory, relative)
    for (const entry of await readdir(absolute, { withFileTypes: true })) {
      const entryRelative = relative === "" ? entry.name : `${relative}/${entry.name}`
      if (entry.isDirectory()) {
        await walk(entryRelative)
      } else if (entry.isFile() && !inputNames.has(entryRelative)) {
        const info = await stat(join(directory, entryRelative))
        totalBytes += info.size
        if (harvested.length >= MAX_HARVEST_FILES || totalBytes > MAX_HARVEST_BYTES) {
          throw new ApiError(
            500,
            "output_overflow",
            "The tool produced more output than this service returns; rerun with a narrower request.",
          )
        }
        harvested.push({
          relativePath: entryRelative,
          bytes: new Uint8Array(await readFile(join(directory, entryRelative))),
        })
      }
    }
  }

  await walk("")
  return harvested
}
