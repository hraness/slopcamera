import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { hostedTools, PAID_OPERATION } from "./tools"

const root = resolve(import.meta.dir, "../../..")

const fixture = `
const scenario = JSON.parse(process.env.API_PARITY_SCENARIO);
const uploads = [];
if (scenario.captureRender) {
  const {createHash} = await import("node:crypto");
  globalThis.fetch = async (input, init) => {
    if (new URL(String(input)).hostname !== "storage.invalid" || init?.method !== "PUT") throw new Error("Unexpected external request in renderer fixture");
    const type = new Headers(init.headers).get("content-type") ?? "";
    const bytes = Buffer.from(init.body);
    if (type.startsWith("image/")) uploads.push({type, bytes:bytes.length, sha256:createHash("sha256").update(bytes).digest("hex")});
    return new Response(null, {status:200});
  };
}
const entry = process.env.API_PARITY_ENTRY;
const source = process.env.API_PARITY_SOURCE === "1";
const module = await import(entry);
const handler = source ? (req, res) => module.handleVercelRequest(req, res, scenario.path) : module.default;
const responses = [];
for (const input of scenario.requests ?? [scenario]) {
  const result = { status: 0, headers: {}, body: "" };
  const req = { method: input.method ?? "GET", url: input.url ?? scenario.path, query: input.query ?? scenario.query,
    headers: { "content-type": "application/json", ...input.headers },
    async *[Symbol.asyncIterator]() { if (input.body !== undefined) yield Buffer.from(input.body); } };
  const res = { status(code) { result.status = code; return res; },
    setHeader(name, value) { result.headers[name] = value; },
    send(body) { result.body = Buffer.from(body).toString(); } };
  await handler(req, res);
  responses.push(result);
}
console.log(JSON.stringify(scenario.captureRender ? {statuses:responses.map(r=>r.status), uploads:uploads.sort((a,b)=>a.sha256.localeCompare(b.sha256))} : responses));
`

type Scenario = {
  path: string
  captureRender?: boolean
  freeLimit?: number
  method?: string
  url?: string
  query?: Record<string, string | string[]>
  body?: string
  requests?: readonly { method: string; body: string }[]
}

function run(runtime: "source" | "bun" | "node", entry: string, scenario: Scenario): unknown {
  const source = runtime === "source"
  const directory = mkdtempSync(join(tmpdir(), "slopcamera-api-node-fixture-"))
  try {
    const result = Bun.spawnSync({
      cmd: runtime !== "node" ? [process.execPath, "-e", fixture] : ["node", "--input-type=module", "-e", fixture],
      cwd: root,
      env: {
        PATH: process.env.PATH ?? "",
        TMPDIR: directory,
        ...(scenario.freeLimit ? { SLOPCAMERA_API_FREE_CALLS_PER_HOUR: String(scenario.freeLimit) } : {}),
        ...(scenario.captureRender ? { R2_PROXY_URL: "https://storage.invalid", R2_PROXY_SECRET: "inert-test-secret" } : {}),
        API_PARITY_ENTRY: join(root, source ? "apps/api/src/vercel.ts" : entry),
        API_PARITY_SOURCE: source ? "1" : "0",
        API_PARITY_SCENARIO: JSON.stringify(scenario),
      },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 30_000,
    })
    if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr))
    expect(readdirSync(directory).filter((name) => name.startsWith("slopcamera-api-"))).toEqual([])
    return JSON.parse(new TextDecoder().decode(result.stdout))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test("all separately routed Node functions preserve the original adapter responses", () => {
  const diagram = readFileSync(join(root, "examples/semantic-flow.diagram.json"), "utf8")
  const check = JSON.stringify({ arguments: { path: "example.diagram.json" }, files: { "example.diagram.json": { text: diagram } } })
  const cases: readonly [string, Scenario][] = [
    ["api/index.js", { path: "/" }],
    ["api/v1/health.js", { path: "/v1/health", url: "/v1/health/", query: { path: "injected" } }],
    ["api/v1/models.js", { path: "/v1/models" }],
    ["api/v1/tools.js", { path: "/v1/tools" }],
    ["api/v1/openapi.json.js", { path: "/v1/openapi.json" }],
    ["api/v1/mcp.js", { path: "/v1/mcp", method: "GET" }],
    ["api/v1/mcp.js", { path: "/v1/mcp", method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }],
    ["api/v1/uploads.js", { path: "/v1/uploads", method: "POST", body: "{}" }],
    ["api/v1/artifacts/[id].js", { path: "/v1/artifacts/unknown", query: { id: ["unknown", "ignored"] } }],
    ["api/v1/artifacts/[id]/content.js", { path: "/v1/artifacts/unknown/content", query: { id: "unknown" } }],
    ["api/v1/tools/[name]/call.js", { path: "/v1/tools/check_diagram/call", query: { name: ["check_diagram", "ignored"] }, method: "POST", body: check }],
    ["api/v1/tools/[name]/call.js", { path: "/v1/tools/check_diagram/call", query: { name: "check_diagram" }, method: "POST", body: "{" }],
    ["api/v1/tools/[name]/call.js", { path: "/v1/tools/execute_slopcamera/call", query: { name: "execute_slopcamera" }, method: "POST", body: "{}" }],
    ["api/v1/health.js", { path: "/v1/health", method: "OPTIONS" }],
  ]
  for (const [entry, scenario] of cases) {
    const original = run("source", entry, scenario)
    expect(run("bun", entry, scenario)).toEqual(original)
    // Bun's Response.json adds a UTF-8 charset; Node's native implementation
    // leaves it implicit. Only normalize that runtime default here. The
    // live Vercel preview acceptance separately compares actual HTTP headers.
    const normalizeCharset = (value: unknown) => (value as { headers: Record<string, string> }[]).map((response) =>
      response.headers["content-type"] === "application/json;charset=utf-8"
        ? { ...response, headers: { ...response.headers, "content-type": "application/json" } }
        : response)
    expect(normalizeCharset(run("node", entry, scenario))).toEqual(normalizeCharset(original))
  }
}, 30_000)

test("emitted font assets preserve exactly the original bytes and function limits", () => {
  const hashes = (directory: string) => readdirSync(directory)
    .filter((name) => /\.(?:otf|woff2)$/u.test(name))
    .map((name) => createHash("sha256").update(readFileSync(join(directory, name))).digest("hex"))
    .sort()
  const original = hashes(join(root, "src/assets/fonts/nebula-sans"))
  expect(original).toHaveLength(4)
  expect(hashes(join(root, ".api-build"))).toEqual(original)
  const config = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"))
  expect(config.functions).toEqual({ "api/**/*.js": { maxDuration: 60, includeFiles: ".api-build/*.{otf,woff2}" } })
  expect(config.rewrites).toEqual([{ source: "/(.*)", destination: "/api/$1" }])
})


test("real Node rendering resolves emitted fonts and preserves PNG/SVG bytes", () => {
  const scenario: Scenario = {
    captureRender: true,
    path: "/v1/tools/render_diagram/call",
    query: { name: "render_diagram" },
    method: "POST",
    body: JSON.stringify({
      arguments: { path: "example.diagram.json" },
      files: { "example.diagram.json": { text: readFileSync(join(root, "examples/semantic-flow.diagram.json"), "utf8") } },
    }),
  }
  const original = run("source", "api/v1/tools/[name]/call.js", scenario) as { statuses: number[]; uploads: unknown[] }
  expect(original.statuses).toEqual([200])
  expect(original.uploads).toHaveLength(4)
  expect(run("bun", "api/v1/tools/[name]/call.js", scenario)).toEqual(original)
  expect(run("node", "api/v1/tools/[name]/call.js", scenario)).toEqual(original)
}, 30_000)

test("hosted admission excludes the vectorizer's separate worker entry", () => {
  // The SDK vectorizer resolves a separate worker relative to import.meta.url.
  // It is deliberately not emitted into this image-only hosted build. Adding
  // hosted vectorization requires packaging that worker before widening here.
  expect(PAID_OPERATION).toBe("slopcamera.image.generate")
  expect(hostedTools.map((tool) => tool.name).sort()).toEqual([
    "audit_scene", "audit_scene_behavior", "audit_scene_temporal", "check_diagram", "check_scene",
    "check_scene_behavior", "check_scene_direction", "check_scene_effects", "diff_scenes", "evaluate_scene",
    "execute_slopcamera", "inspect_scene", "plan_scene_direction", "plan_scene_effects", "plan_scene_gallery",
    "render_diagram", "search_slopcamera",
  ])
  const paid = hostedTools.find((tool) => tool.name === "execute_slopcamera")
  const properties = paid?.definition.inputSchema.properties as Record<string, unknown> | undefined
  expect(properties?.operation).toEqual({ type: "string", enum: ["slopcamera.image.generate"] })
})


test("separate REST and MCP functions each retain their own limiter budget", () => {
  const files = { "example.diagram.json": { text: readFileSync(join(root, "examples/semantic-flow.diagram.json"), "utf8") } }
  const body = JSON.stringify({ arguments: { path: "example.diagram.json" }, files })
  const rest: Scenario = {
    path: "/v1/tools/check_diagram/call", query: { name: "check_diagram" }, freeLimit: 2,
    requests: Array.from({ length: 5 }, () => ({ method: "POST", body })),
  }
  const rpcBody = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "check_diagram", arguments: { path: "example.diagram.json", files } } })
  const mcp: Scenario = { path: "/v1/mcp", freeLimit: 2, requests: Array.from({ length: 5 }, () => ({ method: "POST", body: rpcBody })) }
  // Existing admission has a minimum burst of four, independent of refill.
  for (const runtime of ["source", "bun", "node"] as const) {
    const restResult = run(runtime, "api/v1/tools/[name]/call.js", rest) as { status: number; body: string }[]
    expect(restResult.map((response) => response.status)).toEqual([200, 200, 200, 200, 429])
    const mcpResult = run(runtime, "api/v1/mcp.js", mcp) as { status: number; body: string }[]
    for (const response of mcpResult.slice(0, 4)) expect(JSON.parse(response.body).result.structuredContent.ok).toBe(true)
    expect(JSON.parse(mcpResult[4]!.body).error).toBeDefined()
  }
}, 30_000)
