import { createHash } from "node:crypto"
import { lstat, readFile, realpath } from "node:fs/promises"
import { dirname, join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"

const watched = ["/node_modules/@hugeicons/core-free-icons/dist/esm/index.js", "/node_modules/@stylexjs/stylex/lib/es/stylex.mjs"]
const digest = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex")
let active = false

/** Failure-only evidence for the two installed inputs misparsed in Linux CI.
 * Package bytes, plugin callbacks, returned objects and compiler assertions stay
 * unchanged. The existing compilation owner must join this operation fully. */
export async function observeCompilation<T>(root: string, operation: () => Promise<T>,
  runtime: Pick<typeof Bun, "build"> = Bun, report: (line: string) => void = console.error): Promise<T> {
  if (active) throw new Error("Compilation observation already owned")
  active = true
  const original = runtime.build
  const rows: Record<string, unknown>[] = []
  const manifests: Record<string, unknown>[] = []
  const inputs: Record<string, unknown>[] = []
  const builds: Record<string, unknown>[] = []
  const observations: Promise<void>[] = []
  let buildSequence = 0, omittedBuilds = 0
  let omitted = 0, sequence = 0
  let installed = false
  async function snapshot(path: string) {
    const physical = await realpath(path)
    if (!physical.startsWith(root + sep)) throw new Error("Observed dependency escaped source root")
    const info = await lstat(physical)
    if (!info.isFile() || info.size > 8 * 1024 * 1024) throw new Error("Observed dependency exceeds finite file bound")
    const bytes = await readFile(physical)
    if (bytes.length !== info.size) throw new Error("Observed dependency size changed")
    return { path: relative(root, physical), device: info.dev, inode: info.ino, mode: info.mode, mtimeMs: info.mtimeMs, bytes: bytes.length, sha256: digest(bytes), prefix: bytes.subarray(0, 96).toString("utf8") }
  }
  function recordBuild(config: Bun.BuildConfig, invoke: () => ReturnType<typeof Bun.build>): ReturnType<typeof Bun.build> {
    const entrypoints = config.entrypoints ?? []
    const known = entrypoints.length <= 4 && entrypoints.every(path => /(?:^|\/)(?:theme|analytics|site-renderer|preview-renderer)\.ts$/u.test(path))
    const row: Record<string, unknown> = { sequence: ++buildSequence, entrypoints: known ? entrypoints.map(path => relative(root, path)) : "outside-finite-entrypoints", target: config.target, plugins: (config.plugins ?? []).slice(0, 8).map(plugin => plugin.name.slice(0, 128)) }
    if (builds.length < 16) builds.push(row); else omittedBuilds++
    try {
      const result = invoke()
      // Observe, but return the exact native promise. No onLoad or compiler
      // options are added to plugin-free builds such as the appearance bundle.
      if (builds.includes(row)) observations.push(Promise.resolve(result).then(value => {
        row.success = value.success
        row.logCount = value.logs.length
        row.logs = value.logs.slice(0, 8).map(log => ({ level: log.level, message: log.message.slice(0, 512) }))
      }, error => { row.rejected = String(error).slice(0, 512) }).catch(error => { row.observationError = String(error).slice(0, 256) }))
      return result
    } catch (error) { row.thrown = String(error).slice(0, 512); throw error }
  }
  const replacement: typeof Bun.build = function(this: typeof Bun, config: Bun.BuildConfig) {
    if (!config.plugins?.some(plugin => plugin.name.startsWith("hraness-ui-stylex-"))) return recordBuild(config, () => original.call(this, config))
    const plugins = config.plugins.map(plugin => {
      if (!plugin.name.startsWith("hraness-ui-stylex-")) return plugin
      return new Proxy(plugin, { get(target, key, receiver) {
        if (key !== "setup") return Reflect.get(target, key, receiver)
        return (builder: Bun.PluginBuilder) => target.setup(new Proxy(builder, { get(owner, property, proxy) {
          if (property !== "onLoad") {
            const value = Reflect.get(owner, property, proxy)
            return typeof value === "function" ? value.bind(owner) : value
          }
          return (constraints: Bun.PluginConstraints, callback: Bun.OnLoadCallback) => owner.onLoad(constraints, function(args) {
            if (!watched.some(suffix => args.path.endsWith(suffix))) return callback(args)
            const row: Record<string, unknown> = { graph: target.name, sequence: ++sequence, logicalPath: relative(root, args.path), namespace: args.namespace }
            if (rows.length < 32) rows.push(row); else omitted++
            return (async () => {
              try { row.before = await snapshot(args.path) } catch (error) { row.beforeError = String(error).slice(0, 256) }
              try {
                const result = await callback(args)
                if (result && "contents" in result) {
                  const contents = result.contents
                  if (typeof contents === "string") row.returned = { loader: result.loader, bytes: Buffer.byteLength(contents), sha256: digest(contents), prefix: contents.slice(0, 96) }
                  else row.returned = { loader: result.loader, kind: typeof contents }
                } else row.returned = { kind: result === undefined ? "undefined" : typeof result }
                try { row.after = await snapshot(args.path) } catch (error) { row.afterError = String(error).slice(0, 256) }
                return result
              } catch (error) { row.callbackError = String(error).slice(0, 512); throw error }
            })()
          })
        } }))
      } })
    })
    return recordBuild(config, () => original.call(this, { ...config, plugins }))
  }
  try {
    for (const name of ["@hraness/ui", "@hraness/design-kit", "@hraness/site-footer"]) {
      try { manifests.push({ name, ...await snapshot(fileURLToPath(import.meta.resolve(`${name}/stylex-manifest.json`))) }) }
      catch (error) { manifests.push({ name, error: String(error).slice(0, 256) }) }
    }
    for (const name of ["@hugeicons/core-free-icons", "@stylexjs/stylex"] as const) {
      const row: Record<string, unknown> = { name }
      inputs.push(row)
      try {
        const path = name === "@hugeicons/core-free-icons"
          ? fileURLToPath(import.meta.resolve(name))
          : join(dirname(fileURLToPath(import.meta.resolve(`${name}/package.json`))), "lib/es/stylex.mjs")
        row.logicalPath = relative(root, path)
        row.before = await snapshot(path)
      } catch (error) { row.beforeError = String(error).slice(0, 256) }
    }
    runtime.build = replacement
    installed = true
    const result = await operation()
    await Promise.all(observations)
    return result
  } catch (error) {
    // Only the two public installed modules are sampled. No environment,
    // credentials, arbitrary source text or full build options enter the log.
    await Promise.all(observations)
    for (const row of inputs) {
      try {
        if (typeof row.logicalPath !== "string") throw new Error("Installed input did not resolve")
        row.after = await snapshot(join(root, row.logicalPath))
      } catch (failure) { row.afterError = String(failure).slice(0, 256) }
    }
    try { report(JSON.stringify({ kind: "slopcamera-compiler-input-observation-v1", manifests, inputs, builds, omittedBuilds, rows, omitted })) }
    catch { /* Reporting must not replace the original compilation failure. */ }
    throw error
  } finally {
    active = false
    if (installed) {
      if (runtime.build !== replacement) throw new Error("Compilation observer lost build ownership")
      runtime.build = original
    }
  }
}
