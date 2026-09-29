# H4 data animation

## TASK.md

# Animated bar chart

`inputs/sales.csv` holds yearly revenue in USD millions for 8 regions from
2021 to 2026 (columns: `region,2021,2022,2023,2024,2025,2026`).

Make an animated bar chart of it:

- Output: `out/bars.mp4`, H.264 MP4, 1080x1080, 30 fps, 10 seconds.
- Title "Revenue by Region" at the top.
- One horizontal bar per region, labelled with the region name, sorted
  largest first and re-sorting smoothly as values change.
- Values animate smoothly from year to year: 2021 at the start, reaching the
  2026 values at 8.5 seconds and holding them to the end.
- A large label showing the current year.
- A value label on each bar showing its current value, rounded to a whole
  number.
- No audio is needed.

## Create prompt

Do the task described in TASK.md in the current directory. When the deliverables are written, reply with one line per output file.

## Revision 1

Revision: change the chart title to "Regional Revenue in USD Millions". Keep everything else the same and re-render to the same path. When done, reply with one line per output file.

## Revision 2

Revision: the data was updated. Use `inputs/sales-v2.csv` instead of `inputs/sales.csv`; it has the same columns, revised 2026 values and a ninth region. Keep everything else the same and re-render to the same path. When done, reply with one line per output file.

## Revision 3

Revision: make the video 12 seconds long. The animation now reaches the 2026 values at 10.5 seconds and holds them to the end. Keep everything else the same and re-render to the same path. When done, reply with one line per output file.

## Revision 4

The project in this folder was made earlier; make this change and re-render. Change: draw every bar in one colour, #2A9D8F, keeping all labels readable. Re-render `out/bars.mp4` to the same path. When done, reply with one line per output file.

## Revision 5

The project in this folder was made earlier; make this change and re-render. Change: also export a 16:9 version to `out/bars-16x9.mp4`, 1920x1080, H.264, 30 fps, with the same timing and content as `out/bars.mp4`, laid out for the wider frame. Keep `out/bars.mp4` as it is. When done, reply with one line per output file.
