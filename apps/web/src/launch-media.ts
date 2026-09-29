/**
 * Reviewed launch film derivatives. The film is built from `launch/film/` with
 * the Slopcamera launch-film template and rendered by `slopcamera html render`
 * and `html deliver`; only the files declared here are published, under
 * `/assets/launch/`, after `scripts/launch-assets.ts` checks their exact bytes.
 */
import inventory from "../launch-media/launch-media.json"

export const launchAssetPrefix = "/assets/launch/"

export type LaunchMediaRole = "film" | "square" | "portrait" | "poster" | "portrait-poster" | "captions"

export type LaunchMediaFile = Readonly<{
  role: LaunchMediaRole
  file: string
  sha256: string
  bytes: number
  mime: "video/mp4" | "image/jpeg" | "text/vtt"
  width?: number
  height?: number
}>

const roles: readonly LaunchMediaRole[] = ["film", "square", "portrait", "poster", "portrait-poster", "captions"]
const fileName = /^launch(?:-[a-z0-9]+)*-[0-9a-f]{12}\.(mp4|jpg|vtt)$/u
const maxBytes = 8 * 1024 * 1024

export function parseLaunchMedia(value: unknown): readonly LaunchMediaFile[] {
  if (!Array.isArray(value)) throw new Error("Launch media must be a list")
  const seen = new Set<string>()
  const files = value.map((entry: unknown) => {
    if (entry === null || typeof entry !== "object") throw new Error("Launch media entries must be objects")
    const item = entry as LaunchMediaFile
    if (!roles.includes(item.role) || seen.has(item.role)) throw new Error(`Launch media role ${String(item.role)} is unknown or repeated`)
    seen.add(item.role)
    if (!fileName.test(item.file) || !item.file.includes(item.sha256.slice(0, 12))) throw new Error(`Launch media file ${item.file} must be content-addressed`)
    if (!/^[0-9a-f]{64}$/u.test(item.sha256)) throw new Error(`Launch media ${item.file} needs a sha256`)
    if (!Number.isSafeInteger(item.bytes) || item.bytes <= 0 || item.bytes > maxBytes) throw new Error(`Launch media ${item.file} is outside its size bound`)
    return Object.freeze({ ...item })
  })
  for (const role of roles) if (!seen.has(role)) throw new Error(`Launch media is missing its ${role}`)
  return Object.freeze(files)
}

export const launchMedia = parseLaunchMedia(inventory)

export function launchMediaFile(role: LaunchMediaRole): LaunchMediaFile {
  const found = launchMedia.find(item => item.role === role)
  if (found === undefined) throw new Error(`Launch media is missing its ${role}`)
  return found
}

export const launchMediaUrl = (item: LaunchMediaFile): string => `${launchAssetPrefix}${item.file}`
