Use Remotion when your team writes React and wants to embed videos in a web app or render many of them on AWS Lambda. Use Slopcamera when your coding agent needs diagrams, 3D scenes, Blender or Manim films, and edits of your own footage, all kept as short source files it can revise on your machine. They overlap on HTML-style motion graphics, and they work together: either one can render a file the other uses.

## Short answer

Remotion is a React framework for video. The agent writes React components, and Remotion renders them locally or on AWS Lambda. It has a larger community, an embeddable player, a template gallery, and a commercial license for larger companies.

Slopcamera is a media studio for coding agents: packaged techniques behind one CLI. The agent writes a short source file, such as diagram JSON, an HTML file from a profile scaffold, Three.js scene JSON, or a Blender, CadQuery, or Manim program. The CLI renders it, checks it, and writes the variants each technique supports, such as light and dark diagrams or 16:9 and 9:16 cuts of a video. Video renders run on your machine, and it is MIT licensed.

## Competitor details as of 28 September 2026

- **What you write.** React components. Source: [Remotion documentation](https://www.remotion.dev/docs/).
- **Free use.** Individuals, for-profit organizations with up to 3 employees, and non-profits, including commercial use. Source: [LICENSE.md](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md).
- **Company License.** $25 per seat per month, or $0.01 per render with a $100 monthly minimum; Enterprise from $500 per month. Source: [Remotion pricing](https://www.remotion.pro/license).
- **Cloud rendering.** Remotion Lambda runs renders in your AWS account. Cloud Run support is in alpha and not actively developed. Source: [Lambda](https://www.remotion.dev/docs/lambda), [Cloud Run](https://www.remotion.dev/docs/cloudrun).
- **In-app playback.** `@remotion/player` plays a composition inside a React app. Source: [Player](https://www.remotion.dev/player).
- **Agent integration.** Official Agent Skills for coding agents. Source: [Agent Skills](https://www.remotion.dev/docs/ai/skills).
- **Starting points.** A gallery of project templates. Source: [Templates](https://www.remotion.dev/templates).
- **Community.** 60,940 GitHub stars as of 28 September 2026. Source: [remotion-dev/remotion](https://github.com/remotion-dev/remotion).

## Where they differ

- **What the agent writes.** Slopcamera: Diagram JSON, HTML in one of seven profiles, Three.js scene JSON, Blender, CadQuery, or Manim programs, and edit decisions for footage. Remotion: React components in TypeScript or JavaScript.
- **What does the rendering.** Slopcamera: The `slopcamera` CLI with a local Chrome, FFmpeg, and any Blender, CadQuery, or Manim you install. Remotion: Remotion's renderer, locally or on Lambda.
- **Outputs.** Slopcamera: Video, stills, light and dark SVG and PNG diagrams, editable `.tldr` files, STEP parts, and PDF drawing sheets. Remotion: Video and still images.
- **Checks before render.** Slopcamera: Diagram layout checks, scene checks, and render plans. Remotion: Type checks and a live preview in its browser editor.
- **Your own footage.** Slopcamera: Cuts, speed, zooms, overlays, captions, filler removal, audio alignment, and 16:9, 9:16, 1:1, and 4:5 deliveries, recorded as edit decisions. Remotion: Placed in React components you write.
- **Playback in a web app.** Slopcamera: None; you watch the rendered file. Remotion: `@remotion/player`.
- **Hosted rendering.** Slopcamera: Video renders run on your machine. A hosted API checks and renders diagrams and generates images for platforms without a shell. Remotion: Lambda in your AWS account.
- **License.** Slopcamera: MIT. Remotion: Remotion License, free for small teams.

Both tools keep source, so a revision in either is an edit and a re-render. The difference is the source. In Remotion it is a React project. In Slopcamera it is a short file in a format the CLI checks and renders, so the agent does not write the layout, render, or export code.

Here is a real revision from the repository's diagram example. The agent changes one label:

```diff
-      "label": "Delivery",
+      "label": "Social delivery",
```

```sh
slopcamera diagram render source-to-film-revised.diagram.json
```

That one-line edit rewrites the `.tldr` file, both SVGs, and both PNGs.

## What Remotion does better

- Embedding. `@remotion/player` plays a video inside your web app, and a user can change its inputs before export. Slopcamera has no player.
- Rendering at scale. Remotion Lambda splits a render across many functions in your AWS account. Slopcamera renders on one machine.
- React. If your team already builds interfaces in React, the agent can reuse your components, data fetching, and design system.
- Ecosystem. Remotion has many more users, a template gallery, paid experts, and years of documented answers. Slopcamera is a small project.
- Commercial support. A Company License includes prioritized support.

## What SlopCamera does better

- Formats beyond React. The agent can write a diagram, a Three.js scene, a parametric design, or a Blender, CadQuery, or Manim program, and the same CLI renders each one.
- Diagrams. One `.diagram.json` source renders to an editable `.tldr` file and light and dark SVG and PNG, and a strict check reports layout problems first.
- Small revisions. A scene keeps named parts that the agent changes by ID with a patch the CLI validates, and a diagram revision is a one-line JSON edit. Neither requires rereading a component tree.
- Editing footage you already have. Cuts, zooms, captions, filler removal, and aspect-ratio deliveries are stored as decisions over untouched originals.
- License. Slopcamera is MIT licensed with no company tier, and local rendering needs no account.

## Use both together

Render a diagram, a Blender product shot, or a Manim sequence with Slopcamera, then use the PNG, SVG, or MP4 as an asset in a Remotion composition. In the other direction, render a Remotion composition to MP4 and add it to a Slopcamera project:

```bash
slopcamera project add <project-id> intro.mp4 --role b-roll --json
```

The cuts, captions, and delivery variants in that project stay editable. See [Edit and deliver video](/docs/how-to/edit-video).

## FAQ

### Is SlopCamera a replacement for Remotion?

Not for every job. If you need a player in your web app or rendering on Lambda, use Remotion. If you need diagrams, 3D, native films, or footage edits from one agent-facing CLI, use Slopcamera. Many projects can use both.

### Does SlopCamera use React?

No. HTML graphics use plain HTML in one of seven profiles: plain (no library), Motion, p5.js, Two.js, Paper Shaders, Three.js, or vgpu (WGSL). Each profile pins its library version. See [HTML render profiles](/docs/reference/html-profiles).

### Can my company use SlopCamera for free?

Slopcamera is MIT licensed, so there is no company tier. Optional AI generation uses your own Vercel AI Gateway key and bills through that account.

### Does SlopCamera use fewer tokens than Remotion?

Slopcamera has not published a measurement. The mechanism is that the agent writes a short source file and the CLI does the rendering, checks, and variants, so none of that code enters the conversation. Remotion's Agent Skills serve a similar purpose for React video.

### Can SlopCamera render in the cloud?

Not video. Video renders run on your machine. The hosted API at `api.slopcamera.com` checks and renders diagrams for free with rate limits and generates images with prepaid Hraness Credits. See [Choose an interface](/docs/explanation/choose-an-interface).

## Related

- [Why Slopcamera](/docs/explanation/why-slopcamera) explains why the agent keeps a source file and reuses installed techniques.
- [Slopcamera vs HyperFrames](/docs/explanation/slopcamera-vs-hyperframes) compares the HTML-to-video framework from HeyGen.
- [Remotion alternatives for coding agents](/docs/explanation/remotion-alternatives-for-coding-agents) lists other tools by job.
- [How to make a video with Claude Code or Codex](/blog/make-video-with-claude-code) walks through five recipes with the commands.
- The [techniques catalog](/docs/reference/techniques) lists every technique with its first command and a rendered example.
