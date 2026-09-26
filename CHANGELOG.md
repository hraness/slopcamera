# Changelog

Each released version has a section headed with its version, such as `## 3.4.0 - 2026-09-23`. The section holds a summary paragraph and then one bullet per change a user, integrator or operator would notice. The release workflow copies that section onto the GitHub Release page and stops if it is missing, empty or still says Unreleased. Work that has merged but not shipped goes under `## Unreleased`; the version bump pull request renames that heading to the new version.

## Unreleased

Browser overlay scenes with post-processing, bloom, depth of field or emissive standard materials render as written, and local vectorization keeps its deadline on loaded machines.

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
