import { describe, expect, test } from "bun:test"
import fc from "fast-check"

import {
  boundedCanonicalJson,
  canonicalJson,
  canonicalJsonFingerprint,
  canonicalJsonSha256,
  compareUtf16Strings,
} from "./canonical-json.js"
import { SlopcameraCodeError } from "./errors.js"

/**
 * Cross-implementation parity harness against @hraness/oh's RFC 8785
 * canonicalizer (src/canonical.ts, canonicalJson/canonicalSha256). Every
 * golden byte string and digest below was produced by that implementation;
 * nothing here imports the sibling checkout, so the vectors pin parity on
 * the shared domain rather than re-deriving it.
 *
 * Shared domain (byte- and digest-identical): finite numbers other than
 * -0, well-formed UTF-16 strings, dense arrays, and plain objects whose
 * own keys are enumerable string data properties, with keys ordered by
 * UTF-16 code unit.
 *
 * Intentional wider domain (slopcamera accepts, oh rejects): -0
 * normalized to 0, unpaired surrogates serialized as \uXXXX escapes,
 * non-enumerable own properties ignored, non-index array properties
 * ignored, and iterative traversal beyond oh's recursive stack range.
 */

interface GoldenVector {
  readonly bytes: number
  readonly canonical: string
  readonly name: string
  readonly sha256: string
  readonly value: unknown
}

const DEEP_NESTING_96_CANONICAL =
  '{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":{"level":"leaf"}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}'

function deepNesting96(): unknown {
  let value: unknown = "leaf"
  for (let depth = 0; depth < 96; depth += 1) value = { level: value }
  return value
}

const GOLDEN_VECTORS: readonly GoldenVector[] = [
  { name: "null", value: null, canonical: "null", bytes: 4, sha256: "74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b" },
  { name: "true", value: true, canonical: "true", bytes: 4, sha256: "b5bea41b6c623f7c09f1bf24dcae58ebab3c0cdd90ad966bc43a45b44867e12b" },
  { name: "false", value: false, canonical: "false", bytes: 5, sha256: "fcbcf165908dd18a9e49f7ff27810176db8e9f63b4352213741664245224f8aa" },
  { name: "integer", value: 42, canonical: "42", bytes: 2, sha256: "73475cb40a568e8da8a045ced110137e159f890ac4da883b6b17dc651b3a8049" },
  { name: "negative fraction", value: -17.5, canonical: "-17.5", bytes: 5, sha256: "ecb465b48806e3f55ddfa2a3c782248e0793bbbcc70801e3823997c3858f97b4" },
  { name: "1e21 exponent", value: 1e21, canonical: "1e+21", bytes: 5, sha256: "241c4643fa70b1dcde1205b71be4e3bebb17e9f880c8e1a33d0ead6c27271d3c" },
  { name: "min positive double", value: 5e-324, canonical: "5e-324", bytes: 6, sha256: "c46e7ca1be4c8734f373a56530787288fa2058d73d07855e9247e949f811a42a" },
  { name: "max safe integer", value: 9007199254740991, canonical: "9007199254740991", bytes: 16, sha256: "f40b423c2dd95ff2b2f027e22208f438cf7242862e5e746860e697308c9add26" },
  { name: "plain string", value: "plain ASCII text", canonical: "\"plain ASCII text\"", bytes: 18, sha256: "34efcdd23b5eb1116705c8a0bbac7efe9eb5c65b6397d6661bed2bed941d7a85" },
  { name: "escape-heavy string", value: "quote\" backslash\\ solidus/ \b\f\n\r\t control", canonical: "\"quote\\\" backslash\\\\ solidus/ \\b\\f\\n\\r\\t control\\u001f\"", bytes: 55, sha256: "21c6c7d3fc895d433d79870245dd31168f3b851575b06ac0b3ba9915afbb6c11" },
  { name: "unicode string", value: "é世🎨", canonical: "\"é世🎨\"", bytes: 11, sha256: "0ed6556bec12bc8df2dfbdae6052deb44ca8d54512db4f29b2a28358f2eead06" },
  { name: "empty array", value: [], canonical: "[]", bytes: 2, sha256: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945" },
  { name: "empty object", value: {}, canonical: "{}", bytes: 2, sha256: "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a" },
  { name: "nested mixed array", value: [1, "two", false, null, [3, { x: [] }]], canonical: "[1,\"two\",false,null,[3,{\"x\":[]}]]", bytes: 33, sha256: "9c3f69d4d5ff4e438bcfcbdb599185dfa645de0bfab1e5bbb6a277988f928271" },
  {
    name: "code-unit key order",
    value: { "2": "two", "10": "ten", Z: 26, a: 1, "é": "e-acute", "世": "world", "🎨": "art", "": "empty key" },
    canonical: "{\"\":\"empty key\",\"10\":\"ten\",\"2\":\"two\",\"Z\":26,\"a\":1,\"é\":\"e-acute\",\"世\":\"world\",\"🎨\":\"art\"}",
    bytes: 92,
    sha256: "69cd12474b04a55c1c69afc432612150755a55c34d85a3d92bf8cc034fdbd2a8",
  },
  {
    name: "nested object graph",
    value: { arr: [{ k: "v" }, {}], deep: { a: { b: { c: [{ d: 1 }] } } }, num: -0.25, list: [9007199254740991, 5e-324, 1e21] },
    canonical: "{\"arr\":[{\"k\":\"v\"},{}],\"deep\":{\"a\":{\"b\":{\"c\":[{\"d\":1}]}}},\"list\":[9007199254740991,5e-324,1e+21],\"num\":-0.25}",
    bytes: 108,
    sha256: "941d09daaf9140cce73f75bd834f3a78c147ad28af7d5944733562810f02b50f",
  },
  { name: "deep nesting x96", value: deepNesting96(), canonical: DEEP_NESTING_96_CANONICAL, bytes: 966, sha256: "de490df9c5ad687c8e80bf85f544b471e371a418c6820cc3460b3789f4fe80f4" },
]

const GENEROUS_BOUNDS = { maximumBytes: 4 * 1024 * 1024 } as const

function expectInvalidData(value: unknown): void {
  try {
    canonicalJson(value)
  } catch (error) {
    expect(error).toBeInstanceOf(SlopcameraCodeError)
    expect((error as SlopcameraCodeError).code).toBe("invalid-data")
    return
  }
  throw new Error("Expected canonical JSON to reject the value.")
}

const MAX_ARRAY_INDEX = 4_294_967_294 // 2 ** 32 - 2

function isArrayIndexKey(key: string): boolean {
  return /^(?:0|[1-9][0-9]*)$/.test(key) && Number(key) <= MAX_ARRAY_INDEX
}

/**
 * JSON.parse restores array-index keys in ascending numeric order ahead of
 * the insertion order the canonical text carries, so a parsed canonical
 * object exposes index keys numerically then named keys in UTF-16 order.
 */
function expectCanonicalKeyOrder(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) expectCanonicalKeyOrder(item)
    return
  }
  if (typeof value !== "object" || value === null) return
  const keys = Object.keys(value)
  const indexKeys = keys.filter(isArrayIndexKey)
    .sort((left, right) => Number(left) - Number(right))
  const namedKeys = keys.filter(key => !isArrayIndexKey(key))
    .sort(compareUtf16Strings)
  expect(keys).toEqual([...indexKeys, ...namedKeys])
  for (const key of keys) {
    expectCanonicalKeyOrder((value as Record<string, unknown>)[key])
  }
}

describe("canonical JSON parity with @hraness/oh RFC 8785", () => {
  for (const vector of GOLDEN_VECTORS) {
    test(`matches oh byte-for-byte and digest-for-digest: ${vector.name}`, () => {
      expect(canonicalJson(vector.value)).toBe(vector.canonical)
      expect(canonicalJsonSha256(vector.value)).toBe(vector.sha256)
      expect(canonicalJsonFingerprint(vector.value)).toEqual({
        bytes: vector.bytes,
        sha256: vector.sha256,
      })
      expect(boundedCanonicalJson(vector.value, GENEROUS_BOUNDS)).toBe(
        vector.canonical,
      )
      expect(canonicalJson(JSON.parse(vector.canonical))).toBe(
        vector.canonical,
      )
    })
  }

  test("documents the wider domain: -0 normalizes to 0, oh rejects it", () => {
    // oh throws OhValidationError("noncanonical-number"); slopcamera emits
    // the canonical positive zero byte form instead.
    expect(canonicalJson(-0)).toBe("0")
    expect(canonicalJson({ z: -0 })).toBe("{\"z\":0}")
    expect(canonicalJsonSha256(-0)).toBe(
      "5feceb66ffc86f38d952786c6d696c79c2dbc239dd4e91b46729d73a27fb57e9",
    )
  })

  test("documents the wider domain: unpaired surrogates serialize escaped", () => {
    // oh throws OhValidationError("invalid-unicode") for lone surrogates in
    // strings and keys; slopcamera keeps JSON.stringify's well-formed
    // \uXXXX escapes so the output stays valid canonical text.
    expect(canonicalJson("a\ud800b")).toBe("\"a\\ud800b\"")
    expect(canonicalJson("\udfff")).toBe("\"\\udfff\"")
    expect(canonicalJson({ "\ud800": 1 })).toBe("{\"\\ud800\":1}")
    expect(canonicalJsonSha256("a\ud800b")).toBe(
      "27432a872192a56508c32189524a5bd0968069cc88370a7e73c775b971a077df",
    )
    expect(canonicalJsonSha256({ "\ud800": 1 })).toBe(
      "02724f63cc02840d4a3eaa7063b83466eb5a385438138fdbdd235c86874d8ff7",
    )
  })

  test("documents the wider domain: non-enumerable own properties are ignored", () => {
    // oh walks Reflect.ownKeys and throws OhValidationError
    // ("non-json-property") on any non-enumerable or symbol own key;
    // slopcamera reads only enumerable string data descriptors and drops
    // the rest.
    const hidden: Record<string, unknown> = { visible: 2 }
    Object.defineProperty(hidden, "hidden", {
      enumerable: false,
      value: 1,
    })
    const symbolKeyed: Record<string, unknown> = { a: 1 }
    Object.defineProperty(symbolKeyed, Symbol("tag"), {
      enumerable: false,
      value: 1,
    })

    expect(canonicalJson(hidden)).toBe("{\"visible\":2}")
    expect(canonicalJson(symbolKeyed)).toBe("{\"a\":1}")
  })

  test("documents the wider domain: non-index array properties are ignored", () => {
    // oh throws OhValidationError("non-json-property") on any own key that
    // is not an index or "length"; the released canonicalJson domain keeps
    // the Array.map element semantics and ignores named and symbol extras.
    const named = [1, 2] as number[] & { label?: string }
    named.label = "not JSON"
    const symbolKeyed = [1]
    Object.defineProperty(symbolKeyed, Symbol("tag"), {
      enumerable: true,
      value: "also not JSON",
    })

    expect(canonicalJson(named)).toBe("[1,2]")
    expect(canonicalJson(symbolKeyed)).toBe("[1]")
  })

  test("documents the wider domain: iterative traversal beyond oh's stack", () => {
    // oh's recursive encoder overflows the call stack well below this
    // depth (observed RangeError near 9,000 frames); slopcamera's
    // traversal is iterative and stays correct at 20,000 levels.
    let value: unknown = "leaf"
    for (let depth = 0; depth < 20_000; depth += 1) value = { v: value }

    const canonical = canonicalJson(value)
    expect(canonical.length).toBe(120_006)
    expect(canonicalJsonSha256(value)).toBe(
      "0b2d4e7469ac6d13198a33d9102820b47c1c1eb6a814d19e5079e1d8ba49fc42",
    )
  })

  test("rejects the same non-JSON domain oh rejects", () => {
    // Both implementations reject each of these; only the error surface
    // differs (SlopcameraCodeError "invalid-data" vs OhValidationError
    // codes like "non-json-value", "non-json-property", "sparse-array",
    // "non-plain-object", "cycle", "non-json-number").
    const enumerableSymbol: Record<string, unknown> = { a: 1 }
    Object.defineProperty(enumerableSymbol, Symbol("tag"), {
      enumerable: true,
      value: 1,
    })
    const accessor: Record<string, unknown> = {}
    Object.defineProperty(accessor, "value", {
      enumerable: true,
      get: () => 1,
    })
    const sparse = new Array<unknown>(2)
    const cyclic: { self?: unknown } = {}
    cyclic.self = cyclic
    class Box { constructor(readonly v: number) {} }

    const rejected: readonly unknown[] = [
      undefined,
      () => 1,
      Symbol("v"),
      10n,
      { undef: undefined },
      [undefined],
      enumerableSymbol,
      accessor,
      sparse,
      cyclic,
      new Box(1),
      new Date(0),
      Infinity,
      Number.NaN,
    ]
    for (const value of rejected) expectInvalidData(value)
  })

  test("canonical output parses to the input, orders keys by UTF-16 code unit, and is idempotent", () => {
    const scalar = fc.oneof(
      fc.constant(null),
      fc.boolean(),
      fc.integer(),
      fc.double({ noNaN: true, noDefaultInfinity: true }),
      fc.string(),
      // Raw UTF-16 code units exercise the unpaired-surrogate domain that
      // oh rejects but slopcamera serializes through \uXXXX escapes.
      fc.array(fc.integer({ min: 0, max: 0xffff }), { maxLength: 16 })
        .map(units => String.fromCharCode(...units)),
    )
    const { value } = fc.letrec(tie => ({
      value: fc.oneof(
        { maxDepth: 4 },
        scalar,
        fc.array(tie("value"), { maxLength: 6 }),
        fc.dictionary(fc.string(), tie("value"), { maxKeys: 6 }),
      ),
    }))
    // fast-check dictionaries carry a null prototype and can hold -0;
    // JSON text normalization lands every case inside the domain the
    // canonical surface accepts while preserving the JSON value.
    const jsonValue = value.map(
      candidate => JSON.parse(JSON.stringify(candidate)) as unknown,
    )

    fc.assert(
      fc.property(jsonValue, (input) => {
        const canonical = canonicalJson(input)
        const parsed: unknown = JSON.parse(canonical)
        expect(parsed).toEqual(input)
        expectCanonicalKeyOrder(parsed)
        expect(canonicalJson(parsed)).toBe(canonical)
      }),
      { numRuns: 200 },
    )
  })
})
