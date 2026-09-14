An agent that produces visual work eventually has to answer two questions: what did it make, and what can still be changed. Slopcamera keeps both answers on the local machine as inspectable state. The source that owns each creative decision stays editable next to its exports, and important operations leave receipts that name their inputs and outputs.

## Sources stay editable after the render

A render produces derivatives; it does not consume its source. A diagram keeps its version-one JSON document beside the five files a render exports. A spatial scene keeps named entities and calibrated cameras as typed data an agent can patch by ID. A native bundle keeps its Blender, CadQuery, or Manim program. A video project records cuts, timing, framing, captions, and effects as decisions, so preview and final renders evaluate the same timeline and composition.

The difference shows up on the second request. A PNG does not record the JSON it was rendered from, and an exported MP4 does not preserve the edit plan that produced it. When an agent assembles one-off scripts, those relationships live in a transcript, if anywhere. In Slopcamera they are the retained state, so revising a label means editing the diagram source and re-rendering it, as in the [first-diagram tutorial](/docs/tutorials/first-diagram), rather than producing a new image that has lost its connection to the source.

## One project model carries the evidence

Ordinary projects keep the current edit plan alongside original media, analysis, and derived outputs. One project is immutable source plus explicit revisions, candidates, selections, and delivery variants that refer to the same inputs. Plans bind declared inputs before effects run, the durable scheduler admits work under resource claims and retains custody until processes settle, and completed work is reused only when its input, tool, and receipt identities still match.

That gives the agent a verifiable trail instead of a log to trust. A failed or interrupted attempt leaves its exact evidence for inspection and reconciliation; recovery re-checks the attempt rather than assuming a timeout meant nothing ran. A receipt proves a recorded operation and the identities involved, not visual quality. A successful plan or schema check still does not replace inspecting the result.

## Execution and credentials stay local

There is no Slopcamera account, hosted project database, or browser generation service. Ordinary editing and rendering run on the machine in front of the agent, and the durable state is ordinary files under your control.

Model-backed work is opt-in per invocation. Image, video, speech, and transcription generation use the caller's own Vercel AI Gateway access, read from the local process environment and never persisted as project data. Uploading named local media requires an explicit acknowledgement on that invocation, `--allow-cloud-upload` for image and video and `--allow-cloud-audio-upload` for transcription. Discovering a model, paying for a result, and rendering retained bytes are distinct operations with distinct receipts.

## Fixed interfaces an agent can inspect

An agent does not have to guess the local contract. `slopcamera --help` prints the grammar, `{{DOCTOR_COMMAND}}` reports installed tools and readiness, `slopcamera operations list --json` enumerates the closed operation registry with its input schemas, and `slopcamera html catalog` lists the admitted HTML profiles. The version-matched Agent Skill routes the agent to the reference for each kind of job, SDK entrypoints select a typed capability boundary, and the MCP server publishes a fixed, bounded toolset.

Properties a per-task script would have to reimplement, such as absolute-time rendering, declared assets, resource admission, bounded inputs, and provenance receipts, are host invariants here. They apply to every operation the same way, and they leave evidence the next operation can check. The [architecture explanation](/docs/explanation/architecture) develops this source, representation, and project model.

## What Slopcamera does not provide

- No hosted state. Without an account or project database there is no built-in sync, sharing, or multi-machine collaboration. Project state lives in local files you manage.
- No sandbox for trusted code. Native Python sources and caller-authored Bun workflows run with the current user's access, including potential network access. Hashes and receipts identify what ran; they do not confine it.
- Platform limits. Screen, camera, microphone, and system-audio recording is macOS-specific. Vectorization runs on macOS and Linux and deliberately rejects Windows. The hardware scene profiles require a qualified macOS graphics context.
- No promised pixels across machines. Native tools, codecs, GPU drivers, and provider models affect results, so retained source identity does not guarantee identical output elsewhere.
- Generated media needs review. Models can change subject identity, motion, or text, and a local budget estimate is not a provider-enforced spending cap.
- Bounded interchange. A GLB export carries a supported geometry and material subset; it does not turn a native rig into an editable scene.

The [capability reference](/docs/reference/capabilities) records the current platform and trust boundaries, [Extend Slopcamera](/docs/explanation/extending) covers the surfaces an agent builds on, and [run or recover a workflow](/docs/how-to/run-workflows) shows receipts and recovery in practice.
