import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { run } from "../src/index.js";

describe("CLI Smoke Tests", () => {
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let originalArgv: string[];

  beforeEach(() => {
    originalArgv = [...process.argv];
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.argv = originalArgv;
    consoleLogSpy?.mockRestore();
    consoleErrorSpy?.mockRestore();
  });

  it("should handle unknown command with CMD_NOT_FOUND error", async () => {
    process.argv = ["node", "cli", "nope", "--json"];

    const exitCode = await run(["nope", "--json"]);

    expect(exitCode).toBe(1);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('{"ok":false,"error":{"code":"CMD_NOT_FOUND"'),
    );
  });

  it("should run hello command successfully", async () => {
    process.argv = ["node", "cli", "hello", "--json"];

    const exitCode = await run(["hello", "--json"]);

    expect(exitCode).toBeUndefined(); // undefined means success (0)
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('{"ok":true,"message":"Hello, KB Labs!"}'),
    );
  });

  it("should run version command successfully", async () => {
    process.argv = ["node", "cli", "version", "--json"];

    const exitCode = await run(["version", "--json"]);

    expect(exitCode).toBeUndefined(); // undefined means success (0)
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringMatching(/"ok":true,"message":"\d+\.\d+\.\d+"/),
    );
  });
});
