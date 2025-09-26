import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { detectRepoRoot } from "../repo";

// Mock fs and path modules
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

vi.mock("node:path", () => ({
  default: {
    resolve: vi.fn(),
    join: vi.fn(),
    dirname: vi.fn(),
  },
}));

describe("detectRepoRoot", () => {
  let mockExistsSync: any;
  let mockPath: any;

  beforeEach(async () => {
    const fsModule = await import("node:fs");
    const pathModule = await import("node:path");
    mockExistsSync = vi.mocked(fsModule).existsSync;
    mockPath = vi.mocked(pathModule).default;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock process.cwd
    vi.spyOn(process, "cwd").mockReturnValue("/test/workspace");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should find .git in current directory", () => {
    mockPath.resolve.mockReturnValue("/test/workspace");
    mockPath.join.mockReturnValue("/test/workspace/.git");
    mockExistsSync.mockReturnValue(true);

    const result = detectRepoRoot();

    expect(result).toBe("/test/workspace");
    expect(mockPath.resolve).toHaveBeenCalledWith("/test/workspace");
    expect(mockPath.join).toHaveBeenCalledWith("/test/workspace", ".git");
    expect(mockExistsSync).toHaveBeenCalledWith("/test/workspace/.git");
  });

  it("should find .git in parent directory", () => {
    mockPath.resolve.mockReturnValue("/test/workspace");
    mockPath.join
      .mockReturnValueOnce("/test/workspace/.git") // first check
      .mockReturnValue("/test/.git"); // second check
    mockPath.dirname.mockReturnValue("/test");
    mockExistsSync
      .mockReturnValueOnce(false) // first check fails
      .mockReturnValueOnce(true); // second check succeeds

    const result = detectRepoRoot();

    expect(result).toBe("/test");
    expect(mockPath.dirname).toHaveBeenCalledWith("/test/workspace");
    expect(mockPath.join).toHaveBeenCalledWith("/test", ".git");
  });

  it("should find .git in grandparent directory", () => {
    mockPath.resolve.mockReturnValue("/test/workspace");
    mockPath.join
      .mockReturnValueOnce("/test/workspace/.git") // first check
      .mockReturnValueOnce("/test/.git") // second check
      .mockReturnValue("/.git"); // third check
    mockPath.dirname
      .mockReturnValueOnce("/test") // first parent
      .mockReturnValueOnce("/"); // second parent
    mockExistsSync
      .mockReturnValueOnce(false) // first check fails
      .mockReturnValueOnce(false) // second check fails
      .mockReturnValueOnce(true); // third check succeeds

    const result = detectRepoRoot();

    expect(result).toBe("/");
  });

  it("should fallback to start directory when no .git found", () => {
    mockPath.resolve.mockReturnValue("/test/workspace");
    mockPath.join.mockReturnValue("/test/workspace/.git");
    mockPath.dirname
      .mockReturnValueOnce("/test") // first parent
      .mockReturnValueOnce("/") // second parent
      .mockReturnValueOnce("/"); // third parent (same as current)
    mockExistsSync.mockReturnValue(false);

    const result = detectRepoRoot();

    expect(result).toBe("/test/workspace");
  });

  it("should use custom start directory", () => {
    mockPath.resolve.mockReturnValue("/custom/path");
    mockPath.join.mockReturnValue("/custom/path/.git");
    mockExistsSync.mockReturnValue(true);

    const result = detectRepoRoot("/custom/path");

    expect(result).toBe("/custom/path");
    expect(mockPath.resolve).toHaveBeenCalledWith("/custom/path");
  });

  it("should handle custom start directory with no .git", () => {
    mockPath.resolve.mockReturnValue("/custom/path");
    mockPath.join.mockReturnValue("/custom/path/.git");
    mockPath.dirname
      .mockReturnValueOnce("/custom") // first parent
      .mockReturnValueOnce("/") // second parent
      .mockReturnValueOnce("/"); // third parent (same as current)
    mockExistsSync.mockReturnValue(false);

    const result = detectRepoRoot("/custom/path");

    expect(result).toBe("/custom/path");
  });

  it("should handle root directory", () => {
    mockPath.resolve.mockReturnValue("/");
    mockPath.join.mockReturnValue("/.git");
    mockPath.dirname.mockReturnValue("/");
    mockExistsSync.mockReturnValue(false);

    const result = detectRepoRoot("/");

    expect(result).toBe("/");
  });

  it("should handle relative paths", () => {
    mockPath.resolve.mockReturnValue("/resolved/path");
    mockPath.join.mockReturnValue("/resolved/path/.git");
    mockExistsSync.mockReturnValue(true);

    const result = detectRepoRoot("./relative/path");

    expect(result).toBe("/resolved/path");
    expect(mockPath.resolve).toHaveBeenCalledWith("./relative/path");
  });
});
