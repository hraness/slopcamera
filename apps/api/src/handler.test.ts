import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import type { ApiConfig } from "./config.ts"
import { createApiHandler } from "./handler.ts"

const DIAGRAM = await readFile(
  join(import.meta.dir, "../../../examples/semantic-flow.diagram.json"),
  "utf8",
)

function testConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  return {
    publicBaseUrl: "http://localhost:8787",
    r2Proxy: undefined,
    r2: undefined,
    credits: undefined,
    modelCostsMicroUsd: {},
    artifactTtlDays: 7,
    freeCallsPerHour: 120,
    renderCallsPerHour: 30,
    uploadsPerHour: 60,
    maximumInlineBytes: 4 * 1024 * 1024,
    maximumUploadBytes: 32 * 1024 * 1024,
    ...overrides,
  }
}

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost:8787${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  })
}

const checkCall = () =>
  post("/v1/tools/check_diagram/call", {
    arguments: { path: "example.diagram.json" },
    files: { "example.diagram.json": { text: DIAGRAM } },
  })

describe("api handler", () => {
  test("serves health, tools, and the OpenAPI document", async () => {
    const handler = createApiHandler({
      config: testConfig(),
      env: {},
    })
    const health = await (
      await handler(new Request("http://localhost:8787/v1/health"))
    ).json()
    expect(health).toEqual({
      ok: true,
      storage: false,
      billing: false,
      models: 0,
    })

    const tools = (await (
      await handler(new Request("http://localhost:8787/v1/tools"))
    ).json()) as { tools: Array<{ name: string; tier: string }> }
    expect(tools.tools.length).toBeGreaterThan(10)
    expect(
      tools.tools.find((tool) => tool.name === "execute_slopcamera")?.tier,
    ).toBe("paid")
    expect(
      tools.tools.find((tool) => tool.name === "render_diagram")?.tier,
    ).toBe("render")

    const spec = (await (
      await handler(new Request("http://localhost:8787/v1/openapi.json"))
    ).json()) as { openapi: string; paths: Record<string, unknown> }
    expect(spec.openapi).toBe("3.1.0")
    expect(Object.keys(spec.paths)).toContain("/v1/mcp")
  })

  test("runs a free tool over inline files", async () => {
    const handler = createApiHandler({ config: testConfig(), env: {} })
    const response = await handler(checkCall())
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      ok: boolean
      result: { summary: { shapeCount: number } }
      artifacts: unknown[]
    }
    expect(body.ok).toBe(true)
    expect(body.result.summary.shapeCount).toBe(3)
    expect(body.artifacts).toEqual([])
  })

  test("rejects unknown tools and malformed bodies", async () => {
    const handler = createApiHandler({ config: testConfig(), env: {} })
    expect(
      (await handler(post("/v1/tools/nope/call", { arguments: {} }))).status,
    ).toBe(404)
    expect(
      (await handler(post("/v1/tools/check_diagram/call", [1, 2]))).status,
    ).toBe(400)
  })

  test("rejects workspace path traversal and oversized file maps", async () => {
    const handler = createApiHandler({ config: testConfig(), env: {} })
    const traversal = await handler(
      post("/v1/tools/check_diagram/call", {
        arguments: { path: "example.diagram.json" },
        files: { "../evil.json": { text: "{}" } },
      }),
    )
    expect(traversal.status).toBe(400)

    const many = Object.fromEntries(
      Array.from({ length: 25 }, (_, index) => [`f${index}.json`, { text: "{}" }]),
    )
    const crowded = await handler(
      post("/v1/tools/check_diagram/call", {
        arguments: { path: "f0.diagram.json" },
        files: many,
      }),
    )
    expect(crowded.status).toBe(400)
  })

  test("rate-limits anonymous free calls", async () => {
    const handler = createApiHandler({
      config: testConfig({ freeCallsPerHour: 2 }),
      env: {},
    })
    // Burst is max(4, ceil(2/6)) = 4; the fifth call must throttle.
    for (let i = 0; i < 4; i += 1) {
      expect((await handler(checkCall())).status).toBe(200)
    }
    const limited = await handler(checkCall())
    expect(limited.status).toBe(429)
    const body = (await limited.json()) as { retryAfterSeconds: number }
    expect(body.retryAfterSeconds).toBeGreaterThan(0)
  })

  test("paid tool requires a device token before any other check", async () => {
    const handler = createApiHandler({ config: testConfig(), env: {} })
    const response = await handler(
      post("/v1/tools/execute_slopcamera/call", {
        arguments: {
          operation: "slopcamera.image.generate",
          input: { model: "openai/gpt-image-1", prompt: "x", outputPath: "o.png" },
        },
      }),
    )
    expect(response.status).toBe(401)
    const body = (await response.json()) as { signup?: { product?: string } }
    expect(body.signup?.product).toBe("slopcamera")
  })

  test("paid tool rejects non-admitted operations and unlisted models", async () => {
    const handler = createApiHandler({
      config: testConfig({
        credits: { baseUrl: "https://credits.invalid", productKey: "cr_prod_x" },
        modelCostsMicroUsd: { "openai/gpt-image-1": 40_000 },
      }),
      env: {},
    })
    const auth = { authorization: "Bearer cr_dev_test" }
    const wrongOp = await handler(
      post(
        "/v1/tools/execute_slopcamera/call",
        {
          arguments: {
            operation: "slopcamera.scene.render",
            input: {},
          },
        },
        auth,
      ),
    )
    expect(wrongOp.status).toBe(400)

    const wrongModel = await handler(
      post(
        "/v1/tools/execute_slopcamera/call",
        {
          arguments: {
            operation: "slopcamera.image.generate",
            input: { model: "evil/free", prompt: "x", outputPath: "o.png" },
          },
        },
        auth,
      ),
    )
    expect(wrongModel.status).toBe(400)
  })

  test("holds then releases credits when the paid tool fails", async () => {
    const calls: Array<{ path: string; body: string }> = []
    const fetchImpl = (async (input: unknown, init?: RequestInit) => {
      const url = String(input)
      calls.push({ path: new URL(url).pathname, body: String(init?.body ?? "") })
      if (url.endsWith("/v1/holds")) {
        return Response.json({ holdId: "hold_1", ceilingMicroUsd: 40_000 }, { status: 201 })
      }
      return Response.json({}, { status: 200 })
    }) as typeof fetch

    const handler = createApiHandler({
      config: testConfig({
        credits: { baseUrl: "https://credits.invalid", productKey: "cr_prod_x" },
        modelCostsMicroUsd: { "openai/gpt-image-1": 40_000 },
      }),
      env: {},
      fetchImpl,
    })
    const response = await handler(
      post(
        "/v1/tools/execute_slopcamera/call",
        {
          arguments: {
            operation: "slopcamera.image.generate",
            input: {
              model: "openai/gpt-image-1",
              prompt: "a small test image",
              outputPath: "o.png",
            },
          },
          idempotencyKey: "test-idem-1",
        },
        { authorization: "Bearer cr_dev_test" },
      ),
    )
    // No AI_GATEWAY_API_KEY in env → the tool reports an error, the hold is released.
    expect(response.status).toBe(200)
    const body = (await response.json()) as { ok: boolean }
    expect(body.ok).toBe(false)
    const paths = calls.map((call) => call.path)
    expect(paths).toContain("/v1/holds")
    expect(paths).toContain("/v1/holds/hold_1/release")
    expect(paths).not.toContain("/v1/holds/hold_1/settle")
    const holdBody = JSON.parse(calls[0]?.body ?? "{}") as {
      idempotencyKey?: string
      subjectToken?: string
    }
    expect(holdBody.idempotencyKey).toBe("slopcamera-api:test-idem-1")
    expect(holdBody.subjectToken).toBe("cr_dev_test")
  })

  test("uploads and artifacts require configured storage", async () => {
    const handler = createApiHandler({ config: testConfig(), env: {} })
    expect(
      (
        await handler(
          post("/v1/uploads", { contentType: "image/png", bytes: 10 }),
        )
      ).status,
    ).toBe(503)
    expect(
      (
        await handler(
          new Request(
            "http://localhost:8787/v1/artifacts/00000000-0000-0000-0000-000000000000",
          ),
        )
      ).status,
    ).toBe(503)
  })
})
