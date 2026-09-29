# Derive a soundtrack beat grid

Use this workflow when a music video or timed HTML scene has a Soundfish score
or a Standard MIDI file, and the scene needs the track's tempo, meter and
section cue times. Slopcamera bundles the Soundfish library at one exact version
to read scores. It renders no audio: pair the grid with the audio file the user
mixes or supplies.

## Supported sources

One local file of at most 1 MiB, detected from its content or set with
`--format`:

- `compose`: Soundfish compose text for one loop.
- `song`: Soundfish song text with named sections.
- `json`: a Soundfish loop or song document.
- `midi`: a Standard MIDI file with one constant tempo and meter.

To write or edit scores, install the `@hraness/soundfish` package and use its
own agent skill. Slopcamera does not bundle that skill.

## Verify a score

```sh
slopcamera media soundtrack compose music/hook.song --json
slopcamera media soundtrack compose music/hook.song --output music/hook.json
```

`compose` parses and verifies the score and reports its canonical digest, kind
(loop or song), tempo, beats per bar, bars and duration. `--output` writes the
verified score document as `.json`. Report any warnings the receipt carries.

## Derive the grid

```sh
slopcamera media soundtrack grid music/hook.song --start-us 500000 \
  --output music/hook.grid.json --json
```

The receipt's `music` object is exactly the `{ "bpm", "beatOffsetUs",
"beatsPerBar" }` shape an HTML scene request accepts under
`parameters.music`. `--start-us` is the timeline microsecond where the first
beat lands; it defaults to `0`. Each section carries its label, repeat, bars,
beats and `startUs`/`endUs` cue times on the same timeline.

- Cue times are whole microseconds and never drift more than half a microsecond
  from the beat they name.
- Sections tile the score from `beatOffsetUs` to `endUs` with no gaps.
- The same score always yields the same digest and grid.

Use the grid in [music videos](music-video.md): copy `music` into the scene
request and use the section cues for shot changes. Set `timing.durationUs` from
the audio file, not only from the grid, because a mixed track can have a
different tail.

The same reads are available as the `compose_soundtrack` and
`derive_soundtrack_grid` MCP tools with root-relative paths, and as the
`slopcamera.soundtrack.compose` and `slopcamera.soundtrack.grid` operations.
