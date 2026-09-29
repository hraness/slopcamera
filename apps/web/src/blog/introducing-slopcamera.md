SlopCamera lets your coding agent make images, diagrams, animation, 3D scenes and video from source files it can keep revising. Here it is in short pieces, each with a real render from the site's examples.

{{LAUNCH_FIGURE_FILM}}

{{LAUNCH_BEATS}}

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

## Where SlopCamera images already appear

Every live note on the aicharts blog carries a figure generated with SlopCamera, and GhostGet's WebMCP page uses a SlopCamera illustration whose prompt, job and receipt files sit next to the site code. SlopCamera used to be called Atet, and older records that credit Atet stay as they were recorded.

A character in a portable 3D scene can also be given a behavior written as a small [ALGAL]({{PRODUCT_URL_ALGAL}}) program, which SlopCamera runs with no model calls, tools or other side effects. The post on [how SlopCamera uses ALGAL](/blog/how-slopcamera-uses-algal) covers the details.

The install steps use release [{{PUBLISHED_VERSION}}]({{RELEASE_URL}}).
