import { createHash } from "node:crypto";
import { supportHref } from "../apps/web/scripts/site-support-profile";

// The static public website may contact the regional analytics policy service.
// Exact reviewed CSP and assertion lines are the only admitted source uses;
// this does not admit an account client or a dependency in the local runtime.
const admittedLines: Readonly<Record<string, string>> = {
  "apps/web/vercel.json": "30f89c70cc44f3c71028226c6c00d6a7a2724f0211b45b5b54d061c70dd6fb6d",
  "apps/web/site.test.ts": "a72e61e89ea54e50c269f34cf29aaaa76c6b77bc7a8802bde82b05df5c772089",
};

export function standaloneAnalyticsPolicyScanText(path: string, text: string): string {
  const expected = admittedLines[path];
  if (expected === undefined) return text;
  const host = new URL(supportHref).hostname;
  const lines = text.split("\n").filter(line => line.toLowerCase().includes(host));
  if (lines.length !== 1) return text;
  const line = lines[0]!;
  if (createHash("sha256").update(line).digest("hex") !== expected) return text;
  return text.replace(line, "");
}
