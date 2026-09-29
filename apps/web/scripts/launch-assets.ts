import { createHash } from "node:crypto"
import { readdir } from "node:fs/promises"
import { join } from "node:path"
import { launchAssetPrefix, launchMedia } from "../src/launch-media"
import { readPreviewFile } from "./preview-file"

/** Read only the declared launch film derivatives, checking exact bytes. */
export async function readLaunchAssets(appDirectory: string): Promise<readonly Readonly<{ path: string; bytes: Uint8Array }>[]> {
  const directory = join(appDirectory, "launch-media")
  const listed = (await readdir(directory)).filter(file => file !== "launch-media.json").sort()
  const expected = launchMedia.map(item => item.file).sort()
  if (JSON.stringify(listed) !== JSON.stringify(expected)) throw new Error("launch-media contains missing or unregistered files")
  return Promise.all(launchMedia.map(async item => {
    const bytes = await readPreviewFile(join(directory, item.file), item.bytes)
    if (bytes.byteLength !== item.bytes) throw new Error(`${item.file} has the wrong length`)
    if (createHash("sha256").update(bytes).digest("hex") !== item.sha256) throw new Error(`${item.file} has the wrong sha256`)
    if (item.mime === "text/vtt" && !new TextDecoder("utf-8", { fatal: true }).decode(bytes).startsWith("WEBVTT")) throw new Error(`${item.file} is not WebVTT`)
    return { path: `${launchAssetPrefix.slice(1)}${item.file}`, bytes }
  }))
}
