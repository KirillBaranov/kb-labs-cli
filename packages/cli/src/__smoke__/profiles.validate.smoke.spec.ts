import { describe, it, expect } from 'vitest';
import { profilesValidate } from '@kb-labs/cli-commands';

describe('profiles validate smoke test', () => {
  it('should create profilesValidate command instance', () => {
    expect(profilesValidate.name).toBe('profiles:validate');
    expect(profilesValidate.describe).toBe('Validate a profile configuration');
    expect(typeof profilesValidate.run).toBe('function');
  });

  it('should be a valid command object', () => {
    expect(profilesValidate).toHaveProperty('name');
    expect(profilesValidate).toHaveProperty('describe');
    expect(profilesValidate).toHaveProperty('run');
  });

  it('should have correct command properties', () => {
    expect(profilesValidate.name).toBeDefined();
    expect(profilesValidate.describe).toBeDefined();
    expect(profilesValidate.run).toBeDefined();
  });
});
