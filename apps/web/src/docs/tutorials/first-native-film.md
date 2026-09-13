Create a one-second Blender shot, inspect its retained frames, and export the result through an ordinary Slopcamera video project. You finish with four artifacts: the editable Python scene, a content-addressed source bundle, the verified PNG frames, and a project that holds the encoded clip.

The `studio` commands are documented for the current source build. Complete the [source build](/docs/how-to/install-from-source) so `slopcamera` invokes your checkout, then confirm `slopcamera help studio` lists `init`, `run`, `encode`, and `assemble`. The setup below uses macOS with Blender 5.2.1 LTS, Bun, FFmpeg, and FFprobe. The preview renders on the CPU, so no GPU or cloud service is involved, and nothing here uses the macOS-specific recording features.

## Select the Blender executable

Slopcamera does not install native engines; point each invocation at the Blender you already have.

```sh
export SLOPCAMERA_BLENDER_BIN="/Applications/Blender.app/Contents/MacOS/Blender"
test -x "$SLOPCAMERA_BLENDER_BIN"
```

If the check fails, substitute the actual executable path of your installation before continuing.

## Create and retain the source

In the production working directory you created during source setup, scaffold the product starter and retain it:

```sh
slopcamera studio init product --template blender-product --json
slopcamera studio bundle product/source.json --json > product-bundle.json
```

Open `product/scene.py` and `product/source.json`. The manifest lists exactly the files to retain; imports do not recursively discover siblings. The bundle result carries `bundleSha256`, the digest of the retained copies. Neither command executes the scene.

## Make a small preview job

The scaffold's default job requests Cycles GPU rendering across 72 frames. The preview below switches to the CPU, lowers the work to eight samples, and narrows the frame range to 24 frames, one second at 24 fps, at 320×180. Create `prepare-preview.ts` in the working directory:

```ts
const job = await Bun.file("product/job.json").json()
const bundle = await Bun.file("product-bundle.json").json()
job.jobId = `studio_tutorial_${crypto.randomUUID()}`
job.bundleSha256 = bundle.bundleSha256
job.engine.device = "cpu"
job.engine.samples = 8
job.render.width = 320
job.render.height = 180
job.render.startFrame = 0
job.render.endFrameExclusive = 24
job.limits.timeoutSeconds = 180
job.limits.maximumOutputBytes = 134217728
job.limits.maximumOutputFiles = 128
await Bun.write("product/preview.job.json", JSON.stringify(job, null, 2))
```

Run it once, then inspect the inert plan and the selected runtime:

```sh
bun prepare-preview.ts
slopcamera studio plan product/preview.job.json --json
slopcamera studio probe product/preview.job.json --blender-bin "$SLOPCAMERA_BLENDER_BIN" --json
```

The plan should report 24 frames at 24 fps with a CPU request. Planning is inert; probing loads the fixed engine driver without executing your scene.

## Render and inspect the shot

```sh
slopcamera studio run product/preview.job.json --blender-bin "$SLOPCAMERA_BLENDER_BIN" --allow-trusted-code --json
```

`--allow-trusted-code` authorizes the reviewed local Python source to run as your current user. It is not an operating-system sandbox, so grant it only to source you have read. If the run fails, inspect that same job before choosing another attempt; do not resubmit an ambiguous attempt.

Use the returned `jobId` in place of `<studio-id>`:

```sh
slopcamera studio inspect <studio-id> --json
slopcamera studio encode <studio-id> --output-id beauty --json
```

A successful inspection lists the native `.blend` and its 24 PNG frames with their hashes. Open the first and last PNG at the returned paths. Encoding produces a separately retained RGB video and verifies every decoded frame against the source PNGs. The original frames and scene remain retained.

## Export an ordinary project

```sh
slopcamera studio assemble <studio-id> --output-id beauty --name "First product shot" --json
```

Copy the returned `projectId` into these commands:

```sh
slopcamera project inspect <project-id> --json
slopcamera project render plan <project-id> --width 320 --height 180 --fps 24 --output renders/first-shot.mp4 --json
slopcamera project render run <project-id> --width 320 --height 180 --fps 24 --output renders/first-shot.mp4 --json
```

Render paths resolve relative to the project directory, not your shell's working directory. For the default workspace, open `artifacts/slopcamera/projects/<project-id>/renders/first-shot.mp4`; the render result's FFmpeg invocation names the full output path. The file should contain the complete one-second shot at 320×180.

## What you learned

The native source stays editable while every derivative carries a receipt. To direct another version, edit `product/scene.py`, retain a new bundle, and choose a new `jobId`; reusing an old job ID with changed inputs is a conflict.

- For larger shots, simulation caches, shared assets, and the CadQuery or Manim starters, see [author a native film](/docs/how-to/native-films).
- To cut the clip into a delivery with captions and alternate aspect ratios, see [edit and deliver video](/docs/how-to/edit-video).
- For supported engine versions and runtime requirements, see the [capability reference](/docs/reference/capabilities).
