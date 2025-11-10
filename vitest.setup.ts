import { vi } from "vitest";

vi.mock("@kb-labs/plugin-adapter-cli", () => {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  return {
    initCliLogging: vi.fn(),
    createCliLogger: vi.fn(() => logger),
    executeCommand: vi.fn(async () => 0),
  };
});

vi.mock("@kb-labs/plugin-adapter-rest", () => ({
  generateOpenAPI: vi.fn(async () => ({
    openapi: "3.1.0",
    paths: {},
    info: { title: "mock", version: "0.0.0" },
  })),
  resolveHeaderPolicy: vi.fn(() => ({})),
}));

