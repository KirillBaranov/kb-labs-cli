import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createFileTelemetrySink } from "../file-sink";
import { CliError, CLI_ERROR_CODES } from "@kb-labs/cli-core";

// Mock fs and path modules
vi.mock("node:fs", () => ({
  promises: {
    mkdir: vi.fn(),
    appendFile: vi.fn(),
  },
}));

vi.mock("node:path", () => ({
  default: {
    join: vi.fn(),
    dirname: vi.fn(),
  },
}));

describe("createFileTelemetrySink", () => {
  let mockFsp: any;
  let mockPath: any;

  beforeEach(async () => {
    const fsModule = await import("node:fs");
    const pathModule = await import("node:path");
    mockFsp = vi.mocked(fsModule).promises;
    mockPath = vi.mocked(pathModule).default;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("sink creation", () => {
    it("should create sink with .jsonl file path", () => {
      mockPath.join.mockReturnValue("/tmp/cli-telemetry.jsonl");
      mockPath.dirname.mockReturnValue("/tmp");

      const sink = createFileTelemetrySink("/tmp/telemetry.jsonl");

      expect(sink).toBeDefined();
      expect(typeof sink.emit).toBe("function");
    });

    it("should create sink with directory path", () => {
      mockPath.join.mockReturnValue("/tmp/cli-telemetry.jsonl");
      mockPath.dirname.mockReturnValue("/tmp");

      const sink = createFileTelemetrySink("/tmp");

      expect(sink).toBeDefined();
      expect(typeof sink.emit).toBe("function");
      expect(mockPath.join).toHaveBeenCalledWith("/tmp", "cli-telemetry.jsonl");
    });
  });

  describe("emit", () => {
    it("should emit telemetry event successfully", async () => {
      mockPath.join.mockReturnValue("/tmp/cli-telemetry.jsonl");
      mockPath.dirname.mockReturnValue("/tmp");
      mockFsp.mkdir.mockResolvedValue(undefined);
      mockFsp.appendFile.mockResolvedValue(undefined);

      const sink = createFileTelemetrySink("/tmp");
      const event = {
        ts: new Date().toISOString(),
        name: "hello",
        props: { success: true },
      };

      await sink.emit(event);

      expect(mockFsp.mkdir).toHaveBeenCalledWith("/tmp", { recursive: true });
      expect(mockFsp.appendFile).toHaveBeenCalledWith(
        "/tmp/cli-telemetry.jsonl",
        JSON.stringify(event) + "\n",
        "utf8"
      );
    });

    it("should create directory recursively", async () => {
      mockPath.join.mockReturnValue("/nested/path/cli-telemetry.jsonl");
      mockPath.dirname.mockReturnValue("/nested/path");
      mockFsp.mkdir.mockResolvedValue(undefined);
      mockFsp.appendFile.mockResolvedValue(undefined);

      const sink = createFileTelemetrySink("/nested/path");
      const event = { ts: new Date().toISOString(), name: "test" };

      await sink.emit(event);

      expect(mockFsp.mkdir).toHaveBeenCalledWith("/nested/path", { recursive: true });
    });

    it("should handle complex telemetry events", async () => {
      mockPath.join.mockReturnValue("/tmp/cli-telemetry.jsonl");
      mockPath.dirname.mockReturnValue("/tmp");
      mockFsp.mkdir.mockResolvedValue(undefined);
      mockFsp.appendFile.mockResolvedValue(undefined);

      const sink = createFileTelemetrySink("/tmp");
      const event = {
        ts: new Date(1234567890).toISOString(),
        name: "diagnose",
        props: {
          duration: 150,
          success: true,
          metadata: {
            nodeVersion: "18.0.0",
            platform: "linux",
          },
        },
      };

      await sink.emit(event);

      expect(mockFsp.appendFile).toHaveBeenCalledWith(
        "/tmp/cli-telemetry.jsonl",
        JSON.stringify(event) + "\n",
        "utf8"
      );
    });

    it("should throw CliError on mkdir failure", async () => {
      mockPath.join.mockReturnValue("/tmp/cli-telemetry.jsonl");
      mockPath.dirname.mockReturnValue("/tmp");
      const mkdirError = new Error("Permission denied");
      mockFsp.mkdir.mockRejectedValue(mkdirError);

      const sink = createFileTelemetrySink("/tmp");
      const event = { ts: new Date().toISOString(), name: "test" };

      await expect(sink.emit(event)).rejects.toThrow(CliError);

      try {
        await sink.emit(event);
      } catch (error) {
        expect(error).toBeInstanceOf(CliError);
        expect((error as CliError).code).toBe(CLI_ERROR_CODES.E_TELEMETRY_EMIT);
        expect((error as CliError).message).toBe("Failed to emit telemetry to /tmp/cli-telemetry.jsonl");
        expect((error as CliError).details).toBe(mkdirError);
      }
    });

    it("should throw CliError on appendFile failure", async () => {
      mockPath.join.mockReturnValue("/tmp/cli-telemetry.jsonl");
      mockPath.dirname.mockReturnValue("/tmp");
      mockFsp.mkdir.mockResolvedValue(undefined);
      const appendError = new Error("Disk full");
      mockFsp.appendFile.mockRejectedValue(appendError);

      const sink = createFileTelemetrySink("/tmp");
      const event = { ts: new Date().toISOString(), name: "test" };

      await expect(sink.emit(event)).rejects.toThrow(CliError);

      try {
        await sink.emit(event);
      } catch (error) {
        expect(error).toBeInstanceOf(CliError);
        expect((error as CliError).code).toBe(CLI_ERROR_CODES.E_TELEMETRY_EMIT);
        expect((error as CliError).message).toBe("Failed to emit telemetry to /tmp/cli-telemetry.jsonl");
        expect((error as CliError).details).toBe(appendError);
      }
    });

    it("should handle empty telemetry events", async () => {
      mockPath.join.mockReturnValue("/tmp/cli-telemetry.jsonl");
      mockPath.dirname.mockReturnValue("/tmp");
      mockFsp.mkdir.mockResolvedValue(undefined);
      mockFsp.appendFile.mockResolvedValue(undefined);

      const sink = createFileTelemetrySink("/tmp");
      const event = { ts: new Date().toISOString(), name: "empty" };

      await sink.emit(event);

      expect(mockFsp.appendFile).toHaveBeenCalledWith(
        "/tmp/cli-telemetry.jsonl",
        JSON.stringify(event) + "\n",
        "utf8"
      );
    });
  });
});
