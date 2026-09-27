import { expect, test } from "bun:test"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { currentRoutes, missingRoute, resolveBuilt } from "./verify-site-current.mjs"

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
