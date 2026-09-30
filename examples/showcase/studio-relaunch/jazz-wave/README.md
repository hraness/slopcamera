# A square wave auditions for jazz

Five odd harmonics walk into a tiny jazz club. The fundamental brings the bass;
its four odd friends join on saxophone, trumpet, clarinet, and vibraphone. Their
colored sine waves add into a sharper silhouette while an original swung tune
becomes brighter. The performers are a visual metaphor for pure partials, not
recordings or physical models of those instruments.

This is an original twelve-second **Canvas animation with synthesized music**,
rendered through Slopcamera's local HTML host. It is not a Manim render or a
recording of a jazz performance. Geometry, typography, phase, choreography and
music remain independently editable. A [visual transcript](transcript.md) describes
each entrance and preserves the equation as text.

## Make the film

From the repository root, with Bun 1.3.14, Slopcamera's qualified local HTML
runtime, FFmpeg and Python 3 with NumPy:

```sh
python3 examples/showcase/studio-relaunch/jazz-wave/score.py --output artifacts/studio-relaunch/jazz-wave/my-score/score.wav
bun examples/showcase/studio-relaunch/jazz-wave/verify.ts
bun examples/showcase/studio-relaunch/jazz-wave/render.ts --still --width 1920 --time 9.25 --run my-proof --dry-run
bun examples/showcase/studio-relaunch/jazz-wave/render.ts --still --width 1920 --time 9.25 --run my-proof
bun examples/showcase/studio-relaunch/jazz-wave/render.ts --width 1920 --run my-film --audio artifacts/studio-relaunch/jazz-wave/my-score/score.wav --dry-run
bun examples/showcase/studio-relaunch/jazz-wave/render.ts --width 1920 --run my-film --audio artifacts/studio-relaunch/jazz-wave/my-score/score.wav
```

The published film is 1920 × 1080. `--width 3840` can render the same retained
vector geometry at 4K for another delivery.

The helper preserves fresh requests, intents, logs and returned results under
`artifacts/studio-relaunch/jazz-wave/`. A failed attempt is retained for diagnosis;
choose a new run only after reconciling the old one. Slopcamera's returned paths
identify the retained source, lossless scene, delivery, project and receipts.
Local font files are declared and copied into the retained render; no remote
fonts, stock music, models or provider calls are involved.

## Keep the explanation true

The displayed oscillator and lead voice use:

```text
s(theta,t) = (4/pi) * sum[k=0..4] g_k(t) * sin((2k+1)*theta)/(2k+1)
```

The partials arrive at 0, 2, 4, 6 and 8 seconds. Each new `g_k` smoothly rises from
0 to 1 over 0.32 seconds. Settled amplitudes therefore follow `1, 1/3, 1/5, 1/7,
1/9`, with the `4/pi` scale setting the square wave's plateau convention to ±1.
No per-state peak normalization or clipping is applied. Five settled partials
reach about **1.182328**, so the overshoot is real and visible. A finite sum is an
approximation; it never becomes an exact square wave.

`verify.ts` evaluates the actual scene script at 8,192 phase samples per settled
state, independently recovers its Fourier coefficients, rejects even harmonics
and DC, checks odd symmetry, and requires the overshoot. `score.py` uses the same
formula for the lead before its musical envelope. The animation shows that lead
oscillator at one pitch, not an oscilloscope trace of the full mix. Walking bass,
piano stabs, brushes and short room reflections accompany it.

## Direct a revision

> Keep the notes, equation and entry times. Make the band a nocturnal radio show:
> deep blue stock, pale pink ink, a slower camera drift, and quieter brushed drums.
> Preserve the ±1 guides and the overshoot.

The musical phrase, color directions, character silhouettes, pacing and text can
change without altering the mathematical claim. A new renderer or geometry
change requires fresh visual review. Signal facts are written beside the WAV;
a `listened: false` field stays false until someone actually reviews playback.

Original scene, composition and helper source follow the repository MIT license.
Nebula Sans and Instrument Serif each use their retained SIL Open Font License.
Include both families’ font files and license records in source closure when
publishing the example.
