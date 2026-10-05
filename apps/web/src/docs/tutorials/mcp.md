An MCP-capable client can check and render diagrams, inspect scenes, vectorize rasters, and generate images inside one workspace through `slopcamera mcp`, a local stdio server. Claude Code, Codex, Cursor, and Claude Desktop launch it with a workspace directory, and every path the tools accept stays relative to that root.

## Install the CLI

The server ships inside the `slopcamera` command. Install the verified release so the client can launch it:

```sh
{{ARCHIVE_INSTALL_COMMAND}}
```

## Point a client at a workspace

The server requires one option, an existing workspace directory:

```sh
slopcamera mcp --root /absolute/path/to/workspace
```

Clients register it as a stdio command with arguments. After you add it, start a new session so the client launches a fresh server.

### Claude Code

```sh
claude mcp add slopcamera -- slopcamera mcp --root /absolute/path/to/workspace
```

Everything after `--` is the server command. By default Claude Code saves the server in local scope, for you in the current project only. Put `--scope user` before the name to load it in every project, or `--scope project` to write a `.mcp.json` file you can commit. Check the registration from a terminal:

```sh
claude mcp list
claude mcp get slopcamera
```

`claude mcp list` starts the server and reports `✔ Connected` when it answers. A server saved in `.mcp.json` shows `⏸ Pending approval` until you run `claude` in that project and approve it. Inside a session, `/mcp` shows each connected server with its tool count.

### Codex

```sh
codex mcp add slopcamera -- slopcamera mcp --root /absolute/path/to/workspace
```

This adds a `[mcp_servers.slopcamera]` table to `~/.codex/config.toml`, the file the Codex CLI and IDE extension share. You can also write the table by hand, there or in a trusted project's `.codex/config.toml`:

```toml
[mcp_servers.slopcamera]
command = "slopcamera"
args = ["mcp", "--root", "/absolute/path/to/workspace"]
env_vars = ["AI_GATEWAY_API_KEY"]
```

Codex starts a stdio server with a short list of default environment variables, so `env_vars` forwards your Gateway key from Codex's own environment for image generation. Leave that line out if you only check and render diagrams. Check the table from a terminal:

```sh
codex mcp list
codex mcp get slopcamera
```

`codex mcp list` prints the saved command and `enabled` without starting the server, so a wrong executable path looks the same as a working one. In the `codex` terminal interface, `/mcp` lists the MCP servers and tools Codex can call in that session.

### Cursor and Claude Desktop

Claude Desktop's `claude_desktop_config.json` and Cursor's `mcp.json` accept the same `mcpServers` shape:

```json
{
  "mcpServers": {
    "slopcamera": {
      "command": "slopcamera",
      "args": ["mcp", "--root", "/absolute/path/to/workspace"]
    }
  }
}
```

Cursor reads `~/.cursor/mcp.json`, or `.cursor/mcp.json` inside one project. Restart Claude Desktop or Cursor after editing the file. For Devin CLI, see [Set up SlopCamera for Cursor, Devin CLI, and other coding agents](/docs/tutorials/other-agents).

The Claude Code and Codex commands above follow the MCP documentation for [Claude Code](https://code.claude.com/docs/en/mcp) and [Codex](https://developers.openai.com/codex/mcp), and were checked on 4 October 2026 with SlopCamera 3.10.3, Claude Code 2.1.287, and Codex CLI 0.160.0. Both commands saved the server, and `claude mcp list` connected to it. A direct request to the server listed its 21 tools. No Claude Code or Codex session called a tool.

The server speaks newline-delimited JSON-RPC (protocol version `2025-11-25`, server name `hraness-slopcamera`). Protocol messages are the only output on stdout; diagnostics go to stderr.

## Check the connection without generating media

Create a `.diagram.json` source inside the configured workspace using
[the first-diagram tutorial](/docs/tutorials/first-diagram). After restarting the
client, inspect its available tools and call `check_diagram` with the source's
root-relative path. For a file named `hello.diagram.json` directly inside the
workspace, the tool arguments are:

```json
{"path": "hello.diagram.json"}
```

A successful call returns `ok: true`, `source`, `findings`, and a `summary` with
shape, edge, and finding counts. Read the findings before rendering; a successful
parse can still report diagram problems. This check does not change files or
request image generation. Tool discovery alone does not verify a render or a
paid provider request.

## Troubleshoot client setup

| Observed condition | What to check | Next action |
| --- | --- | --- |
| The client cannot launch `slopcamera` | The client's process environment may not have your terminal's `PATH`. | Set `command` to the installed executable's absolute path, keep the arguments unchanged, then restart the client. |
| The server starts but no tools appear | This is a stdio server, not an HTTP endpoint; stdout contains protocol messages only. | Register a command and arguments, not a URL. Check the client's server diagnostics and stderr. |
| `claude mcp list` shows `⏸ Pending approval` | The server is in the project's `.mcp.json`, which Claude Code loads only after you approve it. | Run `claude` in that project and approve the server, or add it again without `--scope project`. |
| Codex shows the server as `enabled`, but no SlopCamera tools load | `codex mcp list` reads `config.toml` without starting the server. | Set `command` to the path that `command -v slopcamera` prints, then open `/mcp` in a new Codex session. |
| A file path is rejected | Tool paths are relative to the configured workspace, not your terminal directory. | Keep the file inside that workspace and pass a path without an absolute prefix or `..`. |
| A check works but generation fails | Generation reads credentials from the server process, not from the website or an unrelated shell. Beyond a short default list, Codex forwards a variable from its own environment only when `env_vars` names it. | Follow [credentials and scope](#credentials-and-scope), and in Codex add `env_vars = ["AI_GATEWAY_API_KEY"]`. Retry only after checking whether the paid request completed. |

## Use the released tools

| Tool | Effect |
| --- | --- |
| `check_diagram` | Parse and lint one `.diagram.json` source. Read-only. |
| `render_diagram` | Write the same five artifacts the CLI render produces: `.tldr`, light and dark SVG, and light and dark PNG. |
| `search_slopcamera` | Search the fixed SlopCamera operation registry with a short text query. Never executes anything. |
| `execute_slopcamera` | Run one exact operation code with typed JSON input. |

`execute_slopcamera` accepts ten operation codes: `slopcamera.diagram.check`, `slopcamera.diagram.render`, `slopcamera.image.vectorize`, `slopcamera.image.generate`, `slopcamera.image.icon`, `slopcamera.image.gallery`, `slopcamera.icon.compose`, `slopcamera.icon.render`, `slopcamera.soundtrack.compose`, and `slopcamera.soundtrack.grid`. No tool accepts source text, evaluates caller code, executes workspace configuration, or registers a new operation. Renders run one at a time.

## Inspect and plan scenes

The server exposes 21 named tools: the four above, these 13 scene tools, and the four icon and soundtrack tools below.

| Scene tools | Effect |
| --- | --- |
| `check_scene`, `inspect_scene`, `diff_scenes` | Validate, summarize, or compare scene JSON sources. Read-only. |
| `evaluate_scene`, `audit_scene`, `audit_scene_temporal` | Sample world state and report spatial or temporal findings. Read-only. |
| `check_scene_direction`, `plan_scene_direction`, `plan_scene_gallery` | Check a direction document, compile proposals, plan a limited set of variants. Read-only. |
| `check_scene_effects`, `plan_scene_effects` | Check declared effects and bind them to a render plan. Read-only. |
| `check_scene_behavior`, `audit_scene_behavior` | Check a behavior document and audit its declared behavior. Read-only. |

Four local tools compose and render vector icon scenes and read soundtrack scores. They make no model or network request and write only optional outputs inside the root:

| Tool | Effect |
| --- | --- |
| `compose_icon`, `render_icon` | Solve an icon scene, collection, construction program, or recipe; draw it to inert SVG or replay a recipe (`slopcamera.icon.compose`, `slopcamera.icon.render`) |
| `compose_soundtrack`, `derive_soundtrack_grid` | Verify a loop, song, or MIDI file; derive its `bpm`, `beatOffsetUs`, `beatsPerBar`, and section cue times (`slopcamera.soundtrack.compose`, `slopcamera.soundtrack.grid`) |

Discover the installed server's tools after restarting the client. Older releases have a smaller toolset, and a package version string alone does not identify a source checkout.

## Path and limit rules

- Every path is root-relative to the `--root` directory. Absolute paths and `..` segments reject, and links resolve inside the root before any read or write.
- Diagram sources must end in `.diagram.json`, fit in 1 MiB, and contain at most 64 shapes and 128 edges. Checks and renders return at most 40 findings.
- `render_diagram` accepts an optional `out_dir` and a `scale` of at most 4; the scaled canvas may not exceed 16,777,216 pixels. Rendering overwrites the five artifacts atomically.
- Scene, direction, and effects JSON sources must end in `.json` and fit in 1 MiB; scene tools are read-mostly and never mutate project state.
- `slopcamera.image.vectorize` reads a raster inside the root, up to 16 MiB, and writes an inert SVG inside the root.
- `slopcamera.image.generate` takes a `provider/model` id, a prompt, and a root-relative `outputPath`, then sends one non-retried request to Vercel AI Gateway.

## Credentials and scope

`slopcamera.image.generate` uses the server process's `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN`; supply it through the client's environment or secret configuration. A direct Gateway key needs no Vercel CLI. Vectorization needs no credential and no network, and on Windows that profile deliberately fails closed. Image icon and gallery operations also use the Gateway credential and can make paid requests. Scene inspection and planning run locally against the workspace.

The server is deliberately a subset: it exposes no recording, project, studio, or workflow command. For the full local surface, install the Agent Skill for [Codex](/docs/tutorials/codex) or [Claude Code](/docs/tutorials/claude-code), or give another agent the [portable skill or plain CLI](/docs/tutorials/other-agents).

- [Create and revise your first diagram](/docs/tutorials/first-diagram) explains the five artifacts `render_diagram` writes.
- [SDK surfaces](/docs/reference/sdk) covers the fixed registry and its typed inputs.
