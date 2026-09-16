import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  generatedSpatialEntityId, parseSpatialScene, spatialGeneratorOutputSha256,
  type SpatialSceneV1,
} from "../../../src/spatial-scene/index";
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
  await expect(run(`import { helper } from "./helper.ts";\nexport function generate() { return { entities: [] }; }\n`)).rejects.toThrow("single-file");
  await expect(run(`export function generate() { return { entities: Array.from({ length: 5000 }, (_, i) => ({ key: "e" + i, name: "E" + i, kind: "mesh", parentId: null, transform: { position: [0,0,0], rotation: [0,0,0,1], scale: [1,1,1] }, placement: { kind: "world" }, visible: true, geometry: { kind: "box", size: [1,1,1] }, material: { kind: "unlit", color: "#ffffff", opacity: 1 } })) }; }\n`))
    .rejects.toThrow();
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
