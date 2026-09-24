import assert from "node:assert/strict"

/** An inspectable, lossless JSON tree. Nodes only refer to earlier nodes;
 * repeated keys, strings and complete subtrees share the same table entry. */
export const portfolioRenderCodecLimits = Object.freeze({
  nodes: 65_536, references: 500_000, depth: 96,
  stringBytes: 4 * 1024 * 1024, packedBytes: 16 * 1024 * 1024,
  expandedNodes: 1_000_000, expandedBytes: 64 * 1024 * 1024,
})
type RenderNode = readonly ["string", string] | readonly ["value", null | boolean | number]
  | readonly ["negative-zero"] | readonly ["array", readonly number[]]
  | readonly ["object", readonly (readonly [number, number])[]]
export interface PackedPortfolioRender {
  readonly format: "hraness-portfolio-render-v1"
  readonly root: number
  readonly nodes: readonly RenderNode[]
}
interface Cost { readonly nodes: number; readonly bytes: number; readonly depth: number }
const format = "hraness-portfolio-render-v1" as const
const limits = portfolioRenderCodecLimits
const encodedBytes = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), "utf8")
const ordinary = (value: object): boolean => Object.getPrototypeOf(value) === Object.prototype

function checkedCost(cost: Cost): Cost {
  assert.ok(cost.nodes <= limits.expandedNodes && cost.bytes <= limits.expandedBytes && cost.depth <= limits.depth,
    "Portfolio render expansion exceeds its bounded size or depth")
  return cost
}

export function packPortfolioRender(value: unknown): PackedPortfolioRender {
  const nodes: RenderNode[] = [], interned = new Map<string, number>(), ancestors = new Set<object>()
  let visits = 0, sourceBytes = 0
  const intern = (node: RenderNode): number => {
    const signature = JSON.stringify(node), existing = interned.get(signature)
    if (existing !== undefined) return existing
    assert.ok(nodes.length < limits.nodes, "Portfolio render exceeds its node bound")
    sourceBytes += Buffer.byteLength(signature) + 1
    assert.ok(sourceBytes <= limits.packedBytes, "Portfolio render exceeds its packed byte bound")
    const index = nodes.length
    nodes.push(node); interned.set(signature, index)
    return index
  }
  const string = (text: string): number => {
    assert.ok(Buffer.byteLength(text, "utf8") <= limits.stringBytes, "Portfolio render string exceeds its byte bound")
    return intern(["string", text])
  }
  const visit = (item: unknown, depth: number): number => {
    assert.ok(++visits <= limits.expandedNodes && depth <= limits.depth, "Portfolio render input exceeds its node or depth bound")
    if (typeof item === "string") return string(item)
    if (item === null || typeof item === "boolean") return intern(["value", item])
    if (typeof item === "number") {
      assert.ok(Number.isFinite(item), "Portfolio render numbers must be finite")
      return Object.is(item, -0) ? intern(["negative-zero"]) : intern(["value", item])
    }
    assert.ok(typeof item === "object" && item !== null, "Portfolio render requires JSON values")
    assert.ok(!ancestors.has(item), "Portfolio render cannot contain cycles")
    ancestors.add(item)
    try {
      if (Array.isArray(item)) {
        assert.equal(Object.getPrototypeOf(item), Array.prototype, "Portfolio render requires ordinary arrays")
        assert.ok(item.length <= limits.references, "Portfolio render array exceeds its reference bound")
        assert.equal(Reflect.ownKeys(item).length, item.length + 1, "Portfolio render arrays must be dense and have no extra properties")
        const references: number[] = []
        for (let index = 0; index < item.length; index++) {
          const descriptor = Object.getOwnPropertyDescriptor(item, String(index))
          assert.ok(descriptor && descriptor.enumerable && Object.hasOwn(descriptor, "value"), "Portfolio render arrays cannot contain accessors or holes")
          references.push(visit(descriptor.value, depth + 1))
        }
        return intern(["array", references])
      }
      assert.ok(ordinary(item), "Portfolio render requires ordinary JSON objects")
      const keys = Object.keys(item).sort()
      assert.equal(Reflect.ownKeys(item).length, keys.length, "Portfolio render objects cannot hide properties or symbols")
      assert.ok(keys.length * 2 <= limits.references, "Portfolio render object exceeds its reference bound")
      const entries: [number, number][] = []
      for (const key of keys) {
        const descriptor: PropertyDescriptor = Object.getOwnPropertyDescriptor(item, key)!
        assert.ok(Object.hasOwn(descriptor, "value"), "Portfolio render objects cannot contain accessors")
        const name = string(key), child = visit(descriptor.value, depth + 1)
        entries.push([name, child])
      }
      return intern(["object", entries])
    } finally { ancestors.delete(item) }
  }
  const packed = { format, root: visit(value, 1), nodes }
  // The decoder owns the canonical DAG/expansion rules on both paths, so the
  // encoder can never publish a tree the reader would refuse.
  unpackPortfolioRender(packed)
  return packed
}

export function unpackPortfolioRender(value: unknown): unknown {
  assert.ok(typeof value === "object" && value !== null && !Array.isArray(value) && ordinary(value), "Invalid portfolio render record")
  const packed = value as Record<string, unknown>
  assert.deepEqual(Object.keys(packed).sort(), ["format", "nodes", "root"], "Unexpected portfolio render fields")
  assert.equal(packed.format, format, "Unknown portfolio render format")
  assert.ok(Array.isArray(packed.nodes) && packed.nodes.length > 0 && packed.nodes.length <= limits.nodes, "Invalid portfolio render node inventory")
  assert.equal(packed.root, packed.nodes.length - 1, "Portfolio render root must be the final node")
  const nodes = packed.nodes as unknown[], decoded: unknown[] = [], costs: Cost[] = []
  const signatures = new Set<string>(), edges: number[][] = []
  let references = 0, packedBytes = 0
  const reference = (child: unknown, at: number, own: number[]): number => {
    assert.ok(Number.isSafeInteger(child) && Number(child) >= 0 && Number(child) < at, "Portfolio render requires strict backward references")
    assert.ok(++references <= limits.references, "Portfolio render exceeds its reference bound")
    own.push(child as number)
    return child as number
  }
  for (const [index, raw] of nodes.entries()) {
    assert.ok(Array.isArray(raw) && raw.length >= 1 && raw.length <= 2, "Invalid portfolio render node")
    const own: number[] = []
    let result: unknown, cost: Cost
    if (raw[0] === "string") {
      assert.ok(raw.length === 2 && typeof raw[1] === "string", "Invalid portfolio render string")
      assert.ok(Buffer.byteLength(raw[1], "utf8") <= limits.stringBytes, "Portfolio render string exceeds its byte bound")
      result = raw[1]; cost = { nodes: 1, bytes: encodedBytes(result), depth: 1 }
    } else if (raw[0] === "value") {
      const literal: unknown = raw[1]
      assert.ok(raw.length === 2 && (literal === null || typeof literal === "boolean"
        || (typeof literal === "number" && Number.isFinite(literal) && !Object.is(literal, -0))), "Invalid portfolio render literal")
      result = literal; cost = { nodes: 1, bytes: encodedBytes(result), depth: 1 }
    } else if (raw[0] === "negative-zero") {
      assert.equal(raw.length, 1, "Invalid portfolio negative zero")
      result = -0; cost = { nodes: 1, bytes: 1, depth: 1 }
    } else if (raw[0] === "array") {
      assert.ok(raw.length === 2 && Array.isArray(raw[1]) && raw[1].length <= limits.references, "Invalid portfolio render array")
      const output: unknown[] = []
      let count = 1, bytes = 2, depth = 1
      for (const child of raw[1]) {
        const at = reference(child, index, own), childCost = costs[at]!
        count += childCost.nodes; bytes += childCost.bytes + (output.length ? 1 : 0); depth = Math.max(depth, childCost.depth + 1)
        checkedCost({ nodes: count, bytes, depth }); output.push(decoded[at])
      }
      result = output; cost = { nodes: count, bytes, depth }
    } else if (raw[0] === "object") {
      assert.ok(raw.length === 2 && Array.isArray(raw[1]) && raw[1].length * 2 <= limits.references, "Invalid portfolio render object")
      const output: Record<string, unknown> = {}
      let count = 1, bytes = 2, depth = 1, previous: string | undefined, entries = 0
      for (const entry of raw[1]) {
        assert.ok(Array.isArray(entry) && entry.length === 2, "Invalid portfolio render object entry")
        const keyAt = reference(entry[0], index, own), at = reference(entry[1], index, own), key = decoded[keyAt]
        assert.ok(typeof key === "string" && (previous === undefined || previous < key), "Portfolio render object keys must be unique sorted strings")
        const childCost = costs[at]!
        count += childCost.nodes; bytes += costs[keyAt]!.bytes + 1 + childCost.bytes + (entries ? 1 : 0); depth = Math.max(depth, childCost.depth + 1)
        checkedCost({ nodes: count, bytes, depth })
        // defineProperty treats __proto__, constructor and prototype as data;
        // assigning an untrusted key must never invoke a prototype setter.
        Object.defineProperty(output, key, { value: decoded[at], enumerable: true, configurable: true, writable: true })
        previous = key; entries++
      }
      result = output; cost = { nodes: count, bytes, depth }
    } else assert.fail("Unknown portfolio render node tag")
    const signature = JSON.stringify(raw)
    assert.ok(!signatures.has(signature), "Portfolio render nodes must be interned uniquely")
    packedBytes += Buffer.byteLength(signature, "utf8") + 1
    assert.ok(packedBytes <= limits.packedBytes, "Portfolio render exceeds its packed byte bound")
    signatures.add(signature); edges.push(own); decoded.push(result); costs.push(checkedCost(cost))
  }
  const reached = new Set<number>(), pending = [packed.root as number]
  while (pending.length) {
    const index = pending.pop()!
    if (reached.has(index)) continue
    reached.add(index)
    for (const child of edges[index]!) pending.push(child)
  }
  assert.equal(reached.size, nodes.length, "Portfolio render contains unreachable nodes")
  assert.ok(encodedBytes(packed) <= limits.packedBytes, "Portfolio render exceeds its packed byte bound")
  return decoded[packed.root as number]
}
