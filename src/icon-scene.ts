import {
  canonicalJson,
  compileProgram,
  CONSTRUCTION_VERSION,
  CONSTRUCTION_VERSION_V1,
  createRecipe,
  parseProgram,
  programDigest,
  RECIPE_VERSION,
  renderConstruction,
  replayRecipe,
  type CompiledDrawing,
  type ConstructionProgram,
  type StyleOptions,
} from "@hraness/iconplace"
import { COLLECTION_VERSION } from "@hraness/iconplace/collections"
import {
  createSceneRecipe,
  DEFAULT_SCENE_RENDER,
  parseScene,
  replaySceneRecipe,
  renderScene,
  SCENE_RECIPE_VERSION,
  SCENE_VERSION,
  sceneFromComposition,
  solveScene,
  type SceneDocument,
  type SceneRecipe,
  type SceneRenderOptions,
  type SceneSource,
} from "@hraness/iconplace/scene"
import {
  BoundedFileError,
  decodeUtf8Source,
  hasPathCollision,
  publishReplaceableFile,
  readBoundedFile,
  sha256Hex,
} from "./bounded-file.js"

/**
 * Deterministic vector icon scenes behind the `slopcamera.icon.compose` and
 * `slopcamera.icon.render` operations.
 *
 * Construction, scene solving, drawing and recipe replay come from the
 * exact-version `@hraness/iconplace` library, called in process. Nothing is
 * spawned, fetched or evaluated. Slopcamera owns the operation codes, input
 * bounds, file publication, the inert-SVG gate and the receipts; the library's
 * own document formats are accepted as foreign input and parsed strictly.
 */

/** The exact admitted library release. A test pins this to the lockfile. */
export const slopcameraIconEngine = Object.freeze({
  package: "@hraness/iconplace",
  version: "0.1.0",
} as const)

export const slopcameraIconSceneLimits = Object.freeze({
  sourceBytes: 1024 * 1024,
  outputBytes: 4 * 1024 * 1024,
  sizeMin: 16,
  sizeMax: 1_024,
  diagnostics: 64,
  notes: 32,
})

/** Scene palettes. A test pins this list to the admitted library's. */
export const slopcameraIconPalettes = Object.freeze(["original", "ink", "earth", "night"] as const)
export type SlopcameraIconPalette = (typeof slopcameraIconPalettes)[number]

/** Construction-program drawing languages. A test pins this list to the admitted library's. */
export const slopcameraIconLanguages = Object.freeze([
  "outline", "sketch", "pen", "crosshatch", "engraving", "stipple", "halftone",
  "glyph", "flat", "shaded", "figure", "cutpaper", "woodcut", "offset",
] as const)
export type SlopcameraIconLanguage = (typeof slopcameraIconLanguages)[number]
export const slopcameraIconDefaultLanguage: SlopcameraIconLanguage = "outline"

export type SlopcameraIconSourceFormat =
  | "scene"
  | "collection"
  | "program"
  | "scene-recipe"
  | "program-recipe"

export type SlopcameraIconForm = "scene" | "program"

export class SlopcameraIconError extends Error {
  readonly code: "INVALID_ICON_SOURCE" | "INVALID_ICON_INPUT" | "UNSAFE_ICON_OUTPUT"

  constructor(code: SlopcameraIconError["code"], message: string) {
    super(message)
    this.name = "SlopcameraIconError"
    this.code = code
  }
}

export interface SlopcameraIconFileRecord {
  readonly path: string
  readonly sha256: string
  readonly bytes: number
}

export interface SlopcameraIconSourceRecord extends SlopcameraIconFileRecord {
  readonly format: SlopcameraIconSourceFormat
}

export interface SlopcameraIconDiagnostic {
  readonly code: string
  readonly message: string
  readonly target: string | null
}

export interface SlopcameraIconGeometry {
  readonly regions: number
  readonly components: number
  readonly apertures: number
  readonly vertices: number
  readonly inkArea: number
  readonly bounds: readonly [number, number, number, number]
}

export interface SlopcameraIconComposeInput {
  readonly sourcePath: string
  readonly outputPath?: string
}

export interface SlopcameraIconComposeReceipt {
  readonly receiptVersion: 1
  readonly operation: "slopcamera.icon.compose"
  readonly engine: typeof slopcameraIconEngine
  readonly source: SlopcameraIconSourceRecord
  readonly form: SlopcameraIconForm
  readonly title: string
  /** Scene nodes or program parts. */
  readonly elementCount: number
  readonly digests: {
    /** Library digest of the canonical scene or construction program. */
    readonly document: string
    /** Library digest of the compiled geometry. */
    readonly geometry: string
  }
  readonly geometry: SlopcameraIconGeometry
  readonly diagnostics: readonly SlopcameraIconDiagnostic[]
  /** The canonical solved document, written only when an output path was supplied. */
  readonly output: SlopcameraIconFileRecord | null
}

export interface SlopcameraIconRenderInput {
  readonly sourcePath: string
  readonly outputPath: string
  readonly recipePath?: string
  readonly size?: number
  readonly background?: boolean
  readonly palette?: SlopcameraIconPalette
  readonly language?: SlopcameraIconLanguage
}

export interface SlopcameraIconRenderReceipt {
  readonly receiptVersion: 1
  readonly operation: "slopcamera.icon.render"
  readonly engine: typeof slopcameraIconEngine
  readonly source: SlopcameraIconSourceRecord
  readonly form: SlopcameraIconForm
  /** True when the source was a recipe whose recorded digests were reproduced. */
  readonly replayed: boolean
  readonly title: string
  readonly render: {
    readonly size: number
    readonly background: boolean
    readonly palette: SlopcameraIconPalette | null
    readonly language: string
  }
  readonly width: number
  readonly height: number
  readonly digests: {
    readonly document: string
    readonly geometry: string
    readonly svg: string
  }
  readonly output: SlopcameraIconFileRecord
  readonly recipe: SlopcameraIconFileRecord | null
  readonly notes: readonly string[]
}

interface SceneReplay {
  readonly recipe: SceneRecipe
  readonly svg: string
  readonly width: number
  readonly height: number
  readonly options: SceneRenderOptions
  readonly style: StyleOptions
  readonly notes: readonly string[]
}

interface ProgramReplay {
  readonly svg: string
  readonly style: StyleOptions
}

type LoadedIconSource =
  | {
      readonly form: "scene"
      readonly format: "scene" | "collection" | "scene-recipe"
      readonly scene: SceneDocument
      /** A recipe's embedded component snapshot, independent of catalog changes. */
      readonly sources?: SceneSource[]
      readonly replay?: SceneReplay
    }
  | {
      readonly form: "program"
      readonly format: "program" | "program-recipe"
      readonly drawing: CompiledDrawing
      readonly replay?: ProgramReplay
    }

function invalidSource(message: string): never {
  throw new SlopcameraIconError("INVALID_ICON_SOURCE", message)
}

function invalidInput(message: string): never {
  throw new SlopcameraIconError("INVALID_ICON_INPUT", message)
}

function libraryMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  // Library messages describe the rejected data; keep them short and printable.
  const printable = [...message]
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0
      return code >= 0x20 && code !== 0x7f
    })
    .join("")
  return printable.length > 240 ? `${printable.slice(0, 237)}...` : printable
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseSourceJson(bytes: Uint8Array): Record<string, unknown> {
  let value: unknown
  try {
    value = JSON.parse(decodeUtf8Source(bytes, "Icon source"))
  } catch (error) {
    if (error instanceof BoundedFileError) throw error
    invalidSource("Icon source is not valid JSON.")
  }
  if (!isRecord(value) || typeof value.version !== "string") {
    invalidSource("Icon source must be a JSON object with a version field.")
  }
  return value
}

function loadIconSource(bytes: Uint8Array): LoadedIconSource {
  const value = parseSourceJson(bytes)
  const version = value.version as string
  try {
    if (version === SCENE_VERSION) {
      return { form: "scene", format: "scene", scene: parseScene(value) }
    }
    if (version === COLLECTION_VERSION) {
      return { form: "scene", format: "collection", scene: parseScene(sceneFromComposition(value)) }
    }
    if (version === CONSTRUCTION_VERSION || version === CONSTRUCTION_VERSION_V1) {
      return { form: "program", format: "program", drawing: compileProgram(parseProgram(value)) }
    }
    if (version === SCENE_RECIPE_VERSION) {
      const replayed = replaySceneRecipe(value)
      return {
        form: "scene",
        format: "scene-recipe",
        scene: replayed.recipe.scene,
        sources: replayed.recipe.sources,
        replay: {
          recipe: replayed.recipe,
          svg: replayed.svg,
          width: replayed.width,
          height: replayed.height,
          options: replayed.options,
          style: replayed.style,
          notes: replayed.notes,
        },
      }
    }
    if (version === RECIPE_VERSION) {
      const replayed = replayRecipe(value)
      return {
        form: "program",
        format: "program-recipe",
        drawing: replayed.drawing,
        replay: { svg: replayed.svg, style: replayed.style },
      }
    }
  } catch (error) {
    invalidSource(`Icon source was rejected: ${libraryMessage(error)}`)
  }
  return invalidSource(
    "Icon source version must be a scene, collection, construction program, or recipe version.",
  )
}

function geometryOf(drawing: CompiledDrawing): SlopcameraIconGeometry {
  const { facts } = drawing
  return {
    regions: facts.regions,
    components: facts.components,
    apertures: facts.apertures,
    vertices: facts.vertices,
    inkArea: facts.inkArea,
    bounds: [facts.bounds[0], facts.bounds[1], facts.bounds[2], facts.bounds[3]],
  }
}

/** Key-sorted, indented JSON so written documents diff and hash stably. */
function stableDocumentText(value: unknown): string {
  return `${JSON.stringify(JSON.parse(canonicalJson(value)), null, 2)}\n`
}

const allowedSvgElements = new Set([
  "svg", "g", "defs", "clipPath", "mask", "title", "desc",
  "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
])
const allowedSvgAttributes = new Set([
  "xmlns", "width", "height", "viewBox", "role", "id", "d", "fill", "fill-rule",
  "fill-opacity", "clip-path", "clip-rule", "mask", "opacity", "stroke",
  "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray",
  "stroke-opacity", "stroke-miterlimit", "transform", "x", "y", "rx", "ry",
  "cx", "cy", "r", "x1", "y1", "x2", "y2", "points", "preserveAspectRatio",
])

/**
 * Admit only a closed vocabulary of static shape elements and presentation
 * attributes. Scripts, styles, links, images, foreign objects, event
 * handlers and non-local URL references fail closed.
 */
export function assertInertIconSvg(svg: string): void {
  if (Buffer.byteLength(svg, "utf8") > slopcameraIconSceneLimits.outputBytes) {
    throw new SlopcameraIconError("UNSAFE_ICON_OUTPUT", "Rendered SVG exceeds the output byte limit.")
  }
  if (!svg.startsWith("<svg ") || !svg.trimEnd().endsWith("</svg>")) {
    throw new SlopcameraIconError("UNSAFE_ICON_OUTPUT", "Rendered output is not a single SVG document.")
  }
  if (/<!|<\?|&(?!(?:amp|lt|gt|quot|apos|#\d{1,7}|#x[0-9a-f]{1,6});)/iu.test(svg)) {
    throw new SlopcameraIconError("UNSAFE_ICON_OUTPUT", "Rendered SVG contains declarations or unknown entities.")
  }
  const ids = new Set<string>()
  for (const tag of svg.matchAll(/<([A-Za-z][\w:.-]*)((?:\s+[^\s=/>]+="[^"]*")*)\s*\/?>/gu)) {
    const name = tag[1]!
    if (!allowedSvgElements.has(name)) {
      throw new SlopcameraIconError("UNSAFE_ICON_OUTPUT", `Rendered SVG contains a disallowed <${name}> element.`)
    }
    for (const attribute of tag[2]!.matchAll(/\s+([^\s=/>]+)="([^"]*)"/gu)) {
      const attributeName = attribute[1]!
      if (!allowedSvgAttributes.has(attributeName)) {
        throw new SlopcameraIconError(
          "UNSAFE_ICON_OUTPUT",
          `Rendered SVG contains a disallowed ${attributeName} attribute.`,
        )
      }
      if (attributeName === "id") ids.add(attribute[2]!)
    }
  }
  // Every opening tag must have matched the strict attribute grammar above.
  const openings = svg.match(/<[A-Za-z]/gu)?.length ?? 0
  const matched = [...svg.matchAll(/<([A-Za-z][\w:.-]*)((?:\s+[^\s=/>]+="[^"]*")*)\s*\/?>/gu)].length
  if (openings !== matched) {
    throw new SlopcameraIconError("UNSAFE_ICON_OUTPUT", "Rendered SVG contains a malformed element.")
  }
  for (const reference of svg.matchAll(/url\(([^)]*)\)/gu)) {
    const target = reference[1]!
    if (!/^#[A-Za-z0-9_-]+$/u.test(target) || !ids.has(target.slice(1))) {
      throw new SlopcameraIconError("UNSAFE_ICON_OUTPUT", "Rendered SVG references a non-local resource.")
    }
  }
}

function svgDimensions(svg: string): { readonly width: number; readonly height: number } {
  const root = /^<svg\b[^>]*>/u.exec(svg)?.[0] ?? ""
  const width = Number(/\swidth="(\d+)"/u.exec(root)?.[1])
  const height = Number(/\sheight="(\d+)"/u.exec(root)?.[1])
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new SlopcameraIconError("UNSAFE_ICON_OUTPUT", "Rendered SVG does not declare integer dimensions.")
  }
  return { width, height }
}

function parseSize(value: number | undefined, fallback: number): number {
  const size = value ?? fallback
  if (
    !Number.isSafeInteger(size)
    || size < slopcameraIconSceneLimits.sizeMin
    || size > slopcameraIconSceneLimits.sizeMax
  ) {
    invalidInput(
      `size must be an integer from ${String(slopcameraIconSceneLimits.sizeMin)} through ${String(slopcameraIconSceneLimits.sizeMax)}.`,
    )
  }
  return size
}

async function readIconSource(path: string): Promise<{
  readonly bytes: Uint8Array
  readonly record: Omit<SlopcameraIconSourceRecord, "format">
}> {
  const bytes = await readBoundedFile(path, slopcameraIconSceneLimits.sourceBytes, "Icon source")
  return { bytes, record: { path, sha256: sha256Hex(bytes), bytes: bytes.byteLength } }
}

async function publish(path: string, text: string): Promise<SlopcameraIconFileRecord> {
  const bytes = Buffer.from(text, "utf8")
  if (bytes.byteLength > slopcameraIconSceneLimits.outputBytes) {
    throw new SlopcameraIconError("UNSAFE_ICON_OUTPUT", "Icon output exceeds the output byte limit.")
  }
  await publishReplaceableFile(path, bytes)
  return { path, sha256: sha256Hex(bytes), bytes: bytes.byteLength }
}

function requireExtension(path: string, extension: string, label: string): void {
  if (!path.toLowerCase().endsWith(extension)) invalidInput(`${label} must end in ${extension}.`)
}

/**
 * Parse and solve one icon scene, collection, construction program or recipe.
 * With an output path, publish the canonical solved document that render
 * accepts; without one, write nothing.
 */
export async function composeSlopcameraIcon(
  input: SlopcameraIconComposeInput,
): Promise<SlopcameraIconComposeReceipt> {
  if (input.outputPath !== undefined) {
    requireExtension(input.outputPath, ".json", "outputPath")
    if (await hasPathCollision([input.sourcePath, input.outputPath])) {
      invalidInput("outputPath must differ from sourcePath.")
    }
  }
  const { bytes, record } = await readIconSource(input.sourcePath)
  const loaded = loadIconSource(bytes)
  let document: SceneDocument | ConstructionProgram
  let drawing: CompiledDrawing
  let documentDigest: string
  let diagnostics: SlopcameraIconDiagnostic[]
  let elementCount: number
  let title: string
  try {
    if (loaded.form === "scene") {
      const solution = solveScene(loaded.scene, loaded.sources)
      document = solution.scene
      drawing = solution.drawing
      documentDigest = createSceneRecipe(solution.scene, DEFAULT_SCENE_RENDER).digests.scene
      elementCount = solution.scene.nodes.length
      title = solution.scene.title
      diagnostics = solution.diagnostics.map((diagnostic) => ({
        code: diagnostic.code,
        message: libraryMessage(diagnostic.message),
        target: diagnostic.node,
      }))
    } else {
      document = loaded.drawing.program
      drawing = loaded.drawing
      documentDigest = programDigest(loaded.drawing.program)
      elementCount = loaded.drawing.program.parts.length
      title = loaded.drawing.program.title
      diagnostics = loaded.drawing.issues.map((issue) => ({
        code: issue.code,
        message: libraryMessage(issue.message),
        target: issue.part ?? null,
      }))
    }
  } catch (error) {
    if (error instanceof SlopcameraIconError) throw error
    invalidSource(`Icon source could not be solved: ${libraryMessage(error)}`)
  }
  const output = input.outputPath === undefined
    ? null
    : await publish(input.outputPath, stableDocumentText(document))
  return {
    receiptVersion: 1,
    operation: "slopcamera.icon.compose",
    engine: slopcameraIconEngine,
    source: { ...record, format: loaded.format },
    form: loaded.form,
    title,
    elementCount,
    digests: { document: documentDigest, geometry: drawing.digest },
    geometry: geometryOf(drawing),
    diagnostics: diagnostics.slice(0, slopcameraIconSceneLimits.diagnostics),
    output,
  }
}

/**
 * Draw one icon source to inert SVG. A recipe replays under its recorded
 * settings and must reproduce its recorded digests; any other source takes
 * bounded render settings. Optionally publish a replayable recipe.
 */
export async function renderSlopcameraIcon(
  input: SlopcameraIconRenderInput,
): Promise<SlopcameraIconRenderReceipt> {
  requireExtension(input.outputPath, ".svg", "outputPath")
  if (input.recipePath !== undefined) requireExtension(input.recipePath, ".json", "recipePath")
  if (await hasPathCollision([input.sourcePath, input.outputPath, input.recipePath])) {
    invalidInput("sourcePath, outputPath and recipePath must name different files.")
  }
  const { bytes, record } = await readIconSource(input.sourcePath)
  const loaded = loadIconSource(bytes)
  const replayed = loaded.format === "scene-recipe" || loaded.format === "program-recipe"
  if (
    replayed
    && (input.size !== undefined
      || input.background !== undefined
      || input.palette !== undefined
      || input.language !== undefined)
  ) {
    invalidInput("A recipe fixes its render settings; omit size, background, palette and language.")
  }
  if (loaded.form === "scene" && input.language !== undefined) {
    invalidInput("language applies only to construction programs; scenes use their family's language.")
  }
  if (loaded.form === "program" && input.palette !== undefined) {
    invalidInput("palette applies only to scenes.")
  }
  if (input.palette !== undefined && !slopcameraIconPalettes.includes(input.palette)) {
    invalidInput(`palette must be one of ${slopcameraIconPalettes.join(", ")}.`)
  }
  if (input.language !== undefined && !slopcameraIconLanguages.includes(input.language)) {
    invalidInput(`language must be one of ${slopcameraIconLanguages.join(", ")}.`)
  }

  let svg: string
  let width: number
  let height: number
  let recipeValue: unknown
  let digests: SlopcameraIconRenderReceipt["digests"]
  let render: SlopcameraIconRenderReceipt["render"]
  let notes: readonly string[]
  let title: string
  try {
    if (loaded.form === "scene") {
      let recipe: SceneRecipe
      let options: SceneRenderOptions
      let language: string
      if (loaded.replay !== undefined) {
        ;({ recipe, svg, width, height, options, notes } = loaded.replay)
        language = loaded.replay.style.language
      } else {
        options = {
          size: parseSize(input.size, DEFAULT_SCENE_RENDER.size),
          background: input.background ?? DEFAULT_SCENE_RENDER.background,
          palette: input.palette ?? DEFAULT_SCENE_RENDER.palette,
        }
        const drawn = renderScene(loaded.scene, options)
        recipe = createSceneRecipe(loaded.scene, options, drawn.solution.sources, drawn.style)
        ;({ svg, width, height, notes } = drawn)
        language = drawn.style.language
      }
      recipeValue = recipe
      digests = {
        document: recipe.digests.scene,
        geometry: recipe.digests.geometry,
        svg: recipe.digests.svg,
      }
      render = {
        size: options.size,
        background: options.background,
        palette: options.palette,
        language,
      }
      title = loaded.scene.title
    } else {
      const style: StyleOptions = loaded.replay?.style ?? {
        language: input.language ?? slopcameraIconDefaultLanguage,
        outputPx: parseSize(input.size, 512),
        background: input.background ?? false,
      }
      const drawn = loaded.replay ?? renderConstruction(loaded.drawing, style)
      const recipe = createRecipe(loaded.drawing, style)
      svg = drawn.svg
      ;({ width, height } = svgDimensions(svg))
      recipeValue = recipe
      digests = {
        document: recipe.digests.program,
        geometry: recipe.digests.geometry,
        svg: recipe.digests.svg,
      }
      render = {
        size: style.outputPx ?? width,
        background: style.background ?? false,
        palette: null,
        language: style.language,
      }
      notes = "notes" in drawn ? drawn.notes : []
      title = loaded.drawing.program.title
    }
  } catch (error) {
    if (error instanceof SlopcameraIconError) throw error
    invalidSource(`Icon source could not be drawn: ${libraryMessage(error)}`)
  }
  assertInertIconSvg(svg)
  const output = await publish(input.outputPath, svg)
  const recipe = input.recipePath === undefined
    ? null
    : await publish(input.recipePath, stableDocumentText(recipeValue))
  return {
    receiptVersion: 1,
    operation: "slopcamera.icon.render",
    engine: slopcameraIconEngine,
    source: { ...record, format: loaded.format },
    form: loaded.form,
    replayed,
    title,
    render,
    width,
    height,
    digests,
    output,
    recipe,
    notes: notes.slice(0, slopcameraIconSceneLimits.notes).map(libraryMessage),
  }
}
