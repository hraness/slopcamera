# HTML motion atlas

These original authored scenes show Slopcamera's seven admitted HTML profiles.
Every animation derives from the frame's absolute time. Check out these example
sources and use Slopcamera 3.2.8, its qualified browser, and
FFmpeg/FFprobe. All seven profiles are admitted in the 3.2.8 release.

| Request | Profile | Visible technique |
| --- | --- | --- |
| `editorial.json` | Plain HTML/SVG | Typeset title and eighteen animated SVG ellipses |
| `editorial-revised.json` | Plain HTML/SVG | The same source with changed copy and ink |
| `kinetic-title.json` | Motion | Seeked typography, line reveals and staggered bars |
| `contour-drift.json` | p5 | Seventy-two procedural contours redrawn at absolute time |
| `orbital-assembly.json` | Two.js | Sixty retained circles following five editable orbits |
| `living-colour.json` | Paper Shaders | Grain and a time-controlled mesh field beneath type |
| `interference-field.json` | vgpu | One full-screen WGSL pass with an authored interference field |
| `island-pulse.json` | Three.js | Original articulated robot, procedural island and musical timing |
| `lower-third.json` | Plain HTML/SVG | Transparent lower-third source, shown over a colored plate |

Run from the example checkout's repository root. With the installed release:

```sh
slopcamera html render --input examples/showcase/html/editorial.json --json
```

For a source checkout, the equivalent command is:

```sh
bun apps/desktop/cli/main.ts html render --input examples/showcase/html/editorial.json --json
```

The island example adds an original procedural soundtrack. Prepare it first:

```sh
python3 examples/showcase/html/synth-island.py
bun apps/desktop/cli/main.ts html render --input examples/showcase/html/island-pulse.json --json
```

The soundtrack is an eight-second, four-bar phrase at 120 BPM. The scene uses
explicit `musicClock`/`musicPulse` timing and named rigid joints. It demonstrates
articulation, not imported skinning or physical simulation. Its scenery is a
shortened and revised version of the repository's original island example.

The lower-third document leaves its page transparent. Its scene request chooses
a colored plate for the H.264 preview. Change `parameters.title`,
`parameters.subtitle`, and `parameters.index` to revise its copy. Use the HTML document through
`workflow.media.htmlOverlay` when the destination needs a transparent layer;
the finished H.264 preview itself does not carry alpha.

`author-atlas.py` retains the source-authoring recipe and uses the CLI-generated
scaffolds in `scaffolds/` for their admitted library and lifecycle contracts.
The generated HTML files are ordinary editable source. Do not run the authoring
script over hand-edited revisions without preserving those changes first.

All artwork and music are original procedural examples. The creative libraries
retain their upstream licenses. No external images, fonts, tracks or models are
included. None of these examples calls a paid provider.

Rendered media, project files and raw receipts live below ignored `artifacts/`.
A renderer receipt establishes execution identity, not visual acceptance.
