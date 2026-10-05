import { expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, relative, resolve } from "node:path"
import ts from "typescript"
import fc from "fast-check"
import { apiUnaffectedByPaths, canSkipApiBuild } from "../../../scripts/api-deploy-selection"

const root = resolve(import.meta.dir, "../../..")

test("only nonempty website-only content changes leave the API unchanged", () => {
  for (const path of ["apps/web/src/docs/guide.md", "apps/web/src/styles.css", "apps/web/scripts/build.ts", "apps/web/media/demo.png", "apps/web/public/favicon.ico"]) {
    expect(apiUnaffectedByPaths([path])).toBe(true)
    for (const input of ["api/index.ts", "apps/api/src/config.ts", "src/index.ts", "package.json", "bun.lock", "tsconfig.json", "vercel.json", "scripts/api-deploy-selection.ts"]) {
      expect(apiUnaffectedByPaths([path, input])).toBe(false)
      expect(apiUnaffectedByPaths([input, path])).toBe(false)
    }
  }
  for (const paths of [[], ["apps/web/package.json"], ["apps/web/bun.lock"], ["apps/web/src/package.json"], ["apps/web/src/.npmrc"], ["apps/web/src/../package.json"], ["apps/web/src//file.ts"], ["apps/web-old/src/a.ts"]]) {
    expect(apiUnaffectedByPaths(paths)).toBe(false)
  }
})

test("selection requires exact current HEAD, available ancestor, and a nonempty safe diff", () => {
  const directory = mkdtempSync(join(tmpdir(), "slopcamera-api-selection-"))
  const git = (...args: string[]) => {
    const result = spawnSync("git", args, { cwd: directory, encoding: "utf8" })
    if (result.status !== 0) throw new Error(result.stderr)
    return result.stdout.trim()
  }
  try {
    git("init", "-q")
    git("config", "user.email", "test@example.invalid")
    git("config", "user.name", "Test")
    writeFileSync(join(directory, "shared.txt"), "base")
    git("add", ".")
    git("commit", "-qm", "base")
    const base = git("rev-parse", "HEAD")
    mkdirSync(join(directory, "apps/web/src"), { recursive: true })
    writeFileSync(join(directory, "apps/web/src/page.html"), "site")
    git("add", ".")
    git("commit", "-qm", "site")
    const site = git("rev-parse", "HEAD")
    expect(canSkipApiBuild(directory, base, site)).toBe(true)
    expect(canSkipApiBuild(directory, site, site)).toBe(false)
    expect(canSkipApiBuild(directory, undefined, site)).toBe(false)
    expect(canSkipApiBuild(directory, "f".repeat(40), site)).toBe(false)
    expect(canSkipApiBuild(directory, base, base)).toBe(false)
    expect(canSkipApiBuild(directory, "HEAD~1", site)).toBe(false)
    expect(canSkipApiBuild(directory, base, undefined)).toBe(false)
    writeFileSync(join(directory, "shared.txt"), "changed")
    git("add", ".")
    git("commit", "-qm", "shared")
    expect(canSkipApiBuild(directory, base, git("rev-parse", "HEAD"))).toBe(false)
    git("checkout", "-q", "--detach", base)
    expect(canSkipApiBuild(directory, site, base)).toBe(false)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

function assertLocalImportClosureOutsideWeb(directory: string, entries: readonly string[]): Set<string> {
  const config = ts.readConfigFile(join(directory, "tsconfig.json"), ts.sys.readFile)
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"))
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, directory)
  const pending = [...entries]
  const visited = new Set<string>()
  const localPath = (file: string): string | undefined => {
    const physical = realpathSync(file)
    const path = relative(directory, physical)
    if (path.startsWith("apps/web/")) throw new Error(`Website dependency: ${path}`)
    // Third-party packages are fixed by the unchanged root manifests/lockfile.
    // Workspace symlinks resolve into the source tree and must be followed,
    // even when TypeScript calls their bare import an external library.
    if (path.startsWith("../") || path.startsWith("node_modules/")) return undefined
    return physical
  }
  while (pending.length > 0) {
    const file = localPath(pending.pop()!)
    if (!file || visited.has(file)) continue
    visited.add(file)
    const source = readFileSync(file, "utf8")
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
    const imports: string[] = []
    const walk = (node: ts.Node): void => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text)
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) imports.push(node.argument.literal.text)
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
        const argument = node.arguments[0]
        if (!argument || !ts.isStringLiteral(argument)) throw new Error(`Unresolved dynamic dependency in ${relative(directory, file)}`)
        imports.push(argument.text)
      }
      if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "URL" && node.arguments?.length === 2) {
        const argument = node.arguments[0]
        if (argument && ts.isStringLiteral(argument) && argument.text.startsWith(".")) localPath(resolve(dirname(file), argument.text))
      }
      ts.forEachChild(node, walk)
    }
    walk(ast)
    for (const specifier of imports) {
      const resolved = new Set<string>()
      const typed = ts.resolveModuleName(specifier, file, parsed.options, ts.sys).resolvedModule
      if (typed && existsSync(typed.resolvedFileName)) resolved.add(typed.resolvedFileName)
      // Resolve runtime exports as well: a package's .d.ts may not mention
      // the modules loaded by its actual JavaScript implementation.
      try {
        const runtime = Bun.resolveSync(specifier, dirname(file))
        if (existsSync(runtime)) resolved.add(runtime)
      } catch {
        // Type-only declarations need no runtime export; unresolved local
        // paths still fail below instead of being treated as external.
      }
      const asset = resolve(dirname(file), specifier)
      if (specifier.startsWith(".") && existsSync(asset)) resolved.add(asset)
      if (resolved.size === 0 && (specifier.startsWith(".") || Object.hasOwn(parsed.options.paths ?? {}, specifier))) {
        throw new Error(`Unresolved local dependency ${specifier} in ${relative(directory, file)}`)
      }
      for (const dependency of resolved) {
        const local = localPath(dependency)
        if (local && /\.[cm]?[jt]sx?$/u.test(local)) pending.push(local)
      }
    }
  }
  return visited
}

test("API local module and static asset imports stay outside the skipped website tree", () => {
  const files = spawnSync("git", ["ls-files", "api"], { cwd: root, encoding: "utf8" })
  expect(files.status).toBe(0)
  const entries = files.stdout.trim().split("\n").filter((path) => /\.[jt]s$/u.test(path)).map((path) => join(root, path))
  expect(entries.length).toBeGreaterThan(0)
  expect(assertLocalImportClosureOutsideWeb(root, entries).size).toBeGreaterThan(10)
})

test("follows a workspace package's real runtime export beyond its type declarations", () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "slopcamera-api-closure-")))
  try {
    for (const path of ["api", "packages/local", "node_modules", "apps/web/src"]) mkdirSync(join(directory, path), { recursive: true })
    writeFileSync(join(directory, "tsconfig.json"), JSON.stringify({ compilerOptions: { moduleResolution: "Bundler", module: "Preserve" } }))
    writeFileSync(join(directory, "api/entry.ts"), 'import "local-package";')
    writeFileSync(join(directory, "packages/local/package.json"), JSON.stringify({ name: "local-package", type: "module", exports: { types: "./index.d.ts", import: "./index.js" } }))
    writeFileSync(join(directory, "packages/local/index.d.ts"), 'export {};')
    writeFileSync(join(directory, "packages/local/index.js"), 'import "../../apps/web/src/runtime.js";')
    writeFileSync(join(directory, "apps/web/src/runtime.js"), 'export const source = "web";')
    symlinkSync(join(directory, "packages/local"), join(directory, "node_modules/local-package"), "dir")
    expect(() => assertLocalImportClosureOutsideWeb(directory, [join(directory, "api/entry.ts")])).toThrow("Website dependency")
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})



test("adding a shared input never turns a selected build into a skip", () => {
  fc.assert(fc.property(
    fc.array(fc.constantFrom("apps/web/src/page.html", "apps/web/scripts/build.ts", "apps/web/media/demo.png")),
    fc.string(),
    (webPaths, suffix) => {
      expect(apiUnaffectedByPaths([...webPaths, `src/${suffix}`])).toBe(false)
      expect(apiUnaffectedByPaths([`src/${suffix}`, ...webPaths])).toBe(false)
    },
  ))
})
