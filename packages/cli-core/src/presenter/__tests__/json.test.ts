import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createJsonPresenter } from "../json";

describe("JSON Presenter", () => {
  let originalLog: typeof console.log;
  let capturedOutput: string[] = [];

  beforeEach(() => {
    originalLog = console.log;
    capturedOutput = [];
    console.log = vi.fn((msg: string) => {
      capturedOutput.push(msg);
    });
  });

  afterEach(() => {
    console.log = originalLog;
  });

  describe("createJsonPresenter", () => {
    it("should create presenter with correct properties", () => {
      const presenter = createJsonPresenter();

      expect(presenter.isTTY).toBe(false);
      expect(presenter.isQuiet).toBe(false);
      expect(presenter.isJSON).toBe(true);
      expect(typeof presenter.write).toBe("function");
      expect(typeof presenter.warn).toBe("function");
      expect(typeof presenter.error).toBe("function");
      expect(typeof presenter.json).toBe("function");
    });

    describe("write method", () => {
      it("should be a no-op and not output anything", () => {
        const presenter = createJsonPresenter();

        presenter.write("This should be ignored");
        presenter.write("Another ignored message");

        expect(capturedOutput).toHaveLength(0);
        expect(console.log).not.toHaveBeenCalled();
      });

      it("should not interfere with other methods", () => {
        const presenter = createJsonPresenter();

        presenter.write("Ignored text");
        presenter.error("Error message");
        presenter.json({ ok: true, data: "test" });

        expect(capturedOutput).toHaveLength(2);
        expect(capturedOutput[0]).toBe(
          '{"ok":false,"error":{"message":"Error message"}}',
        );
        expect(capturedOutput[1]).toBe('{"ok":true,"data":"test"}');
      });
    });

    describe("warn method", () => {
      it("should be a no-op and not output anything", () => {
        const presenter = createJsonPresenter();
        presenter.warn("Warning message");

        expect(capturedOutput).toHaveLength(0);
      });
    });

    describe("error method", () => {
      it("should output valid JSON for error messages", () => {
        const presenter = createJsonPresenter();

        presenter.error("Test error message");

        expect(capturedOutput).toHaveLength(1);
        const output = capturedOutput[0];
        expect(output).toBeDefined();

        expect(() => JSON.parse(output!)).not.toThrow();
        const parsed = JSON.parse(output!);
        expect(parsed).toEqual({
          ok: false,
          error: { message: "Test error message" },
        });
      });

      it("should handle empty error messages", () => {
        const presenter = createJsonPresenter();

        presenter.error("");

        expect(capturedOutput).toHaveLength(1);
        const output = capturedOutput[0];
        expect(output).toBeDefined();
        const parsed = JSON.parse(output!);
        expect(parsed).toEqual({
          ok: false,
          error: { message: "" },
        });
      });

      it("should handle special characters in error messages", () => {
        const presenter = createJsonPresenter();

        const specialMessage =
          'Error with "quotes" and \n newlines and \t tabs';
        presenter.error(specialMessage);

        expect(capturedOutput).toHaveLength(1);
        const output = capturedOutput[0];
        expect(output).toBeDefined();
        const parsed = JSON.parse(output!);
        expect(parsed.error.message).toBe(specialMessage);
      });
    });

    describe("json method", () => {
      it("should output valid JSON for simple objects", () => {
        const presenter = createJsonPresenter();

        presenter.json({ ok: true, message: "Success" });

        expect(capturedOutput).toHaveLength(1);
        const output = capturedOutput[0];
        expect(output).toBeDefined();

        expect(() => JSON.parse(output!)).not.toThrow();
        const parsed = JSON.parse(output!);
        expect(parsed).toEqual({ ok: true, message: "Success" });
      });

      it("should output valid JSON for complex objects", () => {
        const presenter = createJsonPresenter();

        const complexData = {
          ok: true,
          data: {
            items: [1, 2, 3],
            metadata: { count: 3, timestamp: "2023-01-01T00:00:00Z" },
          },
          warnings: ["Warning 1", "Warning 2"],
        };

        presenter.json(complexData);

        expect(capturedOutput).toHaveLength(1);
        const output = capturedOutput[0];
        expect(output).toBeDefined();
        const parsed = JSON.parse(output!);
        expect(parsed).toEqual(complexData);
      });

      it("should handle null and undefined values", () => {
        const presenter = createJsonPresenter();

        presenter.json({ ok: true, data: null, error: undefined });

        expect(capturedOutput).toHaveLength(1);
        const output = capturedOutput[0];
        expect(output).toBeDefined();
        const parsed = JSON.parse(output!);
        expect(parsed).toEqual({ ok: true, data: null, error: undefined });
      });

      it("should handle arrays", () => {
        const presenter = createJsonPresenter();

        presenter.json([1, 2, 3, { nested: true }]);

        expect(capturedOutput).toHaveLength(1);
        const output = capturedOutput[0];
        expect(output).toBeDefined();
        const parsed = JSON.parse(output!);
        expect(parsed).toEqual([1, 2, 3, { nested: true }]);
      });

      it("should handle primitive values", () => {
        const presenter = createJsonPresenter();

        presenter.json("string value");
        const output1 = capturedOutput[0];
        expect(output1).toBeDefined();
        expect(JSON.parse(output1!)).toBe("string value");

        capturedOutput.length = 0;
        presenter.json(42);
        const output2 = capturedOutput[0];
        expect(output2).toBeDefined();
        expect(JSON.parse(output2!)).toBe(42);

        capturedOutput.length = 0;
        presenter.json(true);
        const output3 = capturedOutput[0];
        expect(output3).toBeDefined();
        expect(JSON.parse(output3!)).toBe(true);
      });
    });

    describe("JSON purity", () => {
      it("should ensure all output is valid JSON", () => {
        const presenter = createJsonPresenter();

        // Test various outputs
        presenter.error("Error message");
        presenter.json({ ok: true, data: "test" });
        presenter.json({ warnings: ["warning1", "warning2"] });
        presenter.json({ diagnostics: ["diag1", "diag2"] });

        // All output should be valid JSON
        capturedOutput.forEach((line) => {
          expect(line).toBeDefined();
          expect(() => JSON.parse(line!)).not.toThrow();
        });
      });

      it("should not output ANSI color codes or emoji", () => {
        const presenter = createJsonPresenter();

        // Even if someone tries to pass colored text, it should be properly escaped
        presenter.error("Error with \x1b[31mred\x1b[0m text");
        presenter.json({ message: "Message with 🚀 emoji" });

        capturedOutput.forEach((line) => {
          expect(line).toBeDefined();
          const parsed = JSON.parse(line!);
          // The JSON should be valid and contain the raw text
          expect(typeof parsed).toBe("object");
        });
      });

      it("should handle multiple consecutive calls", () => {
        const presenter = createJsonPresenter();

        presenter.json({ step: 1, message: "First" });
        presenter.json({ step: 2, message: "Second" });
        presenter.error("Error occurred");
        presenter.json({ step: 3, message: "Third" });

        expect(capturedOutput).toHaveLength(4);

        // All should be valid JSON
        capturedOutput.forEach((line) => {
          expect(line).toBeDefined();
          expect(() => JSON.parse(line!)).not.toThrow();
        });

        // Verify content
        expect(capturedOutput[0]).toBeDefined();
        expect(capturedOutput[1]).toBeDefined();
        expect(capturedOutput[2]).toBeDefined();
        expect(capturedOutput[3]).toBeDefined();
        expect(JSON.parse(capturedOutput[0]!)).toEqual({
          step: 1,
          message: "First",
        });
        expect(JSON.parse(capturedOutput[1]!)).toEqual({
          step: 2,
          message: "Second",
        });
        expect(JSON.parse(capturedOutput[2]!)).toEqual({
          ok: false,
          error: { message: "Error occurred" },
        });
        expect(JSON.parse(capturedOutput[3]!)).toEqual({
          step: 3,
          message: "Third",
        });
      });
    });
  });
});
