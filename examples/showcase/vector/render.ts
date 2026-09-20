import { Resvg } from "@resvg/resvg-js"
import { mkdir, writeFile } from "node:fs/promises"

// A retained synthetic raster fixture, deliberately derived from simple shapes
// so the input and its edge fidelity are inspectable without third-party art.
const output = "artifacts/showcase/vector"
await mkdir(output, { recursive: true })
const petals = Array.from({ length: 6 }, (_, index) =>
  `<ellipse cx="512" cy="329" rx="101" ry="218" fill="${index % 2 ? "#275ad5" : "#f16d48"}" transform="rotate(${index * 60} 512 512)"/>`).join("")
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${petals}<circle cx="512" cy="512" r="118" fill="#f9d458"/><circle cx="512" cy="512" r="46" fill="#fff9eb"/></svg>`
await writeFile(`${output}/orbit-input.png`, new Resvg(svg).render().asPng(), { flag: "wx" })
for (const [name, options] of [["orbit-traced", []], ["orbit-duotone", ["--duotone", "#1c3557,#f28e67"]]] as const) {
  const proc = Bun.spawn([process.execPath, "apps/desktop/cli/main.ts", "image", "vectorize", `${output}/orbit-input.png`, "--output", `${output}/${name}.svg`, ...options, "--json"], { stdout: "pipe", stderr: "inherit" })
  const receipt = await new Response(proc.stdout).text()
  const code = await proc.exited
  await writeFile(`${output}/${name}.receipt.json`, receipt)
  if (code !== 0) throw new Error(`${name} failed with exit ${code}`)
  await writeFile(`${output}/${name}.png`, new Resvg(await Bun.file(`${output}/${name}.svg`).text()).render().asPng())
}
console.log(`Retained raster, two SVG treatments and receipts in ${output}`)
