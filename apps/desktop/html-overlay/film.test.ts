import { describe, expect, test } from "bun:test";

import {
  camera, cameraBetween, cameraTransform, captionsFromTimeline, clamp, crossfade, cursor, defineTimeline,
  drawMark, easings, kin, lerp, placeCursor, prog, show, split, spring, stepValue,
} from "./film";

function fakeStyle() {
  const props = new Map<string, string>();
  return {
    visibility: "", display: "", opacity: "", transform: "", left: "", top: "", width: "", height: "",
    strokeWidth: "", strokeDasharray: "", strokeDashoffset: "",
    setProperty(name: string, value: string) { props.set(name, value); },
  };
}

interface FakeElement {
  tag: string; className: string; textContent: string | null; style: ReturnType<typeof fakeStyle>;
  children: unknown[]; attributes: Map<string, string>;
  append(...nodes: unknown[]): void; setAttribute(name: string, value: string): void;
  ownerDocument: { createElement(tag: string): FakeElement; createTextNode(text: string): { text: string } };
}

function fakeElement(tag = "div", text = ""): FakeElement {
  const element: FakeElement = {
    tag, className: "", style: fakeStyle(), children: [], attributes: new Map(),
    get textContent() { return text; },
    set textContent(value) { text = value ?? ""; if (value === "") element.children = []; },
    append(...nodes) { element.children.push(...nodes); },
    setAttribute(name, value) { element.attributes.set(name, value); },
    ownerDocument: { createElement: (child: string) => fakeElement(child), createTextNode: (value: string) => ({ text: value }) },
  };
  return element;
}

describe("numbers", () => {
  test("clamp, lerp and prog", () => {
    expect(clamp(-1)).toBe(0);
    expect(clamp(2)).toBe(1);
    expect(clamp(5, 0, 10)).toBe(5);
    expect(lerp(10, 20, 0.25)).toBe(12.5);
    expect(prog(1, 0, 2)).toBe(0.5);
    expect(prog(-1, 0, 2)).toBe(0);
    expect(prog(3, 0, 2)).toBe(1);
    expect(prog(2, 2, 2)).toBe(1);
    expect(prog(1.9, 2, 2)).toBe(0);
  });

  test("every easing starts at 0 and ends at 1", () => {
    for (const [name, ease] of Object.entries(easings)) {
      expect({ name, v: Math.round(ease(0) * 1e9) / 1e9 + 0 }).toEqual({ name, v: 0 });
      expect({ name, v: Math.round(ease(1) * 1e9) / 1e9 }).toEqual({ name, v: 1 });
    }
    expect(easings.outBack(0.7)).toBeGreaterThan(1);
    expect(easings.inOutCubic(0.5)).toBeCloseTo(0.5);
  });

  test("spring rests at 0 before release, overshoots, then settles at 1", () => {
    expect(spring(-1)).toBe(0);
    expect(spring(0)).toBe(0);
    const samples = Array.from({ length: 200 }, (_, i) => spring(i / 50, 1.5, 0.4));
    expect(Math.max(...samples)).toBeGreaterThan(1);
    expect(spring(10, 1.5, 0.4)).toBeCloseTo(1, 6);
    const critical = Array.from({ length: 200 }, (_, i) => spring(i / 50, 1.5, 1));
    expect(Math.max(...critical)).toBeLessThanOrEqual(1);
    expect(spring(0.4)).toBe(spring(0.4));
  });

  test("stepValue holds, then eases each change", () => {
    const keys = [[0, 0], [2, 1], [4, 2]] as const;
    expect(stepValue(keys, 1)).toBe(0);
    expect(stepValue(keys, 2.25)).toBeCloseTo(0.5);
    expect(stepValue(keys, 3)).toBe(1);
    expect(stepValue(keys, 5)).toBe(2);
    expect(() => stepValue([], 1)).toThrow();
  });

  test("crossfade sums to one", () => {
    for (const t of [0, 1, 1.3, 1.6, 3]) {
      const fade = crossfade(t, 1, 0.6);
      expect(fade.in + fade.out).toBeCloseTo(1);
    }
    expect(crossfade(0, 1).in).toBe(0);
    expect(crossfade(2, 1).in).toBe(1);
  });
});

describe("timeline", () => {
  const timeline = defineTimeline([
    { id: "open", duration: 4, caption: "A cold open." },
    { id: "title", duration: 3, overlap: 0.5, caption: "The name." },
    { id: "walk", duration: 10 },
    { id: "end", duration: 3, overlap: 1, caption: "Where to get it --> now." },
  ]);

  test("lays acts end to end with overlaps", () => {
    expect(timeline.acts.map(act => [act.id, act.start, act.end])).toEqual([
      ["open", 0, 4], ["title", 3.5, 6.5], ["walk", 6.5, 16.5], ["end", 15.5, 18.5],
    ]);
    expect(timeline.duration).toBe(18.5);
    expect(timeline.local(5, "title")).toBe(1.5);
    expect(timeline.progress(11.5, "walk")).toBe(0.5);
    expect(timeline.active(3.6, "title")).toBe(true);
    expect(timeline.active(3.4, "title")).toBe(false);
    expect(timeline.active(3.4, "title", 0.2)).toBe(true);
    expect(timeline.current(16).id).toBe("end");
    expect(timeline.current(0).id).toBe("open");
  });

  test("rejects duplicate ids, bad durations and leading overlap", () => {
    expect(() => defineTimeline([])).toThrow();
    expect(() => defineTimeline([{ id: "a", duration: 1 }, { id: "a", duration: 1 }])).toThrow(/Duplicate/u);
    expect(() => defineTimeline([{ id: "a", duration: 0 }])).toThrow();
    expect(() => defineTimeline([{ id: "a", duration: 1, overlap: 0.2 }])).toThrow();
    expect(() => timeline.act("missing")).toThrow();
  });

  test("captionsFromTimeline writes WebVTT cues that never stack", () => {
    expect(captionsFromTimeline(timeline)).toBe([
      "WEBVTT", "",
      "open", "00:00:00.000 --> 00:00:03.500", "A cold open.", "",
      "title", "00:00:03.500 --> 00:00:06.500", "The name.", "",
      "end", "00:00:15.500 --> 00:00:18.500", "Where to get it -> now.", "",
    ].join("\n"));
    expect(captionsFromTimeline(defineTimeline([{ id: "a", duration: 1 }]))).toBe("WEBVTT\n\n");
  });
});

describe("camera and cursor", () => {
  const base = { viewport: { w: 1000, h: 800 }, content: { w: 1200, h: 3000 } };

  test("frames a focus and never shows past the content", () => {
    expect(camera({ ...base, focus: { x: 0, y: 0, w: 100, h: 100 }, mix: 0 })).toEqual({ tx: 0, ty: 0, z: 1 });
    const mid = camera({ ...base, focus: { x: 500, y: 1500, w: 200, h: 200 } });
    expect(mid).toEqual({ tx: -100, ty: -1200, z: 1 });
    const bottom = camera({ ...base, focus: { x: 0, y: 2900, w: 100, h: 100 } });
    expect(bottom.ty).toBe(800 - 3000);
    const fit = camera({ ...base, focus: { x: 0, y: 0, w: 1200, h: 1600 }, zoom: "fit" });
    expect(fit.z).toBe(0.5);
    expect(cameraTransform({ tx: 1, ty: 2, z: 1.5 })).toBe("translate3d(1.00px, 2.00px, 0) scale(1.5000)");
    expect(cameraBetween({ tx: 0, ty: 0, z: 1 }, { tx: 10, ty: 20, z: 2 }, 0.5)).toEqual({ tx: 5, ty: 10, z: 1.5 });
  });

  test("centres narrow content", () => {
    expect(camera({ viewport: { w: 1000, h: 800 }, content: { w: 600, h: 400 }, focus: { x: 0, y: 0, w: 10, h: 10 } }).tx).toBe(200);
  });

  test("cursor glides between keys, fades, and presses on clicks", () => {
    const keys = [{ at: 1, x: 0, y: 0 }, { at: 2, x: 100, y: 50, click: true }];
    expect(cursor(0.5, keys).opacity).toBe(0);
    expect(cursor(1, keys).opacity).toBe(1);
    expect(cursor(1.5, keys).x).toBeCloseTo(50);
    expect(cursor(2, keys).press).toBeGreaterThan(0.9);
    expect(cursor(3.5, keys).opacity).toBe(0);
    expect(cursor(3, keys)).toEqual(cursor(3, keys));
    const element = fakeElement();
    placeCursor(element, cursor(2, keys));
    expect(element.style.transform).toContain("translate3d(100.00px, 50.00px, 0)");
    expect(element.style.visibility).toBe("visible");
    expect(() => cursor(0, [])).toThrow();
  });
});

describe("DOM helpers", () => {
  test("show sets both visibility and display", () => {
    const element = fakeElement();
    show(element, false);
    expect([element.style.visibility, element.style.display]).toEqual(["hidden", "none"]);
    show(element, true);
    expect([element.style.visibility, element.style.display]).toEqual(["visible", ""]);
  });

  test("split wraps words, keeps line breaks, and kin moves them", () => {
    const element = fakeElement("h2", "Plain words\nhere");
    const parts = split(element);
    expect(parts.length).toBe(3);
    expect(element.children.filter(child => (child as FakeElement).tag === "br").length).toBe(1);
    expect(kin(element, 0, 1)).toBe(false);
    expect(element.style.visibility).toBe("hidden");
    expect(kin(element, 5, 1)).toBe(true);
    expect(parts[0]!.style.transform).toBe("translate3d(0, 0.00%, 0)");
    expect(kin(element, 10, 1, 5)).toBe(false);
    expect(split(fakeElement("h1", "Abc"), "char").length).toBe(3);
    expect(() => kin(fakeElement(), 0, 0)).toThrow(/split/u);
  });

  test("drawMark positions the box and strokes part of the outline", () => {
    const mark = { box: fakeElement(), svg: fakeElement("svg"), rect: fakeElement("rect") };
    drawMark(mark, { x: 10, y: 20, w: 100, h: 50, radius: 8, stroke: 4, drawn: 0.25, opacity: 1 });
    expect(mark.box.style.left).toBe("10px");
    expect(mark.svg.attributes.get("viewBox")).toBe("0 0 100 50");
    expect(mark.rect.attributes.get("width")).toBe("96");
    expect(mark.rect.style.strokeDashoffset).toBe("0.75");
    expect(mark.box.style.visibility).toBe("visible");
    drawMark(mark, { x: 0, y: 0, w: 1, h: 1, radius: 0, stroke: 4, drawn: 0, opacity: 1 });
    expect(mark.box.style.visibility).toBe("hidden");
    expect(mark.rect.attributes.get("width")).toBe("0");
  });
});
