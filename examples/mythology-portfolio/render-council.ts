/**
 * Author, audit and render "The Council of Optimizers" as a spatial scene with an
 * orthographic isometric camera. Every stage writes its JSON beside the scene.
 *
 *   bun examples/mythology-portfolio/render-council.ts --run <new-run-name> [--scene-only]
 */
import { mkdir, open, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DURATION_US = 8_000_000;
const STILL_US = 6_000_000;
const palette = { background: "#e6e5db", ink: "#2c4147", paper: "#f7f2df", primary: "#7b9c93", secondary: "#d1ad66", accent: "#c9674d" };
type Vec3 = [number, number, number];
type Quat = [number, number, number, number];

const yaw = (angle: number): Quat => [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)];
const pitch = (angle: number): Quat => [Math.sin(angle / 2), 0, 0, Math.cos(angle / 2)];
const round = (value: number) => Math.round(value * 1e6) / 1e6;

/** A look-at quaternion for a camera that faces -Z with +Y up. */
export function lookAt(eye: Vec3, target: Vec3): Quat {
  const norm = (v: Vec3): Vec3 => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; };
  const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const z = norm([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
  const x = norm(cross([0, 1, 0], z));
  const y = cross(z, x);
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
  const trace = m00 + m11 + m22;
  let q: Quat;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    q = [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s];
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
  }
  const length = Math.hypot(...q);
  return q.map(part => part / length) as Quat;
}

const transform = (position: Vec3, rotation: Quat = [0, 0, 0, 1], scale: Vec3 = [1, 1, 1]) => ({ position, rotation, scale });
const base = (entityId: string, name: string, parentId: string | null, t = transform([0, 0, 0])) =>
  ({ entityId, name, origin: { kind: "authored" }, parentId, placement: { kind: "world" }, transform: t, visible: true });
const mesh = (entityId: string, name: string, parentId: string | null, geometry: object, color: string, t: ReturnType<typeof transform>, roughness = 0.8) =>
  ({ ...base(entityId, name, parentId, t), kind: "mesh", geometry, material: { kind: "standard", color, metalness: 0, opacity: 1, roughness }, castShadow: true, receiveShadow: true });

export const OPTIMIZERS = ["sgd", "momentum", "nesterov", "adagrad", "rmsprop", "adam", "adamw"];

export function councilScene() {
  const entities: object[] = [
    { ...base("entity_fill", "Fill", null), kind: "light", light: "ambient", color: "#fff8ea", intensity: 1.6 },
    { ...base("entity_sun", "Sun", null, transform([6, 12, 4])), kind: "light", light: "directional", color: "#fff2dc", intensity: 2.6, shadow: true },
    { ...mesh("entity_ground", "Ground", null, { kind: "box", size: [80, 0.2, 80] }, palette.background, transform([0, -0.1, 0]), 1), castShadow: false },
    mesh("entity_step_1", "Dais step 1", null, { kind: "cylinder", radius: 5.2, height: 0.3 }, palette.paper, transform([0, 0.15, 0])),
    mesh("entity_step_2", "Dais step 2", null, { kind: "cylinder", radius: 4.4, height: 0.3 }, palette.primary, transform([0, 0.45, 0])),
    mesh("entity_step_3", "Dais step 3", null, { kind: "cylinder", radius: 1.5, height: 0.3 }, palette.paper, transform([0, 0.75, 0])),
    mesh("entity_loss", "The loss", null, { kind: "box", size: [1.3, 1.3, 1.3] }, palette.accent, transform([0, 1.65, 0]), 0.55),
  ];
  const animations: object[] = [];
  const bowStart = (i: number) => 1_000_000 + i * 850_000;
  OPTIMIZERS.forEach((name, i) => {
    const angle = (i / OPTIMIZERS.length) * Math.PI * 2 + Math.PI / 7;
    const radius = 3.3;
    const x = round(Math.sin(angle) * radius), z = round(Math.cos(angle) * radius);
    const height = 1.4 + (i % 3) * 0.35;
    // The outer group faces the centre (local +Z inward); the inner group bows about local X.
    entities.push({ ...base(`entity_seat_${name}`, `Seat ${name}`, null, transform([x, 0.6, z], yaw(angle + Math.PI))), kind: "group" });
    entities.push({ ...base(`entity_bow_${name}`, `Bow ${name}`, `entity_seat_${name}`), kind: "group" });
    entities.push(mesh(`entity_plinth_${name}`, `Plinth ${name}`, `entity_seat_${name}`, { kind: "box", size: [0.9, 0.12, 0.9] }, palette.ink, transform([0, 0.06, 0])));
    entities.push(mesh(`entity_body_${name}`, `Body ${name}`, `entity_bow_${name}`, { kind: "cylinder", radius: 0.3, height }, i % 2 ? palette.secondary : palette.primary, transform([0, 0.12 + height / 2, 0])));
    const headGeometry = [{ kind: "sphere", radius: 0.34 }, { kind: "box", size: [0.56, 0.56, 0.56] }, { kind: "cylinder", radius: 0.32, height: 0.5 }][i % 3]!;
    entities.push(mesh(`entity_head_${name}`, `Head ${name}`, `entity_bow_${name}`, headGeometry, palette.paper, transform([0, 0.12 + height + 0.3, 0]), 0.6));
    entities.push(mesh(`entity_eye_${name}`, `Eye ${name}`, `entity_bow_${name}`, { kind: "sphere", radius: 0.08 }, palette.ink, transform([0, 0.12 + height + 0.32, 0.3])));
    const start = bowStart(i);
    const keys = [0, start, start + 350_000, start + 800_000, start + 1_250_000, DURATION_US]
      .map((timeUs, k) => ({ timeUs, value: pitch([0, 0, 0.62, 0.62, 0, 0][k]!) }));
    animations.push({ channelId: `channel_bow_${name}`, interpolation: "slerp", keys, property: "rotation", targetId: `entity_bow_${name}` });
  });
  // The loss turns steadily and shrinks one step after each bow.
  const turnKeys = Array.from({ length: 17 }, (_, k) => ({ timeUs: k * 500_000, value: yaw(k * 0.5 * 0.9) }));
  animations.push({ channelId: "channel_loss_turn", interpolation: "slerp", keys: turnKeys, property: "rotation", targetId: "entity_loss" });
  const scaleKeys = [{ timeUs: 0, value: [1, 1, 1] }];
  OPTIMIZERS.forEach((_, i) => {
    const s = round(1 - (i + 1) * 0.09);
    const settle = bowStart(i) + 400_000;
    scaleKeys.push({ timeUs: settle, value: [round(s + 0.09), round(s + 0.09), round(s + 0.09)] }, { timeUs: settle + 250_000, value: [s, s, s] });
  });
  scaleKeys.push({ timeUs: DURATION_US, value: scaleKeys.at(-1)!.value });
  animations.push({ channelId: "channel_loss_scale", interpolation: "linear", keys: scaleKeys, property: "scale", targetId: "entity_loss" });

  // The window keeps a margin above the tallest head at the back and below the front of the dais; the pose rises with the target so the dais stays centred.
  const eye: Vec3 = [14, 12.64, 14], target: Vec3 = [0, 1.04, 0];
  const camera = (cameraId: string, width: number, height: number) => ({
    cameraId, name: cameraId, pose: { position: eye, rotation: lookAt(eye, target) },
    projection: { kind: "orthographic", width, height, near: 0.1, far: 80, left: -7.2, right: 7.2, top: 4.05, bottom: -4.05 },
  });
  return {
    kind: "slopcamera.spatial-scene", schemaVersion: 1, sceneId: "scene_council_of_optimizers",
    coordinates: "right-handed-y-up-meters", durationUs: DURATION_US,
    entities, cameras: [camera("camera_iso", 1920, 1080), camera("camera_iso_4k", 3840, 2160)],
    animations, assets: [], generators: [], overrides: [],
  };
}

async function cli(args: string[], logName: string, dir: string) {
  const log = await open(join(dir, `${logName}.log`), "wx", 0o600);
  try {
    const child = Bun.spawn(["bun", "apps/desktop/dist/cli/main.js", ...args, "--json"], { cwd: root, stdout: "pipe", stderr: log.fd });
    const stdout = await new Response(child.stdout).text();
    const code = await child.exited;
    await writeFile(join(dir, `${logName}.json`), stdout.trim() + "\n", { flag: "wx" });
    if (code !== 0) throw new Error(`${args.slice(0, 2).join(" ")} failed with ${code}; see ${logName}.log`);
    return JSON.parse(stdout) as Record<string, unknown>;
  } finally {
    await log.close();
  }
}

/** Find the first rendered media path in a CLI result, wherever the result nests it. */
function mediaPath(value: unknown): string | undefined {
  if (typeof value === "string") return /\.(mov|mp4|png)$/.test(value) ? value : undefined;
  if (value && typeof value === "object") for (const child of Object.values(value)) { const found = mediaPath(child); if (found) return found; }
  return undefined;
}

async function main() {
  const argv = process.argv.slice(2);
  const run = argv[argv.indexOf("--run") + 1];
  if (!argv.includes("--run") || !run || !/^[a-z0-9][a-z0-9-]*$/.test(run)) throw new Error("--run <new-run-name> is required");
  const dir = join(root, "artifacts/mythology-portfolio", run);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "council-optimizers.intent.json"), JSON.stringify({ film: "council-optimizers", run, createdAt: new Date().toISOString(), stages: ["check", "temporal-audit", "render-audit", "render video", "render still"] }) + "\n", { flag: "wx", mode: 0o600 });
  const scenePath = join(dir, "council-optimizers.scene.json");
  await writeFile(scenePath, JSON.stringify(councilScene(), null, 2) + "\n", { flag: "wx" });
  const rel = scenePath.slice(root.length + 1);
  await cli(["scene", "check", rel], "council-optimizers.check", dir);
  if (argv.includes("--scene-only")) return;
  const times = [0, 1_500_000, 3_000_000, 4_500_000, 6_000_000, 7_900_000].join(",");
  await cli(["scene", "temporal-audit", rel, "--camera", "camera_iso", "--times-us", times], "council-optimizers.temporal-audit", dir);
  await cli(["scene", "render-audit", rel, "--camera", "camera_iso", "--times-us", times], "council-optimizers.render-audit", dir);
  const videoRequest = join(dir, "council-optimizers.video-request.json");
  await writeFile(videoRequest, JSON.stringify({ cameraId: "camera_iso", mode: { kind: "beauty" }, selection: { kind: "video", range: { startUs: 0, endUs: DURATION_US }, frameRate: { numerator: 24, denominator: 1 } } }) + "\n", { flag: "wx" });
  const video = await cli(["scene", "render", rel, "--request", videoRequest.slice(root.length + 1), "--profile", "three-webgl2-hardware-v1"], "council-optimizers.render", dir);
  const stillRequest = join(dir, "council-optimizers.still-request.json");
  await writeFile(stillRequest, JSON.stringify({ cameraId: "camera_iso_4k", mode: { kind: "beauty" }, selection: { kind: "frame", timeUs: STILL_US } }) + "\n", { flag: "wx" });
  const still = await cli(["scene", "render", rel, "--request", stillRequest.slice(root.length + 1), "--profile", "three-webgl2-hardware-v1"], "council-optimizers.still-render", dir);
  // The spatial renderer writes a lossless MOV; the gallery needs H.264 MP4.
  const mov = mediaPath(video);
  if (!mov) throw new Error("render result names no video");
  const mp4 = join(dir, "council-optimizers.mp4");
  const ffmpeg = Bun.spawnSync(["ffmpeg", "-v", "error", "-n", "-i", resolve(root, mov), "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4]);
  if (ffmpeg.exitCode !== 0) throw new Error(ffmpeg.stderr.toString());
  await writeFile(join(dir, "council-optimizers.result.json"), JSON.stringify({ film: "council-optimizers", video: mp4.slice(root.length + 1), sourceVideo: mov, still: mediaPath(still) }, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ film: "council-optimizers", state: "rendered", video: mp4 }));
}

if (import.meta.main) await main();
