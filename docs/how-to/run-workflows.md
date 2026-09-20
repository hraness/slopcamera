# Run or recover a workflow

Use a workflow when the same explicit media operations should be planned, reviewed and resumed together. Built-in recipes and custom local Code Mode use the complete host's closed operation registry and durable scheduler. The [SDK reference](../reference/sdk.md) distinguishes that host from the smaller portable projection.

## One diagram through three interfaces

Use the same editable source to compare the portable imperative SDK, declarative graph SDK, and root-scoped MCP server. From a fresh source checkout with its locked dependencies installed, run the [comparison helper](https://github.com/hraness/slopcamera/tree/main/examples/showcase/workflows):

```sh
bun install --frozen-lockfile --ignore-scripts
bun examples/showcase/workflows/render-diagram.ts
```

This performs local diagram rendering without a model account. The helper writes separate output directories for each interface and checks the light PNGs for byte equality. In the retained run, all five formats matched across all three interfaces: the editable `.tldr`, light and dark SVGs, and light and dark PNGs. That comparison used the same source, renderer, fonts, and toolchain; it does not promise identical bytes across versions or machines.

[View the editable diagram and its five downloads](https://slopcamera.com/docs/tutorials/first-diagram).

### Imperative

The [imperative module](https://github.com/hraness/slopcamera/blob/main/examples/render-workflow.ts) calls `slopcamera.diagram.check` as `check-source`, then `slopcamera.diagram.render` as `render-assets`. It stops before rendering if lint findings exist. The actual result retained those two ordered step identities and the five output paths. Choose this form when ordinary trusted TypeScript control flow should decide which fixed operation runs next.

### Declarative

The [declarative module](https://github.com/hraness/slopcamera/blob/main/examples/declarative-workflow.ts) declares the render node after the check node, compiles the graph against the portable capability projection, and then executes it. Its result contains a compilation digest and two node receipts; each output digest matched its returned value in the retained run. The dependency orders the check before rendering; this example does not add the imperative module's conditional lint veto. For durable local media execution, use the complete host's Code Mode and run commands below.

### MCP

The same helper opens an actual stdio MCP session, initializes it, calls `check_diagram` and `render_diagram` with root-relative paths, then closes and collects the server. Tool discovery describes the available projection; it does not expose every local-host command.

Current source also supports read-only scene inspection. Run its separate helper to discover tools and inspect the base stage used by the crescent pavilion:

```sh
bun examples/showcase/workflows/inspect-scene-mcp.ts
```

The retained inspection returned all six stage entities, their editable controls, and three cameras without changing the input. This is the lighting and backdrop stage before the pavilion geometry is compiled. The helper writes a fresh receipt directory and checks the server's clean exit. The scene-inspection tool ships in v3.3.1; this retained call ran through the repository source helper, not a separate release-install test; follow the [MCP setup guide](https://slopcamera.com/docs/tutorials/mcp) for the installed version's supported tools.

## Start with a built-in recipe

```sh
slopcamera workflows list --json
slopcamera workflows show social-variants --json
```

Prepare `input.json` against the returned schema using an inspected project ID and the requested output choices. Then plan and run that same input:

```sh
slopcamera workflows plan social-variants --input input.json --json
slopcamera workflows run social-variants --input input.json --json
```

The built-ins cover talking-head cleanup, polished screen demos, chaptered compositions, social variants, creative iteration/selection, prepared directed-scene delivery, and the cinematic-world planning loop over an inert recipe pack. Their input schemas differ; do not reuse another recipe's JSON blindly.

Planning does not execute registered media effects. It binds the relevant structure and policy; execution can still pause when a particular node needs an exact preparation or effect approval.

## Author a local graph

Use the installed Bun package or a source checkout for local Code Mode; a copied standalone executable does not carry the checked host sources the build-identity scan binds:

```sh
slopcamera code init film.ts
slopcamera code check film.ts --json
slopcamera code plan film.ts --input input.json --json
slopcamera code run film.ts --input input.json --plan <returned-plan-sha256> --json
```

Edit the scaffold and its input to the required operations before planning. `--plan` rejects a changed source, input, structural binding, registry or runtime. Author through `@hraness/slopcamera/local/code` and the supported local import surfaces; discover operation schemas instead of inventing names or policy fields.

Loading a custom workflow evaluates trusted TypeScript, including module top-level code. Checking and planning trusted source are not an OS sandbox. The graph itself is declarative, and graph construction must not execute the registered operations. Keep native authoring in its explicit studio adapter rather than adding a shell-command operation.

## Inspect and authorize a paused run

```sh
slopcamera runs list --json
slopcamera runs show <run-id> --nodes all --json
```

Use the exact node key and plan digest reported by the run. The two approval forms authorize different boundaries:

```sh
slopcamera runs approve <run-id> <node-key> --preparation-plan <sha256> --json
slopcamera runs approve <run-id> <node-key> --node-plan <sha256> --json
```

Choose the form requested by that paused node. Approval records authority; it does not execute the node. Resume the original run afterward:

```sh
slopcamera runs resume <run-id> --json
```

For studio execution, separately pass `--studio-blender-bin <executable>` or `--studio-python <venv-python>` and `--allow-trusted-code` on `code run`, `workflows run` or `runs resume`. A runtime path or generic write grant does not authorize native source. See [native workflow execution](../studio.md#use-native-jobs-in-an-agent-workflow).

## Resume

The retained `social-variants` execution paused four times before nodes received their requested preparation authorization. Its final journal contains 117 ordered events: all 13 nodes have one running event and one completed event, each at attempt one. The 26 later reuse events refer to the same retained output digests, and no completed node was dispatched again. The four final output files and their receipts still match their recorded byte lengths and hashes.

That demonstrates reuse through these local preparation pauses. It does not demonstrate recovery from a process crash or an uncertain paid request. The original films were withheld after visual review; successful execution alone did not make them suitable examples. The [separately authored delivery variants](https://slopcamera.com/docs/how-to/edit-video#directed-delivery-variants) show the reviewed compositions.

## Recover without duplicating work

Keep the original run ID, source and receipts. Normal resume reuses matching retained outcomes; it does not automatically replay ambiguous trusted compute or issue a new uncertain paid request. Use `--replay-ambiguous-code <node-key>` only after inspecting the exact ambiguity and deliberately authorizing that next attempt.

If a paid node used a provider-options file, supply the same digest-matching file on resume. Its raw contents cannot be recovered from the journal. Do not substitute changed settings while claiming the old plan.

To stop new work:

```sh
slopcamera runs cancel <run-id> --json
```

Cancellation is durable, but does not roll back artifacts already published. Inspect the retained result and any unresolved custody before beginning a replacement run. Studio reconciliation, directing resume and Blob cleanup have their own narrower commands; none is a universal retry mechanism.
