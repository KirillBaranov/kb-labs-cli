import { describe, it, expect } from "vitest";
import { createContext } from "../context";
import { createTextPresenter } from "../presenter/text";

describe("Context simple tests", () => {
  describe("createContext", () => {
    it("should create context with basic properties", async () => {
      const presenter = createTextPresenter();
      const context = await createContext({ presenter });

      expect(context).toHaveProperty("presenter");
      expect(context).toHaveProperty("env");
      expect(context).toHaveProperty("config");
      expect(context.presenter).toBe(presenter);
      expect(context.env).toBe(process.env);
      expect(context.config).toEqual({});
    });

    it("should include logger when provided", async () => {
      const presenter = createTextPresenter();
      const logger = {
        info: () => { },
        warn: () => { },
        error: () => { },
        debug: () => { },
      };

      const context = await createContext({ presenter, logger });

      expect(context.logger).toBe(logger);
    });

    it("should detect repo root", async () => {
      const presenter = createTextPresenter();
      const context = await createContext({ presenter });

      expect(context.repoRoot).toBeDefined();
      expect(typeof context.repoRoot).toBe("string");
    });

    it("should honour provided env and cwd overrides", async () => {
      const presenter = createTextPresenter();
      const customEnv = { TEST_FLAG: "1" } as NodeJS.ProcessEnv;
      const cwd = process.cwd();
      const context = await createContext({ presenter, env: customEnv, cwd });

      expect(context.env).toBe(customEnv);
      expect(context.cwd).toBe(cwd);
      expect(context.repoRoot).toBeDefined();
    });
  });
});
