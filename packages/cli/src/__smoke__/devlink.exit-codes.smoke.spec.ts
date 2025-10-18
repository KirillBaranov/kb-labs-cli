import { describe, it, expect, beforeEach } from 'vitest';
import { run } from '../index';
import { promises as fs } from 'fs';
import { join } from 'path';

describe('DevLink exit codes smoke tests', () => {
  beforeEach(async () => {
    // Clean up any existing plan files before tests
    const planPath = join(process.cwd(), '.kb', 'devlink', 'last-plan.json');
    try {
      await fs.unlink(planPath);
    } catch {
      // File doesn't exist, that's fine
    }
  });

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
