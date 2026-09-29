A frontier model such as Claude Opus can write a video or a graphic in one pass. To do it, the agent writes the layout, the renderer setup, the export code, and the checks in the conversation, and on the next request it writes them again. With Slopcamera installed, those parts are already packaged and tested. The agent writes a short source file, and the CLI renders it, checks it, and writes the variants each technique supports, such as light and dark diagrams or 16:9 and 9:16 cuts of a video. A revision is an edit to that source and a re-render.

## Installed techniques instead of one-off code

Each Slopcamera technique pairs a source format with a command that knows how to render it:

| The agent writes | The CLI produces |
| --- | --- |
| A `.diagram.json` file with nodes, edges, and labels | An editable `.tldr` file, light and dark SVG, and light and dark PNG, after a layout check |
| An HTML file from one of seven profile scaffolds | Frames and an H.264 video, rendered on one absolute clock with declared assets |
| A `.scene.json` file with named parts and cameras | Three.js stills and video, and patches for later changes, checked against the scene |
| A Blender, CadQuery, or Manim program from a starter | A native render kept next to its source, and an ordinary Slopcamera project |
| Edit decisions over footage you already have | 16:9, 9:16, 1:1, and 4:5 deliveries from one edit |

The source file is short because the rendering, layout rules, and exports are not in it. The [techniques catalog](/docs/reference/techniques) lists every technique with its first command, its guide, and a rendered example where the gallery has one. For measured file sizes and changed lines on four gallery revisions, read [Your model can one-shot a render. What does the second one take?](/blog/one-shot-render-vs-installed-techniques).

## Sources stay editable after the render

A render writes new files and leaves its source in place. A diagram keeps its JSON beside the five exports. A scene keeps named parts and calibrated cameras that the agent changes by ID. A native bundle keeps its Blender, CadQuery, or Manim program. A video project records cuts, timing, framing, captions, and effects as decisions over the original media.

The source matters when the work is revised. A PNG does not record the JSON it came from, and an exported MP4 does not keep the edit that produced it. In Slopcamera, changing a label means editing one line of the diagram source and rendering again, as in the [first-diagram tutorial](/docs/tutorials/first-diagram).

## Every run leaves a record

Each plan fixes its inputs before anything runs. Slopcamera limits how much work runs at once, tracks each process until it exits, and reuses finished work only when the inputs, the tool, and the recorded result still match. A failed or interrupted run leaves its record for inspection, and recovery checks what actually happened instead of assuming a timeout meant nothing ran.

A record proves what ran and on which inputs. It does not prove the result looks right, so inspect the output too.

## Rendering and credentials stay local

There is no Slopcamera account or hosted project database. Editing and rendering run on the machine in front of the agent, and project state is ordinary files you control.

AI generation is opt-in on each command. Image, video, speech, and transcription use your own Vercel AI Gateway key from the local environment, and Slopcamera does not save it. Prompt-only images can instead run on the hosted API at `api.slopcamera.com`, paid with prepaid Hraness Credits. Uploading local media to a provider needs an explicit flag on that command: `--allow-cloud-upload` for image and video, and `--allow-cloud-audio-upload` for transcription.

## Interfaces an agent can inspect

The agent does not have to guess what is installed. `slopcamera --help` prints the command grammar, `{{DOCTOR_COMMAND}}` reports installed tools, `slopcamera operations list --json` lists every operation with its input schema, and `slopcamera html catalog` lists the HTML profiles. The version-matched Agent Skill points the agent to the right guide for each job, the TypeScript SDK exposes the same operations, and the MCP server offers 21 fixed tools. The [architecture explanation](/docs/explanation/architecture) covers the source and project model in depth.

## Compared with other tools

- [Remotion](https://www.remotion.dev/) renders React components to video. Choose it if your team writes React, needs a player inside a web app, or wants distributed rendering on AWS Lambda. Read [Slopcamera vs Remotion](/docs/explanation/slopcamera-vs-remotion).
- [HyperFrames](https://github.com/heygen-com/hyperframes), from HeyGen, renders HTML and GSAP animation to MP4. Choose it for all-HTML videos, exact output across machines in Docker, or rendering on HeyGen's cloud, AWS Lambda, or Google Cloud Run. Read [Slopcamera vs HyperFrames](/docs/explanation/slopcamera-vs-hyperframes).
- [MCP for Blender](https://github.com/ahujasid/mcp-for-blender) lets an agent control a running Blender. Choose it for live, interactive modeling.
- A hosted app such as Runway or ChatGPT is faster for a one-off image or clip and needs no install.
- Choose Slopcamera when one agent needs diagrams, 3D scenes, Blender or Manim films, and edits of your own footage, kept as source it can revise.

Remotion, HyperFrames, and MCP for Blender all have much larger communities than Slopcamera. For more options grouped by job, read [Remotion alternatives for coding agents](/docs/explanation/remotion-alternatives-for-coding-agents).

Competitor details as of 28 September 2026.

## What SlopCamera does not provide

- No hosted projects. Without an account or project database there is no built-in sync, sharing, or multi-machine collaboration.
- No hosted video rendering. Video renders run on your machine.
- No sandbox for trusted code. Native Python sources and your own Bun workflows run with your user's access, including network access. Records identify what ran; they do not confine it.
- No capture. Slopcamera edits footage and existing recordings; it does not record the screen, camera, or microphone.
- Platform limits. Vectorization runs on macOS and Linux and rejects Windows. The hardware Three.js profile requires a supported macOS graphics context.
- No identical pixels across machines. Native tools, codecs, GPU drivers, and AI models affect results.
- Generated media needs review. Models can change a subject, its motion, or its text, and a local budget estimate is not a spending cap at the provider.
- No measured token saving. In a [controlled benchmark](/docs/explanation/token-benchmark) of four media tasks, an agent with Slopcamera installed spent more on a first render and one revision than the same agent without it.

The [capability reference](/docs/reference/capabilities) lists current platforms and limits, [Extend Slopcamera](/docs/explanation/extending) covers what an agent can build on, and [Run or recover a workflow](/docs/how-to/run-workflows) shows run records and recovery in practice.
