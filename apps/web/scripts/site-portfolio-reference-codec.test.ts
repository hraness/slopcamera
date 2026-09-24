import { expect, test } from "bun:test"
import { packPortfolioRender, unpackPortfolioRender, portfolioRenderCodecLimits as limits } from "./site-portfolio-reference-codec"

const packed = (nodes: unknown[], root = nodes.length - 1) => ({ format: "hraness-portfolio-render-v1", root, nodes })
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), "utf8")

test("codec losslessly round trips every JSON value and preserves negative zero", () => {
  for (const value of [null, true, false, 0, -0, 1.125, Number.MIN_VALUE, Number.MAX_VALUE, "", "é 🕯 \ud800",
    [], {}, [1, null, true, "text"], { z: { a: [-0, "repeated", "repeated"] }, a: 65.856 }]) {
    const encoded = packPortfolioRender(value), transported = JSON.parse(JSON.stringify(encoded))
    expect(unpackPortfolioRender(transported)).toEqual(value)
    expect(encoded.root).toBe(encoded.nodes.length - 1)
  }
  expect(Object.is(unpackPortfolioRender(JSON.parse(JSON.stringify(packPortfolioRender(-0)))), -0)).toBe(true)
})

test("sorted object keys make encoding deterministic and equal strings/subtrees share nodes", () => {
  const first = { z: { foreground: "rgb(1, 2, 3)", size: 17 }, a: [{ size: 17, foreground: "rgb(1, 2, 3)" }] }
  const second = { a: [{ foreground: "rgb(1, 2, 3)", size: 17 }], z: { size: 17, foreground: "rgb(1, 2, 3)" } }
  const encoded = packPortfolioRender(first)
  expect(packPortfolioRender(second)).toEqual(encoded)
  expect(encoded.nodes.filter(node => node[0] === "string" && node[1] === "rgb(1, 2, 3)")).toHaveLength(1)
  expect(encoded.nodes.filter(node => node[0] === "object")).toHaveLength(2)
  expect(new Set(encoded.nodes.map(node => JSON.stringify(node))).size).toBe(encoded.nodes.length)
  expect(first).toEqual({ z: { foreground: "rgb(1, 2, 3)", size: 17 }, a: [{ size: 17, foreground: "rgb(1, 2, 3)" }] })
})

test("untrusted prototype-shaped keys stay own data properties without polluting prototypes", () => {
  const value = JSON.parse('{"__proto__":{"polluted":"no"},"constructor":{"prototype":"data"},"prototype":17}')
  const result = unpackPortfolioRender(JSON.parse(JSON.stringify(packPortfolioRender(value)))) as Record<string, unknown>
  expect(result).toEqual(value)
  expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
  expect(Object.hasOwn(result, "__proto__")).toBe(true)
  expect(Object.hasOwn(Object.prototype, "polluted")).toBe(false)
  expect(({} as Record<string, unknown>).polluted).toBeUndefined()
})

test("encoder refuses values that would be lost or invoke accessors", () => {
  const cycle: unknown[] = []; cycle.push(cycle)
  const sparse = new Array(2)
  const accessor = Object.defineProperty({}, "secret", { enumerable: true, get() { throw Error("accessor executed") } })
  const hidden = Object.defineProperty({}, "secret", { value: 1 })
  const extra = Object.assign([1], { extra: "unrepresentable" })
  for (const value of [undefined, NaN, Infinity, -Infinity, 1n, Symbol("x"), () => 1, new Date(), new Map(),
    { missing: undefined }, cycle, sparse, accessor, hidden, extra, { [Symbol("x")]: "hidden" }])
    expect(() => packPortfolioRender(value)).toThrow()
  expect(() => packPortfolioRender(accessor)).toThrow("accessors")
})

test("decoder rejects unknown fields, formats, tags, invalid roots and malformed literals", () => {
  const valid = packed([["value", null]])
  for (const value of [null, [], {}, { ...valid, format: "other" }, { ...valid, extra: true },
    { ...valid, root: -1 }, { ...valid, root: "0" }, { ...valid, nodes: [] },
    packed([["unknown", null]]), packed([["string", 42]]), packed([["string", "x", "extra"]]),
    packed([["value", undefined]]), packed([["value", "text"]]), packed([["value", NaN]]),
    packed([["value", Infinity]]), packed([["value", -0]]), packed([["negative-zero", 0]]),
    packed([["array", {}]]), packed([["object", {}]])])
    expect(() => unpackPortfolioRender(value)).toThrow()
})

test("decoder allows only strict backward references and unique reachable nodes", () => {
  for (const nodes of [
    [["array", [0]]], [["array", [1]], ["value", null]],
    [["value", null], ["array", [-1]]], [["value", null], ["array", [0.5]]],
    [["value", null], ["array", ["0"]]], [["value", null], ["array", [2]]],
    [["value", null], ["value", null], ["array", [0, 1]]],
    [["string", "orphan"], ["value", null]],
  ]) expect(() => unpackPortfolioRender(packed(nodes))).toThrow()
  expect(unpackPortfolioRender(packed([["value", null], ["array", [0, 0]]]))).toEqual([null, null])
})

test("object entries require unique sorted string keys and exact pair structure", () => {
  for (const entries of [[[0, 2], [0, 2]], [[1, 2], [0, 2]], [[2, 0]], [[0]], [[0, 2, 1]], ["bad"]])
    expect(() => unpackPortfolioRender(packed([["string", "a"], ["string", "z"], ["value", true], ["object", entries]]))).toThrow()
  expect(unpackPortfolioRender(packed([["string", "a"], ["string", "z"], ["value", true], ["object", [[0, 2], [1, 2]]]])))
    .toEqual({ a: true, z: true })
})

test("compact DAGs cannot conceal exponential expansion or excessive depth", () => {
  const expansion: unknown[] = [["value", null]]
  for (let index = 1; index < 22; index++) expansion.push(["array", [index - 1, index - 1]])
  expect(() => unpackPortfolioRender(packed(expansion))).toThrow("expansion")
  const byteExpansion: unknown[] = [["string", "x".repeat(1024 * 1024)]]
  for (let index = 1; index < 8; index++) byteExpansion.push(["array", [index - 1, index - 1]])
  expect(() => unpackPortfolioRender(packed(byteExpansion))).toThrow("expansion")
  const deep: unknown[] = [["value", null]]
  for (let index = 1; index <= limits.depth; index++) deep.push(["array", [index - 1]])
  expect(() => unpackPortfolioRender(packed(deep))).toThrow("depth")
  let source: unknown = null
  for (let index = 0; index < limits.depth; index++) source = [source]
  expect(() => packPortfolioRender(source)).toThrow("depth")
})

test("node, UTF-8 string and packed input bounds remain finite", () => {
  expect(() => unpackPortfolioRender(packed(Array(limits.nodes + 1).fill(["value", null])))).toThrow("inventory")
  const text = "é".repeat(limits.stringBytes / 2)
  expect(unpackPortfolioRender(packPortfolioRender(text))).toBe(text)
  expect(() => packPortfolioRender(text + "a")).toThrow("byte bound")
  expect(() => unpackPortfolioRender(packed([["string", text + "a"]]))).toThrow("byte bound")
  const nodes: unknown[] = []
  for (let index = 0; index < 5; index++) nodes.push(["string", String(index) + "x".repeat(limits.stringBytes - 1)])
  nodes.push(["array", [0, 1, 2, 3, 4]])
  expect(() => unpackPortfolioRender(packed(nodes))).toThrow("packed byte bound")
})

test("repeated full property inventories stay inspectable and substantially smaller without losing any property", () => {
  const styles = Object.fromEntries(Array.from({ length: 75 }, (_, index) => [`measured-property-${index}`, index % 3 ? "rgb(219, 225, 247)" : "0px"]))
  const source = { appearance: Array.from({ length: 7 }, (_, step) => ({ step, elements: Array.from({ length: 13 }, (_, index) => ({
    key: `owner-${index}`, rect: [index * 1.125, 20, 200, 40], styles: { ...styles }, semantics: { role: "menuitemradio", hidden: null },
  })) })) }
  const encoded = packPortfolioRender(source)
  expect(unpackPortfolioRender(JSON.parse(JSON.stringify(encoded)))).toEqual(source)
  expect(bytes(encoded)).toBeLessThan(bytes(source) / 4)
  expect(JSON.stringify(encoded)).toContain("measured-property-74")
  expect(encoded.nodes.filter(node => node[0] === "string" && node[1] === "measured-property-74")).toHaveLength(1)
})
