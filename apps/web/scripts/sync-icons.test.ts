import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const SET = "slopcamera";
const ICONS_OUT = "src/icons";
const MARKS_OUT = "src/marks";

const specUrl = import.meta.resolve(`@hraness/design-kit/icons/sets/${SET}.json`);
const setsDir = decodeURIComponent(new URL(".", specUrl).pathname);
const iconsDir = resolve(setsDir, "..");

interface SetSpec {
  members: { slug: string }[];
  marks?: { slug: string }[];
  references?: { slug: string; svg: string }[];
}

const spec = JSON.parse(readFileSync(`${setsDir}${SET}.json`, "utf8")) as SetSpec;
const expected = new Map<string, string>(); // local path -> package path
for (const member of spec.members) {
  expected.set(`${ICONS_OUT}/${member.slug}.svg`, `${SET}/${member.slug}.svg`);
}
for (const mark of spec.marks ?? []) {
  for (const dir of [MARKS_OUT, ICONS_OUT]) {
    const local = join(dir, `${mark.slug}.svg`);
    if (existsSync(local)) expected.set(local, `${SET}/${mark.slug}.svg`);
  }
}
for (const reference of spec.references ?? []) {
  if (existsSync(`${ICONS_OUT}/${reference.slug}.svg`)) {
    expected.set(`${ICONS_OUT}/${reference.slug}.svg`, reference.svg.replace(/^\.\.\//u, ""));
  }
}

describe("synced topic icons", () => {
  test("public icons and marks carry exactly the vetted design-kit set, byte-for-byte", () => {
    expect(expected.size).toBeGreaterThan(0);
    for (const [local, packagePath] of expected) {
      expect(existsSync(local), `${local} missing — run bun run sync:icons`).toBe(true);
      expect(
        readFileSync(local).equals(readFileSync(join(iconsDir, packagePath))),
        `${local} differs from the pinned package icon`,
      ).toBe(true);
    }
    for (const file of readdirSync(ICONS_OUT)) {
      if (file.endsWith(".svg")) {
        expect(expected.has(`${ICONS_OUT}/${file}`), `${ICONS_OUT}/${file} is not declared by the ${SET} icon set`).toBe(true);
      }
    }
  });
});
