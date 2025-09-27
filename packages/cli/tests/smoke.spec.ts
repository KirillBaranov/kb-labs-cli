import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { run } from "../src/index";

describe("CLI Smoke Tests", () => {
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let originalArgv: string[];

  beforeEach(() => {
    originalArgv = [...process.argv];
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => { });
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => { });
  });

  afterEach(() => {
    process.argv = originalArgv;
    consoleLogSpy?.mockRestore();
    consoleErrorSpy?.mockRestore();
  });

  describe("Global flags", () => {
    it("should handle --help flag in text mode", async () => {
      const exitCode = await run(["--help"]);

      expect(exitCode).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("KB Labs CLI - Project management and automation tool")
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Usage: kb [command] [options]")
      );
    });

    it("should handle --help flag in JSON mode", async () => {
      const exitCode = await run(["--help", "--json"]);

      expect(exitCode).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('{"ok":true,"help":{')
      );
    });

    it("should handle --version flag in text mode", async () => {
      const exitCode = await run(["--version"]);

      expect(exitCode).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringMatching(/^\d+\.\d+\.\d+$/)
      );
    });

    it("should handle --version flag in JSON mode", async () => {
      const exitCode = await run(["--version", "--json"]);

      expect(exitCode).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('{"ok":true,"version":')
      );
    });
  });

  describe("Error handling", () => {
    it("should handle unknown command with CMD_NOT_FOUND error in text mode", async () => {
      const exitCode = await run(["nope"]);

      expect(exitCode).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Unknown command: nope")
      );
    });

    it("should handle unknown command with CMD_NOT_FOUND error in JSON mode", async () => {
      const exitCode = await run(["nope", "--json"]);

      expect(exitCode).toBe(1);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('{"ok":false,"error":{"code":"CMD_NOT_FOUND"')
      );
    });
  });

  describe("Builtin commands", () => {
    describe("hello command", () => {
      it("should run hello command in text mode", async () => {
        const exitCode = await run(["hello"]);

        expect(exitCode).toBeUndefined(); // undefined means success (0)
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining("Hello, KB Labs!")
        );
      });

      it("should run hello command in JSON mode", async () => {
        const exitCode = await run(["hello", "--json"]);

        expect(exitCode).toBeUndefined(); // undefined means success (0)
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('{"ok":true,"message":"Hello, KB Labs!"}')
        );
      });
    });

    describe("version command", () => {
      it("should run version command in text mode", async () => {
        const exitCode = await run(["version"]);

        expect(exitCode).toBeUndefined(); // undefined means success (0)
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringMatching(/^\d+\.\d+\.\d+$/)
        );
      });

      it("should run version command in JSON mode", async () => {
        const exitCode = await run(["version", "--json"]);

        expect(exitCode).toBeUndefined(); // undefined means success (0)
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringMatching(/"ok":true,"message":"\d+\.\d+\.\d+"/)
        );
      });
    });

    describe("diagnose command", () => {
      it("should run diagnose command in text mode", async () => {
        const exitCode = await run(["diagnose"]);

        expect(exitCode).toBeUndefined(); // undefined means success (0)
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringMatching(/^node=v\d+\.\d+\.\d+$/)
        );
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringMatching(/^repoRoot=.+$/)
        );
      });

      it("should run diagnose command in JSON mode", async () => {
        const exitCode = await run(["diagnose", "--json"]);

        expect(exitCode).toBeUndefined(); // undefined means success (0)
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringMatching(/^\{.*"ok":true.*"message":"node=v\d+\.\d+\.\d+".*\}$/)
        );
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringMatching(/^\{.*"ok":true.*"message":"repoRoot=.+".*\}$/)
        );
      });
    });

    describe("init-profile command", () => {
      it("should run init-profile command in text mode", async () => {
        const exitCode = await run(["init.profile"]);

        expect(exitCode).toBeUndefined(); // undefined means success (0)
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining("Initialized profile: frontend (draft)")
        );
      });

      it("should run init-profile command in JSON mode", async () => {
        const exitCode = await run(["init.profile", "--json"]);

        expect(exitCode).toBeUndefined(); // undefined means success (0)
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('{"ok":true,"message":"Initialized profile: frontend (draft)"')
        );
      });
    });
  });
});
