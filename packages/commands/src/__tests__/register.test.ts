import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerBuiltinCommands } from "../utils/register";
import { registry } from "../utils/registry";

// Mock the registry to avoid side effects
vi.mock("../utils/registry", () => ({
  registry: {
    register: vi.fn(),
    registerGroup: vi.fn(),
  },
}));

describe("registerBuiltinCommands", () => {
  const mockRegister = vi.mocked(registry.register);
  const mockRegisterGroup = vi.mocked(registry.registerGroup);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should register all builtin commands", () => {
    registerBuiltinCommands();

    // Should register 2 groups (devlink and profiles) + 3 standalone commands
    expect(mockRegisterGroup).toHaveBeenCalledTimes(2);
    expect(mockRegister).toHaveBeenCalledTimes(3);

    // Check that groups are registered
    const registeredGroups = mockRegisterGroup.mock.calls.map(call => call[0]);
    const groupNames = registeredGroups.map(group => group.name);
    expect(groupNames).toContain("devlink");
    expect(groupNames).toContain("profiles");

    // Check that standalone commands are registered
    const registeredCommands = mockRegister.mock.calls.map(call => call[0]);
    const commandNames = registeredCommands.map(cmd => cmd.name);
    expect(commandNames).toContain("hello");
    expect(commandNames).toContain("version");
    expect(commandNames).toContain("diagnose");
  });

  it("should not register commands multiple times", () => {
    registerBuiltinCommands();
    const firstRegisterCount = mockRegister.mock.calls.length;
    const firstRegisterGroupCount = mockRegisterGroup.mock.calls.length;

    registerBuiltinCommands();
    const secondRegisterCount = mockRegister.mock.calls.length;
    const secondRegisterGroupCount = mockRegisterGroup.mock.calls.length;

    // Should not register again due to _registered flag
    expect(secondRegisterCount).toBe(firstRegisterCount);
    expect(secondRegisterGroupCount).toBe(firstRegisterGroupCount);
  });

  it("should register commands without errors", () => {
    // Just test that the function runs without throwing
    expect(() => registerBuiltinCommands()).not.toThrow();
  });
});
