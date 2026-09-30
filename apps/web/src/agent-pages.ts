import { homepageExampleMarkdown, homepageHeroMarkdown, homepageRevisionMarkdown } from "./example-gallery"
import { docPages, docsSectionLabels, docsSectionOrder, docsMarkdownUrl } from "./docs-registry"
import { archiveInstall, publishedRelease, sourceInstall } from "./published-release"
import { blogIndex, blogMarkdownPath, indexableBlogPosts } from "./blog-registry"

// Only indexable posts are listed; quarantined posts stay out of agent indexes.
const blogPostLinks = indexableBlogPosts
  .map(post => `- [${post.title}](https://slopcamera.com${blogMarkdownPath(post)}): ${post.description}`)
  .join("\n")

export const homeMarkdown = `# Give your agent a multimedia studio.

SlopCamera lets your coding agent make images, diagrams, animation, 3D scenes, and video from source files it can keep revising. Direct the style, timing, camera, and sound, then refine the result.

Slopcamera is free and open source. Use it with Codex, Claude Code, or another agent that can run shell commands. The Agent Skill teaches the workflows; the CLI renders the source your agent writes.

${homepageHeroMarkdown()}

## See what you can make

Finished pieces connect the creative brief to editable source. Each guide explains the tools and inputs it needs.

${homepageExampleMarkdown()}

## Direct it again

A render is a starting point for the next decision. Keep the scene and its request, change a specific part, and compare the results.

${homepageRevisionMarkdown()}

[Learn how to direct a film](https://slopcamera.com/docs/how-to/direct-a-film.md).

## From an idea to a finished piece

1. Describe the result. Give your agent a subject, visual treatment, duration, and final moment.
2. Make and inspect it. The agent writes source, renders a test, and checks the picture and sound.
3. Refine the direction. Change composition, timing, camera, or audio, then render another version.

Make illustrations and diagrams, authored animation and 3D films, educational videos, or edits of your own footage. Combine rendered and generated media in a project. Deliver video in 16:9, 9:16, 1:1, or 4:5 from the same edit.

## Install Slopcamera

Tell your agent: “Install Slopcamera and its skill.” Or install the verified v${publishedRelease.version} release with Bun 1.3.14 or newer:

\`\`\`sh
${archiveInstall.command}
\`\`\`

Then install the matching Agent Skill:

\`\`\`sh
${archiveInstall.skillCommand}
# For Claude Code:
${archiveInstall.alternateSkillCommand}
\`\`\`

Start a new agent session. Use \`--target claude\` for Claude Code or omit the target for Codex; add \`--scope project\` inside a repository. Check local tools with \`slopcamera doctor --json\`.

[Make your first animation](https://slopcamera.com/docs/tutorials/first-animation.md) on macOS with the browser and FFmpeg runtimes reported by \`slopcamera doctor --json\`. [Create a diagram](https://slopcamera.com/docs/tutorials/first-diagram.md) on macOS, Linux, or Windows without a browser or paid model. Follow the [source-install guide](${sourceInstall.guideUrl}) to develop Slopcamera.

## Choose your tools

Start with the Agent Skill and CLI. The [TypeScript SDK](https://slopcamera.com/docs/reference/sdk.md) supports integrations. The [fixed MCP toolset](https://slopcamera.com/docs/reference/mcp-tools.md) exposes a documented subset for compatible clients.

The CLI runs on macOS, Linux, and Windows with Bun 1.3.14+. Browser, GPU, codec, and native engine requirements depend on the project. Blender, CadQuery, and Manim install separately. [Check capabilities and requirements](https://slopcamera.com/docs/reference/capabilities.md).

## Cost and privacy

Slopcamera has no account or subscription. Local editing and rendering are free. Generation uses your own Vercel AI Gateway account, or prepaid Hraness Credits for prompt-only hosted images; model usage is billed separately.

The website displays work and documentation. Creation happens in the CLI and SDK. Normal edits retain original media, while sources, project decisions, and renders stay in storage you control. Cloud generation and selected analysis upload named media with acknowledgement. Trusted native source and custom workflows run as your current user. Read the [privacy guide](https://github.com/hraness/slopcamera/blob/main/PRIVACY.md) and [security policy](https://github.com/hraness/slopcamera/blob/main/SECURITY.md).

## Explore

- [Documentation](https://slopcamera.com/docs/index.md)
- [Direct a film](https://slopcamera.com/docs/how-to/direct-a-film.md)
- [Edit your footage](https://slopcamera.com/docs/how-to/edit-video.md)
- [Why Slopcamera](https://slopcamera.com/docs/explanation/why-slopcamera.md)
- [GitHub](https://github.com/hraness/slopcamera)
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

export const llmsTxt = `# SlopCamera

> SlopCamera lets your coding agent make images, diagrams, animation, 3D scenes, and video from source files it can keep revising.

Slopcamera is a multimedia studio for coding agents. It makes images, diagrams, animation, 3D scenes, and video from source files the agent can keep revising. Codex, Claude Code, and other coding agents that can run shell commands drive it through the CLI and Agent Skill. Slopcamera is free and open source.

Use the Agent Skill and CLI for the broad local workflow. The TypeScript SDK supports integrations; MCP exposes a fixed set of 21 tools and ten operation codes, including scene inspection and planning. It does not expose every CLI command. There is no Slopcamera account or hosted project database.

## When to use Slopcamera

Use Slopcamera to author portable scenes and direct cameras; film saved worlds; create diagrams and motion graphics; edit footage and deliver multiple formats; or generate images, video, speech, and transcripts through your own Vercel AI Gateway access. Prompt-only images can also run on the hosted API at api.slopcamera.com, paid with prepaid Hraness Credits (\`slopcamera credits topup\`, then \`slopcamera credits wait\` after payment, then \`slopcamera ai image generate --hosted\`). Native Blender, CadQuery, and Manim workflows add detailed worlds and educational films in the current release; engines install separately.

Install the verified release with \`${archiveInstall.command}\`, then its matching Agent Skill with \`${archiveInstall.skillCommand}\` (Bun 1.3.14 or newer). The release includes \`scene camera-track\` export. Spatial rendering needs a local Chrome or Chromium runtime and the GPU support required by its selected profile. Native studio engines need separately installed executables or Python environments. Follow the [source-install guide](${sourceInstall.guideUrl}) to develop Slopcamera or follow main.

The verified release includes \`scene design catalog|init|inspect|set|compile|gallery\`: named dimensions, constraints, four architectural starters, and retained scene bundles. Inspection and compilation run locally with the Slopcamera CLI; rendering uses the same local browser runtime. Follow the [parametric design guide](https://github.com/hraness/slopcamera/blob/main/docs/how-to/parametric-design.md).

Editing and rendering stay local. Gateway generation and selected cloud analysis upload named media only after acknowledgement. Native Python requires separate authorization. Custom Bun workflow modules execute when loaded, including during check and plan; review their source first. Both run as the current user without an operating-system sandbox. This website accepts no credentials and performs no generation.

## Start

- [Slopcamera home](https://slopcamera.com/index.md): Product overview, installation, first task, and limits
- [Documentation index](https://slopcamera.com/docs/index.md): Learning, task guides, reference, and explanation
- [First diagram](https://slopcamera.com/docs/tutorials/first-diagram.md): Complete local input-to-output task using the verified release
- [First animation](https://slopcamera.com/docs/tutorials/first-animation.md): Render the midnight tram and enlarge its moon in a second version
- [Techniques](https://slopcamera.com/docs/reference/techniques.md): Every packaged technique, its starter command, and its guide
- [Why Slopcamera](https://slopcamera.com/docs/explanation/why-slopcamera.md): Why the agent writes a short source file, and how Slopcamera compares with Remotion and HyperFrames
- [Repository README](https://github.com/hraness/slopcamera#readme): Overview and install

## Optional support

Paying to support Slopcamera's development is optional and unlocks no features. The [slopcamera.com](https://slopcamera.com/) footer links to the support page, and agents follow the support steps in the Agent Skill.

## Set up an agent

- [Claude Code](https://slopcamera.com/docs/tutorials/claude-code.md): Install the release and Agent Skill for Claude Code
- [Codex](https://slopcamera.com/docs/tutorials/codex.md): Install the release and Agent Skill for Codex
- [MCP clients](https://slopcamera.com/docs/tutorials/mcp.md): Expose the fixed diagram, image, and scene toolset
- [Other agents](https://slopcamera.com/docs/tutorials/other-agents.md): Portable skill target and plain CLI access

## Choose a task

- [Direct a film](https://slopcamera.com/docs/how-to/direct-a-film.md): Creative briefs, visual direction, timing, sound, and specific revisions
- [Motion graphics](https://slopcamera.com/docs/how-to/render-motion-graphics.md): Seven authoring profiles, absolute timing, local video exports, and transparent overlays
- [Raster to SVG](https://slopcamera.com/docs/how-to/vectorize-images.md): Local tracing, measured fidelity, and a reproducible original illustration
- [Edit video](https://slopcamera.com/docs/how-to/edit-video.md): Import, edit, preview, and delivery
- [Generate media](https://slopcamera.com/docs/how-to/generate-media.md): Model discovery, your own Gateway access, and prepaid hosted image generation
- [Make a math explainer video with Manim](https://slopcamera.com/docs/how-to/educational-video.md): Diagrams, mathematics, presenters, and motion
- [Music video](https://slopcamera.com/docs/how-to/music-video.md): Authored HTML visuals with a local track
- [Render and edit Three.js 3D scenes](https://slopcamera.com/docs/how-to/direct-scenes.md): Portable geometry, cameras, media surfaces, GPU, and saved worlds
- [Plan camera moves, lighting, and effects for a 3D scene](https://slopcamera.com/docs/how-to/cinematic-worlds.md): Recipe packs, direction, galleries, effects, and audits
- [Render Blender, CadQuery, and Manim films from source](https://slopcamera.com/docs/how-to/native-films.md): Blender, CadQuery, Manim, explicit native trust, and interchange
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
- [MCP toolset](https://slopcamera.com/docs/reference/mcp-tools.md): The 21 fixed tools, bounds, and CLI-only remainder
- [Use cases](https://slopcamera.com/docs/explanation/use-cases.md): What people make, what each job needs, and its limits
- [Choose an interface](https://slopcamera.com/docs/explanation/choose-an-interface.md): Skill, CLI, SDK, MCP, and hosted adapter compared
- [Architecture](https://slopcamera.com/docs/explanation/architecture.md): Sources, projects, operations, and local host
- [Why Slopcamera](https://slopcamera.com/docs/explanation/why-slopcamera.md): Why an agent with Slopcamera writes a short source file instead of a whole render pipeline, and how to choose between it and other tools
- [SlopCamera vs Remotion](https://slopcamera.com/docs/explanation/slopcamera-vs-remotion.md): React video components compared with installed techniques and source files the agent revises
- [SlopCamera vs HyperFrames](https://slopcamera.com/docs/explanation/slopcamera-vs-hyperframes.md): HTML-to-video rendering compared with a wider local media studio
- [Remotion alternatives for coding agents](https://slopcamera.com/docs/explanation/remotion-alternatives-for-coding-agents.md): Tools a coding agent can drive to make video, and when each fits
- [Token benchmark](https://slopcamera.com/docs/explanation/token-benchmark.md): Agent token use and cost on four media tasks with and without Slopcamera installed
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
