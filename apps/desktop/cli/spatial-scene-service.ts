import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import { canonicalJson } from "../../../src/code/canonical-json";
import { normalizeSpatialAuditAssetBounds, spatialEntityLocalBounds } from "../../../src/spatial-scene/audit";
import { createSpatialSceneStarter } from "../../../src/spatial-scene/authoring";
import { sampleSpatialCameraTrack } from "../../../src/spatial-scene/camera-track";
import { SPATIAL_SCENE_LIMITS, SpatialCameraIdSchema } from "../../../src/spatial-scene/contracts";
import { checkSpatialBehavior } from "../../../src/spatial-scene/behavior";
import { auditSpatialBehaviorTrace } from "../../../src/spatial-scene/behavior-audit";
import { bakeSpatialBehavior } from "../../../src/spatial-scene/behavior-bake";
import { spatialBehaviorFnSignatures } from "../../../src/spatial-scene/behavior-fns";
import { planSpatialBehaviorGallery, spatialBehaviorGalleryPlanSha256 } from "../../../src/spatial-scene/behavior-gallery";
import { parseSpatialBehaviorChannelMap, SpatialBehaviorBakeSchema, spatialBehaviorBakeSha256 } from "../../../src/spatial-scene/behavior-trace";
import { checkSpatialDirection, compileSpatialDirection, spatialDirectionCompilationSha256 } from "../../../src/spatial-scene/direction-compile";
import { createSpatialEvaluationContext, evaluateSpatialSceneInContext } from "../../../src/spatial-scene/evaluate";
import { planSpatialDirectionGallery, spatialGalleryPlanSha256 } from "../../../src/spatial-scene/gallery";
import { checkSpatialRenderEffects, planSpatialRenderEffects } from "../../../src/spatial-scene/render-effects";
import { SPATIAL_REVIEW_LIMITS } from "../../../src/spatial-scene/review";
import { bakeSpatialSimulation, spatialSimulationBakeSha256 } from "../../../src/spatial-scene/simulation-bake";
import { auditSpatialTemporalEvidence, SpatialTemporalContactsFileSchema, spatialTemporalAuditReportSha256 } from "../../../src/spatial-scene/temporal-audit";
import { parseSpatialScene, parseSpatialValue, spatialSceneSha256 } from "../../../src/spatial-scene/index";
import { diffSpatialScenes } from "../../../src/spatial-scene/patch";
import { SpatialSolveError, SpatialSolveGoalsFileSchema, solveSpatialRelations, type SpatialSolveResult } from "../../../src/spatial-scene/solve";
import type { ApplicationContext } from "../application/context";
import { createApplicationOperationRegistry } from "../application/default-registry";
import { planSpatialRender } from "../application/spatial-render";
import { createNodeBundleFileSystem } from "../core/storage";
import type { SpatialCliExecutionProfile, SpatialSceneCommand } from "./args";
import { CliError, type CliErrorCode } from "./errors";
import { executeSpatialGenerateCommand } from "./spatial-generate-service";

/** Capture an explicit local regular file once, without following a leaf symlink. */
export async function readSpatialJson(path: string, maximumBytes: number = SPATIAL_SCENE_LIMITS.sourceBytes): Promise<unknown> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1 || maximumBytes > 32 * 1024 * 1024) throw new CliError("invalid-data", "Invalid spatial JSON byte limit.");
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.size > BigInt(maximumBytes)) throw new CliError("invalid-data", "Scene source must be a bounded regular JSON file.");
    const bytes = new Uint8Array(Number(before.size));
    let offset = 0;
    while (offset < bytes.byteLength) {
      const read = await handle.read(bytes, offset, Math.min(256 * 1024, bytes.byteLength - offset), offset);
      if (read.bytesRead === 0) throw new CliError("conflict", "Scene source ended while it was being read.");
      offset += read.bytesRead;
    }
    const after = await handle.stat({ bigint: true });
    if (bytes.byteLength > maximumBytes || after.size !== before.size || after.mtimeNs !== before.mtimeNs || after.ctimeNs !== before.ctimeNs) {
      throw new CliError("conflict", "Scene source changed while it was being read.");
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } finally { await handle.close(); }
}

export async function publishSpatialSource(path: string, value: unknown, beforePublication?: () => Promise<void>): Promise<void> {
  const directory = await realpath(dirname(resolve(path)));
  const fileSystem = createNodeBundleFileSystem(directory);
  const written = await fileSystem.writeTextNoReplace?.(basename(path), `${canonicalJson(value)}\n`, beforePublication);
  if (written !== "created") throw new CliError("conflict", "Scene output already exists. Choose a new path to retain both revisions.");
}

/** An explicit CLI profile may fill an omitted request field, never replace one. */
export function bindSpatialCliExecutionProfile(request: unknown, executionProfile: SpatialCliExecutionProfile | undefined): unknown {
  if (executionProfile === undefined) return request;
  if (typeof request !== "object" || request === null || Array.isArray(request)) throw new CliError("invalid-data", "A spatial render request must be a JSON object.");
  if ("executionProfile" in request && request.executionProfile !== executionProfile) throw new CliError("conflict", "--profile differs from the execution profile retained in the request.");
  return { ...request, executionProfile };
}

function assertCameraTrackActive(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw new CliError("cancelled", "Camera track export was cancelled.");
}

/** Solver codes collapse onto the CLI code set; the typed code stays in the bracketed message prefix. */
const SOLVE_ERROR_CODES: Readonly<Record<string, CliErrorCode>> = {
  "invalid-data": "invalid-data",
  "unknown-entity": "not-found",
  "bounds-unknown": "invalid-data",
  "relation-cycle": "conflict",
  "duplicate-goal": "conflict",
  "relation-failed": "invalid-data",
};

export async function executeSpatialSceneCommand(application: ApplicationContext, command: SpatialSceneCommand, signal?: AbortSignal): Promise<unknown> {
  if (command.action === "generate") return executeSpatialGenerateCommand(application, command);
  // Fail closed before touching the filesystem, renderer, or provider: review
  // uploads the selected bounded rendered beauty frames to a vision model and
  // requires --allow-cloud-upload on this exact invocation.
  if (command.action === "review" && !command.allowCloudUpload) {
    throw new CliError("authorization-required", "scene review uploads bounded rendered beauty frames to a vision model and requires --allow-cloud-upload on this invocation.", { command: "scene review" });
  }
  if (command.action === "behavior-audit") {
    const bake = parseSpatialValue(SpatialBehaviorBakeSchema, await readSpatialJson(resolve(application.paths.repositoryRoot, command.bake)), "behavior bake");
    const report = auditSpatialBehaviorTrace({
      behaviorSha256: bake.behaviorSha256, emittedSha256: bake.receipt.emittedSha256,
      emitted: bake.emitted, rangeUs: bake.rangeUs,
    });
    if (command.output === undefined) return report;
    const output = resolve(application.paths.repositoryRoot, command.output);
    await publishSpatialSource(output, report);
    return { path: output, findings: report.findings.length, channels: report.channelCount, emitted: report.emittedCount };
  }
  if (command.action === "camera-track") assertCameraTrackActive(signal);
  const sourcePath = resolve(application.paths.repositoryRoot, "path" in command ? command.path : command.scene);
  if (command.action === "init") {
    const scene = createSpatialSceneStarter();
    await publishSpatialSource(sourcePath, scene);
    return { path: sourcePath, sceneSha256: spatialSceneSha256(scene) };
  }
  if (command.action === "review") {
    const acknowledgedAt = application.clock.now().toISOString();
    const authorizedApplication: ApplicationContext = {
      ...application,
      spatialReviewAuthorization: {
        authorize: async request => (typeof request.sceneSha256 === "string" && /^[a-f0-9]{64}$/u.test(request.sceneSha256)
          && SpatialCameraIdSchema.safeParse(request.cameraId).success
          && Array.isArray(request.timesUs)
          && request.timesUs.length >= 1
          && request.timesUs.length <= SPATIAL_REVIEW_LIMITS.frames
          && request.maximumFrames >= 1
          && request.maximumFrames <= SPATIAL_REVIEW_LIMITS.frames
          && request.maximumFrameBytes <= SPATIAL_REVIEW_LIMITS.pngBytes
          && request.maximumUploadBytes <= SPATIAL_REVIEW_LIMITS.uploadBytes
          ? { acknowledgedAt }
          : undefined),
      },
    };
    const result = await createApplicationOperationRegistry().execute({ application: authorizedApplication, abortSignal: signal ?? new AbortController().signal }, {
      kind: "scene.review", version: 1,
      input: {
        source: { path: relative(application.paths.repositoryRoot, sourcePath) },
        request: { cameraId: command.camera, ...(command.timesUs === undefined ? {} : { timesUs: [...command.timesUs] }) },
      },
    });
    return result.output;
  }
  if (command.action === "render-audit") {
    const result = await createApplicationOperationRegistry().execute({ application, abortSignal: signal ?? new AbortController().signal }, {
      kind: "scene.render-audit", version: 1,
      input: {
        source: { path: relative(application.paths.repositoryRoot, sourcePath) },
        request: { cameraId: command.camera, ...(command.timesUs === undefined ? {} : { timesUs: [...command.timesUs] }) },
      },
    });
    return result.output;
  }
  const scene = parseSpatialScene(await readSpatialJson(sourcePath));
  if (command.action === "diff") {
    const other = parseSpatialScene(await readSpatialJson(resolve(application.paths.repositoryRoot, command.other)));
    return { sceneSha256: spatialSceneSha256(scene), otherSha256: spatialSceneSha256(other), diff: diffSpatialScenes(scene, other) };
  }
  if (command.action === "solve") {
    const goalsFile = parseSpatialValue(SpatialSolveGoalsFileSchema, await readSpatialJson(resolve(application.paths.repositoryRoot, command.goals)), "solve goals");
    const assetBounds = command.assetBounds === undefined
      ? {}
      : normalizeSpatialAuditAssetBounds(await readSpatialJson(resolve(application.paths.repositoryRoot, command.assetBounds)));
    const entities = new Map(scene.entities.map(entity => [entity.entityId, entity]));
    const cameras = new Map(scene.cameras.map(camera => [camera.cameraId, camera]));
    const transformOverrides = new Map(
      scene.overrides.filter(override => override.property === "transform").map(override => [override.entityId, override.value]),
    );
    const animatedTransforms = new Map<string, string[]>();
    for (const channel of scene.animations) {
      if (channel.property === "position" || channel.property === "rotation" || channel.property === "scale") {
        animatedTransforms.set(channel.targetId, [...(animatedTransforms.get(channel.targetId) ?? []), channel.channelId]);
      }
    }
    const referenced = new Set<string>();
    for (const goal of goalsFile.goals) {
      referenced.add(goal.entityKey);
      for (const relation of goal.relations) if ("target" in relation) referenced.add(relation.target);
    }
    for (const goal of goalsFile.goals) {
      const entity = entities.get(goal.entityKey);
      if (entity === undefined) throw new CliError("not-found", `Solve goal ${goal.entityKey} is not an entity in the scene.`);
      if (entity.origin.kind === "generated") {
        throw new CliError("conflict", `Goal entity ${entity.entityId} is generated; edit it through declared overrides or retained output replacement.`);
      }
      if (entity.parentId !== null) {
        throw new CliError("conflict", `Goal entity ${entity.entityId} is parented under ${entity.parentId}; solver bases are world transforms — pass an explicit base entry or reparent first.`);
      }
      if (entity.placement.kind !== "world") {
        throw new CliError("conflict", `Goal entity ${entity.entityId} uses view placement; solver transforms are world-space.`);
      }
      if (transformOverrides.has(entity.entityId)) {
        throw new CliError("conflict", `Goal entity ${entity.entityId} has a transform override; a set-transform patch would stay shadowed.`);
      }
      const writers = animatedTransforms.get(entity.entityId);
      if (writers !== undefined) {
        throw new CliError("conflict", `Goal entity ${entity.entityId} is animated (${writers.join(", ")}); a solved transform would not take effect.`);
      }
    }
    const bases: Record<string, unknown> = {};
    for (const key of [...referenced].sort()) {
      const entity = entities.get(key);
      if (entity !== undefined) {
        // Local bounds are transform-agnostic, so they seed whenever derivable;
        // the authored transform only seeds a base when it is the world transform.
        const explicit = goalsFile.bases?.[key]?.transform !== undefined;
        if (!explicit && (entity.parentId !== null || entity.placement.kind !== "world")) {
          throw new CliError("conflict", `Referenced entity ${key} is ${entity.parentId === null ? "view-placed" : `parented under ${entity.parentId}`}; solver bases are world transforms — pass an explicit base entry.`);
        }
        const enclosure = spatialEntityLocalBounds(entity, assetBounds);
        bases[key] = {
          ...(explicit ? {} : { transform: transformOverrides.get(key) ?? entity.transform }),
          ...(enclosure.status === "bounded" ? { bounds: enclosure.bounds } : {}),
        };
        continue;
      }
      const camera = cameras.get(key);
      if (camera !== undefined) {
        bases[key] = { transform: { position: camera.pose.position, rotation: camera.pose.rotation, scale: [1, 1, 1] } };
      }
    }
    for (const [key, basePatch] of Object.entries(goalsFile.bases ?? {})) {
      const existing = bases[key] as { transform?: unknown; bounds?: unknown } | undefined;
      bases[key] = {
        ...(existing ?? {}),
        ...(basePatch.transform === undefined ? {} : { transform: basePatch.transform }),
        ...(basePatch.bounds === undefined ? {} : { bounds: basePatch.bounds }),
      };
    }
    let result: SpatialSolveResult;
    try {
      result = solveSpatialRelations({ goals: goalsFile.goals, bases });
    } catch (error) {
      if (error instanceof SpatialSolveError) {
        throw new CliError(SOLVE_ERROR_CODES[error.code] ?? "invalid-data", `[${error.code}] ${error.message}`);
      }
      throw error;
    }
    if (command.output === undefined) return result.patch;
    const output = resolve(application.paths.repositoryRoot, command.output);
    await publishSpatialSource(output, result.patch);
    return { path: output, sceneSha256: spatialSceneSha256(scene), solvedEntities: Object.keys(result.transforms) };
  }
  if (command.action === "camera-track") {
    const fence = async () => {
      assertCameraTrackActive(signal);
      await application.hostResourceLease?.assertOwned();
      assertCameraTrackActive(signal);
    };
    assertCameraTrackActive(signal);
    const request = await readSpatialJson(resolve(application.paths.repositoryRoot, command.request));
    assertCameraTrackActive(signal);
    const track = sampleSpatialCameraTrack(scene, request);
    const output = resolve(application.paths.repositoryRoot, command.output);
    await publishSpatialSource(output, track, fence);
    await fence();
    return { path: output, sceneSha256: track.sceneSha256, cameraId: track.cameraId, clock: track.clock, executed: false };
  }
  if (command.action === "direction-check") {
    const direction = await readSpatialJson(resolve(application.paths.repositoryRoot, command.direction));
    return checkSpatialDirection({ direction, scene });
  }
  if (command.action === "direction-plan") {
    const direction = await readSpatialJson(resolve(application.paths.repositoryRoot, command.direction));
    const compilation = compileSpatialDirection({ direction, scene, ...(command.camera === undefined ? {} : { cameraId: command.camera }) });
    if (command.output === undefined) return compilation;
    const output = resolve(application.paths.repositoryRoot, command.output);
    await publishSpatialSource(output, compilation);
    return { path: output, compilationSha256: spatialDirectionCompilationSha256(compilation), proposals: compilation.proposals, advisories: compilation.advisories };
  }
  if (command.action === "direction-gallery") {
    const direction = await readSpatialJson(resolve(application.paths.repositoryRoot, command.direction));
    const plan = planSpatialDirectionGallery({ axis: command.axis, direction, scene, ...(command.camera === undefined ? {} : { cameraId: command.camera }) });
    if (command.output === undefined) return plan;
    const output = resolve(application.paths.repositoryRoot, command.output);
    await publishSpatialSource(output, plan);
    return { path: output, galleryPlanSha256: spatialGalleryPlanSha256(plan), candidates: plan.candidates.map(candidate => ({ candidateId: candidate.candidateId, documentSha256: candidate.documentSha256 })) };
  }
  if (command.action === "effects-check") {
    const effects = await readSpatialJson(resolve(application.paths.repositoryRoot, command.effects));
    return checkSpatialRenderEffects({ effects, scene });
  }
  if (command.action === "effects-plan") {
    const draft = await readSpatialJson(resolve(application.paths.repositoryRoot, command.draft));
    if (typeof draft !== "object" || draft === null || Array.isArray(draft)) throw new CliError("invalid-data", "An effects draft must be a JSON object with renderPlan, particleSystems, and simulationBakes fields.");
    const binding = planSpatialRenderEffects({ ...draft, scene });
    if (command.output === undefined) return binding;
    const output = resolve(application.paths.repositoryRoot, command.output);
    await publishSpatialSource(output, binding);
    return { path: output, documentSha256: binding.documentSha256 };
  }
  if (command.action === "effects-bake") {
    const plan = await readSpatialJson(resolve(application.paths.repositoryRoot, command.simulation));
    const result = bakeSpatialSimulation(plan);
    const output = resolve(application.paths.repositoryRoot, command.output);
    await publishSpatialSource(output, result.document);
    return { path: output, documentSha256: spatialSimulationBakeSha256(result.document), receipt: result.receipt };
  }
  if (command.action === "behavior-check") {
    const behavior = await readSpatialJson(resolve(application.paths.repositoryRoot, command.behavior));
    return checkSpatialBehavior({ behavior, scene }, spatialBehaviorFnSignatures());
  }
  if (command.action === "behavior-bake" || command.action === "behavior-gallery") {
    const behavior = await readSpatialJson(resolve(application.paths.repositoryRoot, command.behavior));
    const channelMap = command.channelMap === undefined
      ? undefined
      : parseSpatialBehaviorChannelMap(await readSpatialJson(resolve(application.paths.repositoryRoot, command.channelMap)));
    if (command.action === "behavior-bake") {
      const { bake } = await bakeSpatialBehavior({ behavior, scene, ...(channelMap === undefined ? {} : { channelMap }) });
      const output = resolve(application.paths.repositoryRoot, command.output);
      await publishSpatialSource(output, bake);
      return {
        path: output,
        bakeSha256: spatialBehaviorBakeSha256(bake),
        emitted: bake.emitted.length,
        directives: bake.directives.length,
        unresolvedIntents: bake.unresolvedIntents.length,
        receipt: bake.receipt,
      };
    }
    const plan = await planSpatialBehaviorGallery({ behavior, scene, ...(channelMap === undefined ? {} : { channelMap }) });
    if (command.output === undefined) return plan;
    const output = resolve(application.paths.repositoryRoot, command.output);
    await publishSpatialSource(output, plan);
    return { path: output, galleryPlanSha256: spatialBehaviorGalleryPlanSha256(plan), candidates: plan.candidates.map(candidate => ({ candidateId: candidate.candidateId, documentSha256: candidate.documentSha256, parameter: candidate.parameter })) };
  }
  if (command.action === "temporal-audit") {
    const times = command.timesUs ?? (() => {
      const count = Math.min(17, Math.max(2, Math.ceil(scene.durationUs / 1_000_000) + 1));
      return Array.from({ length: count }, (_, index) => Math.floor((scene.durationUs * index) / (count - 1)));
    })();
    if (times.length < 2) throw new CliError("invalid-data", "scene temporal-audit requires at least two sample times.");
    const contacts = command.contacts === undefined
      ? []
      : parseSpatialValue(SpatialTemporalContactsFileSchema, await readSpatialJson(resolve(application.paths.repositoryRoot, command.contacts)), "temporal contacts").contacts;
    const context = createSpatialEvaluationContext(scene);
    const snapshots = [...times].sort((left, right) => left - right).map(timeUs => evaluateSpatialSceneInContext(context, { cameraId: command.camera, timeUs }));
    const report = auditSpatialTemporalEvidence({
      snapshots,
      options: { contacts, ...(command.cutBeforeUs === undefined ? {} : { cutBeforeUs: [...command.cutBeforeUs] }) },
    });
    return { ...report, reportSha256: spatialTemporalAuditReportSha256(report) };
  }
  if (command.action === "plan" || command.action === "render") {
    const request = bindSpatialCliExecutionProfile(await readSpatialJson(resolve(application.paths.repositoryRoot, command.request)), command.executionProfile);
    if (command.action === "plan") return planSpatialRender(scene, request);
    const result = await createApplicationOperationRegistry().execute({ application, abortSignal: signal ?? new AbortController().signal }, {
      kind: "scene.render", version: 1, input: {
        source: { path: relative(application.paths.repositoryRoot, sourcePath) }, request,
        ...(command.assets === undefined ? {} : { assets: await readSpatialJson(resolve(application.paths.repositoryRoot, command.assets)) }),
      },
    });
    return result.output;
  }
  const registry = createApplicationOperationRegistry();
  if (command.action === "audit") {
    const result = await registry.execute({ application, abortSignal: new AbortController().signal }, {
      kind: "scene.audit", version: 1,
      input: {
        scene, cameraId: command.camera,
        ...(command.timesUs === undefined ? {} : { timesUs: [...command.timesUs] }),
        ...(command.assetBounds === undefined ? {} : { assetBounds: normalizeSpatialAuditAssetBounds(await readSpatialJson(resolve(application.paths.repositoryRoot, command.assetBounds))) }),
      },
    });
    return result.output;
  }
  const input = command.action === "patch"
    ? { scene, patch: await readSpatialJson(resolve(application.paths.repositoryRoot, command.patch)) }
    : command.action === "evaluate" ? { scene, cameraId: command.camera, timeUs: command.timeUs } : { scene };
  const result = await registry.execute({ application, abortSignal: new AbortController().signal }, {
    kind: command.action === "patch" ? "scene.patch" : command.action === "evaluate" ? "scene.evaluate" : "scene.inspect",
    version: 1, input,
  });
  if (command.action === "patch") {
    const output = result.output as { readonly scene: unknown };
    await publishSpatialSource(resolve(application.paths.repositoryRoot, command.output), output.scene);
  }
  return result.output;
}
