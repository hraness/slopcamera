Every HTML authoring profile in Slopcamera renders through the same contract: one absolute clock, declared assets only, seeded randomness, and a browser whose network access is denied during the render. Because the execution model does not change, choosing a profile is choosing which substrate owns the visible surface, whether that is a DOM tree, a canvas, a retained vector scene, a shader mount, a WebGL scene graph, or an explicit WebGPU pipeline. That choice decides what an agent can still edit after the first frame.

## One render contract under every profile

The render host owns the invariants a profile cannot replace:

- Absolute time. `SlopcameraOverlay.onFrame` receives a frozen frame carrying `frame`, `timeMs`, `deltaMs`, `progress`, `width`, and `height`, and the page never sees a wall clock.
- Declared assets. `SlopcameraOverlay.asset(name)` resolves only declared resources; authored URLs and CDN specifiers are not fetched.
- Seeded entropy. `SlopcameraOverlay.randomFor(key)` supplies stable keyed values, so a frame produces the same pixels whether it is requested first, last, or twice.
- Exact library locks. Each admitted module is one exact version with a verified digest, served through the overlay's private origin. The supported set is the tested locks, not version ranges.
- Isolation. The content security policy forbids dynamic evaluation, external network access is denied during the render, and transparent capture, resource bounds, timeouts, and receipts stay with the host.

Each adapter disables its library's own loop so the Slopcamera clock drives output. Motion animations are paused and seeked, p5 runs `noLoop()` with one awaited `redraw()` per frame, Two.js keeps `autostart: false` with one manual `render()`, Three.js derives scene state from absolute time before rendering once, and Paper Shaders receives `setFrame(timeMs)`. `slopcamera html catalog` lists the seven profiles in recommendation order, and `slopcamera html scaffold <profile> --output <file.html>` writes a starter without replacing an existing file.

## Match the profile to the primary job

Choose the first profile whose primary job matches the work.

| Profile | Substrate | Choose it when |
| --- | --- | --- |
| `plain` | DOM, CSS, SVG, or native Canvas | The subject is text, interface-like composition, semantic markup, or a small canvas drawing, with no library involved. |
| `motion` | DOM and SVG | The subject is still DOM or SVG but needs a seekable entrance, exit, transition, or choreography, through Motion 12.42.2. |
| `p5` | Immediate-mode Canvas 2D | The drawing is recomputed for each requested frame, as in a generative sketch, through p5.js 2.3.2 in instance mode. |
| `two` | Retained vector 2D | Shapes and groups persist as a scene the agent can reason about, rendered by Two.js 0.8.24 through its explicit WebGL renderer. |
| `paper-shaders` | WebGL shader mount | The work is a configurable treatment such as a gradient, grain, texture, or procedural field, through Paper Shaders 0.0.77, not a hand-written GPU pipeline. |
| `three` | WebGL2 scene graph | The work needs cameras, lighting, materials, geometry, or models, through Three.js 0.185.1. |
| `vgpu` | WebGPU | The work itself is an explicit GPU program: WGSL shaders, compute, resources, passes, and one awaited submission per frame, through vgpu 0.3.1. |

The DOM profiles keep content inspectable as markup and typography; they suit titles, cards, lower thirds, and interface-like animation. The 2D drawing profiles differ in persistence: `p5` recomputes its drawing each frame, while `two` retains named vector objects the agent can move between frames. `paper-shaders` and `vgpu` both reach the GPU at opposite levels of explicitness: one mounts a configured treatment, the other makes the pass graph the authored object. An overlay `three` scene is an authored document rendered to frames, which is a different editing contract from the typed scene data described next.

## When the surface is not HTML

An overlay's source is its HTML document, and its output is rendered frames. Some jobs need the editable object itself to be structured data or a native program.

- Choose `slopcamera diagram` when the editable content is objects, labels, and relationships. A version-one JSON source stays beside its five exports, including editable `.tldr` interchange; the [first-diagram tutorial](/docs/tutorials/first-diagram) shows that loop.
- Choose `slopcamera scene` when the scene itself should be inspectable data. A `.scene.json` keeps named entities, stable IDs, and calibrated cameras that agents change through typed patches checked against an expected digest. Its renderer has explicitly selected hardware profiles, `three-webgl2-hardware-v1` on qualified macOS WebGL2-through-Metal contexts and `three-spark-webgl2-hardware-v1` for bounded saved splat worlds, that belong to that surface rather than to overlays. See [render and edit spatial scenes](/docs/how-to/direct-scenes).
- Choose a native engine when the authoring model belongs to Blender, CadQuery, or Manim. Their bundles retain the program and its declared files and run as trusted current-user code on separately installed runtimes. See [author a native film](/docs/how-to/native-films).

Finished renders cross these boundaries freely: exported images and video can be mounted as world-space media in a scene or assembled into a project, while each editable source stays on the surface that owns it.

## Requirements and limits

- Rendering uses the admitted local Chrome runtime and declared assets only. First use may download verified tool dependencies; rendering then runs offline.
- `slopcamera html render` ships in v{{PUBLISHED_VERSION}} and exports H.264 video with optional 48 kHz stereo AAC audio trimmed or padded to the declared duration, retaining a lossless RGB intermediate. Check `slopcamera help html` and `{{DOCTOR_COMMAND}}` on the installed host, and see the [music-video guide](/docs/how-to/music-video) for a complete scene request with a local track.
- Only the exact tested locks execute; a later upstream release changes nothing until it passes admission. p5.js is LGPL-2.1, so conveying its cached artifact carries license obligations, and Paper Shaders is Apache-2.0 with notice preservation.
- Determinism is partly the author's job. Visible state must derive from absolute time, declared parameters and assets, and keyed randomness. Cumulative simulation needs a fixed-step checkpoint and replay model; a `deltaMs` update loop is not absolute seek.
- The `vgpu` overlay profile does not enable shared GPU textures or a Three WebGPU renderer inside the WebGL2 and Spark scene profiles. The separate vgpu native example uses its own provisioned Node/Dawn runtime.
- macOS browser verification uses SwiftShader to prove availability, clock control, transparency, and offline behavior. It makes no claim about hardware GPU throughput; performance needs a controlled measurement on the target hardware and backend.

The [capability reference](/docs/reference/capabilities) records which profiles the installed host supports.
