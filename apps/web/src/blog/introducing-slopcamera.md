SlopCamera is a media studio that runs on your own computer and that a coding agent, such as Claude Code or Codex, drives to make images, diagrams, animation, and video. The agent writes source files and renders them, and the project keeps those sources and settings. Important operations also write a receipt: a file recording their inputs and outputs. When you come back to a picture later, the recipe is still in your files, so you or your agent can make the next version instead of starting over.

A picture generated in a chat window usually arrives as a file with no prompt, model, or size attached. When a page later needs a matching second image or a lighter version, you have nothing to start from.

## Where SlopCamera images already appear

Every live note on the aicharts blog carries a figure generated with SlopCamera. The aicharts image guide keeps the exact command and model settings. A separate image records file stores each figure's dimensions, file hashes, a digest of the prompt, the SlopCamera version and commit, and the paths to the receipt and job that produced it. The dark duotone illustration on GhostGet's WebMCP page was also generated with SlopCamera, and its prompt, job, and receipt files are committed next to the site code.

SlopCamera used to be called Atet. Some older records credit Atet as the generator, including those for an earlier, since-retired batch of aicharts art. Those credits stay as they were recorded.

## Who SlopCamera is for

SlopCamera suits people who already work with a coding agent and want images made like the rest of a project, from files they can edit, rerun, and review. That includes site owners who need consistent editorial art, people who draw architecture diagrams, and anyone making short explainer animations.

If you want to type a prompt into a web page and download a picture, a hosted image app will be quicker. There is no SlopCamera account, no browser generation service, and no hosted project storage. You install SlopCamera and work in a terminal or through your agent.

## Make a first diagram without a model

The first task needs no AI account. After installing, run this in an empty directory:

```sh
slopcamera diagram init first.diagram.json
slopcamera diagram check first.diagram.json --strict
slopcamera diagram render first.diagram.json
```

You get light and dark SVG and PNG versions of the diagram, plus a tldraw file you can open and edit. The JSON you started from stays editable, and rendering again replaces only the derived files. The [first diagram tutorial](/docs/tutorials/first-diagram) walks through changing a label.

## Generate AI images with your key or with credits

For AI images, SlopCamera sends requests through your own Vercel AI Gateway key, so you choose the model and see live availability and pricing. A figure request looks like this:

```sh
slopcamera ai image generate --model openai/gpt-image-2 \
  --prompt-file figure.txt --size 1536x864 --count 1 --json
```

If you would rather not set up a key, you can buy prepaid credits through a hosted checkout, and prompt-only image generation then runs on a hosted service billed against those credits. That route accepts only a prompt and a model. Reference images, video, speech, and transcription go through your own key, and SlopCamera uploads named local media only when you pass its explicit upload flag. The [media generation guide](/docs/how-to/generate-media) covers both routes.

## Build 3D scenes, drive native tools, and edit video

The same tool builds 3D scenes with named cameras, directs Blender, CadQuery, and Manim for detailed or mathematical work, renders motion graphics from HTML, and edits existing footage into several aspect ratios from one timeline. An entity in a portable scene can be given a behavior written as a small [ALGAL]({{PRODUCT_URL_ALGAL}}) program. SlopCamera runs it with no model calls, tools, or other side effects and records the result as proposed performance directions for you to review. The post on [how SlopCamera uses ALGAL](/blog/how-slopcamera-uses-algal) covers the details.

## What comes next

The aim is that every picture, clip, or diagram SlopCamera renders carries the record of how it was made, so an agent can read that record and make the next version without guessing. New kinds of visual work will be added when they fit that pattern. SlopCamera does not promise specific features or dates.

## Limits

Generated media still needs a person to look at it. Models can change a subject's identity, its motion, or any text in the image, and the record of a run tells you what went in and what came out, not whether the result is good. The same sources can render slightly differently on another machine, because native tools, codecs, and GPU drivers vary. Exporting a native Blender rig to a portable format does not keep the rig editable. Native Python and custom workflow code run with your own user's access and are not sandboxed. The video editor works on recordings you already have and does not capture new ones. Media, GPU, and native profiles have their own requirements, which `slopcamera doctor` reports.

Latest release: [{{PUBLISHED_VERSION}}]({{RELEASE_URL}}).
