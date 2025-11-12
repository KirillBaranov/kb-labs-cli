/**
 * Tests for command execution with JSON mode and exit codes
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { runCommand } from "../run.js";
import type { RegisteredCommand } from "../types.js";
import type { ManifestV2 } from "@kb-labs/plugin-manifest";

const mockExecuteCommand = vi.hoisted(() =>
  vi.fn(async () => {
    return 0;
  }),
);

vi.mock("@kb-labs/plugin-adapter-cli", () => ({
  executeCommand: mockExecuteCommand,
}));

const baseManifestV2: ManifestV2 = {
  schema: "kb.plugin/2",
  id: "-labs/test-plugin",
  version: "0.0.1",
  permissions: {},
  cli: {
    commands: [
      {
        id: "test:command",
        describe: "Test command",
        handler: "./cli/command.js",
        flags: [],
      },
    ],
  },
  capabilities: [],
};

function createRegisteredCommand(
  overrides: Partial<RegisteredCommand["manifest"]> = {},
  availability: Partial<RegisteredCommand> = {},
): RegisteredCommand {
  return {
    manifest: {
      manifestVersion: "1.0",
      id: "test:command",
      group: "test",
      describe: "Test command",
      manifestV2: structuredClone(baseManifestV2),
      ...overrides,
    },
    available: true,
    source: "workspace",
    shadowed: false,
    pkgRoot: "/tmp",
    packageName: "@kb-labs/test",
    ...availability,
  } as RegisteredCommand;
}

describe('runCommand', () => {
  const mockCtx = {
    presenter: {
      json: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    },
    diagnostics: [],
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should execute available command successfully', async () => {
    const registeredCmd = createRegisteredCommand();

    mockExecuteCommand.mockResolvedValueOnce(0);

    const result = await runCommand(registeredCmd, mockCtx, ["arg1"], {
      verbose: false,
    });

    expect(result).toBe(0);
    expect(mockExecuteCommand).toHaveBeenCalled();
  });

  it('should return exit code 2 for unavailable command in JSON mode', async () => {
    const registeredCmd: RegisteredCommand = {
      ...createRegisteredCommand(),
      available: false,
      unavailableReason: "Missing dependency: @kb-labs/missing-package",
      hint: "Run: pnpm add @kb-labs/missing-package",
    };

    const result = await runCommand(registeredCmd, mockCtx, [], { json: true });

    expect(result).toBe(2);
    expect(mockCtx.presenter.json).toHaveBeenCalledWith({
      ok: false,
      available: false,
      command: 'test:command',
      reason: 'Missing dependency: @kb-labs/missing-package',
      hint: "Run: pnpm add @kb-labs/missing-package",
    });
  });

  it('should return exit code 2 for unavailable command in text mode', async () => {
    const registeredCmd: RegisteredCommand = {
      ...createRegisteredCommand(),
      available: false,
      unavailableReason: "Missing dependency: @kb-labs/missing-package",
      hint: "Run: pnpm add @kb-labs/missing-package",
      shadowed: false,
    };

    const result = await runCommand(registeredCmd, mockCtx, [], { verbose: false });

    expect(result).toBe(2);
    expect(mockCtx.presenter.warn).toHaveBeenCalledWith(
      "test:command unavailable: Missing dependency: @kb-labs/missing-package",
    );
    expect(mockCtx.presenter.info).toHaveBeenCalledWith(
      "Run: pnpm add @kb-labs/missing-package",
    );
  });

  it('should show verbose output for unavailable command', async () => {
    const registeredCmd: RegisteredCommand = {
      ...createRegisteredCommand(),
      available: false,
      unavailableReason: "Missing dependency: @kb-labs/missing-package",
      hint: "Run: pnpm add @kb-labs/missing-package",
    };

    const result = await runCommand(registeredCmd, mockCtx, [], { verbose: true });

    expect(result).toBe(2);
    expect(mockCtx.presenter.warn).toHaveBeenCalledWith(
      "Command unavailable: test:command",
    );
    expect(mockCtx.presenter.warn).toHaveBeenCalledWith(
      "Reason: Missing dependency: @kb-labs/missing-package",
    );
    expect(mockCtx.presenter.info).toHaveBeenCalledWith(
      "Hint: Run: pnpm add @kb-labs/missing-package",
    );
  });

  it("should return exit code 1 when manifest lacks CLI declaration", async () => {
    const incompleteManifest = createRegisteredCommand({
      manifestV2: {
        ...baseManifestV2,
        cli: { commands: [] },
      },
    });

    const result = await runCommand(incompleteManifest, mockCtx, [], {});

    expect(result).toBe(1);
    expect(mockCtx.presenter.error).toHaveBeenCalledWith(
      "Command test:command not declared in manifest",
    );
  });

  it('should pass global flags to command', async () => {
    const registeredCmd = createRegisteredCommand();
    const flags = {
      json: true,
      verbose: true,
      quiet: false,
      help: false,
      version: false,
      onlyAvailable: false,
      noCache: false,
    };

    await runCommand(registeredCmd, mockCtx, ["arg1"], flags);

    expect(mockExecuteCommand).toHaveBeenCalledWith(
      expect.objectContaining({ id: "test:command" }),
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining(flags),
      expect.any(Array),
      registeredCmd.pkgRoot,
      expect.any(String),
      undefined,
      undefined,
    );
  });

  it("should handle command returning number", async () => {
    const registeredCmd = createRegisteredCommand();
    mockExecuteCommand.mockResolvedValueOnce(42);

    const result = await runCommand(registeredCmd, mockCtx, [], {});

    expect(result).toBe(42);
  });

  it("should handle command returning void", async () => {
    const registeredCmd = createRegisteredCommand();
    const result = await runCommand(registeredCmd, mockCtx, [], {});

    expect(result).toBe(0);
  });
});
