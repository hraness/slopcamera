# Pin two corners of the cloth

This variation uses the same copper cloth, collider, camera and 40-frame solver
window as `../cloth`. The single changed parameter is `pinBackCorners: true`.
The source gives the two back-corner vertices full pin weights. They stay at
`(±0.8, 0.8, 1.12)` meters while the free edges and center fall over the pedestal.

```sh
bun examples/showcase/native/cloth-pinned.ts \
  --blender-bin /absolute/path/to/blender
```

Use the repository's `mac-native` scheduling lane when available. This trusted
native source runs as the current user. The helper creates separate timestamped
job and artifact directories, preserving any free-cloth bake. The bake limit is
300 seconds and 512 MiB; the fresh replay limit is 900 seconds and 128 MiB. Replay
loads the retained native file and explicit cache files with embedded scripts
disabled, then renders 40 frames at 1280×800 and 24 fps.

The source checks both pinned vertices at every solver frame and fails if any
coordinate moves more than `1e-6` meters. In the retained Blender 5.2.1 LTS
qualification, both pins had exactly zero coordinate displacement across all
40 frames. `qualification.json` records the bake and replay receipt identities
and actual geometry observations. The original free-cloth bake remains a
separate comparison: its corners fall, whereas this version's back edge stays
suspended.

The clip is a short constraint study: exactly 1⅔ seconds of physical solver
frames. Do not stretch it or repeat frames to imply a longer simulation. Pin
coordinates describe the underlying cloth grid; smoothing and fabric thickness
can move the rendered boundary slightly relative to those grid vertices.
