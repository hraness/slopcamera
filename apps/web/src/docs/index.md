Slopcamera is a media studio for coding agents. It keeps editable source files, renders local or generated media from them, and assembles the results into projects on your machine. These pages cover the CLI, SDK, Agent Skill, and the optional macOS menu-bar companion, which installs separately.

Install the v{{PUBLISHED_VERSION}} release, or [build from source](/docs/how-to/install-from-source) to develop Slopcamera:

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

- [Create and revise your first diagram](/docs/tutorials/first-diagram): make a two-node flow, inspect its five exports, then change a label by editing the source.
- [Create and revise your first animation](/docs/tutorials/first-animation): render an eight-second title, change its copy and color, and keep both sources.
- [Render your first native film](/docs/tutorials/first-native-film): retain a Blender source, render a small shot, and export an ordinary project.

## Set up your coding agent

- [Claude Code](/docs/tutorials/claude-code): install the release and the Agent Skill so Claude Code can create visual media.
- [Codex](/docs/tutorials/codex): install the release and the Agent Skill inside a repository.
- [MCP clients](/docs/tutorials/mcp): expose fixed tools for diagrams, images, and scene inspection and planning to Cursor, Claude Desktop, and other MCP-capable clients.
- [Other agents](/docs/tutorials/other-agents): the portable skill target and plain CLI access.

## Complete a task

- [Build Slopcamera from source](/docs/how-to/install-from-source): record the commit, install locked dependencies, and build the SDK and CLI.
- [Render motion graphics from HTML](/docs/how-to/render-motion-graphics): choose among seven authoring profiles, render a graphic, and retain its source.
- [Edit and deliver video](/docs/how-to/edit-video): import footage, align related tracks, place overlays, and check a delivery.
- [Convert raster images to SVG](/docs/how-to/vectorize-images): trace artwork locally, compare a duotone treatment, and inspect fidelity.
- [Generate images, video, and narration](/docs/how-to/generate-media): use your own Vercel AI Gateway account, or prepaid Hraness Credits for prompt-only images.
- [Make an educational video](/docs/how-to/educational-video): keep mathematical visuals, narration, and timing evidence revisable.
- [Make a music video](/docs/how-to/music-video): render authored HTML visuals with a local track.
- [Render and edit spatial scenes](/docs/how-to/direct-scenes): patch named entities, use hardware rendering, or import a saved world.
- [Build and revise a parametric design](/docs/how-to/parametric-design): compile an architectural or furniture study, change its dimensions, and compare the rendered result.
- [Direct a cinematic world](/docs/how-to/cinematic-worlds): pack direction, galleries, effects, and an audit into the cinematic-world workflow.
- [Author a native film](/docs/how-to/native-films): use Blender, CadQuery, or Manim and share assets across renderers.
- [Direct short generated clips](/docs/how-to/direct-takes): budget, review takes, and preserve endpoint continuity.
- [Run or recover a workflow](/docs/how-to/run-workflows): use a built-in recipe or trusted Bun module and inspect its durable run.

## Look things up

- [Capabilities, versions, and platforms](/docs/reference/capabilities): release availability, supported profiles, and runtime requirements.
- [SDK surfaces](/docs/reference/sdk): portable and local imports, operation projections, and execution contracts.
- [The Slopcamera engine stack](/docs/reference/engines): what each part of the multimedia engine does, needs, and where its limits are.
- [The .diagram.json format](/docs/reference/diagram-format): the version-one diagram source, its five exports, and .tldr interchange.
- [HTML render profiles](/docs/reference/html-profiles): the seven locked browser profiles, from Motion and p5.js to Three.js and vgpu.
- [Spatial scenes, cameras, and saved worlds](/docs/reference/spatial-scenes): the .scene.json contract, hardware profiles, and bounded splats.
- [Local raster-to-SVG vectorization](/docs/reference/vectorization): how a pinned VTracer build traces a raster into SVG and checks fidelity.
- [Vercel AI Gateway media generation](/docs/reference/gateway-generation): credentials, live model discovery, upload acknowledgements, and receipts.
- [Video editing, compositing, and delivery](/docs/reference/video-pipeline): the FFmpeg-backed project model, typed edits, and delivery variants.
- [Native engines: Blender, CadQuery, and Manim](/docs/reference/native-engines): the source Slopcamera keeps, the runtime you choose, and the job lifecycle.
- [The Slopcamera MCP toolset](/docs/reference/mcp-tools): the 17 fixed tools, their bounds, and what stays CLI-only.

## Understand the design

- [Slopcamera use cases](/docs/explanation/use-cases): the jobs the studio covers, the surface each uses, and where it is not the right tool.
- [Choose an interface](/docs/explanation/choose-an-interface): compare the Agent Skill, CLI, SDK, MCP server, and hosted adapter.
- [How Slopcamera works: sources, renders, and projects](/docs/explanation/architecture): what stays editable after a render, what an operation record shows, and which work runs locally or in the cloud.
- [Why Slopcamera](/docs/explanation/why-slopcamera): what a retained-source local studio gives an agent that a loose toolchain does not.
- [Extend Slopcamera](/docs/explanation/extending): workflows, declarative graphs, the SDK, MCP, and separately installed native engines.
- [Choose an HTML authoring surface](/docs/explanation/html-authoring): why DOM, vector, Three.js, and explicit GPU profiles serve different jobs.

Every page is also available as Markdown: request any page with `Accept: text/markdown` or append `.md` to its path.
