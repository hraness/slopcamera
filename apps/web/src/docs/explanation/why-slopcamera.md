Slopcamera keeps the source behind every render, such as a diagram file, a Blender program, a 3D scene, or a video edit, so your agent can change one detail and render again. This page explains what that gives you and when Remotion, HyperFrames, Blender MCP, or a hosted generator fits better.

## Sources stay editable after the render

A render produces derivatives; it does not consume its source. A diagram keeps its version-one JSON document beside the five files a render exports. A spatial scene keeps named entities and calibrated cameras as typed data an agent can patch by ID. A native bundle keeps its Blender, CadQuery, or Manim program. A video project records cuts, timing, framing, captions, and effects as decisions, so preview and final renders evaluate the same timeline and composition.

The difference shows up on the second request. A PNG does not record the JSON it was rendered from, and an exported MP4 does not preserve the edit plan that produced it. When an agent assembles one-off scripts, those relationships live in a transcript, if anywhere. In Slopcamera they are the retained state, so revising a label means editing the diagram source and re-rendering it, as in the [first-diagram tutorial](/docs/tutorials/first-diagram), rather than producing a new image that has lost its connection to the source.

## One project model carries the evidence

Ordinary projects keep the current edit plan alongside original media, analysis, and derived outputs. One project is immutable source plus explicit revisions, candidates, selections, and delivery variants that refer to the same inputs. Each plan fixes its inputs before anything runs. Slopcamera limits how much work runs at once, tracks each process until it exits, and reuses finished work only when the inputs, tool, and recorded result still match.

That gives the agent a verifiable trail instead of a log to trust. A failed or interrupted attempt leaves its exact evidence for inspection and reconciliation; recovery re-checks the attempt rather than assuming a timeout meant nothing ran. A receipt proves a recorded operation and the identities involved, not visual quality. A successful plan or schema check still does not replace inspecting the result.

## Execution and credentials stay local

There is no Slopcamera account, hosted project database, or browser generation service. Ordinary editing and rendering run on the machine in front of the agent, and the durable state is ordinary files under your control.

Model-backed work is opt-in per invocation. Image, video, speech, and transcription generation use the caller's own Vercel AI Gateway access, read from the local process environment and never persisted as project data. Prompt-only images can instead run on the hosted API at `api.slopcamera.com`, paid with prepaid Hraness Credits. Uploading named local media requires an explicit acknowledgement on that invocation, `--allow-cloud-upload` for image and video and `--allow-cloud-audio-upload` for transcription. Discovering a model, paying for a result, and rendering retained bytes are distinct operations with distinct receipts.

## Fixed interfaces an agent can inspect

An agent does not have to guess the local contract. `slopcamera --help` prints the grammar, `{{DOCTOR_COMMAND}}` reports installed tools and readiness, `slopcamera operations list --json` enumerates the closed operation registry with its input schemas, and `slopcamera html catalog` lists the admitted HTML profiles. The version-matched Agent Skill routes the agent to the reference for each kind of job, SDK entrypoints select a typed capability boundary, and the MCP server publishes a fixed, bounded toolset.

Properties a per-task script would have to reimplement, such as absolute-time rendering, declared assets, resource admission, bounded inputs, and provenance receipts, are host invariants here. They apply to every operation the same way, and they leave evidence the next operation can check. The [architecture explanation](/docs/explanation/architecture) develops this source, representation, and project model.

## Compared with other tools

Use [Remotion](https://www.remotion.dev/) if your team writes React and wants to render at scale on [AWS Lambda](https://www.remotion.dev/docs/lambda). Use [HyperFrames](https://github.com/heygen-com/hyperframes) if you want HTML motion graphics rendered to MP4, with optional HeyGen-hosted rendering. Use [Blender MCP](https://github.com/ahujasid/blender-mcp) to model interactively in a running Blender. Use Slopcamera when one agent needs diagrams, 3D scenes, Blender or Manim films, and edits of your own footage in one local project it can revise. Remotion and HyperFrames have much larger communities.

| | Slopcamera | Remotion | HyperFrames | Blender MCP |
| --- | --- | --- | --- | --- |
| What the agent writes | HTML scenes, diagram JSON, Three.js scene JSON, Blender, CadQuery, or Manim programs, and video edits | React components | HTML, CSS, and JavaScript animation | Commands sent to a running Blender |
| License | MIT | Source-available; free for individuals, non-profits, and organizations of up to 3 people ([license FAQ](https://www.remotion.dev/docs/license/faq)) | Apache 2.0 | MIT |
| Agent integration | Version-matched Agent Skill, CLI, TypeScript SDK, and a 17-tool MCP server | [Official Agent Skills](https://www.remotion.dev/docs/ai/skills) | Agent Skills and a Claude Code plugin | MCP server plus a Blender add-on |
| Cloud rendering | None; renders run on your machine | AWS Lambda in your AWS account | HeyGen-hosted rendering or AWS Lambda | None; work runs in your Blender |
| Built-in diagram format | Yes, with light and dark SVG and PNG exports and a .tldr file | No | No | No |

For a one-off image or clip, a hosted app such as Runway or ChatGPT is faster and needs no install. Slopcamera fits when you expect to revise the result.

Competitor details as of 28 September 2026.

## What Slopcamera does not provide

- No hosted state. Without an account or project database there is no built-in sync, sharing, or multi-machine collaboration. Project state lives in local files you manage.
- No sandbox for trusted code. Native Python sources and caller-authored Bun workflows run with the current user's access, including potential network access. Hashes and receipts identify what ran; they do not confine it.
- Platform limits. New recording capture is absent from both the release and current CLI. Vectorization runs on macOS and Linux and deliberately rejects Windows. The hardware scene profiles require a qualified macOS graphics context.
- No promised pixels across machines. Native tools, codecs, GPU drivers, and provider models affect results, so retained source identity does not guarantee identical output elsewhere.
- Generated media needs review. Models can change subject identity, motion, or text, and a local budget estimate is not a provider-enforced spending cap.
- Bounded interchange. A GLB export carries a supported geometry and material subset; it does not turn a native rig into an editable scene.

The [capability reference](/docs/reference/capabilities) records the current platform and trust boundaries, [Extend Slopcamera](/docs/explanation/extending) covers the surfaces an agent builds on, and [run or recover a workflow](/docs/how-to/run-workflows) shows receipts and recovery in practice.
