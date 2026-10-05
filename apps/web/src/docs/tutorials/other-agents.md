Cursor, Devin CLI, and other agents without a dedicated SlopCamera guide have two routes in: the portable Agent Skill directory for agents that read the `agents` convention, and the plain `slopcamera` command for agents that only run shell commands. Both come from the same install. If the client speaks MCP, its fixed tools cover diagrams, images, and scene inspection and planning; see [Use SlopCamera from an MCP client](/docs/tutorials/mcp).

## Install the portable skill

```sh
{{SKILL_INSTALL_COMMAND}}
```

The `agents` target is the generic one. A user-scope install writes `~/.agents/skills/slopcamera`; adding `--scope project` inside a repository writes `.agents/skills/slopcamera` there instead, and `--project <directory>` names a different root. The folder is self-contained: `SKILL.md`, its task references, and agent metadata travel together, so an agent that reads the portable Agent Skills layout gets the same version-matched guidance as the Codex and Claude Code targets.

To place the guidance somewhere else, such as a custom instructions directory or a committed agent file, `slopcamera skill path` prints the bundled directory to copy from. Installing a skill never installs the CLI or the optional native engines.

## Use the skill in Cursor or Devin CLI

Cursor and Devin CLI both load skills from `~/.agents/skills` and from a project's `.agents/skills`, so the `agents` install above works in both. Restart Cursor, or start a new Devin CLI session, after installing.

| Setup | Cursor | Devin CLI |
| --- | --- | --- |
| Folders it loads a SlopCamera install from | `.agents/skills` and `~/.agents/skills`, plus `.claude/skills`, `.codex/skills`, and their home-directory forms | `.agents/skills` and `~/.agents/skills`, plus `.claude/skills` and `~/.claude/skills` |
| Run the skill yourself | Type `/` in Agent chat and choose `slopcamera` | Type `/slopcamera` |
| Add the MCP server | Put the `mcpServers` entry from [the MCP tutorial](/docs/tutorials/mcp) in `~/.cursor/mcp.json`, or in `.cursor/mcp.json` for one project | Run `devin mcp add slopcamera -- slopcamera mcp --root /absolute/path/to/workspace` |

Both agents can also load the skill on their own when a request matches its description. `devin mcp add` saves the server for the current project in `.devin/mcp_config.local.json`; add `-s user` to save it in `~/.config/devin/mcp_config.json` for every project, and run `devin mcp list` to see the servers Devin CLI has configured. Devin CLI also lists servers from a project's `.mcp.json` and `.cursor/mcp.json`, so a project that already registers SlopCamera for Claude Code or Cursor needs no second entry.

Keep one of these skill folders. With both `~/.agents/skills/slopcamera` and `~/.claude/skills/slopcamera` present, Devin CLI lists two copies, `/agents:slopcamera` and `/claude:slopcamera`. If you also use Claude Code, install only with `{{SKILL_INSTALL_COMMAND_CLAUDE}}`; Devin CLI and Cursor read that folder too.

The Devin CLI folders and MCP commands were checked on 4 October 2026 with Devin CLI 3000.11.3 and SlopCamera 3.10.3: `devin skills list` showed `/slopcamera` from each folder in the table but not from `~/.codex/skills`, and `devin mcp list` showed the added server. No Devin CLI session ran the skill. Devin documents its own folders in its [skills overview](https://docs.devin.ai/cli/extensibility/skills/overview) and the Claude Code and Cursor files it reads in [configuration import](https://docs.devin.ai/cli/reference/configuration/read-config-from). The Cursor column comes from Cursor's [skills](https://cursor.com/docs/skills) and [MCP](https://cursor.com/docs/context/mcp) documentation, read the same day; this setup was not tested in Cursor.

## Drive the CLI directly

An agent that only runs shell commands needs the `slopcamera` command on its `PATH` and a few lines of direction in its instruction file. Point it at the discovery commands rather than a frozen command list:

```sh
slopcamera --help
slopcamera help <family>
slopcamera doctor --json
slopcamera operations list --json
slopcamera workflows list --json
```

Every read and mutation accepts `--json` for machine-readable output, and `slopcamera code search` plus `slopcamera code execute` expose the fixed portable operation registry for programmatic calls. If the agent reads `AGENTS.md` in a repository, a short paragraph there is enough: name the `slopcamera` command, require the discovery commands above before assuming an option exists, and ask the agent to keep authored sources editable beside derived media and to report real output paths.

## Use the SDK

An agent embedding TypeScript can skip the shell and import the same contracts: `@hraness/slopcamera` for the portable SDK, `@hraness/slopcamera/code` for declarative graphs, and `@hraness/slopcamera/workflow` for trusted Bun workflow modules. The `local` subpaths ship with the source-backed Bun package or a checkout. [SDK surfaces](/docs/reference/sdk) describes what each entrypoint includes.

## What the agent still needs

- Generation needs the caller's `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN` in the process environment; this site never receives either.
- Native engines such as Blender, CadQuery, and Manim install separately, and running authored native source additionally needs the invocation-scoped `--allow-trusted-code` flag, which grants current-user execution without an operating-system sandbox.
- The released CLI includes the scene, studio, and durable-run commands. The [capability reference](/docs/reference/capabilities) lists what each install includes and its platform requirements.
