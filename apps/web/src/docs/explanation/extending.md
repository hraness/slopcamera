Slopcamera has no plugin API and no open operation-registration hook. Extending what an agent can do goes through a small set of bounded surfaces, each with a fixed contract and a stated trust level: teach the agent through the installed skill and workspace configuration, compose existing operations through the SDK and workflows, expose the fixed toolset through MCP, or add a separately installed native engine under explicit trust.

## Teach the agent the contract

The Agent Skill is the lightest surface. `{{SKILL_INSTALL_COMMAND}}` (or `{{SKILL_INSTALL_COMMAND_CLAUDE}}` for Claude Code) installs version-matched guidance that routes an agent to the task reference for each kind of job. It comes from the same release or checkout as the CLI, so the documented grammar matches the installed one. Installing the skill does not install the CLI or native engines; inside a repository, `--scope project` keeps the install project-local.

For diagrams, a `slopcamera.config.*` file beside the source extends what the renderer can draw: a configured font with local files, named icon bodies given as sanitized SVG geometry, and light and dark theme overrides. The values are parsed into a typed `DiagramConfig`. A TypeScript or JavaScript config is imported as trusted workspace code; a JSON config is inert data.

## Pick an SDK boundary

Imports select their capability boundary, and each entrypoint is a fixed contract.

| Import | Surface |
| --- | --- |
| `@hraness/slopcamera` | Diagram schemas and rendering, local vectorization, portable scene and studio contracts, and pure planning helpers. |
| `@hraness/slopcamera/code` | Declarative graph authoring and compilation against the fixed portable projection. |
| `@hraness/slopcamera/code/advanced` | Lower-level portable graph, compiler, and planning contracts. |
| `@hraness/slopcamera/operations` | The fixed portable semantic operation registry. |
| `@hraness/slopcamera/workflow` | The preserved imperative v0.8 API for explicitly imported trusted Bun workflows. |
| `@hraness/slopcamera/host-resources` | Host resource admission contracts. |
| `@hraness/slopcamera/local/code`, `.../local/code/advanced`, `.../local/code/workflows`, `.../local/html-overlay` | The complete local host: declarative authoring over the full closed registry, checked built-in workflows, planning and host integration, and HTML overlay contracts. |

The v3.3.1 portable projection has six operations: diagram check/render and image generate/vectorize/icon/gallery. The complete host adds media, analysis, editing, native jobs, scenes, and project operations. Inspect the exact installed inventory with `slopcamera operations list --json`; the static discovery command is `slopcamera capabilities --json`. A graph that names an unsupported operation fails before execution or resource admission. Inputs are typed data; they cannot register new operations. The [SDK reference](/docs/reference/sdk) records each import's scope and effects.

## Author a workflow

Workflows package the same fixed operations so they can be planned, reviewed, and resumed together.

- Built-in recipes are reviewed graph definitions listed by `slopcamera workflows list`: talking-head cleanup, polished screen demos, chaptered compositions, social variants, creative iteration and selection, prepared directed-scene delivery, and the cinematic-world planning loop that compiles direction, galleries, effect-bound previews, and a temporal audit for an admitted scene. Each takes a typed JSON input against its own schema.
- Custom declarative graphs are authored through `@hraness/slopcamera/local/code` and driven by `slopcamera code init`, `code check`, `code plan`, and `code run`. Binding a returned plan digest makes a changed source, input, registry, or runtime reject.
- Imperative modules use `@hraness/slopcamera/workflow` to compose the same operations with explicit step keys and a parsed input contract.
- Current-source spatial recipe packs are inert, content-addressed JSON documents (`slopcamera.spatial-recipe-pack`) that an agent authors to parameterize the cinematic-world workflow: one scene identity, one direction document, bounded gallery axes, preview render requests, optional declared effects, and an optional temporal audit. A pack cannot name executors, source paths, permissions, secrets, or runtime URLs; it only selects and bounds what the closed registry already allows.

The trust model is explicit. A custom workflow module is an explicitly imported trusted Bun module: loading it evaluates top-level module code, including during `code check` and `code plan`, and it runs as the current user without an operating-system sandbox. The graph it builds is declarative data, and constructing a graph must not execute the operations it names. Runs are durable: `slopcamera runs show` inspects a run, `runs approve` records an exact plan digest for a paused node, and `runs resume` reuses retained outcomes whose identities still match. [Run or recover a workflow](/docs/how-to/run-workflows) covers the commands.

## Expose a fixed toolset through MCP

`slopcamera mcp --root /absolute/workspace` serves 17 named tools in v3.3.1: `check_diagram`, `render_diagram`, `search_slopcamera`, `execute_slopcamera`, and 13 read-mostly scene tools. The portable projection contains six operation codes. Those scene tools inspect, plan, and audit source, direction, effects, behavior, and temporal evidence without mutating project state. Paths remain root-relative and operation registration stays closed. A client needing project editing, native jobs, or promotion uses the CLI or SDK. The [MCP tutorial](/docs/tutorials/mcp) owns the complete versioned tool list and setup.

## Add a native engine separately

Blender, CadQuery, and Manim are installed separately, and the operator selects the exact executable or Python environment per invocation; Slopcamera does not silently install or upgrade native tools. `slopcamera.studio.run` is the single operation allowed to execute authored code. It runs a previously retained, hash-bound bundle through the closed host adapter, and only inside an invocation-scoped trusted-current-user envelope: `--allow-trusted-code` plus an explicit runtime path on `code run`, `workflows run`, or `runs resume`. A stored write approval cannot grant it, and a missing envelope pauses the node before dispatch. Runtime paths and argv remain host-owned, and the profile declares no OS sandbox or hermetic dependency closure.

The external vgpu example follows the same pattern through a separately provisioned Node/Dawn runtime. It is an example environment, not a registered studio engine. [Author a native film](/docs/how-to/native-films) describes the retained-source job lifecycle.

## Where extension stops

Extending Slopcamera means composing fixed operations, declaring new source, or adding a separately qualified engine. There is no runtime hook that registers operations, no workflow step that loads a caller-selected source path, and no document-level switch that widens a profile. New behavior enters through a reviewed change to the registries in source; [build Slopcamera from source](/docs/how-to/install-from-source) is the starting point for carrying a modified contract.
