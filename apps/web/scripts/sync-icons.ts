/**
 * Sync the vetted aicharts icon set from the pinned @hraness/design-kit
 * release into public/icons/ and the product mark into public/marks/ and
 * wherever a same-named mark file already exists.
 *
 * Usage: bun run sync:icons
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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
const files = new Map<string, string>(); // "<out>/<name>" -> package path
for (const member of spec.members) {
  files.set(`${ICONS_OUT}/${member.slug}.svg`, `${SET}/${member.slug}.svg`);
}
for (const mark of spec.marks ?? []) {
  const name = `${mark.slug}.svg`;
  const dests = [`${MARKS_OUT}/${name}`, `${ICONS_OUT}/${name}`].filter(existsSync);
  for (const dest of dests.length > 0 ? dests : [`${MARKS_OUT}/${name}`]) {
    files.set(dest, `${SET}/${mark.slug}.svg`);
  }
}
for (const reference of spec.references ?? []) {
  // References are generation-time family anchors; sync only the ones the
  // product actually serves today.
  if (existsSync(`${ICONS_OUT}/${reference.slug}.svg`)) {
    files.set(`${ICONS_OUT}/${reference.slug}.svg`, reference.svg.replace(/^\.\.\//u, ""));
  }
}

const written: string[] = [];
for (const [dest, packagePath] of [...files].sort()) {
  mkdirSync(join(dest, ".."), { recursive: true });
  writeFileSync(dest, readFileSync(join(iconsDir, packagePath)));
  written.push(dest);
}
for (const file of readdirSync(ICONS_OUT)) {
  if (file.endsWith(".svg") && !files.has(`${ICONS_OUT}/${file}`)) {
    throw new Error(`${ICONS_OUT}/${file} is not declared by the ${SET} icon set — remove it or regenerate the set.`);
  }
}
for (const mark of spec.marks ?? []) {
  for (const dir of [MARKS_OUT, ICONS_OUT]) {
    const stale = join(dir, `${mark.slug}.svg`);
    if (existsSync(stale) && !files.has(stale)) {
      throw new Error(`${stale} exists but the ${SET} mark is declared elsewhere — reconcile the locations.`);
    }
  }
}
console.log(`synced ${written.length} icons from @hraness/design-kit (${SET})`);
