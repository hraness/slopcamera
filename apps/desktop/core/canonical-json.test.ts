import { expect, test } from "bun:test";

import { canonicalJson, canonicalJsonSha256, sha256Hex } from "./canonical-json";

test("canonical JSON orders keys recursively", () => {
  expect(canonicalJson({ z: 1, a: { y: 2, b: 3 } })).toBe('{"a":{"b":3,"y":2},"z":1}');
});

test("portable SHA-256 matches the standard vector", () => {
  expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

// The desktop façade re-exports @hraness/slopcamera/code/advanced, so the
// full parity harness in src/code/canonical-parity.test.ts applies. These
// vectors pin the same @hraness/oh RFC 8785 bytes through this surface.
test("façade preserves @hraness/oh parity vectors", () => {
  expect(canonicalJson({ "2": "two", "10": "ten", Z: 26, a: 1 })).toBe(
    '{"10":"ten","2":"two","Z":26,"a":1}',
  );
  expect(canonicalJson([1, "two", false, null, [3, { x: [] }]])).toBe(
    '[1,"two",false,null,[3,{"x":[]}]]',
  );
  expect(sha256Hex('{"10":"ten","2":"two","Z":26,"a":1}')).toBe(
    canonicalJsonSha256({ "2": "two", "10": "ten", Z: 26, a: 1 }),
  );
});
