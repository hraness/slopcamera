# Oil-paint study

Run this deterministic source from the repository root:

```sh
slopcamera image oil-paint examples/oil-paint/valley.json \
  --output /tmp/slopcamera-valley.ppm \
  --log /tmp/slopcamera-valley.replay.json \
  --json
```

The four named tubes are mixed into three knife-worked piles; strokes only name
piles. The first layer waits on the simulated clock before the accents are
laid. Re-run the retained replay log to verify the same image digest:

```sh
slopcamera image oil-paint --replay /tmp/slopcamera-valley.replay.json \
  --output /tmp/slopcamera-valley-again.ppm --json
```
