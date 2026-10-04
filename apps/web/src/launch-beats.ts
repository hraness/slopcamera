/**
 * The "Introducing Slopcamera" launch beats. Each beat is one standalone
 * claim with one visual; the post, the social kit and the Show HN fact sheet
 * are all cut from this list. Every number comes from `launch-facts.ts` through
 * a `{placeholder}`; the design-kit checks reject a digit typed by hand.
 *
 * Every visual is a real Slopcamera render from the reviewed example registry
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
    headline: "Give your coding agent a multimedia studio",
    post: "Your coding agent can write the code but not the picture. Slopcamera lets it make images, diagrams, animation, 3D scenes and video from editable source, like a storm inside a glass bottle.",
    visual: { kind: "clip", scene: "rain-bottled" },
    alt: "A brass and glass instrument contains a small cloud, falling rain and a flash of lightning.",
    caption: "A miniature storm, rendered in Blender with original geometry, lighting and an authored score.",
    detailHref: "/docs/how-to/remix-the-showcase#rain-bottled",
  },
  {
    id: "animation",
    part: "does",
    headline: "Send the last tram to the moon",
    post: "A copper tram leaves a rainy midnight city and climbs toward the moon. The original artwork, animation and score are editable source, so your agent can change the destination, pacing or musical cues.",
    visual: { kind: "clip", scene: "last-tram" },
    alt: "A copper tram leaves a rainy teal city on a rising railway toward a small moon.",
    caption: "Original Canvas illustration and animation, with a locally authored score, rain and arrival chime.",
    detailHref: "/docs/how-to/remix-the-showcase#last-tram",
  },
  {
    id: "revise",
    part: "does",
    headline: "Direct a precise change, then compare both films",
    post: "\"Make the moon larger.\" The revised film changes the destination's scale while keeping the route, palette, score and exact timing. Both versions come from the same HTML scene, with separate retained requests.",
    visual: { kind: "clip", scene: "last-tram-revised" },
    alt: "The same tram scene at the same time, with a much larger moon filling the destination.",
    caption: "The moonrise revision. Compare matching moments: the moon changes scale while the performance and score keep their timing.",
    detailHref: "/docs/tutorials/first-animation#revise-the-same-source",
  },
  {
    id: "cuts",
    part: "does",
    headline: "Give the same footage a different job",
    post: "NASA eclipse footage becomes a cinematic film, a vertical edit or a narrated explainer. The same source gets different pacing, framing, typography and sound. Each cut keeps its own recipe and the original footage intact.",
    visual: { kind: "clip", scene: "one-shoot-explainer" },
    alt: "NASA eclipse footage gains an annotation for the corona, narration and English captions.",
    caption: "An eclipse explainer using NASA footage, an original script and generated narration. The recipe includes credits and captions.",
    detailHref: "/docs/how-to/remix-the-showcase#one-shoot-three-stories",
  },
  {
    id: "how",
    part: "how",
    headline: "Build the picture, then direct its movement",
    post: "Build the picture, test its movement, then finish the film. The paper ocean keeps its layered artwork, animation and score in source files; its ending can also be rendered as a print.",
    visual: { kind: "clip", scene: "paper-ocean" },
    alt: "An envelope opens into paper waves, a whale breaches, and the illustration settles into a poster.",
    caption: "An envelope unfolds into waves and a breaching whale, then finishes as an illustrated poster.",
    detailHref: "/docs/how-to/remix-the-showcase#paper-ocean",
  },
  {
    id: "who",
    part: "who",
    headline: "Made for people who already work with a coding agent",
    post: "Make a short explainer, an illustrated story or an edit of your own footage with the coding agent you already use. This jazz miniature makes Fourier synthesis visible and audible through waveforms, labels and sound.",
    visual: { kind: "clip", scene: "square-wave-jazz" },
    alt: "Colorful jazz musicians enter as their sine waves combine into an increasingly square wave.",
    caption: "An illustrated Fourier lesson. The lead tone and displayed curve use the same harmonic sum.",
    detailHref: "/docs/how-to/remix-the-showcase#square-wave-jazz",
  },
  {
    id: "vision",
    part: "vision",
    headline: "A stranger idea should still have an editable source",
    post: "The aim is a studio where increasingly strange ideas remain practical to direct. A vinyl record can become a dancer, with its choreography, palette and soundtrack available for the next creative decision.",
    visual: { kind: "clip", scene: "laundromat-after-midnight" },
    alt: "A vinyl-record character dances among washing machines, then catches a sock and finds its partner.",
    caption: "A character performance with authored poses, planted feet, a sock interruption and an original score.",
    detailHref: "/docs/how-to/remix-the-showcase#laundromat-after-midnight",
  },
  {
    id: "limits",
    part: "limits",
    headline: "Review the picture and the sound",
    post: "Models can change a face, a motion or the words in a picture. The record says what went in, not whether the result is good. Renders can differ between machines, and native Python runs with your own access, not in a sandbox.",
    visual: { kind: "clip", scene: "one-shoot-vertical" },
    alt: "A vertical eclipse edit fills the frame with a close crop, a bold title and a pulsing score.",
    caption: "A vertical cut with its own crop, typography and score. Framing and legibility need review in the final format.",
    detailHref: "/docs/reference/capabilities",
  },
  {
    id: "status",
    part: "status",
    headline: "Free and open source",
    post: "Slopcamera is free and open source under the MIT license. Ask your agent to install Slopcamera from slopcamera.com; it adds the CLI and the Agent Skill, then you can start with an animation on macOS or a portable diagram.",
    socialPost: "{status}. Slopcamera is free and open source under the MIT license. Ask your agent to install Slopcamera from slopcamera.com, then make your first animation or diagram.",
    visual: { kind: "clip", scene: "one-shoot-cinematic" },
    alt: "A wide monochrome eclipse film with a restrained title and a held ending.",
    caption: "NASA eclipse footage becomes a quiet monochrome film. Its edit and locally composed score remain available as source.",
    facts: ["status"],
    detailHref: "/docs",
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
