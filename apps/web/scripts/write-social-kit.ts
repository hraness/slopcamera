// Writes the launch social kit to kb/launch/social-kit.md. Run with `bun run launch:kit`.
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { renderSocialKitMarkdown } from "../src/launch-social-kit-markdown"

const out = join(import.meta.dir, "../../../kb/launch/social-kit.md")
await mkdir(join(out, ".."), { recursive: true })
await writeFile(out, renderSocialKitMarkdown())
console.log(`Wrote ${out}`)
