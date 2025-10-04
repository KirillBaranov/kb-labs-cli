import { describe, it, expect } from 'vitest';
import { profilesResolve } from '@kb-labs/cli-commands';

describe('profiles resolve smoke test', () => {
  it('should create profilesResolve command instance', () => {
    expect(profilesResolve.name).toBe('profiles:resolve');
    expect(profilesResolve.describe).toBe('Resolve a profile configuration');
    expect(typeof profilesResolve.run).toBe('function');
  });

  it('should be a valid command object', () => {
    expect(profilesResolve).toHaveProperty('name');
    expect(profilesResolve).toHaveProperty('describe');
    expect(profilesResolve).toHaveProperty('run');
  });

  it('should have correct command properties', () => {
    expect(profilesResolve.name).toBeDefined();
    expect(profilesResolve.describe).toBeDefined();
    expect(profilesResolve.run).toBeDefined();
  });
});
