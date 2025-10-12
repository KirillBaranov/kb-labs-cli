import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerBuiltinCommands } from "../register";
import { registry } from "../registry";

// Mock the registry to avoid side effects
vi.mock("../registry", () => ({
  registry: {
    register: vi.fn(),
  },
}));

describe("registerBuiltinCommands", () => {
  const mockRegister = vi.mocked(registry.register);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should register all builtin commands", () => {
    registerBuiltinCommands();

    // 4 base commands + 6 devlink commands = 10
    expect(mockRegister).toHaveBeenCalledTimes(10);

    // Check that all expected commands are registered
    const registeredCommands = mockRegister.mock.calls.map(call => call[0]);
    const commandNames = registeredCommands.map(cmd => cmd.name);

    // Base commands
    expect(commandNames).toContain("hello");
    expect(commandNames).toContain("version");
    expect(commandNames).toContain("diagnose");
    expect(commandNames).toContain("init.profile");

    // DevLink commands
    expect(commandNames).toContain("devlink:plan");
    expect(commandNames).toContain("devlink:apply");
    expect(commandNames).toContain("devlink:freeze");
    expect(commandNames).toContain("devlink:lock:apply");
    expect(commandNames).toContain("devlink:undo");
    expect(commandNames).toContain("devlink:status");
  });

  it("should not register commands multiple times", () => {
    registerBuiltinCommands();
    const firstCallCount = mockRegister.mock.calls.length;

    registerBuiltinCommands();
    const secondCallCount = mockRegister.mock.calls.length;

    // Should not register again due to _registered flag
    expect(secondCallCount).toBe(firstCallCount);
  });

  it("should register commands without errors", () => {
    // Just test that the function runs without throwing
    expect(() => registerBuiltinCommands()).not.toThrow();
  });
});
