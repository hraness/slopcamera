Codex can create diagrams, images, animations, and video through Slopcamera once two pieces are installed: the `slopcamera` command, which does the local media work, and the Slopcamera Agent Skill, which teaches Codex which operation to reach for.

You need Bun 1.3.14 or newer on macOS, Linux, or Windows. A few features are narrower: vectorization and the native engines (Blender, CadQuery, and Manim) run on macOS and Linux, and the GPU scene profiles need macOS. Slopcamera edits recordings you already have; it does not record. There is no Slopcamera account.

## Install the CLI

```sh
{{ARCHIVE_INSTALL_COMMAND}}
```

Confirm the install:

```sh
{{DOCTOR_COMMAND}}
```

The doctor reports which parts of Slopcamera work on this machine. Diagrams need nothing more, video editing needs FFmpeg and FFprobe, and native engines such as Blender install separately.

## Install the Agent Skill for Codex

```sh
slopcamera skill install --target codex
```

Codex is the default target, so `slopcamera skill install` without `--target` does the same thing. A user-scope install writes `~/.codex/skills/slopcamera`, which every Codex session can read. To keep the skill inside one repository, run this at its root instead:

```sh
slopcamera skill install --target codex --scope project
```

That writes `.codex/skills/slopcamera` in the repository. Pass `--project <directory>` to name a different root without changing directories, or `--force` to replace an existing install. The Codex target ships the same `SKILL.md` and task references as every other target, plus an `agents/openai.yaml` interface file whose default prompt invokes `$slopcamera`.

Start a new Codex session after installing. The skill loads version-matched guidance for choosing creative operations, so Codex knows to check a diagram before rendering it, to preview a cut before exporting it, and to keep sources editable.

## Try it

Ask Codex in a fresh session:

> Create a two-box diagram showing ingestion flowing into review, render it, and show me the dark PNG.

Codex should run `slopcamera diagram init`, edit the JSON source, run `slopcamera diagram check --strict`, then `slopcamera diagram render`, and open or report the resulting files. If it improvises with another tool instead, the skill did not load; start a new session or re-run the install.

## What Codex can do next

- Generate images, video clips, and narration through your own Vercel AI Gateway credential; see [generate media](/docs/how-to/generate-media).
- Edit footage and deliver multiple aspect ratios; see [edit video](/docs/how-to/edit-video).
- Direct spatial scenes and native films with the released CLI; see [spatial scenes](/docs/how-to/direct-scenes) and [native films](/docs/how-to/native-films).
- Give Codex's MCP support fixed tools for diagrams, images, and scene inspection and planning; see [MCP clients](/docs/tutorials/mcp).

## Troubleshooting

- **`slopcamera: command not found`**: the global Bun bin directory is not on your `PATH`, or the install ran in a different shell. Re-open the terminal and re-run `{{DOCTOR_COMMAND}}`.
- **The skill is not loading**: skills install per target. The Codex form installs to a `.codex/skills` directory; `--target agents` is the generic convention and `--target claude` is Claude Code. Re-run the command above, not a different target, then start a new session.
- **Install reports a legacy `diagram` skill**: remove or move the old `diagram` directory inside the target's `skills` root, then re-run the install. Slopcamera will not place both skills side by side.
- **Generation asks for a key**: model-backed operations use caller-owned Vercel AI Gateway access. Set `AI_GATEWAY_API_KEY`, or with a linked Vercel project use `vercel env run -- <command>` so the credential is injected for one command without being written to the project. This website never receives it. For prompt-only images, `slopcamera credits topup` and `slopcamera credits wait` set up prepaid Hraness Credits instead; see [generate media](/docs/how-to/generate-media).
