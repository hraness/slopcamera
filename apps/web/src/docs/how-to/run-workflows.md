Use a workflow when the same explicit media operations should be planned, reviewed, and resumed together. Built-in recipes and your own Bun modules share the complete host's closed operation registry, and every run is durable: the scheduler binds exact inputs, plans, and observed runtime identities, then retains progress and receipts you can inspect and resume later. The [SDK reference](/docs/reference/sdk) distinguishes the complete local host from the smaller portable projection.

## Run a built-in recipe

```sh
slopcamera workflows list --json
slopcamera workflows show social-variants --json
```

The built-ins cover talking-head cleanup (`talking-head-cleanup`), polished screen demos (`polished-screen-demo`), chaptered compositions (`chaptered-demo`), social variants (`social-variants`), creative iteration and selection (`creative-iteration`, `creative-selection`), and prepared directed-scene delivery (`directed-scene`). Their input schemas differ, so write `input.json` against the schema returned by `show` instead of reusing another recipe's JSON. Use an inspected project ID and the requested output choices, then plan and run that same input:

```sh
slopcamera workflows plan social-variants --input input.json --json
slopcamera workflows run social-variants --input input.json --json
```

Planning binds the relevant structure and policy without executing registered media effects. Execution can still pause when a particular node needs an exact preparation or effect approval, which is what the `runs` commands below are for.

## Author a trusted Bun module

Custom local workflows are explicitly imported TypeScript modules over the same fixed registry. They need the source-backed Bun distribution from [Build Slopcamera from source](/docs/how-to/install-from-source), because a copied binary or installed package does not provide the local Code Mode build-identity scan.

```sh
slopcamera code init film.ts
slopcamera code check film.ts --json
slopcamera code plan film.ts --input input.json --json
slopcamera code run film.ts --input input.json --plan <returned-plan-sha256> --json
```

Author through `@hraness/slopcamera/local/code` and discover operation schemas with `slopcamera operations list --json` rather than inventing names or policy fields. The checked examples [render-workflow.ts](https://github.com/hraness/slopcamera/blob/main/examples/render-workflow.ts), [declarative-workflow.ts](https://github.com/hraness/slopcamera/blob/main/examples/declarative-workflow.ts), and [native-workflow.ts](https://github.com/hraness/slopcamera/blob/main/examples/studio/native-workflow.ts) show the imperative, declarative, and studio-bound forms. [Extend Slopcamera](/docs/explanation/extending) explains how these surfaces fit together.

Loading a module evaluates its top-level code as the current user, including during `check` and `plan`. That evaluation is not an operating-system sandbox, so review the source before invoking it. The graph itself is declarative, and building it must not execute the registered operations. Passing `--plan` to `code run` rejects a changed source, input, structural binding, registry, or runtime.

## Inspect and authorize a paused run

```sh
slopcamera runs list --json
slopcamera runs show <run-id> --nodes all --json
```

A paused node reports the exact node key and plan digest it needs. The two approval forms authorize different boundaries, so choose the form that node requested:

```sh
slopcamera runs approve <run-id> <node-key> --preparation-plan <sha256> --json
slopcamera runs approve <run-id> <node-key> --node-plan <sha256> --json
```

Approval records authority and releases the claim; it does not execute the node. Resume the original run afterward:

```sh
slopcamera runs resume <run-id> --json
```

A node that runs native studio source additionally needs an invocation-scoped runtime selection and trusted-code authorization: pass `--studio-blender-bin <executable>` or `--studio-python <venv-python>` together with `--allow-trusted-code` on `code run`, `workflows run`, or `runs resume`. Selecting a runtime or holding a generic write grant does not authorize native source. [Author a native film](/docs/how-to/native-films) describes what that execution does.

## Recover without duplicating work

Keep the original run ID, source, and receipts. A normal resume reuses matching retained outcomes; it does not replay ambiguous trusted compute or issue a new uncertain paid request. Pass `--replay-ambiguous-code <node-key>` on resume only after inspecting the exact ambiguity and deliberately authorizing that node's next attempt.

If a paid node used a provider-options file, supply the same digest-matching file on resume. Its raw values are never stored in the journal and cannot be recovered from it, so do not substitute changed settings while claiming the old plan.

To stop new work:

```sh
slopcamera runs cancel <run-id> --json
```

Cancellation is durable and prevents new dispatch or publication, but it does not roll back artifacts already published. Inspect the retained result and any unresolved custody before starting a replacement run. Studio reconciliation, directing resume, and Blob cleanup each have their own narrower commands described in [Author a native film](/docs/how-to/native-films) and [Direct short generated clips](/docs/how-to/direct-takes); none is a universal retry mechanism.
