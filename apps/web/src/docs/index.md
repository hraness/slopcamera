SlopCamera is a media studio for coding agents. Your agent writes a short source file, the CLI checks and renders it on your machine, and a revision is an edit to that file and a new render. These pages cover the CLI, SDK and Agent Skill.

It works with Claude Code, Codex, Cursor, and other coding agents through the CLI, the Agent Skill, and an MCP server. The source can be a diagram, an HTML animation, a 3D scene, a Blender, CadQuery, or Manim program, or edit decisions over your own footage.

Install the v{{PUBLISHED_VERSION}} release, or [build from source](/docs/how-to/install-from-source) to develop SlopCamera:

```sh
{{ARCHIVE_INSTALL_COMMAND}}
```

Then give your coding agent the matching guidance:

```sh
{{SKILL_INSTALL_COMMAND}}
# For Claude Code:
{{SKILL_INSTALL_COMMAND_CLAUDE}}
```

## Learn by making something

- [Create and revise your first animation](/docs/tutorials/first-animation): send a midnight tram toward the moon, enlarge the moon, and keep both films.
- [Create and revise your first diagram](/docs/tutorials/first-diagram): make a two-node flow, inspect its five exports, then change a label by editing the source.
- [Render your first native film](/docs/tutorials/first-native-film): retain a Blender source, render a small shot, and export an ordinary project.

## Set up your coding agent

- [Claude Code](/docs/tutorials/claude-code): install the release and the Agent Skill so Claude Code can create visual media.
- [Codex](/docs/tutorials/codex): install the release and the Agent Skill inside a repository.
- [MCP clients](/docs/tutorials/mcp): expose fixed tools for diagrams, images, and scene inspection and planning to Cursor, Claude Desktop, and other MCP-capable clients.
- [Other agents](/docs/tutorials/other-agents): the portable skill target and plain CLI access.

## Complete a task

- [Remix the showcase](/docs/how-to/remix-the-showcase): open the finished films, study the creative decisions, and make your own version.
- [Direct a film](/docs/how-to/direct-a-film): write a useful brief, test the hardest shot, and refine composition, movement, and sound.
- [Build SlopCamera from source](/docs/how-to/install-from-source): record the commit, install locked dependencies, and build the SDK and CLI.
- [Render motion graphics from HTML](/docs/how-to/render-motion-graphics): choose among seven authoring profiles, render a graphic, and retain its source.
- [Edit and deliver video](/docs/how-to/edit-video): import footage, align related tracks, place overlays, and check a delivery.
- [Convert raster images to SVG](/docs/how-to/vectorize-images): trace artwork locally, compare a duotone treatment, and inspect fidelity.
- [Paint a deterministic oil study](/docs/how-to/oil-paint): mix named pigment tubes into piles, carry wet paint with bounded bristles, and replay the result.
- [Generate images, video, and narration](/docs/how-to/generate-media): use your own Vercel AI Gateway account, or prepaid Hraness Credits for prompt-only images.
- [Make a scrolling pixel landscape](/docs/how-to/pixel-landscapes): compare continuous backgrounds and turn them into palette-checked alpha pixels.
- [Make a math explainer video with Manim](/docs/how-to/educational-video): keep mathematical visuals, narration, and timing evidence revisable.
- [Make a music video](/docs/how-to/music-video): render authored HTML visuals with a local track.
- [Render and edit Three.js 3D scenes](/docs/how-to/direct-scenes): patch named entities, use hardware rendering, or import a saved world.
- [Build and revise a parametric design](/docs/how-to/parametric-design): compile an architectural or furniture study, change its dimensions, and compare the rendered result.
- [Plan camera moves, lighting, and effects for a 3D scene](/docs/how-to/cinematic-worlds): pack direction, galleries, effects, and an audit into the cinematic-world workflow.
- [Render Blender, CadQuery, and Manim films from source](/docs/how-to/native-films): use Blender, CadQuery, or Manim and share assets across renderers.
- [Make web-ready 3D assets with Blender](/docs/how-to/web-ready-3d-assets): bake detail onto a light mesh, export GLB levels of detail, and check budgets.
- [Direct short generated clips](/docs/how-to/direct-takes): budget, review takes, and preserve endpoint continuity.
- [Run or recover a workflow](/docs/how-to/run-workflows): use a built-in recipe or trusted Bun module and inspect its durable run.

## Look things up

- [Capabilities, versions, and platforms](/docs/reference/capabilities): release availability, supported profiles, and runtime requirements.
- [SDK surfaces](/docs/reference/sdk): portable and local imports, operation projections, and execution contracts.
- [The SlopCamera engine stack](/docs/reference/engines): what each part of the multimedia engine does, needs, and where its limits are.
- [The .diagram.json format](/docs/reference/diagram-format): the version-one diagram source, its five exports, and .tldr interchange.
- [HTML render profiles](/docs/reference/html-profiles): the seven locked browser profiles, from Motion and p5.js to Three.js and vgpu.
- [Spatial scenes, cameras, and saved worlds](/docs/reference/spatial-scenes): the .scene.json contract, hardware profiles, and bounded splats.
- [Local raster-to-SVG vectorization](/docs/reference/vectorization): how a pinned VTracer build traces a raster into SVG and checks fidelity.
- [Vercel AI Gateway media generation](/docs/reference/gateway-generation): credentials, live model discovery, upload acknowledgements, and receipts.
- [Video editing, compositing, and delivery](/docs/reference/video-pipeline): the FFmpeg-backed project model, typed edits, and delivery variants.
- [Native engines: Blender, CadQuery, and Manim](/docs/reference/native-engines): the source SlopCamera keeps, the runtime you choose, and the job lifecycle.
- [The SlopCamera MCP toolset](/docs/reference/mcp-tools): the 21 fixed tools, their bounds, and what stays CLI-only.

## Understand the design

- [SlopCamera use cases](/docs/explanation/use-cases): the jobs SlopCamera covers, the interface each uses, and where it is not the right tool.
- [Choose an interface](/docs/explanation/choose-an-interface): compare the Agent Skill, CLI, SDK, MCP server, and hosted adapter.
- [How SlopCamera works: sources, renders, and projects](/docs/explanation/architecture): what stays editable after a render, what an operation record shows, and which work runs locally or in the cloud.
- [Why SlopCamera](/docs/explanation/why-slopcamera): why the agent writes a short source file and reuses installed techniques instead of a loose toolchain.
- [Agent cost study](/docs/explanation/token-benchmark): methods and reports from a controlled study of first-render and revision costs.
- [Extend SlopCamera](/docs/explanation/extending): workflows, declarative graphs, the SDK, MCP, and separately installed native engines.
- [Choose an HTML authoring surface](/docs/explanation/html-authoring): why DOM, vector, Three.js, and explicit GPU profiles serve different jobs.

Every page is also available as Markdown: request any page with `Accept: text/markdown` or append `.md` to its path.
