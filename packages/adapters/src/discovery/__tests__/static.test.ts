import { describe, it, expect } from "vitest";
import { createStaticDiscovery } from "../static";
import { CliError, CLI_ERROR_CODES } from "@kb-labs/cli-core";

describe("static discovery", () => {
  it("should find and load static commands", async () => {
    const mockCommands = [
      { name: "test", description: "Test command", run: async () => {} },
    ];

    const mockLoader = async (name: string) => {
      if (name === "@test/plugin") {
        return mockCommands;
      }
      return [];
    };

    const discovery = createStaticDiscovery(["@test/plugin"], mockLoader);

    const found = await discovery.find();
    expect(found).toEqual(["@test/plugin"]);

    const loaded = await discovery.load("@test/plugin");
    expect(loaded).toEqual(mockCommands);
  });

  it("should throw CliError when plugin fails to load", async () => {
    const discovery = createStaticDiscovery(["@nonexistent/plugin"]);

    await expect(discovery.load("@nonexistent/plugin")).rejects.toThrow(
      CliError,
    );
    await expect(discovery.load("@nonexistent/plugin")).rejects.toMatchObject({
      code: CLI_ERROR_CODES.E_DISCOVERY_CONFIG,
    });
  });
});
