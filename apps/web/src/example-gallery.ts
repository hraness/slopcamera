import { exampleMarkdown, exampleMediaRecord } from "./example-content"
import { renderExampleMedia } from "./example-media"
import { workflowExamples, type WorkflowExample } from "./example-registry"

export function homepageExamples(examples: readonly WorkflowExample[] = workflowExamples): readonly WorkflowExample[] {
  const order = ["native-product", "premiere-wall", "island-pulse", "interference-field", "native-fluid", "compute-temple"]
  return examples.filter(example => example.featured).sort((a, b) => {
    const left = order.indexOf(a.id), right = order.indexOf(b.id)
    return (left < 0 ? order.length : left) - (right < 0 ? order.length : right)
  })
}

function heroExample(examples: readonly WorkflowExample[]): WorkflowExample {
  const hero = examples.find(example => example.id === "native-product") ?? examples.find(example => example.video) ?? examples[0]
  if (!hero) throw new Error("Homepage needs a reviewed visual example")
  return hero
}

export function renderExampleHero(): string {
  return renderExampleMedia(exampleMediaRecord(heroExample(homepageExamples())), { autoplayPreview: true, eagerPoster: true })
}

export function renderExampleGallery(): string {
  const examples = homepageExamples()
  const hero = heroExample(examples)
  return examples.filter(example => example.id !== hero.id)
    .map(example => `<li>${renderExampleMedia(exampleMediaRecord(example), { autoplayPreview: true })}</li>`).join("\n")
}

export function homepageExampleMarkdown(): string {
  return homepageExamples().map(example => exampleMarkdown(example, false)).join("\n\n")
}
