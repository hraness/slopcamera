---
type: plan
area: product-presentation
status: in-progress
---

# Slopcamera studio relaunch

## Outcome and authority

Rebuild the public introduction around finished multimedia work, useful creative direction, and reproducible revisions. The user approved the six-part proposal and requested parallel production, finely detailed independent review, and delivery through the repository workflow. Inspiration is Impeccable's visible results and useful directing vocabulary; Slopcamera keeps its own multimedia purpose and identity.

Primary audience: people using coding agents who want to create and refine films, illustrations, visual explanations, and edits. Proposed promise: “A multimedia studio for your coding agent.” Public capability claims must match the released CLI and checked examples. Do not claim token or cost savings.

## Ownership and constraints

Integration owner: `/root`; branch `feat/studio-relaunch`, starting at `ba93c5e` on current main. All workers share this isolated tree. Preserve the original checkout and unrelated work. Root owns manifests, lockfiles, media and docs registries, documentation, public copy, plan state, commits, CI, merge, deployment, and final verification.

- `/root/rain_film`: `examples/showcase/studio-relaunch/rain-bottled/`; original 3D film source, audio, production evidence.
- `/root/motion_films`: `examples/showcase/studio-relaunch/last-tram/` and `paper-ocean/`; original illustrated films, revision variants, audio, production evidence.
- `/root/slopcamera_docs_audit`: homepage structure, site CSS, gallery interaction, and related focused tests after direction is fixed.
- Independent reviewers receive the complete artifacts and acceptance criteria; authors do not certify their own artistic success.

Generated masters and private production receipts stay under ignored `artifacts/studio-relaunch/`. Public admitted media uses the existing media registry and content-addressed publication path. Preserve audio truth, source hashes, output limits, browser identity/custody, resource scheduling, accessibility, and deployment controls. New source examples must state whether they are available from the released package or require a repository checkout.

## Phases

### 1. Creative and technical spikes — complete

Establish one product brief, a concrete site direction, hardest-shot tests, output contracts, and current runtime/deployment requirements. Three disjoint investigations may run in parallel.

Acceptance: strongest shot and sound design are specified for each first production; prerequisites are observed; no unsupported capability, cost, or speed claim enters public copy. A motion prototype and native hardest frame must pass visual review before long renders.

### 2. Flagship production — complete

Produce Rain, bottled; Last tram to the moon; and An ocean folded from paper. Each must tell a short complete story, have intentional sound, excellent representative stills, editable source, and one consequential documented revision. Web previews meet the repository limits; retain suitable masters separately. Native and browser rendering have separate owners and follow host scheduling.

Acceptance: inspect beginning, reveal, ending, motion continuity, materials, typography, audio, and full playback. Record actual listening accurately. Independent creative review may reject and replace weak work. Sources and render instructions reproduce the admitted outputs.

### 3. Site and learning journey — in progress

Once the first visual proof exists, site and documentation may run in parallel with remaining films. Replace the homepage's technique inventory with a large film, curated range, an actual original/revision comparison, concise workflow, and install. Add case studies, a worthwhile no-provider first project, task-led documentation entry points, and directing-language examples. Synchronize README, skill guidance, metadata, and machine-readable pages.

Acceptance: the first viewport explains the product, demonstrates it, and offers a useful action. Comparisons use real retained variants. Case studies lead to source and working instructions. Desktop, mobile, reduced motion, keyboard, forced colors, and media failure behavior remain usable. Keep the static site's isolation, privacy, and size budgets.

### 4. Complementary range and launch material — complete

Add The laundromat after midnight, A square wave auditions for jazz, and One shoot, three stories, with source, useful revisions, and a coherent case-study route. Use rights-cleared footage. Prepare launch clips and public descriptions from admitted work. Do not send social messages without explicit channel authorization.

Acceptance: every featured piece adds a distinct creative or practical capability, receives creative review, and makes dependencies/costs clear where relevant. No placeholder or merely functional technique demo receives flagship treatment.

### 5. Review and delivery — in progress

Run focused checks once per owner, independently review complete impact, then complete the repository source gate and applicable browser/native/installation checks. Correct findings in bounded batches and obtain reviewer verdicts. Publish a current-head PR, resolve required checks/reviews, merge conditionally, complete documented deployment, and verify production identity and relevant pages/media. Release a package only when the final package changes require it.

Acceptance: record exact commands/results, reviewed tree, PR/merge, deployment, and production evidence. Documentation records final design tokens and implementation. No task ends at a passed intermediate gate.

## Validation and recovery

Focused media checks: source determinism, canonical render/probe receipts, representative frames, complete playback, sound review, ffprobe facts, content hashes, registry validation, and web limits. Site checks: repository web tests, copy checks, isolated install/build, pinned browser verification, current-design native acceptance, and independent desktop/mobile review. Root runs the final complete CI or documented local fallback, KB refresh/check, and deployment verification.

If a production spike fails, repair the technique or simplify the shot while preserving the creative concept; never weaken a runtime or publication gate to admit it. Keep previous public assets until replacements pass review. Deployment rollback uses the documented prior production deployment and preserves data and provider identity.

## Implementation log

- 2026-09-30: User approved full implementation and parallel work. Created shared isolated branch from current main. Native and illustrated production spikes identified viable local pipelines; site audit identified the static media registry, strict asset budgets, and the need for a real source revision demonstration.
- 2026-09-30: Produced and independently reviewed all six scored showcase projects, including the matching tram revision and three eclipse edits. Fixed title placement, rail contact, character foot sliding, glass lighting, the eclipse annotation, and audio endings before admission. Admitted nine new media records into the existing bounded registry; retained 166 source files across 56 total examples. Film masters, source receipts, audiovisual review details, and full decoding evidence remain in ignored production artifacts.
- 2026-09-30: Implemented the film-led homepage, manual players with truthful sound labels and captions, task-led documentation, first-animation tutorial, directing and remix guides, synchronized README and Agent Skill guidance, and social metadata. Independent integration review required current-design keyboard, RTL, appearance, and stylesheet-restoration browser coverage before delivery.
- 2026-09-30: Preparing patch release 3.9.2 for the updated packaged Agent Skill. Final source gate, independent whole-feature review, current-design browser execution, canonical publication, and production verification remain open.

- 2026-09-30: Independent source review verified the six non-authored showcase records (47 source entries) and the two illustrated-film sources against retained renders. Corrected the storm command and editing-guide anchors. Rendered and reviewed the paper ocean quiet composition. Launch-copy focused checks passed 8 tests / 65 assertions; refreshed its independent editorial admission. Final browser review also requires a visibly painted keyboard focus indicator and manual appearance paint matching.
- 2026-09-30: Final integration repairs restored the two legacy editorial examples in the motion-graphics guide, aligned social-image descriptions, shortened the tram share card without changing its fit limit, and restored comparison and rename information in the homepage Markdown. The README now uses the admitted storm poster. All 133 declared publication assets pass source, hash and guide-placement checks. Reconciled stale analytics instructions with the unchanged explicit-event allowlist already on main. Current-head aggregate and live browser validation remain required.
