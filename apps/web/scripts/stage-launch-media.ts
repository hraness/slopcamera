// Copies the reviewed launch film derivatives from launch/story/out into
// apps/web/launch-media/ under content-addressed names and writes the
// inventory that src/launch-media.ts reads. Run after `bash render-all.sh launch`
// in launch/story.
import { createHash } from "node:crypto"
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"

const film = join(import.meta.dir, "../../../launch/story/out")
const out = join(import.meta.dir, "../launch-media")
const sources = [
  { role: "film", from: "launch-1080p.mp4", base: "launch", mime: "video/mp4", width: 1920, height: 1080 },
  { role: "square", from: "launch-1x1.mp4", base: "launch-square", mime: "video/mp4", width: 1080, height: 1080 },
  { role: "poster", from: "launch-poster.jpg", base: "launch-poster", mime: "image/jpeg", width: 1920, height: 1080 },
  { role: "captions", from: "launch.en.vtt", base: "launch-captions", mime: "text/vtt" },
  { role: "portrait", from: "launch-9x16.mp4", base: "launch-portrait", mime: "video/mp4", width: 1080, height: 1920 },
  { role: "portrait-poster", from: "launch-9x16-poster.jpg", base: "launch-portrait-poster", mime: "image/jpeg", width: 1080, height: 1920 },
] as const

await mkdir(out, { recursive: true })
for (const file of await readdir(out)) await rm(join(out, file))
const inventory = []
for (const source of sources) {
  const bytes = await readFile(join(film, source.from))
  const sha256 = createHash("sha256").update(bytes).digest("hex")
  const extension = source.from.slice(source.from.lastIndexOf(".") + 1)
  const file = `${source.base}-${sha256.slice(0, 12)}.${extension}`
  await writeFile(join(out, file), bytes)
  const { from: _from, base: _base, ...rest } = source
  inventory.push({ ...rest, file, sha256, bytes: bytes.byteLength })
}
await writeFile(join(out, "launch-media.json"), `${JSON.stringify(inventory, null, 2)}\n`)
console.log(`Staged ${String(inventory.length)} launch files in ${out}`)
