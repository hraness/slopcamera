Remotion is a widely used way to make video with code, but a coding agent can drive other tools too. The options below are grouped by job, with what the agent writes, the license, and the trade-offs. Details were checked on 28 September 2026 against each project's repository and documentation.

## Short answer

- For motion graphics written as web code, use Remotion (React), HyperFrames (HTML), Revideo, or Motion Canvas (TypeScript).
- For math and explainer animation, use Manim.
- For cutting footage you already shot, use video-use or Slopcamera projects.
- For 3D in Blender, use MCP for Blender for interactive control, or Slopcamera's native studio to keep Blender, CadQuery, and Manim programs as source the agent edits and renders again.
- For diagrams, 3D scenes, native films, and footage edits from one CLI, use Slopcamera.

## At a glance

- **[Remotion](https://github.com/remotion-dev/remotion).** The agent writes React components. Chrome renders them, locally or on AWS Lambda. Remotion License: free for up to 3 employees, paid above. 60,940 GitHub stars.
- **[HyperFrames](https://github.com/heygen-com/hyperframes).** The agent writes HTML, CSS, and seekable animation. Headless Chrome renders it, locally, in Docker, or on HeyGen's cloud, Lambda, or Cloud Run. Apache 2.0. 53,905 GitHub stars.
- **[Revideo](https://github.com/midrender/revideo).** The agent writes TypeScript scenes. A headless render API renders them. MIT. 4,070 GitHub stars.
- **[Motion Canvas](https://github.com/motion-canvas/motion-canvas).** The agent writes TypeScript generator functions. Its editor renders them with a live preview. MIT. 19,194 GitHub stars.
- **[Manim Community](https://github.com/ManimCommunity/manim).** The agent writes Python scenes. Cairo or OpenGL renders them. MIT. 41,118 GitHub stars.
- **[video-use](https://github.com/browser-use/video-use).** The agent writes nothing; it follows a skill over your footage. FFmpeg renders, with overlays from other tools. MIT. 27,501 GitHub stars.
- **[MCP for Blender](https://github.com/ahujasid/mcp-for-blender).** The agent sends Blender commands over MCP to a running Blender. MIT. 29,552 GitHub stars.
- **[Slopcamera](https://github.com/hraness/slopcamera).** The agent writes diagram JSON, HTML in seven profiles, scene JSON, Blender, CadQuery, and Manim programs, and edit decisions. Local Chrome, FFmpeg, Blender, CadQuery, and Manim render them. MIT. 6 GitHub stars.

Star counts come from the GitHub API on 28 September 2026. They show how many people have looked at a project, not how well it fits your job.

## Motion graphics written as web code

### Remotion

Remotion renders React components to video. It has the largest community in this group, an embeddable `@remotion/player` for web apps, a template gallery, official [Agent Skills](https://www.remotion.dev/docs/ai/skills), and [Remotion Lambda](https://www.remotion.dev/docs/lambda) for distributed rendering in your AWS account. Organizations with more than 3 employees need a [Company License](https://www.remotion.pro/license), from $25 per seat per month. Pick it when your team already writes React or you need a player inside your product.

### HyperFrames

HyperFrames, from HeyGen, renders HTML and CSS animated with GSAP, CSS, Lottie, Three.js, and other runtimes. It ships 21 agent skills and a Docker mode that pins Chromium, fonts, and the encoder for [exact output across machines](https://hyperframes.heygen.com/concepts/determinism). You can render on [HeyGen's cloud](https://hyperframes.heygen.com/deploy/cloud), Lambda, or Cloud Run. Pick it when the whole video is HTML graphics and you want no licensing threshold. See [Slopcamera vs HyperFrames](/docs/explanation/slopcamera-vs-hyperframes).

### Revideo

Revideo describes scenes in TypeScript and ships a headless render API and a React player. It is the engine behind Midrender. Its repository was last updated in July 2026, so check recent activity before you depend on it.

### Motion Canvas

Motion Canvas programs vector animation with TypeScript generator functions and includes an editor with a real-time preview. It is built for informative animation synced to voice-over. The latest tagged release is v3.17.2 from December 2024. The editor is designed for a person at the screen, so an agent gets less from it than from a render command.

## Math and explainer animation

### Manim

Manim renders Python scenes of equations, graphs, and geometric motion. Use the community edition, [ManimCommunity/manim](https://github.com/ManimCommunity/manim), for maintained releases and documentation. The original [3b1b/manim](https://github.com/3b1b/manim), also called ManimGL, began as the project that animates 3Blue1Brown videos. It has years of public examples to learn from.

Slopcamera's native studio runs Manim 0.21.0 programs and keeps the source next to the render. See [Make an educational video](/docs/how-to/educational-video).

## Editing footage you already shot

### video-use

video-use, from Browser Use, is an agent skill for editing a folder of raw footage in a conversation. It cuts filler words and dead space, grades color, burns subtitles, and hands animation overlays to HyperFrames, Remotion, Manim, or PIL. Setup asks for an ElevenLabs API key. Pick it when you want a finished cut from raw takes with little setup.

### SlopCamera projects

A Slopcamera project stores cuts, speed changes, zooms, overlays, captions, filler removal, and audio alignment as edit decisions over untouched originals, and renders 16:9, 9:16, 1:1, and 4:5 deliveries from one edit. Pick it when you will revise the edit later or need several aspect ratios. See [Edit and deliver video](/docs/how-to/edit-video).

## 3D and native tools

### MCP for Blender

MCP for Blender connects an MCP client to a running Blender through an MCP server and a Blender add-on, so the agent can create and change objects interactively. Pick it when you want to steer a Blender session live.

### SlopCamera native studio

Slopcamera runs Blender, CadQuery, and Manim programs that you allow with `--allow-trusted-code`, with 7 starters, and records what ran. A revision is an edit to the program and a re-render. It also renders Three.js scenes from scene JSON, where every part has a stable ID the agent can patch. See [Render native films](/docs/how-to/native-films) and [Directed spatial scenes](/docs/reference/spatial-scenes).

## Several jobs from one CLI

### SlopCamera

Slopcamera packages diagrams, HTML motion graphics, Three.js scenes, parametric designs, native Blender, CadQuery, and Manim films, and footage editing behind one CLI, an Agent Skill, an SDK, and 17 MCP tools. The agent writes a short source file, and the CLI renders it, checks it, and writes the variants each technique supports, such as light and dark diagrams or 16:9 and 9:16 cuts of a video. It renders locally, with no account, under the MIT license.

Choose something else when you need an embeddable player (Remotion), hosted or distributed rendering (Remotion or HyperFrames), exact pixels across machines (HyperFrames in Docker), or GSAP (HyperFrames). See the [techniques catalog](/docs/reference/techniques) for what Slopcamera covers today.

## FAQ

### What is the best Remotion alternative for Claude Code?

It depends on the job. HyperFrames is the closest match for HTML motion graphics. Manim fits math explainers. video-use and Slopcamera projects edit existing footage. Slopcamera covers diagrams, 3D, and native films from one CLI.

### Is there a free alternative to Remotion for companies?

HyperFrames (Apache 2.0), Revideo, Motion Canvas, Manim, video-use, and Slopcamera (all MIT) have no company license tier.

### Can I use more than one of these together?

Yes. Most of them render ordinary MP4, PNG, or SVG files, so one tool's output can be media in another. For example, render a title in HyperFrames or Remotion and add it to a Slopcamera project for captions and aspect-ratio deliveries.

### Which of these render in the cloud?

Remotion renders on AWS Lambda. HyperFrames renders on HeyGen's cloud, AWS Lambda, or Google Cloud Run. The others render on your machine.

## Related

- [Why Slopcamera](/docs/explanation/why-slopcamera) explains why the agent keeps a source file and reuses installed techniques.
- [Slopcamera vs Remotion](/docs/explanation/slopcamera-vs-remotion) compares the two in detail.
- [Slopcamera vs HyperFrames](/docs/explanation/slopcamera-vs-hyperframes) compares the two in detail.
- [How to make a video with Claude Code or Codex](/blog/make-video-with-claude-code) walks through five recipes with the commands.
- [Headless Blender, Manim, and CadQuery for coding agents](/blog/headless-blender-manim-cadquery-for-agents) compares a live Blender MCP session with source the agent keeps.
