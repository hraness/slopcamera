# Changelog

Each released version has a section headed with its version, such as `## 3.4.0 - 2026-09-23`. The section holds a summary paragraph and then one bullet per change a user, integrator or operator would notice. The release workflow copies that section onto the GitHub Release page and stops if it is missing, empty or still says Unreleased. Work that has merged but not shipped goes under `## Unreleased`; the version bump pull request renames that heading to the new version.

## 3.10.2 - 2026-10-01

Slopcamera renders HTML scenes on macOS without treating access-time updates from reading immutable browser files as changes to those files.

- Watch each saved browser file and directory through native file descriptors, keeping mutation failures active through browser shutdown.
- Accept only isolated access-time advances on unchanged immutable regular files; reject other metadata changes, replaced files, and mixed filesystem events.
- Preserve browser content, signature, identity, and cleanup checks throughout rendering.

## 3.10.1 - 2026-09-30

SlopCamera handles delayed macOS filesystem notifications while preparing a browser for HTML rendering.

- Wait for a bounded quiet period, then recheck every saved browser file and directory identity before accepting preparation notifications.
- Keep watcher errors, mutations during preparation, and changes during execution fail-closed.

## 3.10.0 - 2026-09-30

SlopCamera checks for CLI updates before work starts on supported global installations.

- Add automatic daily updates and `update check|status|enable|disable` controls for Bun and npm globals on macOS and Linux.
- Verify immutable GitHub archives and their hosted-workflow attestation against the annotated release tag and source commit before installation.
- Keep local vectorization offline, hold installed code while commands run, and leave SDK imports, source installs, and private compiled binaries on their existing update path.

## 3.9.2 - 2026-09-30

Slopcamera's site and learning path now start with finished films and the source changes that direct them. The Agent Skill gains practical guidance for composition, timing, camera, sound, and revision.

- Present six scored showcase projects with retained editable sources, a paired animation revision, and three different edits from credited eclipse footage.
- Add a first-animation tutorial and directing and remix guides that connect visible results to concrete source changes.
- Rebuild the homepage, documentation entry points, launch article, and social material around the multimedia studio workflow, with accessible manual playback and caption support.

## 3.9.1 - 2026-09-29

Slopcamera's native renderer combines its Chrome feature flags with Playwright's defaults so browser app-cloning prevention remains effective during rendering.

- Emit one merged feature flag while retaining every disabled feature from the pinned Playwright version and the native renderer.
- Record the complete launch policy in new version-3 execution receipts, preserving verification of historical version-1 and version-2 receipts.

## 3.9.0 - 2026-09-29

SlopCamera can now draw vector icons with icon.place and time music videos from Soundfish scores. Both libraries are bundled at exact versions and run inside SlopCamera's own operations, so agents reach them through the same CLI, SDK and MCP surfaces as everything else.

- `slopcamera image icon compose` (`slopcamera.icon.compose`, MCP `compose_icon`) solves a bounded icon.place scene or construction program and returns the solved scene with its digest.
- `slopcamera image icon render` (`slopcamera.icon.render`, MCP `render_icon`) renders a solved scene, or replays a recipe, to inert SVG.
- `slopcamera media soundtrack compose` (`slopcamera.soundtrack.compose`, MCP `compose_soundtrack`) parses and verifies a Soundfish loop or song and returns its canonical digest.
- `slopcamera media soundtrack grid` (`slopcamera.soundtrack.grid`, MCP `derive_soundtrack_grid`) derives `bpm`, `beatOffsetUs`, `beatsPerBar` and section cue times from a Soundfish document or MIDI file, in the shape the music-video render input already accepts.
- Current source has ten operation codes and 21 MCP tools. The Agent Skill gains `icon-place.md` and `soundtracks.md` references.
- `@hraness/iconplace` 0.1.0 and `@hraness/soundfish` 0.7.0 are pinned at exact versions with their registry integrity recorded in `NOTICE.md`. Neither package's command is spawned.

## 3.8.1 - 2026-09-29

Slopcamera's native HTML and spatial renderer prevents Chrome from creating extra application copies while rendering from its private, immutable browser runtime.

- Disable Chrome's app-cloning feature in every native renderer profile while preserving signature verification, runtime integrity checks, and graceful browser cleanup.
- Bind the updated launch arguments into new execution receipts while preserving verification and recovery of historical version-1 receipts.

## 3.8.0 - 2026-09-29

SlopCamera no longer has a menu bar. Everything it showed is now in the terminal: `slopcamera status` and `slopcamera tui` show what is rendering, how the last job ended, your last known credits balance and the newest outputs, and every command reports its data in one JSON shape that agents can read.

- `slopcamera status [--json]` shows the current render or generation, the last job's result, your last known credits balance, the newest outputs and whether the old menu-bar login item is still installed.
- `slopcamera tui` keeps that screen open and refreshes it. `slopcamera tui --snapshot [--width N]` prints it once, and `slopcamera tui --json` returns the same data as `status --json`. When output is not a terminal, `tui` prints the snapshot.
- `slopcamera commands --json` lists every command with the kind of action it takes: reading, a safe operation, or a human decision. `runs approve` keeps its current behaviour and is listed as a legacy decision.
- `slopcamera outputs list|open|reveal` lists the newest files in the outputs folder or opens one on this Mac.
- `slopcamera legacy retire` stops the old menu-bar companion from opening at login. It moves only the LaunchAgent that SlopCamera wrote aside as `*.retired-<time>`, never deletes a file, and leaves items it did not write alone. `slopcamera doctor` lists retired items and the command that restores one.
- The menu-bar companion, its source build and `docs/menubar-release.md` are removed. `slopcamera menubar` now exits with a usage error that points to `status` and `tui`. [`docs/cli-parity.md`](docs/cli-parity.md) maps each former menu item to its command.
- `@hraness/desktop-foundation` is pinned to the immutable v0.9.0 release.
- Image processing uses sharp 0.35.4, which fixes a high-severity sharp advisory. Spatial asset receipts now record the profile `sdr-png-jpeg-sharp-0.35.4`.

## 3.7.0 - 2026-09-28

SlopCamera can now start, review and deliver a product launch film. A new template lays out a short film in six acts around your product's own UI, a helper module keeps every frame a function of time, and one command turns a render into web, social and per-act files within size budgets.

- `slopcamera html init <dir> --template launch-film [--aspect 16:9|1:1|9:16]` writes a film project: an HTML page with slots, its stylesheet and choreography, a `build.ts` that renders React mockups to static markup, and a README. The acts are a cold open, a title, a product walk with a browser frame, camera, cursor and drawn highlight, proof, limits and an end card.
- `@hraness/slopcamera/local/html-film` exports motion helpers for HTML films: `clamp`, `lerp`, `prog`, `easings`, `spring`, `split`, `kin`, `show`, `stepValue`, `crossfade`, `defineTimeline`, `camera`, `cursor`, `drawMark` and `captionsFromTimeline`, which writes WebVTT from act captions. `show` sets both visibility and display so a hidden scene never leaks into a later frame.
- `slopcamera html still --input scene.json --at 3,12.5 --output <dir>` and `slopcamera html preview` draw frames with the same injected runtime as `html render`; preview also writes a contact sheet.
- `slopcamera html deliver <export.json> --basename <name> --poster-at <s> --social-at <s> [--cuts 1:1,9:16] [--per-beat-clips]` writes a faststart MP4, a VP9 WebM, a poster, a 1200x630 social still, aspect cuts and one clip per act, with a receipt. It exits non-zero when an MP4 is over 12 MB, the WebM over 10 MB or a JPEG over 250 KB.
- The SlopCamera skill has a launch films reference, including a short mapping for people coming from HyperFrames or Remotion.

## 3.6.0 - 2026-09-27

The menu bar now shows what Slopcamera is doing instead of only listing outputs: the render or generation in progress, how the last job ended, and your last known credits balance. Its login item moves to the shared desktop-foundation helper, and the agent support verbs move out of root help onto their own page.

- The menu opens with a status row for the current render or generation and a warning row when the last job failed, a credits row that flags a low balance, the three newest outputs, "Open outputs folder", Open at login, "Updates & support…" and Quit. Diagnostics sit behind the Option alternate and the tray icon shows an attention tone only when something needs you.
- `slopcamera menubar install|uninstall|status|start` manage the menu bar's login item through the shared LaunchAgent helper. Install retires the old `com.hraness.slopcamera.menubar` plist only when it is exactly the file earlier releases wrote, explains the macOS login-item notice before it appears, and refuses a copy another user or program could change.
- `slopcamera menubar` stays off root help while released packages don't include the companion; `slopcamera help menubar` and `docs/menubar-release.md` still document building and installing it from source.
- Root help drops the agent `slopcamera support` verb list for a single optional-support line; the same verbs are documented under `slopcamera help advanced` and keep working.

## 3.5.0 - 2026-09-26

Browser overlay scenes with post-processing, bloom, depth of field or emissive standard materials render as written, and local vectorization keeps its deadline on loaded machines. The menu bar, the face analyzer build and root help now explain themselves in plain words: an already-running menu bar counts as success, and macOS notices are explained before they appear.

- Scene renders with post-process steps complete instead of failing at the final composite with a WebGL framebuffer feedback error.
- Bloom, flare and depth-of-field effects render in the browser overlay; their shaders previously failed to link.
- Standard materials show their declared emissive color and intensity instead of rendering dark.
- `slopcamera image vectorize` reserves enough of its time budget to stop a runaway worker, so it returns within the caller's deadline on a busy machine.
- The Slopcamera skill has a brand illustrations reference for the shared line icon language.
- `slopcamera menubar` says the menu bar is already running instead of reporting a failed start, `menubar install` explains the macOS login-item notice first, and `menubar status` reports whether the menu bar is actually running. `slopcamera help menubar` has its own page.
- Building the face analyzer checks for Apple's command line tools first and asks before macOS offers to install them; scripts and agents get the install command instead of a dialog.
- Root help uses plain descriptions, shows three examples and ends with one optional-support line.

## 3.4.0 - 2026-09-23

Slopcamera now ships reusable art direction: 17 visual style profiles that describe palette, shape, materials, camera, timing, finishing and review criteria, with `slopcamera style list` and `slopcamera style show` to read them. HTML overlay renders also wait for each frame to be drawn before capturing it, so a still no longer shows the previous frame.

- `slopcamera style list [--json]` lists the 17 visual style profiles, and `slopcamera style show <id> [--json]` prints one profile's palette, shape, materials, camera, exposure cadence, finishing targets, recommended delivery and review criteria. Profiles are read-only guidance; they do not render, choose a model or apply an effect.
- The SDK exports `VISUAL_STYLE_PROFILES`, `getVisualStyleProfile`, `createVisualStyleDirection` and `sampleVisualStyleExposure` for the same profiles.
- HTML overlay renders wait until each frame is presented before taking its screenshot. Under heavy GPU load a still could previously contain the prior frame's pixels. The wait also completes in headless Chromium, where frames are drawn only on request.
- The package includes the style portfolio examples in `examples/style-portfolio/`: twelve Canvas animation studies, a procedural Blender street, a single-image film-transfer recipe and an offline gallery builder. Films and stills render at 3840 × 2160 by default.
- The Slopcamera skill has a visual style direction reference that separates historical evidence from invented detail.
