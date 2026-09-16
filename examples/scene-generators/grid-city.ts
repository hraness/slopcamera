/**
 * Procedural grid-city generator for `slopcamera scene generate`.
 *
 *   slopcamera scene generate --module examples/scene-generators/grid-city.ts \
 *     --generator-id generator_grid_city --output city.scene.json --json
 *
 * Modules are trusted TypeScript; transitive relative .ts/.js/.json imports
 * inside the module's own directory are covered by the retained closure
 * digest. Entities are returned without entityId/origin, each carrying a
 * stable "key" the host converts into derived generated identity. Randomness
 * must flow from ctx.seed — the retained generator record pins seed and
 * outputSha256, so nondeterminism is detectable.
 */

interface GenerateContext {
  readonly seed: number;
  readonly parameters: { readonly size?: number };
  readonly lib: { readonly entityId: (key: string) => string };
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const IDENTITY = { rotation: [0, 0, 0, 1], scale: [1, 1, 1] } as const;

export function generate(ctx: GenerateContext) {
  const random = mulberry32(ctx.seed);
  const size = Math.max(1, Math.min(7, Math.floor(Number(ctx.parameters.size ?? 3) || 3)));
  const spacing = 1.6;
  const accentIndex = Math.floor(random() * size * size);
  const entities: Record<string, unknown>[] = [{
    key: "city", name: "City", kind: "group", parentId: null,
    transform: { position: [0, 0, 0], ...IDENTITY },
    placement: { kind: "world" }, visible: true,
  }];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const height = 0.4 + random() * 2.8;
      const accent = row * size + column === accentIndex;
      entities.push({
        key: `building-${row}-${column}`, name: `Building ${row},${column}`, kind: "mesh",
        parentId: ctx.lib.entityId("city"),
        transform: {
          position: [(column - (size - 1) / 2) * spacing, height / 2, (row - (size - 1) / 2) * spacing],
          ...IDENTITY,
        },
        placement: { kind: "world" }, visible: true,
        geometry: { kind: "box", size: [0.9, height, 0.9] },
        material: accent
          ? { kind: "unlit", color: "#e35544", opacity: 1 }
          : { kind: "standard", color: "#8fa3b8", opacity: 1, roughness: 0.8, metalness: 0.05 },
      });
    }
  }
  const accentKey = `building-${Math.floor(accentIndex / size)}-${accentIndex % size}`;
  return { entities, editableKeys: [{ key: accentKey, properties: ["color", "transform"] }] };
}
