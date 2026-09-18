import { z } from "zod";

import {
  spatialSceneSha256,
  SpatialSceneV1Schema,
} from "../../../src/spatial-scene";
import { SpatialDirectionSchema } from "../../../src/spatial-scene/direction";
import { SpatialTemporalAuditOptionsSchema } from "../../../src/spatial-scene/temporal-audit";
import { SpatialRecipePackSchema } from "../../../src/spatial-scene/recipe-pack";
import { SpatialRenderRequestSchema, type SpatialRenderRequest } from "../application/spatial-render";
import type { SpatialEffectsPlanInput } from "../application/operations/spatial-direction";
import { MediaArtifactRequestSchema } from "../application/operations/media/shared";
import type { OperationInputValue } from "../code/contracts";
import { defineWorkflow } from "../code/public";

export const CinematicWorldInputSchema = z.strictObject({
  /** The declarative pack an agent authors: direction, axes, previews, audit. */
  pack: SpatialRecipePackSchema,
  /** The admitted scene the pack binds by `sceneSha256`. */
  scene: SpatialSceneV1Schema,
  /** Repository artifact for the same scene, used only by render nodes. */
  source: MediaArtifactRequestSchema,
}).superRefine((input, context) => {
  if (input.pack.sceneSha256 !== spatialSceneSha256(input.scene)) {
    context.addIssue({
      code: "custom",
      message: "Recipe pack sceneSha256 does not match the admitted scene.",
      path: ["pack", "sceneSha256"],
    });
  }
  input.pack.previews.forEach((preview, index) => {
    const parsed = SpatialRenderRequestSchema.safeParse(preview.request);
    if (!parsed.success) {
      context.addIssue({
        code: "custom",
        message: `Preview ${preview.name} request is not a valid spatial render request.`,
        path: ["pack", "previews", index, "request"],
      });
    }
  });
});

/**
 * The complete agent-directed planning and review loop for one admitted scene:
 * inspect the world, check and compile the authored direction, plan a bounded
 * gallery per requested axis, optionally bind declared effects into each
 * preview render, and audit sampled temporal evidence. Every proposal stays
 * `verified: false`; selection and promotion are separate explicit operations
 * outside this workflow.
 */
export const cinematicWorld = defineWorkflow({
  id: "cinematic-world",
  inputSchema: CinematicWorldInputSchema,
  inputSchemaId: "slopcamera.workflow.cinematic-world.input/v1",
  version: 1,
  build(workflow, input) {
    const sceneSha256 = input.pack.sceneSha256;
    /** Parsed documents enter operation input positions unchanged; refs may substitute any position. */
    const scene = input.scene as unknown as OperationInputValue<z.infer<typeof SpatialSceneV1Schema>>;
    const direction = input.pack.direction as unknown as OperationInputValue<z.infer<typeof SpatialDirectionSchema>>;
    const planning = workflow.namespace("planning");
    const inspect = planning.scene.inspect("inspect", { scene });
    const directionCheck = planning.scene.directionCheck("direction-check", {
      direction,
      scene,
    });
    const compilation = planning.scene.directionCompile("direction-compile", {
      direction,
      scene,
      ...(input.pack.cameraId === undefined ? {} : { cameraId: input.pack.cameraId }),
    });
    const galleries = workflow.namespace("galleries");
    const gallery = Object.fromEntries(input.pack.axes.map(axis => [axis, galleries.scene.directionGallery(axis, {
      axis,
      direction,
      scene,
      ...(input.pack.cameraId === undefined ? {} : { cameraId: input.pack.cameraId }),
    })]));
    const audit = input.pack.temporalAudit === undefined || input.pack.cameraId === undefined
      ? undefined
      : planning.scene.temporalAudit("temporal-audit", {
        cameraId: input.pack.cameraId,
        options: {
          contacts: input.pack.temporalAudit.contacts,
          cutBeforeUs: input.pack.temporalAudit.cutBeforeUs,
        } as unknown as OperationInputValue<z.infer<typeof SpatialTemporalAuditOptionsSchema>>,
        scene,
        ...(input.pack.temporalAudit.timesUs === undefined
          ? {} : { timesUs: input.pack.temporalAudit.timesUs }),
      });
    const previews = workflow.namespace("previews");
    const renders = input.pack.previews.map(preview => {
      const request = SpatialRenderRequestSchema.parse(preview.request) as unknown as OperationInputValue<SpatialRenderRequest>;
      const branch = previews.namespace(preview.name);
      const effects = input.pack.effects === undefined ? undefined : branch.scene.effectsPlan("effects", {
        particleSystems: input.pack.effects.particleSystems,
        renderPlan: input.pack.effects.renderPlan,
        scene,
        simulationBakes: input.pack.effects.simulationBakes,
      } as unknown as OperationInputValue<SpatialEffectsPlanInput>);
      const render = branch.scene.render("render", {
        request: {
          ...request,
          ...(effects === undefined ? {} : { effects }),
        },
        sceneSha256,
        source: input.source,
      });
      return {
        effects,
        name: preview.name,
        render,
      };
    });
    return {
      compilation,
      directionCheck,
      galleries: gallery,
      inspect,
      previews: Object.fromEntries(renders.map(candidate => [candidate.name, {
        ...(candidate.effects === undefined ? {} : { effects: candidate.effects }),
        render: candidate.render,
      }])),
      ...(audit === undefined ? {} : { temporalAudit: audit }),
    };
  },
});
