Claude Code can create diagrams, images, animations, and video through Slopcamera once two pieces are installed: the `slopcamera` command, which does the local media work, and the Slopcamera Agent Skill, which teaches Claude Code which operation to reach for.

You need Bun 1.3.14 or newer. Recording features need macOS; everything else runs on macOS, Linux, and Windows. No Slopcamera account exists, and nothing here asks for one.

## Install the CLI

```sh
{{ARCHIVE_INSTALL_COMMAND}}
```

Confirm the install:

```sh
{{DOCTOR_COMMAND}}
```

The doctor reports which parts of the multimedia engine are available on this machine: diagram and video editing always are; native engines such as Blender install separately.

## Install the Agent Skill for Claude Code

```sh
{{SKILL_INSTALL_COMMAND_CLAUDE}}
```

Start a new Claude Code session after installing. The skill loads version-matched guidance for choosing creative operations, so Claude Code knows to check a diagram before rendering it, to preview a cut before exporting it, and to keep sources editable.

## Try it

Ask Claude Code in a fresh session:

> Create a two-box diagram showing ingestion flowing into review, render it, and show me the dark PNG.

Claude Code should run `slopcamera diagram init`, edit the JSON source, run `slopcamera diagram check --strict`, then `slopcamera diagram render`, and open or report the resulting files. If it improvises with another tool instead, the skill did not load: start a new session or re-run the skill install.

## What Claude Code can do next

- Generate images, video clips, and narration through your own Vercel AI Gateway credential. See [generate media](/docs/how-to/generate-media).
- Edit footage and deliver multiple aspect ratios. See [edit video](/docs/how-to/edit-video).
- Direct spatial scenes and native films on a source build. See [spatial scenes](/docs/how-to/direct-scenes) and [native films](/docs/how-to/native-films).

## Troubleshooting

- **`slopcamera: command not found`**: the global Bun bin directory is not on your `PATH`, or the install ran in a different shell. Re-open the terminal and re-run `{{DOCTOR_COMMAND}}`.
- **The skill is not loading**: skills install per target. The Claude Code form installs to the Claude skills directory; the generic `{{SKILL_INSTALL_COMMAND}}` targets agents that read the `agents` convention. Run the command printed above, not the generic one.
- **Generation asks for a key**: model-backed operations use caller-owned Vercel AI Gateway access. Set `AI_GATEWAY_API_KEY`, or with a linked Vercel project use `vercel env run -- <command>` so the credential is injected for one command without being written to the project. This website never receives it.
