Slopcamera is a studio for images, diagrams, animation and video that runs on your own computer and is driven by a coding agent such as Claude Code or Codex. You describe the picture you want, and the agent edits source files and renders them. The project keeps those sources and settings, and important operations write a receipt, a file recording their inputs and outputs. When you come back to an image later, the recipe is still in your files.

A picture generated in a chat window usually arrives as a file with no prompt, model or size attached. A week later, when a page needs a matching second image or a lighter version, you start over.

## Images on other Hraness sites were made this way

Every live note on the AI Charts blog carries a figure generated with Slopcamera. The AI Charts image guide keeps the exact command and model settings. A separate image records file stores each figure's dimensions, file hashes, a digest of the prompt, the Slopcamera version and commit, and the paths to the receipt and job that produced it. The dark duotone illustration on Ghostget's WebMCP page was also generated with Slopcamera, and its prompt, job and receipt files are committed next to the site code.

Slopcamera used to be called Atet. Some older records credit Atet as the generator, including those for an earlier, since-retired batch of AI Charts art. Those credits stay as they were recorded.

## Who it is for

Slopcamera suits someone who already works with a coding agent and wants images made like the rest of a project, from files you can edit, rerun and review. It fits site owners who need consistent editorial art, people who draw architecture diagrams, and anyone making short explainer animations.

If you want to type a prompt into a web page and download a picture, a hosted image app will be quicker. Slopcamera has no Slopcamera account, no browser generation service and no hosted project storage. You install it and work in a terminal or through your agent.

## Start with a diagram that needs no model

The first task needs no AI account. After installing, run this in an empty directory:

```sh
slopcamera diagram init first.diagram.json
slopcamera diagram check first.diagram.json --strict
slopcamera diagram render first.diagram.json
```

You get light and dark SVG and PNG versions of the diagram, plus a tldraw file you can open and edit. The JSON you started from stays editable, and rendering again replaces only the derived files. The [first diagram tutorial](/docs/tutorials/first-diagram) walks through changing a label.

For AI images, Slopcamera sends requests through your own Vercel AI Gateway key, so you choose the model and see live availability and pricing. A figure request looks like this:

```sh
slopcamera ai image generate --model openai/gpt-image-2 \
  --prompt-file figure.txt --size 1536x864 --count 1 --json
```

If you do not want to set up a key, you can buy prepaid credits through a hosted checkout, and prompt-only image generation then runs on a hosted service billed against those credits. That route accepts only a prompt and a model. Reference images, video, speech and transcription go through your own key, and Slopcamera asks for an explicit acknowledgement before it uploads named local media. The [media generation guide](/docs/how-to/generate-media) covers both routes.

The same tool builds 3D scenes with named cameras, directs Blender, CadQuery and Manim for detailed or mathematical work, renders motion graphics from HTML, and edits existing footage into several aspect ratios from one timeline. An entity in a portable scene can be given a behavior written as a small [ALGAL]({{PRODUCT_URL_ALGAL}}) program. Slopcamera runs it with no model calls, tools or other side effects and records the result as proposed performance directions for you to review. The post on [how Slopcamera uses ALGAL](/blog/how-slopcamera-uses-algal) covers the details.

## Where it is going

Slopcamera aims to keep the record of how it was made with every picture, clip or diagram it renders, so an agent can read that record and make the next version without guessing. New kinds of visual work will be added when they fit that pattern. No particular features or dates are promised.

## What it does not do yet

Generated media still needs a person to look at it. Models can change a subject's identity, its motion or any text in the image, and the record of a run tells you what went in and what came out, not whether the result is good. The same sources can render slightly differently on another machine, because native tools, codecs and GPU drivers vary. Exporting a native Blender rig to a portable format does not keep the rig editable. Native Python and custom workflow code run with your own user's access and are not sandboxed. The video editor works on recordings you already have and does not capture new ones. Media, GPU and native profiles have their own requirements, which `slopcamera doctor` reports.

Latest release: [{{PUBLISHED_VERSION}}]({{RELEASE_URL}}).
