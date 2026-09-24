/**
 * Verifies that public copy states the facts the source defines.
 *
 * Usage: bun scripts/check-copy.ts [--list] [--require-history]
 *
 * `--list` prints every recognized claim with its verdict, which is the way to
 * see what a new sentence will be held to. `--require-history` turns the
 * git-backed checks (release commit, commit-link ancestry) from best effort
 * into requirements; CI passes it after a full-history checkout. Without it a
 * shallow clone still fails on a linked commit it knows is not on HEAD, and
 * only reports what it could not resolve.
 *
 * Surfaces: README.md, docs/**, apps/web/src/docs/**, skills/**, the generated
 * agent pages and the home page. Commit links are also checked in every
 * examples/** README.
 */
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { openApiDocument } from "../apps/api/src/openapi";
import { hostedTools } from "../apps/api/src/tools";
import { HTML_OVERLAY_SCAFFOLD_KINDS } from "../apps/desktop/html-overlay/catalog";
import { THREE_RIGGED_GLB_LIMITS } from "../apps/desktop/html-overlay/rigged-glb";
import { BUILT_IN_WORKFLOWS } from "../apps/desktop/workflows/index";
import { PORTABLE_SLOPCAMERA_OPERATION_KINDS } from "../src/code/public-operations";
import {
  mcpMaximumEdges,
  mcpMaximumReturnedFindings,
  mcpMaximumShapes,
  slopcameraMcpTools,
} from "../src/mcp/tools";
import { slopcameraOperationCodes } from "../src/operations";
import { VISUAL_STYLE_IDS } from "../src/visual-style";
import {
  collectCommitLinks,
  collectCopyClaims,
  type CopyClaim,
  type CopyFacts,
} from "./copy-facts";

const ROOT = new URL("../", import.meta.url).pathname;
const LIST = process.argv.includes("--list");
const REQUIRE_HISTORY = process.argv.includes("--require-history");
const unknownFlags = process.argv.slice(2).filter(
  (flag) => flag !== "--list" && flag !== "--require-history",
);
if (unknownFlags.length > 0) {
  console.error("Usage: bun scripts/check-copy.ts [--list] [--require-history]");
  process.exit(2);
}

const CLAIM_SURFACES = {
  files: ["README.md", "apps/web/src/agent-pages.ts", "apps/web/src/index.html"],
  roots: ["docs", "apps/web/src/docs", "skills"],
};
const COMMIT_LINK_ROOTS = ["examples"];
const GENERAL_TOOL_NAMES = [
  "check_diagram",
  "render_diagram",
  "search_slopcamera",
  "execute_slopcamera",
];

async function markdownFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  const entries = await readdir(join(ROOT, root), { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    found.push(relative(ROOT, join(entry.parentPath, entry.name)));
  }
  return found.sort();
}

function git(...args: string[]): string | undefined {
  const result = Bun.spawnSync(["git", ...args], { cwd: ROOT, stderr: "pipe", stdout: "pipe" });
  return result.exitCode === 0 ? result.stdout.toString().trim() : undefined;
}

async function animationStudyCount(): Promise<number> {
  const source = await readFile(join(ROOT, "examples/style-portfolio/render.ts"), "utf8");
  const list = source.match(/const studies = \[([\s\S]*?)\] as const/u)?.[1];
  if (list === undefined) {
    throw new Error("examples/style-portfolio/render.ts no longer declares `studies`.");
  }
  return [...list.matchAll(/"([^"]+)"/gu)].length;
}

async function loadFacts(): Promise<CopyFacts> {
  const packageJson = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as {
    version: string;
  };
  const published = JSON.parse(
    await readFile(join(ROOT, "apps/web/published-release.json"), "utf8"),
  ) as { version: string };
  if (published.version !== packageJson.version) {
    throw new Error(
      `apps/web/published-release.json says ${published.version}; package.json says ${packageJson.version}.`,
    );
  }
  const releaseCommit = git("rev-list", "-n1", `v${packageJson.version}`);
  return {
    animationStudyCount: await animationStudyCount(),
    generalToolNames: GENERAL_TOOL_NAMES,
    hostedApiPathCount: Object.keys(
      (openApiDocument("https://api.slopcamera.com").paths ?? {}) as Record<string, unknown>,
    ).length,
    hostedToolCount: hostedTools.length,
    htmlProfileCount: HTML_OVERLAY_SCAFFOLD_KINDS.length,
    mcpMaximumEdges,
    mcpMaximumReturnedFindings,
    mcpMaximumShapes,
    mcpToolNames: slopcameraMcpTools.map((tool) => tool.name),
    operationCodes: slopcameraOperationCodes,
    portableOperationKinds: PORTABLE_SLOPCAMERA_OPERATION_KINDS,
    ...(releaseCommit === undefined ? {} : { releaseCommit }),
    riggedGlb: {
      images: THREE_RIGGED_GLB_LIMITS.images,
      jointsPerSkin: THREE_RIGGED_GLB_LIMITS.jointsPerSkin,
      moduleMiB: THREE_RIGGED_GLB_LIMITS.moduleBytes / (1024 * 1024),
      nodes: THREE_RIGGED_GLB_LIMITS.nodes,
      skins: THREE_RIGGED_GLB_LIMITS.skins,
    },
    styleProfileCount: VISUAL_STYLE_IDS.length,
    version: packageJson.version,
    workflowCount: BUILT_IN_WORKFLOWS.length,
  };
}

for (const name of GENERAL_TOOL_NAMES) {
  if (!slopcameraMcpTools.some((tool) => tool.name === name)) {
    console.error(`check-copy: general MCP tool ${name} no longer exists; update GENERAL_TOOL_NAMES.`);
    process.exit(2);
  }
}
const facts = await loadFacts();
const shallow = git("rev-parse", "--is-shallow-repository") !== "false";
if (REQUIRE_HISTORY && (shallow || facts.releaseCommit === undefined)) {
  console.error(
    `check-copy: --require-history needs a full-history checkout that resolves tag v${facts.version}.`,
  );
  process.exit(2);
}

const claimSurfaces = [
  ...CLAIM_SURFACES.files,
  ...(await Promise.all(CLAIM_SURFACES.roots.map(markdownFiles))).flat(),
];
const linkSurfaces = [
  ...claimSurfaces,
  ...(await Promise.all(COMMIT_LINK_ROOTS.map(markdownFiles))).flat(),
];

const claims: CopyClaim[] = [];
for (const path of claimSurfaces) {
  claims.push(...collectCopyClaims(path, await readFile(join(ROOT, path), "utf8"), facts));
}
const problems = claims.filter((claim) => claim.problem !== undefined);
const unverified = claims.filter((claim) => claim.rule.endsWith("(unverified)"));

const linkProblems: string[] = [];
let linkCount = 0;
let unresolvedLinks = 0;
const verdicts = new Map<string, "on-head" | "off-head" | "unknown">();
for (const path of linkSurfaces) {
  for (const link of collectCommitLinks(path, await readFile(join(ROOT, path), "utf8"))) {
    linkCount += 1;
    let verdict = verdicts.get(link.sha);
    if (verdict === undefined) {
      if (git("cat-file", "-e", `${link.sha}^{commit}`) === undefined) {
        verdict = "unknown";
      } else {
        verdict = git("merge-base", "--is-ancestor", link.sha, "HEAD") === undefined
          ? "off-head"
          : "on-head";
      }
      verdicts.set(link.sha, verdict);
    }
    if (verdict === "off-head") {
      linkProblems.push(
        `${link.path}:${link.line}: links commit ${link.sha}, which is not an ancestor of HEAD; link the merged commit instead`,
      );
    } else if (verdict === "unknown") {
      unresolvedLinks += 1;
      if (REQUIRE_HISTORY) {
        linkProblems.push(
          `${link.path}:${link.line}: links commit ${link.sha}, which this repository does not contain`,
        );
      }
    }
  }
}

if (LIST) {
  for (const claim of claims) {
    const verdict = claim.problem === undefined ? "ok" : `MISMATCH ${claim.problem}`;
    console.log(`${claim.path}:${claim.line}: [${claim.rule}] "${claim.text}" ${verdict}`);
  }
}

const failures = [
  ...problems.map((claim) => `${claim.path}:${claim.line}: "${claim.text}" ${claim.problem}`),
  ...linkProblems,
  ...(REQUIRE_HISTORY
    ? unverified.map((claim) => `${claim.path}:${claim.line}: "${claim.text}" could not be verified`)
    : []),
];
if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  console.error(
    `check-copy: ${failures.length} public-copy claim(s) disagree with source. Fix the copy (or the source); change scripts/copy-facts.ts only when a rule itself is wrong.`,
  );
  process.exit(1);
}
const notes: string[] = [];
if (unverified.length > 0) notes.push(`${unverified.length} release-commit claim(s) unverified (tag unavailable)`);
if (unresolvedLinks > 0) notes.push(`${unresolvedLinks} commit link(s) unresolved in this ${shallow ? "shallow " : ""}clone`);
console.log(
  `Public copy verified: ${claims.length} claims across ${claimSurfaces.length} surfaces, ${linkCount} commit links${notes.length > 0 ? ` (${notes.join("; ")})` : ""}.`,
);
