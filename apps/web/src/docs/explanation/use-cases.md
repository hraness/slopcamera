Slopcamera serves people and agents who need a visual asset that stays editable after it is made. The common thread across the jobs below is retained source: every result keeps the document, project, or program that produced it, so a revision edits the source instead of starting over. Each entry names the surface that does the work, what it needs, and the guide that proves it.

## Documentation diagrams and visual explanations

Turn architecture, flows, and relationships into editable diagrams that live beside the work they describe. The [`.diagram.json` format](/docs/reference/diagram-format) renders five exports locally with no model account, and the [first-diagram tutorial](/docs/tutorials/first-diagram) shows the edit-and-rerender loop. Stack sources suit ordered pipelines; positioned sources suit layouts that need exact placement.

## Product demos and marketing videos

Assemble existing screen or camera recordings and imported footage into polished deliveries: cuts, speed changes, cursor and keystroke emphasis, overlays, captions, and color or audio treatment through the [video pipeline](/docs/reference/video-pipeline). Deliver landscape, vertical, square, and feed-portrait variants from one edit, as in [Edit and deliver video](/docs/how-to/edit-video). Titles, lower thirds, and motion graphics come from the [HTML render profiles](/docs/reference/html-profiles).

## Educational and explainer films

Make lessons that combine authored motion, readable mathematics, a presenter, and narration. Manim scenes run through the [native studio adapter](/docs/reference/native-engines), and [Make an educational video](/docs/how-to/educational-video) keeps the visuals, narration, and timing evidence revisable.

## Generated images, clips, and voice

Generate images, video takes, speech, and transcripts through your own [Vercel AI Gateway access](/docs/reference/gateway-generation). Galleries fan a subject into labelled candidates for explicit selection, the icon recipe produces canonical line-art SVGs, and [Direct short generated clips](/docs/how-to/direct-takes) adds budgets, reviewed takes, and endpoint continuity for multi-shot work.

## Spatial scenes and product reveals

Author editable Three.js scenes with calibrated cameras, mount images or video on world-space screens, and move the camera along explicit tracks. [Spatial scenes](/docs/reference/spatial-scenes) covers the data contract and GPU profiles; [Render and edit spatial scenes](/docs/how-to/direct-scenes) and [Direct a cinematic world](/docs/how-to/cinematic-worlds) cover the workflows.

## Parametric design studies

Compile architectural and furniture studies from named dimensions and constraints, change coupled parameters, and compare rendered variants. See [Build and revise a parametric design](/docs/how-to/parametric-design).

## Native-fidelity films and CAD

When the job needs Blender rigs and simulation, CadQuery solids and STEP, or Manim lessons, the [native engine contract](/docs/reference/native-engines) retains the engine's own source and verifies every output. Start with [Render your first native film](/docs/tutorials/first-native-film).

## Vector assets and icons

Trace raster artwork into measured, inert SVG through [local vectorization](/docs/reference/vectorization), or produce a canonical icon through the Gateway-backed [icon recipe](/docs/reference/gateway-generation).

## When Slopcamera is not the right tool

- No hosted state: without an account or project database there is no built-in sync, sharing, or multi-machine collaboration.
- The current CLI does not start new screen or camera recordings; it consumes existing finished bundles.
- The hardware scene profiles need a qualified macOS graphics context, and vectorization deliberately rejects Windows.
- Native Python and custom Bun workflows run as your current user without an operating-system sandbox.
- Generated media needs review: models can change subject identity, motion, or text, and a local budget estimate is not a provider-enforced spending cap.

[Why Slopcamera](/docs/explanation/why-slopcamera) develops the retained-source model behind these jobs, and [Choose an interface](/docs/explanation/choose-an-interface) picks the surface that fits your setup.
