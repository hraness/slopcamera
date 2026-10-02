Slopcamera lets your coding agent make images, diagrams, animation, 3D scenes and video from source files it can keep revising. Bottle a storm, send a tram toward the moon, or give existing footage a different purpose. Then ask for a specific change and render the next version from the same source.

{{LAUNCH_BEATS}}

## Make your first revision

On macOS, follow [your first animation](/docs/tutorials/first-animation) to render the tram and its larger-moon revision. Start with [Slopcamera and its Agent Skill installed](/docs), Git, and the browser and FFmpeg runtimes reported by `slopcamera doctor --json`. The tutorial supplies the original local artwork and needs no paid model. It renders silent picture; the tram films on this page add a separately authored score.

Give your agent a concrete direction:

> Make the moon larger so it dominates the destination. Keep the route, palette and timing. Keep both versions so I can compare.

The [remix guide](/docs/how-to/remix-the-showcase) links each film's source, requirements, score and production recipe. Use it to make another version of the storm, paper ocean, laundromat or jazz piece, or to compare the eclipse edits.

## Start with a diagram on macOS, Linux or Windows

The diagram starter needs no browser or paid model. After installing, run this in an empty directory:

```sh
slopcamera diagram init first.diagram.json
slopcamera diagram check first.diagram.json --strict
slopcamera diagram render first.diagram.json
```

You get light and dark SVG and PNG versions of the diagram, plus a tldraw file you can open and edit. The JSON you started from stays editable, and rendering again replaces only the derived files. The [first diagram tutorial](/docs/tutorials/first-diagram) walks through changing a label.

## Generate AI images with your key or with credits

For AI images, Slopcamera sends requests through your own Vercel AI Gateway key, so you choose the model and see live availability and pricing. A figure request looks like this:

```sh
slopcamera ai image generate --model openai/gpt-image-2 \
  --prompt-file figure.txt --size 1536x864 --count 1 --json
```

If you would rather not set up a key, you can buy prepaid credits through a hosted checkout, and prompt-only image generation then runs on a hosted service billed against those credits. That route accepts only a prompt and a model. Reference images, video, speech, and transcription go through your own key, and Slopcamera uploads named local media only when you pass its explicit upload flag. The [media generation guide](/docs/how-to/generate-media) covers both routes.

## Give a scene repeatable behavior

A character in a portable 3D scene can also be given a behavior written as a small [ALGAL]({{PRODUCT_URL_ALGAL}}) program, which Slopcamera runs with no model calls, tools or other side effects. The post on [how Slopcamera uses ALGAL](/blog/how-slopcamera-uses-algal) covers the details.

## Go deeper

- [Remix a film and inspect its source](/docs/how-to/remix-the-showcase).
- [Direct another film](/docs/how-to/direct-a-film).
- [Check formats, platforms and limits](/docs/reference/capabilities).
