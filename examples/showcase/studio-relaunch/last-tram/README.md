# Last tram to the moon

A twelve-second illustrated film: a departure board changes to MOON, the copper
tram waits for the bell, then follows an impossible railway to a small lunar
station. Layered city silhouettes, lit passengers, a waiting traveller, scarf,
water tower, rain, distant haze and a tapering railway give the drawing depth.
The final composition holds instead of cutting away mid-action.

This is original procedural **2D Canvas illustration and animation**, rendered
through Slopcamera's retained HTML-scene route. It does not use generated image
assets, stock footage, a 3D engine or an external music service.

## Direct the revision

Original brief:

> Make a midnight tram ride to the moon. Rainy teal city, glowing copper tram,
> carefully drawn passengers and miniature architecture. The departure board
> changes to MOON before the tram leaves. Give it a restrained, original musical
> score and a real ending. Twelve seconds, 16:9.

Consequential revision:

> Give the moon much more presence. Make it feel like the destination the whole
> city has been waiting for. Keep the performance and timing so I can compare.

`original` uses a smaller lunar disc; `moonrise` enlarges that destination while
preserving the scene, score and exact timing. Compare the two at the same time.
Both use a destination bell at 1.55 s, departure at 3.25 s, and a held arrival.
The tram follows the railway's curve, turning with its slope.

## Reproduce the scored film

Run from the repository root. Requires Bun, the repository dependencies,
FFmpeg/FFprobe and a browser runtime accepted by `slopcamera doctor`.
The original audio composer additionally requires Python 3 and NumPy.
Use a fresh audio filename and `--run` token; retained outputs are not overwritten.

```sh
python3 examples/showcase/studio-relaunch/last-tram/score.py \
  --film last-tram --output artifacts/studio-relaunch/last-tram/soundtrack.wav

bun examples/showcase/studio-relaunch/last-tram/render.ts \
  --run original-1080 --variant original --width 1920 \
  --audio artifacts/studio-relaunch/last-tram/soundtrack.wav

bun examples/showcase/studio-relaunch/last-tram/render.ts \
  --run moonrise-1080 --variant moonrise --width 1920 \
  --audio artifacts/studio-relaunch/last-tram/soundtrack.wav
```

The wrapper calls the repository's `html render` CLI and records the request,
intent, log and result under `artifacts/studio-relaunch/last-tram/<run>/`.
The JSON result identifies the retained project, video, source, SHA-256 hashes,
verification and renderer receipt. Inspect a failed result before choosing a
new run; the wrapper never silently retries a partial render.

Add `--dry-run` to inspect a plan. Use `--still --time 6 --width 1920` without
`--audio` for a one-frame proof. The default film width is 1920; choose
`--width 3840` for a larger master or print.

The dependency-light installed-CLI tutorial requests are in the sibling
`requests/` directory. Those visual-only requests intentionally omit the optional
Python score. The source HTML can also be inspected directly with
`?time=6&variant=moonrise`; Slopcamera owns the export clock.

## Prepare the web preview

Keep the native master and its receipt. The site admits previews up to 4 MiB;
the shared derivative recipe uses H.264 CRF 23 with the slow preset, preserves
the frame dimensions and timing, copies the soundtrack, and enables fast start.
It runs through Slopcamera's existing host resource admission.

Set `MASTER_VIDEO` and `MASTER_SHA256` from the `output.path` and `output.sha256`
fields in the render result, then use a fresh derivative run name:

```sh
bun examples/showcase/studio-relaunch/web-preview.ts \
  "$MASTER_VIDEO" "$MASTER_SHA256" tram-original-web
```

Repeat for the moonrise result with a different run name. This recipe accepts
masters up to 1920 × 1080 and fifteen seconds. It retains exact commands,
FFmpeg version, master and derivative hashes, frame and duration checks, a
complete decode check, and a poster at six seconds under
`artifacts/studio-relaunch/web-previews/<run>/`. It rejects an oversized output
or an existing intent. Review the actual web derivative before publishing it.

## Sound and review

`score.py` writes deterministic original stereo 48 kHz PCM: soft electric-piano
partials, suspended minor harmony, seeded rain, wheel joints, traction swell and
an arrival chime. No samples are used. The accompanying JSON records every cue,
sample rate, endpoint values, stereo correlation, peak and RMS.

The initial score measures −16.1 LUFS integrated and −3.0 dBTP with FFmpeg's
EBU R128 meter; both endpoint samples are zero. These are signal measurements,
not a claim that a reviewer listened. Publish only with the review evidence
required by the showcase admission policy. Browser previews must start muted;
sound begins only on a deliberate viewer action.

Review the motion in sequence, especially the board change, first movement,
wheel/rail contacts, passage through the skyline, shrinking perspective and
last held frame. A poster frame alone cannot establish film quality.
