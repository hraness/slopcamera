Slopcamera's video pipeline is a local project compositor over FFmpeg and FFprobe. A project keeps original media immutable beside typed edit decisions, analysis evidence, and delivery variants, so preview and final renders evaluate the same timeline and composition. Neither the released nor current CLI captures new recordings: projects start from an existing finished recording bundle, a studio or directing assembly, or an authored HTML scene render.

## Projects and inputs

```sh
slopcamera recordings list --json
slopcamera projects create --from-recording <recording-id> --name "Product demonstration" --json
slopcamera project add <project-id> camera.mov --role camera --json
slopcamera project add <project-id> narration.wav --role dialogue --at 0us --json
```

`--role` names the placement's job: screen, camera, b-roll, system-audio, microphone, portable-audio, music, or dialogue. Imported synchronization starts unverified; when two sources recorded the same event, `slopcamera align analyze` and `align apply` measure and apply the exact returned alignment. Declared timing alone is not synchronization evidence, and a delivery that intentionally uses it needs `--allow-unverified-sync`, which marks the receipt as provisional.

Every source maps into one checked project clock in integer microseconds while retaining native timestamps. Media assembly uses verified video spans, so container audio padding cannot introduce a black frame at a cut.

## Edits

Structural edits are typed, bounded, non-destructive transforms in project time:

```sh
slopcamera project edit <project-id> trim 0s 16s --json
slopcamera project edit <project-id> cut 4s 5s --json
slopcamera project edit <project-id> speed 4s 5.75s 1.25 --json
slopcamera project edit <project-id> overlay add --kind image --source caption.png --from 0s --to 3s --anchor top-left --position 42,70 --width 636 --height 180 --json
```

The `project edit` family covers trim, cut, speed, camera moves, zoom, overlays, and cursor, clicks, keystrokes, and typed-text emphasis that need recording-backed metadata. Overlay positions are offsets from a named anchor, and overlay sources include images, SVG, GIF, video, and checked emoji.

`slopcamera media audio` and `slopcamera media color` produce separate typed treatment derivatives rather than `project edit` filters. The color presets resolve to recorded constants (`warm`, `cool`, `mono`), and the receipt carries the exact FFmpeg filter graph, so a grade never touches the original file.

## Analysis

Local analysis informs editing decisions and stays on the machine by default:

- `analyze faces` runs a signed local Vision helper and persists geometry and continuity IDs only, never identity, names, crops, or cloud requests. Face camera moves bind that immutable analysis to a selected track and output aspect.
- `analyze inactivity`, `analyze zooms`, `analyze music`, and `analyze speech` support gap removal, cursor-aware framing, music protection, and spoken-word cleanup; `fillers list` and `fillers apply` work the filler-word path.
- `analyze scenes` is the exception: it uploads selected bounded frames to the Gateway and requires `--allow-cloud-upload`.

## Delivery

`slopcamera project render plan` and `project render run` evaluate the complete authored timeline at preview or final quality. Delivery variants cover 16:9, 9:16, 1:1, and 4:5, with clean and captioned cuts from one edit; captions are composable project inputs, and HTML overlays enter a project through the `media.htmlOverlay` workflow operation. Ready work is bounded by resource claims, and expensive encodes serialize by default.

A successful preview exercises the timeline but is not creative acceptance: inspect final dimensions, frame count, color, sound, and first and last frames before delivery. Receipts name the source, plan, runtime, and output identities of each operation.

For the walkthrough, see [Edit and deliver video](/docs/how-to/edit-video). [Capabilities](/docs/reference/capabilities) records the runtime requirements.
