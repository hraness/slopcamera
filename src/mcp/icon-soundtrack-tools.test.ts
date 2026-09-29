import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { COLLECTION_PRESETS } from "@hraness/iconplace/collections"
import type { HostResourceClaim, HostResourceCoordinator } from "../host-resources.ts"
import { SlopcameraMcpToolRuntime } from "./tools.ts"
import type { McpToolResult } from "./types.ts"

function coordinator(claims: HostResourceClaim[][]): HostResourceCoordinator {
  const profile = { id: "slopcamera.mcp-test-host/v1", capacities: [] } as const
  return {
    profile,
    scope: "process",
    async withLease(requested, callback) {
      claims.push([...requested])
      return await callback({
        claims: requested,
        inheritedFileDescriptor: 97,
        profile,
        ticket: String(claims.length),
        assertOwned: () => Promise.resolve(),
      })
    },
  }
}

function errorCode(result: McpToolResult): string | undefined {
  if (result.isError !== true) return undefined
  expect(result).not.toHaveProperty("structuredContent")
  return /\[([A-Z_]+)\]/u.exec(result.content[0]?.text ?? "")?.[1]
}

const song = `title Two part
bpm 120
bars 2

section Verse
drums
kick:  x.......x....... | x.......x.......

section Hook
drums
kick:  x...x...x...x... | x...x...x...x...
`

describe("icon and soundtrack MCP tools", () => {
  test("run root-relative, return structured receipts, and claim local resources", async () => {
    const root = await mkdtemp(join(tmpdir(), "slopcamera-mcp-icon-"))
    try {
      const composition = COLLECTION_PRESETS[0]!.composition
      await writeFile(join(root, "scene.json"), JSON.stringify(composition))
      await writeFile(join(root, "song.song"), song)
      const claims: HostResourceClaim[][] = []
      const runtime = await SlopcameraMcpToolRuntime.create(root, {}, coordinator(claims))

      const composed = await runtime.call("compose_icon", { path: "scene.json", output: "out/solved.json" })
      expect(composed.isError).not.toBe(true)
      expect(composed.structuredContent).toMatchObject({ ok: true, operation: "slopcamera.icon.compose", receipt: { form: "scene" } })
      expect(JSON.stringify(composed.structuredContent)).not.toContain(root)

      const rendered = await runtime.call("render_icon", {
        path: "scene.json",
        output: "out/scene.svg",
        recipe: "out/scene.recipe.json",
        size: 64,
        palette: "ink",
      })
      expect(rendered.structuredContent).toMatchObject({ operation: "slopcamera.icon.render", receipt: { width: 64 } })
      expect(await readFile(join(root, "out/scene.svg"), "utf8")).toStartWith("<svg")
      const replay = await runtime.call("render_icon", { path: "out/scene.recipe.json", output: "out/replay.svg" })
      expect(replay.structuredContent).toMatchObject({ receipt: { replayed: true } })

      const verified = await runtime.call("compose_soundtrack", { path: "song.song" })
      expect(verified.structuredContent).toMatchObject({ receipt: { kind: "song", bpm: 120, sections: 2 } })
      const grid = await runtime.call("derive_soundtrack_grid", {
        path: "song.song",
        output: "out/grid.json",
        start_us: 500_000,
      })
      expect(grid.structuredContent).toMatchObject({
        receipt: { music: { bpm: 120, beatOffsetUs: 500_000, beatsPerBar: 4 } },
      })
      expect(JSON.parse(await readFile(join(root, "out/grid.json"), "utf8"))).toMatchObject({
        music: { bpm: 120, beatOffsetUs: 500_000, beatsPerBar: 4 },
      })

      expect(claims).toHaveLength(5)
      for (const claim of claims) {
        expect(claim.map(({ resource }) => resource).sort()).toEqual(["cpu", "local-io"])
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("reject escapes, unknown arguments, and out-of-range values before execution", async () => {
    const root = await mkdtemp(join(tmpdir(), "slopcamera-mcp-icon-boundary-"))
    const outside = await mkdtemp(join(tmpdir(), "slopcamera-mcp-icon-outside-"))
    try {
      await writeFile(join(root, "scene.json"), JSON.stringify(COLLECTION_PRESETS[0]!.composition))
      await writeFile(join(root, "song.song"), song)
      await writeFile(join(outside, "escape.json"), "{}")
      await symlink(join(outside, "escape.json"), join(root, "escape.json"))
      await mkdir(join(outside, "writes"))
      await symlink(join(outside, "writes"), join(root, "outside-output"))
      const claims: HostResourceClaim[][] = []
      const runtime = await SlopcameraMcpToolRuntime.create(root, {}, coordinator(claims))
      const code = async (name: string, args: Record<string, unknown>) =>
        errorCode(await runtime.call(name, args))

      expect(await code("compose_icon", { path: "../scene.json" })).toBe("INVALID_PATH")
      expect(await code("compose_icon", { path: "escape.json" })).toBe("PATH_OUTSIDE_ROOT")
      expect(await code("render_icon", { path: "scene.json", output: "outside-output/x.svg" })).toBe("PATH_OUTSIDE_ROOT")
      // Paths resolve inside the lease; argument bounds reject before any lease.
      const leasesAfterPaths = claims.length
      expect(await code("render_icon", { path: "scene.json", output: "x.svg", size: 4096 })).toBe("INVALID_OPERATION_INPUT")
      expect(await code("render_icon", { path: "scene.json", output: "x.svg", palette: "neon" })).toBe("INVALID_OPERATION_INPUT")
      expect(await code("render_icon", { path: "scene.json" })).toBe("INVALID_OPERATION_INPUT")
      expect(await code("compose_icon", { path: "scene.json", extra: 1 })).toBe("INVALID_ARGUMENTS")
      expect(await code("compose_soundtrack", { path: "song.song", format: "wav" })).toBe("INVALID_OPERATION_INPUT")
      expect(await code("derive_soundtrack_grid", { path: "song.song", start_us: -1 })).toBe("INVALID_OPERATION_INPUT")
      expect(await code("derive_soundtrack_grid", { path: "song.song", start_us: 1.5 })).toBe("INVALID_OPERATION_INPUT")
      expect(claims).toHaveLength(leasesAfterPaths)
      expect(await code("compose_soundtrack", { path: "missing.song" })).toBeDefined()
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })
})
