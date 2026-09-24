import { expect, test } from "bun:test"
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { observeCompilation, themeDiagnosticConfig } from "./compilation-observer.testing"

test("fresh-process diagnostics admit only the unchanged finite theme build", () => {
  const root = "/owned/slopcamera"
  const config: Bun.BuildConfig = { define: {
    __SLOPCAMERA_DARK_THEME_COLOR__: '"#1e1e2e"', __SLOPCAMERA_LIGHT_THEME_COLOR__: '"#eff1f5"',
  }, entrypoints: [join(root, "apps/web/src/theme.ts")], env: "disable", format: "iife", minify: true, sourcemap: "none", target: "browser" }
  const before = JSON.stringify(config)
  expect(themeDiagnosticConfig(config, root)).toBe(before)
  expect(JSON.stringify(config)).toBe(before)
  expect(themeDiagnosticConfig({ ...config, plugins: [] }, root)).toBeNull()
  expect(themeDiagnosticConfig({ ...config, env: "inline" }, root)).toBeNull()
  expect(themeDiagnosticConfig({ ...config, entrypoints: ["/outside/theme.ts"] }, root)).toBeNull()
  expect(themeDiagnosticConfig({ ...config, define: { ...config.define, SECRET: '"outside"' } }, root)).toBeNull()
  expect(themeDiagnosticConfig({ ...config, define: { ...config.define, __SLOPCAMERA_DARK_THEME_COLOR__: "process.env.SECRET" } }, root)).toBeNull()
})

test("compiler observation preserves callback results, constraints, build options and restoration", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "slopcamera-observer-")))
  try {
    const path = join(root, "node_modules/@stylexjs/stylex/lib/es/stylex.mjs")
    await mkdir(join(path, ".."), { recursive: true })
    const contents = "export const bound = true;\n"
    await writeFile(path, contents)
    const returned = { contents, loader: "js" as const }
    const constraints = { filter: /\.mjs$/u }
    const callbacks: Bun.OnLoadCallback[] = []
    const builder = { onLoad(value: Bun.PluginConstraints, callback: Bun.OnLoadCallback) {
      expect(value).toBe(constraints); callbacks.push(callback); return this
    } } as Bun.PluginBuilder
    const plugin: Bun.BunPlugin = { name: "hraness-ui-stylex-test", setup(owner) { owner.onLoad(constraints, async () => returned) } }
    const config: Bun.BuildConfig = { entrypoints: [path], plugins: [plugin], target: "bun", minify: true }
    const output = { success: false, logs: [], outputs: [] } as unknown as Bun.BuildOutput
    const original = (async (actual: Bun.BuildConfig) => {
      expect(actual.entrypoints).toBe(config.entrypoints)
      expect(actual.target).toBe(config.target); expect(actual.minify).toBe(config.minify)
      await actual.plugins![0]!.setup(builder)
      expect(await callbacks.at(-1)!({ path, namespace: "file" } as Bun.OnLoadArgs)).toBe(returned)
      return output
    }) as typeof Bun.build
    const runtime = { build: original }, logs: string[] = []
    expect(await observeCompilation(root, () => runtime.build(config), runtime, line => logs.push(line))).toBe(output)
    expect(runtime.build).toBe(original); expect(logs).toHaveLength(0)
    const failure = new Error("original build failure")
    await expect(observeCompilation(root, async () => { await runtime.build(config); throw failure }, runtime, line => logs.push(line))).rejects.toBe(failure)
    expect(runtime.build).toBe(original); expect(logs).toHaveLength(1)
    const record = JSON.parse(logs[0]!)
    expect(record.kind).toBe("slopcamera-compiler-input-observation-v1")
    expect(record.rows).toHaveLength(1)
    expect(record.rows[0].returned.bytes).toBe(Buffer.byteLength(contents))
    expect(record.rows[0].returned.sha256).toBe(record.rows[0].before.sha256)
    expect(record.rows[0].after).toEqual(record.rows[0].before)
    expect(record.rows[0].returned.prefix).toBe(contents)
    expect(record.omitted).toBe(0)
  } finally { await rm(root, { recursive: true, force: true }) }
})


test("plugin-free observation preserves the exact build promise and finite phase diagnostics", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "slopcamera-observer-phase-")))
  try {
    const output = { success: true, logs: [], outputs: [] } as unknown as Bun.BuildOutput
    const promise = Promise.resolve(output)
    const config: Bun.BuildConfig = { entrypoints: [join(root, "apps/web/src/theme.ts")], target: "browser", minify: true }
    const original = ((value: Bun.BuildConfig) => { expect(value).toBe(config); return promise }) as typeof Bun.build
    const runtime = { build: original }, logs: string[] = [], failure = new Error("downstream source failure")
    await expect(observeCompilation(root, async () => {
      const observed = runtime.build(config)
      expect(observed).toBe(promise)
      expect(await observed).toBe(output)
      throw failure
    }, runtime, line => logs.push(line))).rejects.toBe(failure)
    expect(runtime.build).toBe(original)
    const record = JSON.parse(logs[0]!)
    expect(record.builds).toEqual([{ sequence: 1, entrypoints: ["apps/web/src/theme.ts"], target: "browser", plugins: [], success: true, logCount: 0, logs: [] }])
    expect(record.inputs.map((row: { name: string }) => row.name)).toEqual(["@hugeicons/core-free-icons", "@stylexjs/stylex"])
    expect(record.rows).toEqual([])
    expect(record.omittedBuilds).toBe(0)
  } finally { await rm(root, { recursive: true, force: true }) }
})
