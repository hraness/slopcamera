import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { supportHref } from "../apps/web/scripts/site-support-profile";
import { standaloneAnalyticsPolicyScanText } from "./standalone-analytics-policy";

const host = new URL(supportHref).hostname;
for (const path of ["apps/web/vercel.json", "apps/web/site.test.ts"]) {
  test(`only the exact public website policy line is admitted in ${path}`, () => {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    const line = source.split("\n").find(value => value.includes(host))!;
    expect(standaloneAnalyticsPolicyScanText(path, source)).toBe(source.replace(line, ""));
    for (const other of ["src/analytics.ts", `nested/${path}`, `${path}.extra`]) {
      expect(standaloneAnalyticsPolicyScanText(other, source)).toBe(source);
    }
    for (const rejected of [source + line, source + host,
      source.replace(host, `${host}.example`), source.replace(`https://${host}`, `https://${host}/login`),
      source.replace("connect-src ", "connect-src https://unreviewed.example ")]) {
      expect(standaloneAnalyticsPolicyScanText(path, rejected)).toBe(rejected);
    }
  });
}
