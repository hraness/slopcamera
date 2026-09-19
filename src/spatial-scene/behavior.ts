import { z } from "zod"

import { boundedCanonicalJsonSha256 } from "../code/canonical-json.js"
import { deepFreezeJson } from "../code/json-snapshot.js"
import {
  SpatialDigestSchema,
  SpatialSceneV1Schema,
  SpatialTimeUsSchema,
  type SpatialSceneV1,
} from "./contracts.js"
import { parseSpatialValue, spatialValueSha256 } from "./identity.js"

/**
 * Behavior documents bind an ALGAL organism closure to one scene entity.
 *
 * A `slopcamera.spatial-behavior` document is bounded, inert, content-addressed
 * data: it carries every organism manifest the behavior needs, keyed by the
 * ALGAL `sha256:` digest, and names the entry organism plus deterministic
 * inputs (seed, range, args). Admission parses from `unknown` through strict
 * schemas and a bake-safe organism profile — a closed subset of
 * `morphogen.organism.v1` containing only `input`, `const`, `fn`, `repeat`,
 * `each`, and `organism` cells. `agent`, `classifier`, `gate`, `tool`,
 * `spawn`, `slot`, `store`, `load` cells and every `via` transport field are
 * structural rejections: bakes must replay deterministically from the document
 * alone, with no model calls, effects, transports, or ambient store state.
 *
 * Organism digests are ALGAL digests — `sha256:` + SHA-256 of canonical JSON
 * over `manifestToJson`'s normalized projection — mirrored here so closure
 * keys rehash exactly against manifests authored with ALGAL tooling.
 */
export const SPATIAL_BEHAVIOR_LIMITS = Object.freeze({
  args: 16,
  carry: 16,
  cells: 64,
  channels: 64,
  constPorts: 32,
  eachItems: 64,
  edges: 256,
  findings: 128,
  interfacePorts: 32,
  organisms: 8,
  rounds: 16,
})

const organismKey = z.string().regex(/^organism:[a-z][a-z0-9-]{0,54}$/u)
const cellId = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/u)
const portName = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/u)
const interfaceName = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/u)
const organismDigest = z.string().regex(/^sha256:[a-f0-9]{64}$/u)
const fnRef = z.string().regex(/^[a-z][a-z0-9_.]*\.v[0-9]+$/u).max(64)

export const SpatialBehaviorPortTypeSchema = z.strictObject({
  type: z.enum(["text", "json", "choice", "ref"]),
  optional: z.boolean().optional(),
  many: z.boolean().optional(),
  labels: z.array(z.string().min(1).max(64)).max(32).optional(),
  schema: z.unknown().optional(),
}).superRefine((port, context) => {
  if (port.labels !== undefined && port.type !== "choice") {
    context.addIssue({ code: "custom", message: "Only choice ports declare labels.", path: ["labels"] })
  }
  if (port.schema !== undefined && port.type !== "json") {
    context.addIssue({ code: "custom", message: "Only json ports declare a schema.", path: ["schema"] })
  }
})
export type SpatialBehaviorPortType = Readonly<z.infer<typeof SpatialBehaviorPortTypeSchema>>

export const SpatialBehaviorPortMapSchema = z.record(
  portName,
  SpatialBehaviorPortTypeSchema,
).refine((ports) => Object.keys(ports).length <= SPATIAL_BEHAVIOR_LIMITS.interfacePorts, {
  message: `A port map admits at most ${SPATIAL_BEHAVIOR_LIMITS.interfacePorts} ports.`,
})
export type SpatialBehaviorPortMap = Readonly<z.infer<typeof SpatialBehaviorPortMapSchema>>

export interface SpatialBehaviorFnSignature {
  readonly inputs: SpatialBehaviorPortMap
  readonly outputs: SpatialBehaviorPortMap
}

const constOutput = z.record(
  portName,
  SpatialBehaviorPortTypeSchema.extend({ value: z.unknown() }),
).refine((ports) => Object.keys(ports).length <= SPATIAL_BEHAVIOR_LIMITS.constPorts, {
  message: `A const cell declares at most ${SPATIAL_BEHAVIOR_LIMITS.constPorts} outputs.`,
})

export const SpatialBehaviorCellSchema = z.discriminatedUnion("kind", [
  z.strictObject({ id: cellId, kind: z.literal("input"), outputs: SpatialBehaviorPortMapSchema }),
  z.strictObject({ id: cellId, kind: z.literal("const"), outputs: constOutput }),
  z.strictObject({ id: cellId, kind: z.literal("fn"), fn: fnRef }),
  z.strictObject({
    id: cellId,
    kind: z.literal("repeat"),
    manifest: organismDigest,
    maxRounds: z.number().int().min(1).max(SPATIAL_BEHAVIOR_LIMITS.rounds),
    carry: z.record(interfaceName, interfaceName).refine(
      (carry) => Object.keys(carry).length <= SPATIAL_BEHAVIOR_LIMITS.carry,
      { message: `A repeat cell carries at most ${SPATIAL_BEHAVIOR_LIMITS.carry} ports.` },
    ).optional(),
    until: z.strictObject({
      output: interfaceName,
      equals: z.string().min(1).max(64),
      field: portName.optional(),
    }).optional(),
  }),
  z.strictObject({
    id: cellId,
    kind: z.literal("each"),
    manifest: organismDigest,
    over: interfaceName,
    maxItems: z.number().int().min(1).max(SPATIAL_BEHAVIOR_LIMITS.eachItems),
  }),
  z.strictObject({ id: cellId, kind: z.literal("organism"), manifest: organismDigest }),
])
export type SpatialBehaviorCell = Readonly<z.infer<typeof SpatialBehaviorCellSchema>>

export const SpatialBehaviorEdgeSchema = z.strictObject({
  from: z.strictObject({ cell: cellId, port: portName }),
  to: z.strictObject({ cell: cellId, port: portName }),
  guard: z.strictObject({ equals: z.string().min(1).max(64), field: portName.optional() }).optional(),
  on: z.literal("fail").optional(),
})
export type SpatialBehaviorEdge = Readonly<z.infer<typeof SpatialBehaviorEdgeSchema>>

const behaviorBudgets = z.strictObject({
  maxSteps: z.number().int().min(1).max(1024).optional(),
  maxAgentCalls: z.number().int().min(0).max(64).optional(),
  maxWork: z.number().int().min(1).max(100_000_000).optional(),
  maxContextBytes: z.number().int().min(1).max(262_144).optional(),
  maxOutputBytes: z.number().int().min(1).max(262_144).optional(),
  maxDepth: z.number().int().min(1).max(8).optional(),
})

const interfaceEndpoint = z.strictObject({ cell: cellId, port: portName })

export const SpatialBehaviorOrganismSchema = z.strictObject({
  contract: z.literal("morphogen.organism.v1"),
  key: organismKey,
  name: z.string().min(1).max(120),
  note: z.string().max(2000).optional(),
  budgets: behaviorBudgets.optional(),
  interface: z.strictObject({
    inputs: z.record(interfaceName, interfaceEndpoint),
    outputs: z.record(interfaceName, interfaceEndpoint),
  }),
  cells: z.array(SpatialBehaviorCellSchema).min(1).max(SPATIAL_BEHAVIOR_LIMITS.cells),
  edges: z.array(SpatialBehaviorEdgeSchema).max(SPATIAL_BEHAVIOR_LIMITS.edges),
}).superRefine((manifest, context) => {
  const ids = new Set<string>()
  for (const [index, cell] of manifest.cells.entries()) {
    if (ids.has(cell.id)) {
      context.addIssue({ code: "custom", message: `Duplicate cell id ${cell.id}.`, path: ["cells", index, "id"] })
    }
    ids.add(cell.id)
    // Producer ports cannot be `many`: declared port maps in the bake-safe
    // subset are all producer-side (input/const outputs).
    if (cell.kind === "input" || cell.kind === "const") {
      for (const [name, port] of Object.entries(cell.outputs)) {
        if (port.many === true) {
          context.addIssue({ code: "custom", message: `Port ${name} declares many, which is only valid on consumer ports.`, path: ["cells", index, "outputs", name, "many"] })
        }
      }
    }
  }
})
export type SpatialBehaviorOrganism = Readonly<z.infer<typeof SpatialBehaviorOrganismSchema>>

export const SpatialBehaviorSchema = z.strictObject({
  kind: z.literal("slopcamera.spatial-behavior"),
  schemaVersion: z.literal(1),
  behaviorId: z.string().regex(/^behavior_[a-zA-Z0-9_-]{1,64}$/u),
  entityId: z.string().min(1).max(128).regex(/^[a-z][a-z0-9_-]*$/u),
  sceneSha256: SpatialDigestSchema,
  seed: z.number().int().min(0).max(4_294_967_295),
  rangeUs: z.strictObject({ startUs: SpatialTimeUsSchema, endUs: SpatialTimeUsSchema })
    .refine((range) => range.endUs > range.startUs, { message: "rangeUs.endUs must exceed rangeUs.startUs." }),
  organisms: z.record(z.string(), SpatialBehaviorOrganismSchema)
    .refine((organisms) => {
      const keys = Object.keys(organisms)
      return keys.length >= 1 && keys.length <= SPATIAL_BEHAVIOR_LIMITS.organisms
        && keys.every((key) => /^sha256:[a-f0-9]{64}$/u.test(key))
    }, { message: `organisms maps 1–${SPATIAL_BEHAVIOR_LIMITS.organisms} sha256:<64-hex> digests to manifests.` }),
  entry: organismDigest,
  channels: z.array(z.string().regex(/^[a-z][a-z0-9_.-]{0,62}$/u)).min(1).max(SPATIAL_BEHAVIOR_LIMITS.channels),
  args: z.record(interfaceName, z.unknown()).refine(
    (args) => Object.keys(args).length <= SPATIAL_BEHAVIOR_LIMITS.args,
    { message: `At most ${SPATIAL_BEHAVIOR_LIMITS.args} entry args.` },
  ).optional(),
}).superRefine((behavior, context) => {
  const channelSet = new Set(behavior.channels)
  if (channelSet.size !== behavior.channels.length) {
    context.addIssue({ code: "custom", message: "Behavior channels must be unique.", path: ["channels"] })
  }
})
export type SpatialBehavior = Readonly<z.infer<typeof SpatialBehaviorSchema>>

export function parseSpatialBehavior(input: unknown): SpatialBehavior {
  return deepFreezeJson(parseSpatialValue(SpatialBehaviorSchema, input, "spatial behavior"))
}

export function spatialBehaviorSha256(behavior: SpatialBehavior): string {
  return spatialValueSha256(behavior)
}

// --------------------------------------------------- organism projection ---
// Mirrors ALGAL's `manifestToJson` for the bake-safe subset so closure digests
// rehash exactly against manifests authored with ALGAL tooling. Canonical JSON
// on both sides is recursively sorted-key JSON.stringify, so
// `sha256:` + canonical-json-sha256(projection) reproduces the ALGAL
// `sha256:<hex>` digest byte-for-byte. Kept narrow deliberately: a cell kind
// outside the subset never reaches this function (the schema rejects it).

const ALGAL_DEFAULT_BUDGETS = Object.freeze({
  maxSteps: 256,
  maxAgentCalls: 16,
  maxWork: 1_000_000,
  maxContextBytes: 65_536,
  maxOutputBytes: 65_536,
  maxDepth: 4,
})

type JsonObject = Record<string, unknown>

function portTypeJson(port: SpatialBehaviorPortType): JsonObject {
  const out: JsonObject = { type: port.type }
  if (port.optional === true) out.optional = true
  if (port.many === true) out.many = true
  if (port.type === "choice" && port.labels !== undefined) out.labels = [...port.labels]
  if (port.type === "json" && port.schema !== undefined) out.schema = port.schema
  return out
}

function cellJson(cell: SpatialBehaviorCell): JsonObject {
  switch (cell.kind) {
    case "input":
      return { id: cell.id, kind: cell.kind, outputs: portMapJson(cell.outputs) }
    case "const": {
      const outputs: JsonObject = {}
      for (const [name, port] of Object.entries(cell.outputs)) {
        const projected = portTypeJson(port)
        projected.value = port.value
        outputs[name] = projected
      }
      return { id: cell.id, kind: cell.kind, outputs }
    }
    case "fn":
      return { id: cell.id, kind: cell.kind, fn: cell.fn }
    case "organism":
      return { id: cell.id, kind: cell.kind, manifest: cell.manifest }
    case "repeat": {
      const out: JsonObject = { id: cell.id, kind: cell.kind, manifest: cell.manifest, maxRounds: cell.maxRounds }
      if (cell.carry !== undefined) out.carry = { ...cell.carry }
      if (cell.until !== undefined) {
        out.until = {
          output: cell.until.output,
          equals: cell.until.equals,
          ...(cell.until.field === undefined ? {} : { field: cell.until.field }),
        }
      }
      return out
    }
    case "each":
      return { id: cell.id, kind: cell.kind, manifest: cell.manifest, over: cell.over, maxItems: cell.maxItems }
  }
}

function portMapJson(ports: SpatialBehaviorPortMap): JsonObject {
  const out: JsonObject = {}
  for (const [name, port] of Object.entries(ports)) out[name] = portTypeJson(port)
  return out
}

/** Normalized organism projection matching ALGAL `manifestToJson` for the subset. */
export function behaviorOrganismCanonicalValue(manifest: SpatialBehaviorOrganism): JsonObject {
  const budgets = { ...ALGAL_DEFAULT_BUDGETS, ...(manifest.budgets ?? {}) }
  const out: JsonObject = {
    contract: manifest.contract,
    key: manifest.key,
    name: manifest.name,
    budgets: {
      maxAgentCalls: budgets.maxAgentCalls,
      maxContextBytes: budgets.maxContextBytes,
      maxDepth: budgets.maxDepth,
      maxOutputBytes: budgets.maxOutputBytes,
      maxSteps: budgets.maxSteps,
      maxWork: budgets.maxWork,
    },
    cells: manifest.cells.map(cellJson),
    edges: manifest.edges.map((edge) => ({
      from: { cell: edge.from.cell, port: edge.from.port },
      to: { cell: edge.to.cell, port: edge.to.port },
      ...(edge.on === undefined ? {} : { on: edge.on }),
      ...(edge.guard === undefined
        ? {}
        : {
            guard: {
              equals: edge.guard.equals,
              ...(edge.guard.field === undefined ? {} : { field: edge.guard.field }),
            },
          }),
    })),
  }
  if (manifest.note !== undefined) out.note = manifest.note
  const mapEnds = (endpoints: Readonly<Record<string, { cell: string; port: string }>>) => {
    const mapped: JsonObject = {}
    for (const [name, target] of Object.entries(endpoints)) mapped[name] = { cell: target.cell, port: target.port }
    return mapped
  }
  out.interface = { inputs: mapEnds(manifest.interface.inputs), outputs: mapEnds(manifest.interface.outputs) }
  return out
}

/** ALGAL-form digest (`sha256:<hex>`) of one bake-safe organism manifest. */
export function behaviorOrganismSha256(manifest: SpatialBehaviorOrganism): string {
  return `sha256:${boundedCanonicalJsonSha256(behaviorOrganismCanonicalValue(manifest), {
    maximumBytes: 262_144,
    name: "behavior organism",
  })}`
}

// ------------------------------------------------------------------ check ---

export const SpatialBehaviorFindingCodeSchema = z.enum([
  "stale-digest",
  "unresolved-entity",
  "unresolved-entry",
  "unresolved-manifest",
  "unresolved-fn",
  "closure-digest-mismatch",
  "invalid-wiring",
  "undeclared-arg",
  "range-outside-scene",
  "unreachable-organism",
  "cyclic-composition",
  "unfed-input",
])
export type SpatialBehaviorFindingCode = z.infer<typeof SpatialBehaviorFindingCodeSchema>

export const SpatialBehaviorCheckFindingSchema = z.strictObject({
  code: SpatialBehaviorFindingCodeSchema,
  severity: z.enum(["error", "warning"]),
  referenceId: z.string().min(1).max(128).optional(),
  detail: z.string().min(1).max(240),
})
export type SpatialBehaviorCheckFinding = Readonly<z.infer<typeof SpatialBehaviorCheckFindingSchema>>

export const SpatialBehaviorCheckReportSchema = z.strictObject({
  kind: z.literal("slopcamera.spatial-behavior-check"),
  schemaVersion: z.literal(1),
  behaviorSha256: SpatialDigestSchema,
  sceneSha256: SpatialDigestSchema,
  findings: z.array(SpatialBehaviorCheckFindingSchema).max(SPATIAL_BEHAVIOR_LIMITS.findings),
  counts: z.strictObject({
    organisms: z.number().int().min(0),
    cells: z.number().int().min(0),
    edges: z.number().int().min(0),
    fnRefs: z.number().int().min(0),
    errors: z.number().int().min(0),
    warnings: z.number().int().min(0),
  }),
})
export type SpatialBehaviorCheckReport = Readonly<z.infer<typeof SpatialBehaviorCheckReportSchema>>

const checkOptionsSchema = z.strictObject({
  behavior: z.unknown(),
  scene: z.unknown(),
})

interface ManifestContext {
  readonly manifest: SpatialBehaviorOrganism
  readonly outputPorts: ReadonlyMap<string, ReadonlySet<string>>
  readonly inputPorts: ReadonlyMap<string, ReadonlySet<string>>
}

function resolveEntityId(scene: SpatialSceneV1, referenceId: string): string | undefined {
  const ids = new Set(scene.entities.map((entity) => entity.entityId))
  if (ids.has(referenceId)) return referenceId
  const prefixed = `entity_${referenceId}`
  return ids.has(prefixed) ? prefixed : undefined
}

/**
 * Validates a behavior document against one scene: closure digest integrity,
 * manifest/fn reference resolution, interface and edge wiring against the
 * admitted fn signatures, entry args, and range bounds. Findings are evidence;
 * nothing executes organism graphs.
 */
export function checkSpatialBehavior(
  input: unknown,
  admittedFns: ReadonlyMap<string, SpatialBehaviorFnSignature>,
): SpatialBehaviorCheckReport {
  const options = parseSpatialValue(checkOptionsSchema, input, "behavior check")
  const behavior = parseSpatialBehavior(options.behavior)
  const scene = parseSpatialValue(SpatialSceneV1Schema, options.scene, "scene")
  const sceneSha256 = spatialValueSha256(scene)
  const findings: SpatialBehaviorCheckFinding[] = []
  const finding = (code: SpatialBehaviorFindingCode, severity: "error" | "warning", detail: string, referenceId?: string): void => {
    findings.push(deepFreezeJson(referenceId === undefined ? { code, severity, detail } : { code, severity, detail, referenceId }))
  }

  if (behavior.sceneSha256 !== sceneSha256) {
    finding("stale-digest", "error", `Behavior sceneSha256 ${behavior.sceneSha256} does not match scene digest ${sceneSha256}; re-author or rebind the behavior.`)
  }
  if (resolveEntityId(scene, behavior.entityId) === undefined) {
    finding("unresolved-entity", "error", `Behavior entity ${behavior.entityId} is not a scene entity.`, behavior.entityId)
  }
  if (behavior.rangeUs.endUs > scene.durationUs) {
    finding("range-outside-scene", "error", `Behavior range ends at ${behavior.rangeUs.endUs}us beyond scene duration ${scene.durationUs}us.`)
  }
  if (behavior.organisms[behavior.entry] === undefined) {
    finding("unresolved-entry", "error", `Entry digest ${behavior.entry.slice(0, 24)}… is not a member of the organisms closure.`, behavior.entry.slice(7, 39))
  }

  let cellTotal = 0
  let edgeTotal = 0
  let fnRefTotal = 0
  const contexts = new Map<string, ManifestContext>()

  // Pass 1: digest integrity and manifest-reference resolution.
  for (const [digest, manifest] of Object.entries(behavior.organisms)) {
    const recomputed = behaviorOrganismSha256(manifest)
    if (recomputed !== digest) {
      finding("closure-digest-mismatch", "error", `Organisms key ${digest.slice(0, 24)}… rehashes to ${recomputed.slice(0, 24)}…; the manifest changed after admission.`, manifest.key)
    }
    cellTotal += manifest.cells.length
    edgeTotal += manifest.edges.length
    const outputPorts = new Map<string, ReadonlySet<string>>()
    const inputPorts = new Map<string, ReadonlySet<string>>()
    for (const cell of manifest.cells) {
      switch (cell.kind) {
        case "input":
        case "const":
          outputPorts.set(cell.id, new Set(Object.keys(cell.outputs)))
          break
        case "fn": {
          fnRefTotal += 1
          const signature = admittedFns.get(cell.fn)
          if (signature === undefined) {
            finding("unresolved-fn", "error", `Cell ${cell.id} names fn ${cell.fn}, which the admitted behavior catalog does not contain.`, `${manifest.key}/${cell.id}`)
          } else {
            outputPorts.set(cell.id, new Set(Object.keys(signature.outputs)))
            inputPorts.set(cell.id, new Set(Object.keys(signature.inputs)))
          }
          break
        }
        case "repeat":
        case "each":
        case "organism": {
          const child = behavior.organisms[cell.manifest]
          if (child === undefined) {
            finding("unresolved-manifest", "error", `Cell ${cell.id} references manifest ${cell.manifest.slice(0, 24)}…, absent from the organisms closure.`, `${manifest.key}/${cell.id}`)
          } else {
            outputPorts.set(cell.id, new Set(Object.keys(child.interface.outputs)))
            inputPorts.set(cell.id, new Set(Object.keys(child.interface.inputs)))
          }
          break
        }
      }
    }
    contexts.set(digest, { manifest, outputPorts, inputPorts })
  }

  // Pass 2: wiring inside each manifest.
  for (const context of contexts.values()) {
    const { manifest, outputPorts, inputPorts } = context
    const cellIds = new Set(manifest.cells.map((cell) => cell.id))
    const ref = (cell: string) => `${manifest.key}/${cell}`

    for (const [name, endpoint] of Object.entries(manifest.interface.inputs)) {
      const cell = manifest.cells.find((candidate) => candidate.id === endpoint.cell)
      if (cell === undefined) {
        finding("invalid-wiring", "error", `Interface input ${name} references absent cell ${endpoint.cell}.`, manifest.key)
      } else if (cell.kind !== "input") {
        finding("invalid-wiring", "error", `Interface input ${name} references ${cell.kind} cell ${cell.id}; only input cells receive entry args.`, ref(cell.id))
      } else if (!(endpoint.port in cell.outputs)) {
        finding("invalid-wiring", "error", `Interface input ${name} names undeclared port ${endpoint.port} on input cell ${cell.id}.`, ref(cell.id))
      }
    }
    for (const [name, endpoint] of Object.entries(manifest.interface.outputs)) {
      if (!cellIds.has(endpoint.cell)) {
        finding("invalid-wiring", "error", `Interface output ${name} references absent cell ${endpoint.cell}.`, manifest.key)
      } else if (!outputPorts.get(endpoint.cell)?.has(endpoint.port)) {
        finding("invalid-wiring", "error", `Interface output ${name} names undeclared output port ${endpoint.port} on cell ${endpoint.cell}.`, ref(endpoint.cell))
      }
    }

    for (const cell of manifest.cells) {
      if (cell.kind === "repeat" || cell.kind === "each" || cell.kind === "organism") {
        const child = behavior.organisms[cell.manifest]
        if (child !== undefined) {
          if (cell.kind === "repeat") {
            for (const [outName, inName] of Object.entries(cell.carry ?? {})) {
              if (!(outName in child.interface.outputs)) {
                finding("invalid-wiring", "error", `Repeat ${cell.id} carries undeclared output ${outName} from ${child.key}.`, ref(cell.id))
              }
              if (!(inName in child.interface.inputs)) {
                finding("invalid-wiring", "error", `Repeat ${cell.id} carries into undeclared input ${inName} on ${child.key}.`, ref(cell.id))
              }
            }
            if (cell.until !== undefined && !(cell.until.output in child.interface.outputs)) {
              finding("invalid-wiring", "error", `Repeat ${cell.id} until watches undeclared output ${cell.until.output} on ${child.key}.`, ref(cell.id))
            }
          }
          if (cell.kind === "each" && !(cell.over in child.interface.inputs)) {
            finding("invalid-wiring", "error", `Each ${cell.id} over names undeclared input ${cell.over} on ${child.key}.`, ref(cell.id))
          }
          // Carried inputs are fed by carry values, not edges; `over` gets its
          // own dedicated check below.
          const carried = cell.kind === "repeat" ? new Set(Object.values(cell.carry ?? {})) : new Set<string>()
          for (const input of Object.keys(child.interface.inputs)) {
            if (carried.has(input)) continue
            if (cell.kind === "each" && input === cell.over) continue
            const fed = manifest.edges.some((edge) => edge.to.cell === cell.id && edge.to.port === input)
            if (!fed) {
              finding("unfed-input", "warning", `${cell.kind} cell ${cell.id} leaves interface input ${input} of ${child.key} without a delivering edge; the input cell produces no value.`, ref(cell.id))
            }
          }
        }
      }
      if (cell.kind === "each") {
        const delivered = manifest.edges.some((edge) => edge.to.cell === cell.id && edge.to.port === cell.over)
        if (!delivered) {
          finding("invalid-wiring", "error", `Each ${cell.id} over port ${cell.over} has no delivering edge; the list can never arrive.`, ref(cell.id))
        }
      }
    }

    for (const [index, edge] of manifest.edges.entries()) {
      if (!cellIds.has(edge.from.cell)) {
        finding("invalid-wiring", "error", `Edge ${index} from references absent cell ${edge.from.cell}.`, manifest.key)
      } else if (!outputPorts.get(edge.from.cell)?.has(edge.from.port)) {
        finding("invalid-wiring", "error", `Edge ${index} names undeclared output port ${edge.from.port} on cell ${edge.from.cell}.`, ref(edge.from.cell))
      }
      if (!cellIds.has(edge.to.cell)) {
        finding("invalid-wiring", "error", `Edge ${index} to references absent cell ${edge.to.cell}.`, manifest.key)
      } else if (!inputPorts.get(edge.to.cell)?.has(edge.to.port)) {
        finding("invalid-wiring", "error", `Edge ${index} names undeclared input port ${edge.to.port} on cell ${edge.to.cell}; input and const cells have no input ports.`, ref(edge.to.cell))
      }
    }
  }

  // Manifest-reference cycles can never terminate: nested invocation recurses
  // until the runtime depth budget rejects the run. Flag them statically.
  const visiting = new Set<string>()
  const done = new Set<string>()
  const detectCycles = (digest: string): void => {
    if (done.has(digest)) return
    if (visiting.has(digest)) {
      const context = contexts.get(digest)
      finding("cyclic-composition", "error", `Organism ${context?.manifest.key ?? digest.slice(0, 24)} participates in a manifest-reference cycle that cannot terminate within any depth budget.`, context?.manifest.key)
      return
    }
    visiting.add(digest)
    const context = contexts.get(digest)
    if (context !== undefined) {
      for (const cell of context.manifest.cells) {
        if (cell.kind === "repeat" || cell.kind === "each" || cell.kind === "organism") detectCycles(cell.manifest)
      }
    }
    visiting.delete(digest)
    done.add(digest)
  }
  for (const digest of contexts.keys()) detectCycles(digest)

  // Reachability from the entry manifest through composition cells.
  const reachable = new Set<string>()
  const walk = (digest: string): void => {
    if (reachable.has(digest)) return
    const context = contexts.get(digest)
    if (context === undefined) return
    reachable.add(digest)
    for (const cell of context.manifest.cells) {
      if (cell.kind === "repeat" || cell.kind === "each" || cell.kind === "organism") walk(cell.manifest)
    }
  }
  walk(behavior.entry)
  for (const [entryDigest, context] of contexts) {
    if (!reachable.has(entryDigest)) {
      finding("unreachable-organism", "warning", `Organism ${context.manifest.key} is in the closure but unreachable from the entry manifest.`, context.manifest.key)
    }
  }

  // Entry args must bind declared interface inputs; unfed inputs warn.
  const entryContext = contexts.get(behavior.entry)
  if (entryContext !== undefined) {
    const argNames = new Set(Object.keys(behavior.args ?? {}))
    for (const name of Object.keys(behavior.args ?? {})) {
      if (!(name in entryContext.manifest.interface.inputs)) {
        finding("undeclared-arg", "error", `Arg ${name} is not a declared interface input of entry organism ${entryContext.manifest.key}.`, `${entryContext.manifest.key}/${name}`)
      }
    }
    for (const name of Object.keys(entryContext.manifest.interface.inputs)) {
      if (!argNames.has(name)) {
        finding("unfed-input", "warning", `Entry organism ${entryContext.manifest.key} declares interface input ${name} but no arg binds it; the input cell produces no value.`, `${entryContext.manifest.key}/${name}`)
      }
    }
  }

  const errors = findings.filter((item) => item.severity === "error").length
  return deepFreezeJson(SpatialBehaviorCheckReportSchema.parse({
    kind: "slopcamera.spatial-behavior-check",
    schemaVersion: 1,
    behaviorSha256: spatialBehaviorSha256(behavior),
    sceneSha256,
    findings,
    counts: {
      organisms: Object.keys(behavior.organisms).length,
      cells: cellTotal,
      edges: edgeTotal,
      fnRefs: fnRefTotal,
      errors,
      warnings: findings.length - errors,
    },
  }))
}
