import { describe, it, expect } from 'vitest';
import { run } from '../index';

describe('Exit codes smoke tests', () => {
  it('should return 0 for successful command (hello)', async () => {
    const code = await run(['hello']);
    expect(code).toBe(0);
  });

  it('should return 1 for unknown command', async () => {
    const code = await run(['nonexistent-command']);
    expect(code).toBe(1);
  });

  it('should return 3 for invalid flag value', async () => {
    const code = await run(['devlink', 'plan', '--mode=invalid']);
    expect(code).toBe(3);
  });

  it('should return 0 for help flag', async () => {
    const code = await run(['--help']);
    expect(code).toBe(0);
  });

  it('should return 0 for version flag', async () => {
    const code = await run(['--version']);
    expect(code).toBe(0);
  });
});
