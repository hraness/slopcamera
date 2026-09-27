import {
  homeMarkdown,
  notFoundMarkdown,
} from "./agent-pages"
import {
  docsCanonicalUrl,
  docsMarkdownUrl,
  docsPageForRequestPath,
} from "./docs-registry"
import { blogTargetForRequestPath, type BlogRequestTarget } from "./blog-registry"
import {
  htmlMediaType,
  markdownMediaType,
  notAcceptableBody,
  preferredRepresentation,
  preferredRepresentationFrom,
} from "./negotiate"

const markdownContentType = "text/markdown; charset=utf-8"
const notAcceptableContentType = "text/plain; charset=utf-8"
const previewNotAcceptableBody = "Not Acceptable\n\nAvailable: text/html\n"
const varyAccept = "Accept"
const varyAcceptAndEncoding = "Accept, Accept-Encoding"

function negotiatedBody(request: Request, body: string): string | null {
  return request.method.toUpperCase() === "HEAD" ? null : body
}

export function isHomePath(pathname: string): boolean {
  return pathname === "/" || pathname === "/index.html"
}

export function isDocsPath(pathname: string): boolean {
  return pathname === "/docs" || pathname === "/docs/" || pathname.startsWith("/docs/")
}

export function isPreviewPath(pathname: string): boolean {
  return pathname === "/preview" || pathname === "/preview.html"
}

export function isNegotiableDocumentPath(pathname: string): boolean {
  if (isPreviewPath(pathname)) {
    return true
  }
  if (isHomePath(pathname)) {
    return true
  }
  if (pathname.startsWith("/assets/")) {
    return false
  }
  return !pathname.includes(".")
}

// A blog post or index markdown request is served from its sealed static
// mirror. Quarantined posts carry noindex on the mirror as on the page.
function blogMirrorResponse(request: Request, target: BlogRequestTarget): Response {
  return new Response(null, {
    headers: {
      "Link": `<${target.canonicalUrl}>; rel="canonical", <${target.markdownPath}>; rel="alternate"; type="text/markdown"`,
      "Vary": varyAcceptAndEncoding,
      ...(target.indexable ? {} : { "X-Robots-Tag": "noindex" }),
      "x-middleware-rewrite": new URL(target.markdownPath, request.url).href,
    },
    status: 200,
  })
}

function canonicalHomeUrl(request: Request): string {
  return new URL("/", request.url).href
}

export function negotiateSiteRequest(request: Request): Response | undefined {
  const method = request.method.toUpperCase()
  if (method !== "GET" && method !== "HEAD") {
    return undefined
  }

  const pathname = new URL(request.url).pathname
  if (!isNegotiableDocumentPath(pathname)) {
    // A direct request for a published documentation markdown mirror serves
    // the identical sealed file with the canonical document and alternate
    // representation headers the negotiated response carries.
    const docsMirror = pathname.endsWith(".md") ? docsPageForRequestPath(pathname) : null
    const blogMirror = pathname.endsWith(".md") ? blogTargetForRequestPath(pathname) : null
    if (blogMirror !== null && blogMirror.markdownPath === pathname) {
      return blogMirrorResponse(request, blogMirror)
    }
    if (docsMirror !== null && docsMarkdownUrl(docsMirror) === pathname) {
      return new Response(null, {
        headers: {
          "Link": `<${docsCanonicalUrl(docsMirror)}>; rel="canonical", <${docsMarkdownUrl(docsMirror)}>; rel="alternate"; type="text/markdown"`,
          "Vary": varyAcceptAndEncoding,
          "x-middleware-rewrite": new URL(docsMarkdownUrl(docsMirror), request.url).href,
        },
        status: 200,
      })
    }
    return undefined
  }

  const accept = request.headers.get("accept")
  const preview = isPreviewPath(pathname)
  const chosen = preview
    ? preferredRepresentationFrom(accept, [htmlMediaType])
    : preferredRepresentation(accept)

  if (chosen === markdownMediaType) {
    if (isHomePath(pathname)) {
      return new Response(negotiatedBody(request, homeMarkdown), {
        headers: {
          "Content-Type": markdownContentType,
          "Link": `<${canonicalHomeUrl(request)}>; rel="canonical", </index.md>; rel="alternate"; type="text/markdown"`,
          "Vary": varyAcceptAndEncoding,
        },
        status: 200,
      })
    }

    // Documentation markdown is a sealed sibling of the HTML page. The edge
    // rewrites to the static mirror so a direct .md request is identical.
    const docsPage = docsPageForRequestPath(pathname)
    if (docsPage !== null) {
      return new Response(null, {
        headers: {
          "Link": `<${docsCanonicalUrl(docsPage)}>; rel="canonical", <${docsMarkdownUrl(docsPage)}>; rel="alternate"; type="text/markdown"`,
          "Vary": varyAcceptAndEncoding,
          "x-middleware-rewrite": new URL(docsMarkdownUrl(docsPage), request.url).href,
        },
        status: 200,
      })
    }

    const blogTarget = blogTargetForRequestPath(pathname)
    if (blogTarget !== null) {
      return blogMirrorResponse(request, blogTarget)
    }

    return new Response(negotiatedBody(request, notFoundMarkdown), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": markdownContentType,
        "Vary": varyAcceptAndEncoding,
        "X-Robots-Tag": "noindex",
      },
      status: 404,
    })
  }

  if (chosen === htmlMediaType) {
    return undefined
  }

  if (chosen === null && accept !== null && accept.trim() !== "") {
    return new Response(negotiatedBody(
      request,
      preview ? previewNotAcceptableBody : notAcceptableBody,
    ), {
      headers: {
        "Content-Type": notAcceptableContentType,
        "Vary": varyAccept,
      },
      status: 406,
    })
  }

  return undefined
}
