import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const baseLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  fatal: vi.fn(),
  trace: vi.fn(),
  child: vi.fn(),
};

vi.mock("@kb-labs/core-runtime", () => ({
  platform: {
    logger: baseLogger,
  },
}));

describe("platform-logger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    baseLogger.child.mockImplementation(() => baseLogger);
  });

  afterEach(() => {
    delete process.env.KB_LOG_LEVEL;
    delete process.env.LOG_LEVEL;
  });

  it("creates no-op logger", async () => {
    const { createNoOpLogger } = await import("../platform-logger");
    const logger = createNoOpLogger();

    expect(() => logger.debug("x")).not.toThrow();
    expect(() => logger.info("x")).not.toThrow();
    expect(() => logger.warn("x")).not.toThrow();
    expect(() => logger.error("x")).not.toThrow();
  });

  it("maps env level with fallback", async () => {
    const { getLogLevel } = await import("../platform-logger");

    process.env.KB_LOG_LEVEL = "debug";
    expect(getLogLevel()).toBe("debug");

    process.env.KB_LOG_LEVEL = "invalid";
    expect(getLogLevel()).toBe("info");

    delete process.env.KB_LOG_LEVEL;
    process.env.LOG_LEVEL = "warn";
    expect(getLogLevel()).toBe("warn");
  });

  it("routes logs through platform logger", async () => {
    const { getLogger } = await import("../platform-logger");
    const logger = getLogger("test-category");

    logger.info("hello", { a: 1 });
    logger.error("boom", new Error("e"));

    expect(baseLogger.child).toHaveBeenCalledWith({
      layer: "cli",
      category: "test-category",
    });
    expect(baseLogger.info).toHaveBeenCalledWith("hello", { a: 1 });
    expect(baseLogger.error).toHaveBeenCalled();
  });
});
