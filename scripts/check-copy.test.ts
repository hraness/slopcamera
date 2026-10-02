import { expect, test } from "bun:test";
import {
  COPY_RULES,
  advertisedVersion,
  collectCommitLinks,
  collectCopyClaims,
  numberValue,
  type CopyFacts,
} from "./copy-facts";

const facts: CopyFacts = {
  animationStudyCount: 12,
  generalToolNames: ["check_diagram", "render_diagram", "search_slopcamera", "execute_slopcamera"],
  hostedApiPathCount: 8,
  mediaToolNames: [],
  hostedToolCount: 17,
  htmlFilmTemplates: ["launch-film"],
  htmlProfileCount: 7,
  mcpMaximumEdges: 128,
  mcpMaximumReturnedFindings: 40,
  mcpMaximumShapes: 64,
  mcpToolNames: [
    "check_diagram", "render_diagram", "search_slopcamera", "execute_slopcamera",
    "check_scene", "inspect_scene", "audit_scene", "diff_scenes", "evaluate_scene",
    "check_scene_direction", "plan_scene_direction", "plan_scene_gallery",
    "check_scene_effects", "plan_scene_effects", "check_scene_behavior",
    "audit_scene_behavior", "audit_scene_temporal",
  ],
  operationCodes: [
    "slopcamera.diagram.check", "slopcamera.diagram.render", "slopcamera.image.vectorize",
    "slopcamera.image.generate", "slopcamera.image.icon", "slopcamera.image.gallery",
  ],
  portableOperationKinds: [
    "slopcamera.diagram.check", "slopcamera.diagram.render",
    "slopcamera.image.generate", "slopcamera.image.vectorize",
  ],
  releaseCommit: "e08bacf68c140062d9e2aebf314a4bd5d4d17cb7",
  riggedGlb: { images: 32, jointsPerSkin: 256, moduleMiB: 32, nodes: 1024, skins: 64 },
  sceneGlb: { imageMiB: 16, imageTotalMiB: 32, images: 128, primitives: 256, triangles: 100_000, verticesPerPrimitive: 65_536 },
  styleProfileCount: 17,
  version: "3.4.0",
  workflowCount: 8,
};

const problems = (text: string, path = "docs/reference/page.md") =>
  collectCopyClaims(path, text, facts).filter((claim) => claim.problem !== undefined);
const rules = (text: string, path = "docs/reference/page.md") =>
  collectCopyClaims(path, text, facts).map((claim) => claim.rule);

test("numbers are read as digits, thousands groups, or words in any case", () => {
  expect(numberValue("17")).toBe(17);
  expect(numberValue("1,024")).toBe(1024);
  expect(numberValue("Seventeen")).toBe(17);
  expect(numberValue("thirteen")).toBe(13);
  expect(numberValue("many")).toBeUndefined();
  expect(numberValue("1,0")).toBeUndefined();
});

test("every rule has a unique name and one capture", () => {
  const names = new Set<string>();
  for (const rule of COPY_RULES) {
    expect(names.has(rule.name)).toBe(false);
    names.add(rule.name);
    expect(new RegExp(`${rule.pattern.source}|`, rule.pattern.flags).exec("")?.length).toBe(2);
    expect(rule.pattern.flags).toContain("g");
  }
});

test("matching counts, versions, names and the release commit pass", () => {
  const text = [
    "SlopCamera v3.4.0 exposes six operation codes: diagram check/render, image generate/vectorize, and image icon/gallery.",
    "Its MCP server has 17 named tools: `check_diagram`, `render_diagram`, `search_slopcamera`, `execute_slopcamera`, and 13 scene tools such as `audit_scene_temporal`.",
    "The portable projection contains four operations; the skill calls it the four-operation projection.",
    "Seventeen read-only visual style profiles, seven authoring profiles, and eight workflows; all 17 profiles are read-only.",
    "Diagram tools admit at most 64 shapes and 128 edges with at most 40 reported findings.",
    "It admits at most 1,024 nodes, 64 skins, 256 joints per skin, 32 extracted images, and a 32 MiB generated module.",
    "| Capability | Slopcamera v3.4.0 |",
    "The immutable [v3.4.0 release](https://example.invalid) contains the following command families. Its canonical archive is built from `e08bacf68c140062d9e2aebf314a4bd5d4d17cb7`.",
    "`slopcamera.image.vectorize` runs locally; twelve animation studies ship in the example.",
    "Run `slopcamera html init film --template launch-film --aspect 9:16`; there is one film template.",
  ].join("\n");
  expect(problems(text)).toEqual([]);
  expect(new Set(rules(text))).toEqual(new Set([
    "current-version", "operation-codes", "operation-code-names", "mcp-tools", "mcp-tool-names",
    "scene-tools", "portable-projection", "portable-projection-hyphenated", "style-profiles",
    "html-profiles", "workflows", "diagram-shapes", "diagram-edges", "diagram-findings",
    "rigged-glb-nodes", "rigged-glb-skins", "rigged-glb-joints", "rigged-glb-images",
    "rigged-glb-module", "release-commit", "animation-studies", "bare-profiles",
    "html-film-template-ids", "html-film-templates",
  ]));
});

test("stale counts, versions, names and commits are reported with their line", () => {
  const text = [
    "The portable projection contains six operations.",
    "MCP exposes a fixed set of 16 tools and five operation codes.",
    "SlopCamera v3.3.1 exposes the registry.",
    "Its canonical archive is built from `88aa724005ed924b6763f9a0fe39505d632c6191`.",
    "Call `render_diagrams` or `slopcamera.image.upscale`.",
    "Twelve read-mostly scene tools and nineteen style profiles; seven HTML profiles; 9 profiles.",
    "Run slopcamera html init film --template product-tour; two film templates ship.",
  ].join("\n");
  const found = problems(text);
  expect(found.map((claim) => [claim.line, claim.rule])).toEqual([
    [1, "portable-projection"],
    [2, "mcp-tools"],
    [2, "operation-codes"],
    [3, "current-version"],
    [4, "release-commit"],
    [5, "mcp-tool-names"],
    [5, "operation-code-names"],
    [6, "scene-tools"],
    [6, "style-profiles"],
    [6, "bare-profiles"],
    [7, "html-film-templates"],
    [7, "html-film-template-ids"],
  ]);
  expect(found[0]!.problem).toContain("says six; source says 4");
  expect(found[4]!.problem).toContain("source says e08bacf68c140062d9e2aebf314a4bd5d4d17cb7");
});

test("historical phrasing and singular operation codes are not read as current claims", () => {
  const text = [
    "Slopcamera v3.3.1 introduced the cinematic planning loop.",
    "This release includes the three renderer corrections introduced in v3.3.4 that v3.3.1 lacks.",
    "`execute_slopcamera` runs one exact operation code from the registry.",
    "The vectorizer emitted 201 paths; the gallery holds up to 64 studies.",
  ].join("\n");
  expect(collectCopyClaims("docs/page.md", text, facts).filter((claim) => claim.rule !== "mcp-tool-names")).toEqual([]);
});

test("the release commit is unverified rather than wrong when the tag is unavailable", () => {
  const { releaseCommit: _releaseCommit, ...withoutTag } = facts;
  const claims = collectCopyClaims(
    "docs/reference/capabilities.md",
    "Its canonical archive is built from `88aa724005ed924b6763f9a0fe39505d632c6191`.",
    withoutTag,
  );
  expect(claims).toHaveLength(1);
  expect(claims[0]!.rule).toBe("release-commit (unverified)");
  expect(claims[0]!.problem).toBeUndefined();
});

test("rules can be limited to a surface", () => {
  const evidence = "`GET /v1/tools` returned 17 tools with tiers.";
  expect(rules(evidence, "docs/platform-submission.md")).toEqual(["hosted-tools"]);
  expect(rules(evidence, "docs/reference/sdk.md")).toEqual(["mcp-tools", "hosted-tools"]);
});

test("commit, tree and blob links are collected with their line", () => {
  const text = [
    "See https://github.com/hraness/slopcamera/commit/81217777f193718e20351a886516ecae445590a9 for the fix,",
    "the [sources](https://github.com/hraness/slopcamera/tree/63a0e3eed460fa80f1ae76983e9152c75a124392/examples/design),",
    "and https://github.com/hraness/slopcamera/blob/63a0e3e/README.md; releases/tag/v3.4.0 is not a commit link.",
  ].join("\n");
  expect(collectCommitLinks("docs/page.md", text)).toEqual([
    { line: 1, path: "docs/page.md", sha: "81217777f193718e20351a886516ecae445590a9" },
    { line: 2, path: "docs/page.md", sha: "63a0e3eed460fa80f1ae76983e9152c75a124392" },
    { line: 3, path: "docs/page.md", sha: "63a0e3e" },
  ]);
});

test("a release candidate may run ahead of the advertised release, never behind it", () => {
  expect(advertisedVersion("3.4.0", "3.4.0")).toBe("3.4.0");
  expect(advertisedVersion("3.5.0", "3.4.0")).toBe("3.4.0");
  expect(advertisedVersion("3.4.1", "3.4.0")).toBe("3.4.0");
  expect(advertisedVersion("4.0.0", "3.9.9")).toBe("3.9.9");
  expect(advertisedVersion("3.10.0", "3.9.0")).toBe("3.9.0");
  expect(() => advertisedVersion("3.3.9", "3.4.0")).toThrow("which is older");
  expect(() => advertisedVersion("3.4.0-beta.1", "3.4.0")).toThrow("not MAJOR.MINOR.PATCH");
  expect(() => advertisedVersion("3.4.0", "v3.4.0")).toThrow("not MAJOR.MINOR.PATCH");
});

test("icon and soundtrack tools count separately from scene tools", () => {
  const withMedia: CopyFacts = {
    ...facts,
    mediaToolNames: ["compose_icon", "render_icon", "compose_soundtrack", "derive_soundtrack_grid"],
    mcpToolNames: [
      ...facts.mcpToolNames,
      "compose_icon", "render_icon", "compose_soundtrack", "derive_soundtrack_grid",
    ],
  };
  const text = "It has 21 named tools: 13 scene tools, four local icon and soundtrack tools, and `derive_soundtrack_grid`.";
  expect(collectCopyClaims("docs/reference/page.md", text, withMedia).filter((claim) => claim.problem !== undefined)).toEqual([]);
  expect(new Set(collectCopyClaims("docs/reference/page.md", text, withMedia).map((claim) => claim.rule)))
    .toEqual(new Set(["mcp-tools", "scene-tools", "media-tools", "mcp-tool-names"]));
  const stale = collectCopyClaims("docs/reference/page.md", "17 scene tools and three icon and soundtrack tools", withMedia)
    .filter((claim) => claim.problem !== undefined)
    .map((claim) => claim.rule);
  expect(stale).toEqual(["scene-tools", "media-tools"]);
});

test("static-scene GLB import limits are checked against the parser profile", () => {
  const current = "It allows up to 100,000 triangles, 256 primitives, 65,536 vertices per primitive, 128 images, 16 MiB per image and 32 MiB of images in total.";
  expect(problems(current)).toEqual([]);
  const stale = "It allows up to 50,000 triangles, 256 primitives, 65,536 vertices per primitive, 64 images, 16 MiB per image and 32 MiB of images in total.";
  expect(problems(stale).map((claim) => claim.rule)).toEqual(["scene-glb-triangles", "scene-glb-images"]);
});
