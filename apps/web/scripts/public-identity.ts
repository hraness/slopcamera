import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { readPreviewFile } from "./preview-file"

// Only these reviewed public PNG derivatives are distributed. The source SVG
// belongs to the separate identity catalog and is not a build input.
export const publicIdentity = {
  contract: "hraness.identity-png-handoff/v1",
  sourceCommit: "528f7b07a2b8340e2695893c30ee3e0abf25b597",
  sourceCatalogManifestSha256: "14011800ad84e963a7179fbc395780aba07d89aa2d587fdf5bbb6dec7ba30f26",
  id: "slopcamera", domain: "slopcamera.com", emoji: "📸", nativeId: "1f4f8",
  sourceSvgSha256: "afced14ea43eb5e8b19c6dea8dd21b57ceff521a6efd606f1903cc84b4bdf754",
  sourceFlatSha256: "e94866676a3f56e4bd162809ef7198881cbd0bb1089b6c80871a908e6b8fe825",
  files: [
    { path: "icon.png", handoffPath: "slopcamera/icon.png", width: 512, height: 512, bytes: 12226,
      sha256: "6f5f3acd4be06001abcdf6921e96c164450887d8b7dcf693f25236276a3f882c" },
    { path: "apple-touch-icon.png", handoffPath: "slopcamera/apple-icon.png", width: 180, height: 180, bytes: 4235,
      sha256: "9db9e16ac33a7b70bfcf94fd935455759c7069ff0d3291433432cc7086629901" },
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
  console.log("Verified the two public Slopcamera camera-with-flash PNG derivatives")
}
