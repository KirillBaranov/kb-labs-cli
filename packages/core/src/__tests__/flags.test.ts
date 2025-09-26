import { describe, it, expect } from "vitest";
import { parseArgs } from "../flags";

describe("parseArgs", () => {
  it("should parse simple command", () => {
    const result = parseArgs(["hello"]);

    expect(result).toEqual({
      cmdPath: ["hello"],
      rest: [],
      global: {},
      flagsObj: {},
    });
  });

  it("should parse command with arguments", () => {
    const result = parseArgs(["hello", "world", "test"]);

    expect(result).toEqual({
      cmdPath: ["hello", "world"],
      rest: ["test"],
      global: {},
      flagsObj: {},
    });
  });

  it("should parse nested command", () => {
    const result = parseArgs(["init", "profile", "my-profile"]);

    expect(result).toEqual({
      cmdPath: ["init", "profile"],
      rest: ["my-profile"],
      global: {},
      flagsObj: {},
    });
  });

  it("should parse global --json flag", () => {
    const result = parseArgs(["--json", "hello"]);

    expect(result).toEqual({
      cmdPath: ["hello"],
      rest: [],
      global: { json: true },
      flagsObj: {},
    });
  });

  it("should parse global --help flag", () => {
    const result = parseArgs(["--help"]);

    expect(result).toEqual({
      cmdPath: [],
      rest: [],
      global: { help: true },
      flagsObj: {},
    });
  });

  it("should parse global --version flag", () => {
    const result = parseArgs(["--version"]);

    expect(result).toEqual({
      cmdPath: [],
      rest: [],
      global: { version: true },
      flagsObj: {},
    });
  });

  it("should parse global --no-color flag", () => {
    const result = parseArgs(["--no-color", "hello"]);

    expect(result).toEqual({
      cmdPath: ["hello"],
      rest: [],
      global: { noColor: true },
      flagsObj: {},
    });
  });

  it("should parse global --debug flag", () => {
    const result = parseArgs(["--debug", "hello"]);

    expect(result).toEqual({
      cmdPath: ["hello"],
      rest: [],
      global: { debug: true, logLevel: "debug" },
      flagsObj: {},
    });
  });

  it("should parse global --verbose flag", () => {
    const result = parseArgs(["--verbose", "hello"]);

    expect(result).toEqual({
      cmdPath: ["hello"],
      rest: [],
      global: { verbose: true, logLevel: "debug" },
      flagsObj: {},
    });
  });

  it("should parse global --log-level flag", () => {
    const result = parseArgs(["--log-level", "info", "hello"]);

    expect(result).toEqual({
      cmdPath: ["hello"],
      rest: [],
      global: { logLevel: "info" },
      flagsObj: {},
    });
  });

  it("should parse global --profile flag", () => {
    const result = parseArgs(["--profile", "my-profile", "hello"]);

    expect(result).toEqual({
      cmdPath: ["hello"],
      rest: [],
      global: { profile: "my-profile" },
      flagsObj: {},
    });
  });

  it("should parse global --profiles-dir flag", () => {
    const result = parseArgs(["--profiles-dir", "/tmp/profiles", "hello"]);

    expect(result).toEqual({
      cmdPath: ["hello"],
      rest: [],
      global: { profilesDir: "/tmp/profiles" },
      flagsObj: {},
    });
  });

  it("should parse command-specific flags", () => {
    const result = parseArgs(["hello", "--name", "world", "--count", "5"]);

    expect(result).toEqual({
      cmdPath: ["hello"],
      rest: [],
      global: {},
      flagsObj: { name: "world", count: "5" },
    });
  });

  it("should parse boolean command-specific flags", () => {
    const result = parseArgs(["hello", "--verbose", "--force"]);

    expect(result).toEqual({
      cmdPath: ["hello"],
      rest: [],
      global: { verbose: true, logLevel: "debug" },
      flagsObj: { force: true },
    });
  });

  it("should handle -- separator", () => {
    const result = parseArgs(["hello", "--", "--not-a-flag", "arg"]);

    expect(result).toEqual({
      cmdPath: ["hello"],
      rest: ["--not-a-flag", "arg"],
      global: {},
      flagsObj: {},
    });
  });

  it("should handle multiple global flags", () => {
    const result = parseArgs(["--json", "--debug", "--profile", "test", "hello"]);

    expect(result).toEqual({
      cmdPath: ["hello"],
      rest: [],
      global: {
        json: true,
        debug: true,
        logLevel: "debug",
        profile: "test"
      },
      flagsObj: {},
    });
  });

  it("should handle empty arguments", () => {
    const result = parseArgs([]);

    expect(result).toEqual({
      cmdPath: [],
      rest: [],
      global: {},
      flagsObj: {},
    });
  });

  it("should handle only global flags", () => {
    const result = parseArgs(["--help", "--json"]);

    expect(result).toEqual({
      cmdPath: [],
      rest: [],
      global: { help: true, json: true },
      flagsObj: {},
    });
  });

  it("should limit command path to 2 levels", () => {
    const result = parseArgs(["level1", "level2", "level3", "arg1", "arg2"]);

    expect(result).toEqual({
      cmdPath: ["level1", "level2"],
      rest: ["level3", "arg1", "arg2"],
      global: {},
      flagsObj: {},
    });
  });
});
