import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { version } from "../index";
import { createTextPresenter, createJsonPresenter } from "@kb-labs/cli-core";

describe("version command", () => {
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => { });
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => { });
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    consoleLogSpy?.mockRestore();
    consoleErrorSpy?.mockRestore();
    process.env = originalEnv;
  });

  describe("command structure", () => {
    it("should have correct name and description", () => {
      expect(version.name).toBe("version");
      expect(version.describe).toBe("Show CLI version");
    });

    it("should have run function", () => {
      expect(typeof version.run).toBe("function");
    });
  });

  describe("run function", () => {
    it("should show version from cliVersion context", () => {
      const presenter = createTextPresenter();
      const ctx = {
        presenter,
        cliVersion: "1.2.3",
        env: {},
      };

      version.run(ctx, [], {});

      expect(consoleLogSpy).toHaveBeenCalledWith("1.2.3");
    });

    it("should show version from CLI_VERSION env var", () => {
      process.env.CLI_VERSION = "2.0.0";

      const presenter = createTextPresenter();
      const ctx = {
        presenter,
        env: process.env,
      };

      version.run(ctx, [], {});

      expect(consoleLogSpy).toHaveBeenCalledWith("2.0.0");
    });

    it("should prioritize cliVersion over env var", () => {
      process.env.CLI_VERSION = "2.0.0";

      const presenter = createTextPresenter();
      const ctx = {
        presenter,
        cliVersion: "1.5.0",
        env: process.env,
      };

      version.run(ctx, [], {});

      expect(consoleLogSpy).toHaveBeenCalledWith("1.5.0");
    });

    it("should fallback to default version", () => {
      const presenter = createTextPresenter();
      const ctx = {
        presenter,
        env: {},
      };

      version.run(ctx, [], {});

      expect(consoleLogSpy).toHaveBeenCalledWith("0.0.0");
    });

    it("should work with JSON presenter", () => {
      const presenter = createJsonPresenter();
      const ctx = {
        presenter,
        cliVersion: "1.2.3",
        env: {},
      };

      version.run(ctx, [], {});

      expect(consoleLogSpy).toHaveBeenCalledWith(
        JSON.stringify({ ok: true, message: "1.2.3" })
      );
    });

    it("should handle undefined cliVersion", () => {
      const presenter = createTextPresenter();
      const ctx = {
        presenter,
        cliVersion: undefined,
        env: {},
      };

      version.run(ctx, [], {});

      expect(consoleLogSpy).toHaveBeenCalledWith("0.0.0");
    });

    it("should handle null cliVersion", () => {
      const presenter = createTextPresenter();
      const ctx = {
        presenter,
        cliVersion: null,
        env: {},
      };

      version.run(ctx, [], {});

      expect(consoleLogSpy).toHaveBeenCalledWith("0.0.0");
    });
  });
});
