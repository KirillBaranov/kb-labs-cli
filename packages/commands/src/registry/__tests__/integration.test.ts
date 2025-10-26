/**
 * Integration tests for complete registry system
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { discoverManifests } from '../discover.js';
import { registerManifests } from '../register.js';
import { runCommand } from '../run.js';
import { renderHelp } from '../../utils/help-generator.js';
import type { CommandManifest } from '../types.js';

// Mock all dependencies
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

vi.mock('../availability.js', () => ({
  checkRequires: vi.fn(),
}));

describe('Registry Integration', () => {
  const mockRegistry = {
    registerManifest: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle complete workflow: discover -> register -> run', async () => {
    const { readFile } = await import('node:fs/promises');
    const { parse } = await import('yaml');
    const { glob } = await import('glob');
    const { checkRequires } = await vi.importMock('../availability.js') as { checkRequires: any };
    vi.mocked(checkRequires).mockReturnValue({ available: true });

    // Mock workspace discovery
    vi.mocked(readFile).mockResolvedValueOnce('packages:\n  - "packages/*"');
    vi.mocked(parse).mockReturnValue({ packages: ['packages/*'] });
    vi.mocked(glob).mockResolvedValue(['packages/test-package']);

    // Mock package.json
    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify({
      name: '@kb-labs/test-package',
      kb: { commandsManifest: './dist/cli.manifest.js' },
    }));

    // Mock manifest file
    const mockManifest: CommandManifest = {
      manifestVersion: '1.0',
      id: 'test:command',
      group: 'test',
      describe: 'Test command',
      flags: [
        { name: 'verbose', type: 'boolean', alias: 'v' },
      ],
      loader: async () => ({
        run: async (ctx: any, argv: string[], flags: any) => {
          if (flags.verbose) {
            ctx.presenter.info('Verbose mode enabled');
          }
          return 0;
        },
      }),
    };

    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify({
      commands: [mockManifest],
    }));

    // Mock availability check
    checkRequires.mockReturnValue({ available: true });

    // 1. Discover manifests
    const discoveryResults = await discoverManifests('/test/cwd', false);
    expect(discoveryResults).toHaveLength(1);
    expect(discoveryResults[0]).toBeDefined();
    expect(discoveryResults[0]!.source).toBe('workspace');

    // 2. Register manifests
    const registered = registerManifests(discoveryResults, mockRegistry as any);
    expect(registered).toHaveLength(1);
    expect(registered[0]).toBeDefined();
    expect(registered[0]!.available).toBe(true);
    expect(mockRegistry.registerManifest).toHaveBeenCalledWith(registered[0]);

    // 3. Run command
    const mockCtx = {
      presenter: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        json: vi.fn(),
      },
    };

    const result = await runCommand(registered[0]!, mockCtx, ['arg1'], { verbose: true });
    expect(result).toBe(0);
    expect(mockCtx.presenter.info).toHaveBeenCalledWith('Verbose mode enabled');

    // 4. Generate help
    const helpText = renderHelp(registered, { json: false, onlyAvailable: false });
    expect(helpText).toContain('test:command');
    expect(helpText).toContain('Test command');

    const helpJson = renderHelp(registered, { json: true, onlyAvailable: false });
    expect(helpJson).toHaveProperty('groups');
    expect((helpJson as any).groups[0].commands[0].id).toBe('test:command');
  });

  it('should handle unavailable command with proper error handling', async () => {
    const { readFile } = await import('node:fs/promises');
    const { parse } = await import('yaml');
    const { glob } = await import('glob');
    const { checkRequires } = await vi.importMock('../availability.js') as { checkRequires: any };
    vi.mocked(checkRequires).mockReturnValue({ available: true });

    // Mock workspace discovery
    vi.mocked(readFile).mockResolvedValueOnce('packages:\n  - "packages/*"');
    vi.mocked(parse).mockReturnValue({ packages: ['packages/*'] });
    vi.mocked(glob).mockResolvedValue(['packages/test-package']);

    // Mock package.json
    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify({
      name: '@kb-labs/test-package',
      kb: { commandsManifest: './dist/cli.manifest.js' },
    }));

    // Mock manifest with missing dependency
    const mockManifest: CommandManifest = {
      manifestVersion: '1.0',
      id: 'test:command',
      group: 'test',
      describe: 'Test command',
      requires: ['@kb-labs/missing-package'],
      loader: async () => ({ run: async () => 0 }),
    };

    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify({
      commands: [mockManifest],
    }));

    // Mock availability check - missing dependency
    checkRequires.mockReturnValue({
      available: false,
      reason: 'Missing dependency: @kb-labs/missing-package',
      hint: 'Run: kb devlink apply',
    });

    // 1. Discover manifests
    const discoveryResults = await discoverManifests('/test/cwd', false);
    expect(discoveryResults).toHaveLength(1);

    // 2. Register manifests
    const registered = registerManifests(discoveryResults, mockRegistry as any);
    expect(registered).toHaveLength(1);
    expect(registered[0]).toBeDefined();
    expect(registered[0]!.available).toBe(false);
    expect(registered[0]!.unavailableReason).toBe('Missing dependency: @kb-labs/missing-package');

    // 3. Run command - should return exit code 2
    const mockCtx = {
      presenter: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        json: vi.fn(),
      },
    };

    const result = await runCommand(registered[0]!, mockCtx, [], { json: true });
    expect(result).toBe(2);
    expect(mockCtx.presenter.json).toHaveBeenCalledWith({
      ok: false,
      available: false,
      command: 'test:command',
      reason: 'Missing dependency: @kb-labs/missing-package',
      hint: 'Run: kb devlink apply',
    });

    // 4. Generate help - should show unavailable command
    const helpJson = renderHelp(registered, { json: true, onlyAvailable: false });
    const command = (helpJson as any).groups[0].commands[0];
    expect(command.available).toBe(false);
    expect(command.reason).toBe('Missing dependency: @kb-labs/missing-package');
  });

  it('should handle shadowing between workspace and node_modules', async () => {
    const { readFile } = await import('node:fs/promises');
    const { parse } = await import('yaml');
    const { glob } = await import('glob');
    const { checkRequires } = await vi.importMock('../availability.js') as { checkRequires: any };
    vi.mocked(checkRequires).mockReturnValue({ available: true });

    // Mock workspace discovery
    vi.mocked(readFile).mockResolvedValueOnce('packages:\n  - "packages/*"');
    vi.mocked(parse).mockReturnValue({ packages: ['packages/*'] });
    vi.mocked(glob).mockResolvedValue(['packages/workspace-package']);

    // Mock workspace package.json
    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify({
      name: '@kb-labs/workspace-package',
      kb: { commandsManifest: './dist/cli.manifest.js' },
    }));

    // Mock workspace manifest
    const workspaceManifest: CommandManifest = {
      manifestVersion: '1.0',
      id: 'test:command',
      group: 'test',
      describe: 'Workspace command',
      loader: async () => ({ run: async () => 0 }),
    };

    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify({
      commands: [workspaceManifest],
    }));

    // Mock node_modules discovery
    vi.mocked(readFile).mockRejectedValueOnce(new Error('ENOENT')); // No current package
    vi.mocked(readFile).mockRejectedValueOnce(new Error('ENOENT')); // No current package manifest

    // Mock node_modules directory
    const { readdir } = await import('node:fs/promises');
    vi.mocked(readdir).mockResolvedValueOnce([
      { name: 'node-package', isDirectory: () => true } as any,
    ]);

    // Mock node_modules package.json
    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify({
      name: '@kb-labs/node-package',
      kb: { commandsManifest: './dist/cli.manifest.js' },
    }));

    // Mock node_modules manifest
    const nodeManifest: CommandManifest = {
      manifestVersion: '1.0',
      id: 'test:command',
      group: 'test',
      describe: 'Node modules command',
      loader: async () => ({ run: async () => 0 }),
    };

    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify({
      commands: [nodeManifest],
    }));

    // Mock availability check
    checkRequires.mockReturnValue({ available: true });

    // 1. Discover manifests
    const discoveryResults = await discoverManifests('/test/cwd', false);
    expect(discoveryResults).toHaveLength(2);

    // 2. Register manifests
    const registered = registerManifests(discoveryResults, mockRegistry as any);
    expect(registered).toHaveLength(2);

    // Workspace command should be active
    const workspaceCmd = registered.find(cmd => cmd.source === 'workspace');
    expect(workspaceCmd?.shadowed).toBe(false);
    expect(mockRegistry.registerManifest).toHaveBeenCalledWith(workspaceCmd);

    // Node modules command should be shadowed
    const nodeCmd = registered.find(cmd => cmd.source === 'node_modules');
    expect(nodeCmd?.shadowed).toBe(true);

    // 3. Generate help - should show shadowing info
    const helpJson = renderHelp(registered, { json: true, onlyAvailable: false });
    const commands = (helpJson as any).groups[0].commands;
    expect(commands).toHaveLength(2);

    const activeCmd = commands.find((c: any) => c.source === 'workspace');
    expect(activeCmd.shadowed).toBe(false);

    const shadowedCmd = commands.find((c: any) => c.source === 'node_modules');
    expect(shadowedCmd.shadowed).toBe(true);
  });
});
