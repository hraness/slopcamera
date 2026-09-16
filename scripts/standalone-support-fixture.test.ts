import { expect, test } from "bun:test";
import { supportHref } from "../apps/web/scripts/site-support-profile";
import { standaloneSupportFixtureScanText } from "./standalone-support-fixture";

test("only the exact independent static URL oracle is excluded from the hosted-service scan", () => {
  const path = "apps/web/scripts/site-support-profile.ts";
  const line = `export const supportHref = ${JSON.stringify(supportHref)}`;
  const source = `// synthetic retained prefix\n${line}\nexport const untouched = true\n`;
  const admitted = standaloneSupportFixtureScanText(path, source);
  expect(admitted).toBe("// synthetic retained prefix\n\nexport const untouched = true\n");
  for (const other of ["src/support.ts", `${path}.extra`, `nested/${path}`]) {
    expect(standaloneSupportFixtureScanText(other, source)).toBe(source);
  }
  for (const rejected of [source + line, source + `// ${new URL(supportHref).hostname}`, source.replace("slopcamera&", "another&"),
    source.replace("/support?", "/login?"), source.replace(new URL(supportHref).hostname, `${new URL(supportHref).hostname}.example`),
    source.replace(line, `${line};`), source.replace(line, `${line} // extra`)]) {
    expect(standaloneSupportFixtureScanText(path, rejected)).toBe(rejected);
  }
});


test("only the exact inert support anchor on registered generated pages is excluded", () => {
  const anchor = `<a class="hraness-site-footer__support x9f619 xlashs9 xjb2p0i x1t35e8 x1aazh3f x1xh6y1q xd4aj15 xvmqkbn x10rt0pk x1rcybi7 x61gc8y xkyhvkk x2ga2k1 x3nfvp2 x6s0dn4 xl56j7k xyc0pis x18a9hih x6i6fhv xj5idha x1dcheo9 xk50ysn xo5v014 x1bvjpef x1ohr1zr xuxw1ft x784prv x9v5kkp xxuwnm0 xz4eswf xj3ae5l" data-slot="hraness-support-link" href="${supportHref.replace("&", "&amp;")}" aria-label="Support Slopcamera: optional paid membership" title="Support ongoing development of local visual tools for agents. Review optional paid membership." lang="en" dir="ltr">Support</a>`;
  const footer = `<footer id="hraness-site-footer">${anchor}</footer>`;
  const path = "apps/web/dist/index.html";
  expect(standaloneSupportFixtureScanText(path, footer)).toBe('<footer id="hraness-site-footer"></footer>');
  expect(standaloneSupportFixtureScanText("apps/web/dist/docs/reference/sdk.html", footer)).not.toBe(footer);
  for (const other of ["src/index.html", "apps/web/dist/index.html.extra", "apps/web/dist/unknown.html", "apps/web/dist/preview.html", "apps/web/dist/docs/unknown.html"])
    expect(standaloneSupportFixtureScanText(other, footer)).toBe(footer);
  for (const rejected of [anchor, footer + anchor, footer + supportHref, footer.replace("Support</a>", "Subscribe</a>"),
    footer.replace('lang="en"', 'onclick="submit()" lang="en"'), footer.replace("slopcamera&amp;", "other&amp;"),
    footer.replace(new URL(supportHref).hostname, `${new URL(supportHref).hostname}.example`),
    footer.replace('id="hraness-site-footer"', 'id="another"'), footer.replace(anchor, "") + anchor])
    expect(standaloneSupportFixtureScanText(path, rejected)).toBe(rejected);
});
