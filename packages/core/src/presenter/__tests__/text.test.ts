import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTextPresenter } from "../text";

describe("TextPresenter", () => {
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let originalIsTTY: boolean;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => { });
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => { });
    originalIsTTY = process.stdout.isTTY;
  });

  afterEach(() => {
    consoleLogSpy?.mockRestore();
    consoleErrorSpy?.mockRestore();
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

    it("should write JSON to console.log", () => {
      const presenter = createTextPresenter();
      const payload = { message: "Hello", count: 42 };
      presenter.json(payload);

      expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify(payload));
    });

    it("should handle complex JSON payloads", () => {
      const presenter = createTextPresenter();
      const payload = {
        ok: true,
        data: {
          users: [{ id: 1, name: "John" }]
        }
      };
      presenter.json(payload);

      expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify(payload));
    });
  });
});
