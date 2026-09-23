# Direct a film or animation style

Choose a style profile to make the drawing, materials, camera, timing, and finish
agree. This guide uses current-source Slopcamera and the editable portfolio
examples. Follow [source setup](use-current-source.md) first.

## Choose direction

```sh
slopcamera style list
slopcamera style show theatrical-cel --json
slopcamera style show silent-actuality --json
```

The catalog includes 17 film, drawn, tactile, digital, and explanatory styles.
Each profile has a palette, shape and material guidance, camera direction,
exposure cadence, resolution recommendation, finishing values, and acceptance
criteria. These are recommendations for authoring. Reading a profile does not
alter a render or make a model request.

Keep explicit user dimensions and timing. For a new creative delivery, the
profiles recommend native 4K, with a 4:3 composition for historical film and an
integer-scaled logical grid for pixel art. The sample movies use native 1080p to
keep local render jobs short; their still mode renders native 4K. Resolution alone
does not establish detail or visual quality.

Choose a renderer after the style. Use [HTML scenes](render-motion-graphics.md)
for drawn work, [native studio](../studio.md) for physical scenes, and
[Gateway media](generate-media.md) when reviewed generated assets are needed.
The seven HTML library profiles remain separate from visual style.

## Render a study

From the source checkout, render one of the original Canvas studies:

```sh
bun examples/style-portfolio/render.ts --style theatrical-cel --dry-run --run preview-plan
bun examples/style-portfolio/render.ts --style theatrical-cel --run train-film
bun examples/style-portfolio/render.ts --style theatrical-cel --still --offset 2.5 --run train-still
```

Rendering requires Slopcamera's admitted local browser and FFmpeg/FFprobe.
The script invokes the canonical `html render` command, uses no external assets,
and writes requests, logs, results, and attempt intents below
`artifacts/style-portfolio/<run>/`. Follow each result's `output.path` and
`receipt.path` for the movie and retained Slopcamera evidence. A still request
produces a one-frame movie and retained full-resolution PNG in the render job.

Use `--all` instead of `--style` to render all twelve animation studies
sequentially. `--width` accepts 1280, 1920, 2560, or 3840; pixel art remains on its
320×180 logical grid at every supported size. `--still` defaults to 3840, while
movies default to 1920. Use a new `--run` for a deliberate revision. A retained
attempt is never resubmitted automatically; inspect its log and native receipts
if it did not complete.

Dry runs retain separate `.plan.*` evidence under the same run directory. Reusing
a plan or execution attempt preserves its files and reports `already-attempted`.

The [Market Street source](../../examples/style-portfolio/market-street/README.md)
demonstrates a separate Blender workflow with procedural geometry and a dated
source manifest. It is an authored, geographically compressed reconstruction.
The profile does not verify its historical accuracy.

## Reuse the direction

```ts
import {
  createVisualStyleDirection,
  getVisualStyleProfile,
  sampleVisualStyleExposure,
  visualStyleFrameVariation,
} from "@hraness/slopcamera";

const profile = getVisualStyleProfile("theatrical-cel");
const direction = createVisualStyleDirection(profile.id);
const exposure = sampleVisualStyleExposure(1_250_000, profile.id);
const variation = visualStyleFrameVariation(42, exposure.exposureIndex, "coat-ink");
```

`direction` is reusable text for an agent or a creative brief; it does not send a
prompt. `exposureTimeUs` samples the subject's held drawing. `cameraTimeUs`
samples the separately configured camera cadence. Key variation by the exposure
and a stable channel such as an object name, so seeking in a different order
reproduces the same values. The helper does not animate an object by itself.

The existing local look graph can apply the supported finishing controls:

```ts
import { createVisualStyleVideoLook } from "@hraness/slopcamera/local/code";

const look = createVisualStyleVideoLook("silent-actuality", {
  height: 1440,
  seed: 1906,
});
```

This adapter uses color grade, screen diffusion, frame-varying grain, and
vignette. It does not change source geometry or timing, apply gate weave, control
physical grain size, or simulate spectral film response. Its diffusion is an
artistic approximation of highlight glow.

The source example `finish-film.ts` applies this checked graph with local FFmpeg
to a new MP4, retains input/output hashes and a receipt, and refuses existing
output intents. It accepts one video stream and at most one audio stream, with
at most 30 seconds, 120 fps, and 512 MiB. Dimensions must be even, at least 64
pixels per side, and no larger than 4096×4320:

```sh
bun examples/style-portfolio/finish-film.ts \
  artifacts/my-city-source.mp4 silent-actuality \
  artifacts/style-portfolio/city/silent-film.mp4
```

## Inspect the result

Review the untreated picture first. Period props, coherent perspective, readable
silhouettes, and motivated light must survive with the finish disabled. For cel
animation, inspect held drawings and smooth camera movement separately. For pixel
art, inspect crisp integer pixels. For mathematical explanation, check the
construction and labels against the stated relation.

Review the encoded motion as well as stills. Check the beginning, strongest
action, transitions, and ending for stale frames, texture shimmer, crop, and
unmotivated movement. Keep native-resolution source and receipts beside the
selected movie. Use the [style direction reference](../../skills/slopcamera/references/visual-style-direction.md)
for family-specific construction and review criteria.
