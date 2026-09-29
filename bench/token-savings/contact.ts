// Builds one contact-sheet PNG per task from results/<run-id>/thumbs/. Rows are
// sessions (condition and repeat), columns are each output after create and after
// revise. A missing thumbnail is a labelled gray cell, so a failed step stays visible.
import { mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { FFMPEG } from "./media";
import { TASKS, type TaskId } from "./tasks";

/** Escapes a label for a single-quoted ffmpeg drawtext value inside a filtergraph. */
function drawtextEscape(label: string): string {
  return label.replace(/[\\':;,[\]%]/g, (ch) => `\\${ch}`);
}

const CELL = 320;
const LABEL = 28;
const FONT = "/System/Library/Fonts/Supplemental/Arial.ttf";

function stem(rel: string): string {
  return (rel.split("/").pop() ?? rel).replace(/\.[^.]+$/, "");
}

export async function contactSheets(resultsDir: string): Promise<string[]> {
  const thumbs = join(resultsDir, "thumbs");
  let names: string[] = [];
  try {
    names = await readdir(thumbs);
  } catch {
    return [];
  }
  const have = new Set(names);
  const keys = [...new Set(names.map((n) => n.match(/^(t\d-[AB]-r\d+)-/)?.[1]).filter((k): k is string => k !== undefined))].sort();
  const outDir = join(resultsDir, "contact");
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  const written: string[] = [];
  for (const task of Object.keys(TASKS) as TaskId[]) {
    const rows = keys.filter((k) => k.startsWith(`${task}-`));
    if (rows.length === 0) continue;
    const stems = TASKS[task].outputs.filter((rel) => !rel.endsWith(".svg")).map(stem);
    const columns = (["create", "revise"] as const).flatMap((step) => stems.map((s) => ({ step, stem: s })));
    const inputs: string[] = [];
    const filters: string[] = [];
    const layout: string[] = [];
    let i = 0;
    for (const [r, key] of rows.entries()) {
      for (const [c, col] of columns.entries()) {
        const file = `${key}-${col.step}-${col.stem}.jpg`;
        const text = drawtextEscape(`${key} ${col.step} ${col.stem}`);
        const draw = `drawtext=fontfile=${FONT}:text='${text}':fontsize=15:fontcolor=white:x=8:y=7`;
        if (have.has(file)) {
          inputs.push("-i", join(thumbs, file));
          filters.push(`[${i}:v]scale=${CELL}:${CELL}:force_original_aspect_ratio=decrease,pad=${CELL}:${CELL + LABEL}:(ow-iw)/2:${LABEL}:color=0x202020,${draw}[c${i}]`);
        } else {
          inputs.push("-f", "lavfi", "-i", `color=c=0x505050:s=${CELL}x${CELL + LABEL}:d=1`);
          filters.push(`[${i}:v]${draw},drawtext=fontfile=${FONT}:text='missing':fontsize=28:fontcolor=white:x=(w-tw)/2:y=(h-th)/2[c${i}]`);
        }
        layout.push(`${c * CELL}_${r * (CELL + LABEL)}`);
        i++;
      }
    }
    const stack = `${Array.from({ length: i }, (_, k) => `[c${k}]`).join("")}xstack=inputs=${i}:layout=${layout.join("|")}:fill=black[out]`;
    const output = join(outDir, `${task}.png`);
    const proc = Bun.spawn([FFMPEG, "-v", "error", "-y", ...inputs, "-filter_complex", [...filters, stack].join(";"), "-map", "[out]", "-frames:v", "1", output], { stdout: "ignore", stderr: "pipe" });
    const stderr = await new Response(proc.stderr).text();
    if ((await proc.exited) !== 0) throw new Error(`contact sheet ${task} failed: ${stderr.trim()}`);
    written.push(output);
  }
  return written;
}

if (import.meta.main) {
  const dir = process.argv[2];
  if (dir === undefined) throw new Error("usage: contact.ts <results-dir>");
  console.log((await contactSheets(dir)).join("\n"));
}
