import { describe, it, expect, beforeEach } from "vitest";
import { registry, findCommand } from "../registry";
import type { CliCommand } from "../command";

describe("Registry", () => {
  beforeEach(() => {
    // Clear registry before each test
    registry.length = 0;
  });

  describe("registry", () => {
    it("should be an empty array initially", () => {
      expect(Array.from(registry)).toEqual([]);
      expect(registry.length).toBe(0);
    });

    it("should allow adding commands", () => {
      const command: CliCommand = {
        name: "test",
        description: "Test command",
        run: () => 0,
      };

      registry.push(command);

      expect(registry).toHaveLength(1);
      expect(registry[0]).toBe(command);
    });
  });

  describe("findCommand", () => {
    it("should return undefined for empty registry", () => {
      const result = findCommand(["hello"]);

      expect(result).toBeUndefined();
    });

    it("should find command by exact dotted name", () => {
      const command: CliCommand = {
        name: "init.profile",
        description: "Initialize profile",
        run: () => 0,
      };

      registry.push(command);

      const result = findCommand(["init", "profile"]);

      expect(result).toBe(command);
    });

    it("should find command by first word of name", () => {
      const command: CliCommand = {
        name: "hello world",
        description: "Hello world command",
        run: () => 0,
      };

      registry.push(command);

      const result = findCommand(["hello"]);

      expect(result).toBe(command);
    });

    it("should find command by single word name", () => {
      const command: CliCommand = {
        name: "version",
        description: "Show version",
        run: () => 0,
      };

      registry.push(command);

      const result = findCommand(["version"]);

      expect(result).toBe(command);
    });

    it("should return undefined for non-existent command", () => {
      const command: CliCommand = {
        name: "hello",
        description: "Hello command",
        run: () => 0,
      };

      registry.push(command);

      const result = findCommand(["nonexistent"]);

      expect(result).toBeUndefined();
    });

    it("should return undefined for empty path", () => {
      const command: CliCommand = {
        name: "hello",
        description: "Hello command",
        run: () => 0,
      };

      registry.push(command);

      const result = findCommand([]);

      expect(result).toBeUndefined();
    });

    it("should find first matching command when multiple exist", () => {
      const command1: CliCommand = {
        name: "hello",
        description: "Hello command 1",
        run: () => 0,
      };

      const command2: CliCommand = {
        name: "hello world",
        description: "Hello world command",
        run: () => 0,
      };

      registry.push(command1, command2);

      const result = findCommand(["hello"]);

      expect(result).toBe(command1);
    });

    it("should handle complex dotted names", () => {
      const command: CliCommand = {
        name: "user.profile.settings",
        description: "User profile settings",
        run: () => 0,
      };

      registry.push(command);

      const result = findCommand(["user", "profile", "settings"]);

      expect(result).toBe(command);
    });
  });
});
