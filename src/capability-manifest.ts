import { z } from "zod"

import { canonicalJsonSha256 } from "./code/canonical-json.js"
import { createBoundedJsonValueSnapshot, deepFreezeJson } from "./code/json-snapshot.js"

export const SLOPCAMERA_CAPABILITY_MANIFEST_LIMITS = Object.freeze({
  bytes: 4 * 1024 * 1024,
  commands: 256,
  evidence: 64,
  modules: 64,
  operations: 512,
  profiles: 128,
  requirements: 32,
  tools: 128,
  workflows: 128,
})

const identifier = z.string().min(1).max(192).regex(/^[a-z][a-z0-9]*(?:[-_.:/@][a-z0-9]+)*$/u)
const commandName = z.string().min(1).max(128).regex(/^[a-z][a-z0-9-]*(?: [a-z][a-z0-9-]*){0,3}$/u)
const digest = z.string().regex(/^[a-f0-9]{64}$/u)
const positiveSafeInteger = z.number().int().safe().positive()
const nonnegativeSafeInteger = z.number().int().safe().nonnegative()

export const SlopcameraCapabilityEffectSchema = z.enum([
  "pure",
  "local-read",
  "local-derived-write",
  "project-mutation",
  "paid-cloud",
  "live-control",
])

export const SlopcameraCapabilityResumeSchema = z.enum([
  "deterministic",
  "verified-receipt",
  "recoverable-transaction",
  "ambiguous-after-dispatch",
  "non-resumable-live",
])

export const SlopcameraCapabilityResourceSchema = z.enum([
  "cpu",
  "local-io",
  "ffmpeg",
  "vision",
  "whisper",
  "network",
  "paid-call",
  "project-render",
  "project-publication",
  "output-publication",
  "capture-device",
  "browser",
])

export const SlopcameraCapabilityPreparationSchema = z.enum([
  "project-state",
  "recording-metadata",
  "screen-capture",
  "camera",
  "microphone",
  "system-audio",
  "typed-text",
  "window-metadata",
  "local-media",
  "provider-options",
])

export const SlopcameraCapabilityOperationSchema = z.strictObject({
  cache: z.enum(["none", "exact-run", "content-addressed"]),
  cancellable: z.boolean(),
  effect: SlopcameraCapabilityEffectSchema,
  inputSchemaId: identifier,
  key: z.string().min(3).max(256).regex(/^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*@[1-9][0-9]*$/u),
  kind: z.string().min(3).max(192).regex(/^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*)+$/u),
  lifecycle: z.enum(["pure", "local-artifact", "project-transaction", "paid-dispatch", "live-control"]),
  maxDurationMs: positiveSafeInteger,
  maxFanOut: nonnegativeSafeInteger,
  maxInputBytes: nonnegativeSafeInteger,
  maxOutputBytes: nonnegativeSafeInteger,
  outputSchemaId: identifier,
  preparation: z.array(SlopcameraCapabilityPreparationSchema).max(SLOPCAMERA_CAPABILITY_MANIFEST_LIMITS.requirements),
  resources: z.array(z.strictObject({
    amount: positiveSafeInteger,
    resource: SlopcameraCapabilityResourceSchema,
  })).max(SLOPCAMERA_CAPABILITY_MANIFEST_LIMITS.requirements),
  resume: SlopcameraCapabilityResumeSchema,
  version: positiveSafeInteger,
}).superRefine((operation, context) => {
  if (operation.key !== `${operation.kind}@${operation.version}`) {
    context.addIssue({ code: "custom", path: ["key"], message: "Operation key must match kind and version." })
  }
  if (new Set(operation.preparation).size !== operation.preparation.length) {
    context.addIssue({ code: "custom", path: ["preparation"], message: "Operation preparation entries must be unique." })
  }
  const resources = operation.resources.map(claim => claim.resource)
  if (new Set(resources).size !== resources.length) {
    context.addIssue({ code: "custom", path: ["resources"], message: "Operation resource claims must be unique by resource." })
  }
})

export const SlopcameraCapabilityWorkflowSchema = z.strictObject({
  id: identifier,
  inputSchemaId: identifier,
  key: z.string().min(3).max(256).regex(/^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*@[1-9][0-9]*$/u),
  version: positiveSafeInteger,
}).superRefine((workflow, context) => {
  if (workflow.key !== `${workflow.id}@${workflow.version}`) {
    context.addIssue({ code: "custom", path: ["key"], message: "Workflow key must match id and version." })
  }
})

export const SlopcameraCapabilityToolSchema = z.strictObject({
  destructive: z.boolean(),
  idempotent: z.boolean(),
  name: z.string().min(1).max(128).regex(/^[a-z][a-z0-9_]*$/u),
  openWorld: z.boolean(),
  readOnly: z.boolean(),
}).superRefine((tool, context) => {
  if (tool.readOnly && tool.destructive) {
    context.addIssue({ code: "custom", message: "A read-only tool cannot be destructive." })
  }
})

export const SlopcameraCapabilityCommandSchema = z.strictObject({
  effect: SlopcameraCapabilityEffectSchema,
  name: commandName,
})

export const SlopcameraCapabilityQualificationSchema = z.strictObject({
  evidence: z.array(z.string().min(1).max(512)).max(SLOPCAMERA_CAPABILITY_MANIFEST_LIMITS.evidence),
  level: z.enum(["unit", "fixture", "browser", "native", "provider"]),
  status: z.enum(["qualified", "conditional", "not-qualified"]),
}).superRefine((qualification, context) => {
  if (qualification.status !== "not-qualified" && qualification.evidence.length === 0) {
    context.addIssue({ code: "custom", path: ["evidence"], message: "Qualified or conditional profiles require evidence references." })
  }
})

export const SlopcameraCapabilityProfileSchema = z.strictObject({
  id: identifier,
  kind: z.enum(["renderer", "native-adapter", "provider", "authoring", "interchange"]),
  qualification: SlopcameraCapabilityQualificationSchema,
  requirements: z.array(z.strictObject({
    description: z.string().min(1).max(256),
    id: identifier,
    optional: z.boolean(),
  })).max(SLOPCAMERA_CAPABILITY_MANIFEST_LIMITS.requirements),
})

export const SlopcameraCapabilityModuleDeclarationSchema = z.strictObject({
  commands: z.array(SlopcameraCapabilityCommandSchema).max(SLOPCAMERA_CAPABILITY_MANIFEST_LIMITS.commands),
  description: z.string().min(1).max(1_024),
  moduleId: z.string().min(1).max(128).regex(/^slopcamera\.capability\.[a-z][a-z0-9-]*$/u),
  operationKeys: z.array(z.string().min(3).max(256)).max(SLOPCAMERA_CAPABILITY_MANIFEST_LIMITS.operations),
  profiles: z.array(SlopcameraCapabilityProfileSchema).max(SLOPCAMERA_CAPABILITY_MANIFEST_LIMITS.profiles),
  stability: z.enum(["stable", "experimental"]),
  title: z.string().min(1).max(160),
  toolNames: z.array(z.string().min(1).max(128)).max(SLOPCAMERA_CAPABILITY_MANIFEST_LIMITS.tools),
  trust: z.enum(["portable", "local-effects", "trusted-authoring", "native-adapter", "paid-provider"]),
  version: positiveSafeInteger,
  workflowKeys: z.array(z.string().min(3).max(256)).max(SLOPCAMERA_CAPABILITY_MANIFEST_LIMITS.workflows),
}).superRefine((module, context) => {
  if (module.commands.length + module.operationKeys.length + module.profiles.length + module.toolNames.length + module.workflowKeys.length === 0) {
    context.addIssue({ code: "custom", message: "A capability module must expose at least one command, operation, profile, tool, or workflow." })
  }
  for (const [name, values] of [["operationKeys", module.operationKeys], ["toolNames", module.toolNames], ["workflowKeys", module.workflowKeys]] as const) {
    if (new Set(values).size !== values.length) {
      context.addIssue({ code: "custom", path: [name], message: `${name} must be unique within a capability module.` })
    }
  }
})

export const SlopcameraCapabilityModuleSchema = z.strictObject({
  commands: z.array(SlopcameraCapabilityCommandSchema).max(SLOPCAMERA_CAPABILITY_MANIFEST_LIMITS.commands),
  description: z.string().min(1).max(1_024),
  moduleId: z.string().min(1).max(128).regex(/^slopcamera\.capability\.[a-z][a-z0-9-]*$/u),
  operations: z.array(SlopcameraCapabilityOperationSchema).max(SLOPCAMERA_CAPABILITY_MANIFEST_LIMITS.operations),
  profiles: z.array(SlopcameraCapabilityProfileSchema).max(SLOPCAMERA_CAPABILITY_MANIFEST_LIMITS.profiles),
  stability: z.enum(["stable", "experimental"]),
  title: z.string().min(1).max(160),
  tools: z.array(SlopcameraCapabilityToolSchema).max(SLOPCAMERA_CAPABILITY_MANIFEST_LIMITS.tools),
  trust: z.enum(["portable", "local-effects", "trusted-authoring", "native-adapter", "paid-provider"]),
  version: positiveSafeInteger,
  workflows: z.array(SlopcameraCapabilityWorkflowSchema).max(SLOPCAMERA_CAPABILITY_MANIFEST_LIMITS.workflows),
}).superRefine((module, context) => {
  const identities = [
    ["commands", module.commands.map(value => value.name)],
    ["operations", module.operations.map(value => value.key)],
    ["profiles", module.profiles.map(value => value.id)],
    ["tools", module.tools.map(value => value.name)],
    ["workflows", module.workflows.map(value => value.key)],
  ] as const
  if (identities.every(([, values]) => values.length === 0)) {
    context.addIssue({ code: "custom", message: "A capability module must expose at least one command, operation, profile, tool, or workflow." })
  }
  for (const [name, values] of identities) {
    if (new Set(values).size !== values.length) context.addIssue({ code: "custom", path: [name], message: `${name} must be unique within a capability module.` })
  }
})

const manifestBodyBaseSchema = z.strictObject({
  host: z.enum(["portable", "local"]),
  kind: z.literal("slopcamera.capability-manifest"),
  modules: z.array(SlopcameraCapabilityModuleSchema).min(1).max(SLOPCAMERA_CAPABILITY_MANIFEST_LIMITS.modules),
  schemaVersion: z.literal(1),
  toolVersion: z.string().min(1).max(128),
})

type ManifestBody = z.infer<typeof manifestBodyBaseSchema>

function validateManifestOwnership(manifest: ManifestBody, context: z.RefinementCtx): void {
  const ownership = new Map<string, string>()
  for (const [moduleIndex, module] of manifest.modules.entries()) {
    for (const identity of [
      module.moduleId,
      ...module.commands.map(value => `command:${value.name}`),
      ...module.operations.map(value => `operation:${value.key}`),
      ...module.profiles.map(value => `profile:${value.id}`),
      ...module.tools.map(value => `tool:${value.name}`),
      ...module.workflows.map(value => `workflow:${value.key}`),
    ]) {
      const owner = ownership.get(identity)
      if (owner !== undefined) context.addIssue({ code: "custom", path: ["modules", moduleIndex], message: `${identity} is owned by both ${owner} and ${module.moduleId}.` })
      ownership.set(identity, module.moduleId)
    }
    if (manifest.host === "portable" && module.trust !== "portable") {
      context.addIssue({ code: "custom", path: ["modules", moduleIndex, "trust"], message: "Portable manifests may contain only portable capability modules." })
    }
  }
}

const manifestBodySchema = manifestBodyBaseSchema.superRefine(validateManifestOwnership)

export const SlopcameraCapabilityManifestSchema = manifestBodyBaseSchema.extend({
  manifestSha256: digest,
}).superRefine(validateManifestOwnership)

const compilerInputSchema = z.strictObject({
  host: z.enum(["portable", "local"]),
  modules: z.array(SlopcameraCapabilityModuleDeclarationSchema).min(1).max(SLOPCAMERA_CAPABILITY_MANIFEST_LIMITS.modules),
  operations: z.array(SlopcameraCapabilityOperationSchema).max(SLOPCAMERA_CAPABILITY_MANIFEST_LIMITS.operations),
  tools: z.array(SlopcameraCapabilityToolSchema).max(SLOPCAMERA_CAPABILITY_MANIFEST_LIMITS.tools),
  toolVersion: z.string().min(1).max(128),
  workflows: z.array(SlopcameraCapabilityWorkflowSchema).max(SLOPCAMERA_CAPABILITY_MANIFEST_LIMITS.workflows),
})

export type SlopcameraCapabilityOperation = Readonly<z.infer<typeof SlopcameraCapabilityOperationSchema>>
export type SlopcameraCapabilityWorkflow = Readonly<z.infer<typeof SlopcameraCapabilityWorkflowSchema>>
export type SlopcameraCapabilityTool = Readonly<z.infer<typeof SlopcameraCapabilityToolSchema>>
export type SlopcameraCapabilityModuleDeclaration = Readonly<z.infer<typeof SlopcameraCapabilityModuleDeclarationSchema>>
export type SlopcameraCapabilityManifest = Readonly<z.infer<typeof SlopcameraCapabilityManifestSchema>>

function compareBy<Key extends string>(key: Key) {
  return <Value extends Readonly<Record<Key, string>>>(left: Value, right: Value): number => left[key].localeCompare(right[key])
}

function indexed<Value>(values: readonly Value[], key: (value: Value) => string, label: string): ReadonlyMap<string, Value> {
  const result = new Map<string, Value>()
  for (const value of values) {
    const identity = key(value)
    if (result.has(identity)) throw new TypeError(`Duplicate ${label}: ${identity}.`)
    result.set(identity, value)
  }
  return result
}

function assertExactOwnership(label: string, available: ReadonlyMap<string, unknown>, owners: ReadonlyMap<string, string>): void {
  for (const key of available.keys()) {
    if (!owners.has(key)) throw new TypeError(`Unowned ${label}: ${key}.`)
  }
  for (const key of owners.keys()) {
    if (!available.has(key)) throw new TypeError(`Unknown ${label} declared by a capability module: ${key}.`)
  }
}

export function defineSlopcameraCapabilityModule(input: unknown): SlopcameraCapabilityModuleDeclaration {
  return deepFreezeJson(SlopcameraCapabilityModuleDeclarationSchema.parse(
    createBoundedJsonValueSnapshot(input, SLOPCAMERA_CAPABILITY_MANIFEST_LIMITS.bytes, "capability module").value,
  ))
}

export function compileSlopcameraCapabilityManifest(input: unknown): SlopcameraCapabilityManifest {
  const parsed = compilerInputSchema.parse(
    createBoundedJsonValueSnapshot(input, SLOPCAMERA_CAPABILITY_MANIFEST_LIMITS.bytes, "capability manifest compiler input").value,
  )
  const operations = indexed(parsed.operations, value => value.key, "operation inventory key")
  const workflows = indexed(parsed.workflows, value => value.key, "workflow inventory key")
  const tools = indexed(parsed.tools, value => value.name, "tool inventory name")
  const operationOwners = new Map<string, string>()
  const workflowOwners = new Map<string, string>()
  const toolOwners = new Map<string, string>()
  const moduleIds = new Set<string>()
  const commandOwners = new Map<string, string>()
  const profileOwners = new Map<string, string>()

  const claim = (owners: Map<string, string>, key: string, moduleId: string, label: string): void => {
    const owner = owners.get(key)
    if (owner !== undefined) throw new TypeError(`${label} ${key} is owned by both ${owner} and ${moduleId}.`)
    owners.set(key, moduleId)
  }

  const modules = [...parsed.modules].sort(compareBy("moduleId")).map(module => {
    if (moduleIds.has(module.moduleId)) throw new TypeError(`Duplicate capability module: ${module.moduleId}.`)
    moduleIds.add(module.moduleId)
    for (const command of module.commands) claim(commandOwners, command.name, module.moduleId, "Command")
    for (const profile of module.profiles) claim(profileOwners, profile.id, module.moduleId, "Profile")
    const resolvedOperations = module.operationKeys.map(key => {
      claim(operationOwners, key, module.moduleId, "Operation")
      const value = operations.get(key)
      if (value === undefined) throw new TypeError(`Unknown operation declared by ${module.moduleId}: ${key}.`)
      return value
    }).sort(compareBy("key"))
    const resolvedWorkflows = module.workflowKeys.map(key => {
      claim(workflowOwners, key, module.moduleId, "Workflow")
      const value = workflows.get(key)
      if (value === undefined) throw new TypeError(`Unknown workflow declared by ${module.moduleId}: ${key}.`)
      return value
    }).sort(compareBy("key"))
    const resolvedTools = module.toolNames.map(name => {
      claim(toolOwners, name, module.moduleId, "Tool")
      const value = tools.get(name)
      if (value === undefined) throw new TypeError(`Unknown tool declared by ${module.moduleId}: ${name}.`)
      return value
    }).sort(compareBy("name"))
    const { operationKeys: _operationKeys, toolNames: _toolNames, workflowKeys: _workflowKeys, ...metadata } = module
    return {
      ...metadata,
      commands: [...module.commands].sort(compareBy("name")),
      operations: resolvedOperations,
      profiles: [...module.profiles].sort(compareBy("id")),
      tools: resolvedTools,
      workflows: resolvedWorkflows,
    }
  })

  assertExactOwnership("operation", operations, operationOwners)
  assertExactOwnership("workflow", workflows, workflowOwners)
  assertExactOwnership("tool", tools, toolOwners)
  const body = manifestBodySchema.parse({
    host: parsed.host,
    kind: "slopcamera.capability-manifest",
    modules,
    schemaVersion: 1,
    toolVersion: parsed.toolVersion,
  })
  return deepFreezeJson(SlopcameraCapabilityManifestSchema.parse({
    ...body,
    manifestSha256: canonicalJsonSha256(body),
  }))
}

export function parseSlopcameraCapabilityManifest(input: unknown): SlopcameraCapabilityManifest {
  const manifest = SlopcameraCapabilityManifestSchema.parse(
    createBoundedJsonValueSnapshot(input, SLOPCAMERA_CAPABILITY_MANIFEST_LIMITS.bytes, "capability manifest").value,
  )
  const { manifestSha256, ...body } = manifest
  const actual = canonicalJsonSha256(body)
  if (actual !== manifestSha256) throw new TypeError(`Capability manifest digest mismatch: expected ${manifestSha256}, received ${actual}.`)
  return deepFreezeJson(manifest)
}
