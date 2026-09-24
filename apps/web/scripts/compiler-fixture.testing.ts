import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { writeFileSync } from "node:fs"
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises"
import { basename, dirname, isAbsolute, join } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import type { buildWebsite } from "./build"

type Options = NonNullable<Parameters<typeof buildWebsite>[0]>
type Result = Awaited<ReturnType<typeof buildWebsite>>
const inputLimit = 16 * 1024
const outputLimit = 2 * 1024 * 1024
const errorLimit = 128 * 1024
const resultDirectoryPrefix = join(tmpdir(), "slopcamera-web-result-")
const resultFileName = "result.frame"

/** A single exact length frame is the complete result file; human output never enters it. */
export function encodeCompilerFrame(value: unknown): Buffer {
  const json = JSON.stringify(value)
  assert(typeof json === "string")
  const payload = Buffer.from(json, "utf8")
  assert(payload.length > 0 && payload.length <= outputLimit)
  const header = Buffer.alloc(4)
  header.writeUInt32BE(payload.length)
  return Buffer.concat([header, payload])
}

export function decodeCompilerFrame(frame: Buffer): unknown {
  assert(frame.length >= 4 && frame.length <= outputLimit + 4)
  const length = frame.readUInt32BE(0)
  assert(length > 0 && length <= outputLimit && frame.length === length + 4)
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(frame.subarray(4)))
}

/** The result file sits directly inside one fresh parent-owned temporary directory. The frame
 * does not travel on a fourth stdio pipe: under Bun 1.3.14 on macOS the parent's read end of an
 * extra pipe closed beneath a long-running detached compiler child (child EPIPE, empty result in
 * the 2026-09-24 complete check) and the child's close event could stay withheld. */
export function assertCompilerResultPath(path: string): string {
  assert(typeof path === "string" && path.length > 0 && path.length <= 4096 && isAbsolute(path))
  assert(!path.split(/[\\/]/u).includes(".."))
  assert.equal(basename(path), resultFileName)
  const directory = dirname(path)
  assert(directory.startsWith(resultDirectoryPrefix) && directory.length > resultDirectoryPrefix.length)
  assert.equal(dirname(directory), dirname(resultDirectoryPrefix))
  return path
}

async function readCompilerResultFile(path: string): Promise<Buffer> {
  assertCompilerResultPath(path)
  assert.deepEqual(await readdir(dirname(path)), [resultFileName], "Compiler result directory must hold exactly the result file")
  const stats = await stat(path)
  assert(stats.isFile() && stats.size >= 4 && stats.size <= outputLimit + 4, "Compiler result file is outside the frame bounds")
  const frame = await readFile(path)
  assert.equal(frame.length, stats.size)
  return frame
}

/** The test fixture accepts data only; the child imports the real fixed builder. */
export function encodeCompilerOptions(options: Options): string {
  assert.deepEqual(Object.getPrototypeOf(options), Object.prototype)
  assert(Object.keys(options).every(key => key === "environment" || key === "outputDirectory"))
  const environment = options.environment
  assert(environment !== undefined && Object.getPrototypeOf(environment) === Object.prototype)
  assert(Object.keys(environment).every(key => ["NEXT_PUBLIC_POSTHOG_HOST", "NEXT_PUBLIC_POSTHOG_KEY", "VERCEL_ENV"].includes(key)))
  assert(Object.values(environment).every(value => typeof value === "string" && value.length <= 1024))
  if (options.outputDirectory !== undefined) {
    assert(isAbsolute(options.outputDirectory))
    assert(options.outputDirectory.startsWith(join(tmpdir(), "slopcamera-web-")))
    assert(!options.outputDirectory.split(/[\\/]/u).includes(".."))
  }
  const encoded = JSON.stringify(options)
  assert(Buffer.byteLength(encoded) <= inputLimit)
  return encoded
}

export function decodeCompilerResult(value: unknown): Result {
  assert(value !== null && typeof value === "object" && !Array.isArray(value))
  const result = value as Record<string, unknown>
  const arrays = ["previewArtifacts", "siteArtifacts", "siteAttributions"]
  const paths = ["previewEvidenceDirectory", "previewFoundationPath", "previewStylesPath", "stylesPath", "siteEvidenceDirectory", "siteFoundationPath", "themePath"]
  assert.deepEqual(Object.keys(result).sort(), ["analyticsPath", ...arrays, ...paths].sort())
  assert(result.analyticsPath === null || typeof result.analyticsPath === "string" && /^\/assets\/analytics-[a-f0-9]{12}\.js$/u.test(result.analyticsPath))
  for (const key of paths) assert(typeof result[key] === "string" && result[key].length > 0 && result[key].length <= 4096)
  for (const key of arrays) {
    const entries = result[key]
    assert(Array.isArray(entries) && entries.length <= 4096)
    for (const entry of entries) {
      assert(entry !== null && typeof entry === "object" && !Array.isArray(entry))
      assert.deepEqual(Object.keys(entry).sort(), ["bytes", "path", "sha256"])
      assert(Number.isSafeInteger(entry.bytes) && entry.bytes >= 0 && entry.bytes <= 16 * 1024 * 1024)
      assert(typeof entry.path === "string" && entry.path.length <= 512 && entry.path.split("/").every((part: string) => part !== "." && part !== ".." && /^[A-Za-z0-9_.-]+$/u.test(part)))
      assert(typeof entry.sha256 === "string" && /^[a-f0-9]{64}$/u.test(entry.sha256))
    }
  }
  return result as Result
}

/** Each real fixture gets the same process lifetime as the production CLI.
 * No builder, compiler option, output comparison or deadline is substituted. */
export async function compileWebsiteInChild(options: Options, signal: AbortSignal): Promise<Result> {
  signal.throwIfAborted()
  const input = encodeCompilerOptions(options)
  const resultDirectory = await mkdtemp(resultDirectoryPrefix)
  try {
    return await compileWithResultFile(input, assertCompilerResultPath(join(resultDirectory, resultFileName)), signal)
  } finally {
    await rm(resultDirectory, { force: true, recursive: true })
  }
}

async function compileWithResultFile(input: string, resultPath: string, signal: AbortSignal): Promise<Result> {
  signal.throwIfAborted()
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "--compile", resultPath], {
    cwd: process.cwd(), env: process.env, detached: true, stdio: ["pipe", "pipe", "pipe"],
  })
  const pid = child.pid
  if (pid === undefined || pid <= 1) throw new Error("Compiler fixture child did not start")
  let stdout = Buffer.alloc(0), stderr = Buffer.alloc(0), reason: string | undefined, closed = false, forced = false
  let wake = () => {}
  const stopped = new Promise<void>(resolve => { wake = resolve })
  const stop = (value: string) => { reason ??= value; wake() }
  const alive = () => { try { process.kill(-pid, 0); return true } catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") return false; throw error } }
  const send = (name: NodeJS.Signals) => { if (alive()) try { process.kill(-pid, name) } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error } }
  const gone = async (ms: number) => { const until = Date.now() + ms; while (alive() && Date.now() < until) await Bun.sleep(25); return !alive() }
  const close = new Promise<void>(resolve => { child.once("close", () => { closed = true; resolve() }) })
  child.once("error", error => stop(String(error)))
  child.stdout.on("data", (bytes: Buffer) => { if (stdout.length + bytes.length > outputLimit) stop("Compiler fixture stdout exceeded2MiB"); else stdout = Buffer.concat([stdout, bytes]) })
  child.stderr.on("data", (bytes: Buffer) => { if (stderr.length + bytes.length > errorLimit) stop("Compiler fixture stderr exceeded128KiB"); else stderr = Buffer.concat([stderr, bytes]) })
  for (const stream of [child.stdin, child.stdout, child.stderr]) stream.on("error", error => stop(String(error)))
  const timer = setTimeout(() => stop("Compiler fixture exceeded60000ms"), 60_000)
  const abort = () => stop("Compiler fixture admission has ended")
  signal.addEventListener("abort", abort, { once: true })
  const signals = ["SIGINT", "SIGTERM", "SIGHUP"] as const
  const handlers = signals.map(name => () => stop("Interrupted by " + name))
  signals.forEach((name, index) => process.on(name, handlers[index]!))
  try {
    if (signal.aborted) abort()
    else child.stdin.end(input)
    await Promise.race([close, stopped])
    if (reason === undefined && alive() && !await gone(500)) stop("Compiler fixture left a live process group")
  } finally {
    clearTimeout(timer)
    try {
      send("SIGTERM")
      if (!await gone(2000)) { forced = true; send("SIGKILL"); if (!await gone(3000)) throw new Error("Compiler fixture group survived SIGKILL") }
      await Promise.race([close, Bun.sleep(1000)])
      if (!closed) throw new Error("Compiler fixture pipes did not close")
    } finally {
      if (!closed) { child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy() }
      signal.removeEventListener("abort", abort)
      signals.forEach((name, index) => process.off(name, handlers[index]!))
    }
  }
  assert(!forced && closed && !alive(), "Compiler fixture cleanup was not graceful")
  if (reason !== undefined) throw new Error(reason)
  let response: unknown
  try { response = decodeCompilerFrame(await readCompilerResultFile(resultPath)) } catch (error) {
    const resultBytes = await stat(resultPath).then(stats => stats.size, () => null)
    console.error(JSON.stringify({ kind: "slopcamera-compiler-transport-failure-v1", stdout: stdout.toString("utf8"), stderr: stderr.toString("utf8"), resultPath, resultBytes }))
    throw error
  }
  assert(response !== null && typeof response === "object" && !Array.isArray(response))
  const record = response as Record<string, unknown>
  assert.equal(record.bun, Bun.version)
  if (record.ok === false) {
    assert.deepEqual(Object.keys(record).sort(), ["bun", "error", "ok"])
    assert.equal(child.exitCode, 1)
    assert(typeof record.error === "string" && Buffer.byteLength(record.error) <= errorLimit)
    throw new Error(record.error)
  }
  assert.equal(child.exitCode, 0, stderr.toString())
  assert.deepEqual(Object.keys(record).sort(), ["bun", "ok", "result"])
  assert.equal(record.ok, true)
  return decodeCompilerResult(record.result)
}

if (import.meta.main) {
  const [flag, resultPath, ...rest] = process.argv.slice(2)
  assert.equal(flag, "--compile")
  assert(resultPath !== undefined && rest.length === 0)
  assertCompilerResultPath(resultPath)
  let input = Buffer.alloc(0)
  for await (const chunk of Bun.stdin.stream()) {
    assert(input.length + chunk.length <= inputLimit)
    input = Buffer.concat([input, chunk])
  }
  const options = JSON.parse(input.toString("utf8")) as Options
  assert.equal(encodeCompilerOptions(options), input.toString("utf8"))
  let frame: Buffer
  try {
    const { buildWebsite: compile } = await import("./build")
    const result = await compile(options)
    decodeCompilerResult(result)
    frame = encodeCompilerFrame({ ok: true, bun: Bun.version, result })
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error)
    if (Buffer.byteLength(message) > errorLimit) throw new Error("Compiler error exceeded128KiB")
    frame = encodeCompilerFrame({ ok: false, bun: Bun.version, error: message })
    process.exitCode = 1
  }
  // Exclusive creation writes the one result exactly once; a stale or second file fails.
  writeFileSync(resultPath, frame, { flag: "wx" })
}
