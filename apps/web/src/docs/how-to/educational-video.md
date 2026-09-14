Produce a mathematical explainer that stays editable after delivery: Manim Community renders the visuals, while narration, music, and sound effects live in an ordinary Slopcamera project you can keep revising. When the explanation depends on detailed 3D, author a Blender scene instead; when named geometry and world-space media need an editable camera, use a spatial scene. [Author a native film](/docs/how-to/native-films) covers the other engines and shared assets.

This path uses the `slopcamera studio` commands, which require a [source build](/docs/how-to/install-from-source). You also need a selected Python environment with Manim Community and its Typst optional dependency, plus local FFmpeg and FFprobe. The qualified observation is Manim Community 0.21.0 on the CPU Cairo renderer; run `{{DOCTOR_COMMAND}}` and check [capabilities](/docs/reference/capabilities) for your install.

## Author the lesson

```sh
slopcamera studio init lesson --template manim-lesson --json
```

The scaffold writes `scene.py`, `lesson.json`, `lesson.py`, `toolkit.py`, `source.json`, and `job.json` under `lesson/`. The starter is a 10-second portrait lesson in which an original presenter points to a right triangle while nine plus sixteen unit tiles rearrange into a five-by-five square. It illustrates the 3–4–5 example; it does not establish a general proof of Pythagoras.

Edit the script, the supported mathematical parameters, and the cues in `lesson.json`. The tile template takes two integer legs of at most 12 each with an integer hypotenuse of at most 15, and every displayed length, square count, and tile destination derives from those values. Caption words, mouth shapes, and gestures use half-open microsecond intervals, and gaps between mouth cues select the resting mouth. The reusable layout supports portrait aspect ratios from 0.48 through 0.75, so keep room for the presenter, the diagram, and the caption rail rather than cropping a landscape composition. Declare every helper and input asset in `source.json`. The [checked lesson example](https://github.com/hraness/slopcamera/blob/main/examples/studio/education/README.md) documents the supported fields and conversion helpers.

## Render the silent visuals

Retain the edited source, then bind the returned bundle digest into a fresh job:

```sh
slopcamera studio bundle lesson/source.json --json > lesson-bundle.json
```

Save this helper as `prepare-lesson.ts` and run it with Bun. It copies the digest into the job and assigns a fresh job ID, because reusing an old job ID with changed inputs is a conflict.

```ts
const job = await Bun.file("lesson/job.json").json();
const bundle = await Bun.file("lesson-bundle.json").json();
job.bundleSha256 = bundle.bundleSha256;
job.jobId = `studio_lesson_${crypto.randomUUID()}`;
await Bun.write("lesson/current.job.json", JSON.stringify(job, null, 2));
```

```sh
bun prepare-lesson.ts
slopcamera studio plan lesson/current.job.json --json
slopcamera studio probe lesson/current.job.json --python /absolute/venv/bin/python --json
slopcamera studio run lesson/current.job.json --python /absolute/venv/bin/python --allow-trusted-code --json
```

Pass the virtual environment's own interpreter path, because resolving its symlink can select the wrong package environment. `run` executes your source as the current user under the explicit `--allow-trusted-code` grant; that grant is not an operating-system sandbox.

Inspect the actual frames and the run receipt, then assemble the verified output into an ordinary project:

```sh
slopcamera studio assemble <studio-id> --output-id beauty --name "Geometry lesson" --json
```

The Manim driver renders silent visuals and rejects source-side audio. Narration, sound-effect, and cue fields in the lesson are authoring references; they never fetch, synthesize, import, or place audio by themselves.

## Add narration and sound

Use supplied audio, or [generate narration](/docs/how-to/generate-media) through an authorized Gateway call and keep its receipt. Place each retained file on the project timeline:

```sh
slopcamera project add <project-id> narration.wav --role dialogue --at 0us --json
slopcamera project add <project-id> tile-click.wav --role other --at 7600000us --json
```

An `--at` placement expresses authored timing, not proof of word alignment or lip sync. Rhubarb output can be converted with the lesson toolkit's `rhubarb_mouth_cues` helper; keep the original recognizer result, and treat mouth shapes as separate from word timestamps, which need their own measured evidence. If the project's overlay layer owns the visible delivery captions, disable the lesson's caption layer instead of rendering the same words twice, and keep the same retained word timings so emphasis survives the move.

## Check the final explanation

Render the project at the intended portrait dimensions. When the edit deliberately uses authored but unverified placement timing, acknowledge `--allow-unverified-sync` on the render; otherwise apply the relevant synchronization evidence first. [Edit and deliver video](/docs/how-to/edit-video) covers the delivery checks.

Inspect numerical labels, units, diagram geometry, presenter and caption collisions, and each cue boundary. Listen to the assembled narration against the picture before describing it as synchronized, and when listening is unavailable, report the signal and frame checks you performed and the review you could not do. Keep the mathematical source and the native frames when only the audio changes, so a narration revision never forces a new visual render.
