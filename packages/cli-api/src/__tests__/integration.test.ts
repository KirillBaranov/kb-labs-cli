/**
 * @module @kb-labs/cli-api/__tests__/integration
 * Integration tests for CLI API
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createCliAPI, type CliAPI } from '../index';
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

  describe('Discovery', () => {
    /**
     * Helper: create a fixture plugin directory with package.json + manifest.mjs.
     * The `pkg` discovery strategy reads package.json#kbLabs.manifest to locate
     * the manifest module, then dynamically imports it.
     */
    function createFixturePlugin(
      dir: string,
      opts: { id: string; version: string; name?: string },
    ): void {
      fs.mkdirSync(dir, { recursive: true });
      // package.json with kbLabs.manifest pointing to manifest.mjs
      fs.writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify({
          name: opts.id,
          version: opts.version,
          kbLabs: { manifest: './manifest.mjs' },
        }),
      );
      // manifest.mjs — ES module exporting the V3 manifest as default
      fs.writeFileSync(
        path.join(dir, 'manifest.mjs'),
        [
          'export default {',
          `  schema: 'kb.plugin/3',`,
          `  id: '${opts.id}',`,
          `  version: '${opts.version}',`,
          opts.name ? `  display: { name: '${opts.name}' },` : '',
          '};',
        ]
          .filter(Boolean)
          .join('\n') + '\n',
      );
    }

    it('should discover a plugin via pkg strategy', async () => {
      const pluginDir = path.join(testRoot, 'fixture-plugin');
      createFixturePlugin(pluginDir, {
        id: '@kb-labs/test-fixture-plugin',
        version: '1.0.0',
        name: 'Test Fixture Plugin',
      });

      const fixtureApi = await createCliAPI({
        discovery: {
          strategies: ['pkg'],
          roots: [pluginDir],
        },
        cache: { inMemory: true },
        logger: { level: 'silent' },
      });

      try {
        const plugins = await fixtureApi.listPlugins();
        const found = plugins.find((p) => p.id === '@kb-labs/test-fixture-plugin');
        expect(found).toBeDefined();
        expect(found?.version).toBe('1.0.0');
        expect(found?.kind).toBe('v3');
      } finally {
        await fixtureApi.dispose();
        fs.rmSync(pluginDir, { recursive: true, force: true });
      }
    });

    it('should return empty list when pkg has no kbLabs.manifest', async () => {
      const emptyDir = path.join(testRoot, 'empty-plugin');
      fs.mkdirSync(emptyDir, { recursive: true });
      // package.json without kbLabs.manifest — not a plugin
      fs.writeFileSync(
        path.join(emptyDir, 'package.json'),
        JSON.stringify({ name: 'not-a-plugin', version: '1.0.0' }),
      );

      const emptyApi = await createCliAPI({
        discovery: {
          strategies: ['pkg'],
          roots: [emptyDir],
        },
        cache: { inMemory: true },
        logger: { level: 'silent' },
      });

      try {
        const plugins = await emptyApi.listPlugins();
        expect(Array.isArray(plugins)).toBe(true);
        expect(plugins.length).toBe(0);
      } finally {
        await emptyApi.dispose();
        fs.rmSync(emptyDir, { recursive: true, force: true });
      }
    });

    it('discovered plugin has required PluginBrief fields', async () => {
      const pluginDir = path.join(testRoot, 'brief-check-plugin');
      createFixturePlugin(pluginDir, {
        id: '@kb-labs/brief-check',
        version: '2.1.0',
        name: 'Brief Check Plugin',
      });

      const briefApi = await createCliAPI({
        discovery: {
          strategies: ['pkg'],
          roots: [pluginDir],
        },
        cache: { inMemory: true },
        logger: { level: 'silent' },
      });

      try {
        const plugins = await briefApi.listPlugins();
        const found = plugins.find((p) => p.id === '@kb-labs/brief-check');
        expect(found).toBeDefined();
        // All required PluginBrief fields must be present
        expect(typeof found?.id).toBe('string');
        expect(typeof found?.version).toBe('string');
        expect(found?.kind === 'v3' || found?.kind === 'v2').toBe(true);
        expect(found?.source).toBeDefined();
        expect(typeof found?.source.kind).toBe('string');
        expect(typeof found?.source.path).toBe('string');
      } finally {
        await briefApi.dispose();
        fs.rmSync(pluginDir, { recursive: true, force: true });
      }
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

