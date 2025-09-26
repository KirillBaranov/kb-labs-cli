import { describe, it, expect } from "vitest";
import type { CliCommand, FlagBuilder } from "../command";

describe("Command types", () => {
  describe("CliCommand interface", () => {
    it("should allow creating a command with minimal properties", () => {
      const command: CliCommand = {
        name: "test",
        description: "Test command",
        run: () => 0,
      };

      expect(command.name).toBe("test");
      expect(command.description).toBe("Test command");
      expect(typeof command.run).toBe("function");
    });

    it("should allow creating a command with registerFlags", () => {
      const command: CliCommand = {
        name: "test",
        description: "Test command",
        registerFlags: (builder: FlagBuilder) => {
          builder({ flag: true });
        },
        run: () => 0,
      };

      expect(command.registerFlags).toBeDefined();
      expect(typeof command.registerFlags).toBe("function");
    });

    it("should allow async run function", () => {
      const command: CliCommand = {
        name: "test",
        description: "Test command",
        run: async () => {
          return 0;
        },
      };

      expect(typeof command.run).toBe("function");
    });

    it("should allow run function that returns void", () => {
      const command: CliCommand = {
        name: "test",
        description: "Test command",
        run: () => {
          // do nothing
        },
      };

      expect(typeof command.run).toBe("function");
    });
  });

  describe("FlagBuilder type", () => {
    it("should allow building flags", () => {
      const builder: FlagBuilder = (flags) => {
        flags.verbose = true;
        flags.output = "file.txt";
      };

      const flags: Record<string, unknown> = {};
      builder(flags);

      expect(flags.verbose).toBe(true);
      expect(flags.output).toBe("file.txt");
    });
  });
});
