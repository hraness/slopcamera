# T4 edited video

## TASK.md

# Edited video

Two source clips are in `inputs/`: `inputs/clip-a.mp4` and
`inputs/clip-b.mp4` (4 seconds each, 1280x720, 30 fps, no audio).

Cut them into one square video:

- Output: `out/edit.mp4`, H.264 MP4, 1080x1080, 30 fps.
- Clip A, then clip B, joined with a 0.5-second crossfade, so the result is
  7.5 seconds long.
- Fill the square frame (crop or scale as you judge best, no stretching).
- A title overlay reading "Field Test" visible for at least the first
  2 seconds.
- No audio is needed.

## Create prompt

Do the task described in TASK.md in the current directory. When the deliverables are written, reply with one line per output file.

## Revise prompt

Revision: change the title overlay to "Night Shift" and trim the first second off the start of clip A, so the result is 6.5 seconds long. Keep everything else the same and re-render to the same path. When done, reply with one line per output file.
