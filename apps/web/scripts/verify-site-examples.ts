#!/usr/bin/env bun

import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { constants } from "node:fs"
import { access, lstat, mkdir, mkdtemp, opendir, realpath, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, isAbsolute, join } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnVerificationServer, stopVerificationServer, type ManagedVerificationServer } from "@hraness/direct/tooling/browser-verification"
import { bounded, withPreviewCancellation } from "./preview-browser-contract"
import { readPreviewFile } from "./preview-file"
import { assertWorkerInputsUnchanged, assertWorkerProtocolSnapshot, decodeProfiledWorkerJson, encodeProfiledWorkerJson,
  readWorkerInput, workerDriverLimit, workerPhaseFiles, examplesWorkerProtocolLimit, type WorkerInputSnapshot } from "./preview-browser-protocol"
import { capturePreviewOutputTimeout, createPreviewEndpointWaiter, previewFailureSummary,
  type EndpointEvidence, type PreviewOutputTimeoutEvidence } from "./verify-preview-layout"
import { shellRecord, siteShellHeaders, type ShellPayload } from "./site-shell-browser-contract"
import { assertShellHeaders, assertShellSnapshotUnchanged, parseShellArguments, type ShellSnapshot, type ShellArtifact } from "./verify-site-shell"
import { snapshotMarketingPreset } from "./marketing-preset"
import { snapshotLanternMaterial } from "./lantern-material"
import { parseWorkflowExamples, workflowExampleAssets } from "../src/example-registry"
import { parseExamplesCaseFailure, parseExamplesPhase, parseExamplesRequest, examplesCaseNames, examplesDeadlineMs,
  examplesScope, examplesBaselineProfile, examplesBaselineRevision, examplesBaselineTree, examplesContentType,
  parseExampleByteRange, type ExamplesRequest, type ExampleVideoInput } from "./site-examples-browser-contract"
const appDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const digest = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex")
async function inventory(directory: string, root = directory, depth = 0): Promise<string[]> {
  assert.ok(depth <= 8)
  assert.equal(await realpath(directory), directory, "Shell input directory must be physical")
  const paths: string[] = []
  for await (const entry of await opendir(directory)) {
    assert.ok(/^[A-Za-z0-9_.\[\]-]+$/u.test(entry.name) && entry.name !== "." && entry.name !== "..")
    const path = join(directory, entry.name)
    if (entry.isDirectory()) paths.push(...await inventory(path, root, depth + 1))
    else {
      assert.ok(entry.isFile(), "Shell inventory rejects symlinks and special files")
      paths.push(path.slice(root.length + 1))
    }
    assert.ok(paths.length <= 512, "Excessive shell file inventory")
  }
  return paths.sort()
}
interface CandidateIdentity { readonly sha: string; readonly tree: string }
function candidateIdentity(directory: string): CandidateIdentity {
  const run = (...args: string[]) => execFileSync("git", ["-C", directory, ...args], { encoding: "utf8", timeout: 5_000, maxBuffer: 64 * 1024 })
  assert.equal(run("status", "--porcelain", "--untracked-files=all"), "", "Native acceptance requires a clean candidate checkout")
  const values = run("rev-parse", "HEAD", "HEAD^{tree}").trim().split("\n")
  assert.equal(values.length, 2); assert.ok(values.every(value => /^[a-f0-9]{40}$/u.test(value)))
  return { sha: values[0]!, tree: values[1]! }
}
export interface ExamplesSnapshot extends ShellSnapshot {
  readonly media: readonly ExampleVideoInput[]
  readonly presetSourceCommit: string
  readonly materialSourceCommit: string
}
async function readInventory(directory: string, paths: readonly string[], maximum: number) {
  const artifacts: ShellArtifact[] = [], files = new Map<string, Uint8Array>()
  let total = 0
  for (const path of paths) {
    const bytes = await readPreviewFile(join(directory, path))
    total += bytes.byteLength
    assert.ok(total <= maximum, "Examples snapshot exceeds its reviewed byte bound")
    artifacts.push({ path, bytes: bytes.byteLength, sha256: digest(bytes) })
    files.set(path, Uint8Array.from(bytes))
  }
  return { artifacts, files }
}
/** Read only a physical, bounded exact source/build closure. The caller owns
 * clean Git provenance and the independent baseline build/manifest. */
export async function readExamplesSnapshot(directory: string, current = true): Promise<ExamplesSnapshot> {
  assert.ok(isAbsolute(directory)); assert.equal(await realpath(directory), directory)
  const config: string[] = []
  for await (const entry of await opendir(directory)) {
    if (entry.isDirectory() || entry.name.startsWith(".")) continue
    assert.ok(entry.isFile() && (/\.(?:json|ts)$|^bun\.lock$/u.test(entry.name) || /^(?:AGENTS|README)\.md$/u.test(entry.name)))
    config.push(entry.name)
  }
  assert.ok(config.length <= 32)
  const paths = [...config]
  for (const part of ["src", "scripts", ...(current ? ["media"] : [])])
    paths.push(...(await inventory(join(directory, part))).map(path => `${part}/${path}`))
  assert.ok(paths.length <= 512)
  const input = await readInventory(directory, paths.sort(), 128 * 1024 * 1024)
  assertShellHeaders(JSON.parse(Buffer.from(await readPreviewFile(join(directory, "vercel.json"), 64 * 1024)).toString()))
  const preset = await snapshotMarketingPreset(join(directory, "vendor/marketing-preset"))
  const material = await snapshotLanternMaterial(join(directory, "vendor/lantern-material"))
  for (const [name, snapshot] of [["marketing-preset", preset], ["lantern-material", material]] as const) {
    const provenance = await readPreviewFile(join(directory, `vendor/${name}/provenance.json`), 32 * 1024)
    for (const [path, bytes] of [...snapshot.files, ["provenance.json", provenance] as const])
      input.artifacts.push({ path: `vendor/${name}/${path}`, bytes: bytes.byteLength, sha256: digest(bytes) })
  }
  const dist = join(directory, "dist"), outputPaths = await inventory(dist)
  assert.ok(outputPaths.length <= 256, "Examples output exceeds reviewed artifact inventory")
  const output = await readInventory(dist, outputPaths, 128 * 1024 * 1024)
  assert.deepEqual(await inventory(dist), outputPaths)
  const files = new Map<string, Uint8Array>()
  for (const [path, bytes] of output.files) {
    files.set(path === "index.html" ? "/" : `/${path}`, bytes)
    if (path === "docs/index.html") files.set("/docs", bytes)
    else if (path.startsWith("docs/") && path.endsWith(".html")) files.set(`/${path.slice(0, -5)}`, bytes)
  }
  const sheets: string[][] = []
  for (const route of ["/", "/404.html"]) {
    const bytes = files.get(route); assert.ok(bytes && bytes.byteLength <= 512 * 1024)
    const html = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    assert.ok(!/\{\{[^{}]*\}\}|\s(?:on\w+|style)\s*=|<(?:iframe|object|embed)\b/iu.test(html))
    const css = [...html.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/?\s*>/gu)].map(match => match[1]!)
    assert.equal(css.length, 2); assert.equal(new Set(css).size, 2)
    for (const path of css) assert.ok(files.has(path) && path.endsWith(".css"))
    for (const [, path] of html.matchAll(/<(?:script|img|source|track)\b[^>]*\bsrc="([^"]+)"/gu))
      assert.ok(path && files.has(path), `Unbound executable/media source ${path}`)
    sheets.push(css)
  }
  assert.deepEqual(sheets[0], sheets[1]); assert.match(sheets[0]![1]!, /^\/assets\/site-[a-f0-9]{64}\.css$/u)
  const media: ExampleVideoInput[] = []
  if (current) {
    const records = parseWorkflowExamples(JSON.parse(Buffer.from(input.files.get("media/examples.json")!).toString()))
    let mediaBytes = 0
    for (const asset of workflowExampleAssets(records)) {
      const bytes = files.get(`/assets/examples/${asset.file}`)
      assert.ok(bytes && bytes.byteLength === asset.bytes && digest(bytes) === asset.sha256, `Published media bytes differ: ${asset.file}`)
      mediaBytes += asset.bytes
    }
    assert.ok(mediaBytes <= 64 * 1024 * 1024)
    const sourcePaths = new Map<string, string>()
    for (const record of records) {
      for (const source of record.source.files) {
        const previous = sourcePaths.get(source.path)
        assert.ok(previous === undefined || previous === source.sha256, "Conflicting example source identities")
        sourcePaths.set(source.path, source.sha256)
      }
      if (record.video) media.push({ id: record.id, path: `/assets/examples/${record.video.file}`, sha256: record.video.sha256,
        poster: `/assets/examples/${record.poster.file}`, guide: `/docs/${record.guideSlug}`, width: record.video.width,
        height: record.video.height, durationSeconds: record.video.durationSeconds, hasAudio: record.video.hasAudio,
        ...(record.video.captions ? { captions: `/assets/examples/${record.video.captions.file}` } : {}) })
    }
    for (const [path, sha256] of sourcePaths) {
      assert.ok(/^examples\/[A-Za-z0-9_./-]+$/u.test(path) && !path.split("/").includes(".."))
      const bytes = await readPreviewFile(join(dirname(dirname(directory)), path))
      assert.equal(digest(bytes), sha256, `Example source digest differs: ${path}`)
      input.artifacts.push({ path: `../../${path}`, bytes: bytes.byteLength, sha256 })
    }
  }
  assert.ok(input.artifacts.length <= 512, "Examples source closure exceeds its reviewed inventory")
  assert.equal(new Set(input.artifacts.map(item => item.path)).size, input.artifacts.length, "Duplicate source closure entry")
  assert.ok(input.artifacts.reduce((total, item) => total + item.bytes, 0) <= 128 * 1024 * 1024, "Complete examples source closure exceeds its reviewed byte bound")
  return { inputs: input.artifacts.sort((a,b) => a.path.localeCompare(b.path)), artifacts: output.artifacts,
    files, stylesheets: sheets[0]!, media, presetSourceCommit: preset.sourceCommit, materialSourceCommit: material.sourceCommit }
}
export function assertExamplesBaselineManifest(value: unknown, snapshot: ShellSnapshot): void {
  const manifest = shellRecord(value)
  assert.deepEqual(Object.keys(manifest).sort(), ["artifacts", "baselineProfile", "checkoutRevision", "inputs", "schemaVersion", "sourceRevision", "sourceTree"])
  assert.equal(manifest.schemaVersion, 6); assert.equal(manifest.baselineProfile, examplesBaselineProfile)
  assert.equal(manifest.checkoutRevision, examplesBaselineRevision); assert.equal(manifest.sourceRevision, examplesBaselineRevision)
  assert.equal(manifest.sourceTree, examplesBaselineTree); assert.equal(snapshot.stylesheets.length, 2)
  assert.deepEqual(manifest.inputs, snapshot.inputs); assert.deepEqual(manifest.artifacts, snapshot.artifacts)
}
function serve(snapshot: ShellSnapshot) {
  const rejected: string[] = []
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(request) {
    const url = new URL(request.url), bytes = snapshot.files.get(url.pathname)
    if (request.method !== "GET" || url.search !== "" || bytes === undefined || url.hostname !== "127.0.0.1") {
      if (rejected.length < 64) rejected.push(`${request.method} ${url.pathname}`)
      return new Response("Not Found", { status: 404 })
    }
    const range = request.headers.get("range")
    const selected = range === null ? undefined : parseExampleByteRange(range, bytes.byteLength, url.pathname)
    if (range !== null && selected === undefined) {
      if (rejected.length < 64) rejected.push(`Range ${url.pathname}`)
      return new Response(null, { status: 416, headers: { "content-range": `bytes */${bytes.byteLength}` } })
    }
    return new Response(Uint8Array.from(selected ? bytes.subarray(selected.start, selected.end + 1) : bytes), {
      status: selected ? 206 : url.pathname === "/404.html" ? 404 : 200,
      headers: { ...siteShellHeaders, "content-type": examplesContentType(url.pathname), "cache-control": "no-store",
        ...(url.pathname.endsWith(".mp4") ? { "accept-ranges": "bytes" } : {}),
        ...(selected ? { "content-range": `bytes ${selected.start}-${selected.end}/${bytes.byteLength}` } : {}) } })
  } })
  return { server, rejected, closed: false }
}
function browserPayload(snapshot: ShellSnapshot, origin: string): ShellPayload {
  return { origin, resources: [...snapshot.files.keys()].sort(), stylesheets: snapshot.stylesheets, finalCss: snapshot.stylesheets.at(-1)! }
}
async function executable(name: "NODE_EXECUTABLE_PATH" | "SLOPCAMERA_CHROME_PATH"): Promise<string> {
  const path = process.env[name]
  assert.ok(path !== undefined && isAbsolute(path), `${name} must name the explicit pinned executable`)
  await access(path, constants.X_OK)
  return realpath(path)
}
async function executableIdentity(path: string): Promise<readonly number[]> {
  assert.equal(await realpath(path), path)
  const stat = await lstat(path)
  assert.ok(stat.isFile() && stat.size > 0 && stat.size <= 1024 * 1024 * 1024)
  return [stat.dev, stat.ino, stat.size, stat.mode, stat.nlink, stat.mtimeMs, stat.ctimeMs]
}
async function buildDriver(profile: string): Promise<{ path: string; bytes: Uint8Array }> {
  assert.equal(Bun.version, "1.3.14")
  const result = await Bun.build({ entrypoints: [join(appDirectory, "scripts/site-examples-browser-driver.mjs")], target: "node",
    env: "disable", format: "esm", minify: false, sourcemap: "none", packages: "external" })
  assert.ok(result.success && result.outputs.length === 1, "Could not compile the private Node shell worker")
  const bytes = new Uint8Array(await result.outputs[0]!.arrayBuffer())
  assert.ok(bytes.byteLength > 0 && bytes.byteLength <= workerDriverLimit)
  assert.ok(!/\bBun\s*\.|["'](?:bun|@hraness\/direct)(?:["'/])/u.test(Buffer.from(bytes).toString()), "Node worker gained a Bun/Direct runtime edge")
  const path = join(profile, "site-examples-browser-driver.mjs")
  await writeFile(path, bytes, { flag: "wx", mode: 0o600 })
  return { path, bytes }
}
interface ShellObservation { readonly result: Record<string, unknown>; readonly phases: readonly Uint8Array[] }
async function observe(directory: string, request: ExamplesRequest, signal: AbortSignal, exited: Promise<unknown>, absoluteDeadline: number): Promise<ShellObservation> {
  const limit = examplesDeadlineMs
  const phases: Uint8Array[] = []
  let processExited = false
  void exited.then(() => { processExited = true }, () => { processExited = true })
  let result: Record<string, unknown> | undefined
  for (const sequence of [0, 1, 2] as const) {
    const deadline = Math.min(absoluteDeadline, performance.now() + (sequence === 2 ? limit : 10_000))
    let reads = 0
    while (true) {
      signal.throwIfAborted()
      assert.ok(performance.now() < deadline && ++reads <= Math.ceil(limit / 50) + 1, `Worker ${workerPhaseFiles[sequence]} absolute deadline`)
      try {
        const bytes = await bounded(readPreviewFile(join(directory, workerPhaseFiles[sequence]), examplesWorkerProtocolLimit),
          "Worker phase read deadline", Math.max(1, deadline - performance.now()))
        signal.throwIfAborted()
        assert.ok(performance.now() < deadline, "Worker phase arrived after its deadline")
        result = parseExamplesPhase(decodeProfiledWorkerJson(bytes, examplesScope), sequence, request)
        phases.push(Uint8Array.from(bytes))
        break
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code !== "ENOENT" || processExited) throw error
      }
      await new Promise<void>((resolve, reject) => {
        const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(signal.reason) }
        const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve() }, Math.min(50, Math.max(1, deadline - performance.now())))
        signal.addEventListener("abort", abort, { once: true })
        if (signal.aborted) abort()
      })
    }
  }
  assert.equal(result!.node, shellRecord(decodeProfiledWorkerJson(phases[0]!, examplesScope)).node)
  return { result: result!, phases }
}
async function collectProtocol(directory: string, observation: ShellObservation): Promise<void> {
  const paths = await inventory(directory)
  const bytes: Uint8Array[] = []
  for (const name of workerPhaseFiles) {
    const published = await readPreviewFile(join(directory, name), examplesWorkerProtocolLimit)
    const staged = await readPreviewFile(join(directory, `.${name}.tmp`), examplesWorkerProtocolLimit)
    assert.ok(Buffer.from(published).equals(Buffer.from(staged)))
    bytes.push(published)
  }
  // The established immutable file protocol's collector is shape-independent.
  assertWorkerProtocolSnapshot(paths, bytes, { phases: observation.phases,
    result: observation.result as unknown as Parameters<typeof assertWorkerProtocolSnapshot>[2]["result"] })
}
async function readCaseFailure(profile: string, request: ExamplesRequest) {
  try {
    const value = decodeProfiledWorkerJson(await readPreviewFile(join(profile, "site-examples-case-failure.json"), examplesWorkerProtocolLimit), examplesScope)
    return parseExamplesCaseFailure(value, request)
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return undefined
    throw error
  }
}

export async function verifySiteExamples(args: readonly string[]): Promise<void> {
  const scope = examplesScope, baselineProfile = examplesBaselineProfile, limit = examplesDeadlineMs
  const options = parseShellArguments(args), deadline = performance.now() + limit
  const actualApp = await realpath(appDirectory)
  assert.notEqual(options.baseline, actualApp, "Baseline must be separate from the changed app")
  const deadlineController = new AbortController()
  const deadlineTimer = setTimeout(() => deadlineController.abort(new Error("Site native absolute deadline exceeded")), limit)
  const servers: ReturnType<typeof serve>[] = []
  let profile: string | undefined, protocolDirectory: string | undefined
  let chrome: ManagedVerificationServer | undefined, worker: ManagedVerificationServer | undefined
  let chromeAbsent = false, workerAbsent = false, completed = false
  let chromeOutput: string | undefined, workerOutput: string | undefined
  let signal: AbortSignal | undefined, observation: ShellObservation | undefined
  let workerRequest: ExamplesRequest | undefined
  let inputs: readonly WorkerInputSnapshot[] | undefined, manifestBefore: Uint8Array | undefined
  let current: ExamplesSnapshot | undefined, baseline: ShellSnapshot | undefined
  let candidate: CandidateIdentity | undefined, baselineIdentity: CandidateIdentity | undefined
  let executableInputs: readonly { path: string; identity: readonly number[] }[] = []
  const packageInputs: WorkerInputSnapshot[] = []
  const timeoutEvidence: PreviewOutputTimeoutEvidence[] = []
  const endpointEvidence: EndpointEvidence = { deadlineMs: 10_000, attempts: 0 }
  const waitEndpoint = createPreviewEndpointWaiter({ now: () => performance.now(), read: readPreviewFile,
    schedule(callback, delay) { const timer = setTimeout(callback, delay); return () => clearTimeout(timer) } })
  try {
    const result = await withPreviewCancellation(process, async cancellation => {
      signal = AbortSignal.any([cancellation.signal, deadlineController.signal])
      const step = async <T>(operation: () => Promise<T>): Promise<T> => {
        signal!.throwIfAborted()
        const result = await cancellation.wait(() => bounded(operation(), "Shell parent absolute deadline", Math.max(1, deadline - performance.now())))
        signal!.throwIfAborted()
        return result
      }
      candidate = await step(async () => candidateIdentity(actualApp))
      baselineIdentity = await step(async () => candidateIdentity(options.baseline))
      assert.equal(baselineIdentity.sha, examplesBaselineRevision); assert.equal(baselineIdentity.tree, examplesBaselineTree)
      current = await step(() => readExamplesSnapshot(actualApp))
      baseline = await step(() => readExamplesSnapshot(options.baseline, false))
      manifestBefore = Uint8Array.from(await step(() => readPreviewFile(options.manifest, 128 * 1024)))
      assertExamplesBaselineManifest(JSON.parse(Buffer.from(manifestBefore).toString()), baseline)
      const node = await step(() => executable("NODE_EXECUTABLE_PATH")), browserPath = await step(() => executable("SLOPCAMERA_CHROME_PATH"))
      assert.ok(process.env.PLAYWRIGHT_BROWSERS_PATH !== undefined && isAbsolute(process.env.PLAYWRIGHT_BROWSERS_PATH),
        "PLAYWRIGHT_BROWSERS_PATH must select the explicit task-owned pinned Chrome for Testing installation")
      const require = createRequire(join(actualApp, "package.json"))
      const packagePath = await realpath(require.resolve("playwright-core/package.json"))
      assert.equal(shellRecord(JSON.parse(Buffer.from(await readPreviewFile(packagePath, 64 * 1024)).toString())).version, "1.62.0")
      for (const path of [packagePath, join(dirname(packagePath), "browsers.json"),
        ...await Promise.all(["@hraness/ui", "@hraness/design-kit", "@hraness/site-footer"].map(async name =>
          realpath(require.resolve(`${name}/stylex-manifest.json`))))]) {
        packageInputs.push(await readWorkerInput(path, workerDriverLimit))
      }
      executableInputs = await Promise.all([node, browserPath].map(async path => ({ path, identity: await executableIdentity(path) })))
      profile = await mkdtemp(join(await realpath(tmpdir()), "slopcamera-site-examples-"))
      signal.throwIfAborted()
      const driver = await step(() => buildDriver(profile!))
      const currentServer = serve(current); servers.push(currentServer)
      const baselineServer = serve(baseline); servers.push(baselineServer)
      signal.throwIfAborted()
      chrome = spawnVerificationServer({ cwd: actualApp, detachedProcessGroup: true, logLimit: 12_000, command: [browserPath,
        "--headless=new", "--no-sandbox", "--disable-background-networking", "--disable-component-update", "--disable-default-apps",
        "--disable-extensions", "--disable-gpu", "--disable-sync", "--force-color-profile=srgb", "--metrics-recording-only", "--mute-audio",
        "--no-first-run", "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"] })
      const endpoint = await waitEndpoint(profile, chrome.exited, signal, endpointEvidence)
      protocolDirectory = join(profile, "worker-protocol")
      await mkdir(protocolDirectory, { mode: 0o700 })
      const request = parseExamplesRequest({ schemaVersion: 1, token: randomUUID(), scope, baselineProfile, appDirectory: actualApp, chromeExecutable: browserPath,
        endpoint, current: browserPayload(current, currentServer.server.url.origin), baseline: browserPayload(baseline, baselineServer.server.url.origin), media: current.media })
      workerRequest = request
      const requestPath = join(profile, "site-examples-browser-request.json"), bytes = encodeProfiledWorkerJson(request, examplesScope)
      await writeFile(requestPath, bytes, { flag: "wx", mode: 0o600 })
      inputs = [await readWorkerInput(driver.path, workerDriverLimit), await readWorkerInput(requestPath, examplesWorkerProtocolLimit)]
      assert.ok(Buffer.from(inputs[0]!.bytes).equals(Buffer.from(driver.bytes)))
      assert.ok(Buffer.from(inputs[1]!.bytes).equals(Buffer.from(bytes)))
      await writeFile(join(profile, "site-examples-inputs.json"), `${JSON.stringify({ schemaVersion: 1, executableInputs,
        packageInputs: packageInputs.map(input => ({ path: input.path, identity: input.identity, sha256: digest(input.bytes) })),
        current: { inputs: current.inputs, artifacts: current.artifacts }, baseline: JSON.parse(Buffer.from(manifestBefore).toString()),
        worker: inputs.map(input => ({ path: input.path, identity: input.identity, sha256: digest(input.bytes) })) })}\n`, { flag: "wx", mode: 0o600 })
      await writeFile(join(profile, "site-examples-driver.snapshot.mjs"), inputs[0]!.bytes, { flag: "wx", mode: 0o600 })
      await writeFile(join(profile, "site-examples-request.snapshot.json"), inputs[1]!.bytes, { flag: "wx", mode: 0o600 })
      signal.throwIfAborted()
      worker = spawnVerificationServer({ cwd: actualApp, detachedProcessGroup: true, logLimit: 12_000,
        omitEnvironment: ["NODE_OPTIONS", "NODE_PATH"], command: [node, driver.path, actualApp, requestPath] })
      console.error(`slopcamera-site-examples: verifying ${examplesCaseNames.length} mandatory ${scope} current/baseline cases`)
      observation = await observe(protocolDirectory, request, signal, worker.exited, deadline)
      await step(() => bounded(worker!.exited, "Shell worker successful exit", 5_000))
      assert.equal(worker.exitCode(), 0)
      completed = true
      return { ...observation.result, nativeBrowserZoom: false, reflowEquivalent: "1440x900 at 200% => 720x450 CSS viewport",
        productionHeaders: siteShellHeaders, internetRequestsAllowed: false, analytics: "unaltered scripts on neutral loopback origin",
        candidate, baselineIdentity, baselineManifestSha256: digest(manifestBefore), currentArtifacts: current.artifacts,
        materialSourceCommit: current.materialSourceCommit,
        presetSourceCommit: current.presetSourceCommit,
        expectationsSha256: current.inputs.find(input => input.path === "scripts/site-examples-browser-contract.ts")!.sha256 }
    }, async () => {
      const failures: unknown[] = []
      const collect = async (operation: () => Promise<unknown>, role?: "worker" | "chrome") => {
        try { await operation() } catch (error) {
          failures.push(error)
          if (role !== undefined) { const evidence = capturePreviewOutputTimeout(role, error); if (evidence !== undefined) timeoutEvidence.push(evidence) }
        }
      }
      if (worker !== undefined) await collect(async () => { await stopVerificationServer(worker!, 5_000); workerAbsent = true }, "worker")
      if (chrome !== undefined) await collect(async () => { await stopVerificationServer(chrome!, 5_000); chromeAbsent = true }, "chrome")
      if (worker !== undefined) await collect(async () => { workerOutput = await bounded(worker!.output, "Worker output EOF", 5_000) })
      if (chrome !== undefined) await collect(async () => { chromeOutput = await bounded(chrome!.output, "Chrome output EOF", 5_000) })
      for (const server of servers) await collect(async () => {
        await bounded(server.server.stop(true), "Loopback server collection", 5_000)
        assert.equal(server.server.pendingRequests, 0); assert.equal(server.server.pendingWebSockets, 0)
        server.closed = true
      })
      if (completed) await collect(async () => {
        assert.ok(workerAbsent && chromeAbsent && servers.length === 2 && servers.every(server => server.closed))
        assert.equal(worker!.exitCode(), 0); assert.equal(workerOutput, "")
        assert.ok(chromeOutput !== undefined && Buffer.byteLength(chromeOutput) <= 48_000)
        assert.ok(inputs !== undefined && observation !== undefined && protocolDirectory !== undefined)
        const after: WorkerInputSnapshot[] = []
        for (const input of inputs) after.push(await readWorkerInput(input.path, input.maximum))
        assertWorkerInputsUnchanged(inputs, after)
        await collectProtocol(protocolDirectory, observation)
        assert.equal(await readCaseFailure(profile!, workerRequest!), undefined, "Successful shell worker also published failure evidence")
        for (const input of executableInputs) assert.deepEqual(await executableIdentity(input.path), input.identity, "Admitted executable changed")
        for (const input of packageInputs) {
          const after = await readWorkerInput(input.path, input.maximum)
          assert.deepEqual(after.identity, input.identity, "Installed package input identity changed")
          assert.ok(Buffer.from(after.bytes).equals(Buffer.from(input.bytes)), "Installed package manifest bytes changed")
        }
        assert.ok(manifestBefore !== undefined && Buffer.from(await readPreviewFile(options.manifest, 128 * 1024)).equals(Buffer.from(manifestBefore)), "Baseline input manifest changed")
        assertShellSnapshotUnchanged(current!, await readExamplesSnapshot(actualApp))
        assertShellSnapshotUnchanged(baseline!, await readExamplesSnapshot(options.baseline, false))
        assert.deepEqual(candidateIdentity(actualApp), candidate, "Candidate Git identity changed")
        assert.deepEqual(candidateIdentity(options.baseline), baselineIdentity, "Baseline Git identity changed")
        for (const server of servers) assert.deepEqual(server.rejected, [], "Unadmitted or late server request")
        signal!.throwIfAborted()
        assert.ok(performance.now() < deadline, "Collection completed after the absolute deadline")
      })
      if (profile !== undefined && (!completed || failures.length > 0 || signal?.aborted === true)) await collect(async () => {
        let caseFailure: Record<string, unknown> | undefined
        // Missing partial evidence is possible before the first case. Malformed
        // evidence remains a collector failure, never a fallback success.
        if (workerRequest !== undefined && workerAbsent) await collect(async () => { caseFailure = await readCaseFailure(profile!, workerRequest!) })
        const receipt = `${JSON.stringify({ accepted: false, completed, cancelled: signal?.aborted === true, chromeAbsent, workerAbsent,
          endpointEvidence, timeoutEvidence, caseFailure, workerOutput, chromeOutput, failures: failures.map(error => previewFailureSummary(error)) })}\n`
        assert.ok(Buffer.byteLength(receipt) <= 1024 * 1024)
        await writeFile(join(profile!, "site-examples-failure.json"), receipt, { flag: "wx", mode: 0o600 })
        console.error(`slopcamera-site-examples: retained failure evidence at ${profile}`)
      })
      if (failures.length > 0) throw new AggregateError(failures, "Shell resource collection failed")
    })
    console.log(JSON.stringify({ ...result, accepted: true, workerProcessGroupAbsent: workerAbsent, browserProcessGroupAbsent: chromeAbsent,
      listenersCollected: servers.every(server => server.closed), outputEof: true, evidenceDirectory: profile }))
  } finally { clearTimeout(deadlineTimer) }
}

if (import.meta.main) {
  try { await verifySiteExamples(process.argv.slice(2)) } catch (error) {
    process.exitCode = 1
    console.error(previewFailureSummary(error).replace("slopcamera-preview:", "slopcamera-site-examples:"))
  }
}
