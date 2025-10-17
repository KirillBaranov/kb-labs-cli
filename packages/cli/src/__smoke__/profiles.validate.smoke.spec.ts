import { describe, it, expect } from 'vitest';
import { profilesValidate } from '@kb-labs/cli-commands';
import { run } from '../index';

describe('profiles validate smoke test', () => {
  it('should create profilesValidate command instance', () => {
    expect(profilesValidate.name).toBe('validate');
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

  it('should return exit code 0 for successful validation', async () => {
    const code = await run(['profiles:validate']);
    expect(code).toBe(0);
  });
});
