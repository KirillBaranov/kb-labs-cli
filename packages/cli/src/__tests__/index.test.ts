import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { run } from "../index";

// Mock the commands module
vi.mock("@kb-labs/cli-commands", () => ({
  findCommand: vi.fn(),
  registerBuiltinCommands: vi.fn(),
}));

// Mock the core module
vi.mock("@kb-labs/cli-core", () => ({
  parseArgs: vi.fn(),
  CliError: class CliError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
  mapCliErrorToExitCode: vi.fn(),
  createTextPresenter: vi.fn(),
  createJsonPresenter: vi.fn(),
  createContext: vi.fn(),
}));

describe("CLI run function", () => {
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let mockFindCommand: any;
  let mockRegisterBuiltinCommands: any;
  let mockParseArgs: any;
  let mockCreateTextPresenter: any;
  let mockCreateJsonPresenter: any;
  let mockCreateContext: any;
  let mockMapCliErrorToExitCode: any;

  beforeEach(async () => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => { });
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => { });

    // Setup mocks
    const commandsModule = await import("@kb-labs/cli-commands");
    const coreModule = await import("@kb-labs/cli-core");

    mockFindCommand = vi.mocked(commandsModule.findCommand);
    mockRegisterBuiltinCommands = vi.mocked(commandsModule.registerBuiltinCommands);
    mockParseArgs = vi.mocked(coreModule.parseArgs);
    mockCreateTextPresenter = vi.mocked(coreModule.createTextPresenter);
    mockCreateJsonPresenter = vi.mocked(coreModule.createJsonPresenter);
    mockCreateContext = vi.mocked(coreModule.createContext);
    mockMapCliErrorToExitCode = vi.mocked(coreModule.mapCliErrorToExitCode);

    // Default mock implementations
    mockRegisterBuiltinCommands.mockImplementation(() => { });
    mockCreateTextPresenter.mockReturnValue({
      write: vi.fn(),
      error: vi.fn(),
      json: vi.fn(),
    });
    mockCreateJsonPresenter.mockReturnValue({
      write: vi.fn(),
      error: vi.fn(),
      json: vi.fn(),
    });
    mockCreateContext.mockResolvedValue({
      presenter: mockCreateTextPresenter(),
    });
  });

  afterEach(() => {
    consoleLogSpy?.mockRestore();
    consoleErrorSpy?.mockRestore();
    vi.clearAllMocks();
  });

  describe("help flag handling", () => {
    it("should handle --help flag in text mode", async () => {
      mockParseArgs.mockReturnValue({
        cmdPath: [],
        rest: [],
        global: { help: true },
        flagsObj: {},
      });

      const result = await run(["--help"]);

      expect(result).toBe(0);
      expect(mockRegisterBuiltinCommands).toHaveBeenCalled();
      expect(mockCreateTextPresenter).toHaveBeenCalled();
    });

    it("should handle --help flag in JSON mode", async () => {
      mockParseArgs.mockReturnValue({
        cmdPath: [],
        rest: [],
        global: { help: true, json: true },
        flagsObj: {},
      });

      const result = await run(["--help", "--json"]);

      expect(result).toBe(0);
      expect(mockCreateJsonPresenter).toHaveBeenCalled();
    });
  });

  describe("version flag handling", () => {
    it("should handle --version flag in text mode", async () => {
      mockParseArgs.mockReturnValue({
        cmdPath: [],
        rest: [],
        global: { version: true },
        flagsObj: {},
      });

      const result = await run(["--version"]);

      expect(result).toBe(0);
      expect(mockCreateTextPresenter).toHaveBeenCalled();
    });

    it("should handle --version flag in JSON mode", async () => {
      mockParseArgs.mockReturnValue({
        cmdPath: [],
        rest: [],
        global: { version: true, json: true },
        flagsObj: {},
      });

      const result = await run(["--version", "--json"]);

      expect(result).toBe(0);
      expect(mockCreateJsonPresenter).toHaveBeenCalled();
    });
  });

  describe("command execution", () => {
    it("should execute found command successfully", async () => {
      const mockCommand = {
        name: "hello",
        describe: "Hello command",
        run: vi.fn().mockResolvedValue(undefined),
      };

      mockParseArgs.mockReturnValue({
        cmdPath: ["hello"],
        rest: [],
        global: {},
        flagsObj: {},
      });
      mockFindCommand.mockReturnValue(mockCommand);

      const result = await run(["hello"]);

      expect(result).toBeUndefined();
      expect(mockCommand.run).toHaveBeenCalled();
    });

    it("should return exit code from command", async () => {
      const mockCommand = {
        name: "hello",
        describe: "Hello command",
        run: vi.fn().mockResolvedValue(1),
      };

      mockParseArgs.mockReturnValue({
        cmdPath: ["hello"],
        rest: [],
        global: {},
        flagsObj: {},
      });
      mockFindCommand.mockReturnValue(mockCommand);

      const result = await run(["hello"]);

      expect(result).toBe(1);
    });

    it("should handle unknown command", async () => {
      mockParseArgs.mockReturnValue({
        cmdPath: ["unknown"],
        rest: [],
        global: {},
        flagsObj: {},
      });
      mockFindCommand.mockReturnValue(undefined);

      const result = await run(["unknown"]);

      expect(result).toBe(1);
    });

    it("should handle unknown command in JSON mode", async () => {
      mockParseArgs.mockReturnValue({
        cmdPath: ["unknown"],
        rest: [],
        global: { json: true },
        flagsObj: {},
      });
      mockFindCommand.mockReturnValue(undefined);

      const result = await run(["unknown", "--json"]);

      expect(result).toBe(1);
    });
  });

  describe("error handling", () => {
    it("should handle CliError", async () => {
      const mockCommand = {
        name: "hello",
        describe: "Hello command",
        run: vi.fn().mockRejectedValue(new (await import("@kb-labs/cli-core")).CliError("E_IO_READ", "File not found")),
      };

      mockParseArgs.mockReturnValue({
        cmdPath: ["hello"],
        rest: [],
        global: {},
        flagsObj: {},
      });
      mockFindCommand.mockReturnValue(mockCommand);
      mockMapCliErrorToExitCode.mockReturnValue(74);

      const result = await run(["hello"]);

      expect(result).toBe(74);
    });

    it("should handle CliError in JSON mode", async () => {
      const mockCommand = {
        name: "hello",
        describe: "Hello command",
        run: vi.fn().mockRejectedValue(new (await import("@kb-labs/cli-core")).CliError("E_IO_READ", "File not found")),
      };

      mockParseArgs.mockReturnValue({
        cmdPath: ["hello"],
        rest: [],
        global: { json: true },
        flagsObj: {},
      });
      mockFindCommand.mockReturnValue(mockCommand);
      mockMapCliErrorToExitCode.mockReturnValue(74);

      const result = await run(["hello", "--json"]);

      expect(result).toBe(74);
    });

    it("should handle generic errors", async () => {
      const mockCommand = {
        name: "hello",
        describe: "Hello command",
        run: vi.fn().mockRejectedValue(new Error("Generic error")),
      };

      mockParseArgs.mockReturnValue({
        cmdPath: ["hello"],
        rest: [],
        global: {},
        flagsObj: {},
      });
      mockFindCommand.mockReturnValue(mockCommand);

      const result = await run(["hello"]);

      expect(result).toBe(1);
    });

    it("should handle generic errors in JSON mode", async () => {
      const mockCommand = {
        name: "hello",
        describe: "Hello command",
        run: vi.fn().mockRejectedValue(new Error("Generic error")),
      };

      mockParseArgs.mockReturnValue({
        cmdPath: ["hello"],
        rest: [],
        global: { json: true },
        flagsObj: {},
      });
      mockFindCommand.mockReturnValue(mockCommand);

      const result = await run(["hello", "--json"]);

      expect(result).toBe(1);
    });
  });
});
