import {
  compileSlopcameraCapabilityManifest,
  defineSlopcameraCapabilityModule,
  type SlopcameraCapabilityManifest,
  type SlopcameraCapabilityOperation,
} from "./capability-manifest.js"
import {
  PORTABLE_SLOPCAMERA_OPERATION_CONTRACTS,
  PORTABLE_SLOPCAMERA_OPERATION_KINDS,
  type PortableSlopcameraOperationKind,
} from "./code/public-operations.js"

export const SLOPCAMERA_PORTABLE_CAPABILITY_VERSION = "slopcamera-portable-v1" as const

const portableModule = defineSlopcameraCapabilityModule({
  commands: [],
  description: "The fixed portable diagram and image operation projection for Bun SDK consumers.",
  moduleId: "slopcamera.capability.portable-diagram-image",
  operationKeys: PORTABLE_SLOPCAMERA_OPERATION_KINDS.map(kind => `${kind}@2`),
  profiles: [{
    id: "portable-bun-v1",
    kind: "authoring",
    qualification: { evidence: ["src/code/public-operations.ts"], level: "unit", status: "qualified" },
    requirements: [{ description: "Bun 1.3.14 or newer.", id: "bun", optional: false }],
  }],
  stability: "stable",
  title: "Portable diagrams and images",
  toolNames: [],
  trust: "portable",
  version: 1,
  workflowKeys: [],
})

function operationProjection(kind: PortableSlopcameraOperationKind): SlopcameraCapabilityOperation {
  const operation = PORTABLE_SLOPCAMERA_OPERATION_CONTRACTS[kind]
  return {
    cache: operation.policy.cache,
    cancellable: operation.policy.cancellable,
    effect: operation.policy.effect,
    inputSchemaId: operation.inputSchemaId,
    key: `${operation.kind}@${operation.version}`,
    kind: operation.kind,
    lifecycle: operation.lifecycle,
    maxDurationMs: operation.policy.maxDurationMs,
    maxFanOut: operation.policy.maxFanOut,
    maxInputBytes: operation.policy.maxInputBytes,
    maxOutputBytes: operation.policy.maxOutputBytes,
    outputSchemaId: operation.outputSchemaId,
    preparation: [...operation.policy.preparation],
    resources: operation.policy.resources.map(claim => ({ ...claim })),
    resume: operation.policy.resume,
    version: operation.version,
  }
}

export function createPortableSlopcameraCapabilityManifest(): SlopcameraCapabilityManifest {
  return compileSlopcameraCapabilityManifest({
    host: "portable",
    modules: [portableModule],
    operations: PORTABLE_SLOPCAMERA_OPERATION_KINDS.map(operationProjection),
    tools: [],
    toolVersion: SLOPCAMERA_PORTABLE_CAPABILITY_VERSION,
    workflows: [],
  })
}

export const slopcameraPortableCapabilityManifest = createPortableSlopcameraCapabilityManifest()
