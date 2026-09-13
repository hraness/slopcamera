import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { Resvg } from "@resvg/resvg-js"

const app = dirname(dirname(fileURLToPath(import.meta.url)))
const desktop = join(app, "../desktop/assets")
const sha256 = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex")

/** Reproduce the historical desktop identity and its original touch derivative.
 * Public website PNGs now come from the separately reviewed identity handoff. */
export async function renderSlopcameraIcons(): Promise<Readonly<{ apple: Uint8Array; desktop: Uint8Array; sourceSha256: string }>> {
  const [source, webSource, manifest] = await Promise.all([
    readFile(join(desktop, "brand-emoji/slopcamera.com.svg"), "utf8"),
    readFile(join(app, "src/icon.svg"), "utf8"),
    readFile(fileURLToPath(import.meta.resolve("@resvg/resvg-js/package.json")), "utf8"),
  ])
  if (JSON.parse(manifest).version !== "2.6.2") throw new Error("Camera icons require the pinned Resvg 2.6.2 renderer")
  if (source !== webSource || Buffer.byteLength(source) > 4096 || /<image|<text|href=|url\((?!#)/u.test(source)) {
    throw new Error("Camera icon sources must be identical bounded local vector artwork")
  }
  const render = (width: number): Uint8Array => {
    const result = new Resvg(source, { fitTo: { mode: "width", value: width }, font: { loadSystemFonts: false } }).render()
    if (result.width !== width || result.height !== width) throw new Error("Camera icon dimensions changed")
    const png = new Uint8Array(result.asPng())
    if (png.byteLength > 1024 * 1024) throw new Error("Camera icon exceeded its output budget")
    return png
  }
  return { apple: render(180), desktop: render(1024), sourceSha256: sha256(source) }
}
