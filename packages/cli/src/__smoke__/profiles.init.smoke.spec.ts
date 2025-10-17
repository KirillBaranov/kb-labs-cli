import { describe, it, expect } from 'vitest';
import { profilesInit } from '@kb-labs/cli-commands';
import { run } from '../index';

describe('profiles init smoke test', () => {
  it('should create profilesInit command instance', () => {
    expect(profilesInit.name).toBe('init');
    expect(profilesInit.describe).toBe('Initialize a new profile configuration');
    expect(typeof profilesInit.run).toBe('function');
  });

  it('should be a valid command object', () => {
    expect(profilesInit).toHaveProperty('name');
    expect(profilesInit).toHaveProperty('describe');
    expect(profilesInit).toHaveProperty('run');
  });

  it('should have correct command properties', () => {
    expect(profilesInit.name).toBeDefined();
    expect(profilesInit.describe).toBeDefined();
    expect(profilesInit.run).toBeDefined();
  });

  it('should return exit code 0 for successful dry run', async () => {
    const code = await run(['profiles:init', '--dry-run']);
    expect(code).toBe(0);
  });

  it('should return exit code 3 for invalid kind', async () => {
    const code = await run(['profiles:init', '--kind=invalid']);
    expect(code).toBe(3);
  });
});
