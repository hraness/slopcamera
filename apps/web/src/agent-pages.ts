import { archiveInstall, publishedRelease, sourceInstall } from "./published-release"

export const homeMarkdown = `# Direct scenes and films with your coding agent

Slopcamera is a local visual studio for coding agents. Author scenes, combine generated and recorded media, and export images, diagrams, animation, and video from retained sources.

Free and open source under the MIT license. Verified release. Requires Bun 1.3.14 or newer. Recording needs macOS.

## Your first local diagram

In a new working directory, use the included input to produce five local outputs with no model account:

\`\`\`sh
slopcamera diagram init first.diagram.json
slopcamera diagram check first.diagram.json --strict
slopcamera diagram render first.diagram.json
\`\`\`

The starter writes \`example-flow.tldr\`, \`example-flow.light.svg\`, \`example-flow.dark.svg\`, \`example-flow.light.png\`, and \`example-flow.dark.png\`. Rendering again replaces these derived files. Follow the [complete tutorial](https://slopcamera.com/docs/tutorials/first-diagram.md) to inspect the result and change a label.

Slopcamera covers four output families: images, diagrams, animated loops, and video. Start with the Agent Skill and CLI; the TypeScript SDK supports integrations, and MCP exposes a fixed subset. Video delivery covers 16:9, 9:16, 1:1, and 4:5 with clean and captioned cuts from one edit.

- Author editable scenes, diagrams, and motion. Direct a camera through a world or build an educational film from native source.
- Compose rendered shots with generated media and real footage. Add world-space screens, narration, captions, graphics, and sound.
- Deliver the required formats and retain the sources and project decisions for the next revision.

## Install

Install the verified Slopcamera v${publishedRelease.version} release with Bun 1.3.14 or newer:

\`\`\`sh
${archiveInstall.command}
\`\`\`

Then install the matching Agent Skill:

\`\`\`sh
${archiveInstall.skillCommand}
# For Claude Code:
${archiveInstall.alternateSkillCommand}
\`\`\`

Start a new agent session. Use \`slopcamera skill install\` for Codex by default, or add \`--scope project\` inside the target repository. Check local tools with \`slopcamera doctor --json\`.

For source-only capabilities or development, follow the [complete source-install guide](${sourceInstall.guideUrl}). It records the commit, installs locked dependencies, builds the SDK and CLI, and installs the guide from that same checkout. Native engines install separately.

## Give your agent the whole creative job

### Direct a scene

Create a product reveal with a moving camera. Keep the model editable, mount the product diagram on a screen in the scene, and show contact frames before rendering.

Portable Three.js scenes support a defined GLB subset, calibrated cameras, an explicit hardware GPU profile, and saved splat worlds through Spark. Splats capture appearance, not collision geometry. [Direct a scene](https://slopcamera.com/docs/how-to/direct-scenes.md).

### Film a native world

Build a shaded street with an original presenter. Put an animated explanation on a screen in the world, then pull the camera back into the city.

Blender handles native scenes, character rigs, cloth and liquid caches; CadQuery handles solids and STEP. Native \`studio\` commands require the current source build and separately installed engines. [Make a native film](https://slopcamera.com/docs/tutorials/first-native-film.md).

### Explain an idea visually

Turn the services in this repository into an editable diagram, then animate the explanation. Add a presenter, readable mathematics, and captions where they help.

Use diagrams, HTML/SVG motion, shader graphics, and optional vgpu raster passes. Manim educational films use the source-build studio. [Make an educational video](https://slopcamera.com/docs/how-to/educational-video.md).

### Edit and finish a video

Record a product demo, remove pauses, zoom into important clicks, and add \`logo.svg\`. Generate a calm voiceover from \`script.txt\`, then preview clean and captioned versions in 16:9, 9:16, 1:1, and 4:5.

Edit screen recordings and imported footage, or generate images, video, and voice through your own Gateway access. Source-build shot recipes retain budgets, reviewed takes, and continuation references. [Edit video](https://slopcamera.com/docs/how-to/edit-video.md) · [Generate media](https://slopcamera.com/docs/how-to/generate-media.md) · [Direct takes](https://slopcamera.com/docs/how-to/direct-takes.md).

**Source availability:** Build from \`main\` for portable scenes, the qualified Three.js GPU profile, saved worlds, native \`studio\`, shot-recipe \`direct\`, and \`scene camera-track\`. Engines install separately. [Check capabilities and requirements](https://slopcamera.com/docs/reference/capabilities.md).

After a job runs, your agent should show the result and report the source, preview, and final output files. Ask for changes in the same plain language.

## From source to a finished film

Keep native rigs and simulations, portable geometry and cameras, diagram objects and labels, and video edits in their respective sources.

1. Prepare the sources. Inspect available tools, then author scenes or diagrams, import assets, or record on macOS.
2. Direct the result. Set cameras, shots, timing, and outputs. Discover Gateway models for generated images, video, voice, or transcripts.
3. Compose the film. Combine selected shots, edit timing, and add captions, graphics, and motion. Reframe footage and apply color and audio treatment.
4. Review before final. Inspect contact frames, motion, sound, and continuity. Preview and final renders use the same timeline and composition.
5. Deliver and revise. Export finished videos. Retain sources, project decisions, and receipts for revisions.

Share supported geometry and calibrated cameras, or mount images and video in world space. Raster handoffs preserve pixels, without reconstructing geometry or rigs. [Understand scene interchange](https://slopcamera.com/docs/how-to/native-films.md).

## Choose how your agent works

- Agent Skill: version-matched guidance for choosing creative operations.
- CLI: human-readable commands and stable JSON for the broad local workflow. Start with \`slopcamera workflows list --json\`.
- TypeScript SDK: declarative or imperative media work in Bun. For example, import \`vectorizeImage\` from \`@hraness/slopcamera\`.
- MCP: a fixed toolset for checking and rendering diagrams, vectorizing images, and generating images within one selected root. Run \`slopcamera mcp --root /absolute/path/to/workspace\`. It does not expose every CLI command.

## Retain the sources behind the result

Source media stays unchanged under normal edit operations. Slopcamera keeps authored sources, editing decisions, previews, and final outputs in storage you control. There is no Slopcamera account or hosted project database. Native scenes and portable assets keep their own capabilities; rendered derivatives connect them.

Local processes use your Vercel AI Gateway credential without storing or printing it. Media uploads require acknowledgement. This website never receives a Gateway credential. Important operations keep secret-free receipts that name their inputs and outputs.

Native Python execution requires separate authorization. Loading a custom Bun workflow evaluates its module, including during check and plan; review the source before invoking it. Both run as your current user, without an operating-system sandbox. Runtime hashes identify observed tools; they do not make arbitrary source hermetic. Read the [security policy](https://github.com/hraness/slopcamera/blob/main/SECURITY.md) and [privacy guide](https://github.com/hraness/slopcamera/blob/main/PRIVACY.md).

## Documentation

The [documentation index](https://slopcamera.com/docs) connects learning, task guides, reference, and explanation:

- [Your first diagram](https://slopcamera.com/docs/tutorials/first-diagram)
- [Set up your coding agent](https://slopcamera.com/docs/tutorials/claude-code)
- [Run a workflow](https://slopcamera.com/docs/how-to/run-workflows)
- [Capabilities and requirements](https://slopcamera.com/docs/reference/capabilities)
- [Architecture](https://slopcamera.com/docs/explanation/architecture)

## Before you install

### Does Slopcamera require an account or subscription?

No Slopcamera account or subscription exists. Slopcamera is free and open source under the MIT license. Model-backed generation uses caller-owned Vercel AI Gateway access.

### What does it cost?

Slopcamera costs nothing. Editing, previews, diagrams, vectorization, and exports run on your machine. Model usage is billed to your own Gateway account, not to Slopcamera.

### Where do my Gateway credentials live?

In the local CLI or SDK process environment. Slopcamera does not store or print the credential. With a linked Vercel project, \`vercel env run -- <command>\` injects it for one command without writing it into the project.

### Which platforms does Slopcamera run on?

The CLI needs Bun 1.3.14+ on macOS, Linux, or Windows; recording needs macOS permissions. GPU, browser, codec, and engine requirements vary; \`slopcamera doctor\` and the capability reference identify those requirements.

### Does Slopcamera overwrite original media?

Normal edit operations retain originals and record project decisions. Rendering the starter diagram again replaces its five derived outputs.

### When can local media leave the machine?

Editing and rendering stay local. Gateway generation and selected cloud analysis upload named media only after acknowledgement. Native Python and custom Bun workflows run with your current-user access, including potential network access.

### Does the website generate or edit media?

No. The website explains and installs the local system. Media work runs through local tools; MCP exposes only its documented subset.

## Built by Ben Guo

Slopcamera is built by Ben Guo, a musician and builder, formerly a founder and engineering leader at companies including Venmo and Stripe, now building from Puerto Rico.

[hraness.com](https://hraness.com) · [@hraness](https://x.com/hraness) · [GitHub](https://github.com/hraness/slopcamera)

## Sitemap

- [Slopcamera home](https://slopcamera.com/index.md)
- [Machine-readable site guide](https://slopcamera.com/llms.txt)
- [Markdown sitemap](https://slopcamera.com/sitemap.md)
- [XML sitemap](https://slopcamera.com/sitemap.xml)
`

export const notFoundMarkdown = `# Page not found

The requested Slopcamera resource does not exist. Use one of these public indexes to recover:

- [Home and installation guide](https://slopcamera.com/)
- [Documentation](https://slopcamera.com/docs)
- [Machine-readable site guide](https://slopcamera.com/llms.txt)
- [Markdown sitemap](https://slopcamera.com/sitemap.md)
- [XML sitemap](https://slopcamera.com/sitemap.xml)
`

export const llmsTxt = `# Slopcamera

> Slopcamera is a local visual studio for coding agents. Author scenes, combine generated and recorded media, and export images, diagrams, animation, and video from retained sources.

Use the Agent Skill and CLI for the broad local workflow. The TypeScript SDK supports integrations; MCP exposes a fixed diagram and image subset. There is no Slopcamera account or hosted project database.

## When to use Slopcamera

Use Slopcamera to author portable scenes and direct cameras; film saved worlds; create diagrams and motion graphics; edit footage and deliver multiple formats; or generate images, video, speech, and transcripts through your own Vercel AI Gateway access. Native Blender, CadQuery, and Manim workflows add detailed worlds and educational films in the current source build.

Install the verified release with \`${archiveInstall.command}\`, then its matching Agent Skill with \`${archiveInstall.skillCommand}\` (Bun 1.3.14 or newer). Portable scenes, the qualified Three.js GPU profile, saved Spark worlds, native studio, shot-recipe directing, and camera-track export require the current source build. Follow the [source-install guide](${sourceInstall.guideUrl}) for those capabilities and check their runtime requirements.

Editing and rendering stay local. Gateway generation and selected cloud analysis upload named media only after acknowledgement. Native Python requires separate authorization. Custom Bun workflow modules execute when loaded, including during check and plan; review their source first. Both run as the current user without an operating-system sandbox. This website accepts no credentials and performs no generation.

## Start

- [Slopcamera home](https://slopcamera.com/index.md): Product overview, installation, first task, and limits
- [Documentation index](https://slopcamera.com/docs/index.md): Learning, task guides, reference, and explanation
- [First diagram](https://slopcamera.com/docs/tutorials/first-diagram.md): Complete local input-to-output task using the source-built CLI
- [Repository README](https://github.com/hraness/slopcamera#readme): Product contract and install

## Optional support

The current source CLI exposes \`slopcamera support protocol --json\` for agent closeout.
After useful work, request one due offer and honor a quiet result. Emit an optional
persistent human-facing link before acknowledging it with \`support shown <id>\`;
final-only hosts leave the offer unacknowledged to expire. No feature is paywalled,
no email is collected by this support-only product, and SDK/MCP calls stay quiet.
Use \`support dismiss\` or \`HRANESS_SUPPORT_AUDIENCE=off\` to decline invitations.

## Set up an agent

- [Claude Code](https://slopcamera.com/docs/tutorials/claude-code.md): Install the release and Agent Skill for Claude Code
- [Codex](https://slopcamera.com/docs/tutorials/codex.md): Install the release and Agent Skill for Codex
- [MCP clients](https://slopcamera.com/docs/tutorials/mcp.md): Expose the fixed diagram and image toolset
- [Other agents](https://slopcamera.com/docs/tutorials/other-agents.md): Portable skill target and plain CLI access

## Choose a task

- [Edit video](https://slopcamera.com/docs/how-to/edit-video.md): Import, edit, preview, and delivery
- [Generate media](https://slopcamera.com/docs/how-to/generate-media.md): Model discovery and caller-owned Gateway access
- [Educational video](https://slopcamera.com/docs/how-to/educational-video.md): Diagrams, mathematics, presenters, and motion
- [Music video](https://slopcamera.com/docs/how-to/music-video.md): Authored HTML visuals with a local track
- [Directed scenes](https://slopcamera.com/docs/how-to/direct-scenes.md): Portable geometry, cameras, media surfaces, GPU, and saved worlds
- [Native films](https://slopcamera.com/docs/how-to/native-films.md): Blender, CadQuery, Manim, explicit native trust, and interchange
- [Direct generated clips](https://slopcamera.com/docs/how-to/direct-takes.md): Shot recipes, budgets, takes, and review
- [Run workflows](https://slopcamera.com/docs/how-to/run-workflows.md): Recipes, declarative graphs, and recovery
- [Build from source](https://slopcamera.com/docs/how-to/install-from-source.md): Locked dependencies, SDK and CLI build, and engine setup

## Reference and explanation

- [Capabilities](https://slopcamera.com/docs/reference/capabilities.md): Release availability, supported profiles, runtime requirements, and limits
- [SDK entrypoints](https://slopcamera.com/docs/reference/sdk.md): Import surfaces and execution effects
- [Engine stack](https://slopcamera.com/docs/reference/engines.md): What each part of the multimedia engine does and needs
- [Architecture](https://slopcamera.com/docs/explanation/architecture.md): Sources, projects, operations, and local host
- [Why Slopcamera](https://slopcamera.com/docs/explanation/why-slopcamera.md): What a retained-source local studio gives an agent
- [Extending](https://slopcamera.com/docs/explanation/extending.md): Workflows, graphs, SDK, MCP, and native engines
- [HTML authoring](https://slopcamera.com/docs/explanation/html-authoring.md): DOM, vector, Three.js, and GPU surfaces
- [Tutorials](https://slopcamera.com/docs/index.md): First diagram and first native film
- [Security policy](https://github.com/hraness/slopcamera/blob/main/SECURITY.md): Trust boundary and reporting
- [Markdown sitemap](https://slopcamera.com/sitemap.md): Public page indexes
- [XML sitemap](https://slopcamera.com/sitemap.xml): Search-engine sitemap
`

export const sitemapMarkdown = `# Sitemap

## Slopcamera

- [Slopcamera home](https://slopcamera.com/index.md): Visual studio overview, installation, examples, workflow, and trust
- [Documentation](https://slopcamera.com/docs/index.md): Tutorials, task guides, reference, and explanation
- [Machine-readable site guide](https://slopcamera.com/llms.txt): When to use Slopcamera and the public indexes

## Tutorials

- [Create and revise your first diagram](https://slopcamera.com/docs/tutorials/first-diagram.md)
- [Render your first native film](https://slopcamera.com/docs/tutorials/first-native-film.md)
- [Set up Slopcamera for Claude Code](https://slopcamera.com/docs/tutorials/claude-code.md)
- [Set up Slopcamera for Codex](https://slopcamera.com/docs/tutorials/codex.md)
- [Use Slopcamera from an MCP client](https://slopcamera.com/docs/tutorials/mcp.md)
- [Set up Slopcamera for other coding agents](https://slopcamera.com/docs/tutorials/other-agents.md)

## How-to guides

- [Build Slopcamera from source](https://slopcamera.com/docs/how-to/install-from-source.md)
- [Edit and deliver video](https://slopcamera.com/docs/how-to/edit-video.md)
- [Generate images, video, and narration](https://slopcamera.com/docs/how-to/generate-media.md)
- [Make an educational video](https://slopcamera.com/docs/how-to/educational-video.md)
- [Make a music video from an HTML scene](https://slopcamera.com/docs/how-to/music-video.md)
- [Render and edit spatial scenes](https://slopcamera.com/docs/how-to/direct-scenes.md)
- [Author a native film](https://slopcamera.com/docs/how-to/native-films.md)
- [Direct short generated clips](https://slopcamera.com/docs/how-to/direct-takes.md)
- [Run or recover a workflow](https://slopcamera.com/docs/how-to/run-workflows.md)

## Reference

- [Capabilities, versions, and platforms](https://slopcamera.com/docs/reference/capabilities.md)
- [SDK surfaces](https://slopcamera.com/docs/reference/sdk.md)
- [The Slopcamera engine stack](https://slopcamera.com/docs/reference/engines.md)

## Explanation

- [Source, representations, and projects](https://slopcamera.com/docs/explanation/architecture.md)
- [Why Slopcamera](https://slopcamera.com/docs/explanation/why-slopcamera.md)
- [Extend Slopcamera](https://slopcamera.com/docs/explanation/extending.md)
- [Choose an HTML authoring surface](https://slopcamera.com/docs/explanation/html-authoring.md)
`

export const robotsTxt = `User-agent: OAI-SearchBot
User-agent: ChatGPT-User
User-agent: GPTBot
Allow: /

User-agent: Claude-SearchBot
User-agent: Claude-User
User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
User-agent: Perplexity-User
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: CCBot
Allow: /

User-agent: *
Allow: /

Sitemap: https://slopcamera.com/sitemap.xml
`

export const homeCanonicalUrl = "https://slopcamera.com/"
export const homeMarkdownUrl = "https://slopcamera.com/index.md"
export const llmsTxtUrl = "https://slopcamera.com/llms.txt"
export const sitemapMarkdownUrl = "https://slopcamera.com/sitemap.md"
export const sitemapXmlUrl = "https://slopcamera.com/sitemap.xml"
