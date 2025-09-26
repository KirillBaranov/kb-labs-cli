import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { envBool, envNumber, envString, readEnv } from "../env";
import { CliError, CLI_ERROR_CODES } from "@kb-labs/cli-core";

describe("Environment helpers additional tests", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("envBool", () => {
    it("should handle '1' as true", () => {
      process.env.TEST_BOOL = "1";
      expect(envBool("TEST_BOOL")).toBe(true);
    });

    it("should handle 'true' as true", () => {
      process.env.TEST_BOOL = "true";
      expect(envBool("TEST_BOOL")).toBe(true);
    });

    it("should handle 'TRUE' as true", () => {
      process.env.TEST_BOOL = "TRUE";
      expect(envBool("TEST_BOOL")).toBe(true);
    });

    it("should handle 'True' as true", () => {
      process.env.TEST_BOOL = "True";
      expect(envBool("TEST_BOOL")).toBe(true);
    });

    it("should handle other values as false", () => {
      process.env.TEST_BOOL = "false";
      expect(envBool("TEST_BOOL")).toBe(false);

      process.env.TEST_BOOL = "0";
      expect(envBool("TEST_BOOL")).toBe(false);

      process.env.TEST_BOOL = "yes";
      expect(envBool("TEST_BOOL")).toBe(false);
    });

    it("should handle null/undefined values", () => {
      delete process.env.TEST_BOOL;
      expect(envBool("TEST_BOOL")).toBe(false);

      process.env.TEST_BOOL = "";
      expect(envBool("TEST_BOOL")).toBe(false);
    });

    it("should use default value", () => {
      delete process.env.TEST_BOOL;
      expect(envBool("TEST_BOOL", true)).toBe(true);
      expect(envBool("TEST_BOOL", false)).toBe(false);
    });
  });

  describe("envNumber", () => {
    it("should parse valid numbers", () => {
      process.env.TEST_NUM = "42";
      expect(envNumber("TEST_NUM")).toBe(42);

      process.env.TEST_NUM = "3.14";
      expect(envNumber("TEST_NUM")).toBe(3.14);

      process.env.TEST_NUM = "-10";
      expect(envNumber("TEST_NUM")).toBe(-10);
    });

    it("should throw error for missing required variable", () => {
      delete process.env.TEST_NUM;

      expect(() => envNumber("TEST_NUM")).toThrow(CliError);

      try {
        envNumber("TEST_NUM");
      } catch (error) {
        expect(error).toBeInstanceOf(CliError);
        expect((error as CliError).code).toBe(CLI_ERROR_CODES.E_ENV_MISSING_VAR);
        expect((error as CliError).message).toContain("Required environment variable TEST_NUM is not set");
      }
    });

    it("should throw error for invalid number values", () => {
      process.env.TEST_NUM = "not-a-number";

      expect(() => envNumber("TEST_NUM")).toThrow(CliError);

      try {
        envNumber("TEST_NUM");
      } catch (error) {
        expect(error).toBeInstanceOf(CliError);
        expect((error as CliError).code).toBe(CLI_ERROR_CODES.E_ENV_MISSING_VAR);
        expect((error as CliError).message).toContain("Environment variable TEST_NUM has invalid number value");
      }
    });

    it("should use default value for missing variable", () => {
      delete process.env.TEST_NUM;
      expect(envNumber("TEST_NUM", 100)).toBe(100);
    });

    it("should use default value for invalid number", () => {
      process.env.TEST_NUM = "invalid";
      expect(envNumber("TEST_NUM", 200)).toBe(200);
    });

    it("should handle Infinity and NaN", () => {
      process.env.TEST_NUM = "Infinity";
      expect(() => envNumber("TEST_NUM")).toThrow(CliError);

      process.env.TEST_NUM = "NaN";
      expect(() => envNumber("TEST_NUM")).toThrow(CliError);
    });
  });

  describe("envString", () => {
    it("should return string values", () => {
      process.env.TEST_STR = "hello world";
      expect(envString("TEST_STR")).toBe("hello world");
    });

    it("should throw error for missing required variable", () => {
      delete process.env.TEST_STR;

      expect(() => envString("TEST_STR")).toThrow(CliError);

      try {
        envString("TEST_STR");
      } catch (error) {
        expect(error).toBeInstanceOf(CliError);
        expect((error as CliError).code).toBe(CLI_ERROR_CODES.E_ENV_MISSING_VAR);
        expect((error as CliError).message).toContain("Required environment variable TEST_STR is not set");
      }
    });

    it("should throw error for empty string", () => {
      process.env.TEST_STR = "";

      expect(() => envString("TEST_STR")).toThrow(CliError);
    });

    it("should use default value for missing variable", () => {
      delete process.env.TEST_STR;
      expect(envString("TEST_STR", "default")).toBe("default");
    });

    it("should use default value for empty string", () => {
      process.env.TEST_STR = "";
      expect(envString("TEST_STR", "default")).toBe("default");
    });
  });

  describe("readEnv", () => {
    it("should read all environment variables without prefix", () => {
      process.env.TEST_VAR1 = "value1";
      process.env.TEST_VAR2 = "value2";
      process.env.OTHER_VAR = "other";

      const result = readEnv();

      expect(result.TEST_VAR1).toBe("value1");
      expect(result.TEST_VAR2).toBe("value2");
      expect(result.OTHER_VAR).toBe("other");
    });

    it("should read only variables with prefix", () => {
      process.env.TEST_VAR1 = "value1";
      process.env.TEST_VAR2 = "value2";
      process.env.OTHER_VAR = "other";

      const result = readEnv("TEST_");

      expect(result.TEST_VAR1).toBe("value1");
      expect(result.TEST_VAR2).toBe("value2");
      expect(result.OTHER_VAR).toBeUndefined();
    });

    it("should handle empty prefix", () => {
      process.env.TEST_VAR = "value";

      const result = readEnv("");

      expect(result.TEST_VAR).toBe("value");
    });

    it("should filter out non-string values", () => {
      // Mock process.env to include non-string values
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        STRING_VAR: "string",
        // @ts-expect-error - testing non-string values
        NUMBER_VAR: 123,
        // @ts-expect-error - testing non-string values
        BOOLEAN_VAR: true,
      };

      const result = readEnv();

      expect(result.STRING_VAR).toBe("string");
      expect(result.NUMBER_VAR).toBeUndefined();
      expect(result.BOOLEAN_VAR).toBeUndefined();

      // Restore original env
      process.env = originalEnv;
    });
  });
});
