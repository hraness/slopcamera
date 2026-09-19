#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";
import sharp from "sharp";

const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_INPUT_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_INPUT_BYTES = 256 * 1024 * 1024;
const MAX_PIXELS = 32_000_000;
const MAX_LAYERS = 96;
const MAX_DIMENSION = 8_192;
const colorPattern = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu;

type Point = { x: number; y: number };
type Shadow = { blur: number; color: string; dx: number; dy: number; opacity: number };
type PlainTreatment = { kind: "plain" };
type StickerTreatment = { kind: "sticker"; border: number; borderColor: string; shadow: Shadow };
type PaperTreatment = { kind: "paper"; color: string; padding: number; shadow: Shadow };
type ImageLayer = {
  kind: "image";
  path: string;
  x: number;
  y: number;
  width: number;
  height: number | undefined;
  rotation: number;
  trim: boolean;
  treatment: PlainTreatment | StickerTreatment | PaperTreatment;
};
type TextLayer = {
  kind: "text";
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  rotation: number;
  fontFamily: "sans" | "serif" | "mono";
  fontWeight: 400 | 500 | 600 | 700 | 800 | 900;
  align: "start" | "middle" | "end";
};
type ArrowLayer = {
  kind: "arrow";
  from: Point;
  to: Point;
  bend: number;
  color: string;
  width: number;
};
type EllipseLayer = {
  kind: "ellipse";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  color: string;
  strokeWidth: number;
};
type TapeLayer = {
  kind: "tape";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  color: string;
  opacity: number;
};
type Layer = ImageLayer | TextLayer | ArrowLayer | EllipseLayer | TapeLayer;
type Manifest = {
  schemaVersion: 1;
  canvas: {
    width: number;
    height: number;
    color: string;
    background?: { path: string; position: "centre" | "north" | "south" | "east" | "west" };
  };
  layers: readonly Layer[];
  effects: { chromaticShift: number; grain: number; grainSeed: number; vignette: number };
};
type InputRecord = { bytes: number; path: string; sha256: string };
type RetainedInput = { bytes: Buffer; record: InputRecord };

type ComposeResult = {
  canvas: { height: number; width: number };
  inputs: readonly InputRecord[];
  layerCount: number;
  manifestSha256: string;
  output: string;
  outputBytes: number;
  outputSha256: string;
  receipt: string;
};

function usage(): never {
  console.error("usage: compose-social-collage-banner.ts --manifest <path> --output <path.png>");
  process.exit(64);
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError(`${name} must be an object`);
  return value as Record<string, unknown>;
}

function finite(value: unknown, name: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

function integer(value: unknown, name: string, minimum: number, maximum: number): number {
  const parsed = finite(value, name, minimum, maximum);
  if (!Number.isInteger(parsed)) throw new RangeError(`${name} must be an integer`);
  return parsed;
}

function string(value: unknown, name: string, maximum: number): string {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum) {
    throw new TypeError(`${name} must be a non-empty string of at most ${maximum} characters`);
  }
  return value;
}

function color(value: unknown, name: string, fallback: string): string {
  if (value === undefined) return fallback;
  const parsed = string(value, name, 9);
  if (!colorPattern.test(parsed)) throw new TypeError(`${name} must be a six- or eight-digit hex color`);
  return parsed;
}

function enumeration<T extends string | number>(value: unknown, name: string, choices: readonly T[], fallback: T): T {
  if (value === undefined) return fallback;
  if (!choices.includes(value as T)) throw new TypeError(`${name} must be one of ${choices.join(", ")}`);
  return value as T;
}

function boolean(value: unknown, name: string, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new TypeError(`${name} must be a boolean`);
  return value;
}

function point(value: unknown, name: string, canvas: { width: number; height: number }): Point {
  const parsed = record(value, name);
  return {
    x: finite(parsed.x, `${name}.x`, -canvas.width, canvas.width * 2),
    y: finite(parsed.y, `${name}.y`, -canvas.height, canvas.height * 2),
  };
}

function shadow(value: unknown, name: string): Shadow {
  const parsed = value === undefined ? {} : record(value, name);
  return {
    blur: finite(parsed.blur ?? 14, `${name}.blur`, 0, 64),
    color: color(parsed.color, `${name}.color`, "#000000"),
    dx: finite(parsed.dx ?? 10, `${name}.dx`, -128, 128),
    dy: finite(parsed.dy ?? 14, `${name}.dy`, -128, 128),
    opacity: finite(parsed.opacity ?? 0.5, `${name}.opacity`, 0, 1),
  };
}

function treatment(value: unknown, name: string): PlainTreatment | StickerTreatment | PaperTreatment {
  if (value === undefined) return { kind: "plain" };
  const parsed = record(value, name);
  const kind = enumeration(parsed.kind, `${name}.kind`, ["plain", "sticker", "paper"] as const, "plain");
  if (kind === "plain") return { kind };
  if (kind === "sticker") {
    return {
      kind,
      border: finite(parsed.border ?? 10, `${name}.border`, 0, 64),
      borderColor: color(parsed.borderColor, `${name}.borderColor`, "#ffffff"),
      shadow: shadow(parsed.shadow, `${name}.shadow`),
    };
  }
  return {
    kind,
    color: color(parsed.color, `${name}.color`, "#faf5e8"),
    padding: finite(parsed.padding ?? 24, `${name}.padding`, 0, 128),
    shadow: shadow(parsed.shadow, `${name}.shadow`),
  };
}

function parseLayer(value: unknown, index: number, canvas: { width: number; height: number }): Layer {
  const name = `layers[${index}]`;
  const parsed = record(value, name);
  const kind = enumeration(parsed.kind, `${name}.kind`, ["image", "text", "arrow", "ellipse", "tape"] as const, "image");
  if (kind === "image") {
    return {
      kind,
      path: string(parsed.path, `${name}.path`, 4_096),
      x: finite(parsed.x, `${name}.x`, -canvas.width, canvas.width * 2),
      y: finite(parsed.y, `${name}.y`, -canvas.height, canvas.height * 2),
      width: finite(parsed.width, `${name}.width`, 1, MAX_DIMENSION),
      height: parsed.height === undefined ? undefined : finite(parsed.height, `${name}.height`, 1, MAX_DIMENSION),
      rotation: finite(parsed.rotation ?? 0, `${name}.rotation`, -360, 360),
      trim: boolean(parsed.trim, `${name}.trim`, true),
      treatment: treatment(parsed.treatment, `${name}.treatment`),
    };
  }
  if (kind === "text") {
    const text = string(parsed.text, `${name}.text`, 800);
    if (text.split("\n").length > 12) throw new RangeError(`${name}.text must contain at most 12 lines`);
    return {
      kind,
      text,
      x: finite(parsed.x, `${name}.x`, -canvas.width, canvas.width * 2),
      y: finite(parsed.y, `${name}.y`, -canvas.height, canvas.height * 2),
      fontSize: finite(parsed.fontSize, `${name}.fontSize`, 8, 512),
      fill: color(parsed.fill, `${name}.fill`, "#fff4d6"),
      stroke: color(parsed.stroke, `${name}.stroke`, "#17111f"),
      strokeWidth: finite(parsed.strokeWidth ?? 3, `${name}.strokeWidth`, 0, 32),
      rotation: finite(parsed.rotation ?? 0, `${name}.rotation`, -360, 360),
      fontFamily: enumeration(parsed.fontFamily, `${name}.fontFamily`, ["sans", "serif", "mono"] as const, "sans"),
      fontWeight: enumeration(parsed.fontWeight, `${name}.fontWeight`, [400, 500, 600, 700, 800, 900] as const, 700),
      align: enumeration(parsed.align, `${name}.align`, ["start", "middle", "end"] as const, "middle"),
    };
  }
  if (kind === "arrow") {
    return {
      kind,
      from: point(parsed.from, `${name}.from`, canvas),
      to: point(parsed.to, `${name}.to`, canvas),
      bend: finite(parsed.bend ?? 0.25, `${name}.bend`, -2, 2),
      color: color(parsed.color, `${name}.color`, "#ff5048"),
      width: finite(parsed.width ?? 8, `${name}.width`, 1, 64),
    };
  }
  if (kind === "ellipse") {
    return {
      kind,
      x: finite(parsed.x, `${name}.x`, -canvas.width, canvas.width * 2),
      y: finite(parsed.y, `${name}.y`, -canvas.height, canvas.height * 2),
      width: finite(parsed.width, `${name}.width`, 1, MAX_DIMENSION),
      height: finite(parsed.height, `${name}.height`, 1, MAX_DIMENSION),
      rotation: finite(parsed.rotation ?? 0, `${name}.rotation`, -360, 360),
      color: color(parsed.color, `${name}.color`, "#ff5048"),
      strokeWidth: finite(parsed.strokeWidth ?? 8, `${name}.strokeWidth`, 1, 64),
    };
  }
  return {
    kind,
    x: finite(parsed.x, `${name}.x`, -canvas.width, canvas.width * 2),
    y: finite(parsed.y, `${name}.y`, -canvas.height, canvas.height * 2),
    width: finite(parsed.width, `${name}.width`, 1, MAX_DIMENSION),
    height: finite(parsed.height, `${name}.height`, 1, MAX_DIMENSION),
    rotation: finite(parsed.rotation ?? 0, `${name}.rotation`, -360, 360),
    color: color(parsed.color, `${name}.color`, "#f8ebaa"),
    opacity: finite(parsed.opacity ?? 0.78, `${name}.opacity`, 0, 1),
  };
}

function parseManifest(value: unknown): Manifest {
  const parsed = record(value, "manifest");
  if (parsed.schemaVersion !== 1) throw new TypeError("schemaVersion must be 1");
  const sourceCanvas = record(parsed.canvas, "canvas");
  const width = integer(sourceCanvas.width, "canvas.width", 320, MAX_DIMENSION);
  const height = integer(sourceCanvas.height, "canvas.height", 160, MAX_DIMENSION);
  if (width * height > MAX_PIXELS) throw new RangeError(`canvas exceeds ${MAX_PIXELS} pixels`);
  const canvas: Manifest["canvas"] = {
    width,
    height,
    color: color(sourceCanvas.color, "canvas.color", "#100a1c"),
  };
  if (sourceCanvas.background !== undefined) {
    const background = record(sourceCanvas.background, "canvas.background");
    canvas.background = {
      path: string(background.path, "canvas.background.path", 4_096),
      position: enumeration(background.position, "canvas.background.position", ["centre", "north", "south", "east", "west"] as const, "centre"),
    };
  }
  if (!Array.isArray(parsed.layers) || parsed.layers.length > MAX_LAYERS) {
    throw new RangeError(`layers must be an array with at most ${MAX_LAYERS} entries`);
  }
  const sourceEffects = parsed.effects === undefined ? {} : record(parsed.effects, "effects");
  return {
    schemaVersion: 1,
    canvas,
    layers: parsed.layers.map((layer, index) => parseLayer(layer, index, canvas)),
    effects: {
      chromaticShift: integer(sourceEffects.chromaticShift ?? 0, "effects.chromaticShift", 0, 16),
      grain: finite(sourceEffects.grain ?? 0, "effects.grain", 0, 1),
      grainSeed: integer(sourceEffects.grainSeed ?? 7, "effects.grainSeed", 0, 0xffff_ffff),
      vignette: finite(sourceEffects.vignette ?? 0, "effects.vignette", 0, 1),
    },
  };
}

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function parseHex(value: string): { alpha: number; b: number; g: number; r: number } {
  return {
    r: Number.parseInt(value.slice(1, 3), 16),
    g: Number.parseInt(value.slice(3, 5), 16),
    b: Number.parseInt(value.slice(5, 7), 16),
    alpha: value.length === 9 ? Number.parseInt(value.slice(7, 9), 16) / 255 : 1,
  };
}

function admitRaster(width: number, height: number, name: string): void {
  if (
    !Number.isInteger(width)
    || !Number.isInteger(height)
    || width < 1
    || height < 1
    || width > MAX_DIMENSION
    || height > MAX_DIMENSION
    || width * height > MAX_PIXELS
  ) {
    throw new RangeError(`${name} exceeds the ${MAX_DIMENSION}px edge or ${MAX_PIXELS}-pixel raster budget`);
  }
}

async function rotateLayer(asset: Buffer, angle: number, name: string): Promise<Buffer> {
  if (angle === 0) return asset;
  const metadata = await sharp(asset).metadata();
  const width = metadata.width;
  const height = metadata.height;
  if (width === undefined || height === undefined) throw new TypeError(`${name} has no dimensions`);
  const radians = Math.abs(angle % 180) * Math.PI / 180;
  const rotatedWidth = Math.ceil(Math.abs(width * Math.cos(radians)) + Math.abs(height * Math.sin(radians)));
  const rotatedHeight = Math.ceil(Math.abs(width * Math.sin(radians)) + Math.abs(height * Math.cos(radians)));
  admitRaster(rotatedWidth, rotatedHeight, `${name} rotation`);
  return sharp(asset).rotate(angle, { background: "#00000000" }).png().toBuffer();
}

function resolveInput(path: string, manifestDirectory: string): string {
  if (/^[a-z][a-z0-9+.-]*:/iu.test(path)) throw new TypeError("collage inputs must be local files, not URLs");
  return resolve(isAbsolute(path) ? path : join(manifestDirectory, path));
}

async function readBounded(path: string): Promise<Buffer> {
  const details = await stat(path);
  if (!details.isFile() || details.size < 1 || details.size > MAX_INPUT_BYTES) {
    throw new RangeError(`input must be a physical file from 1 to ${MAX_INPUT_BYTES} bytes: ${path}`);
  }
  const bytes = await readFile(path);
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_INPUT_BYTES) {
    throw new RangeError(`input changed outside the admitted byte range while reading: ${path}`);
  }
  return bytes;
}

async function retainInput(path: string, inputs: Map<string, RetainedInput>): Promise<Buffer> {
  const retained = inputs.get(path);
  if (retained !== undefined) return retained.bytes;
  const bytes = await readBounded(path);
  const total = [...inputs.values()].reduce((sum, input) => sum + input.bytes.byteLength, bytes.byteLength);
  if (total > MAX_TOTAL_INPUT_BYTES) throw new RangeError(`aggregate inputs exceed ${MAX_TOTAL_INPUT_BYTES} bytes`);
  inputs.set(path, { bytes, record: { bytes: bytes.byteLength, path, sha256: digest(bytes) } });
  return bytes;
}

async function validateRaster(bytes: Buffer, path: string): Promise<{ height: number; width: number }> {
  const metadata = await sharp(bytes, { failOn: "warning", limitInputPixels: MAX_PIXELS }).metadata();
  if (
    !(["png", "jpeg", "webp"] as const).includes(metadata.format as "png" | "jpeg" | "webp")
    || (metadata.pages !== undefined && metadata.pages !== 1)
    || metadata.width === undefined
    || metadata.height === undefined
    || metadata.width * metadata.height > MAX_PIXELS
  ) {
    throw new TypeError(`image input must be one bounded PNG, JPEG, or WebP frame: ${path}`);
  }
  const rotated = metadata.orientation !== undefined && metadata.orientation >= 5 && metadata.orientation <= 8;
  return rotated ? { height: metadata.width, width: metadata.height } : { height: metadata.height, width: metadata.width };
}

async function rgbaWithMask(width: number, height: number, fill: string, mask: Buffer, opacity = 1): Promise<Buffer> {
  const parsed = parseHex(fill);
  const combinedOpacity = opacity * parsed.alpha;
  const alpha = combinedOpacity === 1 ? mask : await sharp(mask).linear(combinedOpacity).png().toBuffer();
  return sharp({ create: { width, height, channels: 3, background: parsed } }).joinChannel(alpha).png().toBuffer();
}

async function addShadow(asset: Buffer, treatmentShadow: Shadow, inset: number): Promise<Buffer> {
  const metadata = await sharp(asset).metadata();
  const width = metadata.width;
  const height = metadata.height;
  if (width === undefined || height === undefined) throw new TypeError("layer has no dimensions");
  const blurPad = Math.ceil(treatmentShadow.blur * 2);
  const offsetPad = Math.ceil(Math.max(Math.abs(treatmentShadow.dx), Math.abs(treatmentShadow.dy)));
  const pad = inset + blurPad + offsetPad;
  admitRaster(width + blurPad * 2, height + blurPad * 2, "shadow mask");
  admitRaster(width + pad * 2, height + pad * 2, "shadow layer");
  let alphaPipeline = sharp(asset).extractChannel("alpha");
  if (blurPad > 0) {
    alphaPipeline = alphaPipeline.extend({
      top: blurPad,
      bottom: blurPad,
      left: blurPad,
      right: blurPad,
      background: "#000000",
    }).blur(treatmentShadow.blur);
  }
  const alpha = await alphaPipeline.png().toBuffer();
  const shadowImage = await rgbaWithMask(width + blurPad * 2, height + blurPad * 2, treatmentShadow.color, alpha, treatmentShadow.opacity);
  return sharp({
    create: { width: width + pad * 2, height: height + pad * 2, channels: 4, background: "#00000000" },
  }).composite([
    { input: shadowImage, left: Math.round(pad - blurPad + treatmentShadow.dx), top: Math.round(pad - blurPad + treatmentShadow.dy) },
    { input: asset, left: pad, top: pad },
  ]).png().toBuffer();
}

async function dilateAlpha(asset: Buffer, radius: number): Promise<Buffer> {
  const { data, info } = await sharp(asset).extractChannel("alpha").raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 1) throw new TypeError("sticker alpha must decode to one channel");
  const width = info.width;
  const height = info.height;
  const distance = Math.max(0, Math.round(radius));
  if (distance === 0) return sharp(data, { raw: { width, height, channels: 1 } }).png().toBuffer();
  const horizontal = Buffer.allocUnsafe(width * height);
  const rowQueue = new Int32Array(width);
  for (let y = 0; y < height; y += 1) {
    let head = 0;
    let tail = 0;
    let right = -1;
    for (let x = 0; x < width; x += 1) {
      const desiredRight = Math.min(width - 1, x + distance);
      while (right < desiredRight) {
        right += 1;
        const value = data[y * width + right] ?? 0;
        while (tail > head && (data[y * width + (rowQueue[tail - 1] ?? 0)] ?? 0) <= value) tail -= 1;
        rowQueue[tail] = right;
        tail += 1;
      }
      const left = x - distance;
      while (tail > head && (rowQueue[head] ?? 0) < left) head += 1;
      horizontal[y * width + x] = data[y * width + (rowQueue[head] ?? 0)] ?? 0;
    }
  }
  const output = Buffer.allocUnsafe(width * height);
  const columnQueue = new Int32Array(height);
  for (let x = 0; x < width; x += 1) {
    let head = 0;
    let tail = 0;
    let bottom = -1;
    for (let y = 0; y < height; y += 1) {
      const desiredBottom = Math.min(height - 1, y + distance);
      while (bottom < desiredBottom) {
        bottom += 1;
        const value = horizontal[bottom * width + x] ?? 0;
        while (tail > head && (horizontal[(columnQueue[tail - 1] ?? 0) * width + x] ?? 0) <= value) tail -= 1;
        columnQueue[tail] = bottom;
        tail += 1;
      }
      const top = y - distance;
      while (tail > head && (columnQueue[head] ?? 0) < top) head += 1;
      output[y * width + x] = horizontal[(columnQueue[head] ?? 0) * width + x] ?? 0;
    }
  }
  return sharp(output, { raw: { width, height, channels: 1 } }).png().toBuffer();
}

async function applySticker(asset: Buffer, layer: StickerTreatment): Promise<Buffer> {
  const metadata = await sharp(asset).metadata();
  const originalWidth = metadata.width;
  const originalHeight = metadata.height;
  if (originalWidth === undefined || originalHeight === undefined) throw new TypeError("sticker has no dimensions");
  const edge = Math.ceil(layer.border);
  const expansion = edge === 0 ? 0 : (edge + 2) * 2;
  admitRaster(originalWidth + expansion, originalHeight + expansion, "sticker border");
  const source = edge === 0 ? asset : await sharp(asset).extend({
    top: edge + 2,
    bottom: edge + 2,
    left: edge + 2,
    right: edge + 2,
    background: "#00000000",
  }).png().toBuffer();
  const sourceMetadata = await sharp(source).metadata();
  const width = sourceMetadata.width;
  const height = sourceMetadata.height;
  if (width === undefined || height === undefined) throw new TypeError("sticker has no expanded dimensions");
  const mask = await dilateAlpha(source, edge);
  const border = await rgbaWithMask(width, height, layer.borderColor, mask);
  const combined = await sharp({ create: { width, height, channels: 4, background: "#00000000" } })
    .composite([{ input: border, left: 0, top: 0 }, { input: source, left: 0, top: 0 }])
    .png()
    .toBuffer();
  return addShadow(combined, layer.shadow, 0);
}

async function applyPaper(asset: Buffer, layer: PaperTreatment): Promise<Buffer> {
  const metadata = await sharp(asset).metadata();
  const width = metadata.width;
  const height = metadata.height;
  if (width === undefined || height === undefined) throw new TypeError("paper layer has no dimensions");
  const padding = Math.round(layer.padding);
  admitRaster(width + padding * 2, height + padding * 2, "paper layer");
  const paper = await sharp({
    create: { width: width + padding * 2, height: height + padding * 2, channels: 4, background: parseHex(layer.color) },
  }).composite([{ input: asset, left: padding, top: padding }]).png().toBuffer();
  return addShadow(paper, layer.shadow, 0);
}

async function prepareImageLayer(layer: ImageLayer, manifestDirectory: string, inputs: Map<string, RetainedInput>): Promise<Buffer> {
  const path = resolveInput(layer.path, manifestDirectory);
  const bytes = await retainInput(path, inputs);
  await validateRaster(bytes, path);
  let normalized = sharp(bytes, { failOn: "warning", limitInputPixels: MAX_PIXELS }).rotate().ensureAlpha();
  if (layer.trim) normalized = normalized.trim({ background: "#00000000", threshold: 2 });
  const normalizedBytes = await normalized.png().toBuffer();
  const normalizedMetadata = await sharp(normalizedBytes).metadata();
  const normalizedWidth = normalizedMetadata.width;
  const normalizedHeight = normalizedMetadata.height;
  if (normalizedWidth === undefined || normalizedHeight === undefined) throw new TypeError(`image layer has no dimensions: ${path}`);
  const targetWidth = Math.round(layer.width);
  const targetHeight = layer.height === undefined
    ? Math.max(1, Math.round(normalizedHeight * targetWidth / normalizedWidth))
    : Math.round(layer.height);
  admitRaster(targetWidth, targetHeight, "image layer");
  const asset = await sharp(normalizedBytes).resize(targetWidth, layer.height === undefined ? undefined : targetHeight, {
    fit: layer.height === undefined ? "inside" : "contain",
    background: "#00000000",
    withoutEnlargement: false,
  }).png().toBuffer();
  const treated = layer.treatment.kind === "sticker"
    ? await applySticker(asset, layer.treatment)
    : layer.treatment.kind === "paper"
      ? await applyPaper(asset, layer.treatment)
      : asset;
  return rotateLayer(treated, layer.rotation, "image layer");
}

async function prepareTextLayer(layer: TextLayer): Promise<Buffer> {
  const lines = layer.text.split("\n");
  const longest = Math.max(...lines.map((line) => Array.from(line).length));
  const width = Math.max(32, Math.ceil(longest * layer.fontSize * 0.78 + layer.strokeWidth * 6));
  const lineHeight = layer.fontSize * 1.15;
  const height = Math.max(32, Math.ceil(lines.length * lineHeight + layer.strokeWidth * 6));
  admitRaster(width, height, "text layer");
  const family = layer.fontFamily === "mono" ? "monospace" : layer.fontFamily === "serif" ? "serif" : "sans-serif";
  const anchor = layer.align;
  const x = anchor === "start" ? layer.strokeWidth * 3 : anchor === "end" ? width - layer.strokeWidth * 3 : width / 2;
  const tspans = lines.map((line, index) => `<tspan x="${x}" y="${layer.strokeWidth * 3 + layer.fontSize + index * lineHeight}">${escapeXml(line)}</tspan>`).join("");
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><text text-anchor="${anchor}" font-family="${family}" font-size="${layer.fontSize}" font-weight="${layer.fontWeight}" fill="${layer.fill}" stroke="${layer.stroke}" stroke-width="${layer.strokeWidth}" stroke-linejoin="round" paint-order="stroke">${tspans}</text></svg>`);
  const rendered = await sharp(svg).png().toBuffer();
  return rotateLayer(rendered, layer.rotation, "text layer");
}

async function prepareTapeLayer(layer: TapeLayer): Promise<Buffer> {
  const width = Math.round(layer.width);
  const height = Math.round(layer.height);
  admitRaster(width, height, "tape layer");
  const fill = parseHex(layer.color);
  const lines = Array.from({ length: Math.min(96, Math.ceil(width / 5)) }, (_, index) => {
    const x = (index * 37) % width;
    return `<line x1="${x}" y1="0" x2="${Math.max(0, Math.min(width, x + (index % 5) - 2))}" y2="${height}" stroke="#ffffff" stroke-opacity="0.14"/>`;
  }).join("");
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" rx="2" fill="rgb(${fill.r},${fill.g},${fill.b})" fill-opacity="${layer.opacity * fill.alpha}"/>${lines}</svg>`);
  const rendered = await sharp(svg).png().toBuffer();
  return rotateLayer(rendered, layer.rotation, "tape layer");
}

function geometrySvg(layer: ArrowLayer | EllipseLayer, canvas: Manifest["canvas"]): Buffer {
  if (layer.kind === "ellipse") {
    const transform = `rotate(${layer.rotation} ${layer.x} ${layer.y})`;
    return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}"><ellipse cx="${layer.x}" cy="${layer.y}" rx="${layer.width / 2}" ry="${layer.height / 2}" fill="none" stroke="${layer.color}" stroke-width="${layer.strokeWidth}" stroke-linecap="round" transform="${transform}"/></svg>`);
  }
  const dx = layer.to.x - layer.from.x;
  const dy = layer.to.y - layer.from.y;
  const controlX = (layer.from.x + layer.to.x) / 2 + dy * layer.bend;
  const controlY = (layer.from.y + layer.to.y) / 2 - dx * layer.bend;
  const angle = Math.atan2(layer.to.y - controlY, layer.to.x - controlX);
  const head = Math.max(18, layer.width * 3);
  const leftX = layer.to.x + Math.cos(angle + 2.55) * head;
  const leftY = layer.to.y + Math.sin(angle + 2.55) * head;
  const rightX = layer.to.x + Math.cos(angle - 2.55) * head;
  const rightY = layer.to.y + Math.sin(angle - 2.55) * head;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}"><g fill="none" stroke="${layer.color}" stroke-width="${layer.width}" stroke-linecap="round" stroke-linejoin="round"><path d="M ${layer.from.x} ${layer.from.y} Q ${controlX} ${controlY} ${layer.to.x} ${layer.to.y}"/><path d="M ${leftX} ${leftY} L ${layer.to.x} ${layer.to.y} L ${rightX} ${rightY}"/></g></svg>`);
}

async function place(canvas: Buffer, layer: Buffer, x: number, y: number, width: number, height: number): Promise<Buffer> {
  const metadata = await sharp(layer).metadata();
  const layerWidth = metadata.width;
  const layerHeight = metadata.height;
  if (layerWidth === undefined || layerHeight === undefined) throw new TypeError("layer has no dimensions");
  const left = Math.round(x - layerWidth / 2);
  const top = Math.round(y - layerHeight / 2);
  const sourceLeft = Math.max(0, -left);
  const sourceTop = Math.max(0, -top);
  const targetLeft = Math.max(0, left);
  const targetTop = Math.max(0, top);
  const clippedWidth = Math.min(layerWidth - sourceLeft, width - targetLeft);
  const clippedHeight = Math.min(layerHeight - sourceTop, height - targetTop);
  if (clippedWidth <= 0 || clippedHeight <= 0) return canvas;
  const clipped = sourceLeft === 0 && sourceTop === 0 && clippedWidth === layerWidth && clippedHeight === layerHeight
    ? layer
    : await sharp(layer).extract({ left: sourceLeft, top: sourceTop, width: clippedWidth, height: clippedHeight }).png().toBuffer();
  return sharp(canvas).composite([{ input: clipped, left: targetLeft, top: targetTop }]).png().toBuffer();
}

function random(seed: number): () => number {
  let state = seed >>> 0 || 0x9e37_79b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

async function applyEffects(source: Buffer, manifest: Manifest): Promise<Buffer> {
  let image = source;
  if (manifest.effects.vignette > 0) {
    const alpha = Math.round(manifest.effects.vignette * 220);
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${manifest.canvas.width}" height="${manifest.canvas.height}"><defs><radialGradient id="v"><stop offset="45%" stop-color="#000000" stop-opacity="0"/><stop offset="100%" stop-color="#080510" stop-opacity="${alpha / 255}"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#v)"/></svg>`);
    image = await sharp(image).composite([{ input: svg, left: 0, top: 0 }]).png().toBuffer();
  }
  if (manifest.effects.grain > 0) {
    const next = random(manifest.effects.grainSeed);
    const count = manifest.canvas.width * manifest.canvas.height;
    const noise = Buffer.allocUnsafe(count * 4);
    for (let index = 0; index < count; index += 1) {
      const value = Math.round(next() * 255);
      noise[index * 4] = value;
      noise[index * 4 + 1] = value;
      noise[index * 4 + 2] = value;
      noise[index * 4 + 3] = Math.round(manifest.effects.grain * 42);
    }
    const overlay = await sharp(noise, { raw: { width: manifest.canvas.width, height: manifest.canvas.height, channels: 4 } }).png().toBuffer();
    image = await sharp(image).composite([{ input: overlay, left: 0, top: 0, blend: "overlay" }]).png().toBuffer();
  }
  if (manifest.effects.chromaticShift > 0) {
    const { data, info } = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const shifted = Buffer.allocUnsafe(data.length);
    const channels = info.channels;
    const shift = manifest.effects.chromaticShift;
    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        const target = (y * info.width + x) * channels;
        const red = (y * info.width + Math.min(info.width - 1, x + shift)) * channels;
        const blue = (y * info.width + Math.max(0, x - shift)) * channels;
        shifted[target] = data[red] ?? 0;
        shifted[target + 1] = data[target + 1] ?? 0;
        shifted[target + 2] = data[blue + 2] ?? 0;
      }
    }
    image = await sharp(shifted, { raw: { width: info.width, height: info.height, channels: 3 } }).png().toBuffer();
  }
  return image;
}

export async function composeSocialCollageBanner(manifestPath: string, outputPath: string): Promise<ComposeResult> {
  const resolvedManifest = resolve(manifestPath);
  const resolvedOutput = resolve(outputPath);
  if (extname(resolvedOutput).toLowerCase() !== ".png") throw new TypeError("output must use the .png extension");
  const manifestBytes = await readBounded(resolvedManifest);
  if (manifestBytes.byteLength > MAX_MANIFEST_BYTES) throw new RangeError(`manifest exceeds ${MAX_MANIFEST_BYTES} bytes`);
  const manifest = parseManifest(JSON.parse(manifestBytes.toString("utf8")) as unknown);
  const receiptPath = resolvedOutput.replace(/\.png$/iu, ".receipt.json");
  for (const path of [resolvedOutput, receiptPath]) {
    try {
      await stat(path);
      throw new Error(`refusing to replace existing output: ${path}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const inputs = new Map<string, RetainedInput>();
  let canvas: Buffer;
  if (manifest.canvas.background === undefined) {
    canvas = await sharp({
      create: { width: manifest.canvas.width, height: manifest.canvas.height, channels: 4, background: parseHex(manifest.canvas.color) },
    }).png().toBuffer();
  } else {
    const path = resolveInput(manifest.canvas.background.path, dirname(resolvedManifest));
    const bytes = await retainInput(path, inputs);
    await validateRaster(bytes, path);
    canvas = await sharp(bytes, { failOn: "warning", limitInputPixels: MAX_PIXELS }).rotate().resize(manifest.canvas.width, manifest.canvas.height, {
      fit: "cover",
      position: manifest.canvas.background.position,
    }).ensureAlpha().png().toBuffer();
  }
  for (const layer of manifest.layers) {
    if (layer.kind === "image") {
      const prepared = await prepareImageLayer(layer, dirname(resolvedManifest), inputs);
      canvas = await place(canvas, prepared, layer.x, layer.y, manifest.canvas.width, manifest.canvas.height);
    } else if (layer.kind === "text") {
      const prepared = await prepareTextLayer(layer);
      canvas = await place(canvas, prepared, layer.x, layer.y, manifest.canvas.width, manifest.canvas.height);
    } else if (layer.kind === "tape") {
      const prepared = await prepareTapeLayer(layer);
      canvas = await place(canvas, prepared, layer.x, layer.y, manifest.canvas.width, manifest.canvas.height);
    } else {
      canvas = await sharp(canvas).composite([{ input: geometrySvg(layer, manifest.canvas), left: 0, top: 0 }]).png().toBuffer();
    }
  }
  const inputRecords = [...inputs.values()].map((input) => input.record).sort((left, right) => left.path.localeCompare(right.path));
  const output = await applyEffects(canvas, manifest);
  const result: ComposeResult = {
    canvas: { height: manifest.canvas.height, width: manifest.canvas.width },
    inputs: inputRecords,
    layerCount: manifest.layers.length,
    manifestSha256: digest(manifestBytes),
    output: resolvedOutput,
    outputBytes: output.byteLength,
    outputSha256: digest(output),
    receipt: receiptPath,
  };
  await mkdir(dirname(resolvedOutput), { recursive: true });
  await writeFile(resolvedOutput, output, { flag: "wx" });
  await writeFile(receiptPath, `${JSON.stringify({ kind: "slopcamera.social-collage-receipt", schemaVersion: 1, ...result }, null, 2)}\n`, { flag: "wx" });
  return result;
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const value = (name: string): string | undefined => {
    const index = argv.indexOf(name);
    return index < 0 ? undefined : argv[index + 1];
  };
  const manifest = value("--manifest");
  const output = value("--output");
  if (manifest === undefined || output === undefined) usage();
  console.log(JSON.stringify(await composeSocialCollageBanner(manifest, output)));
}
