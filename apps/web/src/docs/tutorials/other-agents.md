An agent without a dedicated Slopcamera integration still has two routes in: the portable Agent Skill directory for agents that read the `agents` convention, and the plain `slopcamera` command for agents that only run shell commands. Both come from the same install. If the client speaks MCP instead, the fixed diagram and image toolset is covered in [Use Slopcamera from an MCP client](/docs/tutorials/mcp).

## Install the portable skill

```sh
{{SKILL_INSTALL_COMMAND}}
```

The `agents` target is the generic one. A user-scope install writes `~/.agents/skills/slopcamera`; adding `--scope project` inside a repository writes `.agents/skills/slopcamera` there instead, and `--project <directory>` names a different root. The folder is self-contained: `SKILL.md`, its task references, and agent metadata travel together, so an agent that reads the portable Agent Skills layout gets the same version-matched guidance as the Codex and Claude Code targets.

To place the guidance somewhere else, such as a custom instructions directory or a committed agent file, `slopcamera skill path` prints the bundled directory to copy from. Installing a skill never installs the CLI or the optional native engines.

## Drive the CLI directly

An agent that only runs shell commands needs the `slopcamera` command on its `PATH` and a few lines of direction in its instruction file. Point it at the discovery surface rather than a frozen command list:

```sh
slopcamera --help
slopcamera help <family>
slopcamera doctor --json
slopcamera operations list --json
slopcamera workflows list --json
```

Every read and mutation accepts `--json` for machine-readable receipts, and `slopcamera code search` plus `slopcamera code execute` expose the fixed portable operation registry for programmatic calls. If the agent reads `AGENTS.md` in a repository, a short paragraph there is enough: name the `slopcamera` command, require the discovery commands above before assuming an option exists, and ask the agent to keep authored sources editable beside derived media and to report real output paths.

## Use the SDK

An agent embedding TypeScript can skip the shell and import the same contracts: `@hraness/slopcamera` for the portable surface, `@hraness/slopcamera/code` for declarative graphs, and `@hraness/slopcamera/workflow` for trusted Bun workflow modules. The `local` subpaths need the source-backed distribution described in [Build Slopcamera from source](/docs/how-to/install-from-source). [SDK surfaces](/docs/reference/sdk) names each entrypoint's boundary.

## What the agent still needs

- Generation needs the caller's `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN` in the process environment; this site never receives either.
- Native engines such as Blender, CadQuery, and Manim install separately, and running authored native source additionally needs the invocation-scoped `--allow-trusted-code` flag, which grants current-user execution without an operating-system sandbox.
- Scene, studio, and durable-run surfaces are documented against the [source build](/docs/how-to/install-from-source); the [capability reference](/docs/reference/capabilities) lists what each install includes and its platform requirements.
