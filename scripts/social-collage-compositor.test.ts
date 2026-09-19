import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import sharp from "sharp";
import { composeSocialCollageBanner } from "../skills/slopcamera/scripts/compose-social-collage-banner";

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

test("social collage compositor retains exact inputs and renders every layer kind deterministically", async () => {
  const root = await mkdtemp(join(tmpdir(), "slopcamera-social-collage-"));
  try {
    await sharp({ create: { width: 96, height: 64, channels: 3, background: "#203050" } })
      .png()
      .toFile(join(root, "background.png"));
    await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><circle cx="40" cy="40" r="25" fill="#ffb41f"/></svg>'))
      .png()
      .toFile(join(root, "sticker.png"));
    await sharp({ create: { width: 120, height: 48, channels: 3, background: "#f5f0e2" } })
      .composite([{ input: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="48"><path d="M 8 32 L 52 8 L 110 36" fill="none" stroke="#38205c" stroke-width="5"/></svg>') }])
      .png()
      .toFile(join(root, "diagram.png"));
    const manifest = {
      schemaVersion: 1,
      canvas: { width: 600, height: 240, color: "#100a1c", background: { path: "background.png", position: "centre" } },
      layers: [
        { kind: "image", path: "sticker.png", x: 110, y: 128, width: 130, rotation: -7, treatment: { kind: "sticker", border: 7 } },
        { kind: "image", path: "diagram.png", x: 355, y: 188, width: 280, rotation: -2, treatment: { kind: "paper", padding: 12 } },
        { kind: "tape", x: 260, y: 128, width: 100, height: 24, rotation: -24, color: "#f8ebaa", opacity: 0.8 },
        { kind: "text", text: "PARALLEL PARTS\nLOCAL COMPOSITE", x: 350, y: 54, fontSize: 28, fill: "#ffe05a", stroke: "#3c1450", strokeWidth: 3, rotation: 1, fontFamily: "sans", fontWeight: 800 },
        { kind: "arrow", from: { x: 208, y: 90 }, to: { x: 150, y: 120 }, bend: 0.2, color: "#7ceaff", width: 6 },
        { kind: "ellipse", x: 110, y: 128, width: 150, height: 130, rotation: -5, color: "#ff5048", strokeWidth: 6 },
        { kind: "text", text: "receipt-bound", x: 495, y: 218, fontSize: 18, fill: "#fff4d6", stroke: "#17111f", strokeWidth: 2, rotation: -2, fontFamily: "mono", fontWeight: 700 },
      ],
      effects: { grain: 0.18, grainSeed: 17, vignette: 0.25, chromaticShift: 2 },
    };
    const manifestPath = join(root, "banner.json");
    await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
    const firstPath = join(root, "banner-one.png");
    const secondPath = join(root, "banner-two.png");
    const first = await composeSocialCollageBanner(manifestPath, firstPath);
    const second = await composeSocialCollageBanner(manifestPath, secondPath);
    const firstBytes = await readFile(firstPath);
    const secondBytes = await readFile(secondPath);
    const metadata = await sharp(firstBytes).metadata();
    expect([metadata.format, metadata.width, metadata.height]).toEqual(["png", 600, 240]);
    expect(first.layerCount).toBe(7);
    expect(first.inputs.map((input) => input.path.split("/").at(-1))).toEqual(["background.png", "diagram.png", "sticker.png"]);
    expect(first.outputSha256).toBe(sha256(firstBytes));
    expect(first.outputSha256).toBe(second.outputSha256);
    expect(firstBytes.equals(secondBytes)).toBe(true);
    const receipt = JSON.parse(await readFile(first.receipt, "utf8")) as Record<string, unknown>;
    expect(receipt.kind).toBe("slopcamera.social-collage-receipt");
    expect(receipt.manifestSha256).toBe(first.manifestSha256);
    await expect(composeSocialCollageBanner(manifestPath, firstPath)).rejects.toThrow("refusing to replace existing output");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("social collage compositor expands a trimmed sticker before drawing its border", async () => {
  const root = await mkdtemp(join(tmpdir(), "slopcamera-social-collage-"));
  try {
    await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50"><circle cx="25" cy="25" r="24" fill="#ffb41f"/></svg>'))
      .png()
      .toFile(join(root, "sticker.png"));
    const manifestPath = join(root, "border.json");
    const outputPath = join(root, "border.png");
    await writeFile(manifestPath, JSON.stringify({
      schemaVersion: 1,
      canvas: { width: 320, height: 160, color: "#102030" },
      layers: [{
        kind: "image",
        path: "sticker.png",
        x: 160,
        y: 80,
        width: 80,
        treatment: { kind: "sticker", border: 8, borderColor: "#ffffff", shadow: { blur: 0, dx: 0, dy: 0, opacity: 0 } },
      }],
    }));
    await composeSocialCollageBanner(manifestPath, outputPath);
    const { data, info } = await sharp(outputPath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const offset = (80 * info.width + 202) * info.channels;
    expect([data[offset], data[offset + 1], data[offset + 2]]).toEqual([255, 255, 255]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("social collage compositor rejects an oversized intermediate text raster", async () => {
  const root = await mkdtemp(join(tmpdir(), "slopcamera-social-collage-"));
  try {
    const manifestPath = join(root, "oversized.json");
    await writeFile(manifestPath, JSON.stringify({
      schemaVersion: 1,
      canvas: { width: 600, height: 240 },
      layers: [{ kind: "text", text: "X".repeat(800), x: 300, y: 120, fontSize: 512 }],
    }));
    await expect(composeSocialCollageBanner(manifestPath, join(root, "oversized.png"))).rejects.toThrow("text layer exceeds");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("social collage compositor rejects remote image paths before dispatch", async () => {
  const root = await mkdtemp(join(tmpdir(), "slopcamera-social-collage-"));
  try {
    const manifestPath = join(root, "remote.json");
    await writeFile(manifestPath, JSON.stringify({
      schemaVersion: 1,
      canvas: { width: 600, height: 240, background: { path: "https://example.com/background.png" } },
      layers: [],
    }));
    await expect(composeSocialCollageBanner(manifestPath, join(root, "remote.png"))).rejects.toThrow("local files, not URLs");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
