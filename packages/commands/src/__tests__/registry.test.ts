import { describe, it, expect, beforeEach } from "vitest";
import { registry, findCommand } from "../utils/registry";
import type { Command } from "../types";

describe("Command Registry", () => {
  beforeEach(() => {
    // Clear registry before each test by removing all commands
    const commands = registry.list();
    commands.forEach(cmd => {
      // We can't directly clear the registry, so we'll work with what's there
      // The registry is shared across tests, so we need to account for existing commands
    });
  });

  describe("registry", () => {
    it("should be an instance of InMemoryRegistry", () => {
      expect(registry).toBeDefined();
      expect(typeof registry.register).toBe("function");
      expect(typeof registry.has).toBe("function");
      expect(typeof registry.get).toBe("function");
      expect(typeof registry.list).toBe("function");
    });
  });

  describe("register", () => {
    it("should register a command", () => {
      const command: Command = {
        name: "test",
        describe: "Test command",
        run: () => 0,
      };

      registry.register(command);

      expect(registry.has("test")).toBe(true);
      expect(registry.get("test")).toBe(command);
    });

    it("should register command with aliases", () => {
      const command: Command = {
        name: "test",
        describe: "Test command",
        aliases: ["t", "test-cmd"],
        run: () => 0,
      };

      registry.register(command);

      expect(registry.has("test")).toBe(true);
      expect(registry.has("t")).toBe(true);
      expect(registry.has("test-cmd")).toBe(true);
      expect(registry.get("t")).toBe(command);
      expect(registry.get("test-cmd")).toBe(command);
    });

    it("should overwrite existing command with same name", () => {
      const command1: Command = {
        name: "test",
        describe: "Test command 1",
        run: () => 0,
      };

      const command2: Command = {
        name: "test",
        describe: "Test command 2",
        run: () => 1,
      };

      registry.register(command1);
      registry.register(command2);

      expect(registry.get("test")).toBe(command2);
    });
  });

  describe("get", () => {
    it("should get command by string name", () => {
      const command: Command = {
        name: "hello",
        describe: "Hello command",
        run: () => 0,
      };

      registry.register(command);

      expect(registry.get("hello")).toBe(command);
    });

    it("should get command by array path", () => {
      const command: Command = {
        name: "init.profile",
        describe: "Init profile command",
        run: () => 0,
      };

      registry.register(command);

      expect(registry.get(["init", "profile"])).toBe(command);
    });

    it("should return undefined for non-existent command", () => {
      expect(registry.get("nonexistent")).toBeUndefined();
      expect(registry.get(["nonexistent", "command"])).toBeUndefined();
    });

    it("should handle empty array", () => {
      expect(registry.get([])).toBeUndefined();
    });
  });

  describe("has", () => {
    it("should return true for registered command", () => {
      const command: Command = {
        name: "test",
        describe: "Test command",
        run: () => 0,
      };

      registry.register(command);

      expect(registry.has("test")).toBe(true);
    });

    it("should return true for registered alias", () => {
      const command: Command = {
        name: "test",
        describe: "Test command",
        aliases: ["t"],
        run: () => 0,
      };

      registry.register(command);

      expect(registry.has("t")).toBe(true);
    });

    it("should return false for non-existent command", () => {
      expect(registry.has("nonexistent")).toBe(false);
    });
  });

  describe("list", () => {
    it("should return commands from registry", () => {
      const commands = registry.list();
      expect(Array.isArray(commands)).toBe(true);
      // Registry may have commands from other tests, so we just check it's an array
    });

    it("should return unique commands", () => {
      const command1: Command = {
        name: "test1",
        describe: "Test command 1",
        run: () => 0,
      };

      const command2: Command = {
        name: "test2",
        describe: "Test command 2",
        aliases: ["t2"],
        run: () => 0,
      };

      registry.register(command1);
      registry.register(command2);

      const commands = registry.list();
      expect(commands).toContain(command1);
      expect(commands).toContain(command2);
      // Check that commands are unique (no duplicates)
      const uniqueCommands = new Set(commands);
      expect(uniqueCommands.size).toBe(commands.length);
    });

    it("should not return duplicates for commands with aliases", () => {
      const command: Command = {
        name: "test",
        describe: "Test command",
        aliases: ["t", "test-cmd"],
        run: () => 0,
      };

      registry.register(command);

      const commands = registry.list();
      expect(commands).toContain(command);
      // Check that the command appears only once in the list
      const commandCount = commands.filter(cmd => cmd === command).length;
      expect(commandCount).toBe(1);
    });
  });

  describe("findCommand", () => {
    it("should find command by string", () => {
      const command: Command = {
        name: "hello",
        describe: "Hello command",
        run: () => 0,
      };

      registry.register(command);

      expect(findCommand("hello")).toBe(command);
    });

    it("should find command by array", () => {
      const command: Command = {
        name: "init.profile",
        describe: "Init profile command",
        run: () => 0,
      };

      registry.register(command);

      expect(findCommand(["init", "profile"])).toBe(command);
    });

    it("should return undefined for non-existent command", () => {
      expect(findCommand("nonexistent")).toBeUndefined();
    });
  });
});
