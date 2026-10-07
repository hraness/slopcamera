import { describe, expect, test } from "bun:test"
import { readBoundedText } from "./body.js"
import { handleMcpRequest } from "./mcp.js"

function chunked(parts: readonly string[]): Request {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part))
      controller.close()
    },
  })
  return new Request("https://api.test/v1/mcp", {
    method: "POST",
    body: stream,
    duplex: "half",
  } as RequestInit)
}

describe("readBoundedText", () => {
  test("returns bodies within the limit", async () => {
    expect(await readBoundedText(chunked(["ab", "cd"]), 4)).toBe("abcd")
  })

  test("rejects a streamed body that exceeds the limit without a content-length", async () => {
    await expect(readBoundedText(chunked(["abc", "def"]), 4)).rejects.toMatchObject({
      status: 413,
      code: "too_large",
    })
  })

  test("rejects an oversized declared content-length before reading", async () => {
    const request = new Request("https://api.test/", {
      method: "POST",
      body: "x",
      headers: { "content-length": "99" },
    })
    await expect(readBoundedText(request, 4)).rejects.toMatchObject({ status: 413 })
  })

  test("the MCP endpoint rejects oversized bodies", async () => {
    const request = new Request("https://api.test/v1/mcp", {
      method: "POST",
      body: "x",
      headers: { "content-length": String(64 * 1024 * 1024) },
    })
    await expect(
      handleMcpRequest(request, async () => {
        throw new Error("unreachable")
      }, "client"),
    ).rejects.toMatchObject({ status: 413 })
  })
})
