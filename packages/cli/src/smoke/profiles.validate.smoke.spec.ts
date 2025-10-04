import { describe, it, expect } from 'vitest';
import { ProfilesValidateCommand } from '@kb-labs/cli-commands';

describe('profiles validate smoke test', () => {
  it('should create ProfilesValidateCommand instance', () => {
    const cmd = new ProfilesValidateCommand();
    expect(cmd.name).toBe('profiles:validate');
    expect(cmd.description).toBe('Validate a profile configuration');
    expect(cmd.flags).toBeDefined();
    expect(cmd.flags.name).toBeDefined();
    expect(cmd.flags.strict).toBeDefined();
    expect(cmd.flags.json).toBeDefined();
  });

  it('should have correct flag defaults', () => {
    const cmd = new ProfilesValidateCommand();
    expect(cmd.flags.name.default).toBe('default');
    expect(cmd.flags.strict.default).toBe(true);
    expect(cmd.flags.json.default).toBe(false);
  });

  it('should accept --help flag', () => {
    const cmd = new ProfilesValidateCommand();
    expect(cmd.flags).toHaveProperty('name');
    expect(cmd.flags).toHaveProperty('strict');
    expect(cmd.flags).toHaveProperty('json');
  });
});
