import { describe, expect, test } from "bun:test"

import { canonicalJsonSha256 } from "./code/canonical-json"
import {
  compileSlopcameraCapabilityManifest,
  defineSlopcameraCapabilityModule,
  parseSlopcameraCapabilityManifest,
} from "./capability-manifest"

const operation = {
  cache: "content-addressed",
  cancellable: true,
  effect: "pure",
  inputSchemaId: "slopcamera.test.input/v1",
  key: "test.inspect@1",
  kind: "test.inspect",
  lifecycle: "pure",
  maxDurationMs: 1_000,
  maxFanOut: 0,
  maxInputBytes: 1_024,
  maxOutputBytes: 2_048,
  outputSchemaId: "slopcamera.test.output/v1",
  preparation: [],
  resources: [{ amount: 1, resource: "cpu" }],
  resume: "deterministic",
  version: 1,
} as const

const workflow = {
  id: "test-workflow",
  inputSchemaId: "slopcamera.workflow.test.input/v1",
  key: "test-workflow@1",
  version: 1,
} as const

const tool = {
  destructive: false,
  idempotent: true,
  name: "inspect_test",
  openWorld: false,
  readOnly: true,
} as const

const module = defineSlopcameraCapabilityModule({
  commands: [{ effect: "pure", name: "test inspect" }],
  description: "A deterministic test-only capability module.",
  moduleId: "slopcamera.capability.test",
  operationKeys: [operation.key],
  profiles: [{
    id: "test-profile-v1",
    kind: "authoring",
    qualification: { evidence: ["src/capability-manifest.test.ts"], level: "unit", status: "qualified" },
    requirements: [],
  }],
  stability: "experimental",
  title: "Test capability",
  toolNames: [tool.name],
  trust: "portable",
  version: 1,
  workflowKeys: [workflow.key],
})

function input(overrides: Record<string, unknown> = {}): unknown {
  return {
    host: "local",
    modules: [module],
    operations: [operation],
    tools: [tool],
    toolVersion: "slopcamera-test",
    workflows: [workflow],
    ...overrides,
  }
}

describe("Slopcamera capability manifest", () => {
  test("compiles deterministic exact ownership into a content-addressed manifest", () => {
    const first = compileSlopcameraCapabilityManifest(input())
    const second = compileSlopcameraCapabilityManifest(input({
      operations: [operation],
      tools: [tool],
      workflows: [workflow],
    }))
    expect(first).toEqual(second)
    expect(parseSlopcameraCapabilityManifest(first)).toEqual(first)
    expect(first.modules[0]?.operations[0]?.key).toBe(operation.key)
    expect(first.manifestSha256).toMatch(/^[a-f0-9]{64}$/u)
  })

  test("rejects unowned and unknown operation inventory entries", () => {
    const extra = { ...operation, key: "test.render@1", kind: "test.render" }
    expect(() => compileSlopcameraCapabilityManifest(input({ operations: [operation, extra] }))).toThrow(/Unowned operation/)
    expect(() => compileSlopcameraCapabilityManifest(input({ operations: [] }))).toThrow(/Unknown operation/)
  })

  test("rejects duplicate ownership across modules", () => {
    const duplicate = { ...module, moduleId: "slopcamera.capability.other" }
    expect(() => compileSlopcameraCapabilityManifest(input({ modules: [module, duplicate] }))).toThrow(/owned by both/)
  })

  test("rejects duplicate inventory keys before module resolution", () => {
    expect(() => compileSlopcameraCapabilityManifest(input({ operations: [operation, operation] }))).toThrow(/Duplicate operation inventory key/)
  })

  test("rejects a tampered manifest digest", () => {
    const manifest = compileSlopcameraCapabilityManifest(input())
    expect(() => parseSlopcameraCapabilityManifest({ ...manifest, toolVersion: "changed" })).toThrow(/digest mismatch/)
  })

  test("rejects duplicate foreign ownership even with a valid digest", () => {
    const manifest = compileSlopcameraCapabilityManifest(input())
    const { manifestSha256: _manifestSha256, ...originalBody } = manifest
    const duplicateModule = { ...manifest.modules[0]!, moduleId: "slopcamera.capability.other" }
    const body = { ...originalBody, modules: [...manifest.modules, duplicateModule] }
    expect(() => parseSlopcameraCapabilityManifest({ ...body, manifestSha256: canonicalJsonSha256(body) })).toThrow(/owned by both/)
  })

  test("rejects non-portable trust in a portable manifest", () => {
    const manifest = compileSlopcameraCapabilityManifest(input())
    const localModule = { ...manifest.modules[0]!, trust: "local-effects" }
    const body = { host: "portable", kind: manifest.kind, modules: [localModule], schemaVersion: 1, toolVersion: manifest.toolVersion }
    expect(() => parseSlopcameraCapabilityManifest({ ...body, manifestSha256: canonicalJsonSha256(body) })).toThrow(/only portable/)
  })
})
