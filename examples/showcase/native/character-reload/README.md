# Reload the native character

The native character is a retained Blender file, including its nine-bone rig,
weighted sleeve, IK controls, facial shapes and animation. This companion check
opens that file in fresh processes with embedded scripts disabled. It does not
rebuild the character from `character/scene.py`.

First run the character example with `render.ts`. Then use the same supported
Blender runtime and a Python environment containing NumPy and Pillow:

```sh
bun examples/showcase/native/character-reload.ts \
  --blender-bin /absolute/path/to/blender \
  --python-bin /absolute/path/to/python
```

On hosts with the repository scheduler, wrap the command in the `mac-native`
lane. It creates a new timestamped artifact directory and four bounded studio
jobs: one frame each at 0, 72 and 143, then an inspection job. Each job has a
120-second limit and a 32 MiB output limit. The comparison requires the same
render settings and environment as the original film.

The inspector verifies exact bone names, the right arm's nonstretch two-bone IK
chain and target/pole, normalized skin weights, and the Smile, MouthOpen,
JawOpen and Blink shape identities. Evaluated sleeve coordinates must change
between the first and middle samples. The image comparison checks all RGB
components in the three original/reloaded pairs; it fails if mean absolute
difference exceeds 0.5 code values or more than 0.1% of components differ by
more than 8 values.

The retained qualification used Blender 5.2.1 LTS with Cycles Metal. All three
samples differed by at most one RGB code value. The weighted sleeve retained
400 vertices, including 64 vertices blending two bones, with maximum weight
sum error below `3e-8`. The runtime receipts and measurements are summarized in
`qualification.json`. These are sampled reload results, not a guarantee of
byte-identical renders across GPU models or Blender versions. This character
does not have the complete 19-bone humanoid mapping required by other workflows.

The existing published film and its original source manifest remain unchanged.
