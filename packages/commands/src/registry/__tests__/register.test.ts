/**
 * Tests for manifest registration with shadowing logic
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerManifests } from '../register.js';
import type { DiscoveryResult, CommandManifest } from '../types.js';

// Mock dependencies
vi.mock('../availability.js', () => ({
  checkRequires: vi.fn(),
}));

vi.mock('../utils/logger.js', () => ({
  log: vi.fn(),
}));

describe('registerManifests', () => {
  const mockRegistry = {
    registerManifest: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should register manifests with availability check', async () => {
    const { checkRequires } = await vi.importMock('../availability.js') as { checkRequires: any };
    vi.mocked(checkRequires).mockReturnValue({ available: true });

    const manifests: CommandManifest[] = [{
      manifestVersion: '1.0',
      id: 'test:command',
      group: 'test',
      describe: 'Test command',
      loader: async () => ({ run: async () => 0 }),
    }];

    const discoveryResults: DiscoveryResult[] = [{
      source: 'workspace',
      packageName: '@kb-labs/test-package',
      manifestPath: '/test/manifest.js',
      pkgRoot: '/test/package',
      manifests,
    }];

    const registered = await registerManifests(discoveryResults, mockRegistry as any);

    expect(registered).toHaveLength(1);
    expect(registered[0]).toBeDefined();
    expect(registered[0]!.available).toBe(true);
    expect(registered[0]!.source).toBe('workspace');
    expect(mockRegistry.registerManifest).toHaveBeenCalledWith(registered[0]);
  });

  it('should handle unavailable commands with reason and hint', async () => {
    const { checkRequires } = await vi.importMock('../availability.js') as { checkRequires: any };
    vi.mocked(checkRequires).mockReturnValue({
      available: false,
      reason: 'Missing dependency: @kb-labs/missing-package',
      hint: 'Run: kb devlink apply',
    });

    const manifests: CommandManifest[] = [{
      manifestVersion: '1.0',
      id: 'test:command',
      group: 'test',
      describe: 'Test command',
      requires: ['@kb-labs/missing-package'],
      loader: async () => ({ run: async () => 0 }),
    }];

    const discoveryResults: DiscoveryResult[] = [{
      source: 'workspace',
      packageName: '@kb-labs/test-package',
      manifestPath: '/test/manifest.js',
      pkgRoot: '/test/package',
      manifests,
    }];

    const registered = await registerManifests(discoveryResults, mockRegistry as any);

    expect(registered).toHaveLength(1);
    expect(registered[0]).toBeDefined();
    expect(registered[0]!.available).toBe(false);
    expect(registered[0]!.unavailableReason).toBe('Missing dependency: @kb-labs/missing-package');
    expect(registered[0]!.hint).toBe('Run: kb devlink apply');
  });

  it('should handle shadowing: workspace shadows node_modules', async () => {
    const { checkRequires } = await vi.importMock('../availability.js') as { checkRequires: any };
    vi.mocked(checkRequires).mockReturnValue({ available: true });

    const workspaceManifest: CommandManifest = {
      manifestVersion: '1.0',
      id: 'test:command',
      group: 'test',
      describe: 'Workspace command',
      loader: async () => ({ run: async () => 0 }),
    };

    const nodeModulesManifest: CommandManifest = {
      manifestVersion: '1.0',
      id: 'test:command',
      group: 'test',
      describe: 'Node modules command',
      loader: async () => ({ run: async () => 0 }),
    };

    const discoveryResults: DiscoveryResult[] = [
      {
        source: 'node_modules',
        packageName: '@kb-labs/node-package',
        manifestPath: '/test/node-manifest.js',
        pkgRoot: '/test/node-package',
        manifests: [nodeModulesManifest],
      },
      {
        source: 'workspace',
        packageName: '@kb-labs/workspace-package',
        manifestPath: '/test/workspace-manifest.js',
        pkgRoot: '/test/workspace-package',
        manifests: [workspaceManifest],
      },
    ];

    const registered = await registerManifests(discoveryResults, mockRegistry as any);

    expect(registered).toHaveLength(2);
    
    // Workspace command should be active
    const workspaceCmd = registered.find(cmd => cmd.source === 'workspace');
    expect(workspaceCmd?.shadowed).toBe(false);
    expect(mockRegistry.registerManifest).toHaveBeenCalledWith(workspaceCmd);

    // Node modules command should be shadowed
    const nodeCmd = registered.find(cmd => cmd.source === 'node_modules');
    expect(nodeCmd?.shadowed).toBe(true);
  });

  it('should validate manifest schema', async () => {
    const { checkRequires } = await vi.importMock('../availability.js') as { checkRequires: any };
    vi.mocked(checkRequires).mockReturnValue({ available: true });

    const invalidManifest: CommandManifest = {
      manifestVersion: '1.0',
      id: 'test:command',
      group: 'test',
      describe: 'Test command',
      // Missing required loader
    } as any;

    const discoveryResults: DiscoveryResult[] = [{
      source: 'workspace',
      packageName: '@kb-labs/test-package',
      manifestPath: '/test/manifest.js',
      pkgRoot: '/test/package',
      manifests: [invalidManifest],
    }];

    await expect(registerManifests(discoveryResults, mockRegistry as any)).rejects.toThrow();
  });

  it('should validate flag definitions', async () => {
    const { checkRequires } = await vi.importMock('../availability.js') as { checkRequires: any };
    vi.mocked(checkRequires).mockReturnValue({ available: true });

    const manifestWithInvalidFlag: CommandManifest = {
      manifestVersion: '1.0',
      id: 'test:command',
      group: 'test',
      describe: 'Test command',
      flags: [{
        name: 'test-flag',
        type: 'string',
        alias: 'invalid-alias', // Invalid: should be single letter
      }],
      loader: async () => ({ run: async () => 0 }),
    };

    const discoveryResults: DiscoveryResult[] = [{
      source: 'workspace',
      packageName: '@kb-labs/test-package',
      manifestPath: '/test/manifest.js',
      pkgRoot: '/test/package',
      manifests: [manifestWithInvalidFlag],
    }];

    await expect(registerManifests(discoveryResults, mockRegistry as any)).rejects.toThrow();
  });
});
