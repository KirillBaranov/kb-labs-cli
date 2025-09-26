import { describe, it, expect, vi } from "vitest";
import { stdinSource } from "../stdin.js";
import { CliError, CLI_ERROR_CODES } from "@kb-labs/cli-core";

describe("stdin source", () => {
  it("should read from stdin successfully", async () => {
    const mockInput = "test input data";
    const mockChunks = [Buffer.from(mockInput)];

    // Mock process.stdin
    const mockStdin = {
      [Symbol.asyncIterator]: vi.fn().mockReturnValue({
        next: vi
          .fn()
          .mockResolvedValue({ value: mockChunks[0], done: false })
          .mockResolvedValueOnce({ value: mockChunks[0], done: false })
          .mockResolvedValueOnce({ done: true }),
      }),
    };

    vi.stubGlobal("process", { ...process, stdin: mockStdin });

    const source = stdinSource();
    const result = await source.read();

    expect(result).toBe(mockInput);

    vi.unstubAllGlobals();
  });

  it("should throw CliError when stdin read fails", async () => {
    // Mock process.stdin to throw error
    const mockStdin = {
      [Symbol.asyncIterator]: vi.fn().mockReturnValue({
        next: vi.fn().mockRejectedValue(new Error("stdin read error")),
      }),
    };

    vi.stubGlobal("process", { ...process, stdin: mockStdin });

    const source = stdinSource();

    await expect(source.read()).rejects.toThrow(CliError);
    await expect(source.read()).rejects.toMatchObject({
      code: CLI_ERROR_CODES.E_IO_READ,
    });

    vi.unstubAllGlobals();
  });
});
