import { z } from "zod";
import { RepositoryRelativePathSchema } from "../contracts";
import {
  HtmlOverlayAuthoringInputSchema, HtmlOverlayCanvasSchema, HtmlOverlayDeclaredResourceSchema,
  HtmlOverlayInlineDocumentSchema, HtmlOverlayParametersSchema, HtmlOverlayTimingSchema,
} from "./contracts";
import { HtmlOverlayExecutionProfileSchema } from "./execution-profile";
import { HtmlOverlayLibrarySelectionSchema } from "./libraries";
import { AUDIO_REACTIVITY_MAX_DURATION_US } from "../core/audio-reactivity";
import { HTML_AUDIO_REACTIVITY_RESOURCE_NAME, HTML_AUDIO_REACTIVITY_RESOURCE_URL_PATH } from "./audio-reactivity";

const ResourceSchema = HtmlOverlayDeclaredResourceSchema.omit({ bytes: true, sha256: true }).extend({
  path: RepositoryRelativePathSchema,
});

/** A local scene source. Audio is an explicit caller-selected import, never a browser resource. */
export const HtmlSceneInputSchema = z.strictObject({
  kind: z.literal("slopcamera.html-scene"),
  schemaVersion: z.literal(1),
  name: z.string().trim().min(1).max(512),
  document: z.union([HtmlOverlayInlineDocumentSchema, z.strictObject({ path: RepositoryRelativePathSchema })]),
  canvas: HtmlOverlayCanvasSchema,
  timing: HtmlOverlayTimingSchema,
  libraries: HtmlOverlayLibrarySelectionSchema.default([]),
  parameters: HtmlOverlayParametersSchema.default({}),
  resources: z.array(ResourceSchema).max(64).default([]),
  seed: z.number().int().safe().min(0).max(0xffff_ffff).default(0),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/u).default("#080b16"),
  executionProfile: HtmlOverlayExecutionProfileSchema.optional(),
  audio: z.strictObject({
    path: z.string().min(1).max(4096).refine(path => !/[\0\r\n]/u.test(path), "Audio path contains a control character."),
    reactivity: z.strictObject({
      profile: z.literal("bands-v1"),
      resource: z.literal(HTML_AUDIO_REACTIVITY_RESOURCE_NAME).optional(),
      sha256: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
    }).optional(),
  }).optional(),
}).superRefine((input, context) => {
  if (input.audio?.reactivity !== undefined && input.timing.durationUs > AUDIO_REACTIVITY_MAX_DURATION_US) {
    context.addIssue({ code: "custom", message: "Audio reactivity is limited to ten minutes per scene." });
  }
  if (input.audio?.reactivity?.resource === undefined && input.audio?.reactivity !== undefined && (
    input.resources.length >= 64
    || input.resources.some(resource => resource.name === HTML_AUDIO_REACTIVITY_RESOURCE_NAME
      || resource.urlPath === HTML_AUDIO_REACTIVITY_RESOURCE_URL_PATH)
  )) {
    context.addIssue({ code: "custom", message: "Audio reactivity requires one free resource slot and an unused audio-reactivity name and slopcamera/audio-reactivity.json URL path." });
  }
  if (input.audio?.reactivity?.resource === undefined && input.audio?.reactivity?.sha256 !== undefined) {
    context.addIssue({ code: "custom", message: "An audio-reactivity sidecar digest requires its retained resource name." });
  }
  if (input.audio?.reactivity?.resource !== undefined && !input.resources.some(resource => (
    resource.name === HTML_AUDIO_REACTIVITY_RESOURCE_NAME && resource.urlPath === HTML_AUDIO_REACTIVITY_RESOURCE_URL_PATH
      && resource.mediaType === "application/json" && resource.transport === "fetch"
  ))) {
    context.addIssue({ code: "custom", message: "A retained audio-reactivity source must declare its fixed fetched JSON resource." });
  }
  if (input.audio?.reactivity?.resource !== undefined && input.audio.reactivity.sha256 === undefined) {
    context.addIssue({ code: "custom", message: "A retained audio-reactivity source must record its sidecar SHA-256 digest." });
  }
  const authoring = HtmlOverlayAuthoringInputSchema.safeParse({
    kind: "slopcamera.html-overlay", schemaVersion: 1, canvas: input.canvas, timing: input.timing,
    libraries: input.libraries, parameters: input.parameters, seed: input.seed,
    html: "html" in input.document ? input.document.html : "<html></html>",
    resources: input.resources.map(({ path: _path, ...resource }) => ({ ...resource, bytes: 0, sha256: "0".repeat(64) })),
  });
  // Feed only the authoring contract's own fields through its workload and identity checks.
  if (!authoring.success) {
    for (const issue of authoring.error.issues) context.addIssue({ code: "custom", message: issue.message });
  }
  // The existing renderer emits CSS-sized screenshots at every device scale.
  if (input.canvas.width % 2 !== 0 || input.canvas.height % 2 !== 0) {
    context.addIssue({ code: "custom", message: "MP4 export requires even canvas width and height." });
  }
});
export type HtmlSceneInput = Readonly<z.infer<typeof HtmlSceneInputSchema>>;
