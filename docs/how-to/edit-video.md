# Edit and deliver video

Use the ordinary media project when you need to revise footage, audio, cuts, camera framing, overlays or delivery variants. This guide assumes you have a recording, an existing project, a retained clip from studio/directing assembly, or an authored HTML scene. See [capabilities and installation](../reference/capabilities.md) for the available host.

Neither the released nor current CLI captures new recordings. These commands consume existing finished bundles or projects. Cursor and input-aware effects require the matching recording metadata.

## Inspect the source and project

```sh
slopcamera doctor --json
slopcamera recordings list --json
slopcamera projects list --json
slopcamera project inspect <project-id> --json
```

Use `slopcamera inspect <recording-id> --json` for a recording bundle. If an existing finished recording bundle is the source, create its project:

```sh
slopcamera projects create --from-recording <recording-id> --name "Product demonstration" --json
```

`projects create` is recording-based; it does not accept an invented `--from-video` flag. The released `studio assemble`, `direct assemble`, and `html render` commands also create ordinary projects. Retain the project ID they return.

For authored visuals and a local soundtrack, [render an HTML music scene](music-video.md). `slopcamera html render --input <scene.json>` retains the document, renders the scene, and creates a project with the scene video and original audio as separate sources. It requires an explicit duration and does not infer tempo from the audio.

`project add` and the SDK’s `media.ingest` still need an existing project. A collection of arbitrary media files alone does not create an empty project. Do not manufacture a recording, native receipt, or generated take to cross that boundary.

## Add and time the selected media

```sh
slopcamera project add <project-id> camera.mov --role camera --json
slopcamera project add <project-id> narration.wav --role dialogue --at 0us --json
```

Read the imported placement and stream IDs from inspection. Imported synchronization starts unverified. For recordings of the same event, use `slopcamera help align`, analyze the chosen reference/target audio streams, inspect the evidence and apply the exact returned alignment.

For an authored montage, `--at` declares placement time. It is not evidence that independently recorded streams are synchronized. If delivery intentionally uses that timing, pass `--allow-unverified-sync` explicitly on the render; its receipt remains provisional.

## Apply the needed edit

Use project time for structural cuts, trims and speeds. They affect all placements:

```sh
slopcamera project edit <project-id> trim 0s 16s --json
slopcamera project edit <project-id> cut 4s 5s --json
```

Those commands are examples of separate decisions; do not apply a cut merely because it appears here. `slopcamera help project` describes camera moves and screen effects. Camera framing addresses a placed video stream. Cursor, window and focused-input zooms need recording-backed metadata.

Choose evidence for the edit: local faces for framing, speech/filler analysis for spoken-word cleanup, music analysis before protecting music during cuts, or inactivity for long gaps. Scene descriptions use selected cloud-uploaded frames and require their acknowledgement. `media audio` and `media color` create typed local treatment derivatives; they are separate command families, not arbitrary `project edit` filters.

## Place graphics without clipping

Project image/video overlays use a position **offset from the selected anchor**. For a 720×1280 portrait output, this places a 636×180 caption with 42-pixel side margins:

```sh
slopcamera project edit <project-id> overlay add --kind image --source caption.png \
  --from 0s --to 3s --anchor top-left --position 42,70 \
  --width 636 --height 180 --json
```

To center an overlay, use `--anchor center --position 0,0`. A full-frame still uses a top-left anchor at `0,0` and the output dimensions. Inspect the returned edit and actual frames, especially where the overlay enters or leaves.

The direct overlay grammar accepts image, SVG, GIF, video and checked emoji sources. For an HTML, Three or WGSL layer in an existing project, render a reviewed document through the local `media.htmlOverlay` workflow operation, then use the returned video layer. Use `html render` for a complete authored scene with its own new project. [The HTML guide](../html-overlay-creative-toolkit.md) explains the available authoring profiles.

## Directed delivery variants

These four compositions start from the same six-second native product film. Each is a separate ordinary project with its own camera framing and SVG title layout. The retained recipe applies the same timing edit to each project:

```sh
slopcamera project edit <project-id> trim 0.25s 5.75s --json
slopcamera project edit <project-id> cut 2.5s 2.75s --json
slopcamera project edit <project-id> speed 4s 5.75s 1.25 --json
```

These times address the original project clock. Trimming keeps 5.5 seconds; the cut removes 0.25 seconds; speeding the last 1.75 seconds to 1.25× shortens that part to 1.4 seconds. The edited clock is therefore **4.9 seconds**. At 24 fps the delivered file has **118 frames**, or about **4.916667 seconds**. Check the edit plan and encoded frame count separately.

Follow the [retained recipe and prerequisites](../../examples/showcase/edit/README.md) to assemble the actual successful native job, review selected frames, and render all four projects. It needs Bun, FFmpeg/FFprobe, and `rsvg-convert`; the checked SVG lettering is already converted to paths, so rendering it needs no font installation. The [font provenance](../../examples/showcase/edit/ratio-frames/provenance.json) records the original OFL-licensed Nebula Sans source and asset hashes.

These outputs depend on the [static-overlay timing correction](https://github.com/hraness/slopcamera/commit/bd011ec10854d34aacd9a318cacaf5ffb4d52b9d), which keeps the SVG visible through the final frame. Slopcamera v3.3.4 and later releases include it, as does a [current source installation](use-current-source.md); v3.3.1 does not.

### Landscape delivery

The 1280 × 720 composition keeps the full-width product setting and a shallow centered push from 1× to 1.04×. Its title, rule and footer frame the instrument without covering the lens or controls.

[Watch the reviewed example](https://slopcamera.com/docs/how-to/edit-video#landscape-delivery).

### Portrait delivery

The 720 × 1280 composition uses a two-line title and a larger centered view, from 1.6× to 1.664×. The body and lens remain visible; the plinth fades into the lower graphic area intentionally. Inspect this crop independently of the landscape version.

[Watch the reviewed example](https://slopcamera.com/docs/how-to/edit-video#portrait-delivery).

### Square delivery

The 960 × 960 composition uses a single-line title and a 1.25× to 1.3× push. The instrument and readable type fit the square with room for the lower annotation.

[Watch the reviewed example](https://slopcamera.com/docs/how-to/edit-video#square-delivery).

### Feed portrait delivery

The 864 × 1080 composition uses a 1.3× to 1.352× push and a title layout drawn for the 4:5 canvas. Check the outer controls, caption margins and final frame at the delivery size.

[Watch the reviewed example](https://slopcamera.com/docs/how-to/edit-video#feed-portrait-delivery).

The native source is silent. These published previews omit the renderer's silent AAC track after every decoded audio sample was checked and a stream-copy comparison confirmed that all 118 video frames were unchanged. The visible text is authored title and annotation artwork; these examples do not demonstrate timed speech captions or audio synchronization.

The built-in `social-variants` workflow exports one project's composition at several ratios. This recipe authors four compositions explicitly; it does not demonstrate automatic art direction by that workflow.

## Render and inspect the delivery

```sh
slopcamera project render plan <project-id> --width 720 --height 1280 --fps 24 --output renders/portrait.mp4 --json
slopcamera project render run <project-id> --width 720 --height 1280 --fps 24 --output renders/portrait.mp4 --json
```

Render output paths are relative to the project directory. With the default workspace layout, the example writes `artifacts/slopcamera/projects/<project-id>/renders/portrait.mp4`, not a top-level `renders/` directory. The returned invocation includes its full physical path. Inspect the whole edit's picture and sound, caption margins, each cut, and the first and last frames. Check the final duration, dimensions and streams. A successful encode is not evidence that the story or synchronization is correct; record any review you could not perform.

For repeated work, inspect a built-in workflow such as `talking-head-cleanup`, `polished-screen-demo`, `chaptered-demo` or `social-variants`. See [run or recover a workflow](run-workflows.md).

Complete ordinary media edits before [V2 spatial-project migration](../spatial-scenes.md#direct-a-project-through-shots). Its current adapter freezes the media/edit pair and rejects later legacy writers; it is not a general replacement for the ordinary editor.

## Compare color treatments

The [color-finishing guide](https://slopcamera.com/docs/how-to/edit-video#color-finishing) shows warm, cool and monochrome versions of the same six-second film. Run [the retained helper](../../examples/showcase/color/README.md) to reproduce the actual `media color` commands, exact transform receipts and unchanged-source check. A creative grade changes color; it does not establish measured calibration.

The warm treatment retains the brass body, dark controls, and greenish optical glass while warming the body and ground. The cool treatment keeps those material identities with cooler shadows and ambient color. Both preserve the visible lens reflections, bright rim, and separation between the black controls. Monochrome intentionally removes hue while retaining those tonal and reflective differences. This product example does not establish skin-tone accuracy or calibrated color fidelity.

The retained presets resolve to these controls:

| Preset | Contrast | Saturation | Temperature |
| --- | --- | --- | --- |
| `warm` | 1.04 | 1.08 | 0.35 |
| `cool` | 1.05 | 0.96 | -0.35 |
| `mono` (stored as `monochrome`) | 1.10 | 0 | 0 |

Brightness, hue, and tint are zero; gamma is one. Temperature is Slopcamera's normalized control, not Kelvin. The returned receipt includes the exact FFmpeg filter graph used for your run.
