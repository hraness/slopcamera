import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

// Run from a source checkout with its locked dependencies installed.
// This session discovers tools and inspects inert JSON; it never renders.
const source = "examples/showcase/parametric/crescent-pavilion/base.scene.json"
const helper = "examples/showcase/workflows/inspect-scene-mcp.ts"
const root = process.cwd()
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")
const original = await readFile(source)
const parent = "artifacts/showcase/workflows"
await mkdir(parent, { recursive: true })
const outputDirectory = await mkdtemp(join(parent, "scene-inspect-"))

function record(value: unknown): Record<string, unknown> {
  assert.ok(typeof value === "object" && value !== null && !Array.isArray(value))
  return value as Record<string, unknown>
}

const child = Bun.spawn([Bun.argv[0]!, "src/cli.ts", "mcp", "--root", root], {
  stdin: "pipe", stdout: "pipe", stderr: "pipe",
})
const maximumBytes = 1_048_576
let received = 0
let pending = ""
let timedOut = false
const requests: unknown[] = []
const responses: unknown[] = []
const reader = child.stdout.getReader()
const decoder = new TextDecoder("utf-8", { fatal: true })
const stderrReader = child.stderr.getReader()
const stderrChunks: Uint8Array[] = []
const stderrTask = (async () => {
  let bytes = 0
  for (;;) {
    const next = await stderrReader.read()
    if (next.done) break
    bytes += next.value.byteLength
    assert.ok(bytes <= maximumBytes, "MCP stderr exceeded its bound")
    stderrChunks.push(next.value)
  }
})()
// Consume a rejected collector immediately; the session still awaits it below.
void stderrTask.catch(() => { child.kill("SIGKILL") })
const deadline = setTimeout(() => {
  timedOut = true
  child.kill("SIGKILL")
}, 30_000)

async function call(id: number, method: string, params: unknown) {
  const request = { jsonrpc: "2.0", id, method, params }
  requests.push(request)
  child.stdin.write(`${JSON.stringify(request)}\n`)
  for (;;) {
    const newline = pending.indexOf("\n")
    if (newline >= 0) {
      const response = record(JSON.parse(pending.slice(0, newline)))
      pending = pending.slice(newline + 1)
      assert.equal(response.jsonrpc, "2.0")
      assert.equal(response.id, id, "Unexpected response ID")
      assert.equal(response.error, undefined, "MCP protocol error")
      responses.push(response)
      return record(response.result)
    }
    const next = await reader.read()
    assert.equal(next.done, false, "MCP closed before its response")
    received += next.value!.byteLength
    assert.ok(received <= maximumBytes, "MCP stdout exceeded its bound")
    pending += decoder.decode(next.value!, { stream: true })
  }
}

try {
  await call(1, "initialize", {
    protocolVersion: "2025-11-25", capabilities: {},
    clientInfo: { name: "slopcamera-scene-inspect-example", version: "1.0.0" },
  })
  const initialized = { jsonrpc: "2.0", method: "notifications/initialized" }
  requests.push(initialized)
  child.stdin.write(`${JSON.stringify(initialized)}\n`)
  const listed = await call(2, "tools/list", {})
  assert.ok(Array.isArray(listed.tools), "Missing discovered tools")
  const names = listed.tools.map(tool => record(tool).name)
  assert.ok(names.includes("inspect_scene"), "This source version does not expose inspect_scene")
  const inspected = await call(3, "tools/call", { name: "inspect_scene", arguments: { path: source } })
  assert.notEqual(inspected.isError, true, "Scene inspection failed")
  const content = record(inspected.structuredContent)
  assert.equal(content.ok, true)
  assert.equal(content.source, source)
  record(content.inspection)
  const summary = record(content.summary)
  assert.equal(summary.entitiesTruncated, false)
  assert.equal(summary.returnedEntityCount, summary.entityCount)
  assert.ok(typeof summary.entityCount === "number" && summary.entityCount > 0)
  child.stdin.end()
  for (;;) {
    const next = await reader.read()
    if (next.done) break
    received += next.value.byteLength
    assert.ok(received <= maximumBytes, "MCP stdout exceeded its bound")
    pending += decoder.decode(next.value, { stream: true })
  }
  pending += decoder.decode()
  assert.equal(pending.trim(), "", "Unexpected trailing protocol output")
  await stderrTask
  assert.equal(await child.exited, 0, "MCP server did not exit cleanly")
  assert.equal(timedOut, false, "MCP session exceeded 30 seconds")
  assert.deepEqual(await readFile(source), original, "Inspection changed its source")
  const receipt = {
    kind: "slopcamera.showcase.mcp-scene-inspection", version: 1,
    source: { path: source, bytes: original.byteLength, sha256: hash(original) },
    helper: { path: helper, sha256: hash(await readFile(helper)) },
    bunVersion: Bun.version, requests, responses,
    observation: { sourceUnchanged: true, cleanExit: true, stdoutEof: true, stderrEof: true, toolCount: names.length, ...summary },
  }
  await writeFile(join(outputDirectory, "session.json"), `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" })
  await writeFile(join(outputDirectory, "stderr.txt"), Buffer.concat(stderrChunks), { flag: "wx" })
  console.log(JSON.stringify({ outputDirectory, tools: names.length, ...summary, sourceUnchanged: true }))
} catch (error) {
  await writeFile(join(outputDirectory, "failed-session.json"), `${JSON.stringify({
    source, requests, responses, error: error instanceof Error ? error.message : String(error),
  }, null, 2)}\n`, { flag: "wx" })
  console.error(`Retained failed MCP session: ${outputDirectory}`)
  throw error
} finally {
  if (child.exitCode === null) {
    child.stdin.end()
    child.kill("SIGKILL")
  }
  await child.exited
  await stderrTask.catch(() => undefined)
  clearTimeout(deadline)
  reader.releaseLock()
  stderrReader.releaseLock()
}
