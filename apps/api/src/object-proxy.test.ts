import { createHmac } from "node:crypto"
import { describe, expect, test } from "bun:test"
import { ObjectProxyStore } from "./object-proxy.ts"

const store = new ObjectProxyStore({
  url: "https://objects.example.com/",
  secret: "test-secret",
})

function sign(method: string, key: string, exp: string, max: string): string {
  return createHmac("sha256", "test-secret")
    .update(`${method}\n${key}\n${exp}\n${max}`)
    .digest("hex")
}

describe("ObjectProxyStore signing", () => {
  test("mints a PUT URL whose signature covers method, key, expiry, and cap", () => {
    const first = store.presignPut("u/abc", {
      contentType: "image/png",
      maxBytes: 1024,
      expiresSeconds: 600,
    })
    const url = new URL(first.url)
    expect(url.origin).toBe("https://objects.example.com")
    expect(url.pathname).toBe("/o/u/abc")
    const exp = url.searchParams.get("exp") ?? ""
    const now = Math.floor(Date.now() / 1000)
    expect(Number(exp)).toBeGreaterThan(now)
    expect(Number(exp)).toBeLessThanOrEqual(now + 600)
    expect(url.searchParams.get("max")).toBe("1024")
    expect(url.searchParams.get("sig")).toBe(
      sign("PUT", "u/abc", exp, "1024"),
    )
    expect(first.headers["content-type"]).toBe("image/png")
    expect(first.expiresSeconds).toBe(600)
  })

  test("mints GET URLs with an empty byte cap in the canonical string", () => {
    const url = new URL(store.presignGet("a/id/file.png", 3600))
    const exp = url.searchParams.get("exp") ?? ""
    expect(url.searchParams.get("max")).toBeNull()
    expect(url.searchParams.get("sig")).toBe(
      sign("GET", "a/id/file.png", exp, ""),
    )
  })

  test("encodes each key segment without flattening separators", () => {
    const url = new URL(store.presignGet("a/id/diagram v2.png"))
    expect(url.pathname).toBe("/o/a/id/diagram%20v2.png")
  })
})
