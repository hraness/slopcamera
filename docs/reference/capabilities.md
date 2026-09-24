# Capabilities, versions, and platforms

This reference describes the current Slopcamera CLI and its runtime requirements. A package's version number alone does not identify a source checkout; inspect its commit and actual command help.

## Current Slopcamera and historical Atet

Slopcamera v3.3.6 installs from its [canonical release archive](https://github.com/hraness/slopcamera/releases/download/v3.3.6/hraness-slopcamera-3.3.6.tgz) or from [source](../how-to/use-current-source.md). The historical **Atet v3.2.3** archive contains `@hraness/atet` and the `atet` command; it does not install Slopcamera.

| Surface | Historical Atet v3.2.3 | Slopcamera v3.3.6 |
| --- | --- | --- |
| Diagrams, vectorization, Gateway media, recording-bundle editing, ordinary project edits, local workflows | Available with the relevant local tools and credentials | Available; neither this release nor current source captures new recordings |
| Editable spatial scenes, calibrated scene cameras, V2 shots, Three hardware and Spark profiles, saved-world import | Available | Available |
| Paid World Labs world commands | Present in the historical release | Removed; saved-world import and historical provenance replay remain |
| Retained short-video directing: `direct …` | Absent | Available |
| Blender, CadQuery, Manim and acquisition: `studio …` | Absent | Available |
| Native output admission: `studio asset` | Absent | Available |
| Calibrated camera samples: `scene camera-track` | Absent | Available |
| Parametric architectural designs: `scene design` | Absent | Available |
| External vgpu 0.4.1 native example | Absent | Explicit example runtime; not a new registered studio engine |

Use the Slopcamera release installation or a source build for the commands below. Do not substitute the renamed package or executable into an old Atet archive URL, silently switch versions, or use historical paid-world commands as a substitute for the current saved-world workflow.

## Verified release contents

The immutable [v3.3.1 release](https://github.com/hraness/slopcamera/releases/tag/v3.3.1), published on September 19, 2026, contains the following command families. Its canonical archive is built from `88aa724005ed924b6763f9a0fe39505d632c6191`. A source checkout can expose later corrections without changing its package version; inspect its commit as well as its help.

| Capability | Slopcamera v3.3.1 |
| --- | --- |
| HTML scene export, all seven authoring profiles, music-clock helpers, audio-reactive bands | Included |
| Blender, CadQuery, Manim, seven native starters, retained video takes | Included; runtime/provider requirements apply |
| Spatial scenes, calibrated camera tracks, hardware/Spark profiles, saved-world import | Included |
| Static `capabilities --json` manifest; image icon and candidate-gallery recipes | Included |
| Scene builders/admission, audits, rendered galleries, vision critique, character/performance and cinematic camera APIs | Included |
| Scene effects, particles, simulation bakes, semantic direction, temporal/behavior audits, project cinema plans | Included |
| Built-in workflows | Eight, including `cinematic-world`; inspect `workflows list` |
| New screen, camera, microphone, or system-audio capture | Absent |

The static and rigged/morph GLB profiles have separate admission limits within this release. Model, browser, native-engine and hardware availability still require inspection on the machine doing the work; presence in an archive is not a live qualification result.

Later source corrects static-overlay duration and positioned-layer RGB blending in project exports, and negative-color handling in saved-splat rendering. These corrections are absent from v3.3.1. Examples that depend on them identify the required source revision beside their commands. The project-cinema commands also ship in v3.3.1, but later renderer corrections must be checked separately before reproducing a source example.

## Parametric architectural designs

Slopcamera v3.3.6 includes `scene design catalog|init|inspect|set|compile|gallery` and portable design helpers in `@hraness/slopcamera/code`. Named controls and constraints compile into retained geometry and ordinary scenes. Four original starters supply materials, lights and cameras. Compilation uses local geometry code and needs no additional modeling application or cloud credentials; rendering uses the existing spatial browser runtime. See the [design guide](../how-to/parametric-design.md).

This release corrects wall-opening elevations, arched crowns, and Boolean surface partitioning and normals. See [wall openings and limits](../parametric-design.md#wall-openings-and-boolean-geometry) and [film integration](../how-to/parametric-design.md#integrate-a-design-into-an-existing-film).

## Discover the installed contract

### Patent-style drawing sheets

Slopcamera v3.3.5 added `diagram sheets init|check|render` for version-one
`.drawing.json` documents. It retains one authored diagram per sheet and produces outlined
monochrome SVGs, a multipage PDF, and a receipt binding source and output hashes.
It runs locally with bundled rendering dependencies and needs no browser,
credentials, or network request. The CLI and root SDK expose this surface; it
does not add an MCP tool or Code Mode operation.

The existing `.diagram.json` version-one contract and its five ordinary render
outputs remain unchanged; `.drawing.json` is a separate sheet manifest.

The fixed `patent-line-art-v1` profile checks its supported physical page bounds
and minimum letter height. It accepts A4 or US Letter and uses US-style figure
numbering. These checks do not establish technical disclosure or filing
compliance. See [prepare drawing sheets](../how-to/patent-drawings.md) for source
editing, outputs, and the required visual review.

### Command discovery

| Need | Discovery command |
| --- | --- |
| CLI version and top-level commands | `slopcamera --version`, `slopcamera --help` |
| Grammar for a command family | `slopcamera help project`, `slopcamera help studio`, `slopcamera help scene` |
| Drawing-sheet commands in current source | `slopcamera help diagram` |
| Local tools and readiness | `slopcamera doctor --json` |
| Closed local operation catalog and exact schemas | `slopcamera operations list --json`, `slopcamera operations show <kind>[@<version>] --json` |
| Static capability modules, trust, and qualification metadata | `slopcamera capabilities --json` |
| Built-in workflow input schema | `slopcamera workflows list --json`, `slopcamera workflows show <id> --json` |
| Live Gateway model capabilities | `slopcamera ai models list --type <type> --json`, `slopcamera ai models show <id> --json` |
| HTML profile locks | `slopcamera html catalog --json` |
| HTML scene export | `slopcamera help html`, `slopcamera html render --input <scene.json> --dry-run --json` |
| Version-matched packaged agent instructions | `slopcamera skill path` |
| Optional support closeout protocol (no feature requires payment) | `slopcamera support protocol --json`, `slopcamera help` |

Slopcamera v3.3.1 exposes six portable operation codes: diagram check/render, image generate/vectorize, and image icon/gallery. Its MCP server has 17 named tools: `check_diagram`, `render_diagram`, `search_slopcamera`, `execute_slopcamera`, and 13 scene tools for inspection, evaluation, direction, effects, behavior, and temporal audits. The complete local host has a separate, larger closed registry. No surface accepts caller-registered operations.

## Local execution profiles

| Work | Required runtime and boundary |
| --- | --- |
| Diagram JSON, SVG/PNG and tldraw export | Bun package and bundled rendering dependencies; no tldraw app required |
| Vectorization | Bounded macOS/Linux profile; checksum-pinned VTracer can be obtained on first use. Windows deliberately rejects this profile |
| Ordinary media and delivery | FFmpeg/FFprobe; additional analysis dependencies are reported by `doctor` |
| HTML or Three rendering | Admitted local Chrome runtime and declared assets; dependencies may need initial verified provisioning |
| `three-webgl2-hardware-v1` | Qualified macOS ANGLE Metal WebGL2 context; software or unknown fallback rejects |
| `three-spark-webgl2-hardware-v1` | Separate qualified Spark profile for bounded saved splats; its format, camera and output limits apply |
| Blender | Explicit executable selection; CPU or requested GPU. A GPU request never silently falls back to CPU |
| CadQuery / Manim | Explicit Python environment; Manim uses its qualified Cairo profile and owns silent visuals |
| External vgpu native example | Separately provisioned pinned Node/Dawn runtime; distinct from the browser overlay lock |

Native studio qualification used Blender 5.2.1 LTS, CadQuery 2.8.0 and Manim Community 0.21.0. These observations do not certify every plugin, solver, device or imported asset. [Native profile limits](../studio.md#qualified-profiles-and-extension-limits) and [spatial asset limits](../spatial-scenes.md#asset-and-rendering-profile) describe the admitted representations.

The copied macOS executable supports direct studio commands with embedded starters and drivers. Local Code Mode workflows bind a build identity over the installed host source tree, so they run from the installed Bun package or a checkout but not from a copied standalone executable, which embeds no physical source tree. The CLI, its optional unbundled menu-bar companion, and the Bun package are separate interfaces with separate installation requirements.

Ordinary `project add` and SDK `media.ingest` imports require an existing project. Creation starts from a finished recording bundle, a successful studio/directing assembly, or an authored scene rendered with `html render`. The scene command accepts an optional explicit local soundtrack and retains the scene video and original music as separate sources. Arbitrary standalone files alone cannot create an empty project. [Video editing](../how-to/edit-video.md#inspect-the-source-and-project) explains these entry paths.

Released `html render` exports H.264 video with optional 48 kHz stereo AAC at 320 kb/s and retains a lossless RGB scene intermediate. Duration is explicit and rounds up to whole frames; the audio is trimmed or padded to fit. The music-clock helpers use declared constant tempo and offset, without detecting either from audio. Follow [the music-video guide](../how-to/music-video.md), and inspect `slopcamera help html` before assuming an installed version includes this command.

## Commands that can cross the network boundary

Gateway model discovery and paid generation, selected cloud analysis, optional private Blob reference hosting, Poly Haven acquisition, and first-use runtime or tool provisioning have separate network roles. Rendering from a prepared local closure does not upload a project. Credentials and explicit upload/trusted-code acknowledgements remain invocation-scoped; a local source import does not authorize executing it or sending it to a model.

Directing budgets use catalog estimates, not provider-enforced spending caps. Native supervision and hash receipts provide process control and observed provenance, not an OS sandbox or complete hermetic dependency closure.
