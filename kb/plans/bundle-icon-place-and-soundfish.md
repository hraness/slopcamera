---
type: plan
title: Bundle icon.place and Soundfish
description: Planned Stage 2 integration that adds exact-version icon.place and Soundfish npm packages to SlopCamera as closed icon and soundtrack operations. Both packages are published.
area: media-suite
status: planned
repository_scopes:
  - package.json
  - src
  - apps/desktop/cli
  - skills/slopcamera
  - scripts
tags:
  - iconplace
  - soundfish
---

# Bundle icon.place and Soundfish

## Outcome

SlopCamera ships icon.place drawing and Soundfish scoring as fixed, typed operations under SlopCamera names. An agent can compose and render a vector icon scene with icon.place, and derive a beat grid and section cues from a Soundfish loop or song to drive music-video timing. Neither package is spawned as a subprocess, and neither brand appears in SlopCamera's operation codes or serialized identifiers.

## Status

Planned and unblocked. Both npm releases are out as of 2026-09-29:

- `@hraness/iconplace` 0.1.0: the first public release of the icon.place construction, scene and collection library, MIT-licensed. npm rejected the unscoped name `iconplace` as too similar to the unrelated `icon.place` package, so the package is scoped; its command is still `iconplace`. Later versions publish from hraness/iconplace through npm trusted publishing.
- `@hraness/soundfish` 0.7.0: the first release with library `exports` (protocol, MIDI and beat grid), Node compatibility and an MIT license that permits bundling. 0.6.0 and earlier are `bin`-only and must not be pinned.

Each dependency is admitted through the repository's normal dependency review before it lands.

## Context

This is Stage 2 of the Hraness media-suite packaging plan. Stage 0 holds the owner decisions: the icon.place license and npm name, the Soundfish relicense, and whether SlopCamera accepts dependencies with non-SlopCamera names. Stage 1 publishes the two packages from their own repositories.

SlopCamera already overlaps both products:

- `src/icon.ts`, `src/icon-set.ts` and the built-in `src/icons.ts` generate and vectorize icons through `slopcamera image icon|vectorize`.
- The music-video reference (`skills/slopcamera/references/music-video.md`) takes a local track with a user-supplied `bpm`, `beatOffsetUs` and `beatsPerBar`. The first version does not detect tempo, downbeats or duration. A Soundfish beat grid fills that gap.

ALGAL is the precedent for an external Hraness package: `@hraness/algal` is pinned to an immutable commit and wrapped behind the closed behavior-bake contract in [[plans/algal-character-behaviors]].

## Scope

- Exact-version dependencies in the root `package.json`: `@hraness/iconplace` at one pinned version, 0.1.0 or later, and `@hraness/soundfish` at one pinned version, 0.7.0 or later. No ranges, no `github:` pins to private repositories, and no sibling paths.
- Four closed operations in `src/operations.ts`, with receipts:
  - `slopcamera.icon.compose`: parse and solve a bounded icon.place scene or construction program and return the solved scene with its digest.
  - `slopcamera.icon.render`: render a solved scene or replay a recipe to inert SVG through icon.place `renderScene` and `replayRecipe`.
  - `slopcamera.soundtrack.compose`: parse and verify a Soundfish loop or song document through the Soundfish protocol library and return its canonical digest.
  - `slopcamera.soundtrack.grid`: derive `bpm`, `beatOffsetUs`, `beatsPerBar` and section cue times from a Soundfish document or MIDI file, in the shape the music-video render input already accepts.
- Matching MCP tools in `src/mcp/tools.ts`, bounded like the existing diagram tools: source bytes, shapes, events, sections and output bytes are capped before execution.
- CLI verbs under the existing namespaces, such as `slopcamera image icon compose|render` and a soundtrack verb under the media surface. The exact verbs are decided in the design review, because the canonical namespace list in `AGENTS.md` changes with them.
- Skill references: a new `skills/slopcamera/references/icon-place.md` and `skills/slopcamera/references/soundtracks.md`, plus links from `SKILL.md`, `customization.md` and `music-video.md`. The Soundfish Agent Skill is not bundled; the references tell users to install `@hraness/soundfish` for its own skill.
- `scripts/copy-facts.ts` rules for the new operation and tool counts, and every public surface that states those counts, updated in the same change.

## Non-goals

- Audio rendering. The published Soundfish CLI cannot render WAV, and the sound bank is not public. Music videos keep using a user-supplied audio file.
- Bundling the icon.place web app, its vendored icon sets, or its concept taxonomy.
- Running icon.place's in-browser model providers or its ALGAL lab modules inside SlopCamera.
- A plugin or open operation-registration hook.

## Policy amendments

These rule changes go through review in the same pull request as the dependencies:

- `AGENTS.md`, the single self-contained product identity rule: allow named, exact-version external Hraness libraries behind SlopCamera-named operations, while public APIs, serialized identifiers and operation codes keep only SlopCamera names.
- `AGENTS.md`, the canonical CLI namespace list: add the chosen icon and soundtrack verbs.
- `AGENTS.md`, the rule that external Hraness packages come only from reviewed immutable release tags or commits: state that exact npm versions with verified registry integrity count as immutable releases for public packages.
- `skills/slopcamera/references/customization.md`: keep the "write a small local adapter" rule for third-party icon packages, and name icon.place as the one built-in icon library.
- `STYLE.md` needs no change. Product names follow the portfolio registry: icon.place and Soundfish.

## Work, in dependency order

1. Confirm both packages are published, record the exact versions and registry integrity, and read their licenses and exported types.
2. Land the policy amendments and the operation contracts (types and schemas only) for review.
3. Add the pinned dependencies and update `bun.lock`.
4. Implement the four operations with receipts, then the MCP tools and CLI verbs.
5. Add the skill references and update the music-video reference to accept a Soundfish grid.
6. Update `scripts/copy-facts.ts`, the README, `docs/` and `apps/web/src/docs/` together.
7. Run `bun run check`, `bun run check:copy` and `bun run test:package`, then release through the normal tag workflow.

## Verification

- Property tests for grid derivation: monotonic cue times, a beat offset inside one beat, and stable output for the same document.
- Round-trip tests: compose then render gives the same SVG digest for the same scene, and a replayed recipe matches its source.
- `scripts/package-smoke.ts` installs the packed package with npm and Bun and runs one icon and one soundtrack operation offline.
- The packed tarball stays within the existing size limits, and no Soundfish skill or license-restricted file enters it.

## Risks

- Package size and install time grow with two more dependencies.
- The fixed-registry and "no shell commands" rules rule out spawning either `bin`; if a needed function is only reachable through a CLI, the owning package must export it first.
- Release PR #276 (3.7.0) and any later release change the same manifests; rebase onto the current release before adding pins.

## Recovery

Each step is additive. Reverting the dependency pull request removes the operations, tools, verbs and references together, and no stored project format changes, so existing projects keep working.
