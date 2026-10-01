import { createHash } from "node:crypto";
import { supportHref } from "../apps/web/scripts/site-support-profile";

// The static public website may contact the regional analytics policy service.
// Exact reviewed CSP, verification and assertion lines are the only admitted source uses;
// this does not admit an account client or a dependency in the local runtime.
const admittedLines: Readonly<Record<string, readonly string[]>> = {
  "apps/web/vercel.json": [
    "30f89c70cc44f3c71028226c6c00d6a7a2724f0211b45b5b54d061c70dd6fb6d",
  ],
  "apps/web/site.test.ts": [
    "a72e61e89ea54e50c269f34cf29aaaa76c6b77bc7a8802bde82b05df5c772089",
  ],
  "apps/web/scripts/verify-site-current.mjs": [
    "b4f602024a78d507ef099eac5cb4767f62671bdefca5ca39fa2ecdd9a8280f6b",
  ],
  "apps/web/scripts/verify-site-current.test.ts": [
    "3a3dbfa5ecfc5be7e6ba99192f5bd0b0c60b3824b0052ea30b497d8619d2f404",
    "37b5e22e8c8177d17d93e4ec713ce9baaf3898c73cfa9da6a1ac98e7de01a99d",
    "b8595a5695d87c4a2a73a55c690706b2e60e46efe9cb14e9c6d654ae92b45093",
    "2f909af45bf4e5c9783e6bcfb5c6c7518da0464e753ea5747522abbc89facb67",
    "ab1c5595829fe9ffd16954b262f8d8d1506c1cd4c60b19b0bbbe1545180dc1b9",
  ],
};

export function standaloneAnalyticsPolicyScanText(path: string, text: string): string {
  const expected = admittedLines[path];
  if (expected === undefined) return text;
  const host = new URL(supportHref).hostname;
  const lines = text.split("\n").filter(line => line.toLowerCase().includes(host));
  if (lines.length !== expected.length) return text;
  if (lines.some((line, index) => createHash("sha256").update(line).digest("hex") !== expected[index])) return text;
  return lines.reduce((remaining, line) => remaining.replace(line, ""), text);
}
