---
type: plan
title: Complete workflow examples and hosted AI
area: public-workflows
status: completed
---

# Slopcamera: complete workflows, visible proof

Revision 2 after independent SEO/IA and capability attacks, 2026-09-19. Implementation source: `hraness/slopcamera` main at `ba231ba`. This is a content and product outline, not a claim that the examples or hosted service are already delivered.

## Reader and outcome

Help a developer using a coding agent decide whether Slopcamera can produce their intended media, inspect a real result, and reproduce or adapt it. Cover the supported techniques without generating a separate landing page for every keyword or parameter combination. Preserve the existing Slopcamera identity and editorial visual system.

Every canonical example owns a finished artifact, editable source, exact invocation, requirements, a useful variation, and verification evidence. A showcase succeeds when the reader sees what changed and can make the same result. A screenshot of a command is not output evidence.

## Public information architecture

- Homepage: a real motion example in the first viewport, then a deliberately selected set of six visually distinct results. Organize by what people make: explain, animate, direct, finish. Each result links to its existing task guide, and every visible claim is supported by its shown source. Keep the install path and the free local product clear.
- Docs index: start with a first result, browse workflows by desired output, then expose Tutorials, How-to guides, Reference, and Explanation. Keep Diátaxis; borrow Dioxus's short entry paths and approachable chapter names without adopting its framework or promising an in-browser editor.
- Tutorials: first editable diagram; first authored animation; first native film. Supplied source, exact requirements, commands, checkpoints, and an expected output at the top. Agent setup pages stay separate from learning media production.
- How-to: canonical procedure pages below, each with a real video or still, a short equivalent text explanation, source link, requirements, recipe, completion check, and variation sections. Strengthen existing pages before creating a new route.
- Reference: comprehensive capability and technique matrix, installed/released/source status, engine requirements, exact command/SDK ownership. Index less common techniques here and point to the canonical worked example.
- Explanation: retained sources and representations; choosing an authoring engine; local processing and AI providers. Hosted credits remain explicitly proposed until implemented and qualified.
- GitHub README: definition, one compelling still linked to the live example, copyable first result, concise workflow map, requirements and trust boundaries. Reuse the same example names and stable facts as the site.
- Crawler surfaces: HTML, markdown mirrors, sitemap, llms.txt, descriptions, social images, and structured data derive from the same registry. Video metadata must describe the actual clip; complementary clips do not establish Google watch-page eligibility.

## Canonical example collection and technique coverage

| ID | Finished result / canonical owner | Techniques and variations to demonstrate | Evidence required |
| --- | --- | --- | --- |
| diagram | An editable architecture map / first-diagram | Literal labels and edges; light/dark; tldraw; SVG and PNG; explicit revision; layout/theme options | Real source plus all five outputs; render and strict validation |
| vector | A raster badge converted to editable vector / new vectorize how-to | Local VTracer; transparent edge handling; fidelity comparison; icon output; honest detail limits | Original owned raster, resulting SVG, side-by-side crop, receipt |
| motion | A launch-title sequence / new HTML animation how-to | Plain DOM/CSS/SVG; Motion choreography; absolute-time seeking; transparent overlays; reusable typography | Native HTML render, poster, clip, retained source; reproducible timing |
| procedural-motion | A kinetic study / HTML authoring and animation guide variation | p5 Canvas; Two retained vector; Paper Shaders; vgpu WGSL/pass ownership; deterministic seeds | Separate actual authored source and rendered sample for each supported profile; no screenshot-only substitutes |
| music | A musical island with an articulated original character / music-video | Three scene; musicClock/pulse; explicit BPM and offset; phrase transitions; separate audio | Silent and audio output where authorized; contact frames, soundtrack provenance, supplied timing |
| spatial | A product reveal in an editable 3D world / direct-scenes | Named parts; geometry/material/light edits; GLB import; calibrated camera; world-space image/video; before/after; saved Spark worlds | Scene source and real render; licensed external assets if used; precise geometry/rig/splat limits |
| cinematic | A short character scene / cinematic-worlds | Original articulation or supported skinning; performance/direction; environment; camera; spatial/time effects; galleries; ALGAL behavior; temporal audit and selected take | Real selected scene, clip, contact sheet, source and review/audit outcome; individual variations map to same scene |
| native | A studio product film / native-films | Blender geometry/materials/lights/camera; imported models; native rig versus static derivative; explicit caches | Native job, retained bundle, engine/runtime identity, real frames, assembly output |
| simulation | A fabric or liquid study / native-films variations | Cloth and fluid bake/render separation; cache reuse; distinct source revisions | Actual native baked caches and rendered clip; no claim of physical validation |
| cad | An exploded technical part / native-films variation | CadQuery dimensions/solids; STEP input/output; compatible GLB derivative; shared camera | Parametric source, STEP/GLB output, measured geometry and rendered view |
| education | A geometric lesson / educational-video | Manim; readable math; authored presenter; timed narration/captions; audio separate from visuals | Actual native render, transcript/track for speech, lesson source, timing provenance |
| edit | A polished demo and social cuts / edit-video | Valid existing project bootstrap; cuts/trim/speed; overlays; camera reframing; captions; local color/audio; 16:9/9:16/1:1/4:5; alignment/cleanup only with real source evidence | Original owned input, retained project, visible before/after and real delivery variants; do not imply new capture or empty-project import exists |
| generated | A storyboard turned into reviewed AI takes / generate-media + direct-takes | Image generation and reference editing; video; speech/transcription; model discovery; budget; continuation endpoints; upload acknowledgement; uncertain-request reconciliation | Real provider outputs and receipts, explicit model/date/cost; requires bounded paid authority and usable credential |
| workflow | The same film built, revised, and recovered / run-workflows | Eight built-ins; imperative/declarative SDK; fixed MCP subset; candidate selection; resume receipts | A real run and deliberate safe interruption/recovery where justified; source snippets supplement real result |

Coverage is a matrix, not a Cartesian product. Support status (`released`, `source-only`, `experimental`, `unsupported`) is separate from example readiness (`planned`, `source-ready`, `rendered`, `reviewed`, `published`, `blocked`). Blocked examples remain unfinished scope. Track documented, demonstrated, and published counts separately against the frozen technique inventory. Unrendered plans never enter a public gallery as finished work.

## Example visual direction

Use one restrained collection with varied art direction: warm architectural diagram, saturated kinetic typography, a bright original island, a studio-lit product, a precise material simulation, and a legible geometric lesson. Each example uses real Slopcamera source and its actual rendering route. Compose scenes for useful subjects and visual clarity, with purposeful motion and a decisive thumbnail. Avoid a set of identical starter grids or decorative gradients standing in for a workflow.

## Shared player contract

Progressive enhancement of native video: visible poster and usable native controls without JavaScript; muted inline looping preview only when visible; pause offscreen and when the tab hides; reduced-motion and Save-Data default to still/manual play; user pause stays paused; no surprise sound; labelled play/pause and explicit sound control for clips that contain sound. Keep keyboard, touch, focus, fullscreen, seek, loading/failure, captions and text equivalents usable. Prefer native transport controls to implementing a fragile custom scrubber. One active automatic preview at a time, lazy media selection, bounded resolution/bitrate/duration, and stable dimensions. Do not require analytics, remote embeds, a client framework, or credentials.

Docs default to manual playback. An explicit manual play preempts every automatic preview, and no automatic preview resumes while that manual session is active. Keep actual source URLs, poster, dimensions, and descriptive text in server HTML; use `preload="none"` to avoid eagerly downloading clips rather than hiding sources from crawlers. A denied play promise leaves native controls usable.

The homepage uses curated preview clips; docs use the same media registry and sources. Still diagrams have useful alt text and readable zoom/download paths. Source links are persistent and assets are content-addressed. Publication admits only exact declared assets and validates MIME type, dimensions, duration, size, source identity, rights, and public-safe provenance.

## Search strategy and page admission

Prioritize concrete intents where a working source is the differentiator: agent-created editable diagrams; local PNG to SVG; HTML animation to MP4; music-synchronized Three.js; Manim with separately editable narration; Blender film to editable timeline; captioned aspect-ratio exports; reference-led reviewed AI takes. Broad AI-video rankings are not an initial success assumption. Do not claim traffic volume without measured search data.

Each new URL needs its own authored admission record: reader job, original executable evidence, nearest three URLs and consolidation choice, six 0–2 scores with at least 9/12 and no zero, owner, agent reviewer, source-check date, and reassessment within 28–56 days. No automatic scores for a series. Existing canonical guides own variations unless a new page solves a meaningfully different task. Search success is useful non-brand entry traffic leading to reproducible media work; Search Console ownership/data access is unverified.

## Hosted AI product boundary

Current product accepts a Gateway API key directly or an injected Vercel OIDC token. Vercel CLI is optional. Earlier Slopcamera-hosted service was free preview. The current Hraness credits service already registers Slopcamera: its live public rate card exposes `image_generate` and `model_tokens`, with prepaid packs of $10/$25/$50/$100. The newer `credits-foundation` integration supports device-scoped credentials and hold/settle/release. Reuse that service after checking its current contract and product registration; do not revive retired Accounts media permissions or create a duplicate wallet. Registration is not evidence of a working Slopcamera inference service or a completed payment qualification.

Proposed default pending user answer: free local studio, optional prepaid Slopcamera AI credits, and retained BYO Gateway. Credible hosted benefits to implement and then claim: a product-specific device balance and securely retained local client credentials, a preauthorized maximum credit debit, with provider-cost overrun and ambiguous-job liability defined separately, estimates and reconciled usage, a bounded job and usage history with explicit retention, controlled temporary reference hosting, and idempotent recovery. Do not promise cheaper models, improved output, universal provider continuity, or hosted native rendering merely because requests use a proxy.

Real activation needs exact account/provider identity, existing ledger reuse assessment, an explicit price/margin and initial supported model list, payment settlement and signed/replayed webhook behavior, reserve/settle/refund ledger rules, idempotent provider dispatch, uncertain-request recovery, scoped auth, retention/deletion, abuse/rate caps, purchase and insufficient-credit UX, separate test/live evidence, and an actual readback. No public paid promise until these are checked. Keep this distinct from donation/support links.

## Dependency-ordered implementation and review

1. Adversarially review this outline against real capabilities, search evidence, reader path, and production feasibility. Record findings, revise, and have a different lane attack the revision.
2. Freeze shared media manifest and player/renderer contract. Root owns build allowlists, registry, manifests, package files, CSS integration, policies, and delivery. Workers own disjoint example sources and their evidence.
3. Run example production lanes in parallel where independent. Use the existing host scheduler for native/browser/heavy work; one browser owner. Each lane inspects output pixels/motion and reports exact commands, runtime identity, retained receipts, and limits.
4. Integrate the player and gallery into existing site and docs. Update per-page prose, source links, metadata, mirrors, and README from validated artifacts. Repair discovered release/capture/auth contradictions.
5. Hosted lane proceeds through investigation and reviewed proposal while public work continues. Implement only the selected commercial boundary; activation cannot be inferred from silence on required commercial or payment decisions.
6. Independent implementation/impact and editorial review; focused tests, isolated web install, pinned-browser current-design acceptance, complete repository source gate. Preserve all relevant 76-case browser matrices and require new player accessibility/motion/network evidence.
7. Push task-owned branch, open PR, attach it, resolve findings, wait on current-head Required plus complete CI evidence or documented local fallback, merge conditionally, verify actual production deployment and public paths. Release the CLI only if its runtime changes require distribution; website-only updates do not imply a package release.

## Adversarial questions

- Does the outline really cover the capability surface, including unusual engines and compositional workflows, or merely six attractive categories?
- Can a new reader reproduce each output from the declared release without author-only files or an impossible project bootstrap?
- Which clips would mislead about current capture, physics, imported animation, GPU support, automated music timing, or paid capabilities?
- Is the visual bar high enough to make the product compelling, and does each source have a useful reason to stay editable?
- Is every new URL justified, and can the user find the right workflow without understanding Slopcamera internals?
- Does the player preserve deliberate user choices and accessibility while saving bandwidth?
- Which hosted benefit is worth paying for, and which integration already exists elsewhere?

## Status

Independent SEO/IA review completed by `/root/seo_research`: revise, with five P1 and six P2 findings. This revision separates readiness from support, fixes route ownership, makes recording metadata a distinct input dependency, freezes asset publication, and specifies player priority/loading. Capability reviewer identified ALGAL integration and fresh-source drift; ALGAL bake/channel-map/performance glue must be demonstrated explicitly and is not claimed as a cinematic-world recipe field. Hosted investigation found the existing Hraness credits service and live Slopcamera rate card. No paid generation, payment, or provider mutation has occurred.


## Frozen implementation contract

The selected base is `ba231ba`, tool manifest version `3.2.8`, manifest SHA `f1f03d0f7ccbbc69a6d5f34a9eeb0959a9c0a97cc7fc1866d93680db964bcab1`. There are 8 capability modules and 71 versioned operations. This is current-source evidence, not proof those operations exist in the published archive that shares its version number. Every example records the execution SHA and runtime, and public source-only labels stay until release parity is checked.

Canonical new URLs are `/docs/tutorials/first-animation` (fixed beginner exercise), `/docs/how-to/render-motion-graphics` (export and technique atlas), `/docs/how-to/vectorize-images` (raster-to-vector task), and `/docs/how-to/parametric-design` (editable dimensional rules and generated geometry). The parametric guide follows the subsequently merged design compiler and its five reviewed studies; it does not duplicate the general spatial rendering guide. Each route requires its own admission. Diagram animation is an anchored section of motion graphics. Native variants remain anchored in native-films; other existing guide URLs remain owners. No separate watch pages in this implementation unless independently admitted later.

Public media lives only in the finite `apps/web/media/` publication directory, outside private `artifacts/` and native source/cache directories. The user has requested real published stills/video; update the website policy to admit only reviewed showcase derivatives there. Never copy an artifacts directory wholesale. Native bundles/caches stay private. Retain original authored source in `examples/showcase/<family>/`; public code links point to repository source. A source manifest binds every authored dependency by SHA-256. Each published record contains only public-safe title/description, canonical guide, technique IDs, source links and digests, actual runtime/version, dimensions/duration, rights, hashes, and factual review status. Original provider receipts and absolute local paths never enter public media metadata.

Root owns the media registry and publication allowlist, compiler input capture, markdown shortcode, integration CSS slots, dependency manifests, policy updates, sitemap and crawler projections, aggregate validation, PR and deployment. Source workers own disjoint `examples/showcase/<family>/` and task-specific ignored render outputs. A worker submits a proposed record plus measured derivatives; root admits publication after source and visual review. File names include a content hash and the builder recomputes hashes and size bounds before publication. Use a stable local `/assets/examples/` prefix with immutable cache headers, no new external origin and no remote embed. This changes only the explicit public-media seam; static site remains credential-free.

Media defaults: 1280×720 or 720×1280, 24/30 fps, 6–15 seconds for loops, ≤4 MiB per preview, ≤200 KiB per poster, with exceptions explicitly measured and reviewed. Long lessons are manual only with distinct ≤12 MiB cap. Initial public media collection cap 64 MiB. Root will check the measured encoded result and prevent unused/undeclared files. HTML/CSS budgets remain enforced; any necessary finite new budget must be independently reviewed with measured attributable player/gallery costs, not waived to pass a fixture.

Technique ledger fields: stable technique ID; family; actual capability/command/source owner; support status and source/release evidence; example source; input admission/rights; runtime needs; expected observable effect; assigned worker; canonical guide anchor; readiness; exact render/validation commands; retained receipt IDs; still/readability check; full-motion/loop-seam review; listening review when sound matters; caption review when language matters; public artifact identity. A rendered container alone does not prove a technique. Every HTML profile, each simulation type, and each built-in has its own subrow. ALGAL behavior must pass check/bake/channel-map into an authored performance/render handoff; an unresolved intent or direction proposal cannot count as final motion.

Edit input: use an actual project returned by `html render` first, label it an authored-media editing example, then prove cuts, overlays, captions, grade, audio and delivery formats. Recording metadata features require a separate admitted genuine recording; synthetic pointer graphics never prove capture. Face/Whisper/Rhubarb rows require their real helper and input. Saved splats require an authorized reusable scene. These stay open if their inputs are missing.

Launch acceptance measures public asset/page correctness and reproducibility. Search observation uses authorized Search Console if available; no custom analytics or invented install attribution is added. Reassess new URLs on 2026-10-31.

## Revision review and work sequence

Round 2 reviewer receives this revision and the first review without implementation optimism. Resolve remaining P1 findings before artifact production. Player implementation may begin once its frozen contract passes. Parallel artifact lanes: (A) diagrams/vector and docs; (B) HTML atlas/music/edit project; (C) native/portable source qualification and media. Hosted adapter design follows existing-credit audit; live payment/model activation remains conditional on the selected product boundary and test/live qualification. Root integrates every finished lane and keeps unfulfilled scope explicit.


## Hosted integration gates added after independent audit

Reuse the existing accountless Hraness Credits authority and an immutable credits-foundation client. No new ledger and no Accounts media permission restoration. Before any paid dispatch, require request-hash-bound idempotency, a hold lifetime covering provider dispatch/ambiguity or a reviewed renewable/dispatched contract, and secret-free token pickup even when local persistence fails. Current foundation prints a once-issued token on write failure and must not enter Slopcamera unchanged. Prove device recovery/revocation before claiming them. Keep customer quote ceiling distinct from operator provider exposure. Reuse existing pack inventory; do not silently decide prices, margins, or failure charging. Slopcamera registration currently names image_generate and model_tokens; video/audio need an explicit reviewed operation/rate mapping. The full test purchase, signed webhook, token pickup, hold, actual media, settlement and balance readback precedes live activation. Existing public rate-card availability is read-only evidence, not payment qualification.

## Review disposition

2026-09-19: Independent round-2 reviewers `/root/seo_research` and `/root/capability_inventory` accepted the revised design and allowed scoped implementation. Both retain full technique ledger, release parity, artifact quality, runtime readiness and production acceptance as execution gates. Hosted audit was independent and its findings are incorporated above. No review was represented as human review.

## Production progress, 2026-09-20

The source registry contains 41 reviewed examples and six selected homepage examples. The original 32 are joined by an automatic diagram stack, its custom-font/icon treatment, a native straight-alpha PNG / premultiplied linear EXR chart, a 72-frame focus study, and five separate camera films: dolly, crane, rail, tripod and handheld. These are prepared for publication; production has not been updated by this task. The completed 41-record source admission verified 104 distinct retained files. Thirteen registry/raster/anchor tests passed, and the documentation check covered 548 links in 56 Markdown files.

The original 123 technique observations remain fixed: 37 demonstrated, 10 partial, 34 planned, 19 source-checked, 11 budget-needed and 12 input-needed. Five separately identified parametric witnesses are also demonstrated, making 42 of 128 completed observations and 86 unfinished. A media record is not a completed technique by itself. The color chart passed 26 numeric conditions and independent edge/composite review; its public PNG preserves exact decoded pixels and color chunks after removing private metadata. The diagram pair retains ten real exports and editable graph evidence. The focus study has closed native custody and all 72 frames reviewed. Each new camera film has 192 reviewed frames, exact source/output hashes and calibrated camera samples.

The full website suite passed 528 tests and 47,846 assertions, followed by all 11 native preview cases. The final 133-case gate (76 shell, eight copy, 40 docs and nine player cases) and literal-island admission remain pending. The mobile documentation disclosure has native keyboard/no-JavaScript observations in a completed 14-case diagnostic; all cases passed and owned processes were collected. Earlier diagnostics confirmed native playback, portrait containment, denied-media recovery and no unexpected requests. A measured docs grid repair reduced 390px viewport scrollWidth from 724 to 390. The missing docs favicon is fixed with a built-resource regression. Historical profiles retain their contracts.

Real examples exposed corrections to static overlays (bd011ec), RGB blending (171304a), saved-splat negative radiance (3634482), cinema filter/cadence handling (7c071a3), and incoming/split-clip source clocks (c3a5737). The latest cinema suite passes 12 actual FFmpeg cases and2,605 assertions, focused TypeScript, lint and independent review. The generated CLI at 8fead79 predates the latest source-clock and scene-cancellation fixes and needs rebuilding after convergence. Six canonical transition films remain unrendered. The spatial batch completed five films then stopped on disk exhaustion; four are admitted and handheld derivative/review remains in progress. All attempts are collected. New scene/native renders are held during shared storage recovery; masters, source and evidence are preserved. N4 exploded-CAD source is authored with geometry/shading invariants but has no native smoke proof; N3 textured import is in outline review.

Delivered main d203c22 is integrated, including the verified v3.3.3 installation surface and mainline parametric fixes. The next source candidate is v3.3.4. The workflow-examples browser baseline is exact revision d203c2263128dd5044217707406f28f257fe9d95, tree ed5a0fdc0d72c77e2ddbf87282cd0b7a9d65880d, using schema six. The prior 4cdfb0b and 437a530 baselines and their evidence remain retained. Release parity covers 17 MCP tools, six portable operation codes and eight built-in workflows. Each earlier example retains its actual execution version and source identity. Later renderer corrections need the next verified release.

Inactive hosted request/state code passes 18 deterministic tests with 2,787 assertions, focused TypeScript and lint. Independent review corrected terminal-billing evidence retention and verifies dispatch timing bounds. It has no service endpoint, public adapter, payment or provider call. Existing Credits registration does not prove an active inference backend. Read-only review also located the unmerged credits-service PR 148, which supplies an optional image adapter, model defaults and a separate deployment shell. Its stateless retries, ambiguous settlement and inherited token-pickup defects need repair before reuse and activation. Owning-service recovery, live qualification and deployment remain open. The isolated manifest/lock-only website installation passed. Required final integration, full native browser, release and production gates still apply.

## Result

Delivered 2026-09-22 as release `v3.3.4`. PR #182 (workflow gallery, site + docs) squash-merged to `main` at `81217777f193718e20351a886516ecae445590a9`; post-release datum PR #195 merged at `e02aa6f`. The 133-case `workflow-examples-v1` native browser matrix passed twice on exact merged trees (`ffb2d13`, `a10d78c`) against the immutable `c56e007` baseline, including all negative controls, hidden/offscreen playback, manual pause, failed media, reduced-motion and Save-Data policies, and zero unadmitted media requests.

Release `v3.3.4` (tag `v3.3.4`, run 35678721452) published immutably with five assets; archive `hraness-slopcamera-3.3.4.tgz` sha256 `79dce04cf066a721fa3ed17281eea0d5cccda6b68f6ecf05fadde5cf6e61f1af`; npm mirror admitted after registry propagation (`sha512-ackY7racQizg/sNbrs7EpRj8DbCqWKkIChaYuccPnarl3i3TG6bMxt98VqSy3ww8tfBAzPmA4kMAXwGjdJGIKA==`). Production deployment `dpl_2df5QuKwnh6NzZob7pt1VciTEq6u` built `main@8121777`; the datum deployment `slopcamera-hndadtomb` built `e02aa6f`. Verified live: homepage autoplay previews (muted, controls, playsinline, `preload="none"`, posters), docs manual playback video, `/docs` Diátaxis index with all workflow routes, 206 range-served mp4, markdown content negotiation, `/icon.png` + `/apple-touch-icon.png` 200. `/favicon.ico` returning 404 is intentional — no published page references it.

The hosted lane delivered `apps/api` (PRs #187–#191, closed by [[plans/hosted-agent-api]]): hosted tool calls, presigned upload channel, Vercel OIDC forwarding, and settled paid-call/upload-consuming evidence. Live commercial activation remains a separately conditioned operational step per that plan.

## Durable memory

- `document.fonts.load()`/`fonts.ready` resolve face *loading*, not glyph *application*; under `font-display: swap`, `ch`-resolved metrics can still read fallback for ~90 ms. Settlement barriers must poll an applied `ch` probe across frames, and the probe must be built through CSSOM property sets — a page CSP of `style-src 'self'` rejects `setAttribute("style", …)` and `innerHTML` markup.
- Chrome for Testing (≥ 131 headless and headful) has no reachable platform path to `document.hidden` — minimize, tab activation, and `Page.setWebLifecycleState` all leave automation targets `visible`. Emulating at the document boundary (overriding `hidden`/`visibilityState` getters plus a real `visibilitychange` dispatch) exercises the product's real listener→pause path, the same evidence class as `emulateMedia`.
- IntersectionObserver-driven pause is asynchronous: settle assertions must wait for `video.paused` before starting a quiet window.
- npm registry read-after-write lags provenance-backed publishes by minutes; release admission jobs need a propagation poll or rerun, not a red-flag diagnosis.
- An exclusive host-scheduler claim waiting on compute strands spare permits for queued shared jobs; cancel-and-requeue the identical claim is free ordering-wise when its head-of-line position cannot admit anyway.
