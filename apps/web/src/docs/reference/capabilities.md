This page is the current contract for the Slopcamera CLI: what it produces, which surfaces each installation form provides, and where its runtime and trust boundaries sit. A package's version number alone does not identify a source checkout, so inspect the commit and the installed build's own command help.

## Output families and interfaces

Slopcamera covers four output families: images, diagrams, animated loops, and video. Audio and captions are composable project inputs rather than another project model.

| Interface | Surface |
| --- | --- |
| Agent Skill | Version-matched instructions installed by `{{SKILL_INSTALL_COMMAND}}` (or `{{SKILL_INSTALL_COMMAND_CLAUDE}}` for Claude Code) |
| CLI | The `slopcamera` command; reads and mutations support `--json` receipts |
| TypeScript SDK | `@hraness/slopcamera` portable imports plus the complete-local-host `./local/*` surfaces; see [SDK surfaces](/docs/reference/sdk) |
| MCP server | `slopcamera mcp --root <workspace>` exposes a fixed toolset inside one selected root; see [Use Slopcamera from an MCP client](/docs/tutorials/mcp) |

The v3.2.8 portable projection has four operation codes: diagram check/render and image generate/vectorize. Its MCP server exposes four named tools: `check_diagram`, `render_diagram`, `search_slopcamera`, and `execute_slopcamera`. Current source adds the icon and gallery operation codes and thirteen scene tools, for six portable operations and seventeen named MCP tools. The complete local host has a separate, larger closed registry. No surface accepts caller-registered operations.

## Install the release

```sh
{{ARCHIVE_INSTALL_COMMAND}}
```

The verified release is published at `{{RELEASE_URL}}` and requires Bun 1.3.14 or newer on macOS, Linux, or Windows. [Build Slopcamera from source](/docs/how-to/install-from-source) for the complete capability set, or to follow `main`. The historical Atet v3.2.3 archive contains `@hraness/atet` and the `atet` command; it does not install Slopcamera. Do not substitute the renamed package or executable into an old Atet archive URL, silently switch versions, or use historical paid-world commands as a substitute for the current saved-world workflow.

## Release availability

| Surface | Historical Atet v3.2.3 | Slopcamera v{{PUBLISHED_VERSION}} |
| --- | --- | --- |
| Diagrams, vectorization, Gateway media, recording-bundle editing, ordinary project edits, local workflows | Available with the relevant local tools and credentials | Available |
| Editable spatial scenes, calibrated scene cameras, V2 shots, Three hardware and Spark profiles, saved-world import | Available | Available |
| Paid World Labs world commands | Present in the historical release | Removed; saved-world import and historical provenance replay remain |
| Retained short-video directing: `direct` | Absent | Available |
| Blender, CadQuery, Manim, and acquisition: `studio` | Absent | Available |
| Native output admission: `studio asset` | Absent | Available |
| Calibrated camera samples: `scene camera-track` | Absent | Available |
| External vgpu 0.4.1 native example | Absent | Explicit example runtime; not a new registered studio engine |

## Release and current-source additions

The immutable [v3.2.8 release](https://github.com/hraness/slopcamera/releases/tag/v3.2.8) was published on September 16, 2026 from commit `dc5ae8d0b42fa9922ef654bc505428ba022a098e`. The table below separates that archive from later source behavior checked on September 19, 2026. A checkout can still report `3.2.8` after adding commands.

| Capability | v3.2.8 archive | Later source |
| --- | --- | --- |
| HTML scene export, all seven authoring profiles, music-clock helpers, audio-reactive bands | Included | Included |
| Blender, CadQuery, Manim, seven native starters, retained video takes | Included; runtime/provider requirements apply | Included |
| Basic spatial scenes, calibrated camera tracks, hardware/Spark profiles, saved-world import | Included | Included |
| Static `capabilities --json` manifest; image icon and candidate-gallery recipes | Absent | Included |
| Scene builders/admission, scene audits, rendered galleries, vision critique, character/performance and cinematic camera APIs | Absent | Included |
| Scene effects, particles, simulation bakes, semantic direction, temporal/behavior audits, project cinema plans | Absent | Included |
| Built-in workflows | Seven; inspect `workflows list` | Eight, adding `cinematic-world` |
| New screen, camera, microphone, or system-audio capture | Absent | Absent |

HTML rigged-GLB preparation and native character authoring already exist in v3.2.8. The newer portable spatial character, rigged/morph, and performance contracts are separate source additions. Model and runtime availability still require inspection on the machine doing the work; presence in an archive is not a live qualification result.

## What requires the source-backed distribution

Durable workflow planning and execution bind a build identity over the installed host source tree. `slopcamera workflows plan`, `slopcamera workflows run`, `slopcamera code check`, `slopcamera code plan`, `slopcamera code run`, and `slopcamera runs resume` therefore require the Bun package or a source checkout — both ship the checked host sources — rather than a copied standalone executable, which embeds no physical source tree; [Run or recover a workflow](/docs/how-to/run-workflows) covers the run model. The same boundary applies to local SDK imports through `@hraness/slopcamera/local/code`.

Read-only catalog commands such as `workflows list`, `workflows show`, `runs list`, `runs show`, and `operations list` work from any install. The copied macOS executable supports direct `studio` commands with embedded starters and drivers. The CLI, its optional unbundled menu-bar companion, and the Bun package are separate interfaces with separate installation requirements.

## Discover the installed contract

| Need | Discovery command |
| --- | --- |
| CLI version and top-level commands | `slopcamera --version`, `slopcamera --help` |
| Grammar for a command family | `slopcamera help project`, `slopcamera help studio`, `slopcamera help scene` |
| Local tools and readiness | `{{DOCTOR_COMMAND}}` |
| Closed operation catalog and exact schemas | `slopcamera operations list --json`, `slopcamera operations show <kind>[@<version>] --json` |
| Built-in workflow input schema | `slopcamera workflows list --json`, `slopcamera workflows show <id> --json` |
| Live Gateway model capabilities | `slopcamera ai models list --type <type> --json`, `slopcamera ai models show <id> --json` |
| Current-source capability manifest | `slopcamera capabilities --json` |
| HTML scene export | `slopcamera help html`, `slopcamera html render --input <scene.json> --dry-run --json` |
| HTML profile locks | `slopcamera html catalog --json` |
| Version-matched packaged agent instructions | `slopcamera skill path` |

## Runtime and platform requirements

| Work | Required runtime and boundary |
| --- | --- |
| Diagram JSON, SVG/PNG, and tldraw export | Bun package and bundled rendering dependencies; no tldraw app required |
| Vectorization | Bounded macOS/Linux profile; checksum-pinned VTracer can be obtained on first use. Windows deliberately rejects this profile |
| Ordinary media and delivery | FFmpeg and FFprobe; `doctor` reports additional analysis dependencies |
| HTML or Three rendering | Admitted local Chrome runtime and declared assets; dependencies may need initial verified provisioning |
| `three-webgl2-hardware-v1` | Qualified macOS ANGLE Metal WebGL2 context; software or unknown fallback rejects |
| `three-spark-webgl2-hardware-v1` | Separate qualified Spark profile for bounded saved splats; its format, camera, and output limits apply |
| Blender | Explicit executable selection; CPU or requested GPU, and a GPU request never silently falls back to CPU |
| CadQuery and Manim | Explicit Python environment; Manim uses its qualified Cairo profile and owns silent visuals |
| External vgpu native example | Separately provisioned pinned Node and Dawn runtime; distinct from the browser overlay lock |

Native studio qualification used Blender 5.2.1 LTS on an Apple M4 Max, CadQuery 2.8.0, and Manim Community 0.21.0. These observations do not certify every plugin, solver, device, or imported asset. [The engine stack](/docs/reference/engines) describes what each part does, needs, and where its limits are.

Ordinary `project add` and SDK `media.ingest` imports require an existing project. Creation starts from an existing finished recording bundle, a successful studio or directing assembly, or an authored scene rendered with `slopcamera html render`. Arbitrary standalone files alone cannot create an empty project.

## Trust boundaries

There is no Slopcamera account or hosted project database. Editing and rendering stay local, and these are the surfaces that can cross the network boundary:

- Gateway model discovery and paid generation, which read `AI_GATEWAY_API_KEY` before `VERCEL_OIDC_TOKEN` in the local process environment, never persist credentials, pin the Gateway origin, and send with `maxRetries: 0`.
- Selected cloud analysis and optional private Blob reference hosting, each behind its own acknowledgement.
- Poly Haven asset acquisition and first-use runtime or tool provisioning.

Credentials and upload or trusted-code acknowledgements remain invocation-scoped: `--allow-cloud-upload`, `--allow-cloud-audio-upload`, `--allow-paid-generation`, `--allow-reference-hosting`, and `--allow-trusted-code` apply to one invocation, and a local source import does not authorize executing it or sending it to a model. Rendering from a prepared local closure does not upload a project.

Native studio jobs and custom Bun workflow modules run as the current user without an OS sandbox; hash receipts and process supervision provide provenance and control, not confinement. Directing budgets use catalog estimates, not provider-enforced spending caps.
