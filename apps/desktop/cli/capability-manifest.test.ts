import { describe, expect, test } from "bun:test";

import { slopcameraMcpTools } from "../../../src/mcp/tools";
import { createApplicationOperationRegistry } from "../application/default-registry";
import { BUILT_IN_WORKFLOWS } from "../workflows";
import { createLocalSlopcameraCapabilityManifest } from "./capability-manifest";

describe("local capability manifest", () => {
  test("owns every registered operation, workflow, and MCP tool exactly once", () => {
    const registry = createApplicationOperationRegistry();
    const manifest = createLocalSlopcameraCapabilityManifest(registry);
    expect(manifest.modules.flatMap(module => module.operations).map(operation => operation.key).sort()).toEqual(
      registry.list().map(operation => `${operation.kind}@${operation.version}`).sort(),
    );
    expect(manifest.modules.flatMap(module => module.workflows).map(workflow => workflow.key).sort()).toEqual(
      BUILT_IN_WORKFLOWS.map(workflow => `${workflow.id}@${workflow.version}`).sort(),
    );
    expect(manifest.modules.flatMap(module => module.tools).map(tool => tool.name).sort()).toEqual(
      slopcameraMcpTools.map(tool => tool.name).sort(),
    );
  });

  test("is deterministic and keeps native/provider qualification conditional", () => {
    const first = createLocalSlopcameraCapabilityManifest();
    const second = createLocalSlopcameraCapabilityManifest();
    expect(first).toEqual(second);
    expect(first.modules.find(module => module.moduleId === "slopcamera.capability.native-authoring")?.profiles.every(profile => profile.qualification.status === "conditional")).toBe(true);
    expect(first.modules.find(module => module.moduleId === "slopcamera.capability.gateway")?.trust).toBe("paid-provider");
  });

  test("fails closed when the production registry changes without module ownership", () => {
    const registry = createApplicationOperationRegistry();
    const operations = registry.list();
    expect(() => createLocalSlopcameraCapabilityManifest({ list: () => operations.slice(1) })).toThrow(/Unknown operation/);
  });
});
