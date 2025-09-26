import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { createPackageJsonDiscovery } from "../package-json.js";
import { CliError, CLI_ERROR_CODES } from "@kb-labs/cli-core";

describe("package-json discovery", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fsp.mkdtemp(path.join(tmpdir(), "kb-labs-test-"));
  });

  afterEach(async () => {
    await fsp.rm(tempDir, { recursive: true, force: true });
  });

  it("should find and load commands from package.json", async () => {
    // Create package.json with commands
    const packageJson = {
      name: "test-package",
      kbLabs: {
        commands: ["@test/plugin1", "@test/plugin2"],
      },
    };
    await fsp.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify(packageJson, null, 2),
    );

    const discovery = createPackageJsonDiscovery(tempDir);
    const commands = await discovery.find();

    expect(commands).toEqual(["@test/plugin1", "@test/plugin2"]);
  });

  it("should throw CliError when package.json is invalid", async () => {
    // Create invalid package.json
    await fsp.writeFile(
      path.join(tempDir, "package.json"),
      "invalid json content",
    );

    const discovery = createPackageJsonDiscovery(tempDir);

    await expect(discovery.find()).rejects.toThrow(CliError);
    await expect(discovery.find()).rejects.toMatchObject({
      code: CLI_ERROR_CODES.E_DISCOVERY_CONFIG,
    });
  });
});
