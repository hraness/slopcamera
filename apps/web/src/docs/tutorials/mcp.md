An MCP-capable client can check and render diagrams, vectorize rasters, and generate images inside one workspace through `slopcamera mcp`, a local stdio server. Cursor, Claude Desktop, and similar clients launch it with a workspace directory, and every path the tools accept stays relative to that root.

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

Clients register it as a stdio command with arguments. Claude Desktop's `claude_desktop_config.json` and Cursor's `mcp.json` accept the same `mcpServers` shape:

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

The server speaks newline-delimited JSON-RPC (protocol version `2025-11-25`, server name `hraness-slopcamera`). Protocol messages are the only stdout surface; diagnostics go to stderr. Restart the client after editing its configuration so it launches a fresh server.

## What the tools expose

| Tool | Effect |
| --- | --- |
| `check_diagram` | Parse and lint one `.diagram.json` source. Read-only. |
| `render_diagram` | Write the same five artifacts the CLI render produces: `.tldr`, light and dark SVG, and light and dark PNG. |
| `search_slopcamera` | Search the fixed Slopcamera operation registry by bounded text. Never executes anything. |
| `execute_slopcamera` | Run one exact operation code with typed JSON input. |

`execute_slopcamera` admits exactly four operation codes: `slopcamera.diagram.check`, `slopcamera.diagram.render`, `slopcamera.image.vectorize`, and `slopcamera.image.generate`. No surface accepts source text, evaluates caller code, executes workspace configuration, or registers a new operation. Renders run one at a time.

## Path and limit rules

- Every path is root-relative to the `--root` directory. Absolute paths and `..` segments reject, and links resolve inside the root before any read or write.
- Diagram sources must end in `.diagram.json`, fit in 1 MiB, and contain at most 64 shapes and 128 edges. Checks and renders return at most 40 findings.
- `render_diagram` accepts an optional `out_dir` and a `scale` of at most 4; the scaled canvas may not exceed 16,777,216 pixels. Rendering overwrites the five artifacts atomically.
- `slopcamera.image.vectorize` reads a raster inside the root, up to 16 MiB, and writes an inert SVG inside the root.
- `slopcamera.image.generate` takes a `provider/model` id, a prompt, and a root-relative `outputPath`, then sends one non-retried request to Vercel AI Gateway.

## Credentials and scope

`slopcamera.image.generate` uses the server process's `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN`; a client `env` block is the usual way to supply one. Vectorization needs no credential and no network, and on Windows that profile deliberately fails closed. Everything else runs locally against the workspace.

The server is deliberately a subset: it exposes no recording, project, studio, or workflow command. For the full local surface, install the Agent Skill for [Codex](/docs/tutorials/codex) or [Claude Code](/docs/tutorials/claude-code), or give another agent the [portable skill or plain CLI](/docs/tutorials/other-agents).

- [Create and revise your first diagram](/docs/tutorials/first-diagram) explains the five artifacts `render_diagram` writes.
- [SDK surfaces](/docs/reference/sdk) covers the fixed registry and its typed inputs.
