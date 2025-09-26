import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { diagnose } from "../index";
import { createTextPresenter, createJsonPresenter } from "@kb-labs/cli-core";

describe("diagnose command", () => {
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let originalCwd: string;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => { });
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => { });
    originalCwd = process.cwd();
    vi.spyOn(process, "cwd").mockReturnValue("/test/workspace");
  });

  afterEach(() => {
    consoleLogSpy?.mockRestore();
    consoleErrorSpy?.mockRestore();
    vi.spyOn(process, "cwd").mockReturnValue(originalCwd);
  });

  describe("command structure", () => {
    it("should have correct name and description", () => {
      expect(diagnose.name).toBe("diagnose");
      expect(diagnose.describe).toBe("Quick environment & repo diagnosis");
    });

    it("should have run function", () => {
      expect(typeof diagnose.run).toBe("function");
    });
  });

  describe("run function", () => {
    it("should output node version and repo root", async () => {
      const presenter = createTextPresenter();
      const ctx = {
        presenter,
        repoRoot: "/custom/repo",
        env: {},
      };

      await diagnose.run(ctx, [], {});

      expect(consoleLogSpy).toHaveBeenCalledWith(`node=${process.version}`);
      expect(consoleLogSpy).toHaveBeenCalledWith("repoRoot=/custom/repo");
    });

    it("should use process.cwd() when repoRoot is not provided", async () => {
      const presenter = createTextPresenter();
      const ctx = {
        presenter,
        env: {},
      };

      await diagnose.run(ctx, [], {});

      expect(consoleLogSpy).toHaveBeenCalledWith(`node=${process.version}`);
      expect(consoleLogSpy).toHaveBeenCalledWith("repoRoot=/test/workspace");
    });

    it("should use process.cwd() when repoRoot is undefined", async () => {
      const presenter = createTextPresenter();
      const ctx = {
        presenter,
        repoRoot: undefined,
        env: {},
      };

      await diagnose.run(ctx, [], {});

      expect(consoleLogSpy).toHaveBeenCalledWith(`node=${process.version}`);
      expect(consoleLogSpy).toHaveBeenCalledWith("repoRoot=/test/workspace");
    });

    it("should call logger.info when logger is provided", async () => {
      const presenter = createTextPresenter();
      const logger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      };
      const ctx = {
        presenter,
        logger,
        env: {},
      };

      await diagnose.run(ctx, [], {});

      expect(logger.info).toHaveBeenCalledWith("[diagnose] ok");
    });

    it("should not call logger when logger is not provided", async () => {
      const presenter = createTextPresenter();
      const ctx = {
        presenter,
        env: {},
      };

      await diagnose.run(ctx, [], {});

      expect(consoleLogSpy).toHaveBeenCalledWith(`node=${process.version}`);
      expect(consoleLogSpy).toHaveBeenCalledWith("repoRoot=/test/workspace");
    });

    it("should not call logger.info when logger.info is not available", async () => {
      const presenter = createTextPresenter();
      const logger = {
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      };
      const ctx = {
        presenter,
        logger,
        env: {},
      };

      await diagnose.run(ctx, [], {});

      expect(consoleLogSpy).toHaveBeenCalledWith(`node=${process.version}`);
      expect(consoleLogSpy).toHaveBeenCalledWith("repoRoot=/test/workspace");
    });

    it("should work with JSON presenter", async () => {
      const presenter = createJsonPresenter();
      const ctx = {
        presenter,
        repoRoot: "/custom/repo",
        env: {},
      };

      await diagnose.run(ctx, [], {});

      expect(consoleLogSpy).toHaveBeenCalledWith(
        JSON.stringify({ ok: true, message: `node=${process.version}` })
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        JSON.stringify({ ok: true, message: "repoRoot=/custom/repo" })
      );
    });
  });
});
