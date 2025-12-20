/**
 * @module @kb-labs/cli-api/modules/health/__tests__
 * Unit tests for health module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { PluginBrief } from '@kb-labs/cli-core';
import type { ManifestV3 } from '@kb-labs/plugin-contracts';
import type { RegistrySnapshot, RegistrySnapshotManifestEntry } from '../../snapshot/types.js';
import { HealthAggregator, type HealthAggregatorDeps, type RegistryError } from '../health-aggregator.js';
import { findGitRoot, getGitInfo, resetGitInfoCache } from '../git-info.js';

// ═══════════════════════════════════════════════════════════════════════════
// Git Info Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('findGitRoot', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `git-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
    resetGitInfoCache();
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    resetGitInfoCache();
  });

  it('should return null for empty roots', () => {
    expect(findGitRoot([])).toBeNull();
    expect(findGitRoot(undefined)).toBeNull();
  });

  it('should find git root when .git exists', () => {
    mkdirSync(join(tempDir, '.git'), { recursive: true });

    const result = findGitRoot([tempDir]);

    expect(result).toBe(tempDir);
  });

  it('should find git root in parent directory', () => {
    const childDir = join(tempDir, 'child', 'grandchild');
    mkdirSync(childDir, { recursive: true });
    mkdirSync(join(tempDir, '.git'), { recursive: true });

    const result = findGitRoot([childDir]);

    expect(result).toBe(tempDir);
  });

  it('should return null when no .git exists', () => {
    const result = findGitRoot([tempDir]);

    expect(result).toBeNull();
  });

  it('should check multiple roots and return first match', () => {
    const dir1 = join(tempDir, 'dir1');
    const dir2 = join(tempDir, 'dir2');
    mkdirSync(dir1, { recursive: true });
    mkdirSync(dir2, { recursive: true });
    mkdirSync(join(dir2, '.git'), { recursive: true });

    const result = findGitRoot([dir1, dir2]);

    expect(result).toBe(dir2);
  });
});

describe('getGitInfo', () => {
  let tempDir: string;
  const originalEnv = process.env;

  beforeEach(() => {
    tempDir = join(tmpdir(), `git-info-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
    resetGitInfoCache();
    process.env = { ...originalEnv };
    delete process.env.KB_GIT_SHA;
    delete process.env.KB_LABS_GIT_SHA;
    delete process.env.CI_COMMIT_SHA;
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    delete process.env.KB_GIT_DIRTY;
    delete process.env.CI_DIRTY;
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    resetGitInfoCache();
    process.env = originalEnv;
  });

  it('should return undefined when no git info available and cwd fallback fails', () => {
    // Mock process.cwd to return tempDir (which has no .git)
    const originalCwd = process.cwd;
    vi.spyOn(process, 'cwd').mockReturnValue(tempDir);

    try {
      const result = getGitInfo([tempDir]);
      expect(result).toBeUndefined();
    } finally {
      vi.mocked(process.cwd).mockRestore();
    }
  });

  it('should use environment variable KB_GIT_SHA', () => {
    process.env.KB_GIT_SHA = 'abc123';

    const result = getGitInfo([tempDir]);

    expect(result).toEqual({ sha: 'abc123', dirty: false });
  });

  it('should use CI_COMMIT_SHA environment variable', () => {
    process.env.CI_COMMIT_SHA = 'ci-sha-456';

    const result = getGitInfo([tempDir]);

    expect(result).toEqual({ sha: 'ci-sha-456', dirty: false });
  });

  it('should detect dirty state from environment', () => {
    process.env.KB_GIT_SHA = 'abc123';
    process.env.KB_GIT_DIRTY = 'true';

    const result = getGitInfo([tempDir]);

    expect(result).toEqual({ sha: 'abc123', dirty: true });
  });

  it('should read SHA from .git/HEAD when it contains a direct SHA', () => {
    const gitDir = join(tempDir, '.git');
    mkdirSync(gitDir, { recursive: true });
    writeFileSync(join(gitDir, 'HEAD'), 'abcdef1234567890', 'utf8');

    const result = getGitInfo([tempDir]);

    expect(result?.sha).toBe('abcdef1234567890');
  });

  it('should resolve ref from .git/HEAD', () => {
    const gitDir = join(tempDir, '.git');
    const refsDir = join(gitDir, 'refs', 'heads');
    mkdirSync(refsDir, { recursive: true });
    writeFileSync(join(gitDir, 'HEAD'), 'ref: refs/heads/main', 'utf8');
    writeFileSync(join(refsDir, 'main'), 'resolved-sha-789', 'utf8');

    const result = getGitInfo([tempDir]);

    expect(result?.sha).toBe('resolved-sha-789');
  });

  it('should cache git info', () => {
    process.env.KB_GIT_SHA = 'cached-sha';
    const result1 = getGitInfo([tempDir]);

    // Change env - should still return cached value
    process.env.KB_GIT_SHA = 'new-sha';
    const result2 = getGitInfo([tempDir]);

    expect(result1).toEqual(result2);
    expect(result2?.sha).toBe('cached-sha');
  });

  it('should clear cache with resetGitInfoCache', () => {
    process.env.KB_GIT_SHA = 'first-sha';
    const result1 = getGitInfo([tempDir]);

    resetGitInfoCache();
    process.env.KB_GIT_SHA = 'second-sha';
    const result2 = getGitInfo([tempDir]);

    expect(result1?.sha).toBe('first-sha');
    expect(result2?.sha).toBe('second-sha');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// HealthAggregator Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('HealthAggregator', () => {
  let mockDeps: HealthAggregatorDeps;
  let aggregator: HealthAggregator;

  beforeEach(() => {
    resetGitInfoCache();
    mockDeps = createMockDeps();
    aggregator = new HealthAggregator({ deps: mockDeps });
  });

  afterEach(() => {
    resetGitInfoCache();
  });

  describe('getSystemHealth', () => {
    it('should return valid health snapshot', async () => {
      const health = await aggregator.getSystemHealth();

      expect(health.schema).toBe('kb.health/1');
      expect(health.ts).toBeDefined();
      expect(health.uptimeSec).toBeGreaterThanOrEqual(0);
      expect(health.version).toBeDefined();
      expect(health.registry).toBeDefined();
      expect(health.status).toBeDefined();
      expect(health.components).toBeDefined();
    });

    it('should return healthy status when no errors', async () => {
      const health = await aggregator.getSystemHealth();

      expect(health.status).toBe('healthy');
      expect(health.registry.errors).toBe(0);
    });

    it('should return degraded status when registry has errors', async () => {
      mockDeps.getRegistryErrors = () => [
        { path: '/test/plugin', error: 'Load failed' },
      ];

      const health = await aggregator.getSystemHealth();

      expect(health.status).toBe('degraded');
      expect(health.registry.errors).toBe(1);
    });

    it('should return degraded status when snapshot is stale', async () => {
      mockDeps.getSnapshot = () => createMockSnapshot({ stale: true });

      const health = await aggregator.getSystemHealth();

      expect(health.status).toBe('degraded');
    });

    it('should return degraded status when snapshot is partial', async () => {
      mockDeps.getSnapshot = () => createMockSnapshot({ partial: true });

      const health = await aggregator.getSystemHealth();

      expect(health.status).toBe('degraded');
    });

    it('should count plugins with REST routes', async () => {
      mockDeps.listPlugins = async () => [
        createMockPlugin('plugin-1'),
        createMockPlugin('plugin-2'),
      ];
      mockDeps.getManifest = (id) => {
        if (id === 'plugin-1') {
          return createMockManifest({ rest: { routes: [{ path: '/api', method: 'GET' }] } });
        }
        return createMockManifest();
      };

      const health = await aggregator.getSystemHealth();

      expect(health.registry.withRest).toBe(1);
    });

    it('should count plugins with Studio widgets', async () => {
      mockDeps.listPlugins = async () => [
        createMockPlugin('plugin-1'),
        createMockPlugin('plugin-2'),
      ];
      mockDeps.getManifest = (id) => {
        if (id === 'plugin-1') {
          return createMockManifest({ studio: { widgets: [{ id: 'widget-1', type: 'panel' }] } });
        }
        if (id === 'plugin-2') {
          return createMockManifest({ studio: { widgets: [{ id: 'widget-2', type: 'panel' }] } });
        }
        return createMockManifest();
      };

      const health = await aggregator.getSystemHealth();

      expect(health.registry.withStudio).toBe(2);
    });

    it('should map errors to plugins', async () => {
      mockDeps.listPlugins = async () => [
        createMockPlugin('plugin-1', '/path/to/plugin-1'),
      ];
      mockDeps.getRegistryErrors = () => [
        { path: '/path/to/plugin-1', error: 'Plugin load failed' },
      ];

      const health = await aggregator.getSystemHealth();

      expect(health.components[0]?.lastError).toBe('Plugin load failed');
    });

    it('should include orphan errors in meta', async () => {
      mockDeps.listPlugins = async () => [];
      mockDeps.getRegistryErrors = () => [
        { path: '/unknown/path', error: 'Unknown error' },
      ];

      const health = await aggregator.getSystemHealth();

      expect(health.meta?.orphanErrors).toContain('Unknown error');
    });

    it('should accept custom uptime', async () => {
      const health = await aggregator.getSystemHealth({ uptimeSec: 3600 });

      expect(health.uptimeSec).toBe(3600);
    });

    it('should accept version overrides', async () => {
      const health = await aggregator.getSystemHealth({
        version: {
          kbLabs: '2.0.0',
          rest: '1.5.0',
        },
      });

      expect(health.version.kbLabs).toBe('2.0.0');
      expect(health.version.rest).toBe('1.5.0');
    });

    it('should include meta information', async () => {
      const health = await aggregator.getSystemHealth({
        meta: { customField: 'value' },
      });

      expect(health.meta?.customField).toBe('value');
      expect(health.meta?.registryInitialized).toBe(true);
    });
  });

  describe('consumer mode', () => {
    beforeEach(() => {
      mockDeps.mode = 'consumer';
      aggregator = new HealthAggregator({ deps: mockDeps });
    });

    it('should use snapshot manifests in consumer mode', async () => {
      const manifestEntry: RegistrySnapshotManifestEntry = {
        pluginId: 'test-plugin',
        manifest: createMockManifest({ rest: { routes: [{ path: '/test', method: 'GET' }] } }) as ManifestV3,
        pluginRoot: '/test',
        source: { kind: 'pkg', path: '/test' },
      };

      mockDeps.getSnapshotManifestEntry = () => manifestEntry;
      mockDeps.listPlugins = async () => [createMockPlugin('test-plugin')];

      const health = await aggregator.getSystemHealth();

      expect(health.registry.withRest).toBe(1);
    });

    it('should not count registry errors in consumer mode', async () => {
      mockDeps.getRegistryErrors = () => [
        { path: '/test', error: 'Error' },
      ];

      const health = await aggregator.getSystemHealth();

      expect(health.registry.errors).toBe(0);
    });

    it('should determine initialization from snapshot.partial in consumer mode', async () => {
      mockDeps.getSnapshot = () => createMockSnapshot({ partial: false });
      mockDeps.isRegistryInitialized = () => false; // Should be ignored

      const health = await aggregator.getSystemHealth();

      expect(health.meta?.registryInitialized).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════

function createMockDeps(): HealthAggregatorDeps {
  return {
    getSnapshot: () => createMockSnapshot(),
    listPlugins: async () => [],
    getRegistryErrors: () => [],
    getManifest: () => undefined,
    getSnapshotManifestEntry: () => undefined,
    isRegistryInitialized: () => true,
    mode: 'producer',
    cliVersion: '1.0.0',
  };
}

function createMockSnapshot(overrides?: Partial<RegistrySnapshot>): RegistrySnapshot {
  const now = new Date().toISOString();
  return {
    schema: 'kb.registry/1',
    rev: 1,
    version: '1',
    generatedAt: now,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    ttlMs: 60_000,
    partial: false,
    stale: false,
    source: {
      cliVersion: '1.0.0',
      cwd: '/test',
    },
    plugins: [],
    manifests: [],
    ts: Date.now(),
    checksum: 'mock-checksum',
    checksumAlgorithm: 'sha256',
    ...overrides,
  };
}

function createMockPlugin(id: string, path = `/path/to/${id}`): PluginBrief {
  return {
    id,
    version: '1.0.0',
    kind: 'plugin',
    source: {
      kind: 'pkg',
      path,
    },
  };
}

function createMockManifest(overrides?: Record<string, any>): ManifestV3 {
  return {
    id: 'test-plugin',
    version: '1.0.0',
    ...overrides,
  } as ManifestV3;
}
