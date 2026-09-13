An ordinary Slopcamera project is where you revise footage, audio, cuts, camera framing, overlays, and delivery variants while every source stays editable. Start from a stopped recording, an existing project, a retained studio or directing assembly, or, on current source, an authored HTML scene. Ordinary media work needs FFmpeg and FFprobe; `{{DOCTOR_COMMAND}}` reports what this host already has.

## Find or create the project

```sh
{{DOCTOR_COMMAND}}
slopcamera recordings list --json
slopcamera projects list --json
slopcamera project inspect <project-id> --json
```

Use `slopcamera inspect <recording-id> --json` for a recording bundle. If a new recording is the source, create its project:

```sh
slopcamera projects create --from-recording <recording-id> --name "Product demonstration" --json
```

`projects create` is recording-based; there is no `--from-video` flag. Current-source `studio assemble`, `direct assemble`, and `html render` also create ordinary projects. `project add` and the SDK's `media.ingest` import into an existing project only: a collection of arbitrary files cannot create an empty one.

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

## Place overlays without clipping

Project image and video overlays take a position **as an offset from the selected anchor**. For a 720×1280 portrait output, this places a 636×180 caption with 42-pixel side margins:

```sh
slopcamera project edit <project-id> overlay add --kind image --source caption.png \
  --from 0s --to 3s --anchor top-left --position 42,70 \
  --width 636 --height 180 --json
```

To center an overlay, use `--anchor center --position 0,0`. A full-frame still uses a top-left anchor at `0,0` and the output dimensions. Inspect the returned edit and the actual frames where the overlay enters and leaves.

The overlay grammar accepts image, SVG, GIF, video, and checked emoji sources. For an HTML, Three, or WGSL layer in an existing project, render a reviewed document through the `media.htmlOverlay` workflow operation and use the returned video layer. For a complete authored scene with its own new project, use `html render`; [make a music video](/docs/how-to/music-video) shows the pattern with a local soundtrack.

## Render and check the delivery

```sh
slopcamera project render plan <project-id> --width 720 --height 1280 --fps 24 --output renders/portrait.mp4 --json
slopcamera project render run <project-id> --width 720 --height 1280 --fps 24 --output renders/portrait.mp4 --json
```

Render output paths are relative to the project directory. With the default workspace layout, the example writes `artifacts/slopcamera/projects/<project-id>/renders/portrait.mp4`, and the returned invocation carries the full physical path.

Watch the whole edit and listen to it: check caption margins, each cut, the first and last frames, and the final duration, dimensions, and streams. A successful encode is not evidence that the story or the synchronization is correct; record any review you could not perform.

For repeated edits, inspect a built-in workflow such as `talking-head-cleanup`, `polished-screen-demo`, `chaptered-demo`, or `social-variants`; see [run or recover a workflow](/docs/how-to/run-workflows). Complete ordinary media edits before migrating a project to the V2 spatial model: the current adapter freezes the media and edit pair and rejects later legacy writes, so plan media work first and [render and edit spatial scenes](/docs/how-to/direct-scenes) after.
