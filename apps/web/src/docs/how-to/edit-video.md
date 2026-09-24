An ordinary Slopcamera project is where you revise footage, audio, cuts, camera framing, overlays, and delivery variants while every source stays editable. Start from an existing finished recording bundle, an existing project, a retained studio or directing assembly, or an authored HTML scene. Ordinary media work needs FFmpeg and FFprobe; `{{DOCTOR_COMMAND}}` reports what this host already has.

Neither the released nor current CLI captures new recordings. These commands consume existing finished bundles or projects. Cursor and input-aware effects require the matching recording metadata.

## Find or create the project

```sh
{{DOCTOR_COMMAND}}
slopcamera recordings list --json
slopcamera projects list --json
slopcamera project inspect <project-id> --json
```

Use `slopcamera inspect <recording-id> --json` for a recording bundle. If an existing finished recording bundle is the source, create its project:

```sh
slopcamera projects create --from-recording <recording-id> --name "Product demonstration" --json
```

`projects create` is recording-based; there is no `--from-video` flag. The released `studio assemble`, `direct assemble`, and `html render` commands also create ordinary projects. `project add` and the SDK's `media.ingest` import into an existing project only: a collection of arbitrary files cannot create an empty one.

## Import and place the media

```sh
slopcamera project add <project-id> camera.mov --role camera --json
slopcamera project add <project-id> narration.wav --role dialogue --at 0us --json
```

`--role` names the placement's job (screen, camera, b-roll, system-audio, microphone, portable-audio, music, dialogue, or other), and `--at` sets its project start time. Read the imported placement and stream IDs from `project inspect`.

Imported synchronization starts unverified. When two sources recorded the same event, analyze the chosen reference and target audio streams, inspect the evidence, and apply the exact returned alignment:

```sh
slopcamera help align
slopcamera align analyze <project-id> --reference <asset:stream> --target <asset:stream> --json
```

For an authored montage, `--at` declares placement time; it is not evidence that independently recorded streams are synchronized. If a delivery intentionally uses declared timing, pass `--allow-unverified-sync` on the render and treat its receipt as provisional.

## Edit in project time

Structural cuts, trims, and speed changes use project time and affect all placements:

```sh
slopcamera project edit <project-id> trim 0s 16s --json
slopcamera project edit <project-id> cut 4s 5s --json
```

Those are separate decisions; apply only the edit the footage needs. `slopcamera help project` lists the full grammar: camera moves address a placed video stream, and cursor, window, and focused-input zooms need recording-backed metadata.

Choose evidence before editing. Local face analysis supports framing, speech and filler analysis supports spoken-word cleanup, music analysis protects music during cuts, and inactivity analysis finds long gaps. Scene descriptions are the exception: they upload selected frames to the Gateway and require their acknowledgement. `slopcamera media audio` and `slopcamera media color` produce typed local treatment derivatives; they are separate command families, not `project edit` filters.

## Color finishing

These three treatments start from the same [native product film](/docs/tutorials/first-native-film), with the same six-second clock and camera move. The local `media color` command writes a separate movie and a receipt containing the source hash and exact filter graph.

```sh
slopcamera media color product.mp4 --preset warm --output grades/warm.mp4 --json
slopcamera media color product.mp4 --preset cool --output grades/cool.mp4 --json
slopcamera media color product.mp4 --preset mono --output grades/mono.mp4 --json
```

Use the returned `output.path`: relative paths resolve beneath the generated-media root. Compare the brass, glass highlights and dark housing before choosing a treatment. A creative grade changes product color; it is not color calibration. The [reproduction helper](https://github.com/hraness/slopcamera/tree/main/examples/showcase/color) checks that the original's SHA-256 remains unchanged after all three treatments.

The warm treatment retains the brass body, dark controls, and greenish optical glass while warming the body and ground. The cool treatment keeps those material identities with cooler shadows and ambient color. Both preserve the visible lens reflections, bright rim, and separation between the black controls. Monochrome intentionally removes hue while retaining those tonal and reflective differences. This product example does not establish skin-tone accuracy or calibrated color fidelity.

The retained presets resolve to these controls:

| Preset | Contrast | Saturation | Temperature |
| --- | --- | --- | --- |
| `warm` | 1.04 | 1.08 | 0.35 |
| `cool` | 1.05 | 0.96 | -0.35 |
| `mono` (stored as `monochrome`) | 1.10 | 0 | 0 |

Brightness, hue, and tint are zero; gamma is one. Temperature is Slopcamera's normalized control, not Kelvin. The returned receipt includes the exact FFmpeg filter graph used for your run.

::example[color-warm]

::example[color-cool]

::example[color-mono]

Add the chosen derivative to an existing project with `project add --role b-roll`, then place it at the intended time. Keep the original and receipt so another edit can use a different grade without grading an already-treated file again.

## Place overlays without clipping

Project image and video overlays take a position **as an offset from the selected anchor**. For a 720×1280 portrait output, this places a 636×180 caption with 42-pixel side margins:

```sh
slopcamera project edit <project-id> overlay add --kind image --source caption.png \
  --from 0s --to 3s --anchor top-left --position 42,70 \
  --width 636 --height 180 --json
```

To center an overlay, use `--anchor center --position 0,0`. A full-frame still uses a top-left anchor at `0,0` and the output dimensions. Inspect the returned edit and the actual frames where the overlay enters and leaves.

The overlay grammar accepts image, SVG, GIF, video, and checked emoji sources. For an HTML, Three, or WGSL layer in an existing project, render a reviewed document through the `media.htmlOverlay` workflow operation and use the returned video layer. For a complete authored scene with its own new project, use `html render`; [make a music video](/docs/how-to/music-video) shows the pattern with a local soundtrack.

::example[premiere-wall]

This eight-second composite mounts the reviewed Island Pulse film on a cinema-wall screen, the reviewed Interference Field poster as a print, and an editable `premiere-diagram.diagram.json` board inside one smootherstep camera push finished with grain and vignette. Its [checked-in wall, diagram, and script](https://github.com/hraness/slopcamera/tree/main/examples/showcase/workflows) reproduce the film through the diagram and FFmpeg pipelines.

## Directed delivery variants

These four compositions start from the same six-second native product film. Each is a separate ordinary project with its own camera framing and SVG title layout. The retained recipe applies the same timing edit to each project:

```sh
slopcamera project edit <project-id> trim 0.25s 5.75s --json
slopcamera project edit <project-id> cut 2.5s 2.75s --json
slopcamera project edit <project-id> speed 4s 5.75s 1.25 --json
```

These times address the original project clock. Trimming keeps 5.5 seconds; the cut removes 0.25 seconds; speeding the last 1.75 seconds to 1.25× shortens that part to 1.4 seconds. The edited clock is therefore **4.9 seconds**. At 24 fps the delivered file has **118 frames**, or about **4.916667 seconds**. Check the edit plan and encoded frame count separately.

Follow the [retained recipe and prerequisites](https://github.com/hraness/slopcamera/tree/main/examples/showcase/edit) to assemble the actual successful native job, review selected frames, and render all four projects. It needs Bun, FFmpeg/FFprobe, and `rsvg-convert`; the checked SVG lettering is already converted to paths, so rendering it needs no font installation. The [font provenance](https://github.com/hraness/slopcamera/blob/main/examples/showcase/edit/ratio-frames/provenance.json) records the original OFL-licensed Nebula Sans source and asset hashes.

These outputs depend on the [static-overlay timing correction](https://github.com/hraness/slopcamera/commit/bd011ec10854d34aacd9a318cacaf5ffb4d52b9d), which keeps the SVG visible through the final frame. Slopcamera v3.3.4 and later releases include it, as does a [source installation](/docs/how-to/install-from-source); v3.3.1 does not.

### Landscape delivery

The 1280 × 720 composition keeps the full-width product setting and a shallow centered push from 1× to 1.04×. Its title, rule and footer frame the instrument without covering the lens or controls.

::example[edit-directed-landscape]

### Portrait delivery

The 720 × 1280 composition uses a two-line title and a larger centered view, from 1.6× to 1.664×. The body and lens remain visible; the plinth fades into the lower graphic area intentionally. Inspect this crop independently of the landscape version.

::example[edit-directed-portrait]

### Square delivery

The 960 × 960 composition uses a single-line title and a 1.25× to 1.3× push. The instrument and readable type fit the square with room for the lower annotation.

::example[edit-directed-square]

### Feed portrait delivery

The 864 × 1080 composition uses a 1.3× to 1.352× push and a title layout drawn for the 4:5 canvas. Check the outer controls, caption margins and final frame at the delivery size.

::example[edit-directed-feed-portrait]

The native source is silent. These published previews omit the renderer's silent AAC track after every decoded audio sample was checked and a stream-copy comparison confirmed that all 118 video frames were unchanged. The visible text is authored title and annotation artwork; these examples do not demonstrate timed speech captions or audio synchronization.

The built-in `social-variants` workflow exports one project's composition at several ratios. This recipe authors four compositions explicitly; it does not demonstrate automatic art direction by that workflow.

## Render and check the delivery

```sh
slopcamera project render plan <project-id> --width 720 --height 1280 --fps 24 --output renders/portrait.mp4 --json
slopcamera project render run <project-id> --width 720 --height 1280 --fps 24 --output renders/portrait.mp4 --json
```

Render output paths are relative to the project directory. With the default workspace layout, the example writes `artifacts/slopcamera/projects/<project-id>/renders/portrait.mp4`, and the returned invocation carries the full physical path.

Watch the whole edit and listen to it: check caption margins, each cut, the first and last frames, and the final duration, dimensions, and streams. A successful encode is not evidence that the story or the synchronization is correct; record any review you could not perform.

For repeated edits, inspect a built-in workflow such as `talking-head-cleanup`, `polished-screen-demo`, `chaptered-demo`, or `social-variants`; see [run or recover a workflow](/docs/how-to/run-workflows). Complete ordinary media edits before migrating a project to the V2 spatial model: the current adapter freezes the media and edit pair and rejects later legacy writes, so plan media work first and [render and edit spatial scenes](/docs/how-to/direct-scenes) after.
