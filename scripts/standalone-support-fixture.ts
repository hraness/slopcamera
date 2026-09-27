import { createHash } from "node:crypto";
import { docPages } from "../apps/web/src/docs-registry";
import { blogIndexDocument, blogPosts } from "../apps/web/src/blog-registry";
import { supportHref } from "../apps/web/scripts/site-support-profile";

const fixturePath = "apps/web/scripts/site-support-profile.ts";
const ordinaryHtmlPaths = new Set([
  "apps/web/dist/index.html",
  "apps/web/dist/404.html",
  ...docPages.map(page => `apps/web/dist/docs/${page.slug}.html`),
  `apps/web/dist/${blogIndexDocument}`,
  ...blogPosts.map(post => `apps/web/dist/blog/${post.slug}.html`),
]);
const expectedLine = `export const supportHref = ${JSON.stringify(supportHref)}`;

/** Admit only the independent browser oracle's single static public link.
 * This does not admit a hosted client, service, SDK edge, or another path. */
export function standaloneSupportFixtureScanText(path: string, text: string): string {
  // Keep the exception independent of edits to the browser oracle's URL.
  if (createHash("sha256").update(supportHref).digest("hex") !== "9d8c291dba5ce10029f1d25e67b685c180fbaec110f9dcd97288a18f8745746c") return text;
  const host = new URL(supportHref).hostname;
  if (ordinaryHtmlPaths.has(path)) {
    const anchors = [...text.matchAll(/<a\b[^>]*data-slot="hraness-support-link"[^>]*>[\s\S]*?<\/a>/gu)];
    const footers = [...text.matchAll(/<footer\b[^>]*id="hraness-site-footer"[^>]*>[\s\S]*?<\/footer>/gu)];
    if (anchors.length !== 1 || footers.length !== 1 || !footers[0]![0].includes(anchors[0]![0])) return text;
    if (createHash("sha256").update(anchors[0]![0]).digest("hex") !== "c4e92f5420418a6b3b3586b863ecb3714bc31f60950276868a972b32fadd82c6") return text;
    if (text.toLowerCase().split(host).length !== 2) return text;
    return text.replace(anchors[0]![0], "");
  }
  if (path !== fixturePath) return text;
  const lines = text.split("\n").filter((line) => line.toLowerCase().includes(host));
  if (lines.length !== 1 || lines[0] !== expectedLine) return text;
  return text.replace(expectedLine, "");
}
