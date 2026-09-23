Slopcamera offers four local interfaces plus a hosted adapter for platforms. They reach the same closed operation registry; they differ in who drives them, how much surface they expose, and where credentials live. Pick the interface by who reads it and how much of the contract they need.

| Interface | Driven by | Surface | Needs |
| --- | --- | --- | --- |
| Agent Skill | A coding agent reading instructions | Version-matched guidance that routes to the right commands | The CLI installed from the same release or checkout |
| CLI | Humans and agents in a terminal | The complete local surface, with `--json` receipts on reads and mutations | Bun 1.3.14+; engines and FFmpeg as each job requires |
| TypeScript SDK | Bun code you own | Typed imports from `@hraness/slopcamera`, `/code`, `/workflow`, and `local/*` | The package or a source checkout |
| MCP server | An MCP-capable client | A fixed 17-tool subset inside one workspace root | The installed CLI |
| Hosted tool adapter | Agent platforms without a local shell | REST and MCP endpoints at `api.slopcamera.com` over the same tool registry | Nothing to install; paid image generation needs a Hraness Credits device token |

## Agent Skill

The skill is instructions, not a runtime. `{{SKILL_INSTALL_COMMAND}}` (or `{{SKILL_INSTALL_COMMAND_CLAUDE}}` for Claude Code) installs guidance matched to your CLI version that tells the agent which commands fit each creative job and how to check local tools. Installing it does not install the CLI or native engines, and `--scope project` keeps it inside one repository. Choose it first: it is how most agents should meet Slopcamera.

## CLI

`slopcamera` is the canonical command surface: diagrams, vectorization, HTML renders, scenes, studio jobs, projects, workflows, and diagnostics such as `{{DOCTOR_COMMAND}}` and `slopcamera operations list --json`. Every read and mutation supports a stable `--json` receipt, which makes the CLI equally usable by a person and an agent. Everything the other interfaces can do reduces to operations this surface owns.

## TypeScript SDK

The SDK puts the same operations behind typed Bun imports. `@hraness/slopcamera` covers the portable surface; `@hraness/slopcamera/code` authors declarative graphs against the closed capability projection; `@hraness/slopcamera/workflow` keeps the imperative v0.8 API for trusted modules; and `@hraness/slopcamera/local/*` exposes the complete local host. Choose the SDK when the caller is your own program rather than a conversation. [SDK surfaces](/docs/reference/sdk) records each entrypoint's scope.

## MCP server

`slopcamera mcp --root <workspace>` exposes [the fixed 17-tool set](/docs/reference/mcp-tools): diagram check and render, registry search, six operation codes including vectorization and paid image generation, and thirteen read-mostly scene tools. Paths stay root-relative and bounded. The server exposes no recording, project, studio, or workflow command, so it suits clients that need media tools without shelling out to the full CLI.

## Hosted tool adapter

The hosted API at `api.slopcamera.com` serves the same tool registry to agent platforms that cannot run a local shell, over REST and MCP. Each call runs in a temporary workspace. Validation, inspection, planning, and diagram rendering are free with rate limits; image generation bills prepaid Hraness Credits. The CLI uses the same service for `slopcamera ai image generate --hosted`, and routes there automatically when you have stored a Credits device token and set no Gateway key. The repository's `docs/hosted-api.md` covers running the service.

## A short decision path

Let a coding agent work through the Agent Skill and CLI by default. Reach for the SDK when the caller is a program, MCP when the caller is an MCP client that should not see the whole CLI, and the hosted adapter only when the caller cannot have a machine at all. With the local interfaces, your Gateway key comes from the invoking process environment and your Credits device token from local CLI state or the environment; neither enters the browser or a project file.
