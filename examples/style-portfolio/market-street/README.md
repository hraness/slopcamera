# Market Street film study

This editable Blender scene depicts a short cable-car journey toward a Ferry Building interpretation. It combines procedural masonry, shopfronts, open-spoked vehicles, articulated pedestrians and horses, damp paving, and atmospheric depth in a native 4:3 composition. Slopcamera Studio retains the source bundle, execution receipt, frame sequence, and Blender scene.

The scene is an authored historical interpretation. Its compressed streetscape, building dimensions, shop occupants, people, traffic, and lighting are invented. It is not original footage, a restoration, or a surveyed reconstruction. Its geometry needs visual review at the intended delivery resolution before a render can support a quality claim.

## Source contract

Import `source.json` as a Blender source bundle. Its entrypoint is `scene.py`, which exports `build(context)`. The only bundled Python dependencies are `mesh.py` and `street_data.py`. The source uses Blender's bundled font, creates its materials locally, and does not fetch assets or read environment variables.

| Control | Default | Meaning |
| --- | --- | --- |
| `parameters.frames` | `6 × job frame rate` | Animation frames to author, bounded to 1–480 |
| `parameters.seed` | `19060414` | Seed for all procedural placement and surface variation |
| `render.frameRate` | `16/1` | Simulation and capture rate, bounded to 1–60 fps |
| `render.width`, `render.height` | `1920`, `1440` | Native output size |
| `render.startFrame` | `1` | Initial frame after scene construction |

Use an Eevee job with 64 samples, opaque RGB PNG frames, and `AgX` view transform. The scene requests AgX Medium High Contrast, exposure `-0.10`, and gamma `1`. Rendering remains the host's responsibility. The source does not change native job admission, output paths, resource limits, or execution authority.

At 16 fps, `parameters.frames: 96` authors six seconds. For a single-frame proof of the full animation, keep `frames: 96` and select one frame in the job's render interval. A full job uses `startFrame: 1` and `endFrameExclusive: 97`. A 24 fps job can use `frames: 144`; the physical speeds remain the same. Sixteen fps is an authored cadence choice. It is not a claim about the original camera's precise crank rate.

The camera starts at `(-2.1, 185, 2.72)` metres, travels toward negative Y at `4.4 m/s`, and looks toward `(0, -12, 12.5)`. A 32 mm lens on a 36 mm sensor keeps the tower and street in view. This is a level traveling view with slight mechanical vibration. The one-sided blocks are compressed composition coordinates, not geographic coordinates.

The scene records its evidence, interpretation limits, seed, capture rate, camera, and object counts in the Blender scene's `historical_film_study` property. When Studio supplies `workingRoot`, it also writes `creative-metadata.json` there once.

## Historical evidence

- The [Library of Congress film record](https://www.loc.gov/item/00694408/) describes a cable-car viewpoint moving toward the Ferry Building, identifies the source as silent black-and-white 35 mm film, and documents the mixed street traffic and puddles. The scene follows those broad visual observations. The Library's catalog associates the film with April 14, 1906; the scene uses the broader description “before the April 1906 earthquake.”
- The [San Francisco Municipal Transportation Agency's account of the 1906 conversion](https://www.sfmta.com/blog/how-1906-earthquake-transformed-our-public-transit-system) places the installation of Market Street's electric traction infrastructure after the earthquake. This scene omits longitudinal overhead traction wires. Electric cars did cross Market at intersections in the original film; this omission does not imply that no electric transit existed in the city.
- The [San Francisco Planning Department's Path of Gold landmark report](https://commissions.sfplanning.org/hpcpackets/2014.794A.pdf) dates the bases to 1908 and the globe tops to 1916. Those standards are omitted. The smaller street posts here are period-inspired inventions rather than identified historical fixtures.

The source does not claim that a Sanborn map, OpenSFHistory photograph, or other archival object was measured unless its specific record and use are documented. No archival photograph is bundled or projected onto the scene. Named collection references in the earlier prototype were insufficient evidence for its claimed dimensions and confidence levels.

## Visual foundations

The street is designed to read in monochrome before film finishing. Materials use world-scale masonry joints, roughness, surface variation, and bump; glazing sits visibly inside projecting jambs and faceted projecting bays. The tower, cornices, canvas awnings, silhouettes, and traffic provide different spatial scales. Pedestrians walk and cross the road, horse legs articulate, and vehicles move independently of the camera. Static architectural detail is batched by material to keep the scene manageable.

The first native proof exposed a flat tonal range, fog washing out the foreground, party-wall brick mapping collapsing into stripes, and polygon puddles reading as opaque cutouts. The revision separates visible sky brightness from ambient fill, uses more oblique sunlight, confines haze to the distant block, fixes masonry mapping on both wall orientations, and models dampness through surface roughness. Near traffic is kept far enough away for its procedural silhouettes to support the composition.

Keep transfer effects restrained: subtle grain at delivery resolution, small gate weave, mild luminance variation, and occasional dirt. Preserve masonry detail and tonal separation. Scratches, a sepia wash, or blur cannot substitute for believable geometry, occlusion, light, and movement. A clean high-resolution master can retain an early-film cadence.

Review the first, middle, and final frames and a moving preview for geometry intersections, frozen wheels, foot sliding, shadow artifacts, and legibility of the destination. Vehicles use eased interpolation between endpoint poses; the camera is sampled along its travel at each captured frame. Wheel spokes do not rotate independently in this example, and the figures and vehicles remain procedural approximations. Film finishing should not be used to describe those limitations as archival authenticity.
