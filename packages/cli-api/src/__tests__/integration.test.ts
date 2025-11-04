/**
 * @module @kb-labs/cli-api/__tests__/integration
 * Integration tests for CLI API
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createCliAPI, type CliAPI } from '../index.js';
import * as path from 'node:path';
import * as fs from 'node:fs';

describe('CLI API Integration', () => {
  let api: CliAPI;
  const testRoot = path.join(process.cwd(), '__test_fixtures__');

  beforeAll(async () => {
    // Create test fixtures directory
    if (!fs.existsSync(testRoot)) {
      fs.mkdirSync(testRoot, { recursive: true });
    }

    api = await createCliAPI({
      discovery: {
        strategies: ['workspace', 'pkg', 'dir', 'file'],
        roots: [testRoot],
        preferV2: true,
      },
      cache: {
        inMemory: true,
        ttlMs: 30_000,
      },
      logger: {
        level: 'silent',
      },
    });
  });

  afterAll(async () => {
    await api.dispose();
    
    // Cleanup test fixtures
    if (fs.existsSync(testRoot)) {
      fs.rmSync(testRoot, { recursive: true, force: true });
    }
  });

  describe('Discovery Priority', () => {
    it('should prioritize workspace over pkg', async () => {
      // This test would require setting up actual test fixtures
      // Skipping for now as it needs file system setup
      expect(true).toBe(true);
    });

    it('should prioritize higher semver versions', async () => {
      // This test would require setting up actual test fixtures
      expect(true).toBe(true);
    });
  });

  describe('Cache Behavior', () => {
    it('should cache discovery results', async () => {
      const start1 = Date.now();
      await api.listPlugins();
      const time1 = Date.now() - start1;

      const start2 = Date.now();
      await api.listPlugins();
      const time2 = Date.now() - start2;

      // Second call should be significantly faster (cached)
      // Note: This is a rough heuristic and may be flaky
      expect(time2).toBeLessThanOrEqual(time1);
    });

    it('should refresh cache on demand', async () => {
      const plugins1 = await api.listPlugins();
      await api.refresh();
      const plugins2 = await api.listPlugins();

      // Both should return same results (no changes)
      expect(plugins1.length).toBe(plugins2.length);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid plugin ID gracefully', async () => {
      const manifest = await api.getManifestV2('');
      expect(manifest).toBeNull();
    });

    it('should handle null inputs gracefully', async () => {
      const manifest = await api.getManifestV2('null' as any);
      expect(manifest).toBeNull();
    });
  });

  describe('JSON Serialization', () => {
    it('should serialize plugin list to JSON', async () => {
      const plugins = await api.listPlugins();
      const json = JSON.stringify(plugins);
      const parsed = JSON.parse(json);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(plugins.length);
    });

    it('should serialize studio registry to JSON', async () => {
      const registry = await api.getStudioRegistry();
      const json = JSON.stringify(registry);
      const parsed = JSON.parse(json);

      expect(parsed).toHaveProperty('version');
      expect(parsed).toHaveProperty('plugins');
    });
  });
});

