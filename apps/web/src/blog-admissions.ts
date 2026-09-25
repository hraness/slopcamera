import type { ArticleAdmission } from "@hraness/design-kit-articles"

// Editorial admission records for the /blog collection. Each post's lifecycle,
// review credit and reassessment date come only from here; pages, feeds,
// sitemaps, llms.txt and robots directives derive from these records. The
// import above is type-only, so middleware can read this module without
// loading design-kit at runtime. site.test.ts validates the whole registry with
// design-kit's assertArticleAdmissions.

const slopcameraRepository = "https://github.com/hraness/slopcamera"
const introducingCommit = "4b5ede7c8882dd6fe98448d05a54a33beced9b3d"
const algalPostCommit = "7e7027521f134aaaaa8404efebdc5bac24be6252"
const releaseRecord = `${slopcameraRepository}/releases/tag/v3.4.0`
const reviewer = "Claude Opus 5.5 (claude-opus-5-5) editorial review"

export const blogAdmissions = [
  {
    href: "/blog/introducing-slopcamera",
    lifecycle: "indexable",
    readerJob: "Decide whether Slopcamera fits my image, diagram or video work, and how to make a first picture with it.",
    nonObviousAnswer: "Slopcamera's first task needs no model or key: three diagram commands turn an editable JSON file into light and dark SVG and PNG plus a tldraw file, and AI images later go through your own Vercel AI Gateway key or a prompt-only hosted route paid with prepaid credits.",
    originalContribution: "Shows Slopcamera's retained records in use on other Hraness sites (AI Charts image records, Ghostget WebMCP provenance files) and checks which options the hosted route accepts in the CLI, beyond what the README states.",
    hostFit: "The product's own introduction on its own site; it links to the tutorials and guides for task steps instead of repeating them.",
    nearestUrls: [
      { url: "https://slopcamera.com/", distinction: "The homepage lists capabilities and installs the release; it does not explain why the tool exists or show its use on other sites." },
      { url: "https://slopcamera.com/docs/tutorials/first-diagram", distinction: "The tutorial teaches the first diagram step by step; the post names the three commands and links there for the task." },
      { url: "https://slopcamera.com/docs/how-to/generate-media", distinction: "The guide covers both generation routes in full; the post states the hosted route's limits and links there." },
    ],
    sources: [
      { title: "Slopcamera README", url: `${slopcameraRepository}/blob/${introducingCommit}/README.md`, checkedOn: "2026-09-24" },
      { title: "Slopcamera v3.4.0 release", url: releaseRecord, checkedOn: "2026-09-24" },
      { title: "Slopcamera scene behavior bake", url: `${slopcameraRepository}/blob/${introducingCommit}/src/spatial-scene/behavior-bake.ts`, checkedOn: "2026-09-24" },
      { title: "Slopcamera published release file", url: `${slopcameraRepository}/blob/${introducingCommit}/apps/web/published-release.json`, checkedOn: "2026-09-24" },
      { title: "AI Charts editorial image guide", url: "https://github.com/hraness/aicharts/blob/644dc2d4d22b145ae5ba64edf898f4584f9faa8d/editorial/IMAGES.md", checkedOn: "2026-09-24" },
      { title: "AI Charts image records", url: "https://github.com/hraness/aicharts/blob/644dc2d4d22b145ae5ba64edf898f4584f9faa8d/editorial/images.manifest.json", checkedOn: "2026-09-24" },
      { title: "Ghostget changelog", url: "https://github.com/hraness/ghostget/blob/76a79fc4836436239dff1d6328fdc87b93e01bcb/CHANGELOG.md", checkedOn: "2026-09-24" },
      { title: "Ghostget WebMCP page", url: "https://ghostget.com/webmcp/", checkedOn: "2026-09-24" },
    ],
    observations: [
      "Every live AI Charts note has a Slopcamera figure whose record (size, hashes, prompt digest, Slopcamera version and commit, receipt and job paths) is in aicharts editorial/images.manifest.json, not in the image guide.",
      "From the CLI, --hosted accepts only a prompt and a model; reference images, video, speech and transcription need the user's own key (apps/desktop/cli/commands.ts at v3.4.0).",
    ],
    scores: { readerUtility: 2, originalEvidence: 2, factualConfidence: 2, hostFit: 2, voiceIntegrity: 2, maintenanceValue: 1 },
    owner: "hraness/slopcamera",
    drafting: "ai-from-source",
    review: { reviewer, reviewerType: "ai", reviewedOn: "2026-09-24" },
    humanReview: null,
    reassessOn: "2026-11-05",
    harmIfWrong: "A reader could expect the hosted route to accept reference images or media, or expect Slopcamera to be a hosted app, and install a tool that does not fit their work.",
    refreshTriggers: [
      "Slopcamera release tag bump",
      "Change to hosted image generation (options accepted with --hosted, credits checkout, upload acknowledgement)",
      "Change to the ALGAL relation detail or the scene behavior bake (behavior.ts, behavior-bake.ts, scene behavior CLI help)",
      "AI Charts or Ghostget replaces or removes its Slopcamera figures or provenance files",
      "Change to the first-diagram commands or their outputs in the README or tutorial",
      "Slopcamera rename, or the how-slopcamera-uses-algal post changes route or title",
    ],
  },
  // Quarantined: the slopcamera to ALGAL relation and its detail sentence are
  // not in @hraness/design-kit/portfolio v0.17.0, and the ALGAL dependency is
  // pinned to a commit that is not on ALGAL main. The page stays readable but
  // noindex, and out of the sitemap, feed, llms.txt and the blog index, until
  // the relation is registered and the owner clears the pin.
  {
    href: "/blog/how-slopcamera-uses-algal",
    lifecycle: "quarantined",
    readerJob: "I build 3D scenes with Slopcamera and want to know what ALGAL does inside it, and whether it can change my renders behind my back.",
    nonObviousAnswer: "ALGAL runs behavior with no tools attached and only Slopcamera's own motion functions; every bake fails on any effect or model call, an undeclared channel, an out-of-range time, a stale scene fingerprint, or a program ID that ALGAL recomputes differently, and editing the scene marks the behavior stale rather than silently keeping it.",
    originalContribution: "Explains from the bake source and tests which checks run on every bake and which guarantee is held by tests instead, which the scene docs do not cover.",
    hostFit: "Behavior baking is a Slopcamera scene feature; the post explains why it runs through ALGAL and links to the scene guide for task steps.",
    nearestUrls: [
      { url: "https://slopcamera.com/docs/how-to/direct-scenes", distinction: "The how-to covers rendering and editing scenes; it does not explain why behavior runs through ALGAL or what a bake guarantees." },
      { url: "https://slopcamera.com/docs/reference/spatial-scenes", distinction: "The reference mentions behavior documents in one clause; the post explains the bake's checks and limits." },
      { url: "https://slopcamera.com/blog/introducing-slopcamera", distinction: "The introduction mentions ALGAL in one paragraph and links here for the details." },
    ],
    sources: [
      { title: "Slopcamera behavior bake", url: `${slopcameraRepository}/blob/${algalPostCommit}/src/spatial-scene/behavior-bake.ts`, checkedOn: "2026-09-24" },
      { title: "Slopcamera behavior bake tests", url: `${slopcameraRepository}/blob/${algalPostCommit}/src/spatial-scene/behavior-bake.test.ts`, checkedOn: "2026-09-24" },
      { title: "Slopcamera behavior functions", url: `${slopcameraRepository}/blob/${algalPostCommit}/src/spatial-scene/behavior-fns.ts`, checkedOn: "2026-09-24" },
      { title: "Slopcamera behavior trace and channel map", url: `${slopcameraRepository}/blob/${algalPostCommit}/src/spatial-scene/behavior-trace.ts`, checkedOn: "2026-09-24" },
      { title: "Slopcamera package manifest (ALGAL dependency)", url: `${slopcameraRepository}/blob/${algalPostCommit}/package.json`, checkedOn: "2026-09-24" },
      { title: "Slopcamera Agent Skill: directed scenes", url: `${slopcameraRepository}/blob/${algalPostCommit}/skills/slopcamera/references/directed-scenes.md`, checkedOn: "2026-09-24" },
      { title: "Slopcamera ALGAL character behaviors plan", url: `${slopcameraRepository}/blob/${algalPostCommit}/kb/plans/algal-character-behaviors.md`, checkedOn: "2026-09-24" },
      { title: "ALGAL README", url: "https://github.com/hraness/algal/blob/1bc117df7e9d18911123e736e28e2c051598a9f3/README.md", checkedOn: "2026-09-24" },
      { title: "Slopcamera v3.4.0 release", url: releaseRecord, checkedOn: "2026-09-24" },
    ],
    observations: [
      "bakeSpatialBehavior passes executors: [] and an in-memory store to ALGAL's runOrganism and throws on any recorded effect or agent call (src/spatial-scene/behavior-bake.ts).",
      "Bit-for-bit replay of a bake is enforced by behavior-bake.test.ts, not re-checked on each bake; an unmapped channel stays trace-only and only a mapped value with no binding becomes an unresolved intent (behavior-trace.ts).",
    ],
    scores: { readerUtility: 2, originalEvidence: 2, factualConfidence: 2, hostFit: 2, voiceIntegrity: 2, maintenanceValue: 1 },
    owner: "hraness/slopcamera",
    drafting: "ai-from-source",
    review: { reviewer, reviewerType: "ai", reviewedOn: "2026-09-24" },
    humanReview: null,
    reassessOn: "2026-11-05",
    harmIfWrong: "A reader could trust a bake guarantee that the code does not enforce, or assume behavior can reach tools, models or files.",
    refreshTriggers: [
      "Slopcamera release tag bump",
      "Change to the slopcamera:algal relation detail",
      "ALGAL pin bump in package.json",
      "Change to the scene behavior commands, function catalog, starting programs or bake checks",
      "Rename of Slopcamera or ALGAL",
      "The introducing-slopcamera post or an ALGAL built-on page goes live or moves",
    ],
  },
] as const satisfies readonly ArticleAdmission[]

export type BlogAdmission = (typeof blogAdmissions)[number]
