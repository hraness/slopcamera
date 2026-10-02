# Notices

Slopcamera is an independent project and is not affiliated with or endorsed by
tldraw, Inc.

The runtime package does not include the tldraw SDK. It writes
the documented `.tldr` JSON interchange format so that users can import a
diagram into compatible tldraw software. The development test suite optionally
uses the upstream `tldraw` package to check compatibility; that package remains
under the [tldraw license](https://tldraw.dev/community/license).

tldraw and its associated marks are trademarks of tldraw, Inc.

Raster output uses
[`@resvg/resvg-js`](https://github.com/yisibl/resvg-js), distributed under the
Mozilla Public License 2.0. It is installed as a separate runtime dependency
and is not relicensed by this project.

Default diagram and caption typography uses the unmodified Nebula Sans Book
and Bold fonts, distributed under the SIL Open Font License 1.1. The npm
package retains the upstream license and provenance in
`src/assets/fonts/nebula-sans/`.

Raster-to-SVG conversion uses
[`VTracer`](https://github.com/visioncortex/vtracer), distributed under the MIT
License. The package does not bundle VTracer. On first use it downloads an
unmodified macOS or Linux platform archive from the official VTracer 0.6.4
GitHub release, verifies both archive and extracted binary SHA-256, and caches
the binary outside the package.

Raster decoding and fidelity measurement use
[`sharp`](https://github.com/lovell/sharp), distributed under the Apache
License 2.0. Sharp's prebuilt
[`libvips`](https://github.com/libvips/libvips) dependency is distributed under
the GNU Lesser General Public License 3.0 or later. Both remain separately
installed runtime dependencies and are not relicensed by this project.

Optional model-backed generation uses
[`@ai-sdk/gateway`](https://www.npmjs.com/package/@ai-sdk/gateway) and the
[`ai`](https://www.npmjs.com/package/ai) SDK. Prompts and referenced media are
sent to Vercel AI Gateway and the model provider selected by the caller, under
those services' terms. Slopcamera does not operate an intermediary generation
service.

The production `slopcamera.com` browser bundle includes
[`posthog-js`](https://github.com/PostHog/posthog-js), distributed under its
combined Apache License 2.0 and MIT terms. The fingerprinted bundle carries the
upstream license text generated from the exact locked package.

The complete local workflow host uses
[`Effect`](https://github.com/Effect-TS/effect), distributed under the MIT
License (Copyright 2023 Effectful Technologies Inc). It remains a separately
installed runtime dependency and is not relicensed by this project. Portable
workflow authoring and graph compilation do not load this runtime.

Icon scene composition and rendering use
[`@hraness/iconplace`](https://github.com/hraness/iconplace) 0.1.0, the
icon.place library, and soundtrack scores and beat grids use
[`@hraness/soundfish`](https://github.com/hraness/soundfish) 0.7.0. Both are
distributed under the MIT License and remain separately installed runtime
dependencies pinned to exact versions; neither is relicensed by this project.
The letterform outline data in `@hraness/iconplace/scene` and
`@hraness/iconplace/collections` is derived from Cormorant Garamond and
UnifrakturMaguntia and stays under the SIL Open Font License 1.1, as that
package's `THIRD_PARTY_NOTICES.md` and `licenses/` record.
Slopcamera imports their library entry points only and never runs their
commands. The Soundfish Agent Skill ships with `@hraness/soundfish`, not with
Slopcamera.

The bounded oil-paint technique adapts the physical-bristle, wet-film,
drying-clock, pigment-pile, and Kubelka–Munk ideas studied from
[`aliceisjustplaying/claude-paint`](https://github.com/aliceisjustplaying/claude-paint),
used under its MIT License (Copyright © aliceisjustplaying). Slopcamera's
TypeScript implementation is an independent reimplementation and does not
include that source tree.
