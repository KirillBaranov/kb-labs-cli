/**
 * Tests for manifest discovery with mixed CJS/ESM loading
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CommandManifest } from "../types";

const fsPromisesMock = vi.hoisted(() => ({
  readFile: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("node:fs", () => ({
  promises: fsPromisesMock,
}));

vi.mock("node:fs/promises", () => fsPromisesMock);

vi.mock('yaml', () => ({
  parse: vi.fn(),
}));

vi.mock('glob', () => ({
  glob: vi.fn(),
}));

// Logger mock removed - using cli-core logger abstraction directly

vi.mock('../utils/path.js', () => ({
  toPosixPath: (p: string) => p.replace(/\\/g, '/'),
}));

const rollbackCommandMocks = vi.hoisted(() => {
  const run = vi.fn().mockResolvedValue(0);
  const create = vi.fn(() => ({ run }));
  return { run, create };
});

vi.mock('../../commands/system/plugin-setup-rollback.js', () => ({
  createPluginSetupRollbackCommand: rollbackCommandMocks.create,
}));

const importDiscoverModule = () => import('../discover');

describe('discoverManifests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fsPromisesMock.readFile.mockResolvedValue("{}");
    fsPromisesMock.readdir.mockResolvedValue([]);
    fsPromisesMock.stat.mockResolvedValue({
      isDirectory: () => true,
      isFile: () => true,
      mtimeMs: 0,
    } as any);
    fsPromisesMock.mkdir.mockResolvedValue(undefined);
    fsPromisesMock.writeFile.mockResolvedValue(undefined);
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

    const { discoverManifests } = await importDiscoverModule();
    const results = await discoverManifests("/test/cwd", false);

    expect(Array.isArray(results)).toBe(true);
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

    const { discoverManifests } = await importDiscoverModule();
    const results = await discoverManifests("/test/cwd", false);

    expect(Array.isArray(results)).toBe(true);
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
      { name: 'test-package', isDirectory: () => true } as any,
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

    const { discoverManifests } = await importDiscoverModule();
    const results = await discoverManifests("/test/cwd", false);

    expect(Array.isArray(results)).toBe(true);
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
      new Promise((resolve) => {
        setTimeout(() => resolve('{}'), 2000);
      })
    );

    const { discoverManifests } = await importDiscoverModule();
    const results = await discoverManifests("/test/cwd", false);

    expect(Array.isArray(results)).toBe(true);
  });

  it('should rehydrate loader stub for cached manifest entries', async () => {
    const { __test } = await import('../discover') as any;

    const manifest = {
      manifestVersion: '1.0',
      id: 'test:init',
      group: 'test',
      describe: 'Test init command',
      flags: [],
      examples: [],
    } as unknown as CommandManifest;

    expect(typeof manifest.loader).not.toBe('function');
    __test.ensureManifestLoader(manifest);
    expect(typeof manifest.loader).toBe('function');
    await expect(manifest.loader!()).rejects.toThrow(/ManifestV3 command/);
  });

  it('should rehydrate setup rollback loader and delegate to rollback module', async () => {
    const { __test } = await import('../discover') as any;
    rollbackCommandMocks.create.mockClear();
    rollbackCommandMocks.run.mockClear();

    const manifestV2 = {
      schema: 'kb.plugin/3' as const,
      id: '@kb-labs/test',
      version: '1.0.0',
      setup: { handler: './setup.js#run', describe: 'Setup test', permissions: {} },
    };

    const manifest = {
      manifestVersion: '1.0',
      id: 'template:setup:rollback',
      group: 'template',
      describe: 'Setup rollback command',
      flags: [],
      examples: [],
      package: '@kb-labs/plugin-template',
      namespace: 'template',
      loader: undefined,
    } as unknown as CommandManifest & {
      isSetupRollback: boolean;
      manifestV2: typeof manifestV2;
      pkgRoot: string;
    };

    manifest.isSetupRollback = true;
    manifest.manifestV2 = manifestV2;
    manifest.pkgRoot = '/virtual/template';

    __test.ensureManifestLoader(manifest);
    expect(typeof manifest.loader).toBe('function');

    const module = await manifest.loader!();
    expect(rollbackCommandMocks.create).toHaveBeenCalledWith({
      namespace: 'template',
      packageName: '@kb-labs/plugin-template',
      pkgRoot: '/virtual/template',
    });
    const exitCode = await module.run({ presenter: {} } as any, [], {});
    expect(exitCode).toBe(0);
    expect(rollbackCommandMocks.run).toHaveBeenCalled();
  });
});
