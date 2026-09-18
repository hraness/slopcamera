import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { readPreviewFile } from "./preview-file"

// Only these reviewed public PNG derivatives are distributed. They render
// from the canonical Slopcamera mark in the Jungle brand-assets registry;
// the historical camera-with-flash emoji derivative is preserved as
// provenance, not as a build input.
export const publicIdentity = {
  contract: "hraness.identity-png-handoff/v1",
  sourceCommit: "e286722d35fc23083930bfa77e6055ad776a1855",
  sourceCatalogManifestSha256: "7b826d7e27d015b950279eb65fb03d05f85cf5af07462fc70716ffe18d28bcfc",
  id: "slopcamera", domain: "slopcamera.com", mark: "slopcamera",
  sourceSvgSha256: "219710e5aa5ad5f989fd1235dd6f93ef9e92875508c6f9c799c0c240eb74eafa",
  sourceFlatSha256: "219710e5aa5ad5f989fd1235dd6f93ef9e92875508c6f9c799c0c240eb74eafa",
  files: [
    { path: "icon.png", handoffPath: "slopcamera/icon.png", width: 32, height: 32, bytes: 640,
      sha256: "a20638f99abf7c75d4b7ff0f8d749c7c510d816861d145dc179b4a4646bbe305" },
    { path: "apple-touch-icon.png", handoffPath: "slopcamera/apple-icon.png", width: 180, height: 180, bytes: 3286,
      sha256: "553d9fd77bc5b643bc7c42e52ea40b6f3111d59a53b41b24c1c618945b776d84" },
  ],
} as const

export async function readPublicIcons(appDirectory: string) {
  const icons: { path: typeof publicIdentity.files[number]["path"]; bytes: Uint8Array }[] = []
  for (const expected of publicIdentity.files) {
    const bytes = await readPreviewFile(join(appDirectory, "src", expected.path), expected.bytes)
    assert.equal(bytes.byteLength, expected.bytes, `Public ${expected.path} size changed`)
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expected.sha256,
      `Public ${expected.path} differs from the reviewed identity handoff`)
    icons.push({ path: expected.path, bytes })
  }
  return icons
}

if (import.meta.main) {
  await readPublicIcons(dirname(dirname(fileURLToPath(import.meta.url))))
  console.log("Verified the two public Slopcamera mark PNG derivatives")
}
