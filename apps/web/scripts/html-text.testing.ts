import { parseFragment, type DefaultTreeAdapterTypes } from "parse5"

/** Read decoded DOM text for assertions; this is not an HTML sanitizer. */
export function htmlText(html: string): string {
  const text = (node: DefaultTreeAdapterTypes.Node): string => {
    if (node.nodeName === "#text") return (node as DefaultTreeAdapterTypes.TextNode).value
    if ("childNodes" in node) return node.childNodes.map(text).join("")
    return ""
  }
  return text(parseFragment(html))
}
