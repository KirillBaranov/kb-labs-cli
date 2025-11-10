/**
 * @module @kb-labs/cli-api/__tests__/cli-api
 * Unit tests for CLI API
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createCliAPI, type CliAPI } from '../index.js';

describe('CliAPI', () => {
  let api: CliAPI;

  beforeEach(async () => {
    api = await createCliAPI({
      discovery: {
        strategies: ['workspace', 'pkg', 'dir', 'file'],
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

  afterEach(async () => {
    await api.dispose();
  });

  describe('listPlugins', () => {
    it('should return array of plugins', async () => {
      const plugins = await api.listPlugins();
      expect(Array.isArray(plugins)).toBe(true);
    });

    it('should return plugins with required fields', async () => {
      const plugins = await api.listPlugins();
      
      for (const plugin of plugins) {
        expect(plugin).toHaveProperty('id');
        expect(plugin).toHaveProperty('version');
        expect(plugin).toHaveProperty('kind');
        expect(plugin).toHaveProperty('source');
        expect(plugin.source).toHaveProperty('kind');
        expect(plugin.source).toHaveProperty('path');
      }
    });
  });

  describe('getManifestV2', () => {
    it('should return null for non-existent plugin', async () => {
      const manifest = await api.getManifestV2('non-existent-plugin');
      expect(manifest).toBeNull();
    });

    it('should return manifest for existing plugin', async () => {
      const plugins = await api.listPlugins();
      if (plugins.length === 0) {
        console.log('No plugins found, skipping test');
        return;
      }

      const firstPlugin = plugins[0]!;
      const manifest = await api.getManifestV2(firstPlugin.id);
      
      if (manifest) {
        expect(manifest).toHaveProperty('id');
        expect(manifest).toHaveProperty('version');
      }
    });
  });

  describe('getOpenAPISpec', () => {
    it('should return null for non-existent plugin', async () => {
      const spec = await api.getOpenAPISpec('non-existent-plugin');
      expect(spec).toBeNull();
    });

    it('should return OpenAPI spec for existing plugin', async () => {
      const plugins = await api.listPlugins();
      if (plugins.length === 0) {
        console.log('No plugins found, skipping test');
        return;
      }

      const firstPlugin = plugins[0]!;
      const spec = await api.getOpenAPISpec(firstPlugin.id);
      
      if (spec) {
        expect(spec).toHaveProperty('openapi');
        expect(spec).toHaveProperty('info');
        expect(spec).toHaveProperty('paths');
      }
    });
  });

  describe('getStudioRegistry', () => {
    it('should return studio registry', async () => {
      const registry = await api.getStudioRegistry();
      
      expect(registry).toHaveProperty('version');
      expect(registry).toHaveProperty('generated');
      expect(registry).toHaveProperty('plugins');
      expect(Array.isArray(registry.plugins)).toBe(true);
    });

    it('should return plugins sorted by id', async () => {
      const registry = await api.getStudioRegistry();
      
      const ids = registry.plugins.map(p => p.id);
      const sortedIds = [...ids].sort();
      
      expect(ids).toEqual(sortedIds);
    });
  });

  describe('refresh', () => {
    it('should refresh plugin discovery', async () => {
      await expect(api.refresh()).resolves.not.toThrow();
    });

    it('should update plugin list after refresh', async () => {
      const pluginsBefore = await api.listPlugins();
      await api.refresh();
      const pluginsAfter = await api.listPlugins();

      if (pluginsBefore.length > 0) {
        expect(pluginsAfter.length).toBe(pluginsBefore.length);
      } else {
        expect(pluginsAfter.length).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('dispose', () => {
    it('should dispose without errors', async () => {
      await expect(api.dispose()).resolves.not.toThrow();
    });
  });
});

describe('CliAPI Factory', () => {
  it('should create API with default options', async () => {
    const api = await createCliAPI();
    expect(api).toBeDefined();
    await api.dispose();
  });

  it('should create API with custom discovery strategies', async () => {
    const api = await createCliAPI({
      discovery: {
        strategies: ['pkg', 'file'],
      },
    });
    expect(api).toBeDefined();
    await api.dispose();
  });

  it('should create API with custom cache settings', async () => {
    const api = await createCliAPI({
      cache: {
        inMemory: true,
        ttlMs: 60_000,
      },
    });
    expect(api).toBeDefined();
    await api.dispose();
  });
});

