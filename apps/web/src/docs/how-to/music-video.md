An authored HTML or Three.js scene can become a finished MP4 over your own track, while the rendered scene video and the original music stay separate sources inside an ordinary project. You can revise the scene, the edit, and the mix independently instead of extracting audio from a finished movie.

Scene export is a current-source command. Use a [source build](/docs/how-to/install-from-source) whose `slopcamera help html` lists `html render`. Rendering also needs the admitted local Chrome runtime and FFmpeg/FFprobe, so check the host before preparing a full render:

```sh
slopcamera help html
{{DOCTOR_COMMAND}}
```

## Prepare the scene request

The source repository ships an original articulated robot above a procedural island, [music-video.html](https://github.com/hraness/slopcamera/blob/main/examples/html/music-video.html), with its [scene request](https://github.com/hraness/slopcamera/blob/main/examples/html/music-video.json). Its visuals use core Three.js and no external assets. Its request selects `three-webgl2-hardware-v1`, which requires the qualified macOS hardware profile described in [capabilities](/docs/reference/capabilities).

Save your own request as `music-video.json` at the workspace root, and replace the audio path with your selected local track. This request uses the default browser profile; add `executionProfile` when you require a specific supported profile.

```json
{
  "kind": "slopcamera.html-scene",
  "schemaVersion": 1,
  "name": "Island music video",
  "document": { "path": "scene.html" },
  "canvas": { "width": 1280, "height": 720, "deviceScaleFactor": 1 },
  "timing": { "durationUs": 43204320, "fps": 30 },
  "libraries": ["three"],
  "seed": 8888,
  "parameters": {
    "music": { "bpm": 88.88, "beatOffsetUs": 0, "beatsPerBar": 4 }
  },
  "audio": {
    "path": "/absolute/path/to/track.mp3",
    "reactivity": { "profile": "bands-v1" }
  }
}
```

Run the commands from the workspace root. `document.path` and each declared resource `path` resolve against that root, so keep the HTML and its resources inside the workspace. `audio.path` takes an explicit absolute local path; omit the `audio` object for a silent video. The soundtrack must contain exactly one playable audio stream that begins at the media timeline origin, and a delayed start is rejected before any frame renders.

Set `timing.durationUs` explicitly even when you supply audio. Version one does not infer duration, tempo, or downbeats from the track. The final duration rounds up to a whole number of frames, and the audio begins at time zero and is trimmed or padded with silence to that duration. `canvas.width` and `canvas.height` are the movie's exact dimensions and must be even integers. `deviceScaleFactor` changes only internal rendering density, so keep it at `1` while iterating. Declare any images or model data in `resources` and resolve their names with `SlopcameraOverlay.asset(...)`; ambient network loading is unavailable during the render.

## Align motion to the music

Set `parameters.music` to the track's known constant tempo, the integer-microsecond time of beat zero, and the beats per bar. The example document falls back to `88.88`, `0`, and `4` when the request omits them. Listen to the track with the render to confirm that the chosen offset matches the intended beat.

Inside the document, derive every pose from the absolute frame time:

```ts
SlopcameraOverlay.onFrame(({ timeMs }) => {
  const beat = SlopcameraOverlay.musicClock(
    Math.round(timeMs * 1000),
    SlopcameraOverlay.parameters.music,
  );
  const accent = SlopcameraOverlay.musicPulse(beat.beatPhase, 0.7);
  dancer.rotation.z = 0.08 * Math.sin(Math.PI * beat.beatPosition);
  ring.material.emissiveIntensity = 0.7 + 0.5 * accent;
  renderer.render(scene, camera);
});
```

Here `dancer`, `ring`, `scene`, `camera`, and `renderer` are objects your document creates. Use beat and bar positions for choreography, scenery changes, and camera movement, and avoid accumulated rotations, wall-clock time, and a second animation loop. The [SDK reference](/docs/reference/sdk) describes the clock fields and the pulse width. These helpers sample declared timing; they do not analyze the rendered frames for flashes or certify viewer safety, so review the actual movie before delivery.

## React to the audio itself

Add `audio.reactivity` with `profile: "bands-v1"` to derive a bounded offline envelope from the verified soundtrack: bass (35–180 Hz), midrange (180–2,000 Hz), treble (2,000–12,000 Hz), and overall energy, decoded at 24 kHz into a 60 Hz series with a quiet-input floor, useful-range normalization, and attack/release smoothing. Analysis is limited to ten minutes. The generated source request declares a retained `audio-reactivity` resource, so rerendering that source reuses the hash-bound sidecar after checking that it still matches the soundtrack.

Load the declared sidecar once during readiness and sample it from the same absolute frame time:

```ts
let audio;
SlopcameraOverlay.ready((async () => {
  const response = await fetch(SlopcameraOverlay.asset("audio-reactivity"));
  audio = SlopcameraOverlay.prepareAudioReactivity(await response.json());
})());
SlopcameraOverlay.onFrame(({ timeMs }) => {
  const sample = audio.sample(Math.round(timeMs * 1000));
  bassLight.intensity = 0.4 + 1.2 * sample.bass;
  trebleLight.intensity = 0.2 + 0.8 * sample.treble;
  renderer.render(scene, camera);
});
```

`prepareAudioReactivity` validates and copies the sidecar once. Its `sample(timeUs)` method interpolates in constant time, returns zeros outside the analyzed range, and accepts integer microseconds only. Use the returned values for smooth local light and material changes; they do not certify a flash-safe render.

An imported rigged character needs the documented preparation path, which currently supports uncompressed skinned GLB. Draco compression, morph targets, and embedded animation clips are unsupported. Preserve the asset's source and required attribution when you replace the example mascot.

## Check the plan, then render

```sh
slopcamera html render --input music-video.json --dry-run --json
```

A dry run checks the request, the local document and declared resources, and the workload bounds. It does not launch Chrome, validate or import the audio, or create project state, so a successful plan does not prove the scene's shaders or soundtrack will render.

```sh
slopcamera html render --input music-video.json --json
```

Progress goes to stderr while `--json` keeps stdout machine-readable. Use the returned `output.path`, `receipt.path`, `source.path`, `projectId`, and `projectPath`. The retained job under `artifacts/slopcamera/generated/html-scenes/` holds the HTML, the declared resources, the original soundtrack when supplied, source and render receipts, a lossless RGB `scene.mp4`, and the delivery `video.mp4`. The delivery uses H.264 video and, when audio is present, 48 kHz stereo AAC at 320 kb/s. The input files stay unchanged, and the ordinary project references the scene video and the original music separately.

`source.path` identifies a reusable scene request that preserves the canvas, frame rate, timing, seed, and parameters, with source paths pointing to the retained inputs. To rerun those scene settings:

```sh
slopcamera html render --input <source.path> --json
```

## Review and keep editing

Watch the full delivery with sound. Check the intended beat alignment, character framing, phrase transitions, bright accents, and the first and last frames, and confirm the returned duration, dimensions, frame count, and audio stream. Keep those technical checks distinct from a visual or listening review you could not perform.

```sh
slopcamera project inspect <project-id> --json
```

Ordinary project rendering has its own defaults of 1920×1080 at 60 fps, so set the delivery size and frame rate explicitly:

```sh
slopcamera project render plan <project-id> --width 1280 --height 720 --fps 30 --output renders/edited.mp4 --json
```

The project renderer applies the ordinary editor's color and audio processing, so matching the scene's dimensions and frame rate does not guarantee an identical picture or sound. To change the choreography or scenery, revise your working HTML and render a new scene request rather than editing the exported video. [Edit and deliver video](/docs/how-to/edit-video) covers cuts, additional media, captions, and delivery variants, and [Choose an HTML authoring surface](/docs/explanation/html-authoring) explains when DOM, vector, or explicit GPU profiles fit better than Three.
