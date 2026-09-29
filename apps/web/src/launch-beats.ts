/**
 * The "Introducing SlopCamera" launch beats. Each beat is one standalone
 * claim with one visual; the post, the social kit and the Show HN fact sheet
 * are all cut from this list. Every number comes from `launch-facts.ts` through
 * a `{placeholder}`; the design-kit checks reject a digit typed by hand.
 *
 * Every visual is a real SlopCamera render from the reviewed example registry
 * (`kind: "clip"`, `scene` = example id), so nothing here is an illustration.
 */
import {
  assertLaunchKit,
  buildSocialKit,
  resolveLaunchBeats,
  type LaunchBeat,
  type LaunchFacts as KitLaunchFacts,
  type LaunchStatus,
  type SocialKit,
} from "@hraness/design-kit/launch"
import { product } from "@hraness/design-kit/portfolio"
import { launchFacts } from "./launch-facts"

export type SlopcameraLaunchBeat = LaunchBeat & Readonly<{
  visual: Readonly<{ kind: "clip"; scene: string }>
  /** Shown under the render in the post; says what the reader is looking at. */
  caption: string
}>

/** Names the checks may see with a digit in them. */
export const launchAllowNumerals: readonly string[] = Object.freeze(["3D"])

/** Status label from the published release record (STYLE.md status labels). */
export const launchStatus: LaunchStatus = `Latest release: v${launchFacts.release.version}` as LaunchStatus

/** True: the release record points at a public GitHub Release archive. */
export const launchPublicInstall = true

export const launchCanonicalUrl = "https://slopcamera.com/blog/introducing-slopcamera"

/** The typed facts the beats may cite, each with the record it comes from. */
export const launchBeatFacts: KitLaunchFacts = Object.freeze({
  status: { value: launchStatus, source: "apps/web/published-release.json" },
  diagramOutputCount: { value: String(launchFacts.diagramOutputCount), source: "media/examples.json source-to-film downloads" },
  revisionFrom: { value: launchFacts.revision.from, source: "media/source-to-film-source-ad4ec8806384.json" },
  revisionTo: { value: launchFacts.revision.to, source: "media/source-to-film-revised-source-822a690049ca.json" },
  deliveryCutCount: { value: String(launchFacts.deliveryCutCount), source: "media/examples.json edit-directed-* examples" },
  exampleCount: { value: String(launchFacts.exampleCount), source: "media/examples.json" },
})

export const launchBeats: readonly SlopcameraLaunchBeat[] = Object.freeze([
  {
    id: "what",
    part: "what",
    headline: "Your coding agent can now make visuals it can keep editing",
    post: "SlopCamera lets your coding agent make images, diagrams, animation, 3D scenes and video from source files. The next version starts from the recipe, not from scratch.",
    visual: { kind: "clip", scene: "kinetic-title" },
    alt: "Black kinetic typography reading Make every frame count on an orange field.",
    caption: "A kinetic title rendered by SlopCamera from one HTML file.",
  },
  {
    id: "diagram",
    part: "does",
    headline: "One short JSON file becomes a finished diagram",
    post: "Ask for a diagram and your agent writes a short JSON file. One render turns it into light and dark SVG and PNG plus an editable tldraw board: {diagramOutputCount} files from one source. The first diagram needs no AI model and no key.",
    visual: { kind: "clip", scene: "source-to-film" },
    alt: "A rendered diagram: three inputs point into Project, which points to Preview and Delivery.",
    caption: "Rendered from one short JSON file. The same source also gives a dark version and an editable tldraw board.",
    facts: ["diagramOutputCount"],
    detailHref: "/docs/tutorials/first-diagram",
  },
  {
    id: "revise",
    part: "does",
    headline: "Change one word and render again",
    post: "Want a different label? Edit one line of the source. Here \"{revisionFrom}\" became \"{revisionTo}\" and every file rendered again. Nothing was redrawn by hand, and the source still says exactly what the picture shows.",
    visual: { kind: "clip", scene: "source-to-film-revised" },
    alt: "The same diagram with its last box renamed from {revisionFrom} to {revisionTo}.",
    caption: "The same diagram after one label changed in the source.",
    facts: ["revisionFrom", "revisionTo"],
  },
  {
    id: "scenes",
    part: "does",
    headline: "3D scenes where every part and camera has a name",
    post: "A 3D scene is a JSON file where every part and camera has a name. Ask your agent to move the camera or change a part, and it patches that one named item and renders the shot again. No timeline to scrub.",
    visual: { kind: "clip", scene: "premiere-scene" },
    alt: "A cinema wall inside a 3D scene: a robot film plays on the main screen beside a print and a board.",
    caption: "A 3D scene with named cameras, rendered from a scene file the agent can keep editing.",
    detailHref: "/docs/how-to/direct-scenes",
  },
  {
    id: "cuts",
    part: "does",
    headline: "One edit, {deliveryCutCount} shapes for every feed",
    post: "Already have footage? Trims, cuts and speed changes are recorded as edits, not baked into your files. The same timing edit gives wide, tall, square and feed-sized versions, each with its own framing and title.",
    visual: { kind: "clip", scene: "edit-directed-square" },
    alt: "Square cut of an optical instrument study with a title above the lens and specification rows around it.",
    caption: "The square cut. The wide, tall and feed versions share the same timing edit.",
    facts: ["deliveryCutCount"],
    detailHref: "/docs/how-to/edit-video",
  },
  {
    id: "how",
    part: "how",
    headline: "Every render keeps its recipe",
    post: "Your agent writes a source file, checks it, renders it and shows you the result. The project keeps those sources and settings, and important steps write down what went in and what came out. Come back next month and the recipe is still there.",
    visual: { kind: "clip", scene: "production-pipeline" },
    alt: "Five cards read Author, Check, Render, Review and Deliver, connected by four arrows.",
    caption: "SlopCamera's own pipeline, rendered as a diagram by SlopCamera.",
  },
  {
    id: "who",
    part: "who",
    headline: "Made for people who already work with a coding agent",
    post: "SlopCamera suits site owners who need matching editorial art, people who draw architecture diagrams and anyone making short explainers. If you want to type a prompt into a web page and download a picture, a hosted image app will be quicker.",
    visual: { kind: "clip", scene: "native-product" },
    alt: "A brass optical instrument with a ribbed dark housing, a glass lens and five front switches.",
    caption: "A product shot rendered in Blender on your own machine. The Blender scene stays editable.",
  },
  {
    id: "vision",
    part: "vision",
    headline: "Every picture should carry how it was made",
    post: "The aim: every image, clip or diagram SlopCamera renders carries the record of how it was made, so an agent can read it and make the next version without guessing. New kinds of visual work join when they fit that pattern.",
    visual: { kind: "clip", scene: "camera-orbit" },
    alt: "A motion graphic and a process diagram stand as panels behind dark fins while the camera orbits.",
    caption: "Earlier renders placed inside a new 3D shot. Each panel is still its own editable source.",
  },
  {
    id: "limits",
    part: "limits",
    headline: "A person still has to look at the result",
    post: "Models can change a face, a motion or the words in a picture. The record says what went in, not whether the result is good. Renders can differ between machines, and native Python runs with your own access, not in a sandbox.",
    visual: { kind: "clip", scene: "color-mono" },
    alt: "A monochrome optical instrument on a black plinth, with the mono color treatment applied.",
    caption: "A color treatment written to a new file. Whether it suits the page is still your call.",
  },
  {
    id: "status",
    part: "status",
    headline: "Free and open source, out now",
    post: "SlopCamera is free and open source under the MIT license, with {exampleCount} rendered examples you can copy from. {status}. Install it with Bun, then ask your agent for its first diagram.",
    visual: { kind: "clip", scene: "native-character" },
    alt: "An original white and teal robot with copper shoulders waves from a softly lit stage.",
    caption: "An original character, rigged and rendered on a local machine.",
    facts: ["exampleCount", "status"],
  },
] satisfies readonly SlopcameraLaunchBeat[])

/** Beats with every `{placeholder}` filled from the facts module. */
export const resolvedLaunchBeats = resolveLaunchBeats(launchBeats, launchBeatFacts, { allowNumerals: launchAllowNumerals }) as readonly SlopcameraLaunchBeat[]

/** Portfolio messaging for Slopcamera, read from the design-kit portfolio registry. */
export const launchMessaging = product("slopcamera").messaging

export const launchSocialKit: SocialKit = buildSocialKit(
  resolvedLaunchBeats,
  launchMessaging,
  { status: launchStatus, tags: ["Developer Tools", "Design Tools", "Artificial Intelligence"] },
  launchCanonicalUrl,
)

assertLaunchKit(resolvedLaunchBeats, launchSocialKit, {
  status: launchStatus,
  publicInstall: launchPublicInstall,
  tagline: launchMessaging.tagline,
  canonicalUrl: launchCanonicalUrl,
})
