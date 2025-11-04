/**
 * @module @kb-labs/cli-core/__tests__/plugin-registry
 * Unit tests for PluginRegistry
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PluginRegistry } from '../registry/plugin-registry.js';

describe('PluginRegistry', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry({
      strategies: ['workspace', 'pkg', 'dir', 'file'],
      preferV2: true,
      allowDowngrade: false,
    });
  });

  describe('initialization', () => {
    it('should create registry instance', () => {
      expect(registry).toBeDefined();
      expect(registry).toBeInstanceOf(PluginRegistry);
    });

    it('should start with empty plugin list', () => {
      const plugins = registry.list();
      expect(Array.isArray(plugins)).toBe(true);
      expect(plugins.length).toBe(0);
    });
  });

  describe('snapshot', () => {
    it('should return valid snapshot', () => {
      const snapshot = registry.snapshot;
      
      expect(snapshot).toHaveProperty('version');
      expect(snapshot).toHaveProperty('plugins');
      expect(snapshot).toHaveProperty('ts');
      
      expect(Array.isArray(snapshot.plugins)).toBe(true);
      expect(typeof snapshot.ts).toBe('number');
    });

    it('should increment version on refresh', async () => {
      const v1 = registry.snapshot.version;
      await registry.refresh();
      const v2 = registry.snapshot.version;
      
      expect(Number(v2)).toBeGreaterThan(Number(v1));
    });
  });

  describe('onChange listeners', () => {
    it('should register onChange listener', () => {
      let called = false;
      const unsubscribe = registry.onChange(() => {
        called = true;
      });

      expect(typeof unsubscribe).toBe('function');
    });

    it('should unsubscribe listener', async () => {
      let callCount = 0;
      const unsubscribe = registry.onChange(() => {
        callCount++;
      });

      await registry.refresh();
      const firstCount = callCount;

      unsubscribe();
      await registry.refresh();
      const secondCount = callCount;

      // After unsubscribe, count should not increase
      expect(secondCount).toBe(firstCount);
    });
  });

  describe('explain', () => {
    it('should return explanation for non-existent plugin', () => {
      const explanation = registry.explain('non-existent');
      
      expect(explanation).toHaveProperty('pluginId', 'non-existent');
      expect(explanation).toHaveProperty('selected');
      expect(explanation).toHaveProperty('candidates');
      expect(explanation).toHaveProperty('resolutionRules');
    });

    it('should include resolution rules', () => {
      const explanation = registry.explain('test');
      
      expect(Array.isArray(explanation.resolutionRules)).toBe(true);
      expect(explanation.resolutionRules.length).toBeGreaterThan(0);
    });
  });

  describe('dispose', () => {
    it('should dispose without errors', async () => {
      await expect(registry.dispose()).resolves.not.toThrow();
    });

    it('should clear plugins on dispose', async () => {
      await registry.refresh();
      await registry.dispose();
      
      const plugins = registry.list();
      expect(plugins.length).toBe(0);
    });
  });
});

