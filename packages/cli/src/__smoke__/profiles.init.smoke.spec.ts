import { describe, it, expect } from 'vitest';
import { profilesInit } from '@kb-labs/cli-commands';

describe('profiles init smoke test', () => {
  it('should create profilesInit command instance', () => {
    expect(profilesInit.name).toBe('profiles:init');
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
});
