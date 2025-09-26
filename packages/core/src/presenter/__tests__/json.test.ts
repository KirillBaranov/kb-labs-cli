import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createJsonPresenter } from "../json";

describe("JsonPresenter", () => {
  let consoleLogSpy: any;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => { });
  });

  afterEach(() => {
    consoleLogSpy?.mockRestore();
  });

  describe("createJsonPresenter", () => {
    it("should create presenter with isTTY false", () => {
      const presenter = createJsonPresenter();

      expect(presenter.isTTY).toBe(false);
    });

    it("should write messages as JSON with ok: true", () => {
      const presenter = createJsonPresenter();
      presenter.write("Hello, world!");

      expect(consoleLogSpy).toHaveBeenCalledWith(
        JSON.stringify({ ok: true, message: "Hello, world!" })
      );
    });

    it("should write errors as JSON with ok: false", () => {
      const presenter = createJsonPresenter();
      presenter.error("Error message");

      expect(consoleLogSpy).toHaveBeenCalledWith(
        JSON.stringify({ ok: false, error: { message: "Error message" } })
      );
    });

    it("should write JSON payloads directly", () => {
      const presenter = createJsonPresenter();
      const payload = { message: "Hello", count: 42 };
      presenter.json(payload);

      expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify(payload));
    });

    it("should handle complex JSON payloads", () => {
      const presenter = createJsonPresenter();
      const payload = {
        ok: true,
        data: {
          users: [{ id: 1, name: "John" }]
        }
      };
      presenter.json(payload);

      expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify(payload));
    });

    it("should handle empty messages", () => {
      const presenter = createJsonPresenter();
      presenter.write("");

      expect(consoleLogSpy).toHaveBeenCalledWith(
        JSON.stringify({ ok: true, message: "" })
      );
    });

    it("should handle empty error messages", () => {
      const presenter = createJsonPresenter();
      presenter.error("");

      expect(consoleLogSpy).toHaveBeenCalledWith(
        JSON.stringify({ ok: false, error: { message: "" } })
      );
    });
  });
});
