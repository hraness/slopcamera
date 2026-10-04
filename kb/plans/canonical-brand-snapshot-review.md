---
type: plan
title: Canonical SlopCamera snapshot review
description: Review the exact support-anchor and legacy-identity fingerprint changes required by canonical SlopCamera branding without relaxing standalone boundaries.
area: product-identity
status: in-progress
repository_scopes:
  - scripts/standalone-support-fixture.ts
  - scripts/standalone-support-fixture.test.ts
  - scripts/legacy-identity.inventory.json
  - scripts/legacy-identity.ts
  - apps/web/scripts/site-support-profile.ts
  - src/style-portfolio-branding.test.ts
  - package.json
  - apps/web/package.json
  - scripts/check-standalone.ts
---

# Canonical SlopCamera snapshot review

## Outcome and authorization

Approve or reject a finite snapshot update for the canonical `SlopCamera` display name while preserving standalone security, compatibility, and historical evidence. Preparing this proposal did not authorize applying its hashes. After preparation, the owner authorized implementation and main delivery; the bounded implementation decision and remaining acceptance conditions are recorded below.

The branding work uses the portfolio registry's `messaging.names.name`. Commands, domains, packages, application paths, operation codes, and exported API names retain their technical spellings. The [[notes/repository-seams|repository seams]] note explains why public copy cannot acquire Accounts or suite-auth authority.

## Evidence and current status

Evidence collected on 2026-10-04 against SlopCamera source baseline `8310399403fdbbf69f97e0754fe46d5804c5605a`:

- The full `bun run check` stops at `check:standalone`. It reports changed legacy-identity fingerprints and hosted-account references in generated ordinary HTML.
- `standaloneSupportFixtureScanText` admits one exact inert support anchor inside one registered page's footer. Its SHA-256 includes the product's accessible name. The generated anchor differs from the admitted anchor only in `Support Slopcamera:` becoming `Support SlopCamera:`. The href, attributes, SVG, placement, and single-host-occurrence constraint are unchanged.
- After restoring accidentally recased SDK identifiers, 25 source inventory rows differ only by the canonical display name on their identity-bearing lines. Their identity-line counts, legacy occurrence counts, URLs, and checked technical-reference counts remain unchanged. The source SDK reference no longer needs an inventory-row update.
- One generated CLI row also differs. Its counts and checked technical references remain unchanged, but its identity-bearing bytes do not become equal after replacing only the public name. Treat that row as requiring rebuild and artifact review, not as a proved casing-only change.
- The focused branding regression passes: 3 tests, 196 assertions. It checks the canonical display name and preserves `SlopcameraOverlay`, `executeSlopcameraOperation`, `createSlopcameraCodeHost`, `defineSlopcameraWorkflow`, and `runSlopcameraWorkflow`. The new checks failed before the documentation corrections and pass afterward.
- The complete Jungle/Hraness affected gate and the design-kit check passed during the portfolio task. These results do not certify the blocked SlopCamera aggregate gate or any deployment.
- The normal site builder regenerated 105 static files after the technical-name corrections. Generated documentation no longer contains the recased API identifiers. The proposal's 26 fingerprint rows match the independently recomputed JSON evidence, and the protected-file receipts still match `HEAD`.
- Bounded percolation returned no candidates. The knowledge-base refresh, graph check, and agent-guide check passed. Six existing unrelated orphan advisories remain; this proposal has a contextual link to the repository-seams note.

### Companion copy-contract review

The root `package.json` description, `apps/web/package.json` description, and exact assertion in `scripts/check-standalone.ts` used `Slopcamera` during proposal preparation. They now use `SlopCamera` in separately reviewed commit `eb2fd1c`; the rest of each sentence and every security condition remain unchanged. The focused branding regression also checks both package names and descriptions.

The local read-only evidence collector is `artifacts/portfolio-brand-snapshot-review.ts`; its JSON output is `artifacts/portfolio-brand-snapshot-review.json`. It uses `legacyIdentitySnapshot`, validates the existing inventory, reads exact `HEAD` blobs, and asserts that the protected files match `HEAD`. Those ignored artifacts are reproducibility aids, not approval records. The tables below preserve the proposed values in this authored plan.

### Protected-file receipts

These files matched the baseline byte-for-byte when evidence was collected:

| File | SHA-256 |
| --- | --- |
| `scripts/standalone-support-fixture.ts` | `0da3546c1fd3927f2a60c0dc562259c2122a064ea4cceb960114256ef62e99f2` |
| `scripts/legacy-identity.inventory.json` | `52bb89820704cd405d19cf20dd66d383e0b5af18553d7222ba301807777ecad0` |
| `apps/web/scripts/site-support-profile.ts` | `747c9c7b888e2b1c74b89b6cc57455e179c1537a9d5635cb123f1dac579f26b5` |

## Scope and constraints

- Review only the exact support-anchor fingerprint and the existing inventory rows listed below. Keep inventory categories and counts unchanged. Do not add, remove, or broadly exempt paths.
- Keep `FORBIDDEN_SOURCE`, URL admission, registered-page selection, single-anchor and single-footer checks, footer containment, exact anchor serialization, and the single hosted-domain occurrence check intact. Do not permit another account endpoint, service, client, SDK edge, or executable attribute.
- Keep the technical href exactly `https://account.hraness.com/support?product=slopcamera&source=web#support`.
- Preserve `slopcamera`, `@hraness/slopcamera`, `slopcamera.com`, `Application Support/Slopcamera`, the existing SDK API names, and legacy serialized identifiers. A comparison that normalizes display names is evidence only; production source and the gate must not normalize arbitrary identifiers.
- Keep immutable baseline revisions, trees, profiles, and historical digests unchanged. Do not update `supportFooterDigests.current` as part of this proposal without establishing its intended digest projection separately.
- Do not change package pins, lockfiles, CSP, analytics, resource admission, browser custody, release authority, provider configuration, or runtime behavior to obtain a passing gate.
- Do not infer acceptance of the generated CLI or the whole file from equal counts. Compare reviewed source and rebuild provenance as well.

### Support-anchor fingerprint

| Field | Existing | Proposed for review |
| --- | --- | --- |
| Accessible name | `Support Slopcamera: optional paid membership` | `Support SlopCamera: optional paid membership` |
| Anchor SHA-256 | `c5a8e1d1c1f784a3e6bd39b8a17ae278754abe8001867de22158242c27a728e1` | `adae6044526659befa5e434b4cf34b09a7c09f8bda0653a202eb5878b349ef23` |

The independent fixture must continue to reject duplicate anchors, another page or product, another host or endpoint, an anchor outside the footer, altered SVG or visible text, and executable attributes. Add explicit rejection of the superseded `Slopcamera` accessible label after any approved refresh.

The raw generated whole-footer SHA-256 is `a997bb9a2c9f615e154447c6138c2a092810fbeb97c1b0f54f2aee32655539ea`; the retained current-profile digest is `8f31cda655ff9366efc76ab57600b927828164e071aa76009c11ba731166e0ed`. Replacing the new anchor with the old anchor does not produce that retained digest. This is an unresolved projection or historical-profile question, not authorization to replace the whole-footer digest.

### Legacy-identity fingerprints

Every listed row retains its existing categories, identity-line count, and occurrence count. `L/O` gives those unchanged counts. The 25 source rows have casing-only changes on their identity-bearing lines. The generated row is not approved by that comparison.

| Existing path | L/O | Existing identity-lines SHA-256 | Proposed identity-lines SHA-256 |
| --- | --- | --- | --- |
| `README.md` | 6/8 | `7795e936e7fcf85e84da01cd4f52944825b09c88dd3ea7b483d457b099a005b3` | `1cfd91c6127c0aa7bee042e4c31cff5889c7d17e9bcaf5044696e941786230ca` |
| `apps/web/src/agent-pages.ts` | 3/3 | `b0c0e69ba7a2ed67cbe0c192d79c6f42bbabad580ee34658b3f9b0b8c0fbca10` | `59bb8b9a5226f8614d7b273c09e42a908217ee7e40b549630efe60a4cdd25fe6` |
| `apps/web/src/blog-registry.ts` | 3/3 | `47ab62a69f9ae978068dfc2effcd82807ffc53b8979e473332e9c2b0740a47bf` | `c6e7b41d61058c9c78e323585cfdd537605311ab022f4afb3d2e79c8e4f9080a` |
| `apps/web/src/blog/headless-blender-manim-cadquery-for-agents.md` | 18/23 | `ce2d5ba359c98be88437e4b40e6b7f9c73746babcd44f684731279c8196d5160` | `c627dd3e83ac91331c11647eef0a0bd4df65b178e4a7caed91bd78605701d5d7` |
| `apps/web/src/docs/explanation/extending.md` | 3/3 | `3405e0ff935ea99c06d1fa9e5fee0e9c5d13565d748c2e70465e8eb12df5d6cc` | `860e47b87565eacc7e94835e60a525cd6e1afa172f2dd532f0c5696113caa638` |
| `apps/web/src/docs/explanation/remotion-alternatives-for-coding-agents.md` | 3/3 | `d03f30b0a683af0d945a38d149c6211dd1643eaa5f0c2748f475c0bd97a577cd` | `801038a9b580316aca04ce3bf3011e869b4706a7fba0b974685ef30df56e005d` |
| `apps/web/src/docs/explanation/slopcamera-vs-hyperframes.md` | 1/1 | `cc94474d205d5ba5c0cdbda8028447bff45ce6516768a733a49e1d1e82baae2e` | `c00189fe8ffccdeb8a5bb9dace68f1f0117c25fa620fbd9242e16529b9578a31` |
| `apps/web/src/docs/explanation/slopcamera-vs-remotion.md` | 1/1 | `8df26ad1255c6eea13182b6ac5b77cdefca21b835f62b25278c3a15f6236e453` | `72cd318fbb53a7731b89e6f92fd0f95133e78132052dd349cdc4180977d68ad4` |
| `apps/web/src/docs/how-to/edit-video.md` | 2/2 | `1ebabacd7dc8b7784ee41d67f787eebb78f778aeea3fe565ded6579320b51895` | `373b805b91ad6ad5635aca72a375ffac7144f970dfa0a35ab3e2d81a5b80a23d` |
| `apps/web/src/docs/how-to/native-films.md` | 27/38 | `42fdd84a05a488d4bd69b8e852d90df169956e70018b71c0693c0075e1b32b28` | `0084bffa3e2c5727d3729d79ab63ceb1d5f91cf915de0e045c497b32330a5e84` |
| `apps/web/src/docs/how-to/remix-the-showcase.md` | 7/8 | `9c75304f1b9c98d194c61ac04cce9f47597ae1fedce68986acaabb6f7fa9bd00` | `3a36fca48e7c10aef4ccd3adb88f7ca1ab7ae468aa8dea743880c903ca005a02` |
| `apps/web/src/docs/how-to/run-workflows.md` | 3/6 | `787d039bf832245360bcca7498f2c5227c655633b5910422ee2e2171377264e3` | `7f38a3235c9ef897ecb50eb0ec6a5a274d4a9aeaa770eea6b35667750f1d9c53` |
| `apps/web/src/docs/how-to/web-ready-3d-assets.md` | 8/9 | `4e12e2ca2d80585a3e67c5e0d12ff1721fe05078389604de70eddcedcc3b73c4` | `425f15c64ad3de0c712e1676de1d87d6e43fa2bd2e4319d6bb2bcc0732fcb64e` |
| `apps/web/src/docs/index.md` | 1/1 | `21e9f02c679f0a348d5d1944b752a62919ee00ff6c956e6735aa1e6adb340a41` | `3e8f823eefb42fdc61f0306470b45a18fdf9495ef9bc965a52bdc39bebdbe35c` |
| `apps/web/src/docs/reference/mcp-tools.md` | 1/1 | `c6ccc5728b4ade49c2d892e4ae43b3a192f695009e3c0b38cadc8d14b9a3c060` | `0b4ef40b442a7b0c6bf75045958c671362066c088a733b632209caea616bb9de` |
| `apps/web/src/docs/reference/native-engines.md` | 13/18 | `cbf63ab9cfa1a2dfc457286eb3c40e96a37677f5a2caf87de9b2ce32e61aafcb` | `57fd2032cea9be0450eb0f4d474621fb30aea488187749bada7ac372601f2986` |
| `apps/web/src/docs/reference/video-pipeline.md` | 1/1 | `6f61e17ba3e3d098cfed3ce0426f921ad50fbb749bccd8a9d95ff2264ab5c437` | `6eec2bfbb02076d0c26fab70ddef2a94943c34d184cbf8e6295d1669fe7b6d76` |
| `apps/web/src/docs/tutorials/first-native-film.md` | 11/15 | `db82e07fe3261d98eb8e0cc7dc27c8edef582e1ce66b056ba0d191f7c81225c6` | `2178e970bab39aa8d5e46cf23d4f906dee0bd5ffe71485db984ae59f3d91d76b` |
| `apps/web/src/portfolio-messaging.generated.json` | 6/6 | `362c0ad7f241336348cfbdf8bbc83e22937a5008e3b5a12276c999a26ce1edaa` | `1f7625cf63d5fd0fb2a1b5b22cdb8fef2d39e4f1e9fc1c5d24f4ba7f07519ec9` |
| `apps/web/src/preview.html` | 1/1 | `34d9ca5419f153d5875fe32c036092482f155c7a1c36a8d9f7ed58893783325e` | `96583e01770dbabc5e15b616f39f99d88f1611bec14f1cd1358cb94486036c85` |
| `docs/README.md` | 2/2 | `06c99b6e86aff27b377e790181ea615f22dc6e62459a6cc655b284d3020b4906` | `8adfc1776ed70eaf4dedbf250d8ce21b64d8f30e3028913fb53b8c1e10c3ca81` |
| `docs/how-to/remix-the-showcase.md` | 7/8 | `19e6a9bd0a9a6c88c40d27e2bd360a5621aed45658ea36811af0c272c60895a2` | `31f5d7aaf80c8984bd5a5ec771f5271d025244e811bd15192d4e2a8412c2883b` |
| `docs/how-to/web-ready-3d-assets.md` | 9/11 | `d06cc5a98fa1fbbc7a4b3ef2eab6edea829b9a59b0c2e1215752879f8dcf39ea` | `b0b06f412120beaeb6f2c38b0d2c91e431cb2e413b90427a73a8c5e96e1926b3` |
| `docs/studio.md` | 41/55 | `1b120c43b71ca3bf2690ba15e07d3cedc1f19481d366610d879fdcae40dc0817` | `9e936607c45256d98658949c62b19fa7eed1e7db4220d1a181d675b3746fb3d8` |
| `docs/tutorials/first-native-film.md` | 12/16 | `75b6b9e1deed8b5be93162f764813e40a1073342f3b2b61d49f10f8a9ee1359d` | `2e055a66fc7c83c0eca02405b7e7676f30f333908e217a8fb77c09e1090b809f` |
| `apps/desktop/dist/cli/main.js` (generated; separately reviewed) | 85/475 | `241e99af0b0125a659513342f7940a9e74cf5f690c2acf5747da11b156b1f05a` | `f4faddb7bb2793b279ab25438d471ba1dc27295170a389d1dc1a554e1048be57` |

## Ordered review and implementation gates

1. **Review source facts.** Recompute every listed row from the candidate tree using `legacyIdentitySnapshot`. Confirm the old SHA against the exact baseline blob, unchanged categories and counts, unchanged technical references, and the named public-copy diff. Rebuild ordinary site artifacts from source after the SDK documentation corrections; never patch sealed HTML.
2. **Review the generated CLI separately.** Bind its build to Bun 1.3.14, the unchanged lockfile, and reviewed task-owned source. Rebuild with the normal CLI builder and compare the generated artifact. Require CLI contract tests, typecheck, lint, and artifact provenance before accepting its row. Equal counts do not close this gate.
3. **Review anchor admission.** Reproduce byte equality between the current anchor and the old fixture with only the accessible label replaced. Require the same technical href, one anchor within one registered footer, exactly one host occurrence, no visible text or executable attributes, and all existing hostile counterexamples.
4. **Record an explicit review decision.** Name the reviewer and accepted candidate tree. Approve the finite values, reject them, or require discovery. No change to a protected snapshot occurs before this decision.
5. **Apply only approved snapshot data in a separate change.** Refresh the exact anchor digest and its fixture, and edit reviewed source-inventory rows explicitly. The existing updater refuses changed source rows; do not modify that refusal. Let the normal updater handle the approved generated row only after source review. Leave historical profiles and unrelated digests intact.
6. **Run the complete gate.** The separately reviewed change must pass `check:standalone` before and after the SDK, desktop, API, web, and package checks in `bun run check`. Report source, provider, and public delivery states separately.

## Verification

Focused source and admission checks, from the repository root:

```sh
bun test src/style-portfolio-branding.test.ts scripts/standalone-support-fixture.test.ts scripts/legacy-identity.test.ts
bun run check:standalone
```

Use the installed `host-run` scheduler for broad builds and checks. The normal full package gate is `bun run check`; do not skip its standalone checks. Browser lanes use pinned Chrome for Testing and preserve graceful cleanup. Do not start installed Chrome or override resource admission.

Approval requires all of the following:

- The accepted support anchor has the canonical accessible label and the unchanged technical target. The old label and every existing hostile variant fail admission.
- Only approved inventory rows change. Path sets, categories, line counts, occurrence counts, technical identifiers, and compatibility behavior remain unchanged.
- The generated CLI's separate provenance and review gate passes.
- The regenerated docs show the actual exported SDK names, with the focused regression passing.
- All full-package checks pass on the exact accepted tree; a focused browser or SDK run alone is insufficient.

## Risks and recovery

A broad digest refresh could conceal a runtime change or a compatibility rename. Reject any candidate that changes more than the reviewed facts, and investigate generated artifacts before updating their fingerprints. A raw digest from another projection or historical profile is not interchangeable with an admission fingerprint.

If review rejects a candidate, leave the existing guards and snapshots intact and keep the full check blocked. If an applied snapshot later fails validation, correct the reviewed source or snapshot in the separate change and rerun the complete gate. Do not reset another task's worktree, rewrite history, or replace historical baseline receipts.

## Review decision

On 2026-10-04, the owner requested implementation and delivery to main after receiving this proposal. Devin (AI) reviewed the source evidence and accepted only the 25 source-row fingerprints and exact support-anchor fingerprint listed above. The accepted source candidate is bound by those finite proposed hashes, unchanged categories and counts, and the canonical-name/technical-identifier regression. This decision does not imply human byte-level review or acceptance of an unreviewed generated artifact.

The source rows and anchor fixture are updated to those reviewed values; no path, category, URL, host, footer constraint, policy, historical receipt, or exemption changed. The fixture accepts the canonical label and rejects the superseded label plus all existing hostile examples. The focused branding and fixture run passed 5 tests with 228 assertions. A subsequent standalone scan reports only the generated CLI identity row.

Devin (AI) separately accepted the generated CLI row after a fresh normal `bun run build:desktop:cli` with Bun 1.3.14 and the unchanged lockfile reproduced artifact SHA-256 `8ffc34ca6fc3cee08f9f572b99b154541685edd4da22265660f9b31a745250ba` from baseline artifact SHA-256 `e144ae8c3d82e442bbdbc1510547611e03b7df25cdcac070103addc1f83fa62f`. The read-only `artifacts/review-branding-cli.ts` comparison pins baseline `8310399403fdbbf69f97e0754fe46d5804c5605a`, verifies 15 changed source files differ only in public-name tokens, and verifies unchanged technical identifiers. After normalizing only those literal tokens and scope-resolved compiler-renamed local bindings, both complete ASTs contain 38,732 bindings and have identical SHA-256 `27590540ce0a7c08914faa2fa8a3dbb06e29c34a4bae20cd1dd597be64c438bc`. The generated row retains 85 identity-bearing lines, 475 occurrences, its path, and its generated category. Earlier focused CLI contracts, typecheck, lint, and build passed; the rebuild and independent AST comparison close the separate artifact-review condition.

Full-package acceptance and main delivery remain pending the complete required gates on the integrated candidate. The historical footer-profile digest remains untouched.
