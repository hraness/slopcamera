/**
 * Public-copy fact rules.
 *
 * Every maintained prose surface (README, `docs/`, `apps/web/src/docs/`,
 * `skills/`, generated agent pages) states facts that the source already
 * defines: how many MCP tools exist, how many operation codes, which
 * release is current, which commits a link points at. Those facts drift
 * whenever a lane changes source without touching every copy, and the two
 * documentation trees are hand-maintained copies of each other, so nothing
 * else keeps them aligned.
 *
 * `scripts/check-copy.ts` loads the facts from source and runs these rules
 * over every surface. Add a rule here when a new count or identifier enters
 * public copy; add a fact when a new source constant becomes citable.
 */

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20,
};

/** A number written in digits (with optional thousands separators) or as a word. */
export const NUMBER = String.raw`(\d{1,3}(?:,\d{3})+|\d+|${Object.keys(NUMBER_WORDS).join("|")})`;

export function numberValue(token: string): number | undefined {
  const normalized = token.trim().toLowerCase();
  if (normalized in NUMBER_WORDS) return NUMBER_WORDS[normalized];
  if (/^\d{1,3}(?:,\d{3})+$/u.test(normalized) || /^\d+$/u.test(normalized)) {
    return Number.parseInt(normalized.replaceAll(",", ""), 10);
  }
  return undefined;
}

export interface CopyFacts {
  /** `package.json` version; the website's published release must match it. */
  readonly version: string;
  /** Commit the current release tag resolves to, when history is available. */
  readonly releaseCommit?: string;
  readonly mcpToolNames: readonly string[];
  /** Tools that are not scene tools: diagram check/render, search, execute. */
  readonly generalToolNames: readonly string[];
  readonly operationCodes: readonly string[];
  readonly portableOperationKinds: readonly string[];
  readonly workflowCount: number;
  readonly styleProfileCount: number;
  readonly htmlProfileCount: number;
  readonly animationStudyCount: number;
  readonly hostedToolCount: number;
  readonly hostedApiPathCount: number;
  readonly mcpMaximumShapes: number;
  readonly mcpMaximumEdges: number;
  readonly mcpMaximumReturnedFindings: number;
  readonly riggedGlb: {
    readonly nodes: number;
    readonly skins: number;
    readonly jointsPerSkin: number;
    readonly images: number;
    readonly moduleMiB: number;
  };
}

export interface CopyClaim {
  readonly path: string;
  readonly line: number;
  readonly text: string;
  readonly rule: string;
  /** Empty when the claim matches source. */
  readonly problem?: string;
}

interface CountRule {
  readonly kind: "count";
  readonly name: string;
  /** Must contain exactly one `NUMBER` capture. */
  readonly pattern: RegExp;
  readonly expected: (facts: CopyFacts) => readonly number[];
  readonly describe: string;
  /** Restrict a rule to surfaces whose path matches. */
  readonly paths?: RegExp;
}

interface TextRule {
  readonly kind: "text";
  readonly name: string;
  /** Must contain exactly one capture: the cited value. */
  readonly pattern: RegExp;
  readonly expected: (facts: CopyFacts) => string | undefined;
  readonly describe: string;
  readonly paths?: RegExp;
}

interface MemberRule {
  readonly kind: "member";
  readonly name: string;
  /** Must contain exactly one capture: the cited identifier. */
  readonly pattern: RegExp;
  readonly members: (facts: CopyFacts) => readonly string[];
  readonly describe: string;
  readonly paths?: RegExp;
}

export type CopyRule = CountRule | TextRule | MemberRule;

const re = (source: string): RegExp => new RegExp(source, "giu");

export const COPY_RULES: readonly CopyRule[] = [
  {
    kind: "count",
    name: "mcp-tools",
    pattern: re(String.raw`\b${NUMBER} (?:named |fixed )?tools\b`),
    expected: (facts) => [facts.mcpToolNames.length],
    describe: "MCP tool count (`slopcameraMcpTools` in src/mcp/tools.ts)",
    paths: /^(?!docs\/platform-submission\.md$)/u,
  },
  {
    kind: "count",
    name: "hosted-tools",
    pattern: re(String.raw`\b${NUMBER} tools with tiers\b`),
    expected: (facts) => [facts.hostedToolCount],
    describe: "hosted tool count (`hostedTools` in apps/api/src/tools.ts)",
  },
  {
    kind: "count",
    name: "scene-tools",
    pattern: re(String.raw`\b${NUMBER} (?:read-mostly |read-only )?scene tools\b`),
    expected: (facts) => [facts.mcpToolNames.length - facts.generalToolNames.length],
    describe: "MCP scene tool count (every tool except diagram check/render, search and execute)",
  },
  {
    kind: "count",
    name: "operation-codes",
    pattern: re(String.raw`\b${NUMBER} (?:bounded |portable |exact |semantic )*operation codes\b`),
    expected: (facts) => [facts.operationCodes.length],
    describe: "operation code count (`slopcameraOperationCodes` in src/operations.ts)",
  },
  {
    kind: "count",
    name: "portable-projection",
    pattern: re(String.raw`\bportable projection (?:has|contains|covers|holds) ${NUMBER} operations\b`),
    expected: (facts) => [facts.portableOperationKinds.length],
    describe: "typed portable projection size (`PORTABLE_SLOPCAMERA_OPERATION_KINDS` in src/code/public-operations.ts)",
  },
  {
    kind: "count",
    name: "portable-projection-hyphenated",
    pattern: re(String.raw`\b${NUMBER}-operation\b`),
    expected: (facts) => [facts.portableOperationKinds.length],
    describe: "typed portable projection size (`PORTABLE_SLOPCAMERA_OPERATION_KINDS` in src/code/public-operations.ts)",
  },
  {
    kind: "count",
    name: "workflows",
    pattern: re(String.raw`\b${NUMBER} (?:built-in |reviewed |reproducible )?workflows\b`),
    expected: (facts) => [facts.workflowCount],
    describe: "built-in workflow count (`BUILT_IN_WORKFLOWS` in apps/desktop/workflows/index.ts)",
  },
  {
    kind: "count",
    name: "style-profiles",
    pattern: re(String.raw`\b${NUMBER} (?:read-only |reusable |visual )*style profiles\b`),
    expected: (facts) => [facts.styleProfileCount],
    describe: "style profile count (`VISUAL_STYLE_IDS` in src/visual-style.ts)",
  },
  {
    kind: "count",
    name: "html-profiles",
    pattern: re(String.raw`\b${NUMBER} (?:HTML |authoring |named )+profiles\b`),
    expected: (facts) => [facts.htmlProfileCount],
    describe: "HTML profile count (`HTML_OVERLAY_SCAFFOLD_KINDS` in apps/desktop/html-overlay/catalog.ts)",
  },
  {
    kind: "count",
    name: "bare-profiles",
    pattern: re(String.raw`\b${NUMBER} profiles\b`),
    expected: (facts) => [facts.styleProfileCount, facts.htmlProfileCount],
    describe: "a profile count must be the style profile count or the HTML profile count",
  },
  {
    kind: "count",
    name: "animation-studies",
    pattern: re(String.raw`\b${NUMBER} animation studies\b`),
    expected: (facts) => [facts.animationStudyCount],
    describe: "animation study count (`studies` in examples/style-portfolio/render.ts)",
  },
  {
    kind: "count",
    name: "hosted-api-paths",
    pattern: re(String.raw`\ball ${NUMBER} paths\b`),
    expected: (facts) => [facts.hostedApiPathCount],
    describe: "hosted OpenAPI path count (`openApiDocument.paths` in apps/api/src/openapi.ts)",
  },
  {
    kind: "count",
    name: "diagram-shapes",
    pattern: re(String.raw`\bat most ${NUMBER} shapes\b`),
    expected: (facts) => [facts.mcpMaximumShapes],
    describe: "`mcpMaximumShapes` in src/mcp/tools.ts",
  },
  {
    kind: "count",
    name: "diagram-edges",
    pattern: re(String.raw`\bshapes and ${NUMBER} edges\b`),
    expected: (facts) => [facts.mcpMaximumEdges],
    describe: "`mcpMaximumEdges` in src/mcp/tools.ts",
  },
  {
    kind: "count",
    name: "diagram-findings",
    pattern: re(String.raw`\bat most ${NUMBER} (?:reported |returned )?findings\b`),
    expected: (facts) => [facts.mcpMaximumReturnedFindings],
    describe: "`mcpMaximumReturnedFindings` in src/mcp/tools.ts",
  },
  {
    kind: "count",
    name: "rigged-glb-nodes",
    pattern: re(String.raw`\bat most ${NUMBER} nodes\b`),
    expected: (facts) => [facts.riggedGlb.nodes],
    describe: "`THREE_RIGGED_GLB_LIMITS.nodes` in apps/desktop/html-overlay/rigged-glb.ts",
  },
  {
    kind: "count",
    name: "rigged-glb-skins",
    pattern: re(String.raw`\bnodes, ${NUMBER} skins\b`),
    expected: (facts) => [facts.riggedGlb.skins],
    describe: "`THREE_RIGGED_GLB_LIMITS.skins` in apps/desktop/html-overlay/rigged-glb.ts",
  },
  {
    kind: "count",
    name: "rigged-glb-joints",
    pattern: re(String.raw`\b${NUMBER} joints per skin\b`),
    expected: (facts) => [facts.riggedGlb.jointsPerSkin],
    describe: "`THREE_RIGGED_GLB_LIMITS.jointsPerSkin` in apps/desktop/html-overlay/rigged-glb.ts",
  },
  {
    kind: "count",
    name: "rigged-glb-images",
    pattern: re(String.raw`\b${NUMBER} extracted images\b`),
    expected: (facts) => [facts.riggedGlb.images],
    describe: "`THREE_RIGGED_GLB_LIMITS.images` in apps/desktop/html-overlay/rigged-glb.ts",
  },
  {
    kind: "count",
    name: "rigged-glb-module",
    pattern: re(String.raw`\ba ${NUMBER} MiB generated module\b`),
    expected: (facts) => [facts.riggedGlb.moduleMiB],
    describe: "`THREE_RIGGED_GLB_LIMITS.moduleBytes` in apps/desktop/html-overlay/rigged-glb.ts",
  },
  {
    kind: "text",
    name: "current-version",
    pattern: re(
      String.raw`(?:\bthe v|\| Slopcamera v|immutable \[v|\bSlopcamera v)(\d+\.\d+\.\d+)(?= portable projection\b| MCP server\b| \||(?: release\])|(?: (?:exposes|contains|includes|ships|serves)\b))`,
    ),
    expected: (facts) => facts.version,
    describe: "current release version (`package.json`); historical mentions use a different phrasing such as \"introduced in\"",
  },
  {
    kind: "text",
    name: "release-commit",
    pattern: re(String.raw`canonical archive is built from \x60([0-9a-f]{7,40})\x60`),
    expected: (facts) => facts.releaseCommit,
    describe: "commit the current release tag resolves to (`git rev-list -n1 v<version>`)",
  },
  {
    kind: "member",
    name: "mcp-tool-names",
    pattern: re(String.raw`\x60((?:check|render|search|execute|inspect|audit|diff|evaluate|plan)_[a-z_]+)\x60`),
    members: (facts) => facts.mcpToolNames,
    describe: "an MCP tool name that `slopcameraMcpTools` does not define",
  },
  {
    kind: "member",
    name: "operation-code-names",
    pattern: re(String.raw`\b(slopcamera\.(?:diagram|image)\.[a-z]+)\b`),
    members: (facts) => facts.operationCodes,
    describe: "an operation code that `slopcameraOperationCodes` does not define",
  },
];

function lineNumberAt(text: string, index: number): number {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (text.charCodeAt(cursor) === 10) line += 1;
  }
  return line;
}

/** Runs every rule over one surface and returns each claim with its verdict. */
export function collectCopyClaims(
  path: string,
  text: string,
  facts: CopyFacts,
  rules: readonly CopyRule[] = COPY_RULES,
): CopyClaim[] {
  const claims: CopyClaim[] = [];
  for (const rule of rules) {
    if (rule.paths !== undefined && !rule.paths.test(path)) continue;
    rule.pattern.lastIndex = 0;
    for (const match of text.matchAll(rule.pattern)) {
      const cited = match[1];
      if (cited === undefined) continue;
      const base = {
        line: lineNumberAt(text, match.index ?? 0),
        path,
        rule: rule.name,
        text: match[0],
      };
      if (rule.kind === "count") {
        const value = numberValue(cited);
        const expected = rule.expected(facts);
        if (value === undefined || !expected.includes(value)) {
          claims.push({
            ...base,
            problem: `says ${cited}; source says ${expected.join(" or ")} (${rule.describe})`,
          });
        } else {
          claims.push(base);
        }
      } else if (rule.kind === "text") {
        const expected = rule.expected(facts);
        if (expected === undefined) {
          claims.push({ ...base, rule: `${rule.name} (unverified)` });
        } else if (!expected.startsWith(cited) && cited !== expected) {
          claims.push({
            ...base,
            problem: `says ${cited}; source says ${expected} (${rule.describe})`,
          });
        } else {
          claims.push(base);
        }
      } else if (!rule.members(facts).includes(cited)) {
        claims.push({ ...base, problem: `${rule.describe}: ${cited}` });
      } else {
        claims.push(base);
      }
    }
  }
  return claims.sort((left, right) => left.line - right.line);
}

const COMMIT_LINK = /github\.com\/hraness\/slopcamera\/(?:commit|tree|blob)\/([0-9a-f]{7,40})\b/giu;

/** Every commit, tree or blob link in a surface, with its line. */
export function collectCommitLinks(
  path: string,
  text: string,
): { readonly path: string; readonly line: number; readonly sha: string }[] {
  const links: { path: string; line: number; sha: string }[] = [];
  COMMIT_LINK.lastIndex = 0;
  for (const match of text.matchAll(COMMIT_LINK)) {
    links.push({ line: lineNumberAt(text, match.index ?? 0), path, sha: match[1]! });
  }
  return links;
}
