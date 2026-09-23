import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFilmFinishPlan, parseFilmProbe } from "../examples/style-portfolio/finish-film";
import { renderStudies } from "../examples/style-portfolio/render";

const video = { index: 1, codec_type: "video", width: 128, height: 96, avg_frame_rate: "24/1" };
const audioFirst = { streams: [{ index: 0, codec_type: "audio", avg_frame_rate: "0/0" }, video], format: { duration: "0.500000" } };

test("film finishing selects the sole video when audio occupies absolute stream zero", () => {
  const plan = createFilmFinishPlan("silent-actuality", audioFirst);
  expect(plan.facts.absoluteVideoIndex).toBe(1);
  expect(plan.facts.audioStreams).toBe(1);
  expect(plan.compiled.inputLabel).toBe("0:v:0");
  expect(plan.compiled.filterGraph.startsWith("[0:v:0]")).toBe(true);
  expect(parseFilmProbe({ ...audioFirst, streams: [audioFirst.streams[0], { ...video, nb_read_frames: "12" }] }, true).frameCount).toBe(12);
});

test("film admission rejects malformed, nonfinite, oversized, or unbounded probe facts", () => {
  for (const candidate of [
    null, {}, { ...audioFirst, unchecked: true },
    { ...audioFirst, streams: [] },
    { ...audioFirst, streams: [video, video] },
    { ...audioFirst, streams: [...audioFirst.streams, { index: 2, codec_type: "audio" }] },
    { ...audioFirst, format: { duration: "NaN" } },
    { ...audioFirst, format: { duration: "30.01" } },
    ...[{ width: 0 }, { width: 127 }, { height: 4322 }, { avg_frame_rate: "24/0" },
      { avg_frame_rate: "121/1" }, { nb_read_frames: "3601" }, { nb_read_frames: "N/A" }]
      .map(fields => ({ ...audioFirst, streams: [{ ...video, ...fields }] })),
  ]) expect(() => parseFilmProbe(candidate)).toThrow();
  expect(() => parseFilmProbe(audioFirst, true)).toThrow();
});

async function withFakeHost(run: (workspace: string) => Promise<void>): Promise<void> {
  const workspace = await mkdtemp(join(tmpdir(), "slopcamera-style-attempt-"));
  try {
    const cli = join(workspace, "apps/desktop/dist/cli");
    await mkdir(cli, { recursive: true });
    // The real wrapper runs a child but this fixture cannot render or acquire a browser.
    await writeFile(join(cli, "main.js"), 'console.error("owned host log"); console.log(JSON.stringify({ kind: "fixture", planned: process.argv.includes("--dry-run") }));\n');
    await run(workspace);
  } finally { await rm(workspace, { recursive: true, force: true }); }
}

test("a dry run retains separate evidence and cannot overwrite an existing execution", async () => {
  await withFakeHost(async workspace => {
    const args = ["--style", "theatrical-cel", "--run", "retained"];
    await renderStudies(args, workspace, () => {});
    const directory = join(workspace, "artifacts/style-portfolio/retained");
    const evidence = ["intent.json", "scene.json", "log", "result.json"];
    const before = await Promise.all(evidence.map(name => readFile(join(directory, `theatrical-cel.${name}`))));
    await renderStudies([...args, "--width", "3840", "--dry-run"], workspace, () => {});
    const after = await Promise.all(evidence.map(name => readFile(join(directory, `theatrical-cel.${name}`))));
    expect(after).toEqual(before);
    expect(JSON.parse(await readFile(join(directory, "theatrical-cel.plan.scene.json"), "utf8")).canvas.width).toBe(3840);
    const messages: string[] = [];
    await renderStudies([...args, "--dry-run"], workspace, message => { messages.push(message); });
    expect(JSON.parse(messages[0]!).state).toBe("already-attempted");
    expect(JSON.parse(await readFile(join(directory, "theatrical-cel.plan.scene.json"), "utf8")).canvas.width).toBe(3840);
  });
}, 20_000);

test("concurrent attempts claim once and orphaned requests are never overwritten", async () => {
  await withFakeHost(async workspace => {
    const args = ["--style", "pixel-art", "--run", "exclusive"];
    const messages: string[] = [];
    await Promise.all([0, 1].map(() => renderStudies(args, workspace, message => { messages.push(message); })));
    expect(messages.map(message => JSON.parse(message).state).sort()).toEqual(["already-attempted", "rendered"]);
    const orphan = join(workspace, "artifacts/style-portfolio/orphan");
    await mkdir(orphan);
    await writeFile(join(orphan, "pixel-art.scene.json"), "retained request\n");
    await expect(renderStudies(["--style", "pixel-art", "--run", "orphan"], workspace, () => {})).rejects.toThrow();
    expect(await readFile(join(orphan, "pixel-art.scene.json"), "utf8")).toBe("retained request\n");
  });
}, 20_000);
