`slopcamera mcp --root /absolute/workspace` serves a fixed toolset over stdio: newline-delimited JSON-RPC at protocol version `2025-11-25`, server name `hraness-slopcamera`, with protocol messages as the only stdout surface. Cursor, Claude Desktop, and other MCP-capable clients register it as a local command; every path the tools accept stays relative to the selected root.

## The fixed toolset

The released server exposes 17 named tools. Four general tools:

| Tool | Effect |
| --- | --- |
| `check_diagram` | Parse and lint one `.diagram.json` source. Read-only. |
| `render_diagram` | Write the five artifacts a CLI render produces: `.tldr`, light and dark SVG, and light and dark PNG. |
| `search_slopcamera` | Search the fixed operation registry by bounded text. Never executes anything. |
| `execute_slopcamera` | Run one exact operation code with typed JSON input. |

`execute_slopcamera` admits six operation codes: `slopcamera.diagram.check`, `slopcamera.diagram.render`, `slopcamera.image.vectorize`, `slopcamera.image.generate`, `slopcamera.image.icon`, and `slopcamera.image.gallery`. Thirteen read-mostly scene tools inspect, plan, and audit without mutating project state:

| Tools | Effect |
| --- | --- |
| `check_scene`, `inspect_scene`, `diff_scenes` | Validate, summarize, or compare scene JSON sources |
| `evaluate_scene`, `audit_scene`, `audit_scene_temporal` | Sample world state and report spatial or temporal findings |
| `check_scene_direction`, `plan_scene_direction`, `plan_scene_gallery` | Check a direction document, compile proposals, plan bounded variants |
| `check_scene_effects`, `plan_scene_effects` | Check declared effects and bind them to a render plan |
| `check_scene_behavior`, `audit_scene_behavior` | Check a behavior document and audit its declared behavior |

No surface accepts source text, evaluates caller code, executes workspace configuration, or registers a new operation. Renders run one at a time. Older releases expose a smaller toolset; restart the client and call `tools/list` to discover the installed server.

## Bounds

- Paths are root-relative. Absolute paths and `..` segments reject, and links resolve inside the root before any read or write.
- Diagram sources must end in `.diagram.json`, fit in 1 MiB, and hold at most 64 shapes and 128 edges; checks and renders return at most 40 findings.
- `render_diagram` accepts an optional `out_dir` and a `scale` of at most 4; the scaled canvas may not exceed 16,777,216 pixels and overwrites the five artifacts atomically.
- Scene, direction, and effects JSON must end in `.json` and fit in 1 MiB.
- `slopcamera.image.vectorize` reads a raster inside the root up to 16 MiB and writes an inert SVG inside the root.
- `slopcamera.image.generate` takes a `provider/model` id, a prompt, and a root-relative `outputPath`, then sends one non-retried request through the [Gateway contract](/docs/reference/gateway-generation) using the server process's environment credential. Icon and gallery codes can also make paid requests.

## What stays outside

The server is deliberately a subset: it exposes no recording, project, studio, or workflow command. For the full local surface, use the [CLI and Agent Skill](/docs/explanation/choose-an-interface), or see [Use Slopcamera from an MCP client](/docs/tutorials/mcp) for setup.
