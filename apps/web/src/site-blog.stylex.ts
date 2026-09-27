import * as stylex from "@stylexjs/stylex"

// These recipes own only the /blog article and index chrome. Post bodies reuse
// the documentation prose recipes through DOCS_* class tokens; the ordinary
// shell and marketing presentation remain separate boundaries. Design-kit's
// plain-publication markup is mapped onto these classes by src/blog-content.ts
// before sealing, so no separate stylesheet is linked from a blog page.
// Every declaration below except the page measure reuses a value the docs
// recipes already emit, so the atomic union grows by as few rules as possible
// under the combined CSS ceiling in site.test.ts.
const blog = stylex.create({
  page: {
    width: "min(100% - 2 * var(--gutter), 44rem)",
    marginTop: 0,
    marginRight: "auto",
    marginBottom: 0,
    marginLeft: "auto",
    paddingTop: "clamp(2rem, 6vw, 4rem)",
    paddingBottom: "clamp(3rem, 8vw, 6rem)",
  },
  block: {
    minWidth: 0,
  },
  header: {
    marginBottom: "2.25rem",
    paddingBottom: "1rem",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "var(--line)",
  },
  dek: {
    marginTop: 0,
    marginBottom: "1.25rem",
    maxWidth: "38rem",
    color: "var(--muted)",
    fontSize: "1.125rem",
    lineHeight: 1.55,
  },
  meta: {
    marginTop: 0,
    marginBottom: "0.5rem",
    color: "var(--muted)",
    fontSize: "0.92rem",
    lineHeight: 1.5,
  },
  byline: {
    color: "var(--ink)",
    fontWeight: 600,
  },
  provenance: {
    marginTop: 0,
    marginBottom: 0,
    color: "var(--muted)",
    fontSize: "0.875rem",
    lineHeight: 1.5,
  },
  sourceChecked: {
    display: "block",
    color: "var(--muted)",
    fontSize: "0.8rem",
  },
  entry: {
    paddingTop: "1rem",
    paddingBottom: "1rem",
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: "var(--line)",
  },
  entryTitle: {
    marginTop: 0,
    marginBottom: "0.5rem",
    fontSize: "1.5rem",
    fontWeight: 600,
    letterSpacing: "-0.01em",
    lineHeight: 1.25,
  },
  entryLink: {
    color: { default: "var(--ink)", ":hover": "var(--gold)" },
    textDecoration: "none",
  },
})

export const siteBlogClassNames = {
  page: stylex.props(blog.page).className,
  block: stylex.props(blog.block).className,
  header: stylex.props(blog.header).className,
  dek: stylex.props(blog.dek).className,
  meta: stylex.props(blog.meta).className,
  byline: stylex.props(blog.byline).className,
  provenance: stylex.props(blog.provenance).className,
  sourceChecked: stylex.props(blog.sourceChecked).className,
  entry: stylex.props(blog.entry).className,
  entryTitle: stylex.props(blog.entryTitle).className,
  entryLink: stylex.props(blog.entryLink).className,
} as const
