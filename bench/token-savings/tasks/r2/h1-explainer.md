# H1 explainer video

## TASK.md

# Explainer video

Make a 30-second explainer video:

- Output: `out/explainer.mp4`, H.264 MP4 with an AAC audio track, 1920x1080,
  30 fps, 30 seconds long.
- Four scenes, in this order, each showing its title on screen:
  "The Problem", "How It Works", "The Results", "Get Started".
- Scene 2 ("How It Works") contains an animated diagram of six labelled
  nodes connected by arrows as a pipeline, in this order:
  Ingest → Parse → Index → Rank → Cache → Serve.
  The nodes and arrows appear one after another.
- Scenes 1, 3 and 4 can be title cards with one short line of supporting
  text each.
- Crossfades of about 0.5 seconds between consecutive scenes.
- A music bed generated with ffmpeg's `sine` source (for example a soft
  chord of two or three tones) under the whole video, fading out over the
  final 1 second.

## Create prompt

Do the task described in TASK.md in the current directory. When the deliverables are written, reply with one line per output file.

## Revision 1

Revision: change the scene 3 title from "The Results" to "What Changed". Keep everything else the same and re-render to the same path. When done, reply with one line per output file.

## Revision 2

Revision: make the video 36 seconds long by holding scene 4 ("Get Started") 6 seconds longer. The music bed must still cover the whole video and fade out over the final 1 second. Keep everything else the same and re-render to the same path. When done, reply with one line per output file.

## Revision 3

Revision: add a seventh node, "Monitor", to the scene 2 diagram, with an arrow from "Serve" to "Monitor". It appears after the other nodes, like them. Keep everything else the same and re-render to the same path. When done, reply with one line per output file.

## Revision 4

The project in this folder was made earlier; make this change and re-render. Change: also export a 1280x720 copy of the video to `out/explainer-720p.mp4` (H.264 with AAC audio, 30 fps, same content and length as `out/explainer.mp4`). Keep `out/explainer.mp4` as it is. When done, reply with one line per output file.

## Revision 5

The project in this folder was made earlier; make this change and re-render. Change: rename the scene 1 title from "The Problem" to "Why It Matters", in both `out/explainer.mp4` and `out/explainer-720p.mp4`. Keep everything else the same. When done, reply with one line per output file.
