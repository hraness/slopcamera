# An ocean folded from paper

A twelve-second original cut-paper scene: a sealed envelope opens into
stacked ocean layers, folded clouds, gulls, an ochre sun and a breaching whale.
It finishes as a designed print. The whole image is authored in Canvas; the
paper texture, shapes, layer shadows and animation are procedural and local.

The `whale` variant gives the breach a larger silhouette. `quiet` uses a smaller
whale and shifts the sun for a gentler composition. These are named scene
parameters, not separate opaque files.

## Reproduce

Run from the repository root with Bun, the repository dependencies, an accepted
Slopcamera HTML browser runtime and FFmpeg/FFprobe. Python 3 and NumPy are needed
only for the optional original score. Choose fresh output filenames and run IDs.

```sh
python3 examples/showcase/studio-relaunch/last-tram/score.py \
  --film paper-ocean --output artifacts/studio-relaunch/paper-ocean/soundtrack.wav

bun examples/showcase/studio-relaunch/paper-ocean/render.ts \
  --run whale-1080 --variant whale --width 1920 \
  --audio artifacts/studio-relaunch/paper-ocean/soundtrack.wav

bun examples/showcase/studio-relaunch/paper-ocean/render.ts \
  --run whale-print --variant whale --still --time 6 --width 3840
```

The thin wrapper uses the shared native HTML renderer helper in `last-tram/`.
Requests, logs and result metadata live under
`artifacts/studio-relaunch/paper-ocean/<run>/`. The result points to a retained
Slopcamera project, authored source, video and verification receipt. No provider
keys, stock images, samples or network resources are part of the scene.

`scene.html?time=6&variant=whale` is a direct visual proof. For the print, use the
retained native `render/frames/frame-00000000.png` beside the returned video.
It preserves the image before video encoding. The ending composition carries
the film's typeset title; render a still at `--time 11` for that version.

## Direction and review

Brief: a letter becomes an ocean; preserve an edited cream, ochre and deep-teal
palette, plausible stacked paper edges, a strong whale silhouette and gentle
marimba-led movement. Fold edges should explain material rather than add noise.

The score is deterministic additive synthesis, paper-fold noise and sea swells,
with no external samples. Its initial mix measures −15.8 LUFS integrated and
−3.0 dBTP; starts and ends at zero. The score JSON records cue times and explicitly
does not claim perceptual listening. Review actual unfolding, occlusion, whale
entry/exit, title reveal and final hold; a still or waveform is insufficient for
the complete creative admission gate.
