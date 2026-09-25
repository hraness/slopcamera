A walking character in a rendered scene has to do dozens of small things on time: pause, shift its weight, glance at a door, blink, pick up a cup and put it down. Slopcamera lets you describe those habits once as a small behavior program, and then bakes them into a fixed timeline of motion before anything is rendered. The program runs on [ALGAL]({{PRODUCT_URL_ALGAL}}), under rules strict enough that the same scene and the same seed always produce the same result.

## Behavior that changes every time you render

With generated animation, the first render often looks right. You change the lighting, render again, and the character now turns left instead of right, or blinks at a different moment, because something random or hidden was part of the motion. The two versions cannot be compared, and a reviewer cannot tell whether the change you made caused the difference.

Slopcamera separates deciding what a character does from drawing it. The behavior runs first, once, and its output is saved as data. Rendering reads that saved data. If you want different behavior, you change the program or the seed and bake again to a new file, so the old and new results can be compared.

## What ALGAL is, briefly

ALGAL is a language and runtime for small programs that an application runs on its own terms. An ALGAL program, which ALGAL calls an organism, is written as data: a set of steps, how they connect, and what each one is allowed to do. The host application decides which functions and tools exist. The program cannot give itself more. When it runs, ALGAL returns a record of what each step did, which can be verified later without calling a model again.

ALGAL is built mainly for agent work, such as waiting for a person to approve something or calling a model under limits. Slopcamera uses the plainest part of it: programs made only of ordinary functions, loops and sub-programs.

## How Slopcamera runs behavior on ALGAL

A behavior document belongs to one character in one scene. It names the scene it was written for, a seed, a time range, the channels it will write to (such as `locomotion` or `face.blink`), and the ALGAL programs that produce them. Slopcamera ships four starting programs you can copy: a walking state machine, an expression layer for blinks, gaze and mood, an interaction sequence for reaching for and holding props, and one that combines all three.

The logic inside those programs is plain data too. A state machine for an idle character that sometimes fidgets and walks when called might look like this, with times in microseconds:

```json
{
  "channel": "locomotion",
  "states": ["idle", "walk", "fidget"],
  "transitions": [
    { "from": "idle",   "to": "walk",   "guard": { "kind": "flag", "name": "called" } },
    { "from": "idle",   "to": "fidget", "guard": { "kind": "chance", "threshold": 0.2 } },
    { "from": "walk",   "to": "idle",   "guard": { "kind": "after", "us": 2000000 } },
    { "from": "fidget", "to": "idle",   "guard": { "kind": "after", "us": 500000 } }
  ],
  "minDwellUs": 250000
}
```

The "chance" guard does not roll dice at render time. It reads a number from a seeded random stream, so the same seed produces the same fidgets every time.

When you bake, Slopcamera hands the program to ALGAL with no tools attached. It gives ALGAL a short, fixed list of Slopcamera's own motion functions, an in-memory store for the programs, and no way to run commands, call a model, reach the network or touch files. ALGAL steps through the program and returns what each channel emitted and when. You drive it from the command line or through your coding agent:

```sh
slopcamera scene behavior check behavior.json --scene scene.json --json
slopcamera scene behavior bake behavior.json --scene scene.json --output bake.json --json
slopcamera scene behavior audit bake.json --json
```

The bake output is a sorted timeline of records such as "at 1.2 seconds, `locomotion` became `walk`". An optional channel map turns those records into the performance directives Slopcamera's character tools already accept: which animation clip to play, which prop to attach or release, which path to follow. A channel you leave out of the map stays in the timeline only. A mapped value with no matching binding is reported as unresolved, rather than guessed.

## The rules the bake keeps

Slopcamera checks each of these on every bake and fails the bake rather than save a result that breaks one:

```text
the behavior's scene fingerprint        ==  the fingerprint of the scene passed in
effects recorded by the run             ==  0
model calls made by the run             ==  0
every record's channel                  in  the channels the document declared
every record's time                     in  the document's time range
each program's ID                       ==  the fingerprint ALGAL computes for it
```

Repeatability itself is held by Slopcamera's tests rather than re-checked on each bake: baking the same behavior against the same scene twice must produce an identical result, down to ALGAL's run fingerprint.

The last rule catches drift between two parsers. Slopcamera keeps its own copy of the rules for which programs are allowed, and ALGAL has its own parser. At bake time, Slopcamera asks ALGAL to recompute each program's fingerprint and refuses to run if the two disagree, so a disagreement shows up as an error before any motion is produced.

The saved bake also records the fingerprints of the behavior, the scene, the function list and the emitted timeline, plus the name and version of the ALGAL runtime that ran it, so you can tell later exactly which inputs produced a given motion.

## What that buys you

Motion is decided before anything renders, so rendering the same bake again does not re-roll it. If you edit the scene itself, Slopcamera marks the behavior as stale until you rebind it to the new scene and bake again; keep the earlier bake and you can compare the two. When you do want variety, the gallery command bakes the same program with six different seeds and keeps only the results that actually differ, so a program that ignores its seed returns one candidate instead of six copies. It never picks one for you.

The audit gives a second opinion on a baked timeline. It flags a character that switches state too often, motion that repeats on an exact loop, a channel that never changes, and states that are never reached. They are warnings for a person or agent to read; the audit changes nothing.

Because behavior programs are data, your coding agent can write and revise them the same way it edits the rest of a scene, and every revision can be checked and baked before anything renders. [Introducing Slopcamera](/blog/introducing-slopcamera) covers the rest of the tool, and the [scene rendering guide](/docs/how-to/direct-scenes) covers the render side.

## Where this stops

Behavior baking decides when things happen. It does not create animation clips, rigs or props; the channel map points at ones you already have, and anything you do not map stays in the timeline only. The four starting programs are small, and the function list is closed, so behavior outside what those functions express needs a change to Slopcamera itself. Slopcamera builds on a fixed ALGAL commit, and ALGAL is early software. The check and bake commands also wait for free local CPU, so when a render is already running, a slow bake with no output means it is still waiting for free CPU.

Latest release: [{{PUBLISHED_VERSION}}]({{RELEASE_URL}}).
