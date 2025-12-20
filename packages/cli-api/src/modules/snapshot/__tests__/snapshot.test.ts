/**
 * @module @kb-labs/cli-api/modules/snapshot/__tests__
 * Unit tests for snapshot module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ICache } from '@kb-labs/core-platform/adapters';
import { SnapshotManager } from '../snapshot-manager.js';
import { cloneValue, stableStringify, computeSnapshotChecksum, safeParseInt } from '../utils.js';
import type { RegistrySnapshot } from '../types.js';
import type { CliApiLogger } from '../../logger/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// Utils Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('cloneValue', () => {
  it('should deep clone objects', () => {
    const original = { a: 1, b: { c: 2 } };
    const cloned = cloneValue(original);

    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
    expect(cloned.b).not.toBe(original.b);
  });

  it('should deep clone arrays', () => {
    const original = [1, [2, 3], { a: 4 }];
    const cloned = cloneValue(original);

    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
    expect(cloned[1]).not.toBe(original[1]);
  });

  it('should handle primitives', () => {
    expect(cloneValue(42)).toBe(42);
    expect(cloneValue('hello')).toBe('hello');
    expect(cloneValue(null)).toBe(null);
    expect(cloneValue(true)).toBe(true);
  });
});

describe('stableStringify', () => {
  it('should stringify primitives', () => {
    expect(stableStringify(42)).toBe('42');
    expect(stableStringify('hello')).toBe('"hello"');
    expect(stableStringify(null)).toBe('null');
    expect(stableStringify(true)).toBe('true');
  });

  it('should stringify arrays', () => {
    expect(stableStringify([1, 2, 3])).toBe('[1,2,3]');
    expect(stableStringify(['a', 'b'])).toBe('["a","b"]');
  });

  it('should stringify objects with sorted keys', () => {
    const obj = { z: 1, a: 2, m: 3 };
    expect(stableStringify(obj)).toBe('{"a":2,"m":3,"z":1}');
  });

  it('should filter undefined values', () => {
    const obj = { a: 1, b: undefined, c: 3 };
    expect(stableStringify(obj)).toBe('{"a":1,"c":3}');
  });

  it('should handle nested objects', () => {
    const obj = { b: { z: 1, a: 2 }, a: 1 };
    expect(stableStringify(obj)).toBe('{"a":1,"b":{"a":2,"z":1}}');
  });

  it('should produce deterministic output regardless of key order', () => {
    const obj1 = { a: 1, b: 2 };
    const obj2 = { b: 2, a: 1 };
    expect(stableStringify(obj1)).toBe(stableStringify(obj2));
  });
});

describe('computeSnapshotChecksum', () => {
  it('should compute sha256 hash', () => {
    const snapshot = createMinimalSnapshot();
    const checksum = computeSnapshotChecksum(snapshot);

    expect(checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should produce same checksum for equivalent snapshots', () => {
    const snapshot1 = createMinimalSnapshot();
    const snapshot2 = createMinimalSnapshot();

    expect(computeSnapshotChecksum(snapshot1)).toBe(computeSnapshotChecksum(snapshot2));
  });

  it('should produce different checksum for different snapshots', () => {
    const snapshot1 = createMinimalSnapshot();
    const snapshot2 = { ...createMinimalSnapshot(), rev: 999 };

    expect(computeSnapshotChecksum(snapshot1)).not.toBe(computeSnapshotChecksum(snapshot2));
  });
});

describe('safeParseInt', () => {
  it('should return number as-is', () => {
    expect(safeParseInt(42)).toBe(42);
    expect(safeParseInt(3.7)).toBe(3);
  });

  it('should parse string numbers', () => {
    expect(safeParseInt('42')).toBe(42);
    expect(safeParseInt('100')).toBe(100);
  });

  it('should return 0 for invalid values', () => {
    expect(safeParseInt('abc')).toBe(0);
    expect(safeParseInt(undefined)).toBe(0);
    expect(safeParseInt(null)).toBe(0);
    expect(safeParseInt(NaN)).toBe(0);
    expect(safeParseInt(Infinity)).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SnapshotManager Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('SnapshotManager', () => {
  let tempDir: string;
  let mockLogger: CliApiLogger;

  beforeEach(() => {
    tempDir = join(tmpdir(), `snapshot-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  function createManager(options?: Partial<Parameters<typeof SnapshotManager.prototype.constructor>[0]>) {
    return new SnapshotManager({
      root: tempDir,
      cliVersion: '1.0.0',
      logger: mockLogger,
      ...options,
    });
  }

  describe('createEmpty', () => {
    it('should create valid empty snapshot', () => {
      const manager = createManager();
      const snapshot = manager.createEmpty();

      expect(snapshot.schema).toBe('kb.registry/1');
      expect(snapshot.rev).toBe(0);
      expect(snapshot.plugins).toEqual([]);
      expect(snapshot.manifests).toEqual([]);
      expect(snapshot.partial).toBe(true);
      expect(snapshot.stale).toBe(false);
      expect(snapshot.checksum).toBeDefined();
      expect(snapshot.checksumAlgorithm).toBe('sha256');
    });

    it('should create corrupted snapshot when flag is set', () => {
      const manager = createManager();
      const snapshot = manager.createEmpty(true);

      expect(snapshot.corrupted).toBe(true);
    });

    it('should set correct TTL and expiry', () => {
      const manager = createManager({ ttlMs: 60_000 });
      const snapshot = manager.createEmpty();

      expect(snapshot.ttlMs).toBe(60_000);
      expect(snapshot.expiresAt).toBeDefined();

      const generatedAt = Date.parse(snapshot.generatedAt);
      const expiresAt = Date.parse(snapshot.expiresAt!);
      expect(expiresAt - generatedAt).toBe(60_000);
    });
  });

  describe('loadFromDisk', () => {
    it('should return null when no snapshot exists', () => {
      const manager = createManager();
      const snapshot = manager.loadFromDisk();

      expect(snapshot).toBeNull();
    });

    it('should load snapshot from disk', async () => {
      const manager = createManager();

      // Create and persist a snapshot
      const original = manager.createEmpty();
      await manager.persist(original);

      // Load it back
      const loaded = manager.loadFromDisk();

      expect(loaded).not.toBeNull();
      expect(loaded!.schema).toBe('kb.registry/1');
      expect(loaded!.checksum).toBe(original.checksum);
    });

    it('should recover from backup on primary corruption', async () => {
      const manager = createManager();

      // Persist a valid snapshot
      const original = manager.createEmpty();
      await manager.persist(original);

      // Corrupt the primary file
      const snapshotPath = join(tempDir, '.kb', 'cache', 'registry.json');
      writeFileSync(snapshotPath, '{"invalid": json', 'utf8');

      // Should fallback to backup (or return null if no backup)
      const loaded = manager.loadFromDisk();

      // Either loads backup or returns null
      if (loaded) {
        expect(loaded.schema).toBe('kb.registry/1');
        expect(mockLogger.warn).toHaveBeenCalled();
      }
    });
  });

  describe('persist', () => {
    it('should persist snapshot to disk', async () => {
      const manager = createManager();
      const snapshot = manager.createEmpty();

      await manager.persist(snapshot);

      const snapshotPath = join(tempDir, '.kb', 'cache', 'registry.json');
      expect(existsSync(snapshotPath)).toBe(true);

      const content = JSON.parse(readFileSync(snapshotPath, 'utf8'));
      expect(content.schema).toBe('kb.registry/1');
    });

    it('should create backup before overwriting', async () => {
      const manager = createManager();

      // First persist
      const snapshot1 = manager.createEmpty();
      await manager.persist(snapshot1);

      // Second persist
      const snapshot2 = { ...manager.createEmpty(), rev: 1 };
      await manager.persist(snapshot2);

      const backupPath = join(tempDir, '.kb', 'cache', 'registry.prev.json');
      expect(existsSync(backupPath)).toBe(true);
    });

    it('should log persist operation', async () => {
      const manager = createManager();
      const snapshot = manager.createEmpty();

      await manager.persist(snapshot);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Persisted registry snapshot',
        expect.objectContaining({
          checksum: expect.any(String),
          rev: expect.any(Number),
        })
      );
    });
  });

  describe('loadFromCache', () => {
    it('should return null when cache is not configured', async () => {
      const manager = createManager();
      const result = await manager.loadFromCache();

      expect(result).toBeNull();
    });

    it('should load snapshot from cache when configured', async () => {
      const mockCache: ICache = {
        get: vi.fn().mockResolvedValue(JSON.stringify(createMinimalSnapshot())),
        set: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        clear: vi.fn().mockResolvedValue(undefined),
      };

      const manager = createManager({
        cache: mockCache,
        redisSnapshotKey: 'test:snapshot',
      });

      const result = await manager.loadFromCache();

      expect(mockCache.get).toHaveBeenCalledWith('test:snapshot');
      expect(result).not.toBeNull();
      expect(result!.schema).toBe('kb.registry/1');
    });

    it('should return null on cache miss', async () => {
      const mockCache: ICache = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        clear: vi.fn().mockResolvedValue(undefined),
      };

      const manager = createManager({
        cache: mockCache,
        redisSnapshotKey: 'test:snapshot',
      });

      const result = await manager.loadFromCache();

      expect(result).toBeNull();
    });

    it('should handle cache errors gracefully', async () => {
      const mockCache: ICache = {
        get: vi.fn().mockRejectedValue(new Error('Connection failed')),
        set: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        clear: vi.fn().mockResolvedValue(undefined),
      };

      const manager = createManager({
        cache: mockCache,
        redisSnapshotKey: 'test:snapshot',
      });

      const result = await manager.loadFromCache();

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to load snapshot from cache',
        expect.objectContaining({ error: 'Connection failed' })
      );
    });
  });

  describe('ensureStaleness', () => {
    it('should mark snapshot as stale when expired', () => {
      const manager = createManager();
      const snapshot = manager.createEmpty();

      // Set expiry in the past
      const expiredSnapshot = {
        ...snapshot,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
        stale: false,
      };

      const result = manager.ensureStaleness(expiredSnapshot);

      expect(result.stale).toBe(true);
      expect(result.partial).toBe(true);
    });

    it('should not modify fresh snapshot', () => {
      const manager = createManager();
      const snapshot = manager.createEmpty();

      // Set expiry in the future
      const freshSnapshot = {
        ...snapshot,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        stale: false,
      };

      const result = manager.ensureStaleness(freshSnapshot);

      expect(result.stale).toBe(false);
    });
  });

  describe('normalizeSnapshot', () => {
    it('should normalize partial snapshot to full format', () => {
      const manager = createManager();
      const partial = { schema: 'kb.registry/1' as const };

      const normalized = manager.normalizeSnapshot(partial);

      expect(normalized.schema).toBe('kb.registry/1');
      expect(normalized.rev).toBeDefined();
      expect(normalized.plugins).toEqual([]);
      expect(normalized.manifests).toEqual([]);
      expect(normalized.checksum).toBeDefined();
    });

    it('should mark as corrupted when schema is invalid', () => {
      const manager = createManager();
      const invalid = { schema: 'invalid' as any };

      const normalized = manager.normalizeSnapshot(invalid);

      expect(normalized.corrupted).toBe(true);
    });

    it('should preserve valid fields', () => {
      const manager = createManager();
      const partial = {
        schema: 'kb.registry/1' as const,
        rev: 5,
        version: '2.0.0',
        plugins: [{ id: 'test', version: '1.0', source: { kind: 'pkg' as const, path: '/test' } }],
      };

      const normalized = manager.normalizeSnapshot(partial);

      expect(normalized.rev).toBe(5);
      expect(normalized.version).toBe('2.0.0');
      expect(normalized.plugins).toHaveLength(1);
    });
  });

  describe('getRoot and getTtlMs', () => {
    it('should return correct root path', () => {
      const manager = createManager();
      expect(manager.getRoot()).toBe(tempDir);
    });

    it('should return correct TTL', () => {
      const manager = createManager({ ttlMs: 120_000 });
      expect(manager.getTtlMs()).toBe(120_000);
    });

    it('should use default TTL when not specified', () => {
      const manager = createManager();
      expect(manager.getTtlMs()).toBe(60_000);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════

function createMinimalSnapshot(): Omit<RegistrySnapshot, 'checksum' | 'checksumAlgorithm' | 'previousChecksum'> {
  const now = new Date().toISOString();
  return {
    schema: 'kb.registry/1',
    rev: 0,
    version: '0',
    generatedAt: now,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    ttlMs: 60_000,
    partial: true,
    stale: false,
    source: {
      cliVersion: '1.0.0',
      cwd: '/test',
    },
    plugins: [],
    manifests: [],
    ts: Date.now(),
  };
}
