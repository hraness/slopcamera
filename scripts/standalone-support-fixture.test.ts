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
  // The v0.14 support target is the exact serialized icon-only anchor from the
  // sealed documents: the muted question-mark SVG carries no text, so the
  // accessible name and proposition stay on the link's attributes.
  const anchor = `<a class="hraness-site-footer__support x9f619 x2ga2k1 x3nfvp2 x6s0dn4 xl56j7k x175cv4s x1bxml6c xesnm00 x159srwy x1e6avla xj5idha xxeg0yr x1voprv7 x1ylmb6m x1hl2dhg x784prv x9v5kkp xxuwnm0 xz4eswf xj3ae5l x105zyf9 x1ntgrh1 xma2t0n x7ctuma" data-slot="hraness-support-link" href="${supportHref.replaceAll("&", "&amp;")}" aria-label="Support Slopcamera: optional paid membership" title="Support ongoing development of local media tools for agents. Review optional paid membership." lang="en" dir="ltr"><svg aria-hidden="true" class="hraness-site-footer__support-icon x1milg1j x38bysi" data-slot="hraness-support-icon" fill="none" focusable="false" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"></circle><path d="M9.5 9.5C9.5 8.11929 10.6193 7 12 7C13.3807 7 14.5 8.11929 14.5 9.5C14.5 10.3569 14.0689 11.1131 13.4117 11.5636C12.7283 12.0319 12 12.6716 12 13.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"></path><path d="M12.125 16.75H12M12.25 16.75C12.25 16.8881 12.1381 17 12 17C11.8619 17 11.75 16.8881 11.75 16.75C11.75 16.6119 11.8619 16.5 12 16.5C12.1381 16.5 12.25 16.6119 12.25 16.75Z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"></path></svg></a>`;
  const footer = `<footer id="hraness-site-footer">${anchor}</footer>`;
  const path = "apps/web/dist/index.html";
  expect(standaloneSupportFixtureScanText(path, footer)).toBe('<footer id="hraness-site-footer"></footer>');
  expect(standaloneSupportFixtureScanText("apps/web/dist/docs/reference/sdk.html", footer)).not.toBe(footer);
  for (const other of ["src/index.html", "apps/web/dist/index.html.extra", "apps/web/dist/unknown.html", "apps/web/dist/preview.html", "apps/web/dist/docs/unknown.html"])
    expect(standaloneSupportFixtureScanText(other, footer)).toBe(footer);
  for (const rejected of [anchor, footer + anchor, footer + supportHref, footer.replace("</svg></a>", "</svg>Subscribe</a>"),
    footer.replace('lang="en"', 'onclick="submit()" lang="en"'), footer.replace("slopcamera&amp;", "other&amp;"),
    footer.replace(new URL(supportHref).hostname, `${new URL(supportHref).hostname}.example`),
    footer.replace('id="hraness-site-footer"', 'id="another"'), footer.replace(anchor, "") + anchor])
    expect(standaloneSupportFixtureScanText(path, rejected)).toBe(rejected);
});
