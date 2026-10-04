import { expect, test } from "bun:test";
import messagingSnapshot from "../apps/web/src/portfolio-messaging.generated.json";
import { fileURLToPath } from "node:url";

test("the offline portfolio template uses the canonical SlopCamera display name", async () => {
  const source = await Bun.file(new URL("../examples/style-portfolio/build-gallery.ts", import.meta.url)).text();
  const names = [...source.matchAll(/\bSlop[Cc]amera\b/gu)].map(match => match[0]);
  expect(names.length).toBeGreaterThan(0);
  expect(names.every(name => name === "SlopCamera")).toBe(true);
});

test("public names match the messaging record without recasing technical identifiers", async () => {
  expect(messagingSnapshot.messaging.names.name).toBe("SlopCamera");
  expect(messagingSnapshot.messaging.names.command).toBe("slopcamera");
  expect(messagingSnapshot.canonicalUrl).toBe("https://slopcamera.com");
  const manifest = await Bun.file(new URL("../package.json", import.meta.url)).json();
  const webManifest = await Bun.file(new URL("../apps/web/package.json", import.meta.url)).json();
  expect(manifest.name).toBe("@hraness/slopcamera");
  expect(manifest.description).toMatch(/^SlopCamera /u);
  expect(webManifest.name).toBe("@hraness/slopcamera-web");
  expect(webManifest.description).toBe("The static public site for SlopCamera.");
  const root = new URL("../", import.meta.url);
  const paths = ["README.md", "docs/README.md", "skills/slopcamera/SKILL.md", "src/support.ts", "src/cli-core.ts", "apps/desktop/cli/help.ts", "apps/desktop/cli/update-verification.ts", "apps/desktop/cli/commands.ts", "apps/desktop/cli/args.ts", "apps/desktop/cli/portable-surface-core.ts", "apps/web/src/index.html", "apps/web/src/preview.html", "apps/web/src/site-content.ts", "apps/web/src/agent-pages.ts"];
  for await (const path of new Bun.Glob("apps/web/src/docs/**/*.md").scan({ cwd: fileURLToPath(root), onlyFiles: true })) paths.push(path);
  for (const path of paths) {
    const source = await Bun.file(new URL(path, root)).text();
    expect([...source.matchAll(/\bSlopcamera\b/gu)].map(match => match[0]), path).toEqual([]);
    expect(source.includes("SlopCameraOverlay"), path).toBe(false);
    expect(source, path).not.toMatch(/\b(?:create|execute|define|run)SlopCamera[A-Z]\w*/u);
  }
});

test("SDK documentation preserves the exported technical API spellings", async () => {
  const reference = await Bun.file(new URL("../apps/web/src/docs/reference/sdk.md", import.meta.url)).text();
  for (const name of ["executeSlopcameraOperation", "createSlopcameraCodeHost", "defineSlopcameraWorkflow", "runSlopcameraWorkflow"]) {
    expect(reference).toContain(name);
  }
  const extending = await Bun.file(new URL("../apps/web/src/docs/explanation/extending.md", import.meta.url)).text();
  expect(extending).toContain("executeSlopcameraOperation");
});
