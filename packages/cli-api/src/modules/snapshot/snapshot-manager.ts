/**
 * @module @kb-labs/cli-api/modules/snapshot/snapshot-manager
 * Manages snapshot persistence (disk + optional Redis).
 */

import { existsSync, readFileSync } from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

import type { ICache } from '@kb-labs/core-platform/adapters';
import type { CliApiLogger } from '../logger/index.js';
import type { RegistrySnapshot, RegistrySnapshotManifestEntry, SnapshotWithoutIntegrity } from './types.js';
import {
  cloneValue,
  computeSnapshotChecksum,
  safeParseInt,
  SNAPSHOT_CHECKSUM_ALGORITHM,
} from './utils.js';

const SNAPSHOT_FILE_NAME = 'registry.json';
const SNAPSHOT_TMP_FILE_NAME = 'registry.tmp.json';
const SNAPSHOT_BACKUP_FILE_NAME = 'registry.prev.json';
const SNAPSHOT_RELATIVE_DIR = ['.kb', 'cache'] as const;
const DEFAULT_SNAPSHOT_TTL_MS = 60_000;

export interface SnapshotManagerOptions {
  /** Root directory for snapshot storage */
  root: string;
  /** TTL for snapshots in milliseconds */
  ttlMs?: number;
  /** CLI version for snapshot metadata */
  cliVersion: string;
  /** Logger instance */
  logger: CliApiLogger;
  /** Optional cache adapter for Redis storage */
  cache?: ICache;
  /** Redis snapshot key (if using Redis) */
  redisSnapshotKey?: string;
}

/**
 * Manages snapshot lifecycle: load, save, validate, cache.
 *
 * Future scaling: Replace cache with distributed Redis adapter
 * configured via platform.cache from kb.config.json.
 */
export class SnapshotManager {
  private readonly snapshotDir: string;
  private readonly snapshotPath: string;
  private readonly snapshotBackupPath: string;
  private readonly ttlMs: number;
  private readonly cliVersion: string;
  private readonly logger: CliApiLogger;
  private readonly cache?: ICache;
  private readonly redisSnapshotKey?: string;
  private readonly root: string;

  private lastChecksum: string | null = null;

  constructor(options: SnapshotManagerOptions) {
    this.root = resolve(options.root);
    this.snapshotDir = join(this.root, ...SNAPSHOT_RELATIVE_DIR);
    this.snapshotPath = join(this.snapshotDir, SNAPSHOT_FILE_NAME);
    this.snapshotBackupPath = join(this.snapshotDir, SNAPSHOT_BACKUP_FILE_NAME);
    this.ttlMs = options.ttlMs ?? DEFAULT_SNAPSHOT_TTL_MS;
    this.cliVersion = options.cliVersion;
    this.logger = options.logger;
    this.cache = options.cache;
    this.redisSnapshotKey = options.redisSnapshotKey;
  }

  /**
   * Load snapshot from disk (primary, then backup).
   */
  loadFromDisk(): RegistrySnapshot | null {
    const primary = this.readSnapshotFromPath(this.snapshotPath, 'primary');
    if (primary && !primary.corrupted) {
      this.lastChecksum = primary.checksum ?? null;
      return this.ensureStaleness(primary);
    }

    if (primary?.corrupted) {
      this.logger.warn('Primary registry snapshot corrupted, attempting backup restore', {
        path: this.snapshotPath,
        checksum: primary.checksum,
      });
    }

    const backup = this.readSnapshotFromPath(this.snapshotBackupPath, 'backup');
    if (backup && !backup.corrupted) {
      this.logger.warn('Recovered registry snapshot from backup', {
        path: this.snapshotBackupPath,
        checksum: backup.checksum,
      });
      this.lastChecksum = backup.checksum ?? null;
      return this.ensureStaleness(backup);
    }

    return primary && !primary.corrupted ? this.ensureStaleness(primary) : null;
  }

  /**
   * Load snapshot from Redis cache (if configured).
   */
  async loadFromCache(): Promise<RegistrySnapshot | null> {
    if (!this.cache || !this.redisSnapshotKey) {
      return null;
    }

    try {
      const raw = await this.cache.get<string>(this.redisSnapshotKey);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as Partial<RegistrySnapshot>;
      const normalized = this.normalizeSnapshot(parsed);
      if (normalized.corrupted) {
        this.logger.warn('Checksum validation failed for Redis registry snapshot', {
          key: this.redisSnapshotKey,
          storedChecksum: parsed?.checksum,
          computedChecksum: normalized.checksum,
        });
        return null;
      }
      return this.ensureStaleness(normalized);
    } catch (error) {
      this.logger.warn('Failed to load snapshot from cache', {
        key: this.redisSnapshotKey,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Persist snapshot to disk and optionally Redis.
   */
  async persist(snapshot: RegistrySnapshot): Promise<void> {
    const finalized = this.ensureSnapshotIntegrity(snapshot, {
      previousChecksum: this.lastChecksum,
    });

    // Save to disk
    try {
      await fsPromises.mkdir(this.snapshotDir, { recursive: true });
      if (existsSync(this.snapshotPath)) {
        try {
          await fsPromises.copyFile(this.snapshotPath, this.snapshotBackupPath);
        } catch (error) {
          this.logger.warn('Failed to copy registry snapshot backup', {
            sourcePath: this.snapshotPath,
            backupPath: this.snapshotBackupPath,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const tmpPath = join(this.snapshotDir, `${SNAPSHOT_TMP_FILE_NAME}.${randomUUID()}`);
      await fsPromises.writeFile(tmpPath, JSON.stringify(finalized, null, 2), 'utf8');
      await fsPromises.rename(tmpPath, this.snapshotPath);
      this.lastChecksum = finalized.checksum ?? null;
      this.logger.debug('Persisted registry snapshot', {
        path: this.snapshotPath,
        checksum: finalized.checksum,
        rev: finalized.rev,
      });
    } catch (error) {
      this.logger.error('Failed to persist registry snapshot', {
        path: this.snapshotPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Save to Redis cache
    await this.writeToCache(finalized);
  }

  /**
   * Create an empty snapshot.
   */
  createEmpty(corrupted = false): RegistrySnapshot {
    const generatedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + this.ttlMs).toISOString();
    const base: SnapshotWithoutIntegrity = {
      schema: 'kb.registry/1',
      rev: 0,
      version: '0',
      generatedAt,
      expiresAt,
      ttlMs: this.ttlMs,
      partial: true,
      stale: false,
      source: {
        cliVersion: this.cliVersion,
        cwd: this.root,
      },
      corrupted,
      plugins: [],
      manifests: [],
      ts: Date.parse(generatedAt),
    };
    return this.ensureSnapshotIntegrity(base, { previousChecksum: this.lastChecksum });
  }

  /**
   * Ensure snapshot has correct staleness based on expiry.
   */
  ensureStaleness(snapshot: RegistrySnapshot): RegistrySnapshot {
    const expired = snapshot.expiresAt ? Date.now() > Date.parse(snapshot.expiresAt) : false;
    if (snapshot.stale === expired && (!expired || snapshot.partial)) {
      return snapshot;
    }

    return {
      ...snapshot,
      stale: expired,
      partial: snapshot.partial || expired,
    };
  }

  /**
   * Normalize a partial snapshot to full format.
   */
  normalizeSnapshot(
    snapshot: Partial<RegistrySnapshot>,
    overrides?: { corrupted?: boolean; previousChecksum?: string | null }
  ): RegistrySnapshot {
    const schemaValid = snapshot.schema === 'kb.registry/1';
    const generatedAt =
      typeof snapshot.generatedAt === 'string'
        ? snapshot.generatedAt
        : new Date().toISOString();
    const ttlMs =
      typeof snapshot.ttlMs === 'number' && Number.isFinite(snapshot.ttlMs)
        ? Math.max(1_000, Math.floor(snapshot.ttlMs))
        : this.ttlMs;
    const expiresAt =
      typeof snapshot.expiresAt === 'string'
        ? snapshot.expiresAt
        : new Date(Date.parse(generatedAt) + ttlMs).toISOString();
    const rev =
      typeof snapshot.rev === 'number' && Number.isFinite(snapshot.rev)
        ? snapshot.rev
        : safeParseInt((snapshot as any)?.version);
    const partial = snapshot.partial ?? true;
    const stale = snapshot.stale ?? (snapshot.expiresAt ? Date.now() > Date.parse(snapshot.expiresAt) : false);
    const source = snapshot.source ?? {
      cliVersion: this.cliVersion,
      cwd: this.root,
    };

    const manifests: RegistrySnapshotManifestEntry[] = Array.isArray(snapshot.manifests)
      ? snapshot.manifests.map(entry => ({
          pluginId: entry.pluginId,
          manifest: cloneValue(entry.manifest),
          pluginRoot: entry.pluginRoot,
          source: { ...entry.source },
          headers: entry.headers ? cloneValue(entry.headers) : undefined,
        }))
      : [];

    const version =
      typeof snapshot.version === 'string' && snapshot.version.trim().length > 0
        ? snapshot.version
        : String(rev);
    const ts =
      typeof snapshot.ts === 'number' && Number.isFinite(snapshot.ts)
        ? snapshot.ts
        : Date.parse(generatedAt);

    const baseCorrupted = overrides?.corrupted ?? (!schemaValid || snapshot.corrupted === true);
    const previousChecksum =
      overrides?.previousChecksum ?? (typeof snapshot.previousChecksum === 'string' ? snapshot.previousChecksum : null);

    const base: SnapshotWithoutIntegrity = {
      schema: 'kb.registry/1',
      rev,
      version,
      generatedAt,
      expiresAt,
      ttlMs,
      partial: partial || stale,
      stale,
      source,
      corrupted: baseCorrupted,
      plugins: Array.isArray(snapshot.plugins) ? snapshot.plugins : [],
      manifests,
      ts,
    };

    return this.ensureSnapshotIntegrity(
      {
        ...base,
        checksum: typeof snapshot.checksum === 'string' ? snapshot.checksum : undefined,
        checksumAlgorithm:
          typeof snapshot.checksumAlgorithm === 'string' ? snapshot.checksumAlgorithm : undefined,
        previousChecksum,
      },
      { previousChecksum }
    );
  }

  /**
   * Get snapshot root directory.
   */
  getRoot(): string {
    return this.root;
  }

  /**
   * Get TTL in milliseconds.
   */
  getTtlMs(): number {
    return this.ttlMs;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private methods
  // ═══════════════════════════════════════════════════════════════════════════

  private readSnapshotFromPath(path: string, kind: 'primary' | 'backup'): RegistrySnapshot | null {
    if (!existsSync(path)) {
      return null;
    }
    try {
      const raw = readFileSync(path, 'utf8');
      const parsed = JSON.parse(raw) as Partial<RegistrySnapshot>;
      const normalized = this.normalizeSnapshot(parsed);

      if (normalized.corrupted && parsed?.checksum) {
        this.logger.warn('Checksum validation failed for registry snapshot', {
          path,
          kind,
          storedChecksum: parsed.checksum,
          computedChecksum: normalized.checksum,
        });
      } else {
        this.logger.debug('Loaded registry snapshot', {
          path,
          kind,
          checksum: normalized.checksum,
          rev: normalized.rev,
        });
      }

      return normalized;
    } catch (error) {
      this.logger.error('Failed to read registry snapshot from disk', {
        path,
        kind,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async writeToCache(snapshot: RegistrySnapshot): Promise<void> {
    if (!this.cache || !this.redisSnapshotKey) {
      return;
    }
    try {
      await this.cache.set(this.redisSnapshotKey, JSON.stringify(snapshot));
      this.logger.debug('Persisted registry snapshot to cache', {
        key: this.redisSnapshotKey,
        checksum: snapshot.checksum,
        rev: snapshot.rev,
      });
    } catch (error) {
      this.logger.warn('Failed to write snapshot to cache', {
        key: this.redisSnapshotKey,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private ensureSnapshotIntegrity(
    snapshot: Omit<RegistrySnapshot, 'checksum' | 'checksumAlgorithm' | 'previousChecksum'> & {
      checksum?: string;
      checksumAlgorithm?: string;
      previousChecksum?: string | null;
      corrupted?: boolean;
    },
    options?: { previousChecksum?: string | null }
  ): RegistrySnapshot {
    const {
      checksum,
      checksumAlgorithm,
      previousChecksum,
      corrupted,
      ...rest
    } = snapshot;

    const baseSnapshot = rest as SnapshotWithoutIntegrity;
    const computed = computeSnapshotChecksum(baseSnapshot);

    const checksumMatches =
      typeof checksum === 'string' &&
      checksum.length > 0 &&
      (checksumAlgorithm ?? SNAPSHOT_CHECKSUM_ALGORITHM) === SNAPSHOT_CHECKSUM_ALGORITHM &&
      checksum === computed;

    const finalPreviousChecksum =
      options?.previousChecksum ?? (typeof previousChecksum === 'string' ? previousChecksum : null);

    return {
      ...(baseSnapshot as RegistrySnapshot),
      corrupted: Boolean(corrupted) || (checksum !== undefined && !checksumMatches),
      checksum: computed,
      checksumAlgorithm: SNAPSHOT_CHECKSUM_ALGORITHM,
      previousChecksum: finalPreviousChecksum,
    };
  }
}
