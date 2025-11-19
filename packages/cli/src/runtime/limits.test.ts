import { describe, it, expect, vi } from "vitest";
import type { ManifestV2 } from "@kb-labs/plugin-manifest";
import type { RegisteredCommand } from "@kb-labs/cli-commands/registry/types.js";
import { handleLimitFlag } from "./limits";

function createManifest(): ManifestV2 {
  return {
    schema: "kb.plugin/2",
    id: "@kb-labs/test",
    version: "1.0.0",
    display: { name: "Test Plugin" },
    permissions: {
      fs: { mode: "read", allow: [".kb/test/**"] },
      net: "none",
      env: { allow: ["NODE_ENV"] },
      quotas: { timeoutMs: 1000, memoryMb: 128, cpuMs: 1000 },
      capabilities: ["fs:read"],
    },
    cli: {
      commands: [
        {
          id: "test:run",
          describe: "Run test command",
          flags: [],
          handler: "./cli/commands/run.js#run",
        },
      ],
    },
    setup: {
      handler: "./setup/handler.js#run",
      permissions: {
        fs: { mode: "readWrite", allow: [".kb/test/**"] },
        net: "none",
      },
    },
    artifacts: [
      {
        id: "test.artifact",
        pathTemplate: ".kb/test/artifact.json",
      },
    ],
    capabilities: ["fs:read"],
  };
}

function createRegisteredCommand(manifest: ManifestV2): RegisteredCommand {
  return {
    manifest: {
      manifestVersion: "1.0",
      id: "test:run",
      group: "test",
      describe: "Test command",
      loader: async () => ({ run: vi.fn() }),
      manifestV2: manifest,
    },
    available: true,
    source: "workspace",
    shadowed: false,
    packageName: "@kb-labs/test-cli",
  };
}

describe("handleLimitFlag", () => {
  it("renders product limits in text mode", () => {
    const manifest = createManifest();
    const registered = createRegisteredCommand(manifest);

    const registryStub = {
      getCommandsByGroup: vi.fn().mockReturnValue([registered]),
      getManifestCommand: vi.fn(),
    };

    const write = vi.fn();
    const presenter = { write };

    const exitCode = handleLimitFlag({
      cmdPath: ["test"],
      presenter,
      registry: registryStub,
      asJson: false,
    });

    expect(exitCode).toBe(0);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]![0]).toContain("Test Plugin");
    expect(write.mock.calls[0]![0]).toContain("@kb-labs/test");
  });

  it("renders command limits in json mode", () => {
    const manifest = createManifest();
    const registered = createRegisteredCommand(manifest);

    const registryStub = {
      getCommandsByGroup: vi.fn(),
      getManifestCommand: vi.fn().mockReturnValue(registered),
    };

    const json = vi.fn();
    const presenter = { json };

    const exitCode = handleLimitFlag({
      cmdPath: ["test", "run"],
      presenter,
      registry: registryStub,
      asJson: true,
    });

    expect(exitCode).toBe(0);
    expect(json).toHaveBeenCalledTimes(1);
    const payload = json.mock.calls[0]![0] as any;
    expect(payload.scope).toBe("command");
    expect(payload.command).toBe("test:run");
    expect(payload.product).toBe("test");
    expect(payload.limits.permissions?.fs?.mode).toBe("read");
  });

  it("renders error when product is unknown", () => {
    const registryStub = {
      getCommandsByGroup: vi.fn().mockReturnValue([]),
      getManifestCommand: vi.fn(),
    };
    const error = vi.fn();
    const presenter = { error };

    const exitCode = handleLimitFlag({
      cmdPath: ["missing"],
      presenter,
      registry: registryStub,
      asJson: false,
    });

    expect(exitCode).toBe(1);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("Unknown product"),
    );
  });
});

