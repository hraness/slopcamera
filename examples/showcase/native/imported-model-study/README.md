# Import a textured packaging mockup

Import an existing textured GLB, stage it in Blender, and retain the artwork when
the native scene is saved and reopened. This original FIELD / 01 carton is
70 × 45 × 120 mm, with 24 face-local vertices, 12 triangles and one original
2048 × 2048 PNG. The front wordmark, side stripe, asymmetric top mark and back
bars make flipped or missing textures visible. The model, SVG path artwork and
helpers use the repository's MIT license. They contain no downloaded assets or
external fonts.

The qualified source imported the original GLB rather than rebuilding its mesh.
It measured the oriented triangle corners, bounds, normals and UVs against that
GLB, then verified the exact PNG before and after packing. Three final views and
a separate three-view replay from a bundle containing only the saved `.blend`
matched exactly in decoded RGB on Blender 5.2.1 LTS / Cycles CPU. A separate
trusted inspection verified the packed PNG, geometry, UVs, normals, materials,
three poses and closed asset dependencies.

This is an opaque, static, one-material packaging specimen. It does not qualify
arbitrary model formats, rigs, animation, material extensions or print color.
The native runtime is not hermetic, and other hosts need their own qualification.

## Check and prepare

Use a source checkout with its existing Bun 1.3.14 and Sharp dependencies.
Native rendering also needs an installed Blender; no Vercel CLI, model account
or paid provider call is required.

~~~sh
bun examples/showcase/native/imported-model-study/author-assets.ts --check
bun examples/showcase/native/imported-model-study/prepare.ts --check
bun examples/showcase/native/imported-model-study/prepare.ts
~~~

The first check regenerates artwork/model bytes in memory and compares them with
the retained files. The second checks the eight-file source bundle, embedded PNG,
decoded texture pixels and finite render profile. The bare preparer writes one
fresh job under ignored artifacts and prints the exact next bundle, plan, probe,
run and inspect commands. `--write-jobs` is an equivalent explicit option.
Neither preparer starts a native engine.

Use the printed commands from the repository root, replacing
`/absolute/path/to/Blender` with your runtime path. Match the returned bundle hash
before execution. On managed hosts, use the existing native scheduler. Native
Python executes as the current user; retain and review its declared source.
After probe and run, inspect the actual receipt and require success with closed
process custody before proceeding.

The single job saves frames 0 (front/right/top), 1 (right panel) and 2
(back/left/top), plus an editable native scene. Its fixed profile is 960 × 540,
Cycles CPU, 128 samples, denoising enabled, AgX, seed 0 and 24/1 fps over the
half-open interval [0,3). These are three discrete poses, not a three-frame
animation. Limits are 360 seconds, 8 MiB of outputs and 32 files.

Track the entire study against a separate 192 MiB budget, including retained
inputs, source copies, receipts, working space and future outputs. Before each
native admission, account for existing retained bytes, the new source copies,
twice the job's output ceiling and at least 72 MiB for working/log reserve.
Keep the host's stronger shared free-space guard. The 192 MiB study budget is
not a per-job output allowance. Preserve failed attempts and stop if the next
reservation no longer fits.

`author-assets.ts --write` explicitly replaces authored outputs. Use it only for
an intentional source change, then rebind the bundle and job template. All source
and authored assets together are limited to 4 MiB.

## Replay the packed scene

After the final job succeeds, use its actual ID:

~~~sh
bun examples/showcase/native/imported-model-study/prepare-replay.ts <successful-final-views-job-id>
~~~

This validates the original receipt, every output hash, the current source
bundle and exact render settings. It writes two physically separate source
directories and fresh inert recipes. Run the printed replay commands first.
The replay bundle contains only the exact saved `.blend`; there is no separate
PNG, GLB or Python entrypoint. Blender opens it with embedded scripts disabled,
and the fixed host rejects unpacked FILE images outside that declared bundle.

The replay renders the same three frames with the same settings, bounded to
360 seconds, 8 MiB and 32 files. After it succeeds and its custody closes, compare
the original masters with the replay:

~~~sh
bun examples/showcase/native/imported-model-study/compare-pixels.ts <original-job-id> <replay-job-id>
~~~

The comparer verifies the receipts, complete three-frame identities, engine,
runtime, original native digest and blend-only source before decoding. It writes
a fresh private JSON result without resizing. Mean absolute RGB channel error
must be at most 0.5 code values, and at most 0.1% of channels may differ by more
than 8. It preserves a negative report and exits unsuccessfully on a mismatch.
The qualified run measured zero in every pair; that is a sampled same-runtime
result, not a cross-host rendering guarantee.

Then use the separately printed inspector commands. `inspect.py` is explicit
trusted Python that opens the original saved scene with embedded scripts
disabled. This build-only job has no render request and is bounded to
120 seconds, 4 MiB and eight files. Retain its bounded
`SLOPCAMERA_TEXTURE_FACTS=` stdout observation alongside the receipt; the native
output contract has no generic JSON output format. It checks exactly three
ordered frame/name identities before comparing their saved transforms.

The observed inspector retained the exact 80,487-byte PNG and found no external
asset dependencies, libraries, media inputs, font objects, embedded text scripts
or drivers. All 12 oriented triangles matched; position, UV and normal errors
were zero against the original source representation.

## Review and share

Review all six original/replay frames, then the three unique views at full size,
640-pixel docs width and 360-pixel phone width. FIELD / 01 must read; the side
stripe must cross the intended seam; the top mark and back bars must face
correctly. Reject missing, mirrored or stretched texture, clipping or unexplained
scale changes. The pale top artwork is not a colorimetric print proof.

Retain the native masters, original PNGs, receipts and failed attempts privately.
Blender PNGs can carry native paths and render metadata. Public PNG downloads
remove that metadata while preserving pixels and color chunks. Small WebP
posters are separate lossy display derivatives; they do not replace the masters
or establish the exact replay result.

## Focused source checks

~~~sh
python3 examples/showcase/native/imported-model-study/check-setup.py
python3 examples/showcase/native/imported-model-study/check-poses.py
bun test examples/showcase/native/imported-model-study/recipes.test.ts examples/showcase/native/imported-model-study/compare-pixels.test.ts
~~~

These checks exercise the compositor/startup-sequencer guards, finite pose
identities, exact job profiles and pixel-comparison boundaries without importing
Blender or launching an engine. The startup helper clears only a proven empty
default sequencer. Any assigned compositor or nonempty sequencer still rejects.
