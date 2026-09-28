import { expect, test } from "bun:test"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { allowsRequest, currentRoutes, missingRoute, requestedOrigin, resolveBuilt } from "./verify-site-current.mjs"

test("live review has one fixed public origin and preserves the local network boundary", () => {
  expect(requestedOrigin([])).toBeNull()
  expect(requestedOrigin(["--production"])).toBe("https://slopcamera.com")
  expect(() => requestedOrigin(["--origin", "https://example.com"])).toThrow()
  expect(() => requestedOrigin(["--production", "https://example.com"])).toThrow()
  expect(allowsRequest("http://127.0.0.1:1234/assets/site.css", "http://127.0.0.1:1234")).toBe(true)
  expect(allowsRequest("https://us.i.posthog.com/i/v0/e/", "http://127.0.0.1:1234")).toBe(false)
  expect(allowsRequest("https://us.i.posthog.com/i/v0/e/", "https://slopcamera.com")).toBe(true)
  expect(allowsRequest("http://us.i.posthog.com/i/v0/e/", "https://slopcamera.com")).toBe(false)
  expect(allowsRequest("https://us.i.posthog.com.example.com/", "https://slopcamera.com")).toBe(false)
  expect(allowsRequest("https://example.com/font.woff2", "https://slopcamera.com")).toBe(false)
})

test("resolves clean URLs the way the static host does and refuses traversal", async () => {
  const root = await mkdtemp(join(tmpdir(), "slopcamera-current-"))
  await mkdir(join(root, "docs", "reference"), { recursive: true })
  await mkdir(join(root, "assets"))
  for (const file of ["index.html", "docs/index.html", "docs/reference/sdk.html", "assets/site.css"]) await writeFile(join(root, file), "x")

  expect(resolveBuilt(root, "/")).toBe(join(root, "index.html"))
  expect(resolveBuilt(root, "/docs")).toBe(join(root, "docs", "index.html"))
  expect(resolveBuilt(root, "/docs/reference/sdk")).toBe(join(root, "docs", "reference", "sdk.html"))
  expect(resolveBuilt(root, "/assets/site.css")).toBe(join(root, "assets", "site.css"))
  expect(resolveBuilt(root, "/missing")).toBeNull()
  expect(resolveBuilt(root, "/../../etc/passwd")).toBeNull()
})

test("covers every ordinary page family and a missing route", () => {
  expect(currentRoutes).toEqual(expect.arrayContaining(["/", "/docs", "/blog"]))
  expect(currentRoutes).not.toContain(missingRoute)
})
