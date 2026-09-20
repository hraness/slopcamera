# A visible change of focus

**All 72 CPU frames rendered and reviewed; the example is admitted for publication.** This specimen
is separate from the reviewed product loop. The instrument geometry, materials,
lighting and helper are byte-for-byte copies of its retained source, identified
in `provenance.json`. Its fixed camera uses the same starting pose and 44mm lens.
Only focus changes, at f/0.9. In the actual smoke frames, sharpness moves from the
front rim and screws toward the control housing and side knob. The far authored
reference point lies near the rear barrel, but that smooth surface is not the
clearest visible indicator of the change.

Frames 0–12 hold the near plane; 13–58 move smoothly; 59–71 hold the far plane.
`focus_schedule.py` records exact target points and projects their distances onto
the camera axis. These are authored controls, not proof that the change is visible.
The 72-frame interval is three seconds at 24fps, with no claim of a seamless loop.

From the source checkout:

```sh
bun examples/showcase/native/prepare-study.ts focus-study --check
bun examples/showcase/native/prepare-study.ts focus-study --write-jobs
bun apps/desktop/cli/main.ts studio bundle examples/showcase/native/focus-study/source.json --json
```

The helper writes fresh IDs and returns each job path, without starting Blender.
The bundle command must return the same `bundleSha256`. Select **one** returned
smoke job, then plan, probe and explicitly run it with the supported Blender 5.2.1
runtime on CPU (native source executes as the current user):

```sh
bun apps/desktop/cli/main.ts studio plan <prepared-smoke-job.json> --json
bun apps/desktop/cli/main.ts studio probe <prepared-smoke-job.json> --blender-bin /absolute/path/to/Blender --json
bun apps/desktop/cli/main.ts studio run <prepared-smoke-job.json> --allow-trusted-code --blender-bin /absolute/path/to/Blender --json
```

On managed hosts, use the installed native scheduler for those runtime commands.
Require at least 2GiB free for the three separate 640×360 smoke frames (0,35,71),
and at least 4GiB before the 960×540,32-sample film. The smoke jobs allow at most
128MiB each; the film allows 512MiB and a 3600-second deadline. These are limits,
not measured output sizes. CPU smoke jobs took approximately 9.5–11.1 seconds each.
The first full-size CPU attempt averaged about 32.6 seconds per frame. Its original
1800-second contract was explicitly cancelled with closed custody and 17 frames
preserved, then replaced by a fresh job with the longer deadline. Preserve all
outputs, receipts and native files, including unsuccessful attempts.

The canonical jobs select CPU explicitly. An initial Metal near frame succeeded,
but two middle-frame GPU attempts failed before an image was produced. The first
reported a Metal kernel compilation exception; the second retained no diagnostic
stack. Their failed receipts were preserved. The three reviewed CPU frames use
fresh job IDs and one consistent device; they do not establish GPU reliability.

Before the film, compare full-size matched crops at the front screws/rim and lower
housing/side knob. Accept only an observable transfer of sharp detail; a changing
numeric distance or a globally blurry image does not qualify. If either target
is occluded or both remain equally sharp, revise this separate source and issue
new job IDs. Do not change the admitted product film to conceal the failed study.

After all three smoke frames pass, explicitly run the prepared `film.json` job.
Inspect every frame, hold timing and transition for focus discontinuities, preserve
the native scene, and record the exact encoding/derivative commands. The original
product loop remains the camera-movement witness; this fixed-camera comparison
adds the missing focus observation only if real frames pass review.

The retained full film completed in 28 minutes 15 seconds on the qualification
host. Its 72 PNGs and native scene total 38,092,381 bytes. Every frame was reviewed
in chronological sheets, with full-size crops at frames 0, 12, 35, 59 and 71.
The front rim and screws visibly soften as the housing and side knob become
sharper. Framing stays fixed and the endpoint holds have no observed jump. These
are observations from this CPU execution; render time depends on the host.

For a small silent web derivative, use the completed job's actual frames directory
with FFmpeg 7.1.5. Keep its PNG masters and receipt. These commands refuse an
existing output file:

```sh
ffmpeg -hide_banner -v error -n -framerate 24 -start_number 0 \
  -i /absolute/path/to/outputs/frames/%06d.png -frames:v 72 -an \
  -c:v libx264 -preset slow -crf 19 -threads 2 -pix_fmt yuv420p \
  -movflags +faststart artifacts/focus-study.mp4
ffmpeg -hide_banner -v error -n \
  -i /absolute/path/to/outputs/frames/000035.png -frames:v 1 \
  -c:v libwebp -quality 88 -threads 1 artifacts/focus-study.webp
```

The reviewed derivative is 960×540, three seconds at 24fps, with no audio stream.
All 72 compressed frames decoded successfully. The MP4 is a lossy presentation
copy; its small size does not replace the original image sequence.
