Ask a frontier model such as Claude Opus for an eight-second title animation and it can write one in a single reply: some HTML, a script that captures frames in a headless browser, and an FFmpeg command that encodes them. You don't need to install anything for that. The harder question is what happens on the next request, when the title needs new words, the diagram needs a dark version, or the same film has to run as a 9:16 story.

Revisions, variants, checks, and re-renders are where the two routes differ, and the examples below use files committed to the SlopCamera repository. With SlopCamera installed, the agent edits a short source file and a command does the rest. [Why SlopCamera](/docs/explanation/why-slopcamera) explains the model; this post measures it.

## What a one-shot reply contains

A model that one-shots a render writes the whole pipeline in its reply: the picture or scene, the code that turns it into pixels, and the code that exports each format. That is a reasonable way to make something once, and it has no install step. A framework ships that pipeline as installed commands instead, so the agent writes only the source for the picture.

The difference shows up when the work continues. Without a framework, the second request starts from whatever the first reply left behind. If the model kept its capture script, it has to read it again, change it, and hope the change does not break the export. If it did not, it writes the pipeline again, and the new output may not match the first in spacing, color, or timing.

With an installed framework, the pipeline is not in the conversation at all. SlopCamera's renderers, checks, and exporters are commands on your computer. The agent writes a small source file, runs a command, and reads the command's output. A revision is an edit to that file and one more command.

Remotion and HyperFrames, two frameworks for making video from code, also ship agent skills ([Remotion's skills](https://www.remotion.dev/docs/ai/skills), [HyperFrames' skills guide](https://hyperframes.heygen.com/guides/skills)). The same reasoning applies to any installed framework; the measurements below are SlopCamera's own.

## Four examples from the gallery, measured

The examples below come from the SlopCamera gallery. The first three are pairs: an original and a revision made from the same source. The fourth is a set of format variants cut from one film. The numbers are byte and line counts of files in the repository at commit [`a95e7fe`](https://github.com/hraness/slopcamera/tree/a95e7feef61c65076c3cfd37cc23c0357eb3ecd4/examples/showcase). They measure what the agent writes and what the commands produce. They are not counts of model tokens.

| Example | What the agent writes first | What the revision changes | What the command produces |
| --- | --- | --- | --- |
| Diagram label | 2,497-byte diagram file | 2 lines | 5 files, 670,169 bytes |
| Title animation | 386-byte scene file and 3,032-byte HTML page | name and 2 parameters | 1280 × 720 MP4, 192 frames |
| Pavilion dimensions | nothing (a template writes the design) | 39-byte values file | compile: scene, render request, 3 GLB geometry files; render: PNG |
| Aspect ratios | a 101-line variants script and a title-frame generator | no revision; 4 format variants | one MP4 per format |

### Rename one box in a diagram

The [source-to-film diagram](https://github.com/hraness/slopcamera/blob/a95e7feef61c65076c3cfd37cc23c0357eb3ecd4/examples/showcase/diagram/README.md) shows media entering a project and leaving as a preview or a delivery. Its source is a 131-line, 2,497-byte JSON file that names each shape, label, and arrow. The revision changes the label "Delivery" to "Social delivery" and the diagram's name. That is 2 changed lines.

```sh
slopcamera diagram check \
  examples/showcase/diagram/source-to-film-revised.diagram.json --strict
slopcamera diagram render \
  examples/showcase/diagram/source-to-film-revised.diagram.json \
  --out-dir artifacts/showcase/diagram
```

The render writes five files: an editable tldraw file (21,258 bytes), light and dark SVG (198,490 and 198,489 bytes), and light and dark PNG (126,223 and 125,709 bytes). A fresh render of the revised source matched the gallery's published files byte for byte, with the same SHA-256 hashes. Without the source file and a renderer, the model regenerates or hand-edits the SVG and PNG for each theme. The post on [editable diagrams with coding agents](/blog/editable-diagrams-with-coding-agents) walks through this loop in detail.

### Change the copy and color of a title animation

The [editorial title](/docs/tutorials/first-animation) is an HTML page with an animated field of SVG ellipses. The agent starts from the `plain` scaffold, a 1,148-byte HTML file that `slopcamera html scaffold plain --output editorial.html` writes, and ends with a 57-line, 3,032-byte page. A 13-line, 386-byte scene file names the page, the canvas size, the timing, and a `parameters` object.

The page reads two parameters: `accent`, which colors the title and the ellipses, and `variant`, which swaps the title text. The revision is a second scene file with a new name and those two values set. The committed diff is 17 added and 5 removed lines, because the file was also reformatted; the change in content is the name and the two parameters. The HTML page does not change.

```sh
slopcamera html render \
  --input examples/showcase/html/editorial-revised.json --dry-run --json
slopcamera html render \
  --input examples/showcase/html/editorial-revised.json --json
```

The dry run checks the source and its size limits without opening a browser. The render returns a 1280 × 720 H.264 MP4 (2,552,725 bytes for the revision, 2,891,811 for the original) and an editable project that holds it. It then verifies the frame count, size, and duration: 192 frames over 8 seconds at 24 frames per second. A fresh render of the revised scene matched the gallery's published MP4 byte for byte.

### Widen a pavilion without redrawing it

The [crescent pavilion](https://github.com/hraness/slopcamera/blob/a95e7feef61c65076c3cfd37cc23c0357eb3ecd4/examples/showcase/parametric/crescent-pavilion-wide/README.md) is a timber structure built from rules: a span, a crown height, a plan curvature, and rib sizes. The agent does not write its geometry. One command writes the design from a template:

```sh
slopcamera scene design init pavilion --template crescent-pavilion --json
```

That writes a 102,652-byte design and a 3,317-byte base scene. To make the wider version, the agent writes a 39-byte file, `{ "span": 8, "rise": 3.3, "bend": 1.6 }`, and runs:

```sh
slopcamera scene design set pavilion/design.json \
  --parameters pavilion-values.json --output pavilion-wide.design.json \
  --json
```

In the repository's formatted copy of the design, the revision is 3 changed lines out of 20,127. Two more commands turn the new design into a picture:

```sh
slopcamera scene design compile pavilion-wide.design.json \
  --scene pavilion/base.scene.json \
  --output-dir artifacts/showcase/pavilion-wide --json
slopcamera scene render artifacts/showcase/pavilion-wide/scene.json \
  --request artifacts/showcase/pavilion-wide/render.json --json
```

The compile step writes a scene file (10,971 bytes), a render request, three geometry files in GLB format (110,324, 15,808, and 5,944 bytes), one JSON file per GLB that lists its bounding box, materials, and node count, and a JSON record of the parameters used, the part and triangle counts, and hashes of the design and scene files. It does not draw anything. The render step returns the PNG; the gallery shows it as a 407,744-byte image, taken from the same camera as the original.

### Cut one film into four formats

The [four-ratio edit](https://github.com/hraness/slopcamera/blob/a95e7feef61c65076c3cfd37cc23c0357eb3ecd4/examples/showcase/edit/README.md) turns one product film into landscape, portrait, square, and 4:5 feed versions. The film itself comes from a successful render of the repository's native Blender product recipe, so this example needs Blender for that first step. The authored edit is more than a list of formats: a 101-line `ratio-variants.ts` script, a 64-line `create-ratio-frames.py` that draws the title frames, and a 56-line `review-ratios.ts` helper that renders sample frames for review. Inside the script, each format is one row: a width, a height, and a start and end camera zoom. Each format also has its own title frame, laid out by hand in the Python script with its own title positions, gradient stops, and margin. The four rendered MP4s are 1280 × 720 (421,148 bytes), 720 × 1280 (320,335 bytes), 960 × 960 (370,432 bytes), and 864 × 1080 (329,265 bytes). The gallery has no committed fifth format. Adding one would take a row in `ratio-variants.ts`, a new title-frame layout and aspect label in `create-ratio-frames.py`, and a re-run of that script, which needs Python and fontTools. For the common case, the `social-variants` workflow renders landscape, square, and vertical versions of one project without a script.

## What the commands check

A one-shot reply is checked by looking at it. SlopCamera's commands check the source before and after rendering, and a failed check gives the agent a short message instead of a broken file.

- `slopcamera diagram check` stops with exit code 1 and a message when the file is invalid, such as a stack wider than its canvas. With `--strict`, a layout finding, such as a label likely to overflow its box, sets exit code 2.
- `scene design set` enforces the template's limits. Asking for a 9-meter span stops with `Parameter span must be between 4 and 8.` and writes nothing.
- `html render --dry-run` checks the scene and its size limits before a browser starts, and a full render verifies the frame count, size, and duration of the MP4 it wrote.

None of these checks say whether the result looks good. Someone still has to watch the video and open the PNG.

## When one-shotting is the better choice

- **The picture is used once.** A throwaway sketch for a chat, a slide nobody will revise, or a quick test does not need a source file.
- **You need a format SlopCamera does not cover.** A model can write any code it likes. SlopCamera covers diagrams, HTML motion graphics, portable 3D scenes, parametric designs, video edits of existing recordings, and Blender, CadQuery, and Manim when you install those separately. The [techniques reference](/docs/reference/techniques) lists what is demonstrated.
- **You cannot install software.** SlopCamera runs on your computer and needs Bun 1.3.14 or newer. HTML renders need Chrome and FFmpeg, and native engines have their own installs. A chat window needs nothing.

## What installing costs

An agent skill is not free context. Anthropic's [Agent Skills documentation](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) says an installed skill costs about 100 tokens for its name and description until it is used. When a request matches, the agent reads the skill's instructions. SlopCamera's `SKILL.md` is 6,834 bytes, and it points to separate reference files that the agent reads only when a task needs them. The agent runs the CLI and reads what it prints; it does not need to read or write the renderer's code.

Your agent also has to learn a file format. The diagram file, the HTML scene file, and the design values are small, but they are SlopCamera's formats, and the agent reads examples or references before writing them.

## What these numbers do not show

Every measurement here comes from work done after a first render: revisions, format variants, and checks. The figures above are file sizes, not model tokens, and no controlled comparison of token use between a one-shot model and the same model with SlopCamera exists yet. The byte-for-byte matches were renders of the same source with the same toolchain; SlopCamera does not promise identical pixels on another machine, because browsers, codecs, and GPU drivers differ. The pavilion comparison is visual and says nothing about structural strength.

Latest release: [{{PUBLISHED_VERSION}}]({{RELEASE_URL}}).

```sh
{{ARCHIVE_INSTALL_COMMAND}}
{{SKILL_INSTALL_COMMAND}}
```
