Render an eight-second title with animated SVG linework, then change its copy and color using the same HTML source. You will finish with two videos, two retained source requests, and ordinary Slopcamera projects that can be edited further.

The `html render` command ships in v{{PUBLISHED_VERSION}}. [Install Slopcamera](/docs), Git, and the local browser and FFmpeg/FFprobe runtimes reported by `slopcamera doctor --json`. This lesson uses original local artwork and no paid model, external font, or soundtrack. First-use runtime provisioning may need a network connection.

## Get the supplied scene

The example files were authored after v3.2.8 and live in the repository. Obtain a fresh checkout for the inputs; the installed release CLI can render them without rebuilding Slopcamera:

```sh
git clone --branch main https://github.com/hraness/slopcamera.git slopcamera-animation
cd slopcamera-animation
git rev-parse HEAD > slopcamera-example-commit.txt
slopcamera doctor --json
```

Keep commands in this directory because the requests resolve paths from the working directory. If you already have the current repository, use its root instead. Keep the commit record with the finished work.

Open [editorial.html](https://github.com/hraness/slopcamera/blob/main/examples/showcase/html/editorial.html) and [editorial.json](https://github.com/hraness/slopcamera/blob/main/examples/showcase/html/editorial.json). The HTML owns the typography and eighteen SVG ellipses. The request selects a 1280 × 720 canvas, eight seconds at 24 frames per second, and no external libraries. Its `document.path` points to that HTML file.

## Check the request

```sh
slopcamera html render --input examples/showcase/html/editorial.json --dry-run --json
```

The plan should describe 192 frames. It checks the declared source and timing; it does not prove that the animation looks right or that a render has completed. If a runtime is missing, resolve the specific finding from `doctor` before continuing.

## Render and inspect the title

::example[editorial]

```sh
slopcamera html render --input examples/showcase/html/editorial.json --json
```

This writes a local H.264 video, retains the HTML and request, and creates an ordinary project. The JSON result gives `output.path`, `source.path`, `receipt.path`, and `projectId`; keep those exact values instead of guessing the generated directory.

Open the returned video. Look for the title “Form follows a frame.” and the ellipse field moving around it. Inspect the beginning, middle, and ending: the text should stay readable and the linework should move without a jump inside the clip. This scene is silent.

## Revise the same source

::example[editorial-revised]

Open [editorial-revised.json](https://github.com/hraness/slopcamera/blob/main/examples/showcase/html/editorial-revised.json). Its document path and timing are unchanged. The request passes these parameters to the same HTML:

```json
{
  "variant": "revision",
  "accent": "#ffa775"
}
```

Render that revision:

```sh
slopcamera html render --input examples/showcase/html/editorial-revised.json --json
```

Open its returned `output.path`. The title now reads “Form follows your idea.” with a warm accent. Compare it with the first output: both use the same composition and duration, and each render retains its own request and source. Further changes can live in a copied request or an edited HTML document; preserve the originals when making a new variant.

Use the returned `projectId` with `slopcamera project inspect <project-id> --json` when you want to inspect the composition. Follow [Edit and deliver video](/docs/how-to/edit-video) to add footage or export another aspect ratio, or [Render motion graphics from HTML](/docs/how-to/render-motion-graphics) to choose a different animation technique.
