import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { run } from '../index';

describe('JSON output purity smoke tests', () => {
  let originalLog: typeof console.log;
  let capturedOutput: string[] = [];

  beforeEach(() => {
    originalLog = console.log;
    capturedOutput = [];
    console.log = (msg: string) => {
      capturedOutput.push(msg);
    };
  });

  afterEach(() => {
    console.log = originalLog;
  });

  it('should output only valid JSON in JSON mode', async () => {
    await run(['--version', '--json']);

    // All output should be valid JSON
    capturedOutput.forEach(line => {
      expect(() => JSON.parse(line)).not.toThrow();
    });
  });

  it('should not output text banners in JSON mode', async () => {
    await run(['hello', '--json']);

    capturedOutput.forEach(line => {
      const parsed = JSON.parse(line);
      // Should not contain ANSI color codes or emoji banners
      expect(line).not.toMatch(/\x1b\[/); // ANSI codes
      expect(parsed).toHaveProperty('ok');
    });
  });

  it('should include warnings in JSON fields, not as text', async () => {
    // Test command that might produce warnings
    await run(['devlink', 'status', '--json']);

    capturedOutput.forEach(line => {
      const parsed = JSON.parse(line);
      if (parsed.warnings) {
        expect(Array.isArray(parsed.warnings)).toBe(true);
      }
      if (parsed.diagnostics) {
        expect(Array.isArray(parsed.diagnostics)).toBe(true);
      }
    });
  });
});
