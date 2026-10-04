import { constants } from "node:fs";
import { lstat, mkdir, open, readFile, realpath } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import { CliError } from "./errors";
import { discoverRepositoryRoot } from "./paths";

import { HTML_FILM_TEMPLATES, type HtmlFilmTemplate } from "./html-film-names";

export { HTML_FILM_TEMPLATES, type HtmlFilmTemplate };
export const HTML_FILM_ASPECTS = ["16:9", "1:1", "9:16"] as const;
export type HtmlFilmAspect = (typeof HTML_FILM_ASPECTS)[number];

/** Files copied from examples/html/<template>/, in write order. */
export const HTML_FILM_TEMPLATE_FILES = [
  "README.md", "build.ts", "film.css", "film.html", "film.js", "film.json", "mockups.tsx", "timeline.ts",
] as const;

const REACT_VERSION = "19.2.3";

export interface HtmlFilmInitResult {
  readonly kind: "slopcamera.html-film-init";
  readonly schemaVersion: 1;
  readonly directory: string;
  readonly template: HtmlFilmTemplate;
  readonly aspect: HtmlFilmAspect;
  readonly slopcameraVersion: string;
  readonly files: readonly string[];
  readonly executed: false;
  readonly next: readonly string[];
}

export interface HtmlFilmTemplateSource {
  readonly version: string;
  readonly files: Readonly<Record<string, string>>;
}

/** Reads the template from the installed package or checkout that runs this CLI. */
export async function readHtmlFilmTemplate(template: HtmlFilmTemplate, from = import.meta.dir): Promise<HtmlFilmTemplateSource> {
  if (from.startsWith("/$bunfs/")) {
    throw new CliError("unavailable", "html init needs the @hraness/slopcamera package on disk. Run it through bunx @hraness/slopcamera or a checkout.");
  }
  const root = await discoverRepositoryRoot(from);
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { readonly version?: unknown };
  if (typeof manifest.version !== "string") throw new CliError("invalid-data", "The SlopCamera package has no version.");
  const files: Record<string, string> = {};
  for (const name of HTML_FILM_TEMPLATE_FILES) {
    files[name] = await readFile(join(root, "examples", "html", template, name), "utf8");
  }
  return { version: manifest.version, files };
}

function packageName(directory: string): string {
  const name = basename(directory).toLowerCase().replace(/[^a-z0-9._-]+/gu, "-").replace(/^[._-]+|[-]+$/gu, "");
  return name === "" ? "launch-film" : name;
}

/**
 * The files a new film project holds: the template, with its aspect set, plus
 * a package.json that pins this Slopcamera version next to the source.
 */
export function htmlFilmProjectFiles(
  source: HtmlFilmTemplateSource,
  options: { readonly directory: string; readonly aspect: HtmlFilmAspect },
): Readonly<Record<string, string>> {
  const film = JSON.parse(source.files["film.json"]!) as Record<string, unknown>;
  const files: Record<string, string> = { ...source.files, "film.json": `${JSON.stringify({ ...film, aspect: options.aspect }, null, 2)}\n` };
  files["package.json"] = `${JSON.stringify({
    name: packageName(options.directory),
    private: true,
    type: "module",
    scripts: {
      build: "bun build.ts",
      still: "slopcamera html still --input out/scene.json --at 3,12.5 --output out/stills",
      draft: "bun build.ts --scale 0.5 --fps 15",
      render: "slopcamera html render --input out/scene.json --json > out/export.json",
      deliver: "slopcamera html deliver out/export.json --basename launch --poster-at 9 --social-at 9 --cuts 1:1,9:16 --per-beat-clips",
    },
    dependencies: {
      "@hraness/slopcamera": source.version,
      react: REACT_VERSION,
      "react-dom": REACT_VERSION,
    },
    devDependencies: {
      "@types/bun": "latest",
      "@types/react": "^19.2.0",
      "@types/react-dom": "^19.2.0",
    },
  }, null, 2)}\n`;
  files["tsconfig.json"] = `${JSON.stringify({
    compilerOptions: {
      target: "ES2023",
      module: "Preserve",
      moduleResolution: "bundler",
      jsx: "react-jsx",
      strict: true,
      noEmit: true,
      allowImportingTsExtensions: true,
      skipLibCheck: true,
      types: ["bun"],
    },
    include: ["*.ts", "*.tsx"],
  }, null, 2)}\n`;
  files[".gitignore"] = "node_modules/\nout/\n";
  return files;
}

async function writeNew(path: string, text: string): Promise<void> {
  const handle = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW | constants.O_WRONLY, 0o644);
  try {
    await handle.writeFile(text, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

/** Creates a new film project. It never merges into an existing directory. */
export async function createHtmlFilmProject(
  directoryInput: string,
  options: { readonly template: HtmlFilmTemplate; readonly aspect: HtmlFilmAspect; readonly source?: HtmlFilmTemplateSource },
): Promise<HtmlFilmInitResult> {
  const requested = resolve(directoryInput);
  const parent = await realpath(dirname(requested)).catch(() => {
    throw new CliError("not-found", `The parent directory does not exist: ${dirname(requested)}`);
  });
  const directory = join(parent, basename(requested));
  const source = options.source ?? await readHtmlFilmTemplate(options.template);
  const files = htmlFilmProjectFiles(source, { directory, aspect: options.aspect });
  try {
    await mkdir(directory, { mode: 0o755 });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      throw new CliError("conflict", `Refusing to write into an existing path: ${directory}`);
    }
    throw error;
  }
  if (!(await lstat(directory)).isDirectory()) throw new CliError("conflict", "The film directory changed while it was created.");
  const names = Object.keys(files).sort();
  for (const name of names) await writeNew(join(directory, name), files[name]!);
  return {
    kind: "slopcamera.html-film-init",
    schemaVersion: 1,
    directory,
    template: options.template,
    aspect: options.aspect,
    slopcameraVersion: source.version,
    files: names,
    executed: false,
    next: [
      `cd ${JSON.stringify(directory)} && bun install`,
      "Edit film.json and mockups.tsx, then run bun run build.",
      "slopcamera html still --input out/scene.json --at 3,12.5 --output out/stills",
      "slopcamera html render --input out/scene.json --json > out/export.json",
      "slopcamera html deliver out/export.json --basename launch --poster-at 9 --social-at 9",
    ],
  };
}
