# Slopcamera web

`slopcamera.com` is the static public site and documentation for Slopcamera. It
presents the agent-directed media studio, SDK, Bun CLI, and local media runtime without
adding a server, account surface, API route, remote font, or browser credential path.
Agents can read `/llms.txt` and request `Accept: text/markdown` on the homepage.
Generation runs from the local Slopcamera SDK or CLI with the operator's Vercel AI
Gateway access. The CLI edits authored media and existing recording bundles; it
does not provide a new-recording capture command. `/docs` serves the site's static
tutorials, task guides, reference, and explanations. The landing page starts with the verified release
archive and its matching Agent Skill. A source-build disclosure links the complete
guide for source-only capabilities and development. The old Atet archive remains
historical evidence and is never advertised as a Slopcamera installer.

Code examples use the shared syntax highlighter, follow the active theme, and
retain their original lines in keyboard-scrollable blocks. The four interface
examples stack into readable rows. The hero shows an actual native product film,
and the workflow gallery and documentation embed reviewed local media. Each
example binds retained source, measured artifacts, runtime requirements, and a
guide. Native video controls work without JavaScript. Documentation clips start
manually; eligible homepage previews respect visibility, explicit pause, reduced
motion, and data-saving preferences.

```sh
bun run check
```

The build fingerprints the local stylesheet and appearance script, renders the
registered documentation, and copies the explicit site and example-asset
allowlists into `dist/`. The closed example registry checks media hashes, byte
budgets, metadata, review state, and visible guide references. From the repository
root, `bun run check:web` also checks each retained source file against its
registered hash before running the standalone site's checks. A configured Vercel Production
build also bundles the pinned PostHog client as a fingerprinted local asset.
That client sends one anonymous cookieless pageview from `https://slopcamera.com/` and
does not run on Preview, alternate hosts, or the not-found page. Configure the
Vercel project with this directory as its Root Directory. The checked
`vercel.json` installs from this directory's frozen Bun lockfile without relying
on the parent workspace catalog, serves only built files under a strict CSP,
and redirects `atet.sh` and the reviewed predecessor hosts
directly to `https://slopcamera.com` with their paths preserved. Provider domain
attachment and production acceptance are separate deployment steps.

The web favicon and touch icon use the reviewed public 📸 PNG derivatives, checked by `bun run check:icons` and the build. Their source hashes and exact output inventory live in `scripts/public-identity.ts`. The original desktop SVG and its historical render evidence remain separate; the website no longer regenerates those assets.
