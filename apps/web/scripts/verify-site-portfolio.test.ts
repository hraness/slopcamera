import { expect, test } from "bun:test"
import { assertPortfolioBaselineManifest, portfolioExpectationInput } from "./verify-site-portfolio"
import { portfolioBaselineProfile, portfolioBaselineRevision, portfolioBaselineTree } from "./site-portfolio-profile"
import type { ShellSnapshot } from "./verify-site-shell"

const snapshot: ShellSnapshot = {
  inputs: [{ path: "src/index.html", bytes: 12, sha256: "a".repeat(64) }],
  artifacts: [{ path: "index.html", bytes: 24, sha256: "b".repeat(64) }],
  files: new Map(), stylesheets: ["/foundation.css", `/assets/site-${"c".repeat(64)}.css`],
}
const manifest = () => ({ schemaVersion: 7, baselineProfile: portfolioBaselineProfile,
  checkoutRevision: portfolioBaselineRevision, sourceRevision: portfolioBaselineRevision,
  sourceTree: portfolioBaselineTree, inputs: snapshot.inputs, artifacts: snapshot.artifacts })

test("portfolio baseline binds its independent schema, exact Git identity and complete source/artifact bytes", () => {
  const value = manifest(), before = structuredClone(value)
  expect(() => assertPortfolioBaselineManifest(value, snapshot)).not.toThrow()
  expect(value).toEqual(before)
  for (const patch of [{ schemaVersion: 6 }, { baselineProfile: "workflow-examples-v1" },
    { checkoutRevision: "1".repeat(40) }, { sourceRevision: "2".repeat(40) }, { sourceTree: "3".repeat(40) },
    { inputs: [] }, { artifacts: [] }, { accepted: true },
    { inputs: [{ ...snapshot.inputs[0]!, sha256: "d".repeat(64) }] },
    { artifacts: [{ ...snapshot.artifacts[0]!, bytes: 25 }] }])
    expect(() => assertPortfolioBaselineManifest({ ...value, ...patch }, snapshot)).toThrow()
  expect(() => assertPortfolioBaselineManifest(value, { ...snapshot, stylesheets: ["/foundation.css"] })).toThrow()
})

test("portfolio receipt requires each closed expectation input exactly once with bounded bytes and a full digest", () => {
  for (const path of ["scripts/site-portfolio-browser-contract.ts", "scripts/site-portfolio-profile.ts", "scripts/portfolio-design-reference.json"]) {
    const input = { path, bytes: 200, sha256: "a".repeat(64) }
    expect(portfolioExpectationInput({ inputs: [input] }, path)).toEqual(input)
    expect(() => portfolioExpectationInput({ inputs: [] }, path)).toThrow("Exactly one")
    expect(() => portfolioExpectationInput({ inputs: [input, input] }, path)).toThrow("Exactly one")
    for (const patch of [{ bytes: 0 }, { bytes: -1 }, { bytes: 1.5 }, { bytes: 16 * 1024 * 1024 + 1 },
      { sha256: "a".repeat(63) }, { sha256: "A".repeat(64) }])
      expect(() => portfolioExpectationInput({ inputs: [{ ...input, ...patch }] }, path)).toThrow()
  }
  expect(() => portfolioExpectationInput({ inputs: [] }, "scripts/unreviewed-reference.json")).toThrow("Unknown")
})
