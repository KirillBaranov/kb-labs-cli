/**
 * Tests for availability checking with ESM-safe resolve
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkRequires } from '../availability.js';
import type { CommandManifest } from '../types.js';

// Mock createRequire
const mockResolve = vi.fn();
vi.mock('node:module', () => ({
  createRequire: vi.fn(() => ({
    resolve: mockResolve,
  })),
}));

describe('checkRequires', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return available: true for manifest without requires', () => {
    const manifest: CommandManifest = {
      manifestVersion: '1.0',
      id: 'test:command',
      group: 'test',
      describe: 'Test command',
      loader: async () => ({ run: async () => 0 }),
    };

    const result = checkRequires(manifest);
    expect(result).toEqual({ available: true });
  });

  it('should return available: true when all dependencies are resolved', () => {
    const manifest: CommandManifest = {
      manifestVersion: '1.0',
      id: 'test:command',
      group: 'test',
      describe: 'Test command',
      requires: ['@kb-labs/test-package', 'some-other-package'],
      loader: async () => ({ run: async () => 0 }),
    };

    mockResolve.mockReturnValue('/path/to/package');

    const result = checkRequires(manifest);
    expect(result).toEqual({ available: true });
    expect(mockResolve).toHaveBeenCalledTimes(2);
  });

  it('should return available: false when dependency is missing', () => {
    const manifest: CommandManifest = {
      manifestVersion: '1.0',
      id: 'test:command',
      group: 'test',
      describe: 'Test command',
      requires: ['@kb-labs/missing-package'],
      loader: async () => ({ run: async () => 0 }),
    };

    mockResolve.mockImplementation(() => {
      throw new Error('Cannot find module');
    });

    const result = checkRequires(manifest);
    expect(result).toEqual({
      available: false,
      reason: 'Missing dependency: @kb-labs/missing-package',
      hint: 'Run: kb devlink apply',
    });
  });

  it('should check dependencies from current working directory', () => {
    const manifest: CommandManifest = {
      manifestVersion: '1.0',
      id: 'test:command',
      group: 'test',
      describe: 'Test command',
      requires: ['@kb-labs/test-package'],
      loader: async () => ({ run: async () => 0 }),
    };

    mockResolve.mockReturnValue('/path/to/package');

    checkRequires(manifest);

    expect(mockResolve).toHaveBeenCalledWith('@kb-labs/test-package', { paths: [process.cwd()] });
  });
});
