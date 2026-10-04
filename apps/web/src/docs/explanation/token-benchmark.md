Does a coding agent spend fewer tokens on a media task when SlopCamera is installed? In a controlled benchmark run on 29 September 2026, having SlopCamera installed did not reduce the agent's token spend or cost. Across four media tasks, the median cost to make a deliverable and then revise it was higher with SlopCamera on every task, by a factor of 1.14 to 2.69. With two sessions per task per condition, this is a small sample, and the result applies only to the setup described below.

The harness, prompts, raw results, and contact sheets of every output are in [`bench/token-savings`](https://github.com/hraness/slopcamera/tree/main/bench/token-savings) on GitHub.

## What we compared

Each session ran headless Claude Code (`claude -p`) with the model `claude-opus-5-5`, starting in a new directory that held only the task description, plus the two source clips for the edited-video task. The machine owner's Claude Code settings, instruction files, memories, plugins, and MCP servers were not loaded; Claude Code's built-in skills and plugins were, in both conditions. The prompts were identical in both conditions and never mentioned SlopCamera.

- **A, without SlopCamera:** the agent could use anything installed on the Mac: FFmpeg, Blender, Python, Bun, and packages it chose to install.
- **B, with SlopCamera:** the same, plus the SlopCamera 3.8.0 CLI on `PATH` and its Agent Skill installed for the project with `slopcamera skill install --target claude --scope project`. SlopCamera was installed before the session started, so the agent spent no turns installing it.

Each session made a deliverable, then revised it in the same conversation:

| Task | Make | Revise |
| --- | --- | --- |
| Diagram | A five-node flow diagram as light and dark SVG and PNG | Rename one node, add one edge, export all four files again |
| Motion card | A 6-second 1080x1920, 30 fps MP4 title card with animated text and a moving background | Change the headline and the accent color |
| 3D product shot | A 1920x1080 Blender render of a stylized product on a pedestal with three-point lighting | Change the material color and move the camera 20 degrees |
| Edited video | One 1080x1080 MP4 cut from two supplied clips, with a title and a 0.5-second crossfade | Change the title and trim the first clip by 1 second |

Each task ran twice per condition, for 16 sessions and 32 steps. Sessions ran one at a time. The first repeat ran A before B and the second ran B before A. Each step had a $6 budget cap and a 25-minute timeout.

A script checked every output the same way in both conditions: that each file existed, and its format, dimensions, duration, and frame rate. For revisions, it also checked that each file changed and that the new text appeared in the output or its source. It did not score how the results looked.

## Results

All 32 steps passed the checks. No step hit its budget cap or timeout.

Medians of the two sessions in each cell, for the make step plus the revise step:

| Task | Output tokens without | Output tokens with | Cost without | Cost with | Cost ratio, with / without |
| --- | --- | --- | --- | --- | --- |
| Diagram | 3,678 | 3,375 | $0.25 | $0.31 | 1.23 |
| Motion card | 4,706 | 7,518 | $0.21 | $0.57 | 2.69 |
| 3D product shot | 11,496 | 8,695 | $0.52 | $0.59 | 1.14 |
| Edited video | 3,519 | 3,209 | $0.18 | $0.21 | 1.21 |

With two sessions per cell, each median is the mean of two sessions, so the range of the two sessions matters as much as the median:

| Task | Cost without, per session | Cost with, per session | Ranges |
| --- | --- | --- | --- |
| Diagram | $0.202, $0.301 | $0.299, $0.320 | Overlap |
| Motion card | $0.203, $0.223 | $0.365, $0.780 | Higher with SlopCamera |
| 3D product shot | $0.473, $0.565 | $0.579, $0.602 | Higher with SlopCamera |
| Edited video | $0.158, $0.195 | $0.187, $0.242 | Overlap |

On the 3D product shot, both sessions with SlopCamera wrote fewer output tokens (8,502 and 8,887) than both sessions without it (10,193 and 12,798), and still cost more. On the diagram and edited-video tasks, the output-token differences are within the spread between sessions.

## Where the extra cost came from

Output was about equal: 45,590 output tokens with SlopCamera and 46,795 without, across all 32 steps. The difference was on the input side. With SlopCamera, the agent read the skill, printed command help, and opened rendered frames to check them, and it took more turns. Each turn re-sends the conversation so far, mostly from the prompt cache.

Token types have very different prices, so this table weights them by price. The prices reproduce the cost Claude Code reported for every step.

| Part of the cost, all 16 sessions | Without SlopCamera | With SlopCamera |
| --- | --- | --- |
| Writing to the prompt cache | $1.13 | $1.87 |
| Reading from the prompt cache | $0.26 | $0.59 |
| Output | $0.94 | $0.91 |
| Total | $2.32 | $3.37 |

Counted without weighting, the sessions with SlopCamera used about 2.2 times as many input-side tokens (3.18 million against 1.44 million), but 2.95 million of those were cache reads, which cost a fortieth of a cache write. The price-weighted table is the better comparison.

## What else to know

- **One edited-video session never used SlopCamera.** It was installed, but the agent used FFmpeg directly. The other session ran one SlopCamera command. The edited-video result says little about what using SlopCamera costs; it measures having it installed. The other six sessions with SlopCamera loaded the skill and ran the CLI.
- **Wall time is mostly render time.** On the motion card, sessions with SlopCamera took 534 and 851 seconds, against 48 and 78 without, and most of that time passed outside model calls, while SlopCamera rendered. Each session also started SlopCamera from an empty state, so any first-run setup falls inside it. Wall time says nothing about token use.
- **One check was loosened after the results were in.** The text check first required the new headline as one string. One session without SlopCamera drew the headline in two pieces, so its revision failed. The check now also accepts the words in order across separate lines or draw calls, which turned that step into a pass. Without that change, the motion-card result without SlopCamera rests on one session ($0.22), and SlopCamera still costs more there.
- **Both conditions shared Claude Code's built-in skills and plugins.** These ship with Claude Code and were the same in A and B.
- **The checks are structural.** They confirm the files are the right format, size, and length, and that revisions changed them. They do not judge quality. The contact sheets in the repository show every output.

## A harder pilot

On the same day we tried a single pilot of a harder version: one session per task and condition, not a full run. Each task was made once and then revised five times, the last two revisions in a fresh session. Four tasks ran with and without SlopCamera, and SlopCamera cost more on all four: $1.55 against $0.80 (that session stopped one revision early), $2.08 against $1.18, $1.37 against $1.02, and $1.51 against $1.06. The revisions cost about the same in both conditions, so they did not make up the higher cost of the first version. Sessions without SlopCamera needed four retries after a failed check, against one with it. One session per cell is too few to support a conclusion, and the pilot cost about $12.47, so we did not run the full version.

## Cost of running it

The 32 steps cost $5.69 at list prices, $2.32 without SlopCamera and $3.37 with it. An earlier pilot, whose results are not used here, cost $1.47.

## Limits

- **Small sample.** Two sessions per task per condition cannot show a statistically significant difference; the smallest possible p-value for a two-sided rank test at that size is 0.33. The tables report what was measured, without confidence intervals.
- **One setup.** One model (`claude-opus-5-5`), one Claude Code version (2.1.284), one SlopCamera version (3.8.0), one Mac, one day, 29 September 2026. The result does not carry over to other models, agents, versions, or task types.
- **Tasks chosen to fit SlopCamera.** Each task maps to a SlopCamera technique, so the setup favored SlopCamera rather than working against it.
- **A new session each time.** Each session started with no project history. The benchmark does not measure an agent coming back to a project in a later conversation.

The benchmark does not support a claim that SlopCamera saves tokens or money. Reasons to install it are described in [Why SlopCamera](/docs/explanation/why-slopcamera) and measured on file sizes in [Your model can one-shot a render. What does the second one take?](/blog/one-shot-render-vs-installed-techniques).

## Run it yourself

The [benchmark README](https://github.com/hraness/slopcamera/blob/main/bench/token-savings/README.md) lists the commands, the flags that keep the machine owner's Claude Code configuration out of each session, and where the harness writes results. The [run summary](https://github.com/hraness/slopcamera/blob/main/bench/token-savings/results/2026-09-29/summary.md) has every step's tokens, cost, turns, and tool calls, and the [run notes](https://github.com/hraness/slopcamera/blob/main/bench/token-savings/results/2026-09-29/NOTES.md) list the corrections made to the harness after the run.
