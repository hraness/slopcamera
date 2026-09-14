import { describe, expect, test } from "bun:test";
import { z } from "zod";

import {
  gatewayImageOperationDefinition,
  gatewaySpeechOperationDefinition,
  gatewayTranscriptionOperationDefinition,
  gatewayVideoOperationDefinition,
} from "../application/operations/gateway";
import {
  commitProjectEditsOperationDefinition,
  deriveEditBatchOperationDefinition,
  htmlOverlayOperationDefinition,
  mediaAudioEffectsOperationDefinition,
  mediaColorGradeOperationDefinition,
  mediaIngestOperationDefinition,
  mediaOverlayOperationDefinition,
  projectSnapshotOperationDefinition,
} from "../application/operations";
import { OperationRegistry } from "../application/registry";
import {
  createHtmlOverlayScaffoldInput,
  createThreeReferenceScaffoldInput,
} from "../html-overlay";
import {
  WorkflowBuilder,
  createMetallicLogoImageRequest,
  defineCompute,
  defineWorkflowFragment,
  type ProjectHandle,
} from "./public";

function operationRegistry(): OperationRegistry {
  const registry = new OperationRegistry();
  registry.register(projectSnapshotOperationDefinition);
  registry.register(mediaIngestOperationDefinition);
  registry.register(htmlOverlayOperationDefinition);
  registry.register(mediaOverlayOperationDefinition);
  registry.register(mediaAudioEffectsOperationDefinition);
  registry.register(mediaColorGradeOperationDefinition);
  registry.register(deriveEditBatchOperationDefinition);
  registry.register(commitProjectEditsOperationDefinition);
  registry.register(gatewayImageOperationDefinition);
  registry.register(gatewayVideoOperationDefinition);
  registry.register(gatewaySpeechOperationDefinition);
  registry.register(gatewayTranscriptionOperationDefinition);
  return registry;
}

const SnapshotTarget = defineCompute({
  key: "test.snapshot-target",
  inputSchema: z.strictObject({}),
  inputSchemaId: "test.snapshot-target.input/v1",
  outputSchema: z.strictObject({ project: z.string() }),
  outputSchemaId: "test.snapshot-target.output/v1",
  run: () => ({ project: "project_progressive02" }),
});

const progressiveMedia = defineWorkflowFragment((
  workflow,
  input: { readonly project: ProjectHandle },
) => {
  const ingested = workflow.media.ingest("ingest", {
    project: input.project,
    role: "camera",
    source: { path: "fixtures/presenter.mp4" },
  });
  const audio = workflow.media.audioEffects("audio", {
    input: ingested.select("artifact"),
    transform: {
      audioStreamIndex: 0,
      effects: [{ gainDb: -3, kind: "volume" }],
      kind: "slopcamera.audio-effects-transform",
      output: { kind: "audio-only", profile: "wav-pcm-s16le" },
      schemaVersion: 1,
    },
  });
  const color = workflow.media.colorGrade("color", {
    input: ingested.select("artifact"),
    transform: {
      grade: { kind: "preset", preset: "clean" },
      kind: "slopcamera.color-grade-transform",
      outputProfile: "h264-mp4",
      schemaVersion: 1,
      videoStreamIndex: 0,
    },
  });
  const image = workflow.gateway.image("image", {
    model: "openai/image-example",
    prompt: "Create a clean title card.",
  });
  const generatedImage = image.select("outputs").at(0);
  const threeReference = createThreeReferenceScaffoldInput(
    generatedImage,
    generatedImage.select("mediaType"),
  );
  const htmlOverlay = workflow.media.htmlOverlay("html-overlay", {
    ...threeReference,
    canvas: {
      deviceScaleFactor: 1,
      height: 1_080,
      width: 1_920,
    },
    project: input.project,
    range: { endUs: 3_000_000, startUs: 0 },
    timing: {
      durationUs: 3_000_000,
      fps: 30,
    },
  });
  const overlay = workflow.media.overlay("overlay", {
    project: input.project,
    range: { endUs: 3_000_000, startUs: 0 },
    source: {
      artifact: image.select("outputs").at(0),
      kind: "image",
    },
  });
  const overlayBatch = workflow.edits.addOverlays(
    "overlay-batch",
    [htmlOverlay, overlay],
  );
  const composition = workflow.project.commitEdits("overlay-commit", {
    batch: overlayBatch,
    project: input.project,
  });
  const video = workflow.gateway.video("video", {
    model: "google/video-example",
    prompt: "Animate the title card subtly.",
    promptImage: image.select("outputs").at(0),
  });
  const speech = workflow.gateway.speech("speech", {
    model: "openai/speech-example",
    text: "Welcome to the presentation.",
    voice: "alloy",
  });
  const transcription = workflow.gateway.transcription("transcription", {
    audio: speech.select("outputs").at(0),
    model: "openai/transcription-example",
  });
  return Object.freeze({
    audio,
    color,
    composition: composition.receipt,
    htmlOverlay: htmlOverlay.output,
    image,
    ingested,
    overlay: overlay.output,
    speech,
    transcription,
    video,
  });
});

describe("progressive semantic workflow helpers", () => {
  test("builds a reference-led metallic logo request as one typed image node", () => {
    const workflow = WorkflowBuilder.create(operationRegistry());
    const logo = {
      bytes: 1_024,
      facts: { height: 512, width: 512 },
      mediaType: "image/png",
      path: "artwork/logo.png",
      sha256: "a".repeat(64),
    } as const;
    const image = workflow.gateway.image("metallic-logo",
      createMetallicLogoImageRequest({
        backgroundColor: "warm gray",
        brandName: "Hraness",
        model: "openai/image-example",
        objectColor: "brushed cobalt",
        reference: logo,
      }));
    const graph = workflow.build({
      id: "metallic-logo",
      inputSchemaId: "test.metallic-logo.input/v1",
      version: 1,
    }, { image });

    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]).toMatchObject({
      dependencies: [],
      input: {
        aspectRatio: "1:1",
        images: [logo],
        model: "openai/image-example",
        n: 1,
      },
      key: "metallic-logo",
    });
    expect(graph.nodes[0]?.input).toHaveProperty("prompt");
  });

  test("compose namespaced semantic fragments with path-first and Ref inputs", () => {
    const workflow = WorkflowBuilder.create(operationRegistry());
    const project = workflow.project.snapshot("project", "project_progressive01");
    const media = workflow.fragment("assets", progressiveMedia, { project });
    const snapshotTarget = workflow.compute("snapshot-target", SnapshotTarget, {});
    const snapshotA = workflow.project.snapshot(
      "snapshot-a",
      "project_progressive01",
      { after: snapshotTarget },
    );
    const snapshotB = workflow.project.snapshot(
      "snapshot-b",
      "project_progressive02",
      { after: snapshotA.snapshot },
    );
    const snapshotC = workflow.project.snapshot(
      "snapshot-c",
      "project_progressive03",
      { after: snapshotB.snapshot },
    );
    const snapshots = {
      a: snapshotA,
      b: snapshotB,
      c: snapshotC,
      d: workflow.project.snapshot(
        "snapshot-d",
        "project_progressive04",
        { after: snapshotC.snapshot },
      ),
    };
    const graph = workflow.build({
      id: "progressive-api",
      inputSchemaId: "test.progressive-api.input/v1",
      version: 1,
    }, { media, snapshots: { a: snapshots.a.snapshot, b: snapshots.b.snapshot, c: snapshots.c.snapshot, d: snapshots.d.snapshot } });

    const nodes = new Map(graph.nodes.map(node => [node.key, node]));
    expect(nodes.get("assets/ingest")?.input).toMatchObject({
      role: "camera",
      source: { path: "fixtures/presenter.mp4" },
    });
    expect(nodes.get("assets/ingest")?.dependencies).toEqual(["project"]);
    expect(nodes.get("assets/audio")?.dependencies).toEqual(["assets/ingest"]);
    expect(nodes.get("assets/color")?.dependencies).toEqual(["assets/ingest"]);
    expect(nodes.get("assets/html-overlay")?.dependencies).toEqual([
      "assets/image",
      "project",
    ]);
    expect(nodes.get("assets/html-overlay")?.input).toMatchObject({
      libraries: ["three"],
      project: {
        $ref: {
          nodeKey: "project",
          path: ["project", "projectId"],
        },
      },
      resources: [{
        artifact: {
          $ref: {
            nodeKey: "assets/image",
            path: ["outputs", 0],
          },
        },
        mediaType: {
          $ref: {
            nodeKey: "assets/image",
            path: ["outputs", 0, "mediaType"],
          },
        },
        name: "reference-image",
      }],
    });
    expect(nodes.get("snapshot-a")?.executor).toEqual({
      kind: "operation",
      operation: {
        kind: "project.snapshot",
        version: 1,
      },
    });
    expect(nodes.get("assets/overlay")?.dependencies).toEqual([
      "assets/image",
      "project",
    ]);
    expect(nodes.get("assets/overlay-batch")?.dependencies)
      .toEqual(["assets/html-overlay", "assets/overlay"]);
    expect(nodes.get("assets/overlay-commit")?.dependencies).toEqual([
      "assets/overlay-batch",
      "project",
    ]);
    expect(nodes.get("assets/overlay-batch")?.executor).toEqual({
      kind: "operation",
      operation: { kind: "derive.edit-batch", version: 1 },
    });
    expect(nodes.get("assets/overlay-commit")?.executor).toEqual({
      kind: "operation",
      operation: { kind: "project.commit-edits", version: 1 },
    });
    expect(nodes.get("assets/video")?.dependencies).toEqual(["assets/image"]);
    expect(nodes.get("assets/transcription")?.dependencies)
      .toEqual(["assets/speech"]);
    expect(nodes.get("snapshot-a")?.dependencies)
      .toEqual(["snapshot-target"]);
    expect(nodes.get("snapshot-b")?.dependencies)
      .toEqual(["snapshot-a"]);
    expect(nodes.get("snapshot-c")?.dependencies)
      .toEqual(["snapshot-b"]);
    expect(nodes.get("snapshot-d")?.dependencies)
      .toEqual(["snapshot-c"]);

    expect(nodes.get("assets/audio")?.outputSchemaId)
      .toBe("slopcamera.operation.media.audio-effects.output/v1");
    expect(nodes.get("assets/color")?.outputSchemaId)
      .toBe("slopcamera.operation.media.color-grade.output/v1");
    expect(nodes.get("assets/ingest")?.outputSchemaId)
      .toBe("slopcamera.operation.media.ingest.output/v1");
    expect(nodes.get("assets/html-overlay")?.outputSchemaId)
      .toBe("slopcamera.operation.media.html-overlay.output/v1");
    expect(nodes.get("assets/overlay")?.outputSchemaId)
      .toBe("slopcamera.operation.media.overlay.output/v1");
    expect(nodes.get("assets/image")?.outputSchemaId)
      .toBe("slopcamera.operation.gateway.image.output/v1");
    expect(nodes.get("assets/video")?.outputSchemaId)
      .toBe("slopcamera.operation.gateway.video.output/v1");
    expect(nodes.get("assets/speech")?.outputSchemaId)
      .toBe("slopcamera.operation.gateway.speech.output/v1");
    expect(nodes.get("assets/transcription")?.outputSchemaId)
      .toBe("slopcamera.operation.gateway.transcription.output/v1");
  });

  test.each([
    ["motion", ["motion"]],
    ["p5", ["p5"]],
    ["two", ["two.js"]],
    ["paper-shaders", ["@paper-design/shaders"]],
    ["three", ["three"]],
    ["vgpu", ["vgpu"]],
  ] as const)("spreads the %s scaffold without duplicating libraries", (
    kind,
    libraries,
  ) => {
    const workflow = WorkflowBuilder.create(operationRegistry());
    const project = workflow.project.snapshot(
      "project",
      "project_html_scaffold01",
    );
    const scaffold = createHtmlOverlayScaffoldInput(kind);
    const overlay = workflow.media.htmlOverlay("html-overlay", {
      ...scaffold,
      canvas: { deviceScaleFactor: 1, height: 720, width: 1_280 },
      project,
      range: { endUs: 2_000_000, startUs: 0 },
      timing: { durationUs: 2_000_000, fps: 30 },
    });
    const graph = workflow.build({
      id: `html-overlay-${kind}`,
      inputSchemaId: `test.html-overlay-${kind}.input/v1`,
      version: 1,
    }, { overlay: overlay.output });

    expect(graph.nodes.find(node => node.key === "html-overlay")?.input)
      .toMatchObject({
        document: { html: scaffold.document.html },
        libraries: [...libraries],
      });
  });
});
