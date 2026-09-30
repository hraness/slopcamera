import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { readPreviewFile } from "./preview-file"

// These exact public PNG derivatives follow the current site's transparent
// header mark: pure white, tightly centered, transparent browser background
// and black Apple touch background. Historical desktop artwork is separate.
export const publicIdentity = {
  contract: "hraness.header-favicon/v1",
  recipe: "pure-white-tight-centered",
  sourcePath: "src/marks/slopcamera.svg",
  id: "slopcamera", domain: "slopcamera.com", mark: "slopcamera",
  sourceSvgSha256: "064b6f2bcba374dac5b1fef606267f3988ad11dfaa79e983e8fce00b7d961dcb",
  files: [
    { path: "icon.png", width: 32, height: 32, bytes: 949,
      sha256: "5dc6ed3718e65d9ed938b48ed094a4486e3d37ef71ae115f7a9ab302c75e8d06" },
    { path: "apple-touch-icon.png", width: 180, height: 180, bytes: 8129,
      sha256: "5e86d5bdc1c6eb21ad67e4a95febc9cd9b317dcca167903012e9931806426416" },
  ],
} as const

export async function readPublicIcons(appDirectory: string) {
  const icons: { path: typeof publicIdentity.files[number]["path"]; bytes: Uint8Array }[] = []
  for (const expected of publicIdentity.files) {
    const bytes = await readPreviewFile(join(appDirectory, "src", expected.path), expected.bytes)
    assert.equal(bytes.byteLength, expected.bytes, `Public ${expected.path} size changed`)
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expected.sha256,
      `Public ${expected.path} differs from the reviewed header favicon`)
    icons.push({ path: expected.path, bytes })
  }
  return icons
}

if (import.meta.main) {
  await readPublicIcons(dirname(dirname(fileURLToPath(import.meta.url))))
  console.log("Verified the two public Slopcamera header favicon PNG derivatives")
}
