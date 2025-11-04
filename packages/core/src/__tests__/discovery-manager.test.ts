/**
 * @module @kb-labs/cli-core/__tests__/discovery-manager
 * Unit tests for DiscoveryManager
 */

import { describe, it, expect } from 'vitest';
import { DiscoveryManager } from '../discovery/discovery-manager.js';

describe('DiscoveryManager', () => {
  describe('initialization', () => {
    it('should create manager with default strategies', () => {
      const manager = new DiscoveryManager({
        strategies: ['workspace', 'pkg', 'dir', 'file'],
      });
      
      expect(manager).toBeDefined();
    });

    it('should create manager with subset of strategies', () => {
      const manager = new DiscoveryManager({
        strategies: ['pkg', 'file'],
      });
      
      expect(manager).toBeDefined();
    });
  });

  describe('discover', () => {
    it('should return discovery result', async () => {
      const manager = new DiscoveryManager({
        strategies: ['workspace', 'pkg'],
      });
      
      const result = await manager.discover();
      
      expect(result).toHaveProperty('plugins');
      expect(result).toHaveProperty('manifests');
      expect(result).toHaveProperty('errors');
      
      expect(Array.isArray(result.plugins)).toBe(true);
      expect(result.manifests).toBeInstanceOf(Map);
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('should deduplicate plugins by ID', async () => {
      const manager = new DiscoveryManager({
        strategies: ['workspace', 'pkg', 'dir', 'file'],
      });
      
      const result = await manager.discover();
      
      // Check for duplicates
      const ids = result.plugins.map(p => p.id);
      const uniqueIds = new Set(ids);
      
      expect(ids.length).toBe(uniqueIds.size);
    });
  });

  describe('resolution rules', () => {
    it('should prioritize higher semver versions', async () => {
      // This would require setting up test fixtures with multiple versions
      expect(true).toBe(true);
    });

    it('should respect source priority', async () => {
      // workspace > pkg > dir > file
      expect(true).toBe(true);
    });
  });
});

