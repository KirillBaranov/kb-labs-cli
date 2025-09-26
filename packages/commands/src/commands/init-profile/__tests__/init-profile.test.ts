import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { initProfile } from "../index";
import { createTextPresenter, createJsonPresenter } from "@kb-labs/cli-core";

describe("init-profile command", () => {
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
      expect(initProfile.name).toBe("init.profile");
      expect(initProfile.describe).toBe("Scaffold a profile (draft)");
    });

    it("should have run function", () => {
      expect(typeof initProfile.run).toBe("function");
    });
  });

  describe("run function", () => {
    it("should initialize profile with default name", async () => {
      const presenter = createTextPresenter();
      const ctx = {
        presenter,
        env: {},
      };

      await initProfile.run(ctx, [], {});

      expect(consoleLogSpy).toHaveBeenCalledWith("Initialized profile: frontend (draft)");
    });

    it("should initialize profile with custom name", async () => {
      const presenter = createTextPresenter();
      const ctx = {
        presenter,
        env: {},
      };

      await initProfile.run(ctx, ["backend"], {});

      expect(consoleLogSpy).toHaveBeenCalledWith("Initialized profile: backend (draft)");
    });

    it("should initialize profile with complex name", async () => {
      const presenter = createTextPresenter();
      const ctx = {
        presenter,
        env: {},
      };

      await initProfile.run(ctx, ["my-custom-profile"], {});

      expect(consoleLogSpy).toHaveBeenCalledWith("Initialized profile: my-custom-profile (draft)");
    });

    it("should handle empty string name", async () => {
      const presenter = createTextPresenter();
      const ctx = {
        presenter,
        env: {},
      };

      await initProfile.run(ctx, [""], {});

      expect(consoleLogSpy).toHaveBeenCalledWith("Initialized profile:  (draft)");
    });

    it("should work with JSON presenter", async () => {
      const presenter = createJsonPresenter();
      const ctx = {
        presenter,
        env: {},
      };

      await initProfile.run(ctx, ["api"], {});

      expect(consoleLogSpy).toHaveBeenCalledWith(
        JSON.stringify({ ok: true, message: "Initialized profile: api (draft)" })
      );
    });

    it("should handle multiple arguments (uses first one)", async () => {
      const presenter = createTextPresenter();
      const ctx = {
        presenter,
        env: {},
      };

      await initProfile.run(ctx, ["first", "second", "third"], {});

      expect(consoleLogSpy).toHaveBeenCalledWith("Initialized profile: first (draft)");
    });

    it("should handle undefined argv", async () => {
      const presenter = createTextPresenter();
      const ctx = {
        presenter,
        env: {},
      };

      await initProfile.run(ctx, undefined as any, {});

      expect(consoleLogSpy).toHaveBeenCalledWith("Initialized profile: frontend (draft)");
    });
  });
});
