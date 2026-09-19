import { z } from "zod"

import {
  MemoryStore,
  parseOrganismManifest,
  runOrganism,
  type FnRegistry,
  type JsonValue as AlgalJsonValue,
  type OrganismManifest,
  type PortMap as AlgalPortMap,
} from "@hraness/algal"

import { deepFreezeJson } from "../code/json-snapshot.js"
import {
  checkSpatialBehavior,
  parseSpatialBehavior,
  spatialBehaviorSha256,
  type SpatialBehavior,
  type SpatialBehaviorCheckReport,
} from "./behavior.js"
import { SPATIAL_BEHAVIOR_FNS, spatialBehaviorFnSignatures } from "./behavior-fns.js"
import {
  compileSpatialBehaviorDirectives,
  parseSpatialBehaviorChannelMap,
  parseSpatialBehaviorEmissions,
  spatialBehaviorFnCatalogSha256,
  SPATIAL_BEHAVIOR_TRACE_LIMITS,
  SpatialBehaviorBakeSchema,
  type SpatialBehaviorBake,
  type SpatialBehaviorChannelMap,
  type SpatialBehaviorEmitted,
} from "./behavior-trace.js"
import { SpatialSceneV1Schema } from "./contracts.js"
import { parseSpatialValue, spatialValueSha256, SpatialSceneError } from "./identity.js"

/**
 * Deterministic behavior bake: an admitted `slopcamera.spatial-behavior`
 * document runs through the pinned ALGAL runtime under the bake-safe profile
 * — the closed pure fn catalog, a memory store, zero executors, no tools,
 * transports, slots, or effects. The run receipt plus the emitted channel
 * trace and compiled directive proposals form the retained
 * `slopcamera.spatial-behavior-bake` artifact. Organism digests stored into
 * the CAS are recomputed by ALGAL's own `manifestToJson`, so a drift between
 * this mirror and the runtime fails at admission rather than mid-run.
 */

const bakeOptionsSchema = z.strictObject({
  behavior: z.unknown(),
  scene: z.unknown(),
  channelMap: z.unknown().optional(),
})

export interface SpatialBehaviorBakeResult {
  readonly bake: SpatialBehaviorBake
  readonly check: SpatialBehaviorCheckReport
}

const algalRegistry = (): FnRegistry => {
  const registry: FnRegistry = new Map()
  for (const [name, entry] of SPATIAL_BEHAVIOR_FNS) {
    registry.set(name, {
      signature: {
        inputs: entry.signature.inputs as AlgalPortMap,
        outputs: entry.signature.outputs as AlgalPortMap,
        cost: entry.signature.cost,
      },
      fn: (inputs: Record<string, AlgalJsonValue>) => entry.invoke(inputs) as Record<string, AlgalJsonValue>,
    })
  }
  return registry
}

const parseEntryManifest = (behavior: SpatialBehavior): OrganismManifest => {
  const organism = behavior.organisms[behavior.entry]
  if (organism === undefined) {
    throw new SpatialSceneError("invalid-data", `unresolved-entry: entry digest ${behavior.entry.slice(0, 24)}… is absent from the organisms closure.`, "behavior-bake")
  }
  try {
    return parseOrganismManifest(organism)
  } catch (error) {
    throw new SpatialSceneError("invalid-data", `invalid-manifest: entry organism failed ALGAL manifest parsing: ${error instanceof Error ? error.message : String(error)}`, "behavior-bake")
  }
}

/** Maps declared interface-name args to ALGAL's cell-keyed run args. */
const entryRunArgs = (behavior: SpatialBehavior, manifest: OrganismManifest): Record<string, Record<string, AlgalJsonValue>> => {
  const args: Record<string, Record<string, AlgalJsonValue>> = {}
  for (const [name, value] of Object.entries(behavior.args ?? {})) {
    const endpoint = manifest.interface?.inputs[name]
    if (endpoint === undefined) continue // `undeclared-arg` already an error finding
    ;(args[endpoint.cell] ??= {})[endpoint.port] = value as AlgalJsonValue
  }
  return args
}

export async function bakeSpatialBehavior(input: unknown): Promise<SpatialBehaviorBakeResult> {
  const options = parseSpatialValue(bakeOptionsSchema, input, "behavior bake")
  const behavior = parseSpatialBehavior(options.behavior)
  const scene = parseSpatialValue(SpatialSceneV1Schema, options.scene, "scene")
  const sceneSha256 = spatialValueSha256(scene)
  const signatures = spatialBehaviorFnSignatures()
  const check = checkSpatialBehavior({ behavior, scene }, signatures)
  const errors = check.findings.filter((finding) => finding.severity === "error")
  if (errors.length > 0) {
    const codes = [...new Set(errors.map((finding) => finding.code))].join(", ")
    throw new SpatialSceneError("invalid-data", `behavior-check-failed: behavior ${behavior.behaviorId} failed admission with ${errors.length} error finding(s): ${codes}.`, "behavior-bake")
  }

  const channelMap: SpatialBehaviorChannelMap | undefined = options.channelMap === undefined
    ? undefined
    : parseSpatialBehaviorChannelMap(options.channelMap)
  if (channelMap !== undefined) {
    const declared = new Set(behavior.channels)
    for (const channel of [...Object.keys(channelMap.clips ?? {}), ...(channelMap.trajectories ?? []),
      ...(channelMap.attachments ?? []).flatMap((entry) => [entry.attachChannel, entry.releaseChannel])]) {
      if (!declared.has(channel)) {
        throw new SpatialSceneError("invalid-data", `undeclared-channel: channel map binds channel ${channel}, which behavior ${behavior.behaviorId} does not declare.`, "behavior-bake")
      }
    }
  }

  // Populate the CAS closure through ALGAL's own parser and digest: the
  // stored digest must equal the closure key, proving runtime parity.
  const store = new MemoryStore()
  for (const [digest, organism] of Object.entries(behavior.organisms)) {
    let manifest: OrganismManifest
    try {
      manifest = parseOrganismManifest(organism)
    } catch (error) {
      throw new SpatialSceneError("invalid-data", `invalid-manifest: organism ${organism.key} failed ALGAL manifest parsing: ${error instanceof Error ? error.message : String(error)}`, "behavior-bake")
    }
    const stored = await store.putManifest(manifest)
    if (stored !== digest) {
      throw new SpatialSceneError("invalid-data", `organism-digest-drift: organism ${organism.key} stored at ${stored.slice(0, 24)}… but the closure keys it at ${digest.slice(0, 24)}…; the ALGAL projection drifted from the admitted digest.`, "behavior-bake")
    }
  }

  const manifest = parseEntryManifest(behavior)
  const args = entryRunArgs(behavior, manifest)
  const receipt = await runOrganism({
    manifest,
    args,
    fns: algalRegistry(),
    store,
    executors: [],
  })

  if (receipt.manifestDigest !== behavior.entry) {
    throw new SpatialSceneError("invalid-data", `organism-digest-drift: run manifest digest ${receipt.manifestDigest.slice(0, 24)}… does not match entry ${behavior.entry.slice(0, 24)}….`, "behavior-bake")
  }
  if (receipt.effects.length > 0 || receipt.work.agentCalls > 0) {
    throw new SpatialSceneError("invalid-data", `effect-leak: bake-safe run recorded ${receipt.effects.length} effect(s) and ${receipt.work.agentCalls} agent call(s); the profile admits none.`, "behavior-bake")
  }
  if (receipt.outcome !== "complete") {
    const failure = receipt.failure
    throw new SpatialSceneError("invalid-data", `behavior-run-failed: ALGAL run ${receipt.outcome}${failure === undefined ? "" : `: ${failure.code} ${failure.message}`}`, "behavior-bake")
  }

  // Entry interface outputs are the bake surface: every declared output
  // port carries a bounded emitted-record array. Composition internals
  // (carried state, per-round records) stay inside the receipt.
  const declaredChannels = new Set(behavior.channels)
  const emitted: SpatialBehaviorEmitted[] = []
  const outputs = manifest.interface?.outputs ?? {}
  for (const name of Object.keys(outputs).sort()) {
    const endpoint = outputs[name]!
    const record = receipt.cells[endpoint.cell]
    if (record === undefined || record.status !== "committed" || record.outputs === undefined) {
      throw new SpatialSceneError("invalid-data", `emission-missing: interface output ${name} maps to cell ${endpoint.cell}, which did not commit an output.`, "behavior-bake")
    }
    const records = parseSpatialBehaviorEmissions(record.outputs[endpoint.port], `interface output ${name}`)
    for (const emittedRecord of records) {
      if (!declaredChannels.has(emittedRecord.channel)) {
        throw new SpatialSceneError("invalid-data", `undeclared-channel: emission on channel ${emittedRecord.channel}, which behavior ${behavior.behaviorId} does not declare.`, "behavior-bake")
      }
      if (emittedRecord.tUs < behavior.rangeUs.startUs || emittedRecord.tUs > behavior.rangeUs.endUs) {
        throw new SpatialSceneError("invalid-data", `emission-outside-range: emission on channel ${emittedRecord.channel} at ${emittedRecord.tUs}us is outside the declared range ${behavior.rangeUs.startUs}–${behavior.rangeUs.endUs}us.`, "behavior-bake")
      }
    }
    emitted.push(...records)
  }
  if (emitted.length > SPATIAL_BEHAVIOR_TRACE_LIMITS.emitted) {
    throw new SpatialSceneError("invalid-data", `over-bound: run emitted ${emitted.length} records beyond ${SPATIAL_BEHAVIOR_TRACE_LIMITS.emitted}.`, "behavior-bake")
  }
  emitted.sort((a, b) => a.tUs - b.tUs || a.channel.localeCompare(b.channel))

  const { directives, unresolvedIntents } = compileSpatialBehaviorDirectives({
    emitted,
    ...(channelMap === undefined ? {} : { channelMap }),
    rangeUs: behavior.rangeUs,
  })

  const behaviorSha256 = spatialBehaviorSha256(behavior)
  const bake = deepFreezeJson(SpatialBehaviorBakeSchema.parse({
    kind: "slopcamera.spatial-behavior-bake",
    schemaVersion: 1,
    behaviorSha256,
    sceneSha256,
    entry: behavior.entry,
    seed: behavior.seed,
    rangeUs: behavior.rangeUs,
    emitted,
    directives,
    unresolvedIntents,
    receipt: {
      kind: "slopcamera.spatial-behavior-bake-receipt",
      schemaVersion: 1,
      behaviorSha256,
      sceneSha256,
      entry: behavior.entry,
      manifestDigest: receipt.manifestDigest,
      runDigest: receipt.digest,
      runtime: { name: receipt.runtime.name, version: receipt.runtime.version },
      fnCatalogSha256: spatialBehaviorFnCatalogSha256(SPATIAL_BEHAVIOR_FNS),
      emittedSha256: spatialValueSha256(emitted),
      ...(channelMap === undefined ? {} : { channelMapSha256: spatialValueSha256(channelMap) }),
      outcome: receipt.outcome,
      work: receipt.work,
    },
  }))
  return { bake, check }
}
