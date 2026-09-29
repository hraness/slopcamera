Use HyperFrames when the whole video is HTML motion graphics and you want exact, reproducible renders in Docker or rendering on HeyGen's cloud, AWS Lambda, or Google Cloud Run. Use Slopcamera when your coding agent also needs diagrams, 3D scenes, Blender, CadQuery, or Manim films, and edits of your own footage from one local CLI. Both keep an editable project instead of a flattened file, and each can render a clip for the other.

## Short answer

HyperFrames is HeyGen's open-source framework for turning HTML, CSS, media, and seekable animation into MP4. The agent writes HTML with timing data attributes, usually animated with GSAP. Agent skills teach the project format and the render loop.

Slopcamera is a video and graphics framework: packaged techniques behind one CLI. HTML is one of its source formats. The others are diagram JSON, Three.js scene JSON, parametric designs, native Blender, CadQuery, and Manim programs, and edit decisions over footage. The agent writes the short source file, and the CLI renders, checks, and writes the variants.

## Competitor details as of 28 September 2026

| HyperFrames detail | Value | Source |
| --- | --- | --- |
| What you write | HTML and CSS with data attributes for timing, animated with GSAP, CSS, Lottie, Three.js, Anime.js, WAAPI, or a custom adapter | [README](https://github.com/heygen-com/hyperframes/blob/main/README.md) |
| License | Apache 2.0, with no per-render fees or commercial-use thresholds | [README](https://github.com/heygen-com/hyperframes/blob/main/README.md) |
| Repeatable renders | Frame capture in headless Chrome with a seek-based clock. `render --docker` pins Chromium, fonts, and the FFmpeg encoder for exact output across machines | [Deterministic rendering](https://hyperframes.heygen.com/concepts/determinism) |
| Hosted rendering | `hyperframes cloud render` renders on HeyGen's managed cloud after sign-in | [Cloud rendering](https://hyperframes.heygen.com/deploy/cloud) |
| Your own cloud | Distributed rendering on AWS Lambda or Google Cloud Run | [AWS Lambda](https://hyperframes.heygen.com/deploy/aws-lambda), [Cloud Run](https://hyperframes.heygen.com/deploy/gcp-cloud-run) |
| Agent integration | 21 skills that agents load on demand, starting with a `/hyperframes` router | [README](https://github.com/heygen-com/hyperframes/blob/main/README.md) |
| Starting points | A catalog of blocks and components, and Figma import | [Documentation](https://hyperframes.heygen.com/introduction) |
| Community | 53,905 GitHub stars as of 28 September 2026 | [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes) |

## Where they differ

| | Slopcamera | HyperFrames |
| --- | --- | --- |
| What the agent writes | Diagram JSON, HTML in one of seven profiles, Three.js scene JSON, Blender, CadQuery, or Manim programs, and edit decisions for footage | HTML, CSS, and seekable animation |
| Renderers | Chrome for HTML and Three.js, plus Blender, CadQuery, and Manim on your machine | Headless Chrome |
| Outputs | Video, stills, light and dark SVG and PNG diagrams, editable `.tldr` files, STEP parts, and PDF drawing sheets | MP4 and other video formats |
| Repeatable renders | One absolute clock, seeded randomness, declared assets, and locked library versions for HTML. No claim of identical pixels across machines | Same rules, plus a Docker mode for exact output across machines |
| Your own footage | Cuts, speed, zooms, overlays, captions, filler removal, audio alignment, and 16:9, 9:16, 1:1, and 4:5 deliveries, recorded as edit decisions | Media placed in the HTML composition |
| Hosted rendering | Video renders run on your machine | HeyGen cloud, Lambda, or Cloud Run |
| Account | None for local rendering | None for local rendering; sign-in for HeyGen cloud rendering |
| License | MIT | Apache 2.0 |

Here is a real revision from the repository's diagram example. The agent changes one label:

```diff
-      "label": "Delivery",
+      "label": "Social delivery",
```

```sh
slopcamera diagram render source-to-film-revised.diagram.json
```

That one-line edit rewrites the `.tldr` file, both SVGs, and both PNGs.

## What HyperFrames does better

- Exact output across machines. Docker mode pins the browser, fonts, and encoder. Slopcamera repeats a render on the same machine and makes no cross-machine pixel claim.
- Hosted and distributed rendering. You can render on HeyGen's cloud without installing Chrome or FFmpeg, or split renders across Lambda or Cloud Run. Slopcamera renders on one machine.
- GSAP and the wider animation ecosystem. HyperFrames supports GSAP timelines, Lottie, and other runtimes through adapters. Slopcamera's HTML profiles each lock one library, and GSAP and Lottie are not among them.
- Depth of HTML guidance. Its 21 skills, block catalog, and Figma import cover HTML video in more detail than Slopcamera's HTML profiles.
- Community and backing. HyperFrames is maintained by HeyGen and has a much larger user base.

## What Slopcamera does better

- Engines beyond the browser. Blender, CadQuery, and Manim programs render from the same CLI, with their source kept next to the output.
- Diagrams. One `.diagram.json` source renders to an editable `.tldr` file and light and dark SVG and PNG, and a strict check reports layout problems first.
- 3D scenes the agent can revise. Scene JSON gives every part a stable ID, and the agent changes those parts with patches the CLI validates instead of rewriting a script.
- Editing footage you already have. Cuts, zooms, captions, filler removal, and aspect-ratio deliveries are stored as decisions over untouched originals.
- No Slopcamera account. Local rendering needs no sign-in; the optional hosted API renders diagrams without one and bills image generation to a prepaid Hraness Credits device token. Slopcamera is MIT licensed.

## Use both together

Render a title or product animation with HyperFrames, then add the MP4 to a Slopcamera project to cut it against footage, add captions, and deliver 9:16 and 1:1 versions:

```bash
slopcamera project add <project-id> title.mp4 --role b-roll --json
```

In the other direction, use a Slopcamera diagram SVG, a Blender still, or a Manim clip as media in a HyperFrames composition. See [Edit and deliver video](/docs/how-to/edit-video).

## FAQ

### Is Slopcamera built on HyperFrames?

No. Slopcamera has its own HTML renderer with seven profiles. See [HTML render profiles](/docs/reference/html-profiles).

### Can Slopcamera render GSAP animations?

Not through a GSAP profile. The `motion` profile uses the Motion library, and the `plain` profile covers CSS, SVG, and Canvas. Render GSAP work with HyperFrames and edit the result in Slopcamera.

### Are Slopcamera renders deterministic?

HTML renders use one absolute clock, seeded randomness, declared assets, and locked library versions, so a frame renders the same way whenever it is requested on the same machine. Slopcamera does not claim identical pixels across machines.

### Does Slopcamera have cloud rendering?

Not for video. The hosted API at `api.slopcamera.com` checks and renders diagrams for free with rate limits and generates images with prepaid Hraness Credits. See [Choose an interface](/docs/explanation/choose-an-interface).

### Which one should an agent learn first?

Start with the job. For a video that is all HTML graphics, HyperFrames is focused on exactly that. For a mix of diagrams, 3D, native films, and footage, Slopcamera covers more of it with one CLI.

## Related

- [Why Slopcamera](/docs/explanation/why-slopcamera) explains why the agent keeps a source file and reuses installed techniques.
- [Slopcamera vs Remotion](/docs/explanation/slopcamera-vs-remotion) compares the React video framework.
- [Remotion alternatives for coding agents](/docs/explanation/remotion-alternatives-for-coding-agents) lists other tools by job.
- [How to make a video with Claude Code or Codex](/blog/make-video-with-claude-code) walks through five recipes with the commands.
- The [techniques catalog](/docs/reference/techniques) lists every technique with its first command and a rendered example.
