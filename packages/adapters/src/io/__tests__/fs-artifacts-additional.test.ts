import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ensureDir, writeText, writeJson } from "../fs-artifacts";
import { CliError, CLI_ERROR_CODES } from "@kb-labs/cli-core";

// Mock fs and path modules
vi.mock("node:fs", () => ({
  promises: {
    mkdir: vi.fn(),
    writeFile: vi.fn(),
  },
}));

vi.mock("node:path", () => ({
  default: {
    dirname: vi.fn(),
  },
}));

describe("FS Artifacts additional tests", () => {
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

  describe("ensureDir", () => {
    it("should handle mkdir errors", async () => {
      const mkdirError = new Error("Permission denied");
      mockFsp.mkdir.mockRejectedValue(mkdirError);

      await expect(ensureDir("/test/dir")).rejects.toThrow(CliError);

      try {
        await ensureDir("/test/dir");
      } catch (error) {
        expect(error).toBeInstanceOf(CliError);
        expect((error as CliError).code).toBe(CLI_ERROR_CODES.E_IO_WRITE);
        expect((error as CliError).message).toBe("Failed to create directory /test/dir");
        expect((error as CliError).details).toBe(mkdirError);
      }
    });

    it("should create directory successfully", async () => {
      mockFsp.mkdir.mockResolvedValue(undefined);

      await expect(ensureDir("/test/dir")).resolves.toBeUndefined();
      expect(mockFsp.mkdir).toHaveBeenCalledWith("/test/dir", { recursive: true });
    });
  });

  describe("writeText", () => {
    it("should handle writeFile errors", async () => {
      mockPath.dirname.mockReturnValue("/test");
      mockFsp.mkdir.mockResolvedValue(undefined);
      const writeError = new Error("Disk full");
      mockFsp.writeFile.mockRejectedValue(writeError);

      await expect(writeText("/test/file.txt", "content")).rejects.toThrow(CliError);

      try {
        await writeText("/test/file.txt", "content");
      } catch (error) {
        expect(error).toBeInstanceOf(CliError);
        expect((error as CliError).code).toBe(CLI_ERROR_CODES.E_IO_WRITE);
        expect((error as CliError).message).toBe("Failed to write file /test/file.txt");
        expect((error as CliError).details).toBe(writeError);
      }
    });

    it("should write text file successfully", async () => {
      mockPath.dirname.mockReturnValue("/test");
      mockFsp.mkdir.mockResolvedValue(undefined);
      mockFsp.writeFile.mockResolvedValue(undefined);

      await expect(writeText("/test/file.txt", "hello world")).resolves.toBeUndefined();

      expect(mockPath.dirname).toHaveBeenCalledWith("/test/file.txt");
      expect(mockFsp.mkdir).toHaveBeenCalledWith("/test", { recursive: true });
      expect(mockFsp.writeFile).toHaveBeenCalledWith("/test/file.txt", "hello world", "utf8");
    });

    it("should handle empty content", async () => {
      mockPath.dirname.mockReturnValue("/test");
      mockFsp.mkdir.mockResolvedValue(undefined);
      mockFsp.writeFile.mockResolvedValue(undefined);

      await expect(writeText("/test/empty.txt", "")).resolves.toBeUndefined();
      expect(mockFsp.writeFile).toHaveBeenCalledWith("/test/empty.txt", "", "utf8");
    });
  });

  describe("writeJson", () => {
    it("should handle writeFile errors", async () => {
      mockPath.dirname.mockReturnValue("/test");
      mockFsp.mkdir.mockResolvedValue(undefined);
      const writeError = new Error("Disk full");
      mockFsp.writeFile.mockRejectedValue(writeError);

      await expect(writeJson("/test/data.json", { key: "value" })).rejects.toThrow(CliError);

      try {
        await writeJson("/test/data.json", { key: "value" });
      } catch (error) {
        expect(error).toBeInstanceOf(CliError);
        expect((error as CliError).code).toBe(CLI_ERROR_CODES.E_IO_WRITE);
        expect((error as CliError).message).toBe("Failed to write JSON file /test/data.json");
        expect((error as CliError).details).toBe(writeError);
      }
    });

    it("should write JSON file successfully", async () => {
      mockPath.dirname.mockReturnValue("/test");
      mockFsp.mkdir.mockResolvedValue(undefined);
      mockFsp.writeFile.mockResolvedValue(undefined);

      const data = { name: "test", count: 42 };
      await expect(writeJson("/test/data.json", data)).resolves.toBeUndefined();

      expect(mockPath.dirname).toHaveBeenCalledWith("/test/data.json");
      expect(mockFsp.mkdir).toHaveBeenCalledWith("/test", { recursive: true });
      expect(mockFsp.writeFile).toHaveBeenCalledWith(
        "/test/data.json",
        JSON.stringify(data, null, 2),
        "utf8"
      );
    });

    it("should handle complex JSON data", async () => {
      mockPath.dirname.mockReturnValue("/test");
      mockFsp.mkdir.mockResolvedValue(undefined);
      mockFsp.writeFile.mockResolvedValue(undefined);

      const data = {
        users: [
          { id: 1, name: "John" },
          { id: 2, name: "Jane" }
        ],
        metadata: {
          created: "2023-01-01",
          version: "1.0.0"
        }
      };

      await expect(writeJson("/test/complex.json", data)).resolves.toBeUndefined();

      const expectedJson = JSON.stringify(data, null, 2);
      expect(mockFsp.writeFile).toHaveBeenCalledWith("/test/complex.json", expectedJson, "utf8");
    });

    it("should handle null and undefined values", async () => {
      mockPath.dirname.mockReturnValue("/test");
      mockFsp.mkdir.mockResolvedValue(undefined);
      mockFsp.writeFile.mockResolvedValue(undefined);

      await expect(writeJson("/test/null.json", null)).resolves.toBeUndefined();
      expect(mockFsp.writeFile).toHaveBeenCalledWith("/test/null.json", "null", "utf8");

      await expect(writeJson("/test/undefined.json", undefined)).resolves.toBeUndefined();
      // JSON.stringify(undefined) returns undefined, not "undefined"
      expect(mockFsp.writeFile).toHaveBeenCalledWith("/test/undefined.json", undefined, "utf8");
    });
  });
});
