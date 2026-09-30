# Rain, bottled

A fourteen-second fictional advertisement for a tiny weather instrument. A
selector clicks into place; rain gathers beneath a suspended cloud; a contained
flash interrupts the stillness; the instrument settles into its final portrait.

The film uses original procedural geometry, a native volume cloud, deliberate
camera cuts, keyed rain and water rings, studio lights, and an original synthetic
score. The rain is art-directed geometry, not a fluid simulation. Glass uses a
clear surface with Fresnel reflections to keep the miniature weather legible.

## Requirements

This source example requires a **Slopcamera repository checkout** with its Bun
dependencies installed, Blender, Python 3, and FFmpeg. It has no paid provider,
downloaded media, platform font, or network dependency. Instrument Serif is
included under its retained SIL Open Font License and packed into the native
scene. The TTF was converted from the repository's existing Instrument Serif
WOFF2 using FontTools and Brotli; these tools are not needed to render. The film was developed
with Blender 5.2.2 LTS on macOS arm64; native receipts record the actual runtime.
Rendering other Blender versions is not claimed to produce identical pixels.

Follow the repository's native workload admission instructions. Use a verified
Blender runtime through the native adapter. Do not launch a native renderer
outside that adapter or weaken its source and output checks.

## Make the scene

From the repository root, prepare a fresh bounded job:

```sh
bun examples/showcase/studio-relaunch/rain-bottled/prepare.ts hero
```

The helper snapshots the exact source and prints a job path. It **does not start
a render**. Plan, probe, then explicitly run that job with your verified Blender
executable:

```sh
bun apps/desktop/cli/main.ts studio plan "$RAIN_JOB" --json
bun apps/desktop/cli/main.ts studio probe "$RAIN_JOB" --blender-bin "$RAIN_BLENDER" --json
bun apps/desktop/cli/main.ts studio run "$RAIN_JOB" --allow-trusted-code --blender-bin "$RAIN_BLENDER" --json
```

Set `RAIN_JOB` to the printed job path and `RAIN_BLENDER` to the verified Blender
executable. Inspect the receipt and its output paths. Review `hero`, `opener`,
`ending`, and the eight-frame `motion` spike before preparing a complete
`webFilm` (1920 × 1080). This is the public delivery resolution. The optional
`film` job requests 3840 × 2160 for a later higher-resolution export; it is not
a claim about the published master. Both jobs are fourteen seconds at 24 fps. All
jobs retain a native `.blend` snapshot and numbered PNG frames. Fresh job IDs
and fresh output directories preserve earlier attempts.

`masterStill` renders the storm close-up at 4K. `cyclesStill` and `cyclesCpu` are
bounded renderer comparison probes; they do not alter the default film renderer.
Successful capability discovery alone does not qualify an engine for the full
film. Retain failed receipts when a probe fails.

## Direct a consequential revision

> Keep the framing and instrument. Make the rain amber, and make the storm half
> as fierce.

```sh
bun examples/showcase/studio-relaunch/rain-bottled/prepare.ts revision
```

This creates a comparison still at frame 172 from the same scene with
`{"weather":"amber","rainStrength":0.5}`. The original uses
`{"weather":"rain","rainStrength":1}`. The two parameters change rain color,
contained lightning color, and the number of active raindrops and surface rings.
They preserve the scene's camera, edit, geometry, and deterministic seed. The
revision example changes picture; it makes no claim about a different soundtrack.

For a different pace, edit the four shot intervals in `scene.py` and re-time the
sound events in `sound.py`. Frame indexes are zero-based; the canonical job's end
frame is exclusive. Every animation value is baked into ordinary native keys,
so opening the `.blend` does not require Python playback handlers.

## Sound and export

Create a fresh original stereo score:

```sh
python3 examples/showcase/studio-relaunch/rain-bottled/sound.py "$RAIN_SOUNDTRACK"
```

`RAIN_SOUNDTRACK` names a new WAV file. The program writes 48 kHz PCM16 stereo
and a sidecar with peak and RMS measurements. The score includes soft sustained
tones, metal-selector clicks, filtered rain, a short low thunder event, and a
final high droplet. No sampled recording or music service is involved.

For a successful `webFilm` job, assemble and score the film with one fresh run:

```sh
bun examples/showcase/studio-relaunch/rain-bottled/finish.ts "$RAIN_STUDIO_ID" delivery-v1
```

`RAIN_STUDIO_ID` is the successful job ID, not its JSON path. This helper checks
the closed native receipt, creates a fresh score, measures and normalizes it
in two passes toward −16 LUFS and −1.5 dBTP, then uses `studio assemble`,
`project add`, and `project render`. It retains each command/result and the
audio measurements in `artifacts/studio-relaunch/rain-bottled/delivery-v1/`.
The resulting ordinary Slopcamera project keeps picture and sound separately
editable. The returned project path locates `renders/rain-bottled.mp4`.

The score starts at its authored zero offset. The explicit
`--allow-unverified-sync` acknowledges this authored timing; it makes no claim
of measured speech alignment. Review complete playback, then verify the final
14-second, 1920 × 1080, 24 fps file and its audio streams. Retain the PNG masters.
Do not label a render as auditioned based on signal measurements alone. A failed
attempt is retained for inspection and never automatically retried.

## Creative review

Inspect complete playback, the three camera cuts, the cloud silhouette, thin glass
reflections, water-ring continuity, rainfall, the selector, the lightning event,
and the ending. Inspect representative full-size frames, not only a thumbnail
sheet. Record actual listening separately from automated audio measurements.
Keep earlier rejected takes and record why the admitted version improves on
them. Do not promote a merely valid render into the public showcase.
