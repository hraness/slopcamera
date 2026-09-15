A source checkout gives you the complete Slopcamera capability set: the portable SDK, the canonical `slopcamera` CLI, and the matching Agent Skill, all built from one recorded commit. If you only need the released command set, install the verified v{{PUBLISHED_VERSION}} archive instead and skip this page:

```sh
{{ARCHIVE_INSTALL_COMMAND}}
```

The rest of this page is the contributor path. You need Git and Bun 1.3.14 or newer.

## Check out the source and record the commit

Clone into a new directory, record the exact commit, and install its locked dependencies:

```sh
{{SOURCE_CHECKOUT_COMMAND}}
{{SOURCE_ENTER_COMMAND}}
git rev-parse HEAD > ../slopcamera-source-commit.txt
bun install --frozen-lockfile --ignore-scripts
```

Keep `slopcamera-source-commit.txt` with your work: the `main` branch can advance while a source build retains the same package version, so the recorded commit is what ties your outputs to exact source.

## Build the SDK and CLI

```sh
bun run build:sdk
bun run build:desktop:cli
```

These build the portable SDK and the source-backed CLI entrypoint at `apps/desktop/dist/cli/main.js`. They do not build a desktop application, provision a native engine, or run a scene.

To use the optional macOS menu-bar companion, build it explicitly and then launch it through the CLI:

```sh
cargo build --release --manifest-path desktop/menubar/Cargo.toml
slopcamera menubar
```

The companion is an unbundled status item. `slopcamera menubar install` can register it as a per-user LaunchAgent; it does not create, install, sign, or notarize an application bundle.

## Define the slopcamera command

In the shell you will work in, bind `slopcamera` to that exact checkout:

```sh
export SLOPCAMERA_SOURCE_ROOT="$PWD"
slopcamera() { bun "$SLOPCAMERA_SOURCE_ROOT/apps/desktop/dist/cli/main.js" "$@"; }
slopcamera --help
{{DOCTOR_COMMAND}}
```

The function works only in this shell. A program that launches a child process, such as Vercel, cannot execute a shell function; give it the built entrypoint instead:

```sh
vercel env run -- bun "$SLOPCAMERA_SOURCE_ROOT/apps/desktop/dist/cli/main.js" ai models list --type image --json
```

That example needs an already linked Vercel workspace, and its injected credentials belong to that one child invocation. [Generate images, video, and narration](/docs/how-to/generate-media) explains the credential model.

## Install the matching Agent Skill

The skill ships in the same checkout, so its guidance matches the CLI you built:

```sh
{{SOURCE_SKILL_COMMAND}}
# For Claude Code:
{{SOURCE_SKILL_COMMAND_CLAUDE}}
```

Omit `--target` for the Codex form. Start a new agent session after installing so the skill loads.

## Keep work outside the checkout

Create your production workspace outside the source tree and keep the shell open:

```sh
mkdir ../slopcamera-production
cd ../slopcamera-production
```

The function keeps using the built CLI while recordings, projects, and generated media land in the caller's working directory. Save the checkout path and the recorded commit so a later shell can restore the same function. Do not replace the checkout, its dependencies, or its generated build during an active durable run: resume checks the runtime identity.

## Install native tools separately

The portable source build provides no native engines, no operating-system capture permissions, and no GPU. Install only what your workflow needs: the [first native film tutorial](/docs/tutorials/first-native-film) uses a specific local Blender installation, and [author a native film](/docs/how-to/native-films) covers Blender, CadQuery, and Manim. The [capability reference](/docs/reference/capabilities) names each workflow's additional runtime requirements.

The repository maintains the canonical version of this procedure at `{{SOURCE_INSTALL_URL}}`.
