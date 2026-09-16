import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  generatedSpatialEntityId, parseSpatialScene, spatialGeneratorOutputSha256,
  type SpatialSceneV1,
} from "../../../src/spatial-scene/index";
import { canonicalJsonSha256, sha256Hex } from "../core/canonical-json";
import { operationApplicationContext } from "../application/operations/test-support";
import { parseCliArgs } from "./args";
import { executeSpatialSceneCommand } from "./spatial-scene-service";

async function fixture<T>(run: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "slopcamera-generate-"));
  try { return await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}

const MODULE = `
export function generate(ctx) {
  const shift = ctx.seed % 5;
  const entities = [];
  if (ctx.parameters.drop !== true) {
    entities.push({ key: "box-a", name: "A", kind: "mesh", parentId: null,
      transform: { position: [shift, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      placement: { kind: "world" }, visible: true,
      geometry: { kind: "box", size: [1, 1, 1] },
      material: { kind: "unlit", color: "#ff0000", opacity: 1 } });
  }
  entities.push({ key: "box-b", name: "B", kind: "mesh", parentId: null,
    transform: { position: [2 + shift, 0.5, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    placement: { kind: "world" }, visible: true,
    geometry: { kind: "sphere", radius: 0.5 },
    material: { kind: "unlit", color: "#00ff00", opacity: 1 } });
  return { entities, editableKeys: ctx.parameters.drop === true ? [] : [{ key: "box-a", properties: ["color"] }] };
}
`;

function generateArgs(argv: readonly string[]) {
  const command = parseCliArgs(["scene", "generate", ...argv]);
  if (command.kind !== "spatial-scene" || command.action !== "generate") throw new Error("Wrong command");
  return command;
}

test("scene generate argument parsing is closed and bounded", () => {
  expect(generateArgs(["--module", "gen.ts", "--generator-id", "generator_grid", "--output", "out.json", "--json"]))
    .toEqual({ kind: "spatial-scene", action: "generate", module: "gen.ts", generatorId: "generator_grid", output: "out.json", json: true });
  expect(generateArgs(["--module", "gen.ts", "--generator-id", "generator_grid", "--output", "out.json", "--seed", "7", "--parameters", "p.json", "--into", "base.json"]))
    .toMatchObject({ seed: 7, parameters: "p.json", into: "base.json" });
  expect(() => generateArgs(["--module", "gen.ts", "--output", "out.json"])).toThrow("requires --module, --generator-id, and --output");
  expect(() => generateArgs(["--module", "gen.ts", "--generator-id", "generator_grid", "--output", "out.json", "--seed", "4294967296"])).toThrow("--seed");
  expect(() => generateArgs(["--module", "gen.ts", "--generator-id", "generator_grid", "--output", "out.json", "extra"])).toThrow("Usage");
});

test("scene generate stamps derived identity, records digests, and is reproducible", async () => await fixture(async root => {
  await writeFile(join(root, "gen.ts"), MODULE);
  const application = operationApplicationContext(root);
  const first = await executeSpatialSceneCommand(application, generateArgs(["--module", "gen.ts", "--generator-id", "generator_t", "--seed", "3", "--output", "a.json"])) as { sceneSha256: string };
  const second = await executeSpatialSceneCommand(application, generateArgs(["--module", "gen.ts", "--generator-id", "generator_t", "--seed", "3", "--output", "b.json"])) as { sceneSha256: string };
  expect(first.sceneSha256).toBe(second.sceneSha256);
  await expect(executeSpatialSceneCommand(application, generateArgs(["--module", "gen.ts", "--generator-id", "generator_t", "--output", "a.json"]))).rejects.toThrow("exists");

  const scene = parseSpatialScene(JSON.parse(await readFile(join(root, "a.json"), "utf8")));
  expect(scene.entities).toHaveLength(2);
  for (const entity of scene.entities) {
    expect(entity.origin).toEqual({ kind: "generated", generatorId: "generator_t", key: entity.name === "A" ? "box-a" : "box-b" });
    expect(entity.entityId).toBe(generatedSpatialEntityId("generator_t", entity.origin.kind === "generated" ? entity.origin.key : ""));
  }
  const generator = scene.generators[0]!;
  expect(generator.generatorId).toBe("generator_t");
  expect(generator.seed).toBe(3);
  expect(generator.execution.kind).toBe("attempt");
  expect(generator.outputSha256).toBe(spatialGeneratorOutputSha256(scene.entities));
  expect(generator.sourceSha256).toMatch(/^[a-f0-9]{64}$/u);
  expect(generator.closureSha256).toBe(generator.sourceSha256);
  expect(generator.editableKeys).toEqual([{ key: "box-a", properties: ["color"] }]);
}));

test("scene generate --into replaces this generator's output and preserves the rest", async () => await fixture(async root => {
  await writeFile(join(root, "gen.ts"), MODULE);
  const application = operationApplicationContext(root);
  const init = parseCliArgs(["scene", "init", "starter.json"]);
  if (init.kind !== "spatial-scene" || init.action !== "init") throw new Error("Wrong command");
  await executeSpatialSceneCommand(application, init);

  const merged = await executeSpatialSceneCommand(application,
    generateArgs(["--module", "gen.ts", "--generator-id", "generator_t", "--seed", "3", "--into", "starter.json", "--output", "merged.json"])) as { sceneSha256: string };
  const firstScene = parseSpatialScene(JSON.parse(await readFile(join(root, "merged.json"), "utf8")));
  expect(firstScene.entities.filter(entity => entity.origin.kind === "authored")).toHaveLength(4);
  expect(firstScene.entities.filter(entity => entity.origin.kind === "generated")).toHaveLength(2);
  const firstDigest = merged.sceneSha256;

  // A second generator's retained output survives a later regeneration.
  await writeFile(join(root, "other.ts"), `export function generate() { return { entities: [{ key: "lamp", name: "Lamp", kind: "light", parentId: null, transform: { position: [0, 4, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }, placement: { kind: "world" }, visible: true, light: "point", color: "#ffffff", intensity: 2 }] }; }\n`);
  await executeSpatialSceneCommand(application,
    generateArgs(["--module", "other.ts", "--generator-id", "generator_other", "--seed", "1", "--into", "merged.json", "--output", "two.json"]));

  // Regenerating generator_t with a different seed replaces its entities wholesale.
  const third = await executeSpatialSceneCommand(application,
    generateArgs(["--module", "gen.ts", "--generator-id", "generator_t", "--seed", "8", "--into", "two.json", "--output", "three.json"])) as { sceneSha256: string };
  const scene = parseSpatialScene(JSON.parse(await readFile(join(root, "three.json"), "utf8")));
  expect(third.sceneSha256).not.toBe(firstDigest);
  const generated = scene.entities.filter(entity => entity.origin.kind === "generated");
  expect(generated.filter(entity => entity.origin.kind === "generated" && entity.origin.generatorId === "generator_t")).toHaveLength(2);
  expect(generated.filter(entity => entity.origin.kind === "generated" && entity.origin.generatorId === "generator_other")).toHaveLength(1);
  expect(scene.entities.filter(entity => entity.origin.kind === "authored")).toHaveLength(4);
  expect(scene.generators.map(generator => generator.generatorId).sort()).toEqual(["generator_other", "generator_t"]);
  const record = scene.generators.find(generator => generator.generatorId === "generator_t")!;
  expect(record.seed).toBe(8);
}));

test("scene generate surfaces module contract violations by name", async () => await fixture(async root => {
  const application = operationApplicationContext(root);
  const run = (source: string, extra: readonly string[] = []) => {
    return writeFile(join(root, "gen.ts"), source).then(() =>
      executeSpatialSceneCommand(application, generateArgs(["--module", "gen.ts", "--generator-id", "generator_t", "--output", "out.json", ...extra])));
  };
  await expect(run(`export function generate() { return { entities: [{ key: "x", entityId: "entity_forge", origin: { kind: "authored" }, name: "X", kind: "mesh", parentId: null, transform: { position: [0,0,0], rotation: [0,0,0,1], scale: [1,1,1] }, placement: { kind: "world" }, visible: true, geometry: { kind: "box", size: [1,1,1] }, material: { kind: "unlit", color: "#ffffff", opacity: 1 } }] }; }\n`))
    .rejects.toThrow("must not set entityId or origin");
  await expect(run(`export function generate() { const e = { name: "X", kind: "mesh", parentId: null, transform: { position: [0,0,0], rotation: [0,0,0,1], scale: [1,1,1] }, placement: { kind: "world" }, visible: true, geometry: { kind: "box", size: [1,1,1] }, material: { kind: "unlit", color: "#ffffff", opacity: 1 } }; return { entities: [{ ...e, key: "dup" }, { ...e, key: "dup" }] }; }\n`))
    .rejects.toThrow("Duplicate generator output key");
  await expect(run(`export function generate() { return { entities: [{ key: "x", name: "X", kind: "mesh", parentId: null, transform: { position: [0,0,0], rotation: [0,0,0,1], scale: [1,1,1] }, placement: { kind: "world" }, visible: true, geometry: { kind: "box", size: [1,1,1] }, material: { kind: "unlit", color: "#ffffff", opacity: 1 } }], editableKeys: [{ key: "missing", properties: ["color"] }] }; }\n`))
    .rejects.toThrow('Editable key "missing" does not match any produced entity key');
  await expect(run(`export function generate() { return { entities: [{ key: "x", name: "X", kind: "image", parentId: null, transform: { position: [0,0,0], rotation: [0,0,0,1], scale: [1,1,1] }, placement: { kind: "world" }, visible: true, assetId: "asset_a", width: 1, height: 1, fit: "contain", opacity: 1 }] }; }\n`))
    .rejects.toThrow("cannot reference assets");
  await expect(run(`export const notGenerate = 1;\n`)).rejects.toThrow('must export a "generate" function');
  await expect(run(`import { helper } from "./helper.ts";\nexport function generate() { return { entities: [] }; }\n`)).rejects.toThrow("does not resolve");
  await expect(run(`export function generate() { return { entities: Array.from({ length: 5000 }, (_, i) => ({ key: "e" + i, name: "E" + i, kind: "mesh", parentId: null, transform: { position: [0,0,0], rotation: [0,0,0,1], scale: [1,1,1] }, placement: { kind: "world" }, visible: true, geometry: { kind: "box", size: [1,1,1] }, material: { kind: "unlit", color: "#ffffff", opacity: 1 } })) }; }\n`))
    .rejects.toThrow();
}));

test("scene generate covers a transitive relative-import closure", async () => await fixture(async root => {
  await mkdir(join(root, "lib"), { recursive: true });
  // A cycle back to the entry file is legal and deduped by real path.
  await writeFile(join(root, "shared.ts"), `import "./gen.ts";\nexport const SHARED = "shared-box";\n`);
  await writeFile(join(root, "cfg.json"), JSON.stringify({ color: "#123456" }));
  const helperV1 = `import { SHARED } from "../shared.ts";\nexport function makeBox(name, color) { return { key: SHARED, name, kind: "mesh", parentId: null, transform: { position: [0,0,0], rotation: [0,0,0,1], scale: [1,1,1] }, placement: { kind: "world" }, visible: true, geometry: { kind: "box", size: [1,1,1] }, material: { kind: "unlit", color, opacity: 1 } }; }\n`;
  const helperV2 = helperV1.replace('geometry: { kind: "box", size: [1,1,1] }', 'geometry: { kind: "sphere", radius: 0.5 }');
  await writeFile(join(root, "lib", "helper.ts"), helperV1);
  await writeFile(join(root, "lib", "fmt.js"), `export function tag(value) { return "T-" + value; }\n`);
  // Extensionless specifier, a .js member, a .json member, a cycle, and an ambient builtin.
  await writeFile(join(root, "gen.ts"), `import { createHash } from "node:crypto";\nimport { tag } from "./lib/fmt.js";\nimport { makeBox } from "./lib/helper";\nimport cfg from "./cfg.json";\nexport function generate() { const mark = createHash("sha256").update("ambient").digest("hex").slice(0, 6); return { entities: [makeBox(tag(mark), cfg.color)] }; }\n`);

  const application = operationApplicationContext(root);
  const first = await executeSpatialSceneCommand(application,
    generateArgs(["--module", "gen.ts", "--generator-id", "generator_t", "--seed", "1", "--output", "one.json"])) as { sourceSha256: string };
  const scene = parseSpatialScene(JSON.parse(await readFile(join(root, "one.json"), "utf8")));
  const generator = scene.generators[0]!;
  expect(generator.sourceSha256).toBe(first.sourceSha256);
  expect(generator.closureSha256).not.toBe(generator.sourceSha256);
  const entity = scene.entities.find(candidate => candidate.origin.kind === "generated")!;
  expect(entity.name).toMatch(/^T-[a-f0-9]{6}$/u);
  expect(entity).toMatchObject({ kind: "mesh", geometry: { kind: "box" }, material: { color: "#123456" } });

  // closureSha256 is the canonical-JSON digest of the sorted {relativePath, sha256} manifest.
  const manifest = await Promise.all(["cfg.json", "gen.ts", "lib/fmt.js", "lib/helper.ts", "shared.ts"]
    .map(async relativePath => ({ relativePath, sha256: sha256Hex(await readFile(join(root, ...relativePath.split("/")), "utf8")) })));
  expect(generator.closureSha256).toBe(canonicalJsonSha256(manifest));

  // Editing a dependency changes the retained digest and reruns the new bytes.
  await writeFile(join(root, "lib", "helper.ts"), helperV2);
  await executeSpatialSceneCommand(application,
    generateArgs(["--module", "gen.ts", "--generator-id", "generator_t", "--seed", "1", "--output", "two.json"]));
  const secondScene = parseSpatialScene(JSON.parse(await readFile(join(root, "two.json"), "utf8")));
  const second = secondScene.generators[0]!;
  expect(second.sourceSha256).toBe(generator.sourceSha256);
  expect(second.closureSha256).not.toBe(generator.closureSha256);
  expect(secondScene.entities.find(candidate => candidate.origin.kind === "generated")).toMatchObject({ geometry: { kind: "sphere" } });
}));

test("scene generate rejects closure escapes, symlinks, and invisible forms", async () => await fixture(async root => {
  const application = operationApplicationContext(root);
  await mkdir(join(root, "mod", "realdir"), { recursive: true });
  await writeFile(join(root, "escape.ts"), `export const E = 1;\n`);
  await writeFile(join(root, "mod", "real.ts"), `export const R = 1;\n`);
  await writeFile(join(root, "mod", "realdir", "x.ts"), `export const X = 1;\n`);
  await writeFile(join(root, "mod", "bad.ts"), `const r = require("./real.ts");\nexport const B = r;\n`);
  await symlink("real.ts", join(root, "mod", "link.ts"));
  await symlink("realdir", join(root, "mod", "linkdir"), "dir");
  const tail = `export function generate() { return { entities: [] }; }\n`;
  const run = (source: string) => writeFile(join(root, "mod", "gen.ts"), source).then(() =>
    executeSpatialSceneCommand(application, generateArgs(["--module", "mod/gen.ts", "--generator-id", "generator_t", "--output", "out.json"])));
  await expect(run(`import { E } from "../escape.ts";\n${tail}`)).rejects.toThrow("escapes the generator module directory");
  await expect(run(`import { E } from "/etc/escape.ts";\n${tail}`)).rejects.toThrow("absolute");
  await expect(run(`import { E } from "file:///etc/escape.ts";\n${tail}`)).rejects.toThrow("absolute");
  await expect(run(`import { R } from "./link.ts";\n${tail}`)).rejects.toThrow("symlink");
  await expect(run(`import { X } from "./linkdir/x.ts";\n${tail}`)).rejects.toThrow("symlink");
  await expect(run(`const r = require("./real.ts");\n${tail}`)).rejects.toThrow("require()");
  await expect(run(`import { B } from "./bad.ts";\n${tail}`)).rejects.toThrow("require()");
  await expect(run(`export async function generate() { await import("./real.ts"); return { entities: [] }; }\n`)).rejects.toThrow("dynamic import()");
  await expect(run(`import "./data.css";\n${tail}`)).rejects.toThrow(".ts, .js, or .json");
  await expect(run(`import { R } from "./missing.ts";\n${tail}`)).rejects.toThrow("does not resolve");
}));

test("scene generate bounds closure file count and total bytes", async () => await fixture(async root => {
  const application = operationApplicationContext(root);
  const tail = `export function generate() { return { entities: [] }; }\n`;
  const imports: string[] = [];
  for (let index = 0; index < 64; index += 1) {
    await writeFile(join(root, `dep-${index}.ts`), `export const v${index} = ${index};\n`);
    imports.push(`import "./dep-${index}.ts";`);
  }
  await writeFile(join(root, "gen.ts"), `${imports.join("\n")}\n${tail}`);
  await expect(executeSpatialSceneCommand(application, generateArgs(["--module", "gen.ts", "--generator-id", "generator_t", "--output", "out.json"])))
    .rejects.toThrow("exceeds 64 files");

  const pad = `// ${"x".repeat(600_000)}\n`;
  await writeFile(join(root, "big-a.ts"), `${pad}export const a = 1;\n`);
  await writeFile(join(root, "big-b.ts"), `${pad}export const b = 1;\n`);
  await writeFile(join(root, "gen.ts"), `import "./big-a.ts";\nimport "./big-b.ts";\n${tail}`);
  await expect(executeSpatialSceneCommand(application, generateArgs(["--module", "gen.ts", "--generator-id", "generator_t", "--output", "big.json"])))
    .rejects.toThrow("total bytes");
}));

test("scene generate refuses regeneration that orphans a declared override", async () => await fixture(async root => {
  await writeFile(join(root, "gen.ts"), MODULE);
  await writeFile(join(root, "drop.json"), JSON.stringify({ drop: true }));
  const application = operationApplicationContext(root);
  await executeSpatialSceneCommand(application, generateArgs(["--module", "gen.ts", "--generator-id", "generator_t", "--seed", "3", "--output", "one.json"]));
  const scene = JSON.parse(await readFile(join(root, "one.json"), "utf8")) as SpatialSceneV1 & { overrides: unknown[] };
  scene.overrides.push({ entityId: generatedSpatialEntityId("generator_t", "box-a"), property: "color", value: "#0000ff" });
  await writeFile(join(root, "edited.json"), JSON.stringify(scene));
  await expect(executeSpatialSceneCommand(application,
    generateArgs(["--module", "gen.ts", "--generator-id", "generator_t", "--seed", "3", "--parameters", "drop.json", "--into", "edited.json", "--output", "two.json"])))
    .rejects.toThrow("Regeneration removed");
}));
