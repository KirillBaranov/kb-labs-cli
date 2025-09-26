import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { hello } from "../hello";
import { createTextPresenter, createJsonPresenter } from "@kb-labs/cli-core";

describe("hello command", () => {
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => { });
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => { });
  });

  afterEach(() => {
    consoleLogSpy?.mockRestore();
    consoleErrorSpy?.mockRestore();
  });

  describe("command structure", () => {
    it("should have correct name and description", () => {
      expect(hello.name).toBe("hello");
      expect(hello.describe).toBe("Print a friendly greeting");
    });

    it("should have run function", () => {
      expect(typeof hello.run).toBe("function");
    });
  });

  describe("run function", () => {
    it("should print greeting with default user", async () => {
      const presenter = createTextPresenter();
      const ctx = {
        presenter,
        env: {},
      };

      await hello.run(ctx, [], {});

      expect(consoleLogSpy).toHaveBeenCalledWith("Hello, KB Labs!");
    });

    it("should print greeting with custom user from context", async () => {
      const presenter = createTextPresenter();
      const ctx = {
        presenter,
        user: "John",
        env: {},
      };

      await hello.run(ctx, [], {});

      expect(consoleLogSpy).toHaveBeenCalledWith("Hello, John!");
    });

    it("should handle undefined user gracefully", async () => {
      const presenter = createTextPresenter();
      const ctx = {
        presenter,
        user: undefined,
        env: {},
      };

      await hello.run(ctx, [], {});

      expect(consoleLogSpy).toHaveBeenCalledWith("Hello, KB Labs!");
    });

    it("should work with JSON presenter", async () => {
      const presenter = createJsonPresenter();
      const ctx = {
        presenter,
        env: {},
      };

      await hello.run(ctx, [], {});

      expect(consoleLogSpy).toHaveBeenCalledWith(
        JSON.stringify({ ok: true, message: "Hello, KB Labs!" })
      );
    });

    it("should work with JSON presenter and custom user", async () => {
      const presenter = createJsonPresenter();
      const ctx = {
        presenter,
        user: "Alice",
        env: {},
      };

      await hello.run(ctx, [], {});

      expect(consoleLogSpy).toHaveBeenCalledWith(
        JSON.stringify({ ok: true, message: "Hello, Alice!" })
      );
    });
  });
});
