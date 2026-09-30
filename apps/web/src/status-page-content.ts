import { productMessaging, productName } from "./messaging"
import { renderStatusPageHtml, type StatusPageLink } from "@hraness/design-kit-status"

import { blogIndex, blogPath, blogPostPath, indexableBlogPosts } from "./blog-registry"
import { docPages, docsCanonicalUrl, docsOrigin } from "./docs-registry"

// The shared design-kit 404 body. The build entrypoint renders it outside the
// sealed StyleX graph, like the blog article strings, and passes the finished
// markup into the 404 template. Its classes come from the design-kit
// status-page stylesheet in the captured foundation, not from site recipes.

const routeLabelLimit = 48

function routeLabel(title: string): string {
  if (title.length <= routeLabelLimit) return title
  const cut = title.slice(0, routeLabelLimit - 1)
  return `${cut.slice(0, cut.lastIndexOf(" ")).trimEnd()}…`
}

/** Every known page, for "Did you mean": home, docs, the blog, and listed posts. */
export function statusPageRoutes(): StatusPageLink[] {
  return [
    { href: "/", label: productName },
    ...docPages.map(page => ({ href: docsCanonicalUrl(page).slice(docsOrigin.length), label: routeLabel(page.title) })),
    { href: blogPath, label: routeLabel(blogIndex.heading) },
    ...indexableBlogPosts.map(post => ({ href: blogPostPath(post), label: routeLabel(post.title) })),
  ]
}

export function renderStatusPage(): string {
  return renderStatusPageHtml({
    agentIndexHref: "/llms.txt",
    next: [
      {
        description: "Make a two-node flow, check its exports, then revise it by editing the source.",
        href: "/docs/tutorials/first-diagram",
        label: "Create your first diagram",
      },
      {
        description: "Install the release and the Agent Skill so Claude Code can make visual media.",
        href: "/docs/tutorials/claude-code",
        label: "Set up Slopcamera for Claude Code",
      },
      {
        description: "Tutorials and task guides for diagrams, animation, 3D scenes, and video.",
        href: "/docs",
        label: "Documentation",
      },
    ],
    primaryAction: { href: "/#install", label: productMessaging.hero.primaryAction },
    rootElement: "div",
    routes: statusPageRoutes(),
    siteName: productName,
  })
}
