# Extension architecture

Slopcamera has no plugin API and no open operation-registration hook. Everything an agent or integrator can do composes a fixed, host-owned operation registry through a small set of bounded surfaces, each with an explicit trust level. This document explains why the model is shaped this way and which surface fits which job.

## The closed registry

Every unit of work is a registered operation: `scene.render@1`, `media.overlay@1`, `iteration.select@1`, and so on. The catalog lives in host source (`apps/desktop/application/default-registry.ts`), each operation declares a versioned input/output schema, a lifecycle class (pure, media effect, project mutation, paid call), resource claims, cache and resume semantics, and a discovery entry. Nothing outside the host can add, replace, or wrap an operation — there is deliberately no registration hook for authored code.

Three surfaces read that same registry:

- `slopcamera operations list|show` exposes the operation catalog with JSON Schemas.
- `slopcamera capabilities [--json]` projects operations, built-in workflows, MCP tools, and commands into static capability modules with trust, lifecycle, effect, resource, and qualification metadata — without probing the host.
- The semantic builder (`@hraness/slopcamera/local/code`) lowers typed method calls into fixed operation kinds and versions; a graph naming an unsupported capability rejects at compile time, before executor or resource admission.

## The trust ladder

Extension surfaces are ordered by how much authority they carry:

1. **Inert documents** — recipe packs, scene/direction/effects/cinema documents. Parsed from `unknown`, bounded, content-addressed, no executable content. An agent authors these freely; admission validates them before any work.
2. **Declarative graphs** — `@hraness/slopcamera/code` workflows. Graph construction must not execute operations, read credentials, contact providers, or mutate state. Compilation binds source, input, registry, and runtime digests.
3. **Trusted workflow modules** — explicitly imported Bun/TypeScript modules (`code init|check|plan|run`, or built-ins). Loading evaluates top-level code as the current user, with no OS sandbox. The graph they produce is still declarative data checked against the same registry.
4. **The native-authoring exception** — `slopcamera.studio.run@1` may execute a previously retained, hash-bound Blender/Manim/CadQuery bundle through a closed adapter. It requires a separate invocation-scoped trust envelope beyond workflow write grants.

The rule of thumb: the more a surface can *do*, the more explicit its trust envelope. Inert data needs no trust; arbitrary source needs the current user's explicit decision.

## Recipe packs: the declarative extension kit

A `slopcamera.spatial-recipe-pack` is the canonical example of extending by document. It names an admitted scene by digest, one direction document, gallery axes, named preview render requests, an optional effects block, and optional temporal-audit inputs — everything the `cinematic-world` workflow needs to build its graph. The pack cannot register executors, introduce source paths beyond the declared render source, carry credentials or provider options, or name remote URLs. Equivalent packs yield equivalent plan identities, which makes packs diffable, reviewable, and safe to generate from an agent.

The same pattern applies elsewhere: `slopcamera.project-cinema-plan` sidecars parameterize sequence assembly; `slopcamera.spatial-direction` parameterizes semantic direction; recipe-style JSON drives `creative-iteration` candidates. Each is validated by a strict schema owned by the host.

## Why not a plugin API

The product's core guarantees — deterministic audits, bounded resources, reproducible identity, crash-safe recovery, no ambient networking — depend on the host knowing every effect a graph can produce *before* it runs. An open registration hook would let authored code smuggle effects past the requirement envelope the compiler derives. Keeping registration closed means `slopcamera capabilities` can honestly enumerate what the installed host can do, and a plan digest can honestly bind the complete operation inventory it depends on.

Coding agents still extend the system in practice — they author documents, recipes, packs, and graphs, and they can author new trusted workflow modules with the same authority as any local Bun code. The boundary is between *authoring inputs* (free) and *registering behavior* (host-owned).

## Architectural context: GhostGet and pi.dev

Two public systems frame the design space — as architectural context only, implying no integration, endorsement, or equivalent security posture.

[GhostGet](https://ghostget.com/) demonstrates a strong local agent contract: each request selects one named, versioned action; capability discovery is authoritative; transport, risk, and runtime identity are bound before dispatch; contract drift fails closed; and uncertain mutations are not retried blindly. Slopcamera adopts those principles for its own media capabilities, resource admission, receipts, and discovery — the closed registry and static capability manifest are how a filmmaking host keeps an authoritative contract.

[pi.dev extensions](https://pi.dev/docs/latest/extensions) demonstrate excellent agent ergonomics: typed tools, lifecycle hooks, commands, UI, session state, explicit project trust, and packageable examples — and pi.dev states plainly that extensions execute with full user permissions. Slopcamera therefore does not copy hot-loaded operation registration into its portable or complete host. Trusted TypeScript remains an explicit authoring surface (a workflow module is imported as current-user code), while production capabilities stay reviewed and statically assembled.

The synthesis: adopt GhostGet-style contract discipline for *what the host can do*, pi-style ergonomics for *how an agent expresses intent* — recipe packs, direction documents, and declarative graphs give agents the same comfortable authoring surface without giving authored code a path into the execution kernel.

## Where each surface lives

| Surface | Contract | Trust |
| --- | --- | --- |
| Recipe packs, scene/direction/effects/cinema docs | `src/spatial-scene/*.ts` schemas | Inert data |
| `cinematic-world` and other built-ins | `apps/desktop/workflows/` | Reviewed graph definitions |
| Declarative graphs | `@hraness/slopcamera/code`, `/local/code` | Data until executed |
| Custom workflow modules | `@hraness/slopcamera/workflow`, `slopcamera code` | Trusted current-user code |
| MCP tools | `src/mcp/` | Fixed read-mostly toolset |
| Native execution | `slopcamera.studio.run` | Separate trust envelope |

See also: [capabilities, versions, and platforms](reference/capabilities.md) · [run or recover a workflow](how-to/run-workflows.md) · [direct a cinematic world](how-to/direct-cinematic-worlds.md) · [SDK surfaces](reference/sdk.md)
