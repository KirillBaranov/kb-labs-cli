import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTextPresenter } from "../text";

describe("TextPresenter", () => {
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let consoleWarnSpy: any;
  let originalIsTTY: boolean;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => { });
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => { });
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => { });
    originalIsTTY = process.stdout.isTTY;
  });

  afterEach(() => {
    consoleLogSpy?.mockRestore();
    consoleErrorSpy?.mockRestore();
    consoleWarnSpy?.mockRestore();
    process.stdout.isTTY = originalIsTTY;
  });

  describe("createTextPresenter", () => {
    it("should create presenter with TTY detection", () => {
      process.stdout.isTTY = true;
      const presenter = createTextPresenter();

      expect(presenter.isTTY).toBe(true);
    });

    it("should create presenter with non-TTY detection", () => {
      process.stdout.isTTY = false;
      const presenter = createTextPresenter();

      expect(presenter.isTTY).toBe(false);
    });

    it("should have isJSON set to false", () => {
      const presenter = createTextPresenter();
      expect(presenter.isJSON).toBe(false);
    });

    it("should write to console.log", () => {
      const presenter = createTextPresenter();
      presenter.write("Hello, world!");

      expect(consoleLogSpy).toHaveBeenCalledWith("Hello, world!");
    });

    it("should write errors to console.error", () => {
      const presenter = createTextPresenter();
      presenter.error("Error message");

      expect(consoleErrorSpy).toHaveBeenCalledWith("Error message");
    });

    it("should write warnings to console.warn", () => {
      const presenter = createTextPresenter();
      presenter.warn("Warning message");

      expect(consoleWarnSpy).toHaveBeenCalledWith("Warning message");
    });

    it("should not write warnings when quiet", () => {
      const presenter = createTextPresenter(true);
      presenter.warn("Warning message");

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it("should throw error when json() is called in text mode", () => {
      const presenter = createTextPresenter();
      const payload = { message: "Hello", count: 42 };

      expect(() => presenter.json(payload)).toThrow("json() called in text mode");
    });

    it("should throw error for complex JSON payloads in text mode", () => {
      const presenter = createTextPresenter();
      const payload = {
        ok: true,
        data: {
          users: [{ id: 1, name: "John" }]
        }
      };

      expect(() => presenter.json(payload)).toThrow("json() called in text mode");
    });
  });
});
