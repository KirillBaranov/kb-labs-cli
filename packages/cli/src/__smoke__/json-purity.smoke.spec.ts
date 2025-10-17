import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { run } from '../index';

describe('JSON output purity', () => {
  let capturedOutput: string[] = [];
  let originalConsoleLog: typeof console.log;

  beforeEach(() => {
    capturedOutput = [];
    originalConsoleLog = console.log;
    console.log = (msg: string) => capturedOutput.push(msg);
  });

  afterEach(() => {
    console.log = originalConsoleLog;
  });

  it('should output single valid JSON object', async () => {
    await run(['hello', '--json']);

    expect(capturedOutput).toHaveLength(1);
    const parsed = JSON.parse(capturedOutput[0]!);
    expect(parsed.ok).toBe(true);
    expect(parsed.data).toHaveProperty('message');
  });

  it('should not leak ANSI codes in JSON mode', async () => {
    await run(['devlink', 'status', '--json']);

    capturedOutput.forEach(line => {
      expect(line).not.toMatch(/\x1b\[/);
      expect(() => JSON.parse(line)).not.toThrow();
    });
  });

  it('should handle mixed output correctly', async () => {
    await run(['hello', '--json']);

    expect(capturedOutput).toHaveLength(1);
    const parsed = JSON.parse(capturedOutput[0]!);
    expect(parsed).toHaveProperty('ok');
    expect(parsed).toHaveProperty('data');
  });
});
