import {
  compileSlopcameraCapabilityManifest,
  defineSlopcameraCapabilityModule,
  type SlopcameraCapabilityManifest,
  type SlopcameraCapabilityOperation,
  type SlopcameraCapabilityTool,
  type SlopcameraCapabilityWorkflow,
} from "../../../src/capability-manifest";
import { slopcameraMcpTools } from "../../../src/mcp/tools";
import { createApplicationOperationRegistry } from "../application/default-registry";
import { SLOPCAMERA_APPLICATION_TOOL_VERSION } from "../application/operation";
import type { OperationDiscovery, OperationRegistry } from "../application/registry";
import { BUILT_IN_WORKFLOWS } from "../workflows";

const diagramImageOperations = [
  "slopcamera.diagram.check@1",
  "slopcamera.diagram.check@2",
  "slopcamera.diagram.render@1",
  "slopcamera.diagram.render@2",
  "slopcamera.image.generate@2",
  "slopcamera.image.vectorize@1",
  "slopcamera.image.vectorize@2",
] as const;

const spatialSceneOperations = [
  "scene.audit@1",
  "scene.behavior.bake@1",
  "scene.behavior.check@1",
  "scene.behavior.gallery@1",
  "scene.direction.check@1",
  "scene.direction.compile@1",
  "scene.direction.gallery@1",
  "scene.effects.check@1",
  "scene.effects.plan@1",
  "scene.evaluate@1",
  "scene.inspect@1",
  "scene.patch@1",
  "scene.render@1",
  "scene.render-audit@1",
  "scene.review@1",
  "scene.temporal-audit@1",
] as const;

const spatialProjectOperations = [
  "spatial.project.add-candidate@1",
  "spatial.project.add-shot@1",
  "spatial.project.migrate@1",
  "spatial.project.patch@1",
  "spatial.project.reconcile@1",
  "spatial.project.restore@1",
  "spatial.project.select-candidate@1",
  "spatial.project.snapshot@1",
] as const;

const analysisOperations = [
  "analysis.faces@1",
  "analysis.music@1",
  "analysis.project-auto-zooms@1",
  "analysis.project-inactivity@1",
  "analysis.scenes@1",
  "derive.follow-faces@1",
] as const;

const editingOperations = [
  "derive.edit-batch@1",
  "derive.edit-batch@2",
  "derive.edit-batch@3",
  "edit.bind-candidate-revision@1",
  "edit.create-candidate-revision@1",
  "edit.create-revision@1",
  "edit.freeze-revision@1",
  "media.audio-effects@1",
  "media.color-grade@1",
  "media.html-overlay@1",
  "media.ingest@1",
  "media.overlay@1",
  "project.commit-edits@1",
  "project.commit-edits@2",
  "project.commit-edits@3",
  "project.snapshot@1",
  "render.project@1",
  "render.project@2",
  "render.project@3",
  "render.project@4",
  "render.project-plan@1",
  "render.project-plan@2",
] as const;

const iterationOperations = [
  "iteration.create-candidate@1",
  "iteration.create-matrix@1",
  "iteration.select@1",
  "project.promote-selection@1",
  "render.bind-candidate-output@1",
  "render.materialize-selection@1",
] as const;

const gatewayOperations = [
  "gateway.image@1",
  "gateway.speech@1",
  "gateway.transcription@1",
  "gateway.video@1",
] as const;

const capabilityModules = Object.freeze([
  defineSlopcameraCapabilityModule({
    commands: [
      { effect: "pure", name: "operations list" },
      { effect: "pure", name: "capabilities" },
      { effect: "local-read", name: "diagram check" },
      { effect: "local-derived-write", name: "diagram render" },
      { effect: "local-derived-write", name: "image vectorize" },
    ],
    description: "Portable diagrams, local vectorization, and the bounded semantic operation projection.",
    moduleId: "slopcamera.capability.diagram-image",
    operationKeys: diagramImageOperations,
    profiles: [{
      id: "vtracer-official-release-v1",
      kind: "authoring",
      qualification: { evidence: ["scripts/official-vectorizer-smoke.ts"], level: "native", status: "conditional" },
      requirements: [{ description: "A checksum-pinned supported VTracer release.", id: "vtracer", optional: false }],
    }],
    stability: "stable",
    title: "Diagrams and images",
    toolNames: ["check_diagram", "execute_slopcamera", "render_diagram", "search_slopcamera"],
    trust: "portable",
    version: 1,
    workflowKeys: [],
  }),
  defineSlopcameraCapabilityModule({
    commands: [
      { effect: "local-read", name: "scene inspect" },
      { effect: "pure", name: "scene audit" },
      { effect: "local-derived-write", name: "scene render" },
      { effect: "pure", name: "scene direction check" },
      { effect: "local-derived-write", name: "scene direction plan" },
      { effect: "local-derived-write", name: "scene direction gallery" },
      { effect: "pure", name: "scene effects check" },
      { effect: "local-derived-write", name: "scene effects plan" },
      { effect: "local-derived-write", name: "scene effects bake" },
      { effect: "pure", name: "scene behavior check" },
      { effect: "local-derived-write", name: "scene behavior bake" },
      { effect: "local-derived-write", name: "scene behavior gallery" },
      { effect: "pure", name: "scene temporal-audit" },
    ],
    description: "Editable spatial scenes, calibrated cameras, bounded geometry, rendered evidence, direction proposals, and closed effects contracts.",
    moduleId: "slopcamera.capability.spatial-scenes",
    operationKeys: spatialSceneOperations,
    profiles: [
      {
        id: "three-webgl2-hardware-v1",
        kind: "renderer",
        qualification: { evidence: ["apps/desktop/qualification/spatial-scenes.ts"], level: "browser", status: "conditional" },
        requirements: [{ description: "An explicitly selected supported Chromium browser with WebGL2.", id: "html-browser", optional: false }],
      },
      {
        id: "three-spark-webgl2-hardware-v1",
        kind: "renderer",
        qualification: { evidence: ["apps/desktop/qualification/world-render.ts"], level: "browser", status: "conditional" },
        requirements: [{ description: "Chromium WebGL2 and the exact Spark runtime closure.", id: "html-browser", optional: false }],
      },
    ],
    stability: "experimental",
    title: "Spatial scenes",
    toolNames: [
      "audit_scene",
      "audit_scene_temporal",
      "check_scene",
      "check_scene_behavior",
      "check_scene_direction",
      "check_scene_effects",
      "diff_scenes",
      "evaluate_scene",
      "inspect_scene",
      "plan_scene_direction",
      "plan_scene_effects",
      "plan_scene_gallery",
    ],
    trust: "local-effects",
    version: 1,
    workflowKeys: ["cinematic-world@1"],
  }),
  defineSlopcameraCapabilityModule({
    commands: [{ effect: "project-mutation", name: "scene project" }],
    description: "Versioned spatial-project revisions, shots, candidates, selection, recovery, and prepared delivery.",
    moduleId: "slopcamera.capability.spatial-projects",
    operationKeys: spatialProjectOperations,
    profiles: [{
      id: "spatial-project-v2",
      kind: "interchange",
      qualification: { evidence: ["apps/desktop/qualification/project.ts"], level: "fixture", status: "qualified" },
      requirements: [],
    }],
    stability: "experimental",
    title: "Spatial projects",
    toolNames: [],
    trust: "local-effects",
    version: 1,
    workflowKeys: ["directed-scene@1"],
  }),
  defineSlopcameraCapabilityModule({
    commands: [{ effect: "local-read", name: "analyze" }],
    description: "Local bounded analysis for scenes, activity, music, faces, and camera following.",
    moduleId: "slopcamera.capability.analysis",
    operationKeys: analysisOperations,
    profiles: [{
      id: "local-analysis-v1",
      kind: "authoring",
      qualification: { evidence: ["apps/desktop/analysis", "apps/desktop/core"], level: "fixture", status: "conditional" },
      requirements: [{ description: "Some analysis profiles need separately qualified native helpers.", id: "native-analysis-helper", optional: true }],
    }],
    stability: "stable",
    title: "Local analysis",
    toolNames: [],
    trust: "local-effects",
    version: 1,
    workflowKeys: [],
  }),
  defineSlopcameraCapabilityModule({
    commands: [
      { effect: "project-mutation", name: "project edit" },
      { effect: "local-derived-write", name: "project render" },
      { effect: "local-derived-write", name: "media color" },
      { effect: "local-derived-write", name: "media audio" },
    ],
    description: "Immutable source media, non-destructive edits, overlays, color/audio treatment, and deterministic project rendering.",
    moduleId: "slopcamera.capability.project-editing",
    operationKeys: editingOperations,
    profiles: [{
      id: "ffmpeg-project-render-v1",
      kind: "renderer",
      qualification: { evidence: ["apps/desktop/qualification/project.ts"], level: "native", status: "conditional" },
      requirements: [
        { description: "A supported FFmpeg executable.", id: "ffmpeg", optional: false },
        { description: "A supported FFprobe executable.", id: "ffprobe", optional: false },
      ],
    }],
    stability: "stable",
    title: "Project editing and rendering",
    toolNames: [],
    trust: "local-effects",
    version: 1,
    workflowKeys: ["chaptered-demo@3", "polished-screen-demo@4", "social-variants@3", "talking-head-cleanup@2"],
  }),
  defineSlopcameraCapabilityModule({
    commands: [
      { effect: "project-mutation", name: "workflows run" },
      { effect: "project-mutation", name: "runs resume" },
    ],
    description: "Bounded creative candidates, render matrices, explicit selection, promotion, and materialized deliveries.",
    moduleId: "slopcamera.capability.iteration",
    operationKeys: iterationOperations,
    profiles: [{
      id: "durable-workflow-v1",
      kind: "authoring",
      qualification: { evidence: ["apps/desktop/code", "apps/desktop/workflows"], level: "fixture", status: "qualified" },
      requirements: [],
    }],
    stability: "stable",
    title: "Durable iteration",
    toolNames: [],
    trust: "local-effects",
    version: 1,
    workflowKeys: ["creative-iteration@1", "creative-selection@1"],
  }),
  defineSlopcameraCapabilityModule({
    commands: [{ effect: "paid-cloud", name: "ai models" }, { effect: "paid-cloud", name: "ai image" }],
    description: "Explicit Vercel AI Gateway image, video, speech, and transcription operations with opt-in uploads.",
    moduleId: "slopcamera.capability.gateway",
    operationKeys: gatewayOperations,
    profiles: [{
      id: "vercel-ai-gateway-v1",
      kind: "provider",
      qualification: { evidence: ["docs/vercel.md"], level: "provider", status: "conditional" },
      requirements: [{ description: "Caller-owned Vercel AI Gateway credentials.", id: "vercel-ai-gateway-credential", optional: false }],
    }],
    stability: "stable",
    title: "Gateway media",
    toolNames: [],
    trust: "paid-provider",
    version: 1,
    workflowKeys: [],
  }),
  defineSlopcameraCapabilityModule({
    commands: [{ effect: "local-derived-write", name: "studio run" }],
    description: "Retained Blender, CadQuery, and Manim source executed only under an invocation-scoped trusted-current-user envelope.",
    moduleId: "slopcamera.capability.native-authoring",
    operationKeys: ["slopcamera.studio.run@1"],
    profiles: [
      {
        id: "blender-native-v1",
        kind: "native-adapter",
        qualification: { evidence: ["apps/desktop/studio"], level: "native", status: "conditional" },
        requirements: [{ description: "Caller-selected Blender executable and explicit trusted-code authority.", id: "blender", optional: false }],
      },
      {
        id: "cadquery-native-v1",
        kind: "native-adapter",
        qualification: { evidence: ["apps/desktop/studio"], level: "native", status: "conditional" },
        requirements: [{ description: "Caller-selected pinned Python environment and explicit trusted-code authority.", id: "cadquery-python", optional: false }],
      },
      {
        id: "manim-native-v1",
        kind: "native-adapter",
        qualification: { evidence: ["apps/desktop/studio"], level: "native", status: "conditional" },
        requirements: [{ description: "Caller-selected pinned Python environment and explicit trusted-code authority.", id: "manim-python", optional: false }],
      },
    ],
    stability: "experimental",
    title: "Native authoring",
    toolNames: [],
    trust: "native-adapter",
    version: 1,
    workflowKeys: [],
  }),
]);

function operationProjection(operation: OperationDiscovery): SlopcameraCapabilityOperation {
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
  };
}

function workflowProjection(workflow: typeof BUILT_IN_WORKFLOWS[number]): SlopcameraCapabilityWorkflow {
  return { id: workflow.id, inputSchemaId: workflow.inputSchemaId, key: `${workflow.id}@${workflow.version}`, version: workflow.version };
}

function toolProjection(tool: typeof slopcameraMcpTools[number]): SlopcameraCapabilityTool {
  return {
    destructive: tool.annotations.destructiveHint,
    idempotent: tool.annotations.idempotentHint,
    name: tool.name,
    openWorld: tool.annotations.openWorldHint,
    readOnly: tool.annotations.readOnlyHint,
  };
}

export function createLocalSlopcameraCapabilityManifest(
  registry: Pick<OperationRegistry, "list"> = createApplicationOperationRegistry(),
  toolVersion: string = SLOPCAMERA_APPLICATION_TOOL_VERSION,
): SlopcameraCapabilityManifest {
  return compileSlopcameraCapabilityManifest({
    host: "local",
    modules: capabilityModules,
    operations: registry.list().map(operationProjection),
    tools: slopcameraMcpTools.map(toolProjection),
    toolVersion,
    workflows: BUILT_IN_WORKFLOWS.map(workflowProjection),
  });
}
