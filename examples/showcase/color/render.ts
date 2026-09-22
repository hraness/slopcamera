/** Compare local color treatments of one retained source without overwriting it. */
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"

const input = process.argv[2]
assert.ok(input, "Pass the path of the retained product film")
const output = "artifacts/showcase/color"
await mkdir(output, { recursive: true })
const sourceSha256 = createHash("sha256").update(await readFile(input)).digest("hex")
await writeFile(`${output}/source.json`, JSON.stringify({ input, sourceSha256 }) + "\n", { flag: "wx" })
for (const preset of ["warm", "cool", "mono"]) {
  const argv: string[] = [process.execPath, "apps/desktop/cli/main.ts", "media", "color", input,
    "--preset", preset, "--output", `${output}/${preset}.mp4`, "--json"]
  const child = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
  ])
  await writeFile(`${output}/${preset}.result.json`, stdout)
  await writeFile(`${output}/${preset}.stderr.txt`, stderr)
  await writeFile(`${output}/${preset}.command.json`, JSON.stringify({ argv, exitCode }) + "\n")
  assert.equal(exitCode, 0, `${preset} failed; inspect the retained result`)
}
assert.equal(createHash("sha256").update(await readFile(input)).digest("hex"), sourceSha256)
console.log(JSON.stringify({ output, sourceSha256, review: "Compare the original and all three actual outputs before publication." }))
