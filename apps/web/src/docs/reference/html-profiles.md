Slopcamera renders an authored HTML document to frames and video through `slopcamera html`. Seven named profiles admit exactly one tested library lock each; every profile shares the same deterministic render contract, so the choice is which substrate owns the visible surface. Rendering ships in the verified release and needs the admitted local Chrome runtime plus FFmpeg and FFprobe.

## The shared render contract

Every profile runs under host-owned invariants that a library cannot replace:

- One absolute clock. `SlopcameraOverlay.onFrame` receives a frozen frame carrying `frame`, `timeMs`, `deltaMs`, `progress`, `width`, and `height`. The page never sees a wall clock, and a renderer can request any frame independently.
- Declared assets only. `SlopcameraOverlay.asset(name)` resolves resources named in the request; authored URLs and CDN specifiers are not fetched, and ambient network access is denied during the render.
- Seeded entropy. `SlopcameraOverlay.randomFor(key)` returns stable keyed values, so a frame produces the same pixels whether it is requested first, last, or twice.
- Exact locks. Each admitted module is one exact version with a verified digest, served through the overlay's private origin. A later upstream release changes nothing until it passes admission.
- Async readiness. `SlopcameraOverlay.ready(promise)` holds the first frame until declared preparation settles.

Each adapter disables its library's own loop: Motion animations are paused and seeked, p5 runs `noLoop()` with one awaited `redraw()` per frame, Two.js keeps `autostart: false` with one manual `render()`, Three.js derives scene state from absolute time before rendering once, and Paper Shaders receives `setFrame(timeMs)`.

## The seven profiles

| Profile | Locked library | Substrate | Primary job |
| --- | --- | --- | --- |
| `plain` | none | DOM, CSS, SVG, native Canvas | Titles, cards, lower thirds, interface-like composition |
| `motion` | Motion 12.42.2 | DOM and SVG | Seekable entrances, transitions, and choreography |
| `p5` | p5.js 2.3.2, instance mode | Immediate-mode Canvas 2D | Generative drawings recomputed per frame |
| `two` | Two.js 0.8.24, WebGL renderer | Retained vector 2D | Named shapes an agent moves between frames |
| `paper-shaders` | Paper Shaders 0.0.77 | WebGL shader mount | Configured treatments: gradients, grain, procedural fields |
| `three` | Three.js 0.185.1 | WebGL2 scene graph | Cameras, lighting, materials, geometry, and models |
| `vgpu` | vgpu 0.3.1 | WebGPU | An explicit WGSL pass graph as the authored object |

Choose the first profile whose primary job matches the work. [Choose an HTML authoring surface](/docs/explanation/html-authoring) explains the editing trade-offs behind the table.

## Commands

```sh
slopcamera html catalog --json
slopcamera html scaffold <profile> --output <file.html>
slopcamera html render --input <scene.json> --dry-run --json
slopcamera html render --input <scene.json> --json
```

`catalog` lists the admitted profiles in recommendation order. `scaffold` writes a starter document for one profile and never replaces an existing file. `render` takes a request JSON naming the document, canvas, timing, library selection, and declared resources; `--dry-run` validates without rendering. A completed render retains the document, assets, request, and an editable project, and exports H.264 video with optional 48 kHz stereo AAC trimmed or padded to the declared duration, keeping a lossless RGB intermediate.

## Limits

- Only the exact tested locks execute. p5.js is LGPL-2.1, so conveying its cached artifact carries license obligations; Paper Shaders is Apache-2.0 with notice preservation.
- Determinism is partly the author's job: visible state must derive from absolute time, declared parameters and assets, and keyed randomness. A `deltaMs` update loop is not absolute seek.
- The `vgpu` overlay profile does not share GPU textures with the spatial renderer's WebGL2 and Spark profiles. A separate vgpu 0.4.1 native example uses its own provisioned Node and Dawn runtime and is not a registered studio engine.
- macOS browser verification uses SwiftShader to prove availability, clock control, transparency, and offline behavior. It makes no claim about hardware GPU throughput.

To walk a complete render, use [Render motion graphics from HTML](/docs/how-to/render-motion-graphics) or [Make a music video from an HTML scene](/docs/how-to/music-video). [Capabilities](/docs/reference/capabilities) records what the installed host supports.
