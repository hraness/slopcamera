/**
 * Motion helpers for HTML launch films.
 *
 * Every helper is a pure function of the frame time, or applies such a value
 * to an element it is handed. A frame callback built on these renders the
 * same picture whether a frame is requested first, last, twice, or alone,
 * which is what `slopcamera html render` and `html still` rely on.
 *
 * This module has no imports so `slopcamera html init` can copy it into a
 * film project as a self-contained file. Keep it that way.
 */

/** The frame record `SlopcameraOverlay.onFrame` passes to each callback. */
export interface HtmlFilmFrame {
  /** Zero-based frame index on the absolute render clock. */
  readonly frame: number;
  /** Frame time in milliseconds: `frame * 1000 / fps`. */
  readonly timeMs: number;
  /** Milliseconds since the previous frame, zero on the first frame. */
  readonly deltaMs: number;
  /** `timeMs / durationMs`, capped at 1. */
  readonly progress: number;
  readonly width: number;
  readonly height: number;
}

/** The page-visible `globalThis.SlopcameraOverlay` API a film uses. */
export interface HtmlFilmOverlay {
  onFrame(callback: (frame: HtmlFilmFrame) => void | Promise<void>): void;
  ready(work: Promise<unknown>): void;
  asset(name: string): string;
  readonly parameters?: Readonly<Record<string, unknown>>;
  readonly width?: number;
  readonly height?: number;
}

// ------------------------------------------------------------------ numbers

export const clamp = (value: number, min = 0, max = 1): number => Math.min(max, Math.max(min, value));
export const lerp = (from: number, to: number, amount: number): number => from + (to - from) * amount;
/** Progress of `t` through the window `[start, end]`, clamped to 0..1. */
export function prog(t: number, start: number, end: number): number {
  if (end <= start) return t >= end ? 1 : 0;
  return clamp((t - start) / (end - start));
}

export type Easing = (x: number) => number;
export const easings = Object.freeze({
  linear: (x: number) => x,
  inCubic: (x: number) => x ** 3,
  outCubic: (x: number) => 1 - (1 - x) ** 3,
  inOutCubic: (x: number) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2),
  inQuart: (x: number) => x ** 4,
  outQuart: (x: number) => 1 - (1 - x) ** 4,
  inOutQuart: (x: number) => (x < 0.5 ? 8 * x ** 4 : 1 - (-2 * x + 2) ** 4 / 2),
  outQuint: (x: number) => 1 - (1 - x) ** 5,
  outExpo: (x: number) => (x >= 1 ? 1 : 1 - 2 ** (-10 * x)),
  inOutSine: (x: number) => (1 - Math.cos(Math.PI * x)) / 2,
  outBack: (x: number) => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2,
} satisfies Record<string, Easing>);

/**
 * A damped spring from 0 to 1. `seconds` is the time since release; before
 * release it is 0. Lower `damping` overshoots more; 1 or more never overshoots.
 */
export function spring(seconds: number, frequency = 1.5, damping = 0.7): number {
  if (seconds <= 0) return 0;
  const w = 2 * Math.PI * frequency;
  if (damping >= 1) return 1 - Math.exp(-w * seconds) * (1 + w * seconds);
  const wd = w * Math.sqrt(1 - damping * damping);
  return 1 - Math.exp(-damping * w * seconds) * (Math.cos(wd * seconds) + ((damping * w) / wd) * Math.sin(wd * seconds));
}

/**
 * A value that holds, then eases to the next key. Keys are `[atSeconds, value]`
 * in time order; each change takes `duration` seconds.
 */
export function stepValue(keys: readonly (readonly [number, number])[], t: number, duration = 0.5, ease: Easing = easings.inOutCubic): number {
  if (keys.length === 0) throw new RangeError("stepValue needs at least one key.");
  let value = keys[0]![1];
  for (let index = 1; index < keys.length; index++) {
    const [at, to] = keys[index]!;
    if (t < at) break;
    value = lerp(value, to, ease(prog(t, at, at + duration)));
  }
  return value;
}

/** Opacities for a crossfade that starts at `at` and lasts `duration` seconds. */
export function crossfade(t: number, at: number, duration = 0.6, ease: Easing = easings.inOutCubic): { readonly out: number; readonly in: number } {
  const amount = ease(prog(t, at, at + duration));
  return { out: 1 - amount, in: amount };
}

// ----------------------------------------------------------------- timeline

export interface HtmlFilmActInput {
  readonly id: string;
  /** Seconds the act is on screen, including its overlap with the next act. */
  readonly duration: number;
  /** Seconds this act starts before the previous one ends, for crossfades. */
  readonly overlap?: number;
  /** One short line said in the act, used for WebVTT captions and beats. */
  readonly caption?: string;
}

export interface HtmlFilmAct extends HtmlFilmActInput {
  readonly start: number;
  readonly end: number;
}

export interface HtmlFilmTimeline {
  readonly acts: readonly HtmlFilmAct[];
  readonly duration: number;
  act(id: string): HtmlFilmAct;
  /** Seconds since the act started; negative before it. */
  local(t: number, id: string): number;
  /** Progress through the act, 0..1. */
  progress(t: number, id: string): number;
  /** True while the act is on screen, widened by `pad` seconds on each side. */
  active(t: number, id: string, pad?: number): boolean;
  /** The latest act that has started at `t`. */
  current(t: number): HtmlFilmAct;
}

/** Lays acts end to end. Overlaps pull an act earlier so it can crossfade. */
export function defineTimeline(inputs: readonly HtmlFilmActInput[]): HtmlFilmTimeline {
  if (inputs.length === 0) throw new RangeError("A timeline needs at least one act.");
  const seen = new Set<string>();
  const acts: HtmlFilmAct[] = [];
  let cursor = 0;
  for (const input of inputs) {
    if (seen.has(input.id)) throw new RangeError(`Duplicate act id: ${input.id}`);
    if (!(input.duration > 0) || !Number.isFinite(input.duration)) throw new RangeError(`Act ${input.id} needs a positive duration.`);
    const overlap = input.overlap ?? 0;
    if (overlap < 0 || (acts.length === 0 && overlap > 0) || overlap >= input.duration) throw new RangeError(`Act ${input.id} has an invalid overlap.`);
    seen.add(input.id);
    const start = Math.max(0, cursor - overlap);
    const end = start + input.duration;
    acts.push(Object.freeze({ ...input, start, end }));
    cursor = end;
  }
  const byId = new Map(acts.map(act => [act.id, act]));
  const act = (id: string) => {
    const found = byId.get(id);
    if (found === undefined) throw new RangeError(`Unknown act: ${id}`);
    return found;
  };
  return Object.freeze({
    acts: Object.freeze(acts),
    duration: cursor,
    act,
    local: (t: number, id: string) => t - act(id).start,
    progress: (t: number, id: string) => prog(t, act(id).start, act(id).end),
    active: (t: number, id: string, pad = 0) => t >= act(id).start - pad && t < act(id).end + pad,
    current: (t: number) => acts.reduce((found, candidate) => (candidate.start <= t ? candidate : found), acts[0]!),
  });
}

function vttTime(seconds: number): string {
  const ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const pad = (value: number, width = 2) => String(value).padStart(width, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms % 1000, 3)}`;
}

/**
 * WebVTT captions from each act's `caption`. A cue runs from its act's start
 * until the next captioned act starts, so overlapping acts never stack cues.
 */
export function captionsFromTimeline(timeline: Pick<HtmlFilmTimeline, "acts" | "duration">): string {
  const captioned = timeline.acts.filter(act => act.caption !== undefined && act.caption.trim() !== "");
  const cues = captioned.map((act, index) => {
    const next = captioned[index + 1];
    const end = next === undefined ? Math.min(act.end, timeline.duration) : Math.min(act.end, next.start);
    const text = act.caption!.replaceAll("-->", "->").replace(/\s*\n\s*/gu, "\n").trim();
    return `${act.id}\n${vttTime(act.start)} --> ${vttTime(end)}\n${text}`;
  });
  return `WEBVTT\n\n${cues.join("\n\n")}${cues.length === 0 ? "" : "\n"}`;
}

// ------------------------------------------------------------------ camera

export interface HtmlFilmRect { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
export interface HtmlFilmCamera { readonly tx: number; readonly ty: number; readonly z: number }

export interface HtmlFilmCameraInput {
  /** The visible window, for example a browser frame's page area. */
  readonly viewport: { readonly w: number; readonly h: number };
  /** The full content that moves inside the window. */
  readonly content: { readonly w: number; readonly h: number };
  /** The area to bring into view, in content coordinates. */
  readonly focus: HtmlFilmRect;
  /** Zoom; `"fit"` zooms out until the focus plus padding fits. Default 1. */
  readonly zoom?: number | "fit";
  /** Where the focus centre lands vertically, 0 top to 1 bottom. Default 0.5. */
  readonly anchor?: number;
  readonly padding?: number;
  /** 0 keeps the resting view, 1 is fully on the focus. */
  readonly mix?: number;
}

/**
 * Where content sits inside a window to frame a focus rectangle, as a
 * translate and a zoom. It never shows past the content's edges.
 */
export function camera(input: HtmlFilmCameraInput): HtmlFilmCamera {
  const { viewport, content, focus } = input;
  const padding = input.padding ?? 0;
  const mix = clamp(input.mix ?? 1);
  const z = input.zoom === "fit"
    ? Math.min(1, (viewport.w) / (focus.w + padding * 2), (viewport.h) / (focus.h + padding * 2))
    : input.zoom ?? 1;
  const fx = focus.x + focus.w / 2;
  const fy = focus.y + focus.h / 2;
  let tx = viewport.w / 2 - fx * z;
  tx = content.w * z <= viewport.w ? (viewport.w - content.w * z) / 2 : clamp(tx, viewport.w - content.w * z, 0);
  let ty = viewport.h * (input.anchor ?? 0.5) - fy * z;
  ty = content.h * z <= viewport.h ? 0 : clamp(ty, viewport.h - content.h * z, 0);
  const restX = content.w <= viewport.w ? (viewport.w - content.w) / 2 : 0;
  return { tx: lerp(restX, tx, mix), ty: lerp(0, ty, mix), z: lerp(1, z, mix) };
}

/** Interpolates two camera positions. */
export const cameraBetween = (from: HtmlFilmCamera, to: HtmlFilmCamera, amount: number): HtmlFilmCamera => ({
  tx: lerp(from.tx, to.tx, amount), ty: lerp(from.ty, to.ty, amount), z: lerp(from.z, to.z, amount),
});

/** The CSS transform for a camera; pair it with `transform-origin: 0 0`. */
export const cameraTransform = (value: HtmlFilmCamera): string =>
  `translate3d(${value.tx.toFixed(2)}px, ${value.ty.toFixed(2)}px, 0) scale(${value.z.toFixed(4)})`;

// ------------------------------------------------------------------ cursor

export interface HtmlFilmCursorKey {
  readonly at: number;
  readonly x: number;
  readonly y: number;
  /** A click that peaks at `at`. */
  readonly click?: boolean;
}

export interface HtmlFilmCursorState {
  readonly x: number;
  readonly y: number;
  readonly opacity: number;
  /** 0..1, peaks at each click. */
  readonly press: number;
}

/**
 * The cursor position at `t`. It glides between keys with an ease, fades in
 * over `fade` seconds before the first key and out after the last.
 */
export function cursor(t: number, keys: readonly HtmlFilmCursorKey[], options: { readonly fade?: number; readonly hold?: number; readonly ease?: Easing } = {}): HtmlFilmCursorState {
  if (keys.length === 0) throw new RangeError("cursor needs at least one key.");
  const fade = options.fade ?? 0.25;
  const hold = options.hold ?? 0.6;
  const ease = options.ease ?? easings.inOutCubic;
  const first = keys[0]!;
  const last = keys[keys.length - 1]!;
  let x = first.x;
  let y = first.y;
  for (let index = 1; index < keys.length; index++) {
    const from = keys[index - 1]!;
    const to = keys[index]!;
    if (t <= from.at) break;
    const amount = ease(prog(t, from.at, to.at));
    x = lerp(from.x, to.x, amount);
    y = lerp(from.y, to.y, amount);
  }
  const opacity = prog(t, first.at - fade, first.at) * (1 - prog(t, last.at + hold, last.at + hold + fade));
  let press = 0;
  for (const key of keys) if (key.click === true) press = Math.max(press, Math.sin(Math.PI * prog(t, key.at - 0.08, key.at + 0.14)));
  return { x, y, opacity, press };
}

// -------------------------------------------------------------- DOM helpers

interface StyleLike {
  visibility: string;
  display: string;
  opacity: string;
  transform: string;
  setProperty?(name: string, value: string): void;
}
interface StyledLike { readonly style: StyleLike }
interface AttributeLike { setAttribute(name: string, value: string): void }

/**
 * Shows or hides an element. It sets both visibility and display: a hidden
 * parent does not hide children that set `visibility: visible` themselves.
 */
export function show(element: StyledLike, on: boolean): void {
  element.style.visibility = on ? "visible" : "hidden";
  element.style.display = on ? "" : "none";
}

/** Places a cursor element from a `cursor()` state. */
export function placeCursor(element: StyledLike, state: HtmlFilmCursorState): void {
  element.style.opacity = String(state.opacity);
  element.style.transform = `translate3d(${state.x.toFixed(2)}px, ${state.y.toFixed(2)}px, 0) scale(${(1 - 0.08 * state.press).toFixed(4)})`;
  element.style.visibility = state.opacity > 0 ? "visible" : "hidden";
}

export interface HtmlFilmMark {
  /** Positioned box the mark fills. */
  readonly box: StyledLike;
  readonly svg: AttributeLike;
  /** A `<rect pathLength="1">` stroked with the mark colour. */
  readonly rect: AttributeLike & StyledLike & { readonly style: StyleLike & { strokeWidth: string; strokeDasharray: string; strokeDashoffset: string } };
}

export interface HtmlFilmMarkState extends HtmlFilmRect {
  readonly radius: number;
  readonly stroke: number;
  /** 0..1 of the outline drawn. */
  readonly drawn: number;
  readonly opacity: number;
}

/** Draws a rounded outline around a rectangle, `drawn` of the way round. */
export function drawMark(mark: HtmlFilmMark, state: HtmlFilmMarkState): void {
  const { box, svg, rect } = mark;
  const style = box.style as StyleLike & { left?: string; top?: string; width?: string; height?: string };
  style.left = `${state.x}px`;
  style.top = `${state.y}px`;
  style.width = `${state.w}px`;
  style.height = `${state.h}px`;
  style.opacity = String(state.opacity);
  style.visibility = state.opacity > 0 && state.drawn > 0 ? "visible" : "hidden";
  svg.setAttribute("viewBox", `0 0 ${state.w} ${state.h}`);
  const inset = state.stroke / 2;
  rect.setAttribute("x", String(inset));
  rect.setAttribute("y", String(inset));
  rect.setAttribute("width", String(Math.max(0, state.w - state.stroke)));
  rect.setAttribute("height", String(Math.max(0, state.h - state.stroke)));
  rect.setAttribute("rx", String(state.radius));
  rect.style.strokeWidth = `${state.stroke}px`;
  rect.style.strokeDasharray = "1 1";
  rect.style.strokeDashoffset = String(1 - clamp(state.drawn));
}

interface NodeLike { textContent: string | null }
interface ElementLike extends NodeLike, StyledLike {
  className: string;
  append(...nodes: unknown[]): void;
  readonly ownerDocument: {
    createElement(tag: string): ElementLike;
    createTextNode(text: string): unknown;
  };
}

const PARTS = new WeakMap<object, readonly StyledLike[]>();

/**
 * Wraps each word (or character) of an element in a mask span `.w` holding an
 * inner span `.wi`, for `kin`. A newline in the text becomes a line break.
 */
export function split(element: ElementLike, unit: "word" | "char" = "word"): readonly StyledLike[] {
  const text = element.textContent ?? "";
  const doc = element.ownerDocument;
  element.textContent = "";
  const pieces = unit === "char" ? [...text] : text.split(/(\s+)/u);
  const parts: ElementLike[] = [];
  for (const piece of pieces) {
    if (piece === "") continue;
    if (/^\s+$/u.test(piece)) {
      element.append(piece.includes("\n") ? doc.createElement("br") : doc.createTextNode(" "));
      continue;
    }
    const mask = doc.createElement("span");
    mask.className = "w";
    const inner = doc.createElement("span");
    inner.className = "wi";
    inner.textContent = piece;
    mask.append(inner);
    element.append(mask);
    parts.push(inner);
  }
  PARTS.set(element, parts);
  return parts;
}

export interface HtmlFilmKinOptions {
  readonly stagger?: number;
  readonly duration?: number;
  readonly outStagger?: number;
  readonly outDuration?: number;
  /** Degrees each word starts rotated. */
  readonly tilt?: number;
}

/**
 * Kinetic type: the split words rise into their masks from `inAt` and leave
 * upward from `outAt`. Returns whether any word is on screen.
 */
export function kin(element: StyledLike, t: number, inAt: number, outAt = Infinity, options: HtmlFilmKinOptions = {}): boolean {
  const parts = PARTS.get(element);
  if (parts === undefined) throw new Error("kin needs an element prepared with split().");
  const stagger = options.stagger ?? 0.055;
  const duration = options.duration ?? 0.9;
  const outStagger = options.outStagger ?? 0.025;
  const outDuration = options.outDuration ?? 0.5;
  let visible = false;
  parts.forEach((part, index) => {
    const a = easings.outQuint(prog(t, inAt + index * stagger, inAt + index * stagger + duration));
    const b = outAt === Infinity ? 0 : easings.inCubic(prog(t, outAt + index * outStagger, outAt + index * outStagger + outDuration));
    const y = (1 - a) * 115 - b * 115;
    const r = (1 - a) * (options.tilt ?? 0);
    part.style.transform = r === 0 ? `translate3d(0, ${y.toFixed(2)}%, 0)` : `translate3d(0, ${y.toFixed(2)}%, 0) rotate(${r.toFixed(2)}deg)`;
    if (a > 0 && b < 1) visible = true;
  });
  element.style.visibility = visible ? "visible" : "hidden";
  return visible;
}
