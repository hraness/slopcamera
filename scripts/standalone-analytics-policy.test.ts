import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { supportHref } from "../apps/web/scripts/site-support-profile";
import { standaloneAnalyticsPolicyScanText } from "./standalone-analytics-policy";

const host = new URL(supportHref).hostname;
for (const path of ["apps/web/vercel.json", "apps/web/site.test.ts", "apps/web/scripts/verify-site-current.mjs", "apps/web/scripts/verify-site-current.test.ts"]) {
  test(`only the exact public website policy lines are admitted in ${path}`, () => {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    const lines = source.split("\n").filter(value => value.includes(host));
    const line = lines[0]!;
    expect(standaloneAnalyticsPolicyScanText(path, source)).toBe(lines.reduce((remaining, value) => remaining.replace(value, ""), source));
    for (const other of ["src/analytics.ts", `nested/${path}`, `${path}.extra`]) {
      expect(standaloneAnalyticsPolicyScanText(other, source)).toBe(source);
    }
    for (const rejected of [source + line, source + host,
      source.replace(host, `${host}.example`), source.replace(`https://${host}`, `https://${host}/login`),
      ...(source.includes("connect-src ") ? [source.replace("connect-src ", "connect-src https://unreviewed.example ")] : []),
      ...(lines.length > 1 ? [source.replace(line, "")] : []),
    ]) {
      expect(standaloneAnalyticsPolicyScanText(path, rejected)).toBe(rejected);
    }
    if (lines.length > 1) {
      const reorderedLines = source.split("\n");
      const positions = reorderedLines.flatMap((value, index) => value.includes(host) ? [index] : []);
      const first = positions[0]!;
      const last = positions.at(-1)!;
      [reorderedLines[first], reorderedLines[last]] = [reorderedLines[last]!, reorderedLines[first]!];
      const reordered = reorderedLines.join("\n");
      expect(reordered).not.toBe(source);
      expect(standaloneAnalyticsPolicyScanText(path, reordered)).toBe(reordered);
    }
  });
}
