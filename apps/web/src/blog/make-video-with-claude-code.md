To make a video with Claude Code or Codex, match the shot to the engine that draws its frames, then have the agent write a short source file for that engine. A kinetic title, a camera move through a 3D room, a glass product shot, a geometry lesson, and a cut of footage you already filmed each suit a different renderer. Keep the editable scene source or footage with the project so the agent can revise it later.

Install the renderer and skill once, then keep each video's sources and edit in a project. These recipes use SlopCamera to keep the source, rendered clips and final edit in one project.

## Choose the engine by the shot

Most "make me a video" requests fall into one of five kinds of shot, and each suits a different engine.

- **Titles, kinetic type, lower thirds, shader or chart backgrounds.** HTML in a local browser. The agent writes an HTML page and a short JSON request. Start with `slopcamera html render`.
- **A camera moving through a 3D arrangement of objects or media panels.** Three.js scene. The agent writes a scene JSON file with named entities and cameras. Start with `slopcamera scene render`.
- **A product film with physical materials, cloth, liquid, or a rigged character.** Blender. The agent writes a Python scene and a source list. Start with `slopcamera studio run`.
- **A math or science explainer.** Manim. The agent writes a Python scene and a lesson file. Start with `slopcamera studio run`.
- **Cuts, color, overlays, and aspect-ratio variants of footage you already have.** Project compositor with FFmpeg. The agent writes edit commands against a project. Start with `slopcamera project edit`.

The first two engines render in the local Chrome runtime that SlopCamera checks. Blender, Manim, and CadQuery are programs you install yourself; SlopCamera runs the copy you point it at. FFmpeg and FFprobe handle encoding for all five. Run `{{DOCTOR_COMMAND}}` to see what your machine can render before you ask for anything.

## What the agent writes

A video pipeline needs scene authoring, frame rendering, encoding and checks. You can keep a custom pipeline with the project or use a renderer that supplies those steps. A reusable pipeline lets a title revision change the scene without also changing how frames are captured.

With SlopCamera installed, the agent writes only the part that is specific to the video. In the recipes below, that is a JSON request next to an HTML page, a scene JSON file with named entities and cameras, or a Blender or Manim `scene.py`. The `slopcamera` command does the rendering, checks the frames, encodes the output, and prints a JSON result for the agent to read. A revision is an edit to the source followed by another render. The skill tells the agent which command fits which shot and what each source file looks like. Anthropic's [Agent Skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) describes the same pattern for scripts bundled with a skill: the agent runs the script through bash and receives only its output, so the script's code stays out of the context window.

The post on [one-shot renders and installed techniques](/blog/one-shot-render-vs-installed-techniques) follows four gallery revisions, showing the source fields that change and the formats each command produces.

## Install once for Claude Code or Codex

Install the latest release with Bun and check the machine:

```sh
{{ARCHIVE_INSTALL_COMMAND}}
{{DOCTOR_COMMAND}}
```

The [Claude Code tutorial](/docs/tutorials/claude-code) and the [Codex tutorial](/docs/tutorials/codex) walk through these steps and a first request. Then install the skill for your agent. For Claude Code, run:

```sh
{{SKILL_INSTALL_COMMAND_CLAUDE}}
```

For Codex, run:

```sh
{{SKILL_INSTALL_COMMAND}}
```

The `claude` target writes the skill to `~/.claude/skills`, where Claude Code looks for personal skills. The `agents` target writes to `~/.agents/skills`, which [Codex scans](https://learn.chatgpt.com/docs/build-skills) for user skills. Add `--scope project` to install into the current repository instead.

## Recipe 1: a title or motion graphic in HTML

The [editorial title example](https://github.com/hraness/slopcamera/tree/d2accc8badd991f288bb0c83668efc641aa89981/examples/showcase/html) renders "Form follows a frame" over moving SVG ellipses. Use the example files from the linked source revision and run these commands from the checkout root. The [first-animation tutorial](/docs/tutorials/first-animation) provides a guided starting point with another scene. The JSON request names the HTML document, the canvas, the timing, and any parameters:

```json
{
  "kind": "slopcamera.html-scene",
  "schemaVersion": 1,
  "name": "Form follows a frame",
  "document": { "path": "examples/showcase/html/editorial.html" },
  "canvas": { "width": 1280, "height": 720, "deviceScaleFactor": 1 },
  "timing": { "durationUs": 8000000, "fps": 24 },
  "libraries": [],
  "seed": 20260919,
  "background": "#192521",
  "parameters": {},
  "resources": []
}
```

```sh
slopcamera html render --input examples/showcase/html/editorial.json \
  --dry-run --json
slopcamera html render --input examples/showcase/html/editorial.json --json
```

The dry run checks the source and timing without opening a browser. The render writes an H.264 video and creates a project that keeps the HTML and the request. The revised example changes the request's name and sets two parameters, a new variant and a warm accent. The HTML page stays the same, and the render shows the new title.

To start a new document, `slopcamera html catalog` lists the scaffold profiles, and `slopcamera html scaffold motion --output title.html` writes a starting page for the Motion library. The [motion graphics guide](/docs/how-to/render-motion-graphics) shows a kinetic title, procedural contours, a shader background, a WGSL field, and a transparent lower third. For a music video, the [music video guide](/docs/how-to/music-video) times the scene to a tempo you declare in the request and keeps your track as a separate source in the project. It does not detect beats from the audio.

## Recipe 2: a camera move in a Three.js scene

When the shot is about space, such as a dolly toward a display or an orbit around a product, write a scene instead of a page. The [scene guide](/docs/how-to/direct-scenes) starts from a turning product on a pedestal:

```sh
slopcamera scene init product.scene.json --json
slopcamera scene inspect product.scene.json --json
```

Save a four-second video request as `video.json`:

```json
{
  "cameraId": "camera_hero",
  "selection": {
    "kind": "video",
    "range": { "startUs": 0, "endUs": 4000000 },
    "frameRate": { "numerator": 24, "denominator": 1 }
  },
  "mode": { "kind": "beauty" }
}
```

```sh
slopcamera scene plan product.scene.json --request video.json --json
slopcamera scene render product.scene.json --request video.json --json
```

The video is a lossless MOV with transparency for the project compositor; bring it into a project to deliver a format for posting. To change the product color, the agent writes a patch that names the entity and the digest `scene inspect` reported, then runs `scene patch` with a new output path. The original scene stays next to the revision. The same guide renders a dolly shot down a dark aisle of server racks lit by glowing status strips, and "Orbit around live media", where the camera circles a playing film and a diagram placed on separate planes.

## Recipe 3: a product film in Blender

For glass, brushed metal, cloth, or liquid, use Blender. The [first native film tutorial](/docs/tutorials/first-native-film) walks through the full loop on the CPU:

```sh
slopcamera studio init product --template blender-product --json
slopcamera studio bundle product/source.json --json > product-bundle.json
bun prepare-preview.ts   # helper from the tutorial
slopcamera studio plan product/preview.job.json --json
slopcamera studio probe product/preview.job.json \
  --blender-bin "$SLOPCAMERA_BLENDER_BIN" --json
slopcamera studio run product/preview.job.json \
  --blender-bin "$SLOPCAMERA_BLENDER_BIN" --allow-trusted-code --json
slopcamera studio assemble <studio-id> --output-id beauty \
  --name "Product preview" --json
```

The agent edits `scene.py`, and `source.json` lists the files included with the scene. Between bundling and planning, `prepare-preview.ts` copies the bundle digest into a new job file with a fresh job ID and sets a small CPU preview; the tutorial gives its short Bun source. `run` executes your Python as your user under `--allow-trusted-code`, which is not an operating-system sandbox, so read what the agent wrote before you run it. `run` returns a `jobId`; use it in place of `<studio-id>`. `assemble` turns the verified frames into an ordinary project.

The [native films guide](/docs/how-to/native-films) covers the finished examples: an optical instrument with brass and glass, a character that waves and blinks, cloth and liquid replayed from saved simulation caches, and a CadQuery bracket whose width changes from one parameter before Blender presents it. The [headless Blender, Manim, and CadQuery post](/blog/headless-blender-manim-cadquery-for-agents) explains why these run as scripts rather than as a live session.

## Recipe 4: a lesson in Manim

The [educational video guide](/docs/how-to/educational-video) scaffolds a ten-second portrait lesson in which nine plus sixteen unit tiles rearrange into a five-by-five square:

```sh
slopcamera studio init lesson --template manim-lesson --json
slopcamera studio bundle lesson/source.json --json > lesson-bundle.json
bun prepare-lesson.ts   # helper from the guide
slopcamera studio plan lesson/current.job.json --json
slopcamera studio probe lesson/current.job.json \
  --python /absolute/venv/bin/python --json
slopcamera studio run lesson/current.job.json \
  --python /absolute/venv/bin/python --allow-trusted-code --json
slopcamera studio assemble <studio-id> --output-id beauty \
  --name "Geometry lesson" --json
```

As in the Blender recipe, `prepare-lesson.ts` copies the bundle digest into `current.job.json` with a fresh job ID before planning; the guide gives its source. `probe` loads Manim and the fixed driver without running your scene. Pass the Python interpreter from the virtual environment where Manim is installed, and use the `jobId` that `run` returns in place of `<studio-id>`. The triangle's legs are parameters in `lesson.json`. They must form a whole-number right triangle, with legs of at most 12 and a hypotenuse of at most 15. To show a 6-8-10 triangle, the agent sets the legs to 6 and 8, bundles the source again, and renders; `scene.py` stays the same. Manim renders silent visuals; narration and sound belong in the project afterward.

## Recipe 5: edit footage and deliver variants

SlopCamera does not record your screen or camera. It edits media you already have. Start from a project that an earlier recipe created, or from an existing recording. `media color` grades a movie into a separate file and leaves the original unchanged. `project add` then imports the graded file into the project:

```sh
slopcamera media color product.mp4 --preset warm \
  --output grades/warm.mp4 --json
slopcamera project add <project-id> <graded-path> --role b-roll --json
slopcamera project edit <project-id> trim 0s 16s --json
slopcamera project edit <project-id> cut 4s 5s --json
slopcamera project render plan <project-id> --width 720 --height 1280 \
  --fps 24 --output renders/portrait.mp4 --json
slopcamera project render run <project-id> --width 720 --height 1280 \
  --fps 24 --output renders/portrait.mp4 --allow-unverified-sync --json
```

Use the `output.path` that `media color` returns in place of `<graded-path>`. `trim` and `cut` are separate decisions, so apply only the edit the footage needs. The plan lists what the render will use before anything is encoded.

Imported media starts with unverified sync, and `render run` refuses it unless you align it or pass `--allow-unverified-sync`. When two recordings of the same event must line up, `slopcamera align analyze` compares their audio and returns an alignment to apply. For a montage whose timing you set yourself, pass the flag and treat the render's timing as provisional.

The [edit video guide](/docs/how-to/edit-video) shows the same six-second product film in warm, cool, and mono grades, and the instrument framed for landscape, portrait, square, and 4:5 feeds. For repeated jobs, `slopcamera workflows list` shows the built-in workflows, such as `social-variants` for several aspect ratios from one project; [run or recover a workflow](/docs/how-to/run-workflows) explains the plan and run steps.

## Keep one project when the engine changes

A real brief rarely stays inside one engine. A launch clip might open on a Blender product shot, cut to a Three.js orbit, and close on an HTML title. `html render` and `studio assemble` each create an ordinary project; `project add` brings other rendered clips and audio into it, and `project render` delivers each format. The agent uses the same skill, the same inspect commands, and the same project format whichever engine drew the frames, and each source stays next to its output for the next revision.

The [techniques reference](/docs/reference/techniques) lists the recipes the skill draws on, with the guide that shows each one rendered.

## Other tools for the same job

Several projects give a coding agent video skills, and one of them may fit your team better.

- [Remotion](https://www.remotion.dev/docs/ai/skills) writes videos as React components and installs its agent skills with `npx skills add remotion-dev/skills`. Choose it if your team already works in React and wants a player component.
- [HyperFrames](https://github.com/heygen-com/hyperframes) renders HTML compositions to video and installs with `npx skills add heygen-com/hyperframes`. Choose it if every shot you need is HTML motion.
- [video-use](https://github.com/browser-use/video-use) edits a folder of raw clips into a cut with subtitles and color. It uses an ElevenLabs key for transcription, so it fits talking-head footage that needs cutting by what was said.

Remotion and HyperFrames also document rendering in the cloud, including on AWS Lambda ([Remotion Lambda](https://www.remotion.dev/docs/lambda), [HyperFrames README](https://github.com/heygen-com/hyperframes/blob/main/README.md)). SlopCamera renders video only on your machine.

SlopCamera fits when one project needs more than one engine, or when native tools such as Blender and Manim sit beside HTML. The comparisons with [Remotion](/docs/explanation/slopcamera-vs-remotion) and [HyperFrames](/docs/explanation/slopcamera-vs-hyperframes) go through the differences in detail.

## What you still check yourself

Every render here runs on your machine. A finished encode does not prove the video is right, so watch the start, the middle, the last frame, and each cut, and listen to any audio. Rendering the same source on another computer can produce small pixel differences, because browsers, GPUs, and native engine builds differ. The published Three.js gallery shots used a macOS WebGL2 hardware profile, and the native examples need Blender, Manim, or CadQuery installed at the versions their guides name.
