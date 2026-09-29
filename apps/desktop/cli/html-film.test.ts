import { expect, test } from "bun:test";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseCliArgs } from "./args";
import { commandHelp, completions } from "./help";
import {
  beatClipWindows, formatDeliveryLine, HTML_FILM_BUDGETS, HtmlFilmBeatsSchema, planHtmlFilmDelivery,
  previewTimes, selectHtmlFilmFrames, stillFileName,
} from "./html-film";
import {
  createHtmlFilmProject, HTML_FILM_TEMPLATE_FILES, htmlFilmProjectFiles, readHtmlFilmTemplate,
} from "./html-film-init";
import { runPortableSurface } from "./portable-surface";

test("html still, preview and deliver parse into one film command shape", () => {
  expect(parseCliArgs(["html", "still", "--input", "out/scene.json", "--at", "3,12.5", "--output", "out/stills"])).toEqual({
    kind: "html-film", action: "still", input: "out/scene.json", output: "out/stills", at: [3, 12.5], json: false,
  });
  expect(parseCliArgs(["html", "preview", "--input", "s.json", "--output", "o", "--json"])).toEqual({
    kind: "html-film", action: "preview", input: "s.json", output: "o", every: 2, json: true,
  });
  expect(parseCliArgs(["html", "deliver", "out/export.json", "--basename", "film", "--poster-at", "4", "--social-at", "12",
    "--cuts", "1:1,9:16", "--per-beat-clips"])).toEqual({
    kind: "html-film", action: "deliver", exportPath: "out/export.json", basename: "film", posterAt: 4, socialAt: 12,
    cuts: ["1:1", "9:16"], perBeatClips: true, json: false,
  });
});

test("html film commands reject missing, malformed and extra arguments", () => {
  for (const argv of [
    ["html", "still", "--input", "s.json", "--output", "o"],
    ["html", "still", "--input", "s.json", "--at", "-1", "--output", "o"],
    ["html", "still", "--input", "s.json", "--at", "abc", "--output", "o"],
    ["html", "still", "--at", "1", "--output", "o"],
    ["html", "preview", "--input", "s.json", "--output", "o", "--every", "0"],
    ["html", "deliver", "--basename", "f", "--poster-at", "1", "--social-at", "2"],
    ["html", "deliver", "e.json", "--basename", "f", "--poster-at", "1,2", "--social-at", "2"],
    ["html", "deliver", "e.json", "--basename", "f", "--poster-at", "1", "--social-at", "2", "--cuts", "3:2"],
    ["html", "deliver", "a.json", "b.json", "--basename", "f", "--poster-at", "1", "--social-at", "2"],
  ]) expect(() => parseCliArgs(argv)).toThrow();
});

test("html help and completions list the film commands", () => {
  const help = commandHelp(["html"]);
  for (const line of ["html init <dir> --template launch-film", "html still --input", "html preview --input", "html deliver <export.json>"]) {
    expect(help).toContain(line);
  }
  expect(completions(["html", ""])).toEqual(["catalog", "scaffold", "init", "render", "still", "preview", "deliver"]);
});

test("frame selection keeps request order, dedupes frames and clamps to the last frame", () => {
  expect(selectHtmlFilmFrames([12.5, 3, 3.01, 99], 30, 900)).toEqual({
    selection: [{ at: 12.5, frame: 375 }, { at: 3, frame: 90 }, { at: 3.01, frame: 90 }, { at: 99, frame: 899 }],
    frames: [90, 375, 899],
  });
  expect(() => selectHtmlFilmFrames([], 30, 900)).toThrow();
  expect(() => selectHtmlFilmFrames([Number.NaN], 30, 900)).toThrow();
  expect(() => selectHtmlFilmFrames(Array.from({ length: 200 }, (_, index) => index), 30, 9000)).toThrow();
});

test("preview times step through the film and still names sort by time", () => {
  expect(previewTimes(7, 2)).toEqual([0, 2, 4, 6]);
  expect(previewTimes(6, 2)).toEqual([0, 2, 4]);
  expect(() => previewTimes(6, 0)).toThrow();
  expect(stillFileName(3)).toBe("still-003.00s.png");
  expect(stillFileName(12.5)).toBe("still-012.50s.png");
  expect([stillFileName(12.5), stillFileName(3)].sort()).toEqual([stillFileName(3), stillFileName(12.5)]);
});

test("beat clips are 6 to 10 seconds and stay inside the film", () => {
  const beats = [
    { id: "open", start: 0, end: 2 },
    { id: "walk", start: 8, end: 22 },
    { id: "end", start: 31, end: 33 },
  ];
  expect(beatClipWindows(beats, 33)).toEqual([
    { id: "open", start: 0, end: 6 },
    { id: "walk", start: 8, end: 18 },
    { id: "end", start: 27, end: 33 },
  ]);
  expect(beatClipWindows([{ id: "short", start: 0, end: 1 }], 4)).toEqual([{ id: "short", start: 0, end: 4 }]);
  // A 3 second draft render only reaches the first beat.
  expect(beatClipWindows(beats, 3)).toEqual([{ id: "open", start: 0, end: 3 }]);
  expect(HtmlFilmBeatsSchema.safeParse({ duration: 10, beats: [{ id: "a", start: 2, end: 1 }] }).success).toBe(false);
  expect(HtmlFilmBeatsSchema.safeParse({ duration: 10, beats: [{ id: "Bad id", start: 0, end: 1 }] }).success).toBe(false);
});

test("the delivery plan names every file with its budget and web encode settings", () => {
  const plan = planHtmlFilmDelivery({
    basename: "acme-launch", duration: 33, posterAt: 4, socialAt: 12, cuts: ["1:1", "9:16", "1:1"],
    beats: [{ id: "walk", start: 8, end: 22 }],
  });
  expect(plan.map(item => [item.role, item.file, item.budget])).toEqual([
    ["mp4", "acme-launch.mp4", HTML_FILM_BUDGETS.mp4],
    ["webm", "acme-launch.webm", HTML_FILM_BUDGETS.webm],
    ["poster", "acme-launch-poster.jpg", HTML_FILM_BUDGETS.jpg],
    ["social", "acme-launch-social.jpg", HTML_FILM_BUDGETS.jpg],
    ["cut", "acme-launch-1x1.mp4", HTML_FILM_BUDGETS.mp4],
    ["cut", "acme-launch-9x16.mp4", HTML_FILM_BUDGETS.mp4],
    ["clip", "acme-launch-walk.mp4", HTML_FILM_BUDGETS.mp4],
  ]);
  expect(HTML_FILM_BUDGETS).toEqual({ mp4: 12_000_000, webm: 10_000_000, jpg: 250_000 });
  const [mp4, webm, , social, square, , clip] = plan;
  expect(mp4!.passes[0]).toContain("+faststart");
  expect(mp4!.passes[0]).toContain("yuv420p");
  expect(webm!.passes).toHaveLength(2);
  expect(webm!.passes[1]).toContain("libvpx-vp9");
  expect(social!.passes[0]!.join(" ")).toContain("crop=1200:630");
  expect(square!.passes[0]!.join(" ")).toContain("crop=1080:1080");
  expect(clip!.passes[0]!.slice(0, 4)).toEqual(["-ss", "8.000", "-t", "10.000"]);
  for (const bad of [
    { basename: "Bad Name", posterAt: 1, socialAt: 1 },
    { basename: "ok", posterAt: 33, socialAt: 1 },
    { basename: "ok", posterAt: 1, socialAt: -1 },
  ]) expect(() => planHtmlFilmDelivery({ ...bad, duration: 33, cuts: [] })).toThrow();
});

test("delivery lines flag files over budget", () => {
  const file = { role: "mp4" as const, path: "deliver/a.mp4", bytes: 13_500_000, sha256: "0".repeat(64), budget: 12_000_000, withinBudget: false };
  expect(formatDeliveryLine(file)).toBe("OVER a.mp4 13.50 MB (max 12.00 MB)");
  expect(formatDeliveryLine({ ...file, role: "poster", path: "p.jpg", bytes: 180_400, budget: 250_000, withinBudget: true })).toBe("ok   p.jpg 180 KB (max 250 KB)");
});

test("the launch-film template ships every file and the project pins this version", async () => {
  const source = await readHtmlFilmTemplate("launch-film");
  expect(Object.keys(source.files).sort()).toEqual([...HTML_FILM_TEMPLATE_FILES].sort());
  const manifest = JSON.parse(await readFile(join(import.meta.dir, "../../../package.json"), "utf8")) as { version: string; files: string[] };
  expect(source.version).toBe(manifest.version);
  expect(manifest.files).toContain("examples/html/launch-film/*");
  const files = htmlFilmProjectFiles(source, { directory: "/tmp/Acme Film", aspect: "9:16" });
  const project = JSON.parse(files["package.json"]!) as { name: string; dependencies: Record<string, string> };
  expect(project.name).toBe("acme-film");
  expect(project.dependencies["@hraness/slopcamera"]).toContain(manifest.version);
  expect((JSON.parse(files["film.json"]!) as { aspect: string }).aspect).toBe("9:16");
  expect(files[".gitignore"]).toContain("out/");
});

test("html init writes a new film project and never merges into an existing path", async () => {
  const parent = await mkdtemp(join(tmpdir(), "slopcamera-film-"));
  try {
    const logs: string[] = [];
    expect(await runPortableSurface(["html", "init", "film", "--template", "launch-film", "--aspect", "1:1", "--json"], {
      cwd: () => parent, log: value => { logs.push(value); },
    })).toBe(0);
    const result = JSON.parse(logs[0]!) as { kind: string; aspect: string; files: string[]; executed: boolean };
    expect(result.kind).toBe("slopcamera.html-film-init");
    expect(result.aspect).toBe("1:1");
    expect(result.executed).toBe(false);
    expect((await readdir(join(parent, "film"))).sort()).toEqual([...result.files].sort());
    await expect(createHtmlFilmProject(join(parent, "film"), { template: "launch-film", aspect: "16:9" })).rejects.toThrow("existing path");
    for (const argv of [
      ["html", "init", "x", "--template", "nope"],
      ["html", "init", "x", "--template", "launch-film", "--aspect", "4:3"],
      ["html", "init", "--template", "launch-film"],
      ["html", "init", "x", "y", "--template", "launch-film"],
    ]) await expect(runPortableSurface(argv, { cwd: () => parent, log: () => undefined })).rejects.toThrow();
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
