Start with a finished piece, open its source, and change a creative decision. Each film below has its own brief, production recipe, and suggested revision. The illustrations, geometry, animation, and music are original; the eclipse edits use credited NASA footage.

For a first project, follow [Create and revise your first animation](/docs/tutorials/first-animation). The complete showcase recipes use a [source checkout](/docs/how-to/install-from-source), Bun, and the runtimes named in each recipe. Rendering happens locally. The illustrated and 3D pieces need no paid model; the eclipse explainer can use your own recording or generated narration.

## Rain, bottled

::example[rain-bottled]

**The brief:** make a tiny weather instrument feel like an object worth collecting. A metal selector, a suspended cloud, a contained storm, and a final droplet give the fourteen-second advertisement a beginning and an ending.

The scene uses Blender geometry, a volume cloud, clear glass, studio lighting, and four camera setups. The rain and water rings are art-directed geometry. A separately authored score supplies metal clicks, rain, thunder, and the final droplet. Picture and sound remain separate inputs in the assembled SlopCamera project.

[Open the source and production recipe](https://github.com/hraness/slopcamera/tree/main/examples/showcase/studio-relaunch/rain-bottled). Render a still before the complete sequence: transparent materials and small engraved details need inspection at full size.

**Direct another version:** “Keep the framing and instrument. Make the rain amber, and make the storm half as fierce.” The supplied `revision` job changes rain strength and color in the same scene. For a timing change, edit the shot intervals and sound cues together.

## Last tram

::example[last-tram]

**The brief:** a copper tram in a rainy midnight city changes its destination to MOON, then follows the rails into the sky. The destination must register before departure; the last composition needs time to settle.

The scene is original Canvas artwork with layered city silhouettes, rain, moving wheels, and a rising track. SlopCamera renders the retained HTML scene and its original score. The artwork needs no image service, stock assets, or downloaded font.

### Last tram, revised

::example[last-tram-revised]

**The direction:** “Make the moon larger so it dominates the destination. Keep the journey, palette, and timing.” These are two rendered versions of the same source. Compare the same moment, then watch both endings.

[Make both versions in the first-animation tutorial](/docs/tutorials/first-animation), or [open the scored production recipe](https://github.com/hraness/slopcamera/tree/main/examples/showcase/studio-relaunch/last-tram). The tutorial renders silent picture; the production recipe adds the soundtrack.

## Paper ocean

::example[paper-ocean]

**The brief:** an envelope opens into an ocean, a whale breaches, and the whole scene settles into a print. Keep the paper edges, restrained palette, and layered shadows consistent as the composition unfolds.

The paper, grain, shapes, lighting, and motion are procedural Canvas artwork. The `whale` and `quiet` values of `parameters.variant` offer different compositions. A still export uses the same source as the film, so the final image can continue into a poster or article illustration.

[Open the source and film/still recipes](https://github.com/hraness/slopcamera/tree/main/examples/showcase/studio-relaunch/paper-ocean).

**Direct another version:** “Use the quiet composition. Make the sea a little darker and give the whale more space above the water. Keep the folded-paper edges and warm stock.” Check the overlapping layers during the breach, then inspect the still at its final display size.

## Laundromat after midnight

::example[laundromat-after-midnight]

**The brief:** a record-shaped dancer wakes up a pastel laundromat. A sock interrupts the routine; the character recovers and finds the matching pair.

The performance uses authored poses, alternating planted feet, flexible limbs, a sock arc, and six bars of original music. It is a 2D Canvas scene. Motion and sound share a deliberate twelve-second structure.

[Open the scene and score](https://github.com/hraness/slopcamera/tree/main/examples/showcase/studio-relaunch/laundromat).

**Direct another version:** “Give the dancer a longer surprised pause when the sock lands. Take that time from the first dance phrase and move the musical accent with it.” Review the planted feet, the contact, and the recovery in motion.

## Square-wave jazz

::example[square-wave-jazz]

**The brief:** let five odd harmonics form a tiny jazz band. Hear the tone become brighter as the visible wave becomes squarer.

The lead voice and displayed curve use the same Fourier sum, with partial weights of 1, 1/3, 1/5, 1/7, and 1/9. Five terms approximate a square wave; the overshoot remains visible. The musicians represent pure partials. Bass, piano, and brushes accompany the lead, so the picture shows its oscillator rather than the complete audio mix.

[Open the source, score, and mathematical check](https://github.com/hraness/slopcamera/tree/main/examples/showcase/studio-relaunch/jazz-wave), or read the [visual transcript](https://github.com/hraness/slopcamera/blob/main/examples/showcase/studio-relaunch/jazz-wave/transcript.md).

**Direct another version:** “Turn this into a nocturnal radio show: deep blue stock, pale pink ink, and quieter brushes. Preserve the equation, entry times, and overshoot.” Run the supplied check after changing the wave or its labels.

## One shoot, three stories

The same NASA eclipse time-lapse becomes three different pieces through selection, framing, typography, pace, and sound. Footage: NASA / Mike Toillion, Mazatlán, Mexico, 8 April 2024. These are independent edits; NASA does not endorse SlopCamera.

### One shoot, cinematic

::example[one-shoot-cinematic]

A monochrome landscape cut gives the eclipse space, with a restrained title and a quiet original score. The source time-lapse is accelerated further for this short edit.

### One shoot, vertical

::example[one-shoot-vertical]

The same sequence gets a square crop inside a vertical canvas, a different typographic hierarchy, and a more rhythmic score. Text occupies deliberate space above and below the footage.

### One shoot, explainer

::example[one-shoot-explainer]

A tighter selection, a labeled corona, narration, and captions explain what becomes visible when the Moon covers the Sun's bright disk. The recording and picture remain separate source files.

[Open the editing recipe, footage credit, and narration text](https://github.com/hraness/slopcamera/tree/main/examples/showcase/studio-relaunch/one-shoot). It combines SlopCamera's local color operation with explicit FFmpeg edits, overlays, and audio mixing. The recipe makes no provider call; supply your own short recording or follow [Generate images, video, and narration](/docs/how-to/generate-media).

**Direct another version:** “Keep the eclipse, but make the vertical cut quiet and contemplative. Remove the pulse, delay the title, and hold the last clear view.” Review the crop on a phone and check that every spoken word has time to finish.

## Carry the method into your own work

Borrow a decision, then change the subject: the tram's readable departure, the bottle's material study, the paper ocean's ending, the dancer's anticipation, the jazz film's visible explanation, or the eclipse's three editorial treatments. Keep earlier versions and judge the whole sequence with sound. [Direct a film](/docs/how-to/direct-a-film) gives you the vocabulary for the next revision.
