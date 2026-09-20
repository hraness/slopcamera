Use `slopcamera html render` to turn authored HTML, SVG, Canvas, shaders, or Three.js into a video while retaining the document, assets, render request, and an editable project. All seven HTML profiles ship in v{{PUBLISHED_VERSION}}; each needs its admitted local browser and FFmpeg/FFprobe. The source files below were authored later and live in the current repository.

For a first guided render, use [Create and revise your first animation](/docs/tutorials/first-animation). This guide assumes an installed CLI, a chosen graphic, and a current repository checkout containing `examples/showcase/html/`. Run commands from that checkout's root so resource paths resolve correctly.

## Choose a source for the graphic

Use the simplest profile that owns the visual decisions you need. The [motion atlas](https://github.com/hraness/slopcamera/tree/main/examples/showcase/html) contains original sources and render requests:

| Graphic | Profile | Supplied request and technique |
| --- | --- | --- |
| Editorial title | HTML/SVG | [editorial.json](https://github.com/hraness/slopcamera/blob/main/examples/showcase/html/editorial.json): typography and animated SVG ellipses; a second request changes the copy and ink |
| Kinetic typography | Motion | [kinetic-title.json](https://github.com/hraness/slopcamera/blob/main/examples/showcase/html/kinetic-title.json): seeked text reveals and staggered bars |
| Procedural drawing | p5 | [contour-drift.json](https://github.com/hraness/slopcamera/blob/main/examples/showcase/html/contour-drift.json): contours redrawn from absolute time |
| Vector choreography | Two.js | [orbital-assembly.json](https://github.com/hraness/slopcamera/blob/main/examples/showcase/html/orbital-assembly.json): retained circles arranged in named orbits |
| Shader background | Paper Shaders | [living-colour.json](https://github.com/hraness/slopcamera/blob/main/examples/showcase/html/living-colour.json): a time-controlled color field beneath type |
| Custom GPU field | vgpu | [interference-field.json](https://github.com/hraness/slopcamera/blob/main/examples/showcase/html/interference-field.json): an authored full-screen WGSL pass |
| 3D scene with music | Three.js | [island-pulse.json](https://github.com/hraness/slopcamera/blob/main/examples/showcase/html/island-pulse.json): an articulated robot, island, and declared musical clock |
| Lower third | HTML/SVG | [lower-third.json](https://github.com/hraness/slopcamera/blob/main/examples/showcase/html/lower-third.json): a transparent source, previewed over a colored plate |

These are different authoring tools inside one export workflow. The Three.js example uses named rigid joints; it does not demonstrate imported skinning or a physical simulation. The vgpu browser profile renders raster frames; it does not share GPU textures with Three.js. [Choose an HTML authoring surface](/docs/explanation/html-authoring) covers those boundaries in detail.

## Inspect the profile and request

```sh
slopcamera doctor --json
slopcamera html catalog --json
slopcamera help html
slopcamera html render --input examples/showcase/html/editorial.json --dry-run --json
```

Inspect the request's document path, `canvas`, `timing`, library selection, and declared resources. Copy a request before changing it. Keep the document inside the workspace and supply every image, font, or other asset through its resource declarations; the renderer does not grant ambient network access to a page.

Use `SlopcameraOverlay.onFrame` to derive every frame from the supplied absolute time. A minimal pattern is:

```js
SlopcameraOverlay.onFrame(({ timeMs }) => {
  const seconds = timeMs / 1000;
  const angle = Math.sin(seconds) * 12;
  document.querySelector("#title").style.transform = `rotate(${angle}deg)`;
});
```

Register the callback when the module starts. Put asynchronous asset preparation in the promise passed to `SlopcameraOverlay.ready(...)`. Do not advance animation by wall-clock delays or by counting previous callbacks: a renderer can request a frame independently. The supplied scaffolds demonstrate each library's time and readiness contract.

## Render and retain the result

```sh
slopcamera html render --input examples/showcase/html/editorial.json --json
```

The result includes `output.path` for H.264 video, `source.path` for the retained request, `receipt.path`, and `projectId`. Rendering also retains a lossless RGB intermediate and the exact HTML/assets. Each invocation creates its own result; keep the receipt with the source revision you reviewed.

Inspect the output at its intended display size. Check text legibility, edges, first and last frames, motion continuity, and any source-specific details such as shader output or character articulation. A successful receipt records execution; your review decides whether the graphic is useful.

To revise copy, palette, or timing, change parameters supported by the document or edit the HTML, then render a new request. [editorial-revised.json](https://github.com/hraness/slopcamera/blob/main/examples/showcase/html/editorial-revised.json) changes copy and accent while retaining the original source. Keep the selected result's `projectId` for [editing and delivery](/docs/how-to/edit-video).

## Add music or an overlay

For the island source, create its original procedural soundtrack before rendering:

```sh
python3 examples/showcase/html/synth-island.py
slopcamera html render --input examples/showcase/html/island-pulse.json --json
```

This needs Python 3. Its eight-second, four-bar phrase uses a declared 120 BPM clock. The scene retains the soundtrack separately from the rendered visuals. Declared beat timing and audio-reactive band envelopes are different inputs; [Make a music video](/docs/how-to/music-video) explains how to use either with your own local track.

For a transparent lower third, use the [lower-third HTML](https://github.com/hraness/slopcamera/blob/main/examples/showcase/html/lower-third.html) through the SDK's `workflow.media.htmlOverlay` in an existing project. The page leaves its background transparent, but the supplied scene request sets a colored preview plate. Its H.264 output does not carry alpha. Inspect the final composite over the destination footage; use [Run or recover a workflow](/docs/how-to/run-workflows) for workflow execution and [SDK surfaces](/docs/reference/sdk) for the local import boundary.

## Animate type with Motion

::example[kinetic-title]

Use a seeked timeline for reveals, holds and exits. Edit the text or the timing in `kinetic-title.html`, then render `kinetic-title.json`. The long hold keeps the title readable before its exit.

## Draw procedural contours

::example[contour-drift]

Use p5 when each frame is a fresh drawing. The source redraws 72 contours from the requested time; changing the contour count or deformation changes the composition without storing a separate frame history.

## Choreograph vector shapes

::example[orbital-assembly]

Use Two.js when persistent vector objects make the scene easier to revise. Sixty circles follow five orbits. Change their radii, color or phase in the source, while keeping the supplied absolute-time callback.

## Shape a shader background

::example[living-colour]

Use Paper Shaders for a procedural color and grain treatment behind type. The supplied source controls shader time directly. Keep text contrast readable throughout the moving field when changing its palette.

## Write a WGSL field

::example[interference-field]

Use vgpu for a custom GPU pass with explicit shader resources. The example draws two moving interference sources beneath a grid and title. It produces ordinary video frames; it does not share live GPU textures with another profile.

## Compose a transparent lower third

::example[lower-third]

The title enters, holds and leaves over a colored preview plate. To use the source's transparent background, render it through `workflow.media.htmlOverlay` and inspect the returned overlay over your destination footage. The published MP4 demonstrates the opaque preview; it does not demonstrate alpha delivery.

## Resolve a failed render

Read the reported stage and keep its retained source and error evidence. A missing runtime needs the matching `doctor` fix; an undeclared resource needs a corrected request. If the lossless intermediate reaches the media-size bound, reduce resolution, frame rate, or duration. A dry run alone does not qualify a browser or GPU profile. Preserve the failing request before trying a reduced reproduction.
