import { describe, expect, test } from "bun:test"

import { PORTABLE_SLOPCAMERA_OPERATION_KINDS } from "./code/public-operations"
import {
  createPortableSlopcameraCapabilityManifest,
  slopcameraPortableCapabilityManifest,
} from "./portable-capability-manifest"

describe("portable capability manifest", () => {
  test("projects the complete fixed portable operation catalog", () => {
    expect(slopcameraPortableCapabilityManifest.host).toBe("portable")
    expect(slopcameraPortableCapabilityManifest.modules.flatMap(module => module.operations).map(operation => operation.kind).sort()).toEqual(
      [...PORTABLE_SLOPCAMERA_OPERATION_KINDS].sort(),
    )
  })

  test("is deterministic and deeply frozen", () => {
    expect(createPortableSlopcameraCapabilityManifest()).toEqual(slopcameraPortableCapabilityManifest)
    expect(Object.isFrozen(slopcameraPortableCapabilityManifest)).toBe(true)
    expect(Object.isFrozen(slopcameraPortableCapabilityManifest.modules[0]?.operations)).toBe(true)
  })
})
