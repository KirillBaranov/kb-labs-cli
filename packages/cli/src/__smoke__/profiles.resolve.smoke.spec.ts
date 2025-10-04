import { describe, it, expect } from 'vitest';
import { ProfilesResolveCommand } from '@kb-labs/cli-commands';

describe('profiles resolve smoke test', () => {
  it('should create ProfilesResolveCommand instance', () => {
    const cmd = new ProfilesResolveCommand();
    expect(cmd.name).toBe('profiles:resolve');
    expect(cmd.description).toBe('Resolve a profile configuration');
    expect(cmd.flags).toBeDefined();
    expect(cmd.flags.name).toBeDefined();
    expect(cmd.flags.product).toBeDefined();
    expect(cmd.flags.json).toBeDefined();
    expect(cmd.flags['no-cache']).toBeDefined();
  });

  it('should have correct flag defaults', () => {
    const cmd = new ProfilesResolveCommand();
    expect(cmd.flags.name.default).toBe('default');
    expect(cmd.flags.json.default).toBe(false);
    expect(cmd.flags['no-cache'].default).toBe(false);
    expect(cmd.flags.product.default).toBeUndefined();
  });

  it('should accept all required flags', () => {
    const cmd = new ProfilesResolveCommand();
    expect(cmd.flags).toHaveProperty('name');
    expect(cmd.flags).toHaveProperty('product');
    expect(cmd.flags).toHaveProperty('json');
    expect(cmd.flags).toHaveProperty('no-cache');
  });
});
