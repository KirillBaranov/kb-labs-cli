import { describe, it, expect } from "vitest";
import {
  CLI_ERROR_CODES,
  EXIT_CODES,
  mapCliErrorToExitCode,
  CliError,
  isCliError,
  serializeCliError,
} from "../errors";

describe("CLI Errors", () => {
  describe("CLI_ERROR_CODES", () => {
    it("should contain expected error codes", () => {
      expect(CLI_ERROR_CODES.E_IO_READ).toBe("E_IO_READ");
      expect(CLI_ERROR_CODES.E_IO_WRITE).toBe("E_IO_WRITE");
      expect(CLI_ERROR_CODES.E_ENV_MISSING_VAR).toBe("E_ENV_MISSING_VAR");
      expect(CLI_ERROR_CODES.E_DISCOVERY_CONFIG).toBe("E_DISCOVERY_CONFIG");
      expect(CLI_ERROR_CODES.E_TELEMETRY_EMIT).toBe("E_TELEMETRY_EMIT");
    });
  });

  describe("EXIT_CODES", () => {
    it("should contain expected exit codes", () => {
      expect(EXIT_CODES.GENERIC).toBe(1);
      expect(EXIT_CODES.IO).toBe(74);
      expect(EXIT_CODES.SOFTWARE).toBe(70);
      expect(EXIT_CODES.CONFIG).toBe(78);
    });
  });

  describe("mapCliErrorToExitCode", () => {
    it("should map config errors to CONFIG exit code", () => {
      expect(mapCliErrorToExitCode(CLI_ERROR_CODES.E_DISCOVERY_CONFIG)).toBe(EXIT_CODES.CONFIG);
      expect(mapCliErrorToExitCode(CLI_ERROR_CODES.E_ENV_MISSING_VAR)).toBe(EXIT_CODES.CONFIG);
    });

    it("should map IO errors to IO exit code", () => {
      expect(mapCliErrorToExitCode(CLI_ERROR_CODES.E_IO_READ)).toBe(EXIT_CODES.IO);
      expect(mapCliErrorToExitCode(CLI_ERROR_CODES.E_IO_WRITE)).toBe(EXIT_CODES.IO);
    });

    it("should map telemetry errors to SOFTWARE exit code", () => {
      expect(mapCliErrorToExitCode(CLI_ERROR_CODES.E_TELEMETRY_EMIT)).toBe(EXIT_CODES.SOFTWARE);
    });

    it("should map unknown errors to GENERIC exit code", () => {
      // @ts-expect-error - testing unknown error code
      expect(mapCliErrorToExitCode("UNKNOWN_ERROR")).toBe(EXIT_CODES.GENERIC);
    });
  });

  describe("CliError", () => {
    it("should create error with code and message", () => {
      const error = new CliError(CLI_ERROR_CODES.E_IO_READ, "File not found");

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(CliError);
      expect(error.name).toBe("CliError");
      expect(error.code).toBe(CLI_ERROR_CODES.E_IO_READ);
      expect(error.message).toBe("File not found");
      expect(error.details).toBeUndefined();
    });

    it("should create error with details", () => {
      const details = { path: "/tmp/file.txt" };
      const error = new CliError(CLI_ERROR_CODES.E_IO_READ, "File not found", details);

      expect(error.details).toBe(details);
    });

    it("should preserve stack trace", () => {
      const error = new CliError(CLI_ERROR_CODES.E_IO_READ, "File not found");

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain("CliError");
    });
  });

  describe("isCliError", () => {
    it("should return true for CliError instances", () => {
      const error = new CliError(CLI_ERROR_CODES.E_IO_READ, "File not found");

      expect(isCliError(error)).toBe(true);
    });

    it("should return true for objects with valid error codes", () => {
      const error = { code: CLI_ERROR_CODES.E_IO_READ, message: "File not found" };

      expect(isCliError(error)).toBe(true);
    });

    it("should return false for objects with invalid error codes", () => {
      const error = { code: "INVALID_CODE", message: "File not found" };

      expect(isCliError(error)).toBe(false);
    });

    it("should return false for non-objects", () => {
      expect(isCliError(null)).toBe(false);
      expect(isCliError(undefined)).toBe(false);
      expect(isCliError("string")).toBe(false);
      expect(isCliError(123)).toBe(false);
    });

    it("should return false for objects without code", () => {
      const error = { message: "File not found" };

      expect(isCliError(error)).toBe(false);
    });
  });

  describe("serializeCliError", () => {
    it("should serialize CliError without stack", () => {
      const error = new CliError(CLI_ERROR_CODES.E_IO_READ, "File not found", { path: "/tmp" });
      const serialized = serializeCliError(error);

      expect(serialized).toEqual({
        name: "CliError",
        message: "File not found",
        code: CLI_ERROR_CODES.E_IO_READ,
        details: { path: "/tmp" },
      });
    });

    it("should serialize CliError with stack", () => {
      const error = new CliError(CLI_ERROR_CODES.E_IO_READ, "File not found");
      const serialized = serializeCliError(error, { includeStack: true });

      expect(serialized.name).toBe("CliError");
      expect(serialized.message).toBe("File not found");
      expect(serialized.code).toBe(CLI_ERROR_CODES.E_IO_READ);
      expect(serialized.stack).toBeDefined();
    });

    it("should serialize regular Error", () => {
      const error = new Error("Regular error");
      const serialized = serializeCliError(error);

      expect(serialized).toEqual({
        name: "Error",
        message: "Regular error",
      });
    });

    it("should serialize Error with stack", () => {
      const error = new Error("Regular error");
      const serialized = serializeCliError(error, { includeStack: true });

      expect(serialized.name).toBe("Error");
      expect(serialized.message).toBe("Regular error");
      expect(serialized.stack).toBeDefined();
    });

    it("should serialize non-Error objects", () => {
      const serialized = serializeCliError("string error");

      expect(serialized).toEqual({
        name: "Error",
        message: "string error",
      });
    });

    it("should handle null/undefined", () => {
      expect(serializeCliError(null)).toEqual({
        name: "Error",
        message: "null",
      });

      expect(serializeCliError(undefined)).toEqual({
        name: "Error",
        message: "undefined",
      });
    });
  });
});
