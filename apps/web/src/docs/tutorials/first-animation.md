Send a midnight tram toward the moon, then make the moon larger in the same scene. You will finish with two 12-second films, their retained source requests, and ordinary Slopcamera projects you can keep editing.

Native HTML rendering currently requires macOS. Start with [Slopcamera installed](/docs), Git, and the browser and FFmpeg runtimes reported by `slopcamera doctor --json`. This lesson uses original local artwork and no paid model. It renders the picture; the scored showcase adds separately authored music and effects. First-use runtime provisioning may need a network connection.

## Get the supplied scene

The scene lives in the repository and works with the released `html render` command. Get a fresh checkout for these example files:

```sh
git clone --branch main https://github.com/hraness/slopcamera.git slopcamera-animation
cd slopcamera-animation
git rev-parse HEAD > slopcamera-example-commit.txt
slopcamera doctor --json
```

Keep commands in this directory: the requests resolve their document paths from the working directory. If you already have the current repository, use its root. Keep the commit record with your finished work.

Open [scene.html](https://github.com/hraness/slopcamera/blob/main/examples/showcase/studio-relaunch/last-tram/scene.html) and [last-tram-original.json](https://github.com/hraness/slopcamera/blob/main/examples/showcase/studio-relaunch/requests/last-tram-original.json). The HTML draws the city, tram, rain, and moon. The request selects a 1280 × 720 canvas, 12 seconds at 24 frames per second, and the `original` composition. It needs no external artwork, font, or animation library.

## Check the request

```sh
slopcamera html render --input examples/showcase/studio-relaunch/requests/last-tram-original.json --dry-run --json
```

The plan should describe 288 frames. It checks the declared source and timing. If a runtime is missing, resolve the specific finding from `doctor` before rendering.

## Render the journey

::example[last-tram]

```sh
slopcamera html render --input examples/showcase/studio-relaunch/requests/last-tram-original.json --json
```

The result gives `output.path`, `source.path`, `receipt.path`, and `projectId`. Open the returned video and retain those exact values with your request.

Watch the full sequence. The destination changes from CITY to MOON before departure; the copper tram follows the rising track; the ending gives you time to see its destination. Check the wheel contact during the climb and the readability of the final composition. Your tutorial render is silent.

## Revise the same source

::example[last-tram-revised]

Give your agent this direction:

> Make the moon larger so it dominates the destination. Keep the journey, palette, and timing.

The supplied [last-tram-moonrise.json](https://github.com/hraness/slopcamera/blob/main/examples/showcase/studio-relaunch/requests/last-tram-moonrise.json) already expresses that revision. Its document and timing match the first request; its `parameters.variant` changes from `original` to `moonrise`.

```sh
slopcamera html render --input examples/showcase/studio-relaunch/requests/last-tram-moonrise.json --json
```

Open the returned `output.path` and compare the same moment in both films. The larger moon changes the balance of the picture. Watch both endings too: a composition needs to work throughout the motion.

You now have two rendered versions and the source that produced each one. For another change, copy a request or edit the HTML while preserving your originals. Ask for a concrete decision about color, camera, scale, or timing using [Direct a film](/docs/how-to/direct-a-film).

## Keep editing

Use the returned project ID with `slopcamera project inspect <project-id> --json` to inspect the composition. Add a local soundtrack with [Make a music video](/docs/how-to/music-video), or follow [Edit and deliver video](/docs/how-to/edit-video) to combine footage and export another aspect ratio. [Render motion graphics from HTML](/docs/how-to/render-motion-graphics) covers the request and rendering options.
