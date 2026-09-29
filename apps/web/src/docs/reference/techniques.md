Each technique pairs a source format your agent writes with a command that renders and checks it. Find the job you need below, then run its first command.

Every entry gives what you get, when to use it, the first command, the guide, and a rendered example from the gallery when one exists. The source formats are diagram JSON, HTML from a profile scaffold, scene JSON, and Blender, CadQuery, or Manim programs, and a revision is an edit to that source and a new render.

## How to read the status

- **Shown in a rendered example:** the gallery has an output rendered from committed source with this technique. Follow the example link to watch it and read its source.
- **Available, no rendered example yet:** the command ships and its checks run, but the gallery has no rendered output for it. Review your own result before you rely on it.
- **Planned:** the command writes a plan or an audit, but rendered output for this part is not published yet.

A status records what the gallery shows. It is not a quality rating. Run `slopcamera capabilities --json` to see what your installed build supports.

## Diagrams and drawings

### Editable diagrams with light and dark exports

What you get: one `.diagram.json` source rendered to an editable `.tldr` file plus light and dark SVG and PNG. A strict check reports overlaps, missing labels, and other layout problems before you render.

- **Use when:** you need an architecture diagram, a flow, or a pipeline that you will change later.
- **Start with:** `slopcamera diagram init flow.diagram.json`, then `slopcamera diagram check flow.diagram.json --strict` and `slopcamera diagram render flow.diagram.json`.
- **Guide:** [Create and revise your first diagram](/docs/tutorials/first-diagram) and [the .diagram.json format](/docs/reference/diagram-format).
- **Example:** [Lay out a pipeline from ordered cards](/docs/tutorials/first-diagram#slopcamera-example-production-pipeline-title).
- **Status:** Shown in a rendered example.

### Diagram themes and revisions

What you get: a house style (colors, fonts, and icons) applied without changing the graph, and a revised render from an edited source.

- **Use when:** several diagrams must match, or a reviewer asks for one label or node to change.
- **Start with:** edit the theme or the label in the source, then run `slopcamera diagram render flow.diagram.json` again.
- **Guide:** [Create and revise your first diagram](/docs/tutorials/first-diagram).
- **Example:** [Apply a house style without changing the graph](/docs/tutorials/first-diagram#slopcamera-example-production-pipeline-themed-title) and [Revise the delivery](/docs/tutorials/first-diagram#slopcamera-example-source-to-film-revised-title).
- **Status:** Shown in a rendered example.

### Patent-style drawing sheets

What you get: a `.drawing.json` source rendered to monochrome SVG sheets and a multipage PDF on A4 or Letter. The sheet check reports physical bounds. It does not certify that a filing meets any patent office's rules.

- **Use when:** you need numbered black-and-white figures laid out on sheets.
- **Start with:** `slopcamera diagram sheets init figures.drawing.json`, then `slopcamera diagram sheets render figures.drawing.json`.
- **Guide:** [Prepare patent-style drawing sheets](https://github.com/hraness/slopcamera/blob/main/docs/how-to/patent-drawings.md).
- **Status:** Available, no rendered example yet.

## Images and vector art

### Raster to SVG

What you get: a local trace of a PNG or JPEG into SVG, an optional two-color duotone treatment, and a fidelity report that compares the trace with the original. It runs on macOS and Linux; Windows is not supported.

- **Use when:** you have a logo or flat artwork as a raster and need a vector you can scale and recolor.
- **Start with:** `slopcamera image vectorize input.png --output traced.svg --json`.
- **Guide:** [Convert raster images to SVG](/docs/how-to/vectorize-images).
- **Example:** [One raster, two SVG treatments](/docs/how-to/vectorize-images#slopcamera-example-orbit-vector-title).
- **Status:** Shown in a rendered example.

### Generated images, video, and narration

What you get: model discovery and generation through your own Vercel AI Gateway key, with the prompt, model, and output kept beside your project. Prompt-only images can use prepaid Hraness Credits instead. Uploading a local file to a provider requires an explicit flag on that command.

- **Use when:** you need a texture, backdrop, still, short clip, or voice-over that no local renderer can make.
- **Start with:** `slopcamera ai models list --type image --json`.
- **Guide:** [Generate images, video, and narration](/docs/how-to/generate-media).
- **Status:** Available, no rendered example yet. Generated output varies by model; review it before use.

### Icons and candidate galleries

What you get: an SVG icon from a subject description, and a gallery of image candidates to compare side by side before you pick one. Both call a generation model.

- **Use when:** you need a simple mark or want several options to choose from.
- **Start with:** `slopcamera image icon "paper plane" --output plane.svg`.
- **Guide:** [Generate images, video, and narration](/docs/how-to/generate-media).
- **Status:** Available, no rendered example yet.

## Motion graphics from HTML

Every HTML technique uses one of seven locked authoring profiles. The agent writes one HTML file from a scaffold; Slopcamera renders it frame by frame to H.264 and can add a local audio track. The [HTML render profiles](/docs/reference/html-profiles) reference lists the library versions for each profile.

### Editorial layouts

What you get: a typographic composition in plain HTML and CSS, rendered to video, that you revise by editing copy and color in the source.

- **Use when:** you need a title card, a quote, or an announcement with no animation library.
- **Start with:** `slopcamera html scaffold plain --output title.html`.
- **Guide:** [Create and revise your first animation](/docs/tutorials/first-animation).
- **Example:** [Form follows a frame](/docs/tutorials/first-animation#slopcamera-example-editorial-title) and [Revise the same composition](/docs/tutorials/first-animation#slopcamera-example-editorial-revised-title).
- **Status:** Shown in a rendered example.

### Kinetic titles

What you get: timed text and shape animation with the Motion library, rendered at fixed frame times.

- **Use when:** you need an animated title, a product name reveal, or a short promo line.
- **Start with:** `slopcamera html scaffold motion --output kinetic.html`.
- **Guide:** [Render motion graphics from HTML](/docs/how-to/render-motion-graphics).
- **Example:** [Make every frame count](/docs/how-to/render-motion-graphics#slopcamera-example-kinetic-title-title).
- **Status:** Shown in a rendered example.

### Transparent lower thirds

What you get: a name or caption bar rendered over your own footage.

- **Use when:** you need an overlay for an interview, a talk, or a demo recording.
- **Start with:** `slopcamera html scaffold plain --output lower-third.html`.
- **Guide:** [Render motion graphics from HTML](/docs/how-to/render-motion-graphics).
- **Example:** [A title over your footage](/docs/how-to/render-motion-graphics#slopcamera-example-lower-third-title).
- **Status:** Shown in a rendered example.

### Generative line work

What you get: a p5.js sketch rendered deterministically from its seed and frame time.

- **Use when:** you want drawn or procedural patterns, such as contour lines or flow fields.
- **Start with:** `slopcamera html scaffold p5 --output drift.html`.
- **Guide:** [Render motion graphics from HTML](/docs/how-to/render-motion-graphics).
- **Example:** [Order, with a little drift](/docs/how-to/render-motion-graphics#slopcamera-example-contour-drift-title).
- **Status:** Shown in a rendered example.

### Vector assembly

What you get: flat vector shapes animated with Two.js.

- **Use when:** you need many parts that move in one rhythm, such as an explainer build-up or a logo assembly.
- **Start with:** `slopcamera html scaffold two --output assembly.html`.
- **Guide:** [Render motion graphics from HTML](/docs/how-to/render-motion-graphics).
- **Example:** [Many parts. One rhythm.](/docs/how-to/render-motion-graphics#slopcamera-example-orbital-assembly-title)
- **Status:** Shown in a rendered example.

### Shader color fields

What you get: animated gradient and texture fields from the Paper Shaders library.

- **Use when:** you need a background, a transition field, or an abstract color study.
- **Start with:** `slopcamera html scaffold paper-shaders --output colour.html`.
- **Guide:** [Render motion graphics from HTML](/docs/how-to/render-motion-graphics).
- **Example:** [Living colour](/docs/how-to/render-motion-graphics#slopcamera-example-living-colour-title).
- **Status:** Shown in a rendered example.

### GPU compute patterns

What you get: a WGSL program rendered to raster frames on the GPU.

- **Use when:** you want interference patterns, simulations, or other effects written as shader code. The profile requires a supported GPU.
- **Start with:** `slopcamera html scaffold vgpu --output field.html`.
- **Guide:** [Render motion graphics from HTML](/docs/how-to/render-motion-graphics).
- **Example:** [Patterns from a program](/docs/how-to/render-motion-graphics#slopcamera-example-interference-field-title).
- **Status:** Shown in a rendered example.

### Three.js scenes timed to a declared tempo

What you get: a Three.js scene in one HTML file, rendered with a local music track. Motion follows the BPM you declare in the source; Slopcamera does not detect beats.

- **Use when:** you need a music video, a loop, or 3D visuals timed to a track.
- **Start with:** `slopcamera html scaffold three --output pulse.html`.
- **Guide:** [Make a music video](/docs/how-to/music-video).
- **Example:** [Island Pulse](/docs/how-to/music-video#slopcamera-example-island-pulse-title).
- **Status:** Shown in a rendered example.

## 3D scenes and camera moves

### Editable Three.js scenes

What you get: a `.scene.json` file with named parts, materials, lights, and cameras. The agent changes one part by ID with a patch the CLI validates instead of rewriting the scene, then renders a frame or a shot.

- **Use when:** you need a product shot, a set, or an environment that will go through several revisions.
- **Start with:** `slopcamera scene init product.scene.json --json`, then `slopcamera scene inspect product.scene.json --json`.
- **Guide:** [Render and edit Three.js 3D scenes](/docs/how-to/direct-scenes) and [spatial scenes, cameras, and saved worlds](/docs/reference/spatial-scenes).
- **Example:** [Compute aisle](/docs/how-to/direct-scenes#slopcamera-example-compute-temple-title).
- **Status:** Shown in a rendered example.

### Camera moves

What you get: named camera paths for orbit, dolly, crane, rail, tripod, and handheld shots, each evaluated at exact times.

- **Use when:** you want a specific move rather than a generic spin.
- **Start with:** add a camera to the scene source, then `slopcamera scene plan product.scene.json --request frame.json --json`.
- **Guide:** [Render and edit Three.js 3D scenes](/docs/how-to/direct-scenes).
- **Example:** [Orbit](/docs/how-to/direct-scenes#slopcamera-example-camera-orbit-title), [dolly](/docs/how-to/direct-scenes#slopcamera-example-camera-dolly-title), [crane](/docs/how-to/direct-scenes#slopcamera-example-camera-crane-title), [rail](/docs/how-to/direct-scenes#slopcamera-example-camera-rail-title), [tripod](/docs/how-to/direct-scenes#slopcamera-example-camera-tripod-title), and [handheld](/docs/how-to/direct-scenes#slopcamera-example-camera-handheld-title).
- **Status:** Shown in a rendered example.

### Footage inside a 3D scene

What you get: your video or images placed on surfaces in the scene, so the camera can move around them.

- **Use when:** you want a wall of clips, a screen in a set, or a reel that the camera travels through.
- **Start with:** add a media surface to the scene source, then plan and render as above.
- **Guide:** [Render and edit Three.js 3D scenes](/docs/how-to/direct-scenes).
- **Example:** [One scene holds the whole wall](/docs/how-to/direct-scenes#slopcamera-example-premiere-scene-title).
- **Status:** Shown in a rendered example.

### Parametric design

What you get: a design file with named parameters and constraints that compiles into geometry and a renderable scene. Change a dimension, compile again, and compare.

- **Use when:** you are exploring variations of a pavilion, a stair, a tower, or a bookshelf, such as a wider span or more shelves.
- **Start with:** `slopcamera scene design catalog`, then `slopcamera scene design init pavilion --template <id>`.
- **Guide:** [Build and revise a parametric design](/docs/how-to/parametric-design).
- **Example:** [Build a shape from rules](/docs/how-to/parametric-design#slopcamera-example-crescent-pavilion-title) and [Widen the span, lower the crown](/docs/how-to/parametric-design#slopcamera-example-crescent-pavilion-wide-title).
- **Status:** Shown in a rendered example.

### Cinematic direction, effects, and particles

What you get: a direction document that proposes camera, lighting, and performance choices for a scene, lists effects such as bloom, depth of field, grain, and color lookup, and audits timing. The `cinematic-world` workflow packs these into one plan for review.

- **Use when:** you are planning a directed 3D shot and want the choices written down before you render.
- **Start with:** `slopcamera scene direction check direction.json --scene world.json --json`.
- **Guide:** [Plan camera moves, lighting, and effects for a 3D scene](/docs/how-to/cinematic-worlds).
- **Status:** Planned. The commands write plans and audits; rendered effects, particles, and character performance are not published yet.

## Films from Blender, CadQuery, and Manim

These techniques keep the native program as the source. You install Blender, CadQuery, or Manim yourself, and the program runs with your user account's access. Each guide names the tested version.

### Product shots in Blender

What you get: a Blender program that builds, lights, and moves a camera over a product. The same source can pull focus or export transparent PNG and EXR frames.

- **Use when:** you need a packshot, a turntable, or a hero frame.
- **Start with:** `slopcamera studio init product --template blender-product --json`.
- **Guide:** [Render your first native film](/docs/tutorials/first-native-film) and [Render Blender, CadQuery, and Manim films from source](/docs/how-to/native-films).
- **Example:** [An optical instrument, in motion](/docs/tutorials/first-native-film#slopcamera-example-native-product-title), [Move focus without moving the camera](/docs/how-to/native-films#slopcamera-example-native-focus-pull-title), and [Keep transparency and highlight range](/docs/how-to/native-films#slopcamera-example-native-color-alpha-title).
- **Status:** Shown in a rendered example.

### Imported models

What you get: an existing textured GLB model lit in Blender and rendered from several views.

- **Use when:** you have a packaging mockup or product model from another tool.
- **Start with:** `slopcamera studio init product --template blender-product --json`, then reference the model in the source.
- **Guide:** [Render Blender, CadQuery, and Manim films from source](/docs/how-to/native-films).
- **Example:** [Import a textured packaging mockup](/docs/how-to/native-films#slopcamera-example-native-import-model-hero-title).
- **Status:** Shown in a rendered example.

### Character animation

What you get: a Blender character with a weighted rig, an IK target, and facial shape keys, animated with gestures such as a wave or a blink.

- **Use when:** you need a simple mascot moment.
- **Start with:** `slopcamera studio init mascot --template blender-character --json`.
- **Guide:** [Render Blender, CadQuery, and Manim films from source](/docs/how-to/native-films).
- **Example:** [A wave, a blink and a smile](/docs/how-to/native-films#slopcamera-example-native-character-title).
- **Status:** Shown in a rendered example.

### Cloth and fluid simulations

What you get: Blender cloth and liquid simulations with separate bake and render stages. The caches are kept with the source, so you can inspect a bake and compare it with a re-pinned one.

- **Use when:** you need fabric that drapes or liquid that pours.
- **Start with:** `slopcamera studio init drape --template blender-cloth --json` or `--template blender-fluid`.
- **Guide:** [Render Blender, CadQuery, and Manim films from source](/docs/how-to/native-films).
- **Example:** [Bake the cloth, retain the fall](/docs/how-to/native-films#slopcamera-example-native-cloth-title), [Hold the corners, change the drape](/docs/how-to/native-films#slopcamera-example-native-cloth-pinned-title), and [Keep the liquid cache](/docs/how-to/native-films#slopcamera-example-native-fluid-title).
- **Status:** Shown in a rendered example.

### Parametric CAD parts

What you get: a CadQuery program for a part, with STEP output and renders at two sizes from one set of parameters.

- **Use when:** you need a bracket, an enclosure, or another dimensioned part shown on screen.
- **Start with:** `slopcamera studio init bracket --template cadquery-bracket --json`.
- **Guide:** [Render Blender, CadQuery, and Manim films from source](/docs/how-to/native-films).
- **Example:** [One bracket, two dimensions](/docs/how-to/native-films#slopcamera-example-native-cad-title).
- **Status:** Shown in a rendered example.

### Math explainers with Manim

What you get: a Manim lesson rendered as silent visuals, with narration, music, and sound effects placed in an ordinary Slopcamera project you can keep editing.

- **Use when:** you are explaining a proof, a formula, or a geometric idea.
- **Start with:** `slopcamera studio init lesson --template manim-lesson --json`.
- **Guide:** [Make a math explainer video with Manim](/docs/how-to/educational-video).
- **Example:** [Why the long side is five](/docs/how-to/educational-video#slopcamera-example-education-luma-title).
- **Status:** Shown in a rendered example.

## Editing your footage

Slopcamera edits footage you already have. It does not record the screen, a camera, or a microphone.

### Edit decisions: cuts, speed, zooms, and overlays

What you get: a project that records each cut, speed change, zoom, and overlay as a decision. Preview and final renders read the same decisions, and the original media is never changed.

- **Use when:** you are cutting a demo, a talk, or a product video and expect notes.
- **Start with:** `slopcamera projects create --from-recording <recording-id> --json`, then `slopcamera project inspect <project> --json`.
- **Guide:** [Edit and deliver video](/docs/how-to/edit-video) and [video editing, compositing, and delivery](/docs/reference/video-pipeline).
- **Example:** [Landscape delivery](/docs/how-to/edit-video#slopcamera-example-edit-directed-landscape-title) and [A wall of authored work](/docs/how-to/edit-video#slopcamera-example-premiere-wall-title).
- **Status:** Shown in a rendered example.

### Deliveries in several aspect ratios

What you get: 16:9, 9:16, 1:1, and 4:5 versions of one edit, each with its own framing.

- **Use when:** one video has to go to several platforms.
- **Start with:** add a delivery variant to the project, then render it.
- **Guide:** [Edit and deliver video](/docs/how-to/edit-video).
- **Example:** [Portrait](/docs/how-to/edit-video#slopcamera-example-edit-directed-portrait-title), [square](/docs/how-to/edit-video#slopcamera-example-edit-directed-square-title), and [feed portrait](/docs/how-to/edit-video#slopcamera-example-edit-directed-feed-portrait-title).
- **Status:** Shown in a rendered example.

### Color grades

What you get: a warm, cool, or monochrome grade applied to a clip without touching the original.

- **Use when:** clips from different sources need to match, or a piece needs a look.
- **Start with:** `slopcamera media color clip.mp4 --preset warm --json`. Other presets include `cool`, `cinematic`, and `mono`.
- **Guide:** [Edit and deliver video](/docs/how-to/edit-video).
- **Example:** [Warm brass](/docs/how-to/edit-video#slopcamera-example-color-warm-title), [Cool surroundings](/docs/how-to/edit-video#slopcamera-example-color-cool-title), and [Monochrome](/docs/how-to/edit-video#slopcamera-example-color-mono-title).
- **Status:** Shown in a rendered example.

### Audio cleanup, alignment, and filler removal

What you get: volume, compression, and delay effects; alignment of a second audio track to the first; and removal of filler words found by speech analysis.

- **Use when:** you recorded audio separately, or a talk has pauses and filler words to cut.
- **Start with:** `slopcamera align analyze <project> --reference <asset:stream> --target <asset:stream>`, or `slopcamera fillers list <project> <speech-analysis-id>`.
- **Guide:** [Edit and deliver video](/docs/how-to/edit-video).
- **Status:** Available, no rendered example yet.

### Face-following crops

What you get: face tracks from a local analysis that a vertical crop can follow. The analysis stores face positions only. It does not identify anyone or send frames to a server.

- **Use when:** you are turning a landscape interview into a portrait clip.
- **Start with:** `slopcamera analyze faces <project> --source <asset:video-stream>`, then `slopcamera faces list <project> <face-analysis-id>`.
- **Guide:** [Edit and deliver video](/docs/how-to/edit-video).
- **Status:** Available, no rendered example yet.

## Generated clips

### Directed generated clips

What you get: a recipe of shots with a spending estimate, several takes per shot to review, and the last frame of one take carried into the next for continuity. The estimate is not a spending cap enforced by the provider.

- **Use when:** you are making a short sequence from a video model and want to choose between takes.
- **Start with:** `slopcamera direct init film.recipe.json --json`.
- **Guide:** [Direct short generated clips](/docs/how-to/direct-takes).
- **Status:** Available, no rendered example yet.

## Workflows and art direction

### Built-in workflows

What you get: eight built-in workflows that chain the techniques above, such as `social-variants` and `talking-head-cleanup`. Each run is saved, so you can approve a step, resume after a failure, and inspect what ran.

- **Use when:** a job repeats, or you want an approval step before an expensive render.
- **Start with:** `slopcamera workflows list`, then `slopcamera workflows plan <id> --input input.json --json`.
- **Guide:** [Run or recover a workflow](/docs/how-to/run-workflows).
- **Example:** [From source to delivery](/docs/how-to/run-workflows#slopcamera-example-source-to-film-title).
- **Status:** Shown in a rendered example.

### Style profiles

What you get: 17 style profiles that describe palette, shape, materials, camera, and review criteria for a look. They are written guidance for the agent. They apply no effect and do not render anything by themselves.

- **Use when:** you want a consistent look across diagrams, scenes, and generation prompts.
- **Start with:** `slopcamera style list`, then `slopcamera style show <id>`.
- **Guide:** [Direct a film or animation style](https://github.com/hraness/slopcamera/blob/main/docs/how-to/direct-visual-styles.md).
- **Status:** Guidance only; there is nothing to render.

## Next steps

- New to Slopcamera? Start with [Create and revise your first diagram](/docs/tutorials/first-diagram).
- Deciding between tools? Read [Why Slopcamera](/docs/explanation/why-slopcamera), then the comparisons with [Remotion](/docs/explanation/slopcamera-vs-remotion) and [HyperFrames](/docs/explanation/slopcamera-vs-hyperframes), and the [Remotion alternatives for coding agents](/docs/explanation/remotion-alternatives-for-coding-agents).
- Making diagrams? [Editable diagrams with coding agents](/blog/editable-diagrams-with-coding-agents) walks through a diagram revision.
- Want the measurements? [Your model can one-shot a render. What does the second one take?](/blog/one-shot-render-vs-installed-techniques) compares file sizes and changed lines on four revisions.
- Using an MCP client? The [MCP toolset](/docs/reference/mcp-tools) covers diagrams, images, and scene checks; editing, native films, and workflows use the CLI.
