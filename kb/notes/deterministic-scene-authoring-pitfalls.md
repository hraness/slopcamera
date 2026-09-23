---
title: Deterministic scene-authoring pitfalls
type: concept
tags:
  - agents
  - html-overlay
  - rendering
  - threejs
repository_scopes:
  - apps/desktop/html-overlay
  - apps/desktop/cli
---

# Deterministic scene-authoring pitfalls

Chaptered Three.js scenes rendered through the HTML overlay path fail in characteristic ways that are cheap to prevent once recognized. These lessons come from long deterministic scenes — hundreds of draw calls, custom `ShaderMaterial` layers, and a post chain — rendered frame by frame for video output.

## Shader NaN poisons the post chain

GLSL evaluates `pow(x, n)` as `exp2(n * log2(x))`. When `x` is a tiny negative value from floating-point error — `.5 + .5 * cos(...)` can produce `-1e-11` — the result is NaN, not a small dark value. A NaN fragment in a bright pass is then blurred by the bloom mip chain into dark square blotches that look like geometry bugs but are actually math errors. `atan(0, 0)` is undefined at the exact center of a polar shader for the same reason.

Guard every domain edge: `pow(max(0., x), n)` or explicit `x * x`, `atan(y, x + 1e-4)`, `sqrt(max(0., x))`, and clamped inputs to `asin`/`acos`/`log`. When a frame develops unexplained dark tiles, suspect a NaN in an upstream additive or emissive pass before suspecting blending.

## A resolved render is not a presented frame

A frame callback that draws and returns does not guarantee the new surface reached the compositor. Screenshotting immediately after evaluation can capture the previous presented frame under GPU load — observed as a still that shows the prior seek's pixels while the scene state is correct. Waiting two `requestAnimationFrame` callbacks bounds the wait: the draw commits before the first callback and presents before the second. The overlay renderer applies this presentation settle before every frame screenshot so captures are deterministic, not probabilistic.

## Backdrop panels are only honest in their authored view volume

Canvas-painted sky backdrops and haze cards read correctly only from the camera region they were authored for. A camera that pulls back past them shows the panel edge-on as a dark slab floating in the world. Either fade such panels out as the camera leaves the authored range or gate the camera path so it never exposes the edge.

## Additive layers cannot darken

Glow discs, god rays, aurora curtains, and star fields belong on `AdditiveBlending` with `depthWrite:false`. Anything that must occlude — a galaxy's dust lanes, a planet silhouette — needs a separate opaque or normal-blended layer; an additive layer can only ever add light, so "darker than background" is impossible through it.

## Seek-stability is the real deterministic contract

Every animated value must be a pure function of the integer frame time: seeded hash functions for layout randomness, `update(t)` driven from the frame clock, and no `Math.random()`, wall clocks, or accumulated state that depends on evaluation order. The overlay runtime seeks document and tracked animations to the absolute frame time before callbacks, so a scene that also honors the clock produces identical pixels for identical timestamps regardless of render order.

## Discs must face the capturing camera

A procedural disc built in the world XZ plane collapses to a thin band for a camera looking along Z — the classic "the galaxy disappeared" bug. Orient far-space billboards in the view plane (XY facing ±Z for a pull-back camera) and tilt them with an explicit rotation rather than relying on perspective.

## Declare every uniform used

A vertex or fragment shader that reads a uniform it does not declare fails at compile with a terse link-stage error that names no variable. Keeping the `uniform` declarations and the JS `uniforms` object in one glance-adjacent block prevents the whole class of bug.

## Related

- [[notes/documentation-ownership|Documentation ownership]] — this note is pull-based rationale; the executable contracts live in the overlay runtime and renderer tests.
