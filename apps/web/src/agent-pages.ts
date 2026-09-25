import { homepageExampleMarkdown } from "./example-gallery"
import { docPages, docsSectionLabels, docsSectionOrder, docsMarkdownUrl } from "./docs-registry"
import { archiveInstall, publishedRelease, sourceInstall } from "./published-release"
import { blogIndex, blogMarkdownPath, indexableBlogPosts } from "./blog-registry"

// Only indexable posts are listed; quarantined posts stay out of agent indexes.
const blogPostLinks = indexableBlogPosts
  .map(post => `- [${post.title}](https://slopcamera.com${blogMarkdownPath(post)}): ${post.description}`)
  .join("\n")

export const homeMarkdown = `# Give your coding agent a visual studio

Slopcamera (formerly Atet) is a local visual studio for coding agents. Your agent renders images, diagrams, animation, and video from source files it can edit. It writes scenes, diagrams, and video edits as files and mixes in generated media or your own footage. Because the files stay editable, it can change one detail and render again.

Free and open source under the MIT license. Requires Bun 1.3.14 or newer. Blender, CadQuery, and Manim install separately.

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

Tell your agent: “install Slopcamera and its skill.” Or install the verified Slopcamera v${publishedRelease.version} release yourself with Bun 1.3.14 or newer:

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

For repository example helpers or development, follow the [complete source-install guide](${sourceInstall.guideUrl}). It records the commit, installs locked dependencies, builds the SDK and CLI, and installs the guide from that same checkout. Native engines install separately.

## Examples

Each example links to its guide and source files. Start with an example, then ask your agent to change the words, geometry, camera, or timing.

${homepageExampleMarkdown()}

The v${publishedRelease.version} release covers local diagrams, all seven HTML motion profiles, ordinary media editing, native Blender, CadQuery, and Manim films, cinematic direction, performance, effects, behavior, and parametric design. Examples whose inputs live in the repository need a checkout. [Check versions and requirements](https://slopcamera.com/docs/reference/capabilities.md).

Explore [motion graphics](https://slopcamera.com/docs/how-to/render-motion-graphics.md), [music videos](https://slopcamera.com/docs/how-to/music-video.md), [spatial scenes](https://slopcamera.com/docs/how-to/direct-scenes.md), [parametric design](https://slopcamera.com/docs/how-to/parametric-design.md), [native films](https://slopcamera.com/docs/how-to/native-films.md), [educational video](https://slopcamera.com/docs/how-to/educational-video.md), [editing](https://slopcamera.com/docs/how-to/edit-video.md), [AI media](https://slopcamera.com/docs/how-to/generate-media.md), and [reusable workflows](https://slopcamera.com/docs/how-to/run-workflows.md). Browse the [use cases](https://slopcamera.com/docs/explanation/use-cases.md) by job, or look up a tool contract: [.diagram.json](https://slopcamera.com/docs/reference/diagram-format.md), [HTML render profiles](https://slopcamera.com/docs/reference/html-profiles.md), [spatial scenes](https://slopcamera.com/docs/reference/spatial-scenes.md), [vectorization](https://slopcamera.com/docs/reference/vectorization.md), [Gateway generation](https://slopcamera.com/docs/reference/gateway-generation.md), [the video pipeline](https://slopcamera.com/docs/reference/video-pipeline.md), [native engines](https://slopcamera.com/docs/reference/native-engines.md), or [the MCP toolset](https://slopcamera.com/docs/reference/mcp-tools.md).

## From source to a finished film

Keep native rigs and simulations, portable geometry and cameras, diagram objects and labels, and video edits in their respective sources.

1. Prepare the sources. Inspect available tools, then author scenes or diagrams, import assets, or open an existing recording bundle.
2. Direct the result. Set cameras, shots, timing, and outputs. Discover Vercel AI Gateway models for generated images, video, voice, or transcripts.
3. Compose the film. Combine selected shots, edit timing, and add captions, graphics, and motion. Reframe footage and apply color and audio treatment.
4. Review before final. Inspect contact frames, motion, sound, and continuity. Preview and final renders use the same timeline and composition.
5. Deliver and revise. Export finished videos. Keep sources, project decisions, and operation records for later revisions.

Share supported geometry and calibrated cameras, or mount images and video in world space. An image passed from one renderer to another keeps its pixels, not its geometry or rig. [Understand scene interchange](https://slopcamera.com/docs/how-to/native-films.md).

## Choose how your agent works

- Agent Skill: start here. It teaches your agent which commands fit each job and what to check before it renders.
- CLI: human-readable commands and stable JSON for the broad local workflow. Start with \`slopcamera workflows list --json\`.
- TypeScript SDK: declarative or imperative media work in Bun. For example, import \`vectorizeImage\` from \`@hraness/slopcamera\`.
- MCP: a fixed set of 17 tools for checking and rendering diagrams, inspecting and planning scenes, and making images in one selected folder. Run \`slopcamera mcp --root /absolute/path/to/workspace\`. It does not expose every CLI command.

## What stays on your machine

Source media stays unchanged under normal edit operations. Slopcamera keeps authored sources, editing decisions, previews, and final renders in storage you control. There is no Slopcamera account or hosted project database. Native scenes and portable assets keep their own capabilities; rendered derivatives connect them.

Local processes use your Vercel AI Gateway credential without storing or printing it. Media uploads require acknowledgement. This website never receives a Gateway credential. Important operations save a record of their inputs and outputs, with no secrets in it.

Blender, CadQuery, and Manim jobs run only with \`--allow-trusted-code\`. Loading a custom Bun workflow evaluates its module, including during check and plan; review the source before invoking it. Both run as your current user, without an operating-system sandbox. Runtime hashes identify observed tools; they do not make arbitrary source hermetic. Read the [security policy](https://github.com/hraness/slopcamera/blob/main/SECURITY.md) and [privacy guide](https://github.com/hraness/slopcamera/blob/main/PRIVACY.md).

## Documentation

The [documentation index](https://slopcamera.com/docs) connects learning, task guides, reference, and explanation:

- [Your first diagram](https://slopcamera.com/docs/tutorials/first-diagram)
- [Set up your coding agent](https://slopcamera.com/docs/tutorials/claude-code)
- [Run a workflow](https://slopcamera.com/docs/how-to/run-workflows)
- [Use cases](https://slopcamera.com/docs/explanation/use-cases)
- [Capabilities and requirements](https://slopcamera.com/docs/reference/capabilities)
- [The engine stack](https://slopcamera.com/docs/reference/engines)
- [Architecture](https://slopcamera.com/docs/explanation/architecture)

## Before you install

### Does Slopcamera require an account or subscription?

No. Slopcamera has no account or subscription. Generation uses your own Vercel AI Gateway account, or prepaid Hraness Credits for hosted image generation. A Gateway API key works without the Vercel CLI.

### What does it cost?

Slopcamera is free. Editing, previews, diagrams, vectorization, and exports run on your machine. Model usage is billed to your own Vercel AI Gateway account, or to prepaid Hraness Credits that you buy with \`slopcamera credits topup\` for hosted image generation.

### Where do my Gateway credentials live?

In the local CLI or SDK process environment. Slopcamera does not store or print the credential. With a linked Vercel project, \`vercel env run -- <command>\` injects it for one command without writing it into the project.

### Which platforms does Slopcamera run on?

The CLI needs Bun 1.3.14+ on macOS, Linux, or Windows. It imports existing recording bundles; the current CLI does not start a new screen or camera recording. GPU, browser, codec, and engine requirements vary; \`slopcamera doctor\` and the capability reference identify those requirements.

### Does Slopcamera overwrite original media?

Normal edit operations retain originals and record project decisions. Rendering the starter diagram again replaces its five derived outputs.

### When can local media leave the machine?

Editing and rendering stay local. Gateway generation and selected cloud analysis upload named media only after acknowledgement. Native Python and custom Bun workflows run with your current-user access, including potential network access.

### Does the website generate or edit media?

No. This website has no upload or generation features. Media work runs in the Slopcamera CLI and SDK; MCP exposes only its documented subset.

## Built by Hraness

Hraness is an advanced software research organization dedicated to advancing the frontier of machine intelligence.

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

> Slopcamera (formerly Atet) is a local visual studio for coding agents. Your agent renders images, diagrams, animation, and video from source files it can edit.

Use the Agent Skill and CLI for the broad local workflow. The TypeScript SDK supports integrations; MCP exposes a fixed set of 17 tools and six operation codes, including scene inspection and planning. It does not expose every CLI command. There is no Slopcamera account or hosted project database.

## When to use Slopcamera

Use Slopcamera to author portable scenes and direct cameras; film saved worlds; create diagrams and motion graphics; edit footage and deliver multiple formats; or generate images, video, speech, and transcripts through your own Vercel AI Gateway access. Prompt-only images can also run on the hosted API at api.slopcamera.com, paid with prepaid Hraness Credits (\`slopcamera credits topup\`, then \`slopcamera credits wait\` after payment, then \`slopcamera ai image generate --hosted\`). Native Blender, CadQuery, and Manim workflows add detailed worlds and educational films in the current release; engines install separately.

Install the verified release with \`${archiveInstall.command}\`, then its matching Agent Skill with \`${archiveInstall.skillCommand}\` (Bun 1.3.14 or newer). The release includes \`scene camera-track\` export. Spatial rendering needs a local Chrome or Chromium runtime and the GPU support required by its selected profile. Native studio engines need separately installed executables or Python environments. Follow the [source-install guide](${sourceInstall.guideUrl}) to develop Slopcamera or follow main.

The verified release includes \`scene design catalog|init|inspect|set|compile|gallery\`: named dimensions, constraints, four architectural starters, and retained scene bundles. Inspection and compilation run locally with the Slopcamera CLI; rendering uses the same local browser runtime. Follow the [parametric design guide](https://github.com/hraness/slopcamera/blob/main/docs/how-to/parametric-design.md).

Editing and rendering stay local. Gateway generation and selected cloud analysis upload named media only after acknowledgement. Native Python requires separate authorization. Custom Bun workflow modules execute when loaded, including during check and plan; review their source first. Both run as the current user without an operating-system sandbox. This website accepts no credentials and performs no generation.

## Start

- [Slopcamera home](https://slopcamera.com/index.md): Product overview, installation, first task, and limits
- [Documentation index](https://slopcamera.com/docs/index.md): Learning, task guides, reference, and explanation
- [First diagram](https://slopcamera.com/docs/tutorials/first-diagram.md): Complete local input-to-output task using the verified release
- [First animation](https://slopcamera.com/docs/tutorials/first-animation.md): Render an original HTML title and make a visible source revision
- [Repository README](https://github.com/hraness/slopcamera#readme): Overview and install

## Optional support

Paying to support Slopcamera's development is optional and unlocks no features. The [slopcamera.com](https://slopcamera.com/) footer links to the support page, and agents follow the support steps in the Agent Skill.

## Set up an agent

- [Claude Code](https://slopcamera.com/docs/tutorials/claude-code.md): Install the release and Agent Skill for Claude Code
- [Codex](https://slopcamera.com/docs/tutorials/codex.md): Install the release and Agent Skill for Codex
- [MCP clients](https://slopcamera.com/docs/tutorials/mcp.md): Expose the fixed diagram, image, and scene toolset
- [Other agents](https://slopcamera.com/docs/tutorials/other-agents.md): Portable skill target and plain CLI access

## Choose a task

- [Motion graphics](https://slopcamera.com/docs/how-to/render-motion-graphics.md): Seven authoring profiles, absolute timing, local video exports and transparent overlays
- [Raster to SVG](https://slopcamera.com/docs/how-to/vectorize-images.md): Local tracing, measured fidelity and a reproducible original illustration
- [Edit video](https://slopcamera.com/docs/how-to/edit-video.md): Import, edit, preview, and delivery
- [Generate media](https://slopcamera.com/docs/how-to/generate-media.md): Model discovery, your own Gateway access, and prepaid hosted image generation
- [Educational video](https://slopcamera.com/docs/how-to/educational-video.md): Diagrams, mathematics, presenters, and motion
- [Music video](https://slopcamera.com/docs/how-to/music-video.md): Authored HTML visuals with a local track
- [Directed scenes](https://slopcamera.com/docs/how-to/direct-scenes.md): Portable geometry, cameras, media surfaces, GPU, and saved worlds
- [Cinematic worlds](https://slopcamera.com/docs/how-to/cinematic-worlds.md): Recipe packs, direction, galleries, effects, and audits
- [Native films](https://slopcamera.com/docs/how-to/native-films.md): Blender, CadQuery, Manim, explicit native trust, and interchange
- [Direct generated clips](https://slopcamera.com/docs/how-to/direct-takes.md): Shot recipes, budgets, takes, and review
- [Run workflows](https://slopcamera.com/docs/how-to/run-workflows.md): Recipes, declarative graphs, and recovery
- [Build from source](https://slopcamera.com/docs/how-to/install-from-source.md): Locked dependencies, SDK and CLI build, and engine setup

## Blog

- [Blog index](https://slopcamera.com/blog/index.md): ${blogIndex.description}
${blogPostLinks}
- [Atom feed](https://slopcamera.com/blog/feed.xml): New posts

## Reference and explanation

- [Capabilities](https://slopcamera.com/docs/reference/capabilities.md): Release availability, supported profiles, runtime requirements, and limits
- [SDK entrypoints](https://slopcamera.com/docs/reference/sdk.md): Import surfaces and execution effects
- [Engine stack](https://slopcamera.com/docs/reference/engines.md): What each part of the multimedia engine does and needs
- [Diagram format](https://slopcamera.com/docs/reference/diagram-format.md): The .diagram.json source, five exports, and .tldr interchange
- [HTML render profiles](https://slopcamera.com/docs/reference/html-profiles.md): Motion, p5.js, Two.js, Paper Shaders, Three.js, and vgpu under one deterministic contract
- [Spatial scenes](https://slopcamera.com/docs/reference/spatial-scenes.md): The .scene.json contract, cameras, and GPU profiles
- [Vectorization](https://slopcamera.com/docs/reference/vectorization.md): Local VTracer tracing, fidelity gates, and provenance
- [Gateway generation](https://slopcamera.com/docs/reference/gateway-generation.md): Credential, discovery, acknowledgement, and billing boundaries
- [Video pipeline](https://slopcamera.com/docs/reference/video-pipeline.md): The FFmpeg-backed project model, edits, and delivery formats
- [Native engines](https://slopcamera.com/docs/reference/native-engines.md): Blender, CadQuery, and Manim adapter contract
- [MCP toolset](https://slopcamera.com/docs/reference/mcp-tools.md): The 17 fixed tools, bounds, and CLI-only remainder
- [Use cases](https://slopcamera.com/docs/explanation/use-cases.md): What people make, what each job needs, and its limits
- [Choose an interface](https://slopcamera.com/docs/explanation/choose-an-interface.md): Skill, CLI, SDK, MCP, and hosted adapter compared
- [Architecture](https://slopcamera.com/docs/explanation/architecture.md): Sources, projects, operations, and local host
- [Why Slopcamera](https://slopcamera.com/docs/explanation/why-slopcamera.md): What a retained-source local studio gives an agent
- [Extending](https://slopcamera.com/docs/explanation/extending.md): Workflows, graphs, SDK, MCP, and native engines
- [HTML authoring](https://slopcamera.com/docs/explanation/html-authoring.md): DOM, vector, Three.js, and GPU surfaces
- [Tutorials](https://slopcamera.com/docs/index.md): First diagram, first animation, first native film, and agent setup
- [Security policy](https://github.com/hraness/slopcamera/blob/main/SECURITY.md): Trust boundary and reporting
- [Markdown sitemap](https://slopcamera.com/sitemap.md): Public page indexes
- [XML sitemap](https://slopcamera.com/sitemap.xml): Search-engine sitemap
`

export const sitemapMarkdown = `# Sitemap

- [Slopcamera home](https://slopcamera.com/index.md): Product, installation, examples, and workflows
- [Documentation](https://slopcamera.com/docs/index.md): Tutorials, how-to guides, reference, and explanation
- [Blog](https://slopcamera.com/blog/index.md): ${blogIndex.description}
- [Machine-readable site guide](https://slopcamera.com/llms.txt): When to use Slopcamera

${docsSectionOrder.map(section => `## ${docsSectionLabels[section]}\n\n${docPages.filter(page => page.section === section).map(page => `- [${page.title}](https://slopcamera.com${docsMarkdownUrl(page)}): ${page.description}`).join("\n")}`).join("\n\n")}

## Blog

${blogPostLinks}
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
