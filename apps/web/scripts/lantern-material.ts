import assert from "node:assert/strict"
import { join } from "node:path"
import { checkLanternMaterialSnapshot } from "../vendor/lantern-material/check.mjs"
import { readPreviewFile } from "./preview-file"
import { siteSha256 } from "./site-contract"

export const currentLanternMaterialRevision = "d38d13c07d7956d02ddfbca8d32aa2066d88fbd3"
export const historicalLanternMaterialRevision = "0e089bc18f9a0409f0e74b1fb7192f468956e386"
export type LanternMaterialRevision = typeof currentLanternMaterialRevision | typeof historicalLanternMaterialRevision

/** The compiler defaults to the current release. Only a separately Git-bound
 * historical verifier may explicitly select the retained material revision. */
export async function snapshotLanternMaterial(directory: string, expectedRevision: LanternMaterialRevision = currentLanternMaterialRevision) {
  assert.ok(expectedRevision === currentLanternMaterialRevision || expectedRevision === historicalLanternMaterialRevision,
    "Unsupported Lantern material revision")
  const manifest = await checkLanternMaterialSnapshot(directory)
  assert.equal(manifest.source.commit, expectedRevision)
  const files = new Map<string, Uint8Array>()
  for (const [path, receipt] of Object.entries(manifest.files)) {
    const bytes = await readPreviewFile(join(directory, path), 128 * 1024)
    assert.equal(siteSha256(bytes), receipt.sha256, "Lantern material changed after admission")
    files.set(path, bytes)
  }
  return { files, sourceCommit: manifest.source.commit }
}
