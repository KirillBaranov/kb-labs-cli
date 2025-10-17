import { describe, it, expect } from 'vitest';
import { run } from '../index';

describe('DevLink exit codes smoke tests', () => {
  it('should return 1 for missing plan file', async () => {
    const code = await run(['devlink', 'apply']);
    expect(code).toBe(1);
  });

  it('should return 0 for successful status check', async () => {
    const code = await run(['devlink', 'status']);
    expect(code).toBe(0);
  });

  // Note: Testing exit code 2 (preflight cancelled) requires git setup
  // which is better suited for integration tests
});
