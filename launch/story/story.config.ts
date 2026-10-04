/**
 * Slopcamera's launch film: problem, the agent that cannot draw, the reveal,
 * real renders from the reviewed example registry, one directed revision,
 * counts from launch-facts.ts, and the agent-install end card. Numbers come
 * from apps/web/src/launch-facts.ts; images are the site's own render posters.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";

import { launchBeats } from "../../apps/web/src/launch-beats.ts";
import { launchFacts } from "../../apps/web/src/launch-facts.ts";
import { defineStory } from "./story.ts";

const repo = join(import.meta.dir, "../..");
const media = join(repo, "apps/web/media");
const files = readdirSync(media);
/** The site's content-addressed poster for one reviewed example. */
const poster = (scene: string) => {
  const file = files.find((name) => name.startsWith(`${scene}-poster-`) && name.endsWith(".webp"));
  if (!file) throw new Error(`No poster for ${scene}`);
  return join(media, file);
};
const caption = (scene: string) => {
  const beat = launchBeats.find((item) => item.visual.scene === scene);
  if (!beat) throw new Error(`No launch beat shows ${scene}`);
  return beat.caption.split(". ")[0]!.replace(/\.$/u, "");
};

export default () => defineStory({
  id: "slopcamera",
  brand: {
    wordmark: launchFacts.product,
    mark: join(repo, "apps/web/src/marks/slopcamera.svg"),
    markAspect: 592 / 480,
    // Read with site-palette.ts from https://slopcamera.com in dark mode, 2026-10-04 (catppuccin palette).
    palette: { values: {
      background: "#1e1e2e", foreground: "#dbe1f7", muted: "#b2b8cf", surface: "#181825",
      surfaceRaised: "#313244", primary: "#92bafa", primarySoft: "#2b3046", primaryForeground: "#1e1e2e",
    } },
    designKit: join(repo, "node_modules/@hraness/design-kit"),
  },
  acts: [
    {
      kind: "scatter", headline: "Pictures, diagrams and video still mean a different app for each.", accents: ["different", "app"],
      cards: [
        { app: "Image editor", glyph: "Im", color: "#f5c2e7", lines: ["Edited by hand", "No source to revise"] },
        { app: "Diagram tool", glyph: "Di", color: "#94e2d5", lines: ["Boxes dragged into place"] },
        { app: "Video editor", glyph: "Vi", color: "#fab387", lines: ["A timeline per cut", "Export, then start over"] },
      ],
      ghosts: ["3D app", "Animation tool", "Audio editor", "Slide deck", "Screen recorder", "Caption tool"],
    },
    { kind: "chat", headline: "Your coding agent can't open any of them.", accents: ["can't"], exchanges: [
      { you: "Make a short film of a tram riding to the moon.", agent: "I can write the script, but I can't draw or render it." },
    ] },
    { kind: "reveal", tagline: "Give your coding agent a multimedia studio." },
    {
      kind: "gallery", headline: "Your agent makes them from source files it can revise.", accents: ["source", "files"],
      items: ["rain-bottled", "last-tram", "laundromat-after-midnight"].map((scene) => ({ image: poster(scene), caption: caption(scene) })),
    },
    { kind: "chat", headline: "Then ask for a precise change.", accents: ["precise"], exchanges: [
      {
        you: "Make the moon larger.",
        agent: "Done. The moon is larger, and the route, palette, score and timing stay the same.",
        card: { kicker: "Revised film", title: "The last tram, with a larger moon", image: poster("last-tram-revised") },
      },
    ] },
    { kind: "stats", headline: "Every example on the site ships with its source.", accents: ["source."], items: [
      { value: String(launchFacts.exampleCount), label: "rendered examples, each with its source and command" },
      { value: String(launchFacts.exampleFamilyCount), label: "example families" },
      { value: String(launchFacts.diagramOutputCount), label: "files from one diagram source" },
      { value: String(launchFacts.deliveryCutCount), label: "aspect cuts from one edit" },
    ] },
    { kind: "cards", headline: "It runs on your computer, with no account.", accents: ["your", "computer,"], items: [
      { tag: "Local", title: "Editing and rendering stay on your computer" },
      { tag: "No account", title: "There is no Slopcamera account or hosted project database" },
      { tag: "Open source", title: "Free and open source, with every source file kept" },
    ] },
  ],
  formats: ["wide", "square", "portrait"],
  end: {
    lead: "Ask your agent:", prompt: `Install Slopcamera from ${launchFacts.url}`,
    terms: `Free and open source · Latest release v${launchFacts.release.version}`, url: launchFacts.url,
  },
});
