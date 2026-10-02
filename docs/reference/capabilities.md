# Capabilities, versions, and platforms

This reference describes the current Slopcamera CLI and its runtime requirements. A package's version number alone does not identify a source checkout; inspect its commit and actual command help.

## Install the release

Install the [current release](https://github.com/hraness/slopcamera/releases/latest) for the CLI, SDK and matching agent instructions. To develop Slopcamera or run a repository example, follow the [source setup guide](../how-to/use-current-source.md).

## Verified release contents

The [published release](https://github.com/hraness/slopcamera/releases/tag/v3.10.3) provides these capabilities. Run `slopcamera --version` and the installed command's help when you need to check a particular installation.

| Capability | Slopcamera v3.10.3 |
| --- | --- |
| HTML scene export, all seven authoring profiles, music-clock helpers, audio-reactive bands | Included |
| Blender, CadQuery, Manim, seven native starters, retained video takes | Included; runtime/provider requirements apply |
| Spatial scenes, calibrated camera tracks, hardware/Spark profiles, saved-world import | Included |
| Static `capabilities --json` manifest; image icon and candidate-gallery recipes | Included |
| Local icon.place and Soundfish commands: `image icon compose\|render` and `media soundtrack compose\|grid` | Included; no model or network request |
| Scene builders/admission, audits, rendered galleries, vision critique, character/performance and cinematic camera APIs | Included |
| Scene effects, particles, simulation bakes, semantic direction, temporal/behavior audits, project cinema plans | Included |
| Seventeen read-only visual style profiles (`style list` and `style show`), deterministic exposure and variation helpers, film-finishing controls | Included; authoring guidance, no effects applied |
| Launch films: `html init --template launch-film`, `html still`, `html preview`, `html deliver`, and the `local/html-film` motion helpers | Included; `html deliver` needs FFmpeg |
| Terminal status: `status`, `tui`, `commands --json`, `outputs list`, and on macOS `outputs open\|reveal` and `legacy retire` | Included; the menu-bar companion is removed |
| Built-in workflows | Eight, including `cinematic-world`; inspect `workflows list` |
| New screen, camera, microphone, or system-audio capture | Absent |

The static and rigged/morph GLB profiles have separate admission limits within this release. Model, browser, native-engine and hardware availability still require inspection on the machine doing the work; presence in an archive is not a live qualification result.

## Parametric architectural designs

Slopcamera v3.10.3 includes `scene design catalog|init|inspect|set|compile|gallery` and portable design helpers in `@hraness/slopcamera/code`. Named controls and constraints compile into retained geometry and ordinary scenes. Four original starters supply materials, lights and cameras. Compilation uses local geometry code and needs no additional modeling application or cloud credentials; rendering uses the existing spatial browser runtime. See the [design guide](../how-to/parametric-design.md).

Wall openings use corrected elevations, arched crowns, and Boolean surface partitioning and normals. See [wall openings and limits](../parametric-design.md#wall-openings-and-boolean-geometry) and [film integration](../how-to/parametric-design.md#integrate-a-design-into-an-existing-film).

## Film and animation direction

`style list` and `style show <id> --json` read 17 profiles covering palette,
drawing or material treatment, camera, exposure cadence, resolution, finishing,
and review criteria. Reading a profile supplies authoring guidance; it does not
change a render or make a model request.

The portable SDK exports `getVisualStyleProfile`, `createVisualStyleDirection`,
`sampleVisualStyleExposure`, and `visualStyleFrameVariation`.
`@hraness/slopcamera/local/code` exports `createVisualStyleVideoLook` for supported
local finishing effects. The [style direction guide](../how-to/direct-visual-styles.md)
includes editable examples whose movie and still runner defaults to native 4K.
Explicit user dimensions, logical pixel grids, and source-image limits still
apply. A resolution recommendation does not establish visual quality.

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
| Drawing-sheet commands | `slopcamera help diagram` |
| Local tools and readiness | `slopcamera doctor --json` |
| Closed local operation catalog and exact schemas | `slopcamera operations list --json`, `slopcamera operations show <kind>[@<version>] --json` |
| Static capability modules, trust, and qualification metadata | `slopcamera capabilities --json` |
| Built-in workflow input schema | `slopcamera workflows list --json`, `slopcamera workflows show <id> --json` |
| Live Gateway model capabilities | `slopcamera ai models list --type <type> --json`, `slopcamera ai models show <id> --json` |
| Film and animation direction profiles | `slopcamera style list --json`, `slopcamera style show <id> --json` |
| HTML profile locks | `slopcamera html catalog --json` |
| HTML scene export | `slopcamera help html`, `slopcamera html render --input <scene.json> --dry-run --json` |
| Version-matched packaged agent instructions | `slopcamera skill path` |
| Optional support closeout protocol (no feature requires payment) | `slopcamera support protocol --json`, `slopcamera help` |

Slopcamera exposes ten operation codes: diagram check/render, image generate/vectorize, image icon/gallery, icon compose/render, and soundtrack compose/grid. Its MCP server has 21 named tools: `check_diagram`, `render_diagram`, `search_slopcamera`, `execute_slopcamera`, 13 scene tools for inspection, evaluation, direction, effects, behavior, and temporal audits, and `compose_icon`, `render_icon`, `compose_soundtrack`, and `derive_soundtrack_grid`. The icon compose/render and soundtrack compose/grid codes, their MCP tools, and the `image icon compose|render` and `media soundtrack compose|grid` commands were introduced in v3.9.0; they run locally with no model or network request. The complete local host has a separate, larger closed registry. No surface accepts caller-registered operations.

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

The copied macOS executable supports direct studio commands with embedded starters and drivers. Local Code Mode workflows bind a build identity over the installed host source tree, so they run from the installed Bun package or a checkout but not from a copied standalone executable, which embeds no physical source tree. The CLI and the Bun package are separate interfaces with separate installation requirements.

Ordinary `project add` and SDK `media.ingest` imports require an existing project. Creation starts from a finished recording bundle, a successful studio/directing assembly, or an authored scene rendered with `html render`. The scene command accepts an optional explicit local soundtrack and retains the scene video and original music as separate sources. Arbitrary standalone files alone cannot create an empty project. [Video editing](../how-to/edit-video.md#inspect-the-source-and-project) explains these entry paths.

Released `html render` exports H.264 video with optional 48 kHz stereo AAC at 320 kb/s and retains a lossless RGB scene intermediate. Duration is explicit and rounds up to whole frames; the audio is trimmed or padded to fit. The music-clock helpers use declared constant tempo and offset, without detecting either from audio. Follow [the music-video guide](../how-to/music-video.md), and inspect `slopcamera help html` before assuming an installed version includes this command.

## Commands that can cross the network boundary

Gateway model discovery and paid generation, selected cloud analysis, optional private Blob reference hosting, Poly Haven acquisition, and first-use runtime or tool provisioning have separate network roles. Rendering from a prepared local closure does not upload a project. Credentials and explicit upload/trusted-code acknowledgements remain invocation-scoped; a local source import does not authorize executing it or sending it to a model.

Directing budgets use catalog estimates, not provider-enforced spending caps. Native supervision and hash receipts provide process control and observed provenance, not an OS sandbox or complete hermetic dependency closure.

## Native browser requirements

Native HTML rendering uses a private copy of a supported, Google-signed macOS Chrome runtime and checks it before rendering. A Chrome for Testing build with an ad-hoc signature does not meet that native-renderer requirement. Run `slopcamera doctor --json` to inspect the tools available on your machine.

## CLI updates

Automatic updates require Slopcamera 3.10.0 or newer. Upgrade an older
installation once through its package manager.

Supported Bun and npm global installations on macOS and Linux check for a
newer release at most once a day before a command starts. Automatic updates are
enabled by default. Help, version output, CI, and commands already running do
not trigger an update. If another command is using the installation, the
update waits for a later invocation.

```sh
slopcamera update status --json
slopcamera update check
slopcamera update
slopcamera update disable
slopcamera update enable
```

Set `HRANESS_NO_UPDATE=1` to suppress automatic updates for an invocation.
Exact Bun version installs stay pinned until `update enable`. Ordinary Bun
ranges, tags, and GitHub release archive installs track newer releases. npm
does not reliably retain the original global version constraint; use
`update disable` to keep an npm global at its installed version.

Source checkouts, local project dependencies, temporary `bunx` or `npx`
installs, linked copies, and copied skill scripts keep their existing update
process. On Windows, update through the package manager. Library imports do
not check for updates or change installed code.

The updater stores its preference, last check time, and installation/process
records locally. It keeps verified archives beside the global installation
because the package manager may reference them. Keep an archive while the
installation references it. Update checks send no application data to the release service.

Updates use immutable GitHub releases. An authenticated
[GitHub CLI](https://cli.github.com/) (`gh`) checks the archive against its release and verifies its attestation against
the release tag, source commit, and GitHub-hosted release workflow. Local image
vectorization, diagrams, local icons, and soundtrack composition stay offline. Private compiled binaries use their native
installer and do not update automatically.
