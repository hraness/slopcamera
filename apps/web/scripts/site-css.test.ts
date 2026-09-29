import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { assertSiteRecipeResources, inspectSiteCssResources } from "./site-css"

test("ordinary CSS inspection includes local custom-property textures and typed font/image URLs", () => {
  const source = '@font-face{font-family:f;src:url(./font.woff2)}.x{--field:url(./grain.svg),var(--fallback,url(./cells.svg));background:image-set("./one.png" 1x,url(./two.png) 2x)}'
  expect(inspectSiteCssResources(source, "fixture.css"))
    .toEqual(["./font.woff2", "./grain.svg", "./cells.svg", "./one.png", "./two.png"])
  expect(source).toContain("--field:url(./grain.svg)")
  expect(inspectSiteCssResources('.x{width:min(12rem,calc(100vw - 2rem));height:clamp(2rem,4vw,8rem)}', "fixture.css"))
    .toEqual([])
})

test("ordinary CSS inspection finds escaped and raw image-set URLs without treating content or MIME strings as requests", () => {
  expect(inspectSiteCssResources(String.raw`.x{--field:u\72l(https://example.test/a.svg);content:"url(not-a-request)"}`, "fixture.css"))
    .toEqual(["https://example.test/a.svg"])
  expect(inspectSiteCssResources('.x{--images:image-set("./one.avif" type("image/avif") 1x,url(./two.png) 2x)}', "fixture.css"))
    .toEqual(["./one.avif", "./two.png"])
  expect(inspectSiteCssResources(String.raw`.x{--images:IMAGE-SET("./upper.png" 1x);--escaped:i\6d age-set("./escaped.png" 1x)}`, "fixture.css"))
    .toEqual(["./upper.png", "./escaped.png"])
  expect(inspectSiteCssResources('.x{background-image:image-set("https://example.test/a.png" 1x)}', "fixture.css"))
    .toEqual(["https://example.test/a.png"])
})

test("ordinary CSS inspection rejects imports, malformed CSS, unsupported raw image functions and excessive resources", () => {
  expect(() => inspectSiteCssResources('@import "https://example.test/style.css";', "fixture.css")).toThrow("unresolved stylesheet import")
  expect(() => inspectSiteCssResources('.x{color:rgb( ;}', "fixture.css")).toThrow()
  expect(() => inspectSiteCssResources('.x{--image:image("https://example.test/a.png")}', "fixture.css")).toThrow("unsupported unparsed image")
  expect(() => inspectSiteCssResources(Array.from({ length: 65 }, (_, index) => `.x${index}{--image:url(./${index}.svg)}`).join(""), "fixture.css"))
    .toThrow("excessive resource")
})

test.each([
  '.x{--remote:"https://example.test/a.svg";background:image-set(var(--remote) 1x)}',
  '.x{--remote:"https://example.test/a.svg";--field:image-set(var(--remote) 1x);background:var(--field)}',
  '.x{--field:image-set(var(--remote,"https://example.test/a.svg") 1x);background:var(--field)}',
  '.x{--field:image-set(env(--remote) 1x);background:var(--field)}',
  '.x{--field:image-set(attr(data-image) 1x);background:var(--field)}',
  '.x{--field:image-set("./one.png" type(var(--mime)) 1x);background:var(--field)}',
])("ordinary CSS inspection rejects resource-producing substitutions: %s", source => {
  expect(() => inspectSiteCssResources(source, "fixture.css")).toThrow()
})

test("recipe resources admit only the pinned footer mask pair and reject changed, missing or added resources", () => {
  const css = readFileSync(new URL(import.meta.resolve("@hraness/site-footer/stylex.css")), "utf8")
  expect(() => assertSiteRecipeResources(css, "footer.css")).not.toThrow()
  for (const source of ["", css + css, css.replaceAll("data:image/svg+xml", "data:image/svg+xml;utf8"),
    css + '.extra{mask-image:url(./other.svg)}', css + '.extra{background:url(https://example.test/tracker)}']) {
    expect(() => assertSiteRecipeResources(source, "footer.css")).toThrow("exact approved shared footer")
  }
})
