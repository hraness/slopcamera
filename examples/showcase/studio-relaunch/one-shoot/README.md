# One shoot, three films

Turn a NASA eclipse time-lapse into three 12-second edits: a monochrome film,
a vertical composition with a pulse, and a narrated explanation of the corona.
The brief is to change the pacing, typography, crop, and sound while keeping
the same astronomical event recognizable.

The [recipe](render.ts) combines SlopCamera's local `media color` operation
with FFmpeg cuts, overlays, and audio mixing. It writes its own synthesized
scores and uses the bundled Instrument Serif font. The original footage and
its audio are described in [Footage credit and usage](footage-credit.md).

## Prepare the inputs

Use a [source checkout](../../../../docs/how-to/use-current-source.md) with its
locked dependencies, Bun 1.3.14 or newer, and `ffmpeg` and `ffprobe` on `PATH`.
FFmpeg needs the `libx264`, AAC, and WebP encoders. Run on macOS or Linux; the
recorded production run used macOS. The local color operation does not support
native Windows. This recipe needs neither Python nor a browser.

Run commands from the repository root. Download NASA's large MP4 if you don't
already have it at this path:

```sh
mkdir -p artifacts/studio-relaunch/one-shoot/source
if [ ! -e artifacts/studio-relaunch/one-shoot/source/nasa-eclipse.mp4 ]; then
  curl --fail --location \
    'https://images-assets.nasa.gov/video/TIME%20WARP%20TOTAL%20SOLAR%20ECLIPSE%20TIMELAPSE_HD/TIME%20WARP%20TOTAL%20SOLAR%20ECLIPSE%20TIMELAPSE_HD~large.mp4' \
    --output artifacts/studio-relaunch/one-shoot/source/nasa-eclipse.mp4
fi
```

The helper checks the [recorded SHA-256](footage-credit.md#source-file) before
rendering and again afterward. A different file stops the run. If NASA changes
the asset, inspect it and update the recipe deliberately before rendering.

For all three cuts, supply a narration file. Record [narration.txt](narration.txt)
or use the [speech-generation guide](../../../../docs/how-to/generate-media.md).
Save it as `artifacts/studio-relaunch/one-shoot/narration.wav`. The recording must
contain audio, last at most 11.5 seconds, and leave room for its entrance at
0.5 seconds. The helper checks this duration before encoding.

The recorded explainer uses separately generated OpenAI `tts-1-hd` speech,
voice `nova`, through Vercel AI Gateway. That WAV is an input to the recipe and
is not included in the source. Using your own recording requires no model
account; generating a replacement uses your provider account and incurs its
model charges. The rendering command makes no provider call.

## Render the edits

Choose a fresh run name containing lowercase letters, digits, or hyphens,
starting with a letter or digit, and at most 64 characters long:

```sh
bun examples/showcase/studio-relaunch/one-shoot/render.ts \
  artifacts/studio-relaunch/one-shoot/source/nasa-eclipse.mp4 \
  eclipse-three-a \
  artifacts/studio-relaunch/one-shoot/narration.wav
```

Omit the final argument to render only the cinematic and vertical cuts. The
two local scores are created in either case. FFmpeg edits wait for available
CPU, disk, and encode capacity through SlopCamera's resource coordinator; the
color command handles its own resource request.

The command prints the output directory and video paths. For the command above,
open `artifacts/studio-relaunch/one-shoot/eclipse-three-a/`:

| File | Treatment |
| --- | --- |
| `cinematic.mp4` | 1920 × 1080, source seconds 15–75 compressed to 12 seconds, the `mono` grade, an entering title, and a quiet score. |
| `vertical.mp4` | 720 × 1280, the same accelerated passage cropped square inside a vertical canvas, with separate typography and a pulsing score. |
| `explainer.mp4` | 1920 × 1080, source seconds 33–69 compressed to 12 seconds, a corona label, supplied narration, and a quieter music bed. |

All cuts use 24 fps, H.264 picture, and 48 kHz stereo AAC sound. The source is
already a time-lapse; these additional speed changes do not show real-time
motion. Its original audio is replaced by the new scores and narration.

Each cut also gets a WebP poster. The directory keeps the intermediate picture,
PNG overlays, score WAVs, command logs, probe results, and `lineage.json` with
source, recipe, font, and output hashes. `mono-grade.json` records the separate
SlopCamera color output. A reused run name fails instead of replacing an earlier
run; inspect its logs and choose a new name after fixing a failure.

## Direct another version

> Keep the eclipse, but make the vertical cut quiet and contemplative. Remove
> the pulse, delay the title, and hold the last clear view.

Edit the crop, overlay, score, or timing in `render.ts`, then use a new run name.
Watch each complete encode with sound, check the portrait crop at phone size,
and make sure the narration finishes naturally. Keep the separate
[English captions](captions.vtt) synchronized if you change the voice or timing;
the helper does not embed or generate captions. The footage credit must travel
with published edits. Recipe code and original scores use the repository's MIT
license; the font uses its [SIL Open Font License](../rain-bottled/assets/instrument-serif-OFL.txt).
