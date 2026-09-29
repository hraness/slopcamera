import { exampleMarkdown, exampleMediaRecord } from "./example-content"
import { renderExampleMedia } from "./example-media"
import { exampleUrl, workflowExamples, type WorkflowExample } from "./example-registry"

/** One packaged technique: what the agent gets and the first command it runs. */
export interface HomepageTechnique {
  readonly name: string
  readonly result: string
  readonly command: string
}

/** One job a person brings. The rendered example shows one technique from the group. */
export interface HomepageTechniqueGroup {
  readonly id: string
  readonly title: string
  readonly summary: string
  readonly guide: Readonly<{ href: string; label: string }>
  readonly example: Readonly<{ id: string; name: string }>
  readonly techniques: readonly HomepageTechnique[]
}

const hero = { id: "native-product", name: "Blender product shot" } as const

/** Names, results and commands follow the techniques reference and the CLI help. */
export const homepageTechniqueGroups: readonly HomepageTechniqueGroup[] = [
  {
    id: "diagrams",
    title: "Diagrams and vector art",
    summary: "Diagram JSON renders to SVG, PNG and an editable board, in light and dark.",
    guide: { href: "/docs/tutorials/first-diagram", label: "First diagram tutorial" },
    example: { id: "source-to-film", name: "Editable diagram" },
    techniques: [
      { name: "Editable diagrams", result: "Light and dark SVG and PNG plus a .tldr board, after a strict layout check.", command: "slopcamera diagram init flow.diagram.json" },
      { name: "Drawing sheets", result: "Monochrome SVG sheets and a multipage PDF from one drawing source.", command: "slopcamera diagram sheets init figures.drawing.json" },
      { name: "Raster to SVG", result: "A local trace of a PNG or JPEG, with a report that compares it with the original.", command: "slopcamera image vectorize input.png --output traced.svg" },
    ],
  },
  {
    id: "motion",
    title: "Motion graphics and shaders",
    summary: "The agent edits one HTML file. The CLI renders it at fixed frame times.",
    guide: { href: "/docs/how-to/render-motion-graphics", label: "Motion graphics guide" },
    example: { id: "interference-field", name: "GPU compute pattern" },
    techniques: [
      { name: "Kinetic titles", result: "Timed text and shape animation with the Motion library.", command: "slopcamera html scaffold motion --output title.html" },
      { name: "GPU compute patterns", result: "A WGSL program rendered to frames on the GPU.", command: "slopcamera html scaffold vgpu --output field.html" },
      { name: "Three.js on a declared tempo", result: "A scene timed to the BPM written in the source, with a local track.", command: "slopcamera html scaffold three --output pulse.html" },
    ],
  },
  {
    id: "scenes",
    title: "3D scenes and camera moves",
    summary: "Scene JSON names every part, light and camera, so a change edits one named item.",
    guide: { href: "/docs/how-to/direct-scenes", label: "3D scenes guide" },
    example: { id: "compute-temple", name: "Rail camera through a lit set" },
    techniques: [
      { name: "Editable Three.js scenes", result: "Named parts, materials, lights and cameras in one scene file.", command: "slopcamera scene init product.scene.json" },
      { name: "Camera moves", result: "Orbit, dolly, crane, rail, tripod and handheld paths evaluated at exact times.", command: "slopcamera scene plan product.scene.json --request frame.json" },
      { name: "Parametric design", result: "Named dimensions and constraints that compile into a scene.", command: "slopcamera scene design catalog" },
    ],
  },
  {
    id: "native",
    title: "Blender, CadQuery and Manim",
    summary: "Native source renders with the engine on your machine and stays editable.",
    guide: { href: "/docs/how-to/native-films", label: "Native films guide" },
    example: { id: "native-fluid", name: "Blender fluid simulation" },
    techniques: [
      { name: "Cloth and fluid simulations", result: "Separate bake and render stages, with the caches kept beside the source.", command: "slopcamera studio init pour --template blender-fluid" },
      { name: "Parametric CAD parts", result: "A CadQuery part with STEP output and renders at two sizes.", command: "slopcamera studio init bracket --template cadquery-bracket" },
      { name: "Math explainers", result: "A Manim lesson placed in a project you keep editing.", command: "slopcamera studio init lesson --template manim-lesson" },
    ],
  },
  {
    id: "editing",
    title: "Footage editing and delivery",
    summary: "Cuts, overlays and grades are recorded decisions. Your original media is never changed.",
    guide: { href: "/docs/how-to/edit-video", label: "Editing guide" },
    example: { id: "premiere-wall", name: "Overlays and a camera push" },
    techniques: [
      { name: "Edit decisions", result: "Cuts, speed, zooms and overlays that preview and final renders both read.", command: "slopcamera project edit <project> cut <from> <to>" },
      { name: "Color grades", result: "Warm, cool, vivid, cinematic or monochrome grades written to a new file.", command: "slopcamera media color clip.mp4 warm --output warm.mp4" },
      { name: "Several aspect ratios", result: "16:9, 9:16, 1:1 and 4:5 versions of one edit, each framed on its own.", command: "slopcamera project render plan <project> --width 1080 --height 1920" },
    ],
  },
]

function registered(id: string, examples: readonly WorkflowExample[]): WorkflowExample {
  const example = examples.find(item => item.id === id)
  if (!example) throw new Error(`Homepage technique needs a registered example: ${id}`)
  return example
}

/** The hero example first, then one rendered example per technique group. */
export function homepageExamples(examples: readonly WorkflowExample[] = workflowExamples): readonly WorkflowExample[] {
  return [hero.id, ...homepageTechniqueGroups.map(group => group.example.id)].map(id => registered(id, examples))
}

/** The on-page name for a homepage example: its technique, not its registry title. */
export function homepageExampleName(id: string): string {
  if (id === hero.id) return hero.name
  const group = homepageTechniqueGroups.find(item => item.example.id === id)
  if (!group) throw new Error(`Not a homepage example: ${id}`)
  return group.example.name
}

export function renderExampleHero(): string {
  const record = { ...exampleMediaRecord(registered(hero.id, workflowExamples)), title: hero.name }
  return renderExampleMedia(record, { autoplayPreview: true, eagerPoster: true, compact: true })
}

function escapeText(value: string): string {
  return value.replace(/[&<>"]/gu, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]!)
}

/** One job per group: the rendered example, then its techniques and first commands. */
export function renderExampleGallery(): string {
  return homepageTechniqueGroups.map(group => {
    const example = registered(group.example.id, workflowExamples)
    const record = { ...exampleMediaRecord(example), title: group.example.name }
    const autoplay = example.video !== undefined && example.video.durationSeconds <= 15
    const darkPoster = example.video === undefined ? example.downloads.find(file => file.label === "Dark PNG") : undefined
    const figure = renderExampleMedia(record, { autoplayPreview: autoplay, compact: true, ...(darkPoster ? { darkPosterUrl: exampleUrl(darkPoster) } : {}) })
    const items = group.techniques.map(item =>
      `<li><strong>${escapeText(item.name)}</strong><span>${escapeText(item.result)}</span><code>${escapeText(item.command)}</code></li>`).join("")
    return `<section aria-labelledby="techniques-${group.id}" class="slopcamera-technique-group"><div class="slopcamera-technique-group__body"><h3 id="techniques-${group.id}">${escapeText(group.title)}</h3><p>${escapeText(group.summary)}</p><ul class="slopcamera-technique-list">${items}</ul><a class="slopcamera-technique-group__guide" href="${group.guide.href}">${escapeText(group.guide.label)}</a></div>${figure}</section>`
  }).join("\n")
}

/** The hero example in the Markdown mirror, under its technique name. */
export function homepageHeroMarkdown(): string {
  return `${hero.name}:\n\n${exampleMarkdown(registered(hero.id, workflowExamples), false)}`
}

export function homepageExampleMarkdown(): string {
  return homepageTechniqueGroups.map(group => {
    const example = registered(group.example.id, workflowExamples)
    return [
      `### ${group.title}`,
      `${group.summary} Read the [${group.guide.label.toLowerCase()}](https://slopcamera.com${group.guide.href}.md).`,
      group.techniques.map(item => `- **${item.name}.** ${item.result} Start with \`${item.command}\`.`).join("\n"),
      `Example, ${group.example.name.toLowerCase()}:`,
      exampleMarkdown(example, false),
    ].join("\n\n")
  }).join("\n\n")
}

