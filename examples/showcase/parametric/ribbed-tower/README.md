# Ribbed tower

Forty continuous bronze ribs surround 13 recessed floor plates and a central
core in [design.json](design.json). The retained parameters use 16 m height,
3.25 m radius, 1.35 rad twist, 0.27 taper, and 0.2 belly. The podium is its own
stage. [base.scene.json](base.scene.json) owns the staging, lights, and cameras.

Follow the [shared prerequisites and commands](../README.md#reproduce-a-retained-study)
with `study=ribbed-tower`. Inspect the full silhouette and rib spacing; retain
the same camera and lighting when comparing a parameter change.

Both files match the original MIT-licensed Slopcamera study at
[`63a0e3eed460fa80f1ae76983e9152c75a124392`](https://github.com/hraness/slopcamera/tree/63a0e3eed460fa80f1ae76983e9152c75a124392/examples/design).
Its dimensional constraints do not establish structural strength.
