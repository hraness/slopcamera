import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { writeSync } from "node:fs"
import { Readable } from "node:stream"
import { join, isAbsolute } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import type { buildWebsite } from "./build"

type Options = NonNullable<Parameters<typeof buildWebsite>[0]>
type Result = Awaited<ReturnType<typeof buildWebsite>>
const inputLimit = 16 * 1024
const outputLimit = 2 * 1024 * 1024
const errorLimit = 128 * 1024

/** A single exact length frame travels on fd3; human output never enters it. */
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

function writeCompilerFrame(value: unknown): void {
  const frame = encodeCompilerFrame(value)
  let offset = 0
  while (offset < frame.length) {
    const written = writeSync(3, frame, offset, frame.length - offset)
    assert(written > 0)
    offset += written
  }
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
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "--compile"], {
    cwd: process.cwd(), env: process.env, detached: true, stdio: ["pipe", "pipe", "pipe", "pipe"],
  })
  const pid = child.pid
  if (pid === undefined || pid <= 1) throw new Error("Compiler fixture child did not start")
  const resultPipe = child.stdio[3]
  assert(resultPipe instanceof Readable)
  let resultBytes = Buffer.alloc(0)
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
  resultPipe.on("data", (bytes: Buffer) => { if (resultBytes.length + bytes.length > outputLimit + 4) stop("Compiler fixture result exceeded2MiB frame"); else resultBytes = Buffer.concat([resultBytes, bytes]) })
  for (const stream of [child.stdin, child.stdout, child.stderr, resultPipe]) stream.on("error", error => stop(String(error)))
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
      if (!closed) { child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy(); resultPipe.destroy() }
      signal.removeEventListener("abort", abort)
      signals.forEach((name, index) => process.off(name, handlers[index]!))
    }
  }
  assert(!forced && closed && !alive(), "Compiler fixture cleanup was not graceful")
  if (reason !== undefined) throw new Error(reason)
  let response: unknown
  try { response = decodeCompilerFrame(resultBytes) } catch (error) {
    console.error(JSON.stringify({ kind: "slopcamera-compiler-transport-failure-v1", stdout: stdout.toString("utf8"), stderr: stderr.toString("utf8"), resultBytes: resultBytes.length }))
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
  assert.deepEqual(process.argv.slice(2), ["--compile"])
  let input = Buffer.alloc(0)
  for await (const chunk of Bun.stdin.stream()) {
    assert(input.length + chunk.length <= inputLimit)
    input = Buffer.concat([input, chunk])
  }
  const options = JSON.parse(input.toString("utf8")) as Options
  assert.equal(encodeCompilerOptions(options), input.toString("utf8"))
  try {
    const { buildWebsite: compile } = await import("./build")
    const result = await compile(options)
    decodeCompilerResult(result)
    writeCompilerFrame({ ok: true, bun: Bun.version, result })
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error)
    if (Buffer.byteLength(message) > errorLimit) throw new Error("Compiler error exceeded128KiB")
    writeCompilerFrame({ ok: false, bun: Bun.version, error: message })
    process.exitCode = 1
  }
}
