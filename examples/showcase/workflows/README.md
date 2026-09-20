# One diagram through three interfaces

This example renders the same retained diagram through the imperative SDK,
the declarative graph SDK, and an actual root-scoped MCP stdio session. It
checks that the resulting light PNGs have identical bytes on this toolchain.
The source, labels and geometry are identical, so the interface choice should
not change this image.

```sh
bun examples/showcase/workflows/render-diagram.ts
```

Run from a fresh checkout's repository root after its locked dependencies are
installed. The comparison helper uses fixed output names; it is not a history
store for repeated runs.
The script reuses the maintained workflow implementations in
`examples/render-workflow.ts` and `examples/declarative-workflow.ts`.
Its MCP session initializes the source CLI, calls `check_diagram` and
`render_diagram`, closes input and collects the server. Receipts and all five
exports per interface stay under ignored `artifacts/showcase/workflows/`.
It executes local trusted code and local rendering; no model account is used.

A matching PNG does not prove that every CLI command is available through MCP.
The v3.3.1 release exposes 17 MCP tool names, including 13 scene tools. Use
discovery and the capability reference for the installed version.

An independent review of the retained run compared all five exported formats
across the three interfaces, including the dark PNG, both SVGs, and editable
`.tldr`. Every format matched byte for byte on the same toolchain. The
declarative compilation identity and both node receipt digests also matched.
The declarative example orders the lint check before rendering; unlike the
imperative example, it does not conditionally veto a render on lint findings.

## Inspect the base stage through MCP

```sh
bun examples/showcase/workflows/inspect-scene-mcp.ts
```

This separate repository helper opens a root-scoped stdio session, calls
`tools/list`, and then calls `inspect_scene` on
`../parametric/crescent-pavilion/base.scene.json`. The actual root-relative
path is retained in the helper. This JSON contains the six lighting/backdrop
entities and three cameras before the pavilion's procedural geometry is
compiled. It contains no external assets and does not execute native source.

The retained call returned all six entities with no truncation and left the
source bytes unchanged. The helper closes input, collects the server and both
output streams, bounds the session to 30 seconds and 1 MiB per stream, and
writes a fresh `scene-inspect-*` receipt directory. It never overwrites the
diagram MCP receipt. Discovery of source tools is not release qualification.
