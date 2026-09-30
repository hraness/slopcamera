# The laundromat after midnight

A twelve-second original rubber-hose dance in a pastel laundromat. A vinyl
record wakes up, dances in time, catches an overenthusiastic sock on its face,
then finds the matching pair. The window reveals a quieter midnight street;
enamel washers, paper labels, towels and a perspective tile floor belong to one
illustrated set. This is 2D Canvas animation, with no external images or models.

## Reproduce

Run from the repository root. Requires Bun and repository dependencies,
FFmpeg/FFprobe and an HTML browser accepted by Slopcamera. Original audio
composition additionally requires Python 3 and NumPy.

```sh
python3 examples/showcase/studio-relaunch/last-tram/score.py \
  --film laundromat --output artifacts/studio-relaunch/laundromat/soundtrack.wav

bun examples/showcase/studio-relaunch/laundromat/render.ts \
  --run dance-proof --still --time 5.9 --width 1920

bun examples/showcase/studio-relaunch/laundromat/render.ts \
  --run dance-1080 --width 1920 \
  --audio artifacts/studio-relaunch/laundromat/soundtrack.wav
```

Use fresh run IDs and audio paths. The helper calls Slopcamera's native retained
HTML-scene route, recording request, intent, log and result under
`artifacts/studio-relaunch/laundromat/<run>/`. The result provides project, source,
video, hashes and verification. The source can be inspected directly at
`scene.html?time=5.9`. No provider calls or sampled music are needed.

## Timing and review

The composition uses six bars at 120 BPM. Bent noodle legs, alternating planted
feet, an anticipatory wake-up, independent hands, a parabolic sock toss,
surprise expression and settled end pose establish the performance. The score
uses original plucked partials, bass, brushes and claps. Its JSON records cues,
signal properties and an explicit `listened: false` until a real audition is
documented externally.

Inspect the wake-up, both planted-foot phases, toss apex, face contact, transition
to the paired socks and end hold. Do not admit a technical render solely from a
poster. This source is a production candidate until its motion and sound have
passed the documented creative review.
