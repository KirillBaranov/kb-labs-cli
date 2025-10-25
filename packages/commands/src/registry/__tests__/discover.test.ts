/**
 * Tests for manifest discovery with mixed CJS/ESM loading
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { discoverManifests } from '../discover.js';
import type { CommandManifest } from '../types.js';

// Mock dependencies
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('yaml', () => ({
  parse: vi.fn(),
}));

vi.mock('glob', () => ({
  glob: vi.fn(),
}));

vi.mock('../utils/logger.js', () => ({
  log: vi.fn(),
}));

vi.mock('../utils/path.js', () => ({
  toPosixPath: (p: string) => p.replace(/\\/g, '/'),
}));

describe('discoverManifests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should discover workspace packages with pnpm-workspace.yaml', async () => {
    const { readFile } = await import('node:fs/promises');
    const { parse } = await import('yaml');
    const { glob } = await import('glob');

    // Mock workspace file
    vi.mocked(readFile).mockResolvedValueOnce('packages:\n  - "packages/*"');
    vi.mocked(parse).mockReturnValue({ packages: ['packages/*'] });

    // Mock glob results
    vi.mocked(glob).mockResolvedValue(['packages/test-package']);

    // Mock package.json
    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify({
      name: '@kb-labs/test-package',
      kb: { commandsManifest: './dist/cli.manifest.js' },
    }));

    // Mock manifest file
    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify({
      commands: [{
        manifestVersion: '1.0',
        id: 'test:command',
        group: 'test',
        describe: 'Test command',
        loader: async () => ({ run: async () => 0 }),
      }],
    }));

    const results = await discoverManifests('/test/cwd', false);
    
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe('workspace');
    expect(results[0].packageName).toBe('@kb-labs/test-package');
  });

  it('should fallback to current package when no workspace file', async () => {
    const { readFile } = await import('node:fs/promises');

    // Mock no workspace file
    vi.mocked(readFile).mockRejectedValueOnce(new Error('ENOENT'));

    // Mock current package.json
    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify({
      name: '@kb-labs/current-package',
      kb: { commandsManifest: './dist/cli.manifest.js' },
    }));

    // Mock manifest file
    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify({
      commands: [{
        manifestVersion: '1.0',
        id: 'current:command',
        group: 'current',
        describe: 'Current command',
        loader: async () => ({ run: async () => 0 }),
      }],
    }));

    const results = await discoverManifests('/test/cwd', false);
    
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe('workspace');
    expect(results[0].packageName).toBe('@kb-labs/current-package');
  });

  it('should discover node_modules packages', async () => {
    const { readFile } = await import('node:fs/promises');
    const { readdir } = await import('node:fs/promises');

    // Mock no workspace file
    vi.mocked(readFile).mockRejectedValueOnce(new Error('ENOENT'));

    // Mock no current package
    vi.mocked(readFile).mockRejectedValueOnce(new Error('ENOENT'));

    // Mock node_modules directory
    vi.mocked(readdir).mockResolvedValueOnce([
      { name: 'test-package', isDirectory: () => true },
    ]);

    // Mock package.json in node_modules
    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify({
      name: '@kb-labs/test-package',
      kb: { commandsManifest: './dist/cli.manifest.js' },
    }));

    // Mock manifest file
    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify({
      commands: [{
        manifestVersion: '1.0',
        id: 'test:command',
        group: 'test',
        describe: 'Test command',
        loader: async () => ({ run: async () => 0 }),
      }],
    }));

    const results = await discoverManifests('/test/cwd', false);
    
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe('node_modules');
    expect(results[0].packageName).toBe('@kb-labs/test-package');
  });

  it('should handle manifest load timeout', async () => {
    const { readFile } = await import('node:fs/promises');
    const { parse } = await import('yaml');
    const { glob } = await import('glob');

    // Mock workspace file
    vi.mocked(readFile).mockResolvedValueOnce('packages:\n  - "packages/*"');
    vi.mocked(parse).mockReturnValue({ packages: ['packages/*'] });
    vi.mocked(glob).mockResolvedValue(['packages/test-package']);

    // Mock package.json
    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify({
      name: '@kb-labs/test-package',
      kb: { commandsManifest: './dist/cli.manifest.js' },
    }));

    // Mock manifest file that times out
    vi.mocked(readFile).mockImplementationOnce(() => 
      new Promise((resolve) => setTimeout(() => resolve('{}'), 2000))
    );

    const results = await discoverManifests('/test/cwd', false);
    
    // Should return empty results due to timeout
    expect(results).toHaveLength(0);
  });
});
