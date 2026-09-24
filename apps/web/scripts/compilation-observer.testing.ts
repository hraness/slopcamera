import { createHash } from "node:crypto"
import { spawn } from "node:child_process"
import { lstat, readFile, readdir, realpath } from "node:fs/promises"
import { dirname, join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"

const watched = ["/node_modules/@hugeicons/core-free-icons/dist/esm/index.js", "/node_modules/@stylexjs/stylex/lib/es/stylex.mjs"]
const digest = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex")
let active = false

/** Only the actual, plugin-free theme call can enter the diagnostic child. */
export function themeDiagnosticConfig(config: Bun.BuildConfig, root: string): string | null {
  const keys = ["define", "entrypoints", "env", "format", "minify", "sourcemap", "target"]
  if (Object.keys(config).sort().join() !== keys.sort().join()
    || config.entrypoints?.length !== 1 || config.entrypoints[0] !== join(root, "apps/web/src/theme.ts")
    || config.env !== "disable" || config.format !== "iife" || config.minify !== true
    || config.sourcemap !== "none" || config.target !== "browser") return null
  const define = config.define
  if (!define || Object.keys(define).sort().join() !== ["__SLOPCAMERA_DARK_THEME_COLOR__", "__SLOPCAMERA_LIGHT_THEME_COLOR__"].join()
    || Object.values(define).some(value => !/^"#[a-f0-9]{6}"$/u.test(value))) return null
  return JSON.stringify(config)
}

async function freshThemeProbe(root: string, input: string) {
  const helper = fileURLToPath(import.meta.url), helperHash = digest(await readFile(helper))
  const assets = join(root, "apps/web/dist/assets")
  const names = (await readdir(assets)).filter(name => /^theme-[a-f0-9]{12}\.js$/u.test(name))
  if (names.length !== 1) throw new Error("Diagnostic requires exactly one retained initial theme artifact")
  const baselinePath = await realpath(join(assets, names[0]!))
  const baselineInfo = await lstat(baselinePath)
  if (!baselinePath.startsWith(root + sep) || !baselineInfo.isFile() || baselineInfo.size > 64 * 1024) throw new Error("Unqualified initial theme file")
  const baseline = await readFile(baselinePath)
  if (baseline.length > 64 * 1024 || names[0] !== `theme-${digest(baseline).slice(0, 12)}.js`) throw new Error("Unqualified initial theme artifact")
  const child = spawn(process.execPath, [helper, "--theme-probe", root], {
    cwd: root, env: { PATH: process.env.PATH ?? "", NO_COLOR: "1" }, detached: true, stdio: ["pipe", "pipe", "pipe"],
  })
  const pid = child.pid
  if (pid === undefined || pid <= 1) throw new Error("Diagnostic child did not start")
  let stdout = Buffer.alloc(0), stderr = Buffer.alloc(0), reason: string | undefined, closed = false, forced = false
  let wake = () => {}
  const stopped = new Promise<void>(resolve => { wake = resolve })
  const stop = (value: string) => { reason ??= value; wake() }
  const alive = () => { try { process.kill(-pid, 0); return true } catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") return false; throw error } }
  const signal = (name: NodeJS.Signals) => { if (alive()) try { process.kill(-pid, name) } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error } }
  const gone = async (ms: number) => { const until = Date.now() + ms; while (alive() && Date.now() < until) await Bun.sleep(25); return !alive() }
  const close = new Promise<void>(resolve => { child.once("close", () => { closed = true; resolve() }) })
  child.once("error", error => stop(String(error)))
  child.stdout.on("data", (bytes: Buffer) => { if (stdout.length + bytes.length > 128 * 1024) stop("Diagnostic stdout exceeded128KiB"); else stdout = Buffer.concat([stdout, bytes]) })
  child.stderr.on("data", (bytes: Buffer) => { if (stderr.length + bytes.length > 128 * 1024) stop("Diagnostic stderr exceeded128KiB"); else stderr = Buffer.concat([stderr, bytes]) })
  for (const stream of [child.stdin, child.stdout, child.stderr]) stream.on("error", error => stop(String(error)))
  const timer = setTimeout(() => stop("Diagnostic child exceeded45seconds"), 45000)
  const signals = ["SIGINT", "SIGTERM", "SIGHUP"] as const
  const handlers = signals.map(name => () => stop("Interrupted by " + name))
  signals.forEach((name, index) => process.on(name, handlers[index]!))
  try {
    child.stdin.end(input)
    await Promise.race([close, stopped])
    if (reason === undefined && alive() && !await gone(500)) stop("Diagnostic left a live process group")
  } finally {
    clearTimeout(timer)
    try {
      signal("SIGTERM")
      if (!await gone(2000)) { forced = true; signal("SIGKILL"); if (!await gone(3000)) throw new Error("Diagnostic group survived SIGKILL") }
      await Promise.race([close, Bun.sleep(1000)])
      if (!closed) throw new Error("Diagnostic pipes did not close")
    } finally {
      if (!closed) { child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy() }
      signals.forEach((name, index) => process.off(name, handlers[index]!))
    }
  }
  if ((await lstat(baselinePath)).size !== baseline.length || digest(await readFile(helper)) !== helperHash || digest(await readFile(baselinePath)) !== digest(baseline)) throw new Error("Diagnostic inputs changed")
  return { helperHash, baseline: { path: relative(root, baselinePath), bytes: baseline.length, sha256: digest(baseline) },
    configSha256: digest(input), exitCode: child.exitCode, signal: child.signalCode, forced, reason,
    groupCollected: !alive(), pipesClosed: closed, stderr: stderr.subarray(0, 2048).toString(),
    result: child.exitCode === 0 && !reason && !forced ? JSON.parse(stdout.toString()) as unknown : null }
}

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
  let themeConfig: string | null = null
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
    themeConfig = themeDiagnosticConfig(config, root)
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
          ? Bun.resolveSync(name, dirname(fileURLToPath(import.meta.resolve("@hraness/design-kit/browser"))))
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
    let freshProcess: unknown = null
    if (runtime === Bun && themeConfig !== null && builds.at(-1)?.rejected !== undefined) {
      try { freshProcess = await freshThemeProbe(root, themeConfig) }
      catch (failure) { freshProcess = { error: String(failure).slice(0, 512) } }
      for (const row of inputs) {
        try { if (typeof row.logicalPath === "string") row.afterProbe = await snapshot(join(root, row.logicalPath)) }
        catch (failure) { row.afterProbeError = String(failure).slice(0, 256) }
      }
    }
    try { report(JSON.stringify({ kind: "slopcamera-compiler-input-observation-v1", manifests, inputs, builds, omittedBuilds, rows, omitted, freshProcess })) }
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

// Diagnostic entry only: repeat the exact failed plugin-free build in one fresh
// process. Its outputs are observations, never replacements for a failed test.
if (import.meta.main) {
  if (process.argv.length !== 4 || process.argv[2] !== "--theme-probe") throw new Error("Unexpected diagnostic invocation")
  const root = await realpath(process.argv[3]!)
  let input = ""
  for await (const bytes of Bun.stdin.stream()) {
    input += new TextDecoder().decode(bytes)
    if (Buffer.byteLength(input) > 16384) throw new Error("Diagnostic config exceeded16KiB")
  }
  const config = JSON.parse(input) as Bun.BuildConfig
  if (themeDiagnosticConfig(config, root) !== input) throw new Error("Diagnostic config is not exact finite theme build")
  const results: unknown[] = []
  for (let sequence = 1; sequence <= 2; sequence++) {
    try {
      const result = await Bun.build(config)
      if (result.outputs.length !== 1) throw new Error("Diagnostic expected one theme output")
      const outputs = []
      for (const output of result.outputs) {
        if (output.size > 64 * 1024) throw new Error("Diagnostic output exceeded64KiB")
        const bytes = new Uint8Array(await output.arrayBuffer())
        outputs.push({ bytes: bytes.length, sha256: digest(bytes), type: output.type })
      }
      results.push({ sequence, success: result.success, outputs, logCount: result.logs.length,
        logs: result.logs.slice(0, 8).map(log => ({ level: log.level, message: log.message.slice(0, 512) })) })
    } catch (error) { results.push({ sequence, rejected: String(error).slice(0, 512),
      errors: error instanceof AggregateError ? error.errors.slice(0, 8).map(value => String(value).slice(0, 512)) : [] }) }
  }
  console.log(JSON.stringify({ kind: "slopcamera-fresh-theme-diagnostic-v1", bun: Bun.version, configSha256: digest(input), results }))
}
