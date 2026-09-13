import { afterEach, expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { publicIdentity, readPublicIcons } from "./public-identity"

const app = dirname(dirname(fileURLToPath(import.meta.url)))
const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "slopcamera-public-icons-")))
  roots.push(root)
  await mkdir(join(root, "src"))
  const icons = await readPublicIcons(app)
  for (const icon of icons) await writeFile(join(root, "src", icon.path), icon.bytes)
  return { root, icons }
}

test("the public camera-with-flash identity admits only its exact PNG derivatives", async () => {
  const icons = await readPublicIcons(app)
  expect(publicIdentity).toMatchObject({ emoji: "📸", nativeId: "1f4f8", domain: "slopcamera.com" })
  expect(icons.map(icon => icon.path)).toEqual(["icon.png", "apple-touch-icon.png"])
  for (const [index, icon] of icons.entries()) {
    expect([...icon.bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    const view = new DataView(icon.bytes.buffer, icon.bytes.byteOffset, icon.bytes.byteLength)
    expect(view.getUint32(16)).toBe(publicIdentity.files[index]!.width)
    expect(view.getUint32(20)).toBe(publicIdentity.files[index]!.height)
  }
  for (const name of ["index.html", "404.html"]) {
    const html = await readFile(join(app, "src", name), "utf8")
    expect(html).toContain('<link rel="icon" href="/icon.png" type="image/png">')
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png">')
    expect(html).not.toContain('href="/icon.svg"')
  }
})

test("any sampled single-bit change rejects while restoring the exact handoff re-admits", async () => {
  const { root, icons } = await fixture()
  let seed = 0x1f4f8
  for (let trial = 0; trial < 32; trial += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const icon = icons[trial % icons.length]!
    const changed = icon.bytes.slice()
    const offset = seed % changed.length
    changed[offset] = changed[offset]! ^ (1 << (trial % 8))
    await writeFile(join(root, "src", icon.path), changed)
    await expect(readPublicIcons(root)).rejects.toThrow("differs from the reviewed identity handoff")
    await writeFile(join(root, "src", icon.path), icon.bytes)
    expect((await readPublicIcons(root)).map(value => value.bytes)).toEqual(icons.map(value => value.bytes))
  }
})

test("a missing or symlinked public derivative cannot enter the build", async () => {
  const { root, icons } = await fixture()
  const path = join(root, "src", icons[0]!.path)
  await rm(path)
  await expect(readPublicIcons(root)).rejects.toThrow()
  await symlink(join(app, "src", icons[0]!.path), path)
  await expect(readPublicIcons(root)).rejects.toThrow("physical path")
})
