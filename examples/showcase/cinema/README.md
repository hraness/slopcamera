# The same two shots, six transitions

This controlled comparison joins the optical instrument film to the editorial
motion graphic. It shows a cut, dissolve, left wipe, dip to deep green, left whip
pan and light flash using the actual project cinema renderer.

The two shot bodies are identical in every version: source time 0.5–2.5 seconds
from each film. A cut joins those bodies directly, producing four seconds.
The other transitions add half a second between the bodies, using the first
shot's 2.5–3.0-second outgoing handle and the second shot's 0.0–0.5-second incoming
handle. Their total duration is 4.5 seconds. All versions are 960×540 at 24 fps.
The source films are silent; this example makes no audio-continuity claim.

Use Bun 1.3.14 and FFmpeg/FFprobe from a source checkout with locked dependencies.
First complete the [native product recipe](../native/product) and the
[editorial HTML recipe](../html). Pass the successful product job ID and the
editorial render result returned by those commands:

```sh
bun examples/showcase/cinema/transitions.ts <product-job-id> <editorial-result.json> prepare
bun examples/showcase/cinema/transitions.ts <product-job-id> <editorial-result.json> render <reviewed-git-SHA>
```

Review all six retained plans and dry-run invocations before the render phase.
Each source must be a real materialized film. There are no placeholder shots.
The helper creates one new project for its exact recipe identity, imports the
editorial movie and saves each cinema sidecar as an immutable revision. It
checks the current project and edit identities before selecting the next one.
It refuses to replace a sidecar it did not create. Run one invocation at a time
in a checkout; the six cases deliberately share that one project.

The recipe identity includes the helper, source receipt, composition and engine
commit. A changed engine therefore creates a new project instead of reusing old
execution evidence. Successful exact command results are retained with hashes;
failed attempts require inspection. The helper records the native studio
assembly result and verifies the editorial source, document, authoring, movie
and receipt before importing it.

Each operation requires at least 1.5 GiB free. The recipe and its project have a
combined 100 MiB retained-output limit, excluding already existing native and
HTML masters. Each child command has a ten-minute deadline and an eight-MiB
combined output limit. Interrupted work collects its own process group before
returning; unresolved custody is an error, not a successful render.

Inspect every final frame, especially frames 47–60 around the transition, and
retain the original cinema receipt. A dissolve blends the two moving handles;
a wipe reveals the incoming image from an edge; a dip deliberately passes
through its specified color. Whip pan and flash are visible punctuation. These
are separate comparison clips, not a finished campaign, spatial transition or
match-cut demonstration.

Do not infer usable motion or color from a passed plan alone. Only reviewed
final media belongs in a public gallery. Publication may remove an all-zero
AAC track after measuring every decoded sample and verifying stream-copy
video identity; keep that derivative proof beside the original receipt.
