A Blender product shot often needs a second version: warmer metal, a lower camera or a different crop. A CadQuery part may need a wider bracket, and a Manim lesson may need new dimensions. Keep those choices in a scene program so the agent can revise them and render again.

## Choose a live session or a saved scene program

[MCP for Blender](https://github.com/ahujasid/mcp-for-blender) connects an agent to an open Blender session. You can watch the scene change in the viewport, inspect existing objects and explore an idea interactively. Save the Blender file and any scripts you want to reuse; either can be part of a repeatable workflow. The project's setup guide explains the access its code-execution tool has.

A scene program is useful when a render should start from declared inputs. Blender supports [command-line rendering](https://docs.blender.org/manual/en/latest/advanced/command_line/render.html), Manim renders scene classes through [its CLI](https://docs.manim.community/en/stable/guides/configuration.html), and [CadQuery](https://cadquery.readthedocs.io/en/latest/intro.html) builds solids in Python. Slopcamera's `studio` commands package a scene program with its settings and outputs, then run that saved job.

## What the agent writes

The [product example](https://github.com/hraness/slopcamera/tree/d2accc8badd991f288bb0c83668efc641aa89981/examples/showcase/native/product) is a six-second camera move around a machined optical instrument in brass, rubber, and glass. Its source is three files:

- `scene.py` defines the materials, builds the geometry from primitives, and keys the camera and focus distance at frames 0, 72, and 144.
- `studio_scene.py` supplies helpers for materials, primitives, lights, and camera aim.
- `source.json` lists the two files to include in the bundle.

A `job.json` file sets the rest: 1280×720, frames 0 to 143 at 24 fps, Cycles with 32 samples and denoising, the AgX view transform, and two outputs, a PNG sequence and the saved `.blend` file.

That split is where the agent saves effort. It writes or edits the scene code. Slopcamera handles the rest. It copies the listed files into a fixed bundle and starts Blender with no window and no user preferences. `studio run` checks that every declared frame and file was written. `studio encode` makes a video that it checks frame by frame against the PNGs, and `studio assemble` puts the clip in an ordinary video project. The agent does not rewrite render settings, file handling, or encoding each time. To start a new film, it picks one of seven starters:

```sh
slopcamera studio init product --template blender-product --json
```

The other starters are `blender-character`, `blender-shaded-street`, `blender-cloth`, `blender-fluid`, `cadquery-bracket`, and `manim-lesson`. None of them runs anything when created.

## Change a material and render again

Say the brass reads too yellow. The starter's `scene.py` has the same brass line as the showcase example, but its default job is shorter (72 frames), so `studio init` does not give you the six-second film. The material is one line:

```python
brass = material("Satin champagne brass", (0.56, 0.31, 0.105), metallic=0.88, roughness=0.23, texture=True)
```

The agent changes the color or the roughness and leaves the rest of the scene alone. It then runs the same sequence as the first time:

```sh
slopcamera studio bundle product/source.json --json
```

Copy the returned `bundleSha256` into `job.json` and give the revised job a new ID before planning or running it:

```json
"jobId": "studio_product_v2",
"bundleSha256": "<new digest>"
```

Then check and render that job:

```sh
slopcamera studio plan product/job.json --json
slopcamera studio probe product/job.json \
  --blender-bin /Applications/Blender.app/Contents/MacOS/Blender --json
slopcamera studio run product/job.json \
  --blender-bin /Applications/Blender.app/Contents/MacOS/Blender \
  --allow-trusted-code --json
slopcamera studio inspect <studio-id> --json
slopcamera studio encode <studio-id> --output-id beauty --json
```

Reusing an old job ID with changed source is rejected as a conflict. `plan` reads the job without starting Blender, and `probe` loads the chosen Blender without running your scene, so mistakes show up before a long render. After the run, `inspect` rechecks the hashes of the source and every output.

A camera change works the same way. The camera path is three keyed positions in `scene.py`, and the lens and f-stop are arguments to one `camera()` call. The first render and the old files stay as they were, so you can compare the two versions.

The [first native film tutorial](/docs/tutorials/first-native-film) walks through this loop with a one-second CPU preview at 320×180. It ends with `studio assemble`, which puts the clip in a video project for captions, sound, and other aspect ratios.

## Change a part's dimensions with CadQuery

The [CAD example](https://github.com/hraness/slopcamera/tree/d2accc8badd991f288bb0c83668efc641aa89981/examples/showcase/native/cad) builds a mounting bracket with counterbored holes, a central opening, and an isolation pad. Its default bracket is 100 mm wide. The variation job sets two parameters:

```json
"parameters": { "widthMm": 132, "heightMm": 68 }
```

The same CadQuery source builds the larger part, and it rejects values outside its limits, such as a width below 50 mm or above 160 mm. The example measures both solids, exports STEP in millimeters and GLB in meters, and puts the GLB into a Blender scene for the film. The example's helper script, `cad-variations.ts`, reimports the baseline STEP file and checks that it gives back two valid solids with a relative volume error below 0.00001. That is a geometry check, not a structural or manufacturing check. The [parametric design guide](/docs/how-to/parametric-design) covers CAD work in more depth.

## Keep Manim visuals and sound apart

The [geometry lesson](https://github.com/hraness/slopcamera/tree/d2accc8badd991f288bb0c83668efc641aa89981/examples/showcase/native/education) is a ten-second portrait Manim render: a 3–4–5 triangle becomes 9 + 16 = 25 square tiles, with a presenter, typeset math, and a caption rail. Scene timings, gestures, and captions live in the lesson source.

Slopcamera's Manim driver renders silent visuals and rejects audio in the scene source. Narration, music, and effects go in the video project instead. When the voice-over changes, the agent edits the project. It does not render the math again. The [math explainer guide](/docs/how-to/educational-video) covers this path from `studio init lesson --template manim-lesson`.

## Know what runs on your machine

- `studio run` runs the bundled Python as your user. There is no operating-system sandbox. Blender starts with scripts embedded in `.blend` files turned off and with a clean environment, and your AI provider keys are not passed to it. That limits what the run inherits. It does not contain what the Python itself can do.
- Every run needs `--allow-trusted-code` on that command. Choosing a Blender or Python path does not grant it, and a stored approval cannot stand in for it. Read the source first, especially anything downloaded.
- You install the engines. Slopcamera does not install or upgrade Blender, CadQuery, or Manim. Use the versions and platforms named in the linked recipe, then run `studio probe` before a render.
- A GPU request fails if no GPU is available. The product job asks for Cycles on the GPU. To render on the CPU, set `device: "cpu"` in a new job.
- A failed or interrupted run is never started again on its own. `studio inspect` and `studio reconcile` show what happened before you choose a new job.

The [native engines reference](/docs/reference/native-engines) lists the full rules.

## Where a live session fits

A live MCP session suits sketching in an open Blender window, poking at an existing `.blend`, or asking questions about a scene. Scene source you keep suits work that will be revised or rendered again: product shots with several color variants, parts whose dimensions change, and lessons whose narration will be rewritten. You can use both. Explore live, then have the agent write the scene you settled on as a `scene.py`.

For how this fits the rest of Slopcamera, read [why Slopcamera](/docs/explanation/why-slopcamera), the [native film guide](/docs/how-to/native-films), and the films section of the [techniques reference](/docs/reference/techniques#films-from-blender-cadquery-and-manim). [Remotion alternatives for coding agents](/docs/explanation/remotion-alternatives-for-coding-agents#mcp-for-blender) compares MCP for Blender with other tools. The guide also covers cloth and fluid caches, character rigs, color and alpha masters, and imported models.

## Limits

The same source can render slightly differently on another machine, because Blender builds, GPU drivers, and codecs vary. The saved record names the Blender executable, its hash, and the observed package versions. It does not hash every system library, font, or add-on. Physics settings in the cloth and fluid starters are not proof of a correct simulation; review the baked frames. Native control rigs and IK stay in Blender; a portable GLB export and a rendered MP4 do not carry them. Durable workflows that include a native job need the Bun package or a source checkout, not a copied standalone executable. The `studio` commands do not capture screen or camera recordings.
