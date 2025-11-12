/**
 * @module @kb-labs/cli-api/cli-api-impl
 * CLI API implementation
 */

import type { ManifestV2, CliCommandDecl } from '@kb-labs/plugin-manifest';
import {
  PluginRegistry,
  InMemoryCacheAdapter,
  generateOpenAPISpec,
  generateStudioRegistry,
  type PluginBrief,
  type OpenAPISpec,
  type StudioRegistry,
  type ExplainResult,
  type RegistrySnapshot as CoreRegistrySnapshot,
  type RegistryDiff,
  createContext,
  type CliContext,
} from '@kb-labs/cli-core';
import type {
  CliAPI,
  CliInitOptions,
  RegistrySnapshot,
  RegistrySnapshotManifestEntry,
  RunCommandParams,
  RunCommandResult,
  SystemHealthOptions,
  SystemHealthSnapshot,
  RedisStatus,
  WorkflowRunParams,
  WorkflowRunsListOptions,
  WorkflowRunsListResult,
  WorkflowLogStreamOptions,
  WorkflowWorkerOptions,
  WorkflowEventsListOptions,
  WorkflowEventsListResult,
  WorkflowEventStreamOptions,
} from './types.js';
import { WorkflowService } from './workflows.js';
import type { RedisClientType, RedisClientOptions } from 'redis';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const pkgJson = require('../package.json') as { version?: string };

const CLI_VERSION = pkgJson?.version ?? '0.0.0';
const DEFAULT_SNAPSHOT_TTL_MS = 60_000;
const SNAPSHOT_FILE_NAME = 'registry.json';
const SNAPSHOT_TMP_FILE_NAME = 'registry.tmp.json';
const SNAPSHOT_BACKUP_FILE_NAME = 'registry.prev.json';
const SNAPSHOT_RELATIVE_DIR = ['.kb', 'cache'] as const;
const SNAPSHOT_CHECKSUM_ALGORITHM = 'sha256';
type SnapshotWithoutIntegrity = Omit<RegistrySnapshot, 'checksum' | 'checksumAlgorithm' | 'previousChecksum'>;

const DEFAULT_RECONNECT_INITIAL_DELAY_MS = 500;
const DEFAULT_RECONNECT_MAX_DELAY_MS = 30_000;
const DEFAULT_RECONNECT_JITTER = 0.2;

type Mode = 'producer' | 'consumer';
type RedisRole = 'publisher' | 'subscriber' | 'cache';

type RedisClient = RedisClientType;
type RedisFactory = (options?: RedisClientOptions) => RedisClient;

type GitInfo = { sha: string; dirty: boolean };
let cachedGitInfo: GitInfo | null | undefined;

function cloneValue<T>(value: T): T {
  const globalClone = (globalThis as unknown as { structuredClone?: (value: unknown) => unknown }).structuredClone;
  if (typeof globalClone === 'function') {
    return globalClone(value) as T;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, val]) => val !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`).join(',')}}`;
}

function computeSnapshotChecksum(
  snapshot: Omit<RegistrySnapshot, 'checksum' | 'checksumAlgorithm' | 'previousChecksum'>
): string {
  return createHash(SNAPSHOT_CHECKSUM_ALGORITHM).update(stableStringify(snapshot)).digest('hex');
}

function resolveTraceId(): string {
  const existing = process.env.KB_TRACE_ID?.trim();
  if (existing) {
    return existing;
  }
  const traceId = `cli-${process.pid}-${randomUUID().replace(/-/g, '')}`;
  process.env.KB_TRACE_ID = traceId;
  return traceId;
}

function toErrorMeta(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
    };
  }
  return { error };
}

type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

type StructuredLogger = {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
};

function createStructuredLogger(level: LogLevel, context: Record<string, unknown>): StructuredLogger {
  const priority: Record<LogLevel, number> = {
    silent: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4,
  };

  const baseContext = { ...context };
  const shouldLog = (target: LogLevel): boolean => priority[target] <= priority[level];

  const emit = (
    target: LogLevel,
    consoleMethod: 'error' | 'warn' | 'info' | 'debug',
    message: string,
    fields?: Record<string, unknown>
  ) => {
    if (!shouldLog(target)) {
      return;
    }
    const payload = {
      level: target,
      message,
      ts: new Date().toISOString(),
      ...baseContext,
      ...(fields ?? {}),
    };
    const line = JSON.stringify(payload);
    if (consoleMethod === 'error') {
      console.error(line);
    } else if (consoleMethod === 'warn') {
      console.warn(line);
    } else if (consoleMethod === 'info') {
      console.info(line);
    } else {
      console.debug(line);
    }
  };

  return {
    debug(message, fields) {
      emit('debug', 'debug', message, fields);
    },
    info(message, fields) {
      emit('info', 'info', message, fields);
    },
    warn(message, fields) {
      emit('warn', 'warn', message, fields);
    },
    error(message, fields) {
      emit('error', 'error', message, fields);
    },
  };
}

/**
 * CLI API implementation
 */
export class CliAPIImpl implements CliAPI {
  private registry: PluginRegistry;
  private initialized = false;
  private lastSnapshot: RegistrySnapshot | null = null;
  private snapshotManifestMap = new Map<string, RegistrySnapshotManifestEntry>();
  private readonly snapshotRoot: string;
  private readonly snapshotDir: string;
  private readonly snapshotPath: string;
  private readonly snapshotBackupPath: string;
  private readonly snapshotTtlMs: number;
  private readonly mode: Mode;
  private readonly refreshIntervalMs: number | null;
  private snapshotTimer: NodeJS.Timeout | null = null;
  private changeListeners: Array<(diff: RegistryDiff) => void> = [];
  private publisher: RedisClient | null = null;
  private subscriber: RedisClient | null = null;
  private redisCache: RedisClient | null = null;
  private readonly registryChannel: string;
  private readonly healthChannel: string;
  private readonly redisReconnect: {
    initialDelayMs: number;
    maxDelayMs: number;
    jitter: number;
  };
  private readonly redisStates: Record<RedisRole, string | null> = {
    publisher: null,
    subscriber: null,
    cache: null,
  };
  private redisFactory: RedisFactory | null = null;
  private readonly redisSnapshotKey: string | null;
  private readonly traceId: string;
  private readonly logger: StructuredLogger;
  private readonly workflowService: WorkflowService;

  constructor(private opts?: CliInitOptions) {
    const discoveryOpts = {
      strategies: opts?.discovery?.strategies || ['workspace', 'pkg', 'dir', 'file'],
      roots: opts?.discovery?.roots,
      allowDowngrade: opts?.discovery?.allowDowngrade || false,
      watch: opts?.discovery?.watch || false,
      debounceMs: opts?.discovery?.debounceMs,
    } as const;

    const logLevel: LogLevel = opts?.logger?.level ?? 'info';
    this.traceId = resolveTraceId();
    this.logger = createStructuredLogger(logLevel, {
      traceId: this.traceId,
      component: 'cli-api',
      pid: process.pid,
    });
    this.workflowService = new WorkflowService(this.logger);

    const cacheOpts = opts?.cache?.inMemory
      ? {
          adapter: new InMemoryCacheAdapter(),
          ttlMs: opts.cache.ttlMs,
        }
      : undefined;

    this.registry = new PluginRegistry({
      ...discoveryOpts,
      cache: cacheOpts,
    });

    this.mode = opts?.snapshot?.mode ?? 'producer';
    this.refreshIntervalMs = opts?.snapshot?.refreshIntervalMs ?? null;

    const namespacePrefix = opts?.pubsub?.namespace ? `${opts.pubsub.namespace}:` : 'kb:';
    this.registryChannel = opts?.pubsub?.registryChannel ?? `${namespacePrefix}registry:changed`;
    this.healthChannel = opts?.pubsub?.healthChannel ?? `${namespacePrefix}health:changed`;
    this.redisSnapshotKey = opts?.pubsub?.redisUrl ? `${namespacePrefix}registry:snapshot` : null;

    const reconnect = opts?.pubsub?.reconnect ?? {};
    this.redisReconnect = {
      initialDelayMs:
        typeof reconnect.initialDelayMs === 'number' && reconnect.initialDelayMs > 0
          ? reconnect.initialDelayMs
          : DEFAULT_RECONNECT_INITIAL_DELAY_MS,
      maxDelayMs:
        typeof reconnect.maxDelayMs === 'number' && reconnect.maxDelayMs > 0
          ? reconnect.maxDelayMs
          : DEFAULT_RECONNECT_MAX_DELAY_MS,
      jitter:
        typeof reconnect.jitter === 'number' && reconnect.jitter >= 0 && reconnect.jitter <= 1
          ? reconnect.jitter
          : DEFAULT_RECONNECT_JITTER,
    };

    this.snapshotRoot = resolveSnapshotRoot(discoveryOpts.roots);
    this.snapshotDir = join(this.snapshotRoot, ...SNAPSHOT_RELATIVE_DIR);
    this.snapshotPath = join(this.snapshotDir, SNAPSHOT_FILE_NAME);
    this.snapshotBackupPath = join(this.snapshotDir, SNAPSHOT_BACKUP_FILE_NAME);
    this.snapshotTtlMs =
      typeof opts?.cache?.ttlMs === 'number' && Number.isFinite(opts.cache.ttlMs)
        ? Math.max(1_000, Math.floor(opts.cache.ttlMs))
        : DEFAULT_SNAPSHOT_TTL_MS;
    this.lastSnapshot = this.loadSnapshotFromDisk();
  }

  /**
   * Initialize API (run discovery if producer, load snapshot if consumer)
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.setupPubSub();

    if (!this.lastSnapshot) {
      this.lastSnapshot = await this.loadSnapshotFromRedis();
    }

    if (this.mode === 'consumer') {
      if (!this.lastSnapshot) {
        this.lastSnapshot = this.createEmptySnapshot(true);
      }
      this.updateSnapshotCaches(this.lastSnapshot);
      this.initialized = true;
      return;
    }

    if (this.lastSnapshot) {
      this.updateSnapshotCaches(this.lastSnapshot);
      this.initialized = true;
    }

    if (!this.lastSnapshot || this.lastSnapshot.stale) {
      await this.refresh();
    } else {
      void this.refresh().catch(error => {
        this.logger.warn('Initial refresh failed', {
          error: toErrorMeta(error),
          traceId: this.traceId,
        });
      });
    }

    if (this.refreshIntervalMs && this.refreshIntervalMs > 0) {
      this.snapshotTimer = setInterval(() => {
        void this.refresh().catch(error => {
          this.logger.warn('Periodic refresh failed', {
            error: toErrorMeta(error),
            traceId: this.traceId,
          });
        });
      }, this.refreshIntervalMs).unref();
    }
  }

  /**
   * List all plugins
   */
  async listPlugins(): Promise<PluginBrief[]> {
    if (this.mode === 'consumer') {
      return this.lastSnapshot?.plugins ?? [];
    }
    return this.registry.list();
  }

  /**
   * Get manifest V2 for a plugin
   */
  async getManifestV2(pluginId: string): Promise<ManifestV2 | null> {
    if (this.mode === 'consumer') {
      const entry = this.snapshotManifestMap.get(pluginId);
      return entry ? cloneValue(entry.manifest) : null;
    }
    return this.registry.getManifestV2(pluginId);
  }

  /**
   * Get OpenAPI specification for a plugin
   */
  async getOpenAPISpec(pluginId: string): Promise<OpenAPISpec | null> {
    const manifest = await this.getManifestV2(pluginId);
    if (!manifest) {
      return null;
    }

    return generateOpenAPISpec(manifest);
  }

  /**
   * Get studio registry (aggregated)
   */
  async getStudioRegistry(): Promise<StudioRegistry> {
    const plugins = await this.listPlugins();
    const manifests = new Map<string, ManifestV2>();

    if (this.mode === 'consumer') {
      for (const entry of this.snapshotManifestMap.values()) {
        manifests.set(entry.pluginId, cloneValue(entry.manifest));
      }
    } else {
      for (const plugin of plugins) {
        const manifest = this.registry.getManifestV2(plugin.id);
        if (manifest) {
          manifests.set(plugin.id, manifest);
        }
      }
    }

    return generateStudioRegistry(plugins, manifests);
  }

  /**
   * Refresh plugin discovery or reload snapshot (depending on mode)
   */
  async refresh(): Promise<void> {
    if (this.mode === 'consumer') {
      const previousRev = this.lastSnapshot?.rev ?? 0;
      let snapshot = this.loadSnapshotFromDisk();
      if (!snapshot) {
        snapshot = await this.loadSnapshotFromRedis();
      }
      if (!snapshot) {
        snapshot = this.createEmptySnapshot(true);
      }
      this.lastSnapshot = this.ensureStaleness(snapshot);
      this.updateSnapshotCaches(this.lastSnapshot);
      this.initialized = true;
      if ((this.lastSnapshot?.rev ?? 0) !== previousRev || this.lastSnapshot?.stale) {
        this.emitSnapshotChange();
      }
      return;
    }

    await this.registry.refresh();
    const snapshot = this.buildSnapshotFromRegistry();
    this.lastSnapshot = snapshot;
    this.updateSnapshotCaches(snapshot);
    this.initialized = true;
    await this.persistSnapshot(snapshot);
    this.emitSnapshotChange();
    await this.publishRegistryChange(snapshot);
    await this.publishHealthChange();
  }

  /**
   * Run a command (optional)
   * Note: This would require integration with plugin-runtime
   */
  async runCommand(_params: RunCommandParams): Promise<RunCommandResult> {
    return {
      ok: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Command execution not yet implemented',
      },
    };
  }

  /**
   * Explain why a plugin was selected
   */
  explain(pluginId: string): ExplainResult {
    if (this.mode === 'consumer') {
      const plugin = this.lastSnapshot?.plugins.find(p => p.id === pluginId);
      if (!plugin) {
        return {
          pluginId,
          selected: { version: 'not-found', source: 'none', path: '' },
          candidates: [],
          resolutionRules: [],
        };
      }
      return {
        pluginId,
        selected: {
          version: plugin.version,
          source: plugin.source.kind,
          path: plugin.source.path,
        },
        candidates: [],
        resolutionRules: ['Loaded from snapshot'],
      };
    }
    return this.registry.explain(pluginId);
  }

  /**
   * Get registry snapshot
   */
  snapshot(): RegistrySnapshot {
    if (!this.lastSnapshot) {
      this.lastSnapshot = this.createEmptySnapshot(true);
    }

    const refreshed = this.ensureStaleness(this.lastSnapshot);
    this.lastSnapshot = refreshed;
    this.updateSnapshotCaches(refreshed);

    return {
      ...refreshed,
      plugins: [...refreshed.plugins],
      manifests: refreshed.manifests.map(entry => ({
        pluginId: entry.pluginId,
        manifest: cloneValue(entry.manifest),
        pluginRoot: entry.pluginRoot,
        source: { ...entry.source },
      })),
    };
  }

  /**
   * Subscribe to registry changes
   */
  onChange(cb: (diff: RegistryDiff) => void): () => void {
    if (this.mode === 'consumer') {
      this.changeListeners.push(cb);
      return () => {
        const index = this.changeListeners.indexOf(cb);
        if (index >= 0) {
          this.changeListeners.splice(index, 1);
        }
      };
    }
    return this.registry.onChange(cb);
  }

  /**
   * Dispose API and cleanup
   */
  async dispose(): Promise<void> {
    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
      this.snapshotTimer = null;
    }
    if (this.mode === 'consumer') {
      if (this.snapshotTimer) {
        clearInterval(this.snapshotTimer);
        this.snapshotTimer = null;
      }
    }
    if (this.subscriber) {
      try {
        await this.subscriber.quit();
      } catch {
        // ignore
      }
      this.subscriber = null;
    }
    if (this.publisher) {
      try {
        await this.publisher.quit();
      } catch {
        // ignore
      }
      this.publisher = null;
    }
    if (this.redisCache && this.redisCache !== this.publisher && this.redisCache !== this.subscriber) {
      try {
        await this.redisCache.quit();
      } catch {
        // ignore
      }
    }
    this.redisCache = null;
    await this.registry.dispose();
    this.initialized = false;
  }

  /**
   * Create health snapshot without triggering new discovery
   */
  async getSystemHealth(options?: SystemHealthOptions): Promise<SystemHealthSnapshot> {
    const now = new Date();
    const uptimeSec = coerceUptime(options?.uptimeSec);
    const registrySnapshot = this.snapshot();
    const plugins = await this.listPlugins();
    const version = buildVersionInfo(options?.version, getGitInfo(this.opts?.discovery?.roots));

    let withRest = 0;
    let withStudio = 0;

    const pluginErrors = this.mode === 'consumer'
      ? new Map<string, string>()
      : mapErrorsToPlugins(plugins, this.getRegistryErrors());
    const unmatchedErrors = this.mode === 'consumer'
      ? []
      : collectUnmatchedErrors(plugins, this.getRegistryErrors());

    const components = plugins.map(plugin => {
      const manifest = this.mode === 'consumer'
        ? this.snapshotManifestMap.get(plugin.id)?.manifest
        : this.registry.getManifestV2(plugin.id);
      const restRoutes = manifest?.rest?.routes?.length ?? 0;
      const studioWidgets = manifest?.studio?.widgets?.length ?? 0;

      if (restRoutes > 0) {
        withRest += 1;
      }
      if (studioWidgets > 0) {
        withStudio += 1;
      }

      const lastError = pluginErrors.get(plugin.id);

      return {
        id: plugin.id,
        version: plugin.version,
        restRoutes,
        studioWidgets,
        ...(lastError ? { lastError } : {}),
      };
    });

    const registryErrors = this.mode === 'consumer' ? 0 : this.getRegistryErrors().length;
    const degraded =
      registryErrors > 0 ||
      registrySnapshot.partial ||
      registrySnapshot.stale ||
      components.some(component => Boolean(component.lastError));

    const meta = mergeMeta(
      options?.meta,
      unmatchedErrors,
      this.mode === 'consumer' ? registrySnapshot.partial === false : this.isRegistryInitialized(),
      registrySnapshot
    );

    return {
      schema: 'kb.health/1',
      ts: now.toISOString(),
      uptimeSec,
      version,
      registry: {
        total: plugins.length,
        withRest,
        withStudio,
        errors: registryErrors,
        generatedAt: registrySnapshot.generatedAt,
        expiresAt: registrySnapshot.expiresAt,
        partial: registrySnapshot.partial,
        stale: registrySnapshot.stale,
      },
      status: degraded ? 'degraded' : 'healthy',
      components,
      ...(meta ? { meta } : {}),
    };
  }

  getRedisStatus(): RedisStatus {
    const enabled = Boolean(this.opts?.pubsub?.redisUrl);
    const roles: RedisStatus['roles'] = {
      publisher: this.redisStates.publisher,
      subscriber: this.redisStates.subscriber,
      cache: this.redisStates.cache,
    };
    const healthyStates = new Set(['ready', 'subscribed', 'connect', 'connected']);
    const activeStates: Array<string | null> = [];
    if (this.publisher) {
      activeStates.push(roles.publisher ?? null);
    }
    if (this.subscriber) {
      activeStates.push(roles.subscriber ?? null);
    }
    if (this.redisCache && this.redisCache !== this.publisher && this.redisCache !== this.subscriber) {
      activeStates.push(roles.cache ?? null);
    }
    if (activeStates.length === 0 && enabled) {
      activeStates.push(roles.publisher ?? roles.subscriber ?? roles.cache ?? null);
    }
    const healthy =
      !enabled ||
      (activeStates.length === 0
        ? true
        : activeStates.every(state => state !== null && healthyStates.has(state)));
    return {
      enabled,
      healthy,
      roles,
    };
  }

  async runWorkflow(input: WorkflowRunParams) {
    return this.workflowService.runWorkflow(input);
  }

  async listWorkflowRuns(
    options: WorkflowRunsListOptions = {},
  ): Promise<WorkflowRunsListResult> {
    return this.workflowService.listWorkflowRuns(options);
  }

  async getWorkflowRun(runId: string) {
    return this.workflowService.getWorkflowRun(runId);
  }

  async cancelWorkflowRun(runId: string) {
    return this.workflowService.cancelWorkflowRun(runId);
  }

  async streamWorkflowLogs(options: WorkflowLogStreamOptions) {
    await this.workflowService.streamWorkflowLogs(options);
  }

  async listWorkflowEvents(
    options: WorkflowEventsListOptions,
  ): Promise<WorkflowEventsListResult> {
    return this.workflowService.listWorkflowEvents(options);
  }

  async streamWorkflowEvents(options: WorkflowEventStreamOptions) {
    await this.workflowService.streamWorkflowEvents(options);
  }

  async createWorkflowWorker(options: WorkflowWorkerOptions = {}) {
    return this.workflowService.createWorker(options);
  }

  private emitSnapshotChange(): void {
    if (this.changeListeners.length === 0) {
      return;
    }
    const diff: RegistryDiff = { added: [], removed: [], changed: [] };
    for (const listener of [...this.changeListeners]) {
      try {
        listener(diff);
      } catch (error) {
        this.logger.error('Snapshot listener threw error', {
          error: toErrorMeta(error),
          traceId: this.traceId,
        });
      }
    }
  }

  private ensureStaleness(snapshot: RegistrySnapshot): RegistrySnapshot {
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

  private async persistSnapshot(snapshot: RegistrySnapshot): Promise<void> {
    const finalized = this.ensureSnapshotIntegrity(snapshot, {
      previousChecksum: snapshot.previousChecksum ?? this.lastSnapshot?.checksum ?? null,
    });

    try {
      await fsPromises.mkdir(this.snapshotDir, { recursive: true });
      if (existsSync(this.snapshotPath)) {
        try {
          await fsPromises.copyFile(this.snapshotPath, this.snapshotBackupPath);
        } catch (error) {
          this.logger.warn('Failed to copy registry snapshot backup', {
            sourcePath: this.snapshotPath,
            backupPath: this.snapshotBackupPath,
            error: toErrorMeta(error),
            traceId: this.traceId,
          });
        }
      }

      const tmpPath = join(this.snapshotDir, `${SNAPSHOT_TMP_FILE_NAME}.${randomUUID()}`);
      await fsPromises.writeFile(tmpPath, JSON.stringify(finalized, null, 2), 'utf8');
      await fsPromises.rename(tmpPath, this.snapshotPath);
      this.logger.debug('Persisted registry snapshot', {
        path: this.snapshotPath,
        checksum: finalized.checksum,
        rev: finalized.rev,
      });
    } catch (error) {
      this.logger.error('Failed to persist registry snapshot', {
        path: this.snapshotPath,
        error: toErrorMeta(error),
        traceId: this.traceId,
      });
    }

    await this.writeSnapshotToRedis(finalized);
  }

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
          traceId: this.traceId,
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
        error: toErrorMeta(error),
        traceId: this.traceId,
      });
      return null;
    }
  }

  private loadSnapshotFromDisk(): RegistrySnapshot | null {
    const primary = this.readSnapshotFromPath(this.snapshotPath, 'primary');
    if (primary && !primary.corrupted) {
      return this.ensureStaleness(primary);
    }

    if (primary?.corrupted) {
      this.logger.warn('Primary registry snapshot corrupted, attempting backup restore', {
        path: this.snapshotPath,
        checksum: primary.checksum,
        traceId: this.traceId,
      });
    }

    const backup = this.readSnapshotFromPath(this.snapshotBackupPath, 'backup');
    if (backup && !backup.corrupted) {
      this.logger.warn('Recovered registry snapshot from backup', {
        path: this.snapshotBackupPath,
        checksum: backup.checksum,
        traceId: this.traceId,
      });
      return this.ensureStaleness(backup);
    }

    return primary && !primary.corrupted ? this.ensureStaleness(primary) : null;
  }

  private async loadSnapshotFromRedis(): Promise<RegistrySnapshot | null> {
    if (!this.redisCache || !this.redisSnapshotKey || typeof (this.redisCache as any).get !== 'function') {
      return null;
    }
    try {
      const raw = await (this.redisCache as any).get(this.redisSnapshotKey);
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
          traceId: this.traceId,
        });
        return null;
      }
      return this.ensureStaleness(normalized);
    } catch (error) {
      this.logger.warn('Failed to load snapshot from Redis', {
        key: this.redisSnapshotKey ?? undefined,
        error: toErrorMeta(error),
        traceId: this.traceId,
      });
      return null;
    }
  }

  private async writeSnapshotToRedis(snapshot: RegistrySnapshot): Promise<void> {
    if (!this.redisCache || !this.redisSnapshotKey || typeof (this.redisCache as any).set !== 'function') {
      return;
    }
    try {
      await (this.redisCache as any).set(this.redisSnapshotKey, JSON.stringify(snapshot));
      this.logger.debug('Persisted registry snapshot to Redis', {
        key: this.redisSnapshotKey,
        checksum: snapshot.checksum,
        rev: snapshot.rev,
      });
    } catch (error) {
      this.logger.warn('Failed to write snapshot to Redis', {
        key: this.redisSnapshotKey,
        error: toErrorMeta(error),
        traceId: this.traceId,
      });
    }
  }

  private createEmptySnapshot(corrupted = false): RegistrySnapshot {
    const generatedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + this.snapshotTtlMs).toISOString();
    const base: SnapshotWithoutIntegrity = {
      schema: 'kb.registry/1',
      rev: 0,
      version: '0',
      generatedAt,
      expiresAt,
      ttlMs: this.snapshotTtlMs,
      partial: true,
      stale: false,
      source: {
        cliVersion: CLI_VERSION,
        cwd: this.snapshotRoot,
      },
      corrupted,
      plugins: [],
      manifests: [],
      ts: Date.parse(generatedAt),
    };
    return this.ensureSnapshotIntegrity(base, { previousChecksum: this.lastSnapshot?.checksum ?? null });
  }

  private normalizeSnapshot(
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
        : this.snapshotTtlMs;
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
    const source =
      snapshot.source ?? {
        cliVersion: CLI_VERSION,
        cwd: this.snapshotRoot,
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

  private updateSnapshotCaches(snapshot: RegistrySnapshot): void {
    const manifestMap = new Map<string, RegistrySnapshotManifestEntry>();
    for (const entry of snapshot.manifests) {
      manifestMap.set(entry.pluginId, entry);
    }
    this.snapshotManifestMap = manifestMap;
  }

  private buildSnapshotFromRegistry(): RegistrySnapshot {
    const coreSnapshot: CoreRegistrySnapshot = this.registry.snapshot;
    const generatedAt = coreSnapshot.ts > 0 ? new Date(coreSnapshot.ts).toISOString() : new Date().toISOString();
    const ttlMs = this.snapshotTtlMs;
    const expiresAt = new Date(Date.parse(generatedAt) + ttlMs).toISOString();
    const plugins = this.registry.list();
    const manifests: RegistrySnapshotManifestEntry[] = [];

    for (const plugin of plugins) {
      const manifest = this.registry.getManifestV2(plugin.id);
      if (manifest) {
        const headerConfig = (manifest as { headers?: unknown }).headers;
        manifests.push({
          pluginId: plugin.id,
          manifest: cloneValue(manifest),
          pluginRoot: plugin.source.path,
          source: { ...plugin.source },
          headers: headerConfig ? cloneValue(headerConfig) : undefined,
        });
      }
    }

    const partial = !this.isRegistryInitialized() || this.getRegistryErrors().length > 0;
    const stale = Date.now() > Date.parse(expiresAt);

    const base: SnapshotWithoutIntegrity = {
      schema: 'kb.registry/1',
      rev: safeParseInt(coreSnapshot.version),
      version: coreSnapshot.version,
      generatedAt,
      expiresAt,
      ttlMs,
      partial: partial || stale,
      stale,
      source: {
        cliVersion: CLI_VERSION,
        cwd: this.snapshotRoot,
      },
      corrupted: false,
      plugins,
      manifests,
      ts: coreSnapshot.ts,
    };
    return this.ensureSnapshotIntegrity(base, { previousChecksum: this.lastSnapshot?.checksum ?? null });
  }

  private getRegistryErrors(): Array<{ path: string; error: string }> {
    const registry = this.registry as unknown as { errors?: Array<{ path: string; error: string }> };
    return Array.isArray(registry.errors) ? registry.errors : [];
  }

  private isRegistryInitialized(): boolean {
    const registry = this.registry as unknown as { isInitialized?: boolean };
    return registry.isInitialized === true;
  }

  private async setupPubSub(): Promise<void> {
    const pubsub = this.opts?.pubsub;
    if (!pubsub?.redisUrl) {
      return;
    }

    const factory = await this.ensureRedisFactory();
    if (!factory) {
      return;
    }

    if (this.mode === 'producer') {
      this.publisher = this.createRedisClient(factory, 'publisher');
      this.redisCache = this.publisher;
      try {
        await this.publisher.connect();
      } catch (error) {
        this.logRedisState('publisher', 'error', {
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    this.subscriber = this.createRedisClient(factory, 'subscriber');
    this.redisCache = this.createRedisClient(factory, 'cache');
    try {
      await this.subscriber.connect();
      await this.subscriber.subscribe(this.registryChannel, (message: string) => {
        void this.handleRegistryMessage(message);
      });
      this.logRedisState('subscriber', 'subscribed', { channel: this.registryChannel });
    } catch (error) {
      this.logRedisState('subscriber', 'error', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    if (this.redisCache) {
      try {
        await this.redisCache.connect();
      } catch (error) {
        this.logRedisState('cache', 'error', {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async ensureRedisFactory(): Promise<RedisFactory | null> {
    if (this.redisFactory) {
      return this.redisFactory;
    }
    try {
      const redisModule = await import('redis');
      const createClient = (redisModule as { createClient?: unknown }).createClient;
      if (typeof createClient !== 'function') {
        this.logger.warn('Redis module missing createClient export', {
          traceId: this.traceId,
        });
        return null;
      }
      this.redisFactory = createClient as unknown as RedisFactory;
      return this.redisFactory;
    } catch (error) {
      this.logger.warn('Failed to load redis module', {
        error: toErrorMeta(error),
        traceId: this.traceId,
      });
      return null;
    }
  }

  private createRedisClient(factory: RedisFactory, role: RedisRole): RedisClient {
    const options: RedisClientOptions = {
      socket: {
        reconnectStrategy: this.createReconnectStrategy(role),
      },
    };

    if (this.opts?.pubsub?.redisUrl) {
      options.url = this.opts.pubsub.redisUrl;
    }

    const client = factory(options);

    client.on('connect', () => {
      this.logRedisState(role, 'connect');
    });
    client.on('ready', () => {
      this.logRedisState(role, 'ready');
    });
    client.on('reconnecting', () => {
      this.logRedisState(role, 'reconnecting');
    });
    client.on('end', () => {
      this.logRedisState(role, 'end');
    });
    client.on('error', (error: unknown) => {
      this.logRedisState(role, 'error', {
        message: error instanceof Error ? error.message : String(error),
      });
    });

    return client;
  }

  private createReconnectStrategy(role: RedisRole): (retries: number) => number {
    return (retries: number) => {
      const attempt = Math.max(1, retries);
      const exponential = this.redisReconnect.initialDelayMs * 2 ** (attempt - 1);
      const capped = Math.min(exponential, this.redisReconnect.maxDelayMs);
      const jitter = Math.floor(capped * this.redisReconnect.jitter * Math.random());
      const delay = capped + jitter;
      this.logRedisState(role, 'reconnecting', { attempt, delayMs: delay });
      return delay;
    };
  }

  private logRedisState(role: RedisRole, state: string, meta?: Record<string, unknown>): void {
    const previous = this.redisStates[role];
    if (previous === state) {
      return;
    }
    this.redisStates[role] = state;
    const payload = {
      role,
      state,
      ...(meta ?? {}),
      traceId: this.traceId,
    };

    if (state === 'error') {
      this.logger.error('Redis client state changed', payload);
    } else if (state === 'reconnecting' || state === 'end') {
      this.logger.warn('Redis client state changed', payload);
    } else if (state === 'ready' || state === 'connect') {
      this.logger.info('Redis client state changed', payload);
    } else {
      this.logger.debug('Redis client state changed', payload);
    }
  }

  private async handleRegistryMessage(message: string): Promise<void> {
    if (this.mode !== 'consumer') {
      return;
    }
    let payload: { rev?: number } | null = null;
    try {
      payload = JSON.parse(message);
    } catch {
      payload = null;
    }
    const currentRev = this.lastSnapshot?.rev ?? 0;
    if (payload && typeof payload.rev === 'number' && payload.rev <= currentRev) {
      return;
    }
    await this.refresh();
  }

  private async publishRegistryChange(snapshot: RegistrySnapshot): Promise<void> {
    if (!this.publisher) {
      return;
    }
    try {
      await this.publisher.publish(
        this.registryChannel,
        JSON.stringify({ schema: 'kb.registry/1', rev: snapshot.rev, generatedAt: snapshot.generatedAt })
      );
    } catch (error) {
      this.logger.warn('Failed to publish registry change', {
        channel: this.registryChannel,
        error: toErrorMeta(error),
        traceId: this.traceId,
      });
    }
  }

  private async publishHealthChange(): Promise<void> {
    if (!this.publisher) {
      return;
    }
    try {
      const health = await this.getSystemHealth();
      await this.publisher.publish(
        this.healthChannel,
        JSON.stringify({ schema: 'kb.health/1', status: health.status, ts: health.ts })
      );
    } catch (error) {
      this.logger.warn('Failed to publish health change', {
        channel: this.healthChannel,
        error: toErrorMeta(error),
        traceId: this.traceId,
      });
    }
  }

  private mapErrorsToPlugins(
    plugins: PluginBrief[],
    errors: Array<{ path: string; error: string }>
  ): Map<string, string> {
    const sourceMap = new Map<string, string>();
    for (const plugin of plugins) {
      const normalizedPath = safeNormalize(plugin.source.path);
      sourceMap.set(normalizedPath, plugin.id);
    }

    const pluginErrors = new Map<string, string>();
    for (const entry of errors) {
      const normalizedPath = safeNormalize(entry.path);
      const pluginId = sourceMap.get(normalizedPath);
      if (pluginId) {
        pluginErrors.set(pluginId, sanitizeError(entry.error));
      }
    }

    return pluginErrors;
  }

  private collectUnmatchedErrors(
    plugins: PluginBrief[],
    errors: Array<{ path: string; error: string }>
  ): string[] {
    const matchedPaths = new Set<string>();
    const sourcePaths = new Set<string>();

    for (const plugin of plugins) {
      sourcePaths.add(safeNormalize(plugin.source.path));
    }

    for (const entry of errors) {
      const normalizedPath = safeNormalize(entry.path);
      if (sourcePaths.has(normalizedPath)) {
        matchedPaths.add(normalizedPath);
      }
    }

    const unmatched: string[] = [];
    for (const entry of errors) {
      const normalizedPath = safeNormalize(entry.path);
      if (!matchedPaths.has(normalizedPath)) {
        unmatched.push(sanitizeError(entry.error));
      }
    }

    return unmatched;
  }

  private sanitizeError(message: string): string {
    if (!message) {
      return 'unknown_error';
    }
    const trimmed = message.trim().split('\n')[0] ?? message.trim();
    return trimmed.length > 160 ? `${trimmed.slice(0, 157)}...` : trimmed;
  }

  private safeNormalize(filePath: string): string {
    try {
      return normalize(resolve(filePath));
    } catch {
      return filePath;
    }
  }

  private mergeMeta(
    meta: SystemHealthOptions['meta'],
    unmatchedErrors: string[],
    initialized: boolean,
    snapshot: RegistrySnapshot
  ): Record<string, unknown> | undefined {
    const merged: Record<string, unknown> = { ...(meta || {}) };

    if (merged.registryInitialized === undefined) {
      merged.registryInitialized = initialized;
    } else if (!initialized) {
      merged.registryInitialized = false;
    }

    if (unmatchedErrors.length > 0) {
      merged.orphanErrors = unmatchedErrors;
    }

    merged.registryRev = snapshot.rev;
    merged.registrySource = snapshot.source;
    merged.registryPartial = snapshot.partial;
    merged.registryStale = snapshot.stale;
    if (snapshot.corrupted) {
      merged.registryCorrupted = true;
    }

    if (!merged.redis) {
      merged.redis = this.getRedisStatus();
    }

    return Object.keys(merged).length > 0 ? merged : undefined;
  }

  private getGitInfo(roots?: string[]): GitInfo | undefined {
    if (cachedGitInfo !== undefined) {
      return cachedGitInfo ?? undefined;
    }

    const envSha =
      process.env.KB_GIT_SHA ||
      process.env.KB_LABS_GIT_SHA ||
      process.env.CI_COMMIT_SHA ||
      process.env.VERCEL_GIT_COMMIT_SHA;
    if (envSha) {
      cachedGitInfo = {
        sha: envSha,
        dirty: ['1', 'true', 'yes'].includes(String(process.env.KB_GIT_DIRTY || process.env.CI_DIRTY || '').toLowerCase()),
      };
      return cachedGitInfo;
    }

    const root = findGitRoot(roots) ?? findGitRoot([process.cwd()]);
    if (!root) {
      cachedGitInfo = null;
      return undefined;
    }

    try {
      const headPath = join(root, '.git', 'HEAD');
      if (!existsSync(headPath)) {
        cachedGitInfo = null;
        return undefined;
      }

      const headContent = readFileSync(headPath, 'utf8').trim();
      let sha = headContent;

      if (headContent.startsWith('ref:')) {
        const ref = headContent.replace('ref:', '').trim();
        const refPath = join(root, '.git', ref);
        if (existsSync(refPath)) {
          sha = readFileSync(refPath, 'utf8').trim();
        }
      }

      let dirty = false;
      try {
        const output = execSync('git status --porcelain', {
          cwd: root,
          stdio: ['ignore', 'pipe', 'ignore'],
        })
          .toString()
          .trim();
        dirty = output.length > 0;
      } catch {
        dirty = false;
      }

      cachedGitInfo = { sha, dirty };
      return cachedGitInfo;
    } catch {
      cachedGitInfo = null;
      return undefined;
    }
  }

  private findGitRoot(roots?: string[]): string | null {
    if (!roots || roots.length === 0) {
      return null;
    }

    for (const root of roots) {
      let current = resolve(root);
      let previous = '';
      while (current !== previous) {
        if (existsSync(join(current, '.git'))) {
          return current;
        }
        previous = current;
        current = dirname(current);
      }
    }

    return null;
  }

  private resolveSnapshotRoot(roots?: readonly string[]): string {
    if (roots && roots.length > 0) {
      try {
        return resolve(roots[0]!);
      } catch {
        return process.cwd();
      }
    }
    return process.cwd();
  }

  private safeParseInt(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.floor(value);
    }
    if (typeof value === 'string') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return 0;
  }
}

function coerceUptime(value?: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  return Math.max(0, Math.floor(process.uptime()));
}

function buildVersionInfo(
  overrides: SystemHealthOptions['version'],
  gitInfo?: GitInfo
): SystemHealthSnapshot['version'] {
  const base: SystemHealthSnapshot['version'] = {
    kbLabs: process.env.KB_LABS_VERSION || process.env.KB_VERSION || CLI_VERSION,
    cli: CLI_VERSION,
    rest: process.env.KB_REST_VERSION || 'unknown',
    studio: process.env.KB_STUDIO_VERSION,
  };

  const merged: SystemHealthSnapshot['version'] = {
    ...base,
    ...overrides,
  };

  if (!merged.git && gitInfo) {
    merged.git = gitInfo;
  }

  return merged;
}

function mapErrorsToPlugins(
  plugins: PluginBrief[],
  errors: Array<{ path: string; error: string }>
): Map<string, string> {
  const sourceMap = new Map<string, string>();
  for (const plugin of plugins) {
    const normalizedPath = safeNormalize(plugin.source.path);
    sourceMap.set(normalizedPath, plugin.id);
  }

  const pluginErrors = new Map<string, string>();
  for (const entry of errors) {
    const normalizedPath = safeNormalize(entry.path);
    const pluginId = sourceMap.get(normalizedPath);
    if (pluginId) {
      pluginErrors.set(pluginId, sanitizeError(entry.error));
    }
  }

  return pluginErrors;
}

function collectUnmatchedErrors(
  plugins: PluginBrief[],
  errors: Array<{ path: string; error: string }>
): string[] {
  const matchedPaths = new Set<string>();
  const sourcePaths = new Set<string>();

  for (const plugin of plugins) {
    sourcePaths.add(safeNormalize(plugin.source.path));
  }

  for (const entry of errors) {
    const normalizedPath = safeNormalize(entry.path);
    if (sourcePaths.has(normalizedPath)) {
      matchedPaths.add(normalizedPath);
    }
  }

  const unmatched: string[] = [];
  for (const entry of errors) {
    const normalizedPath = safeNormalize(entry.path);
    if (!matchedPaths.has(normalizedPath)) {
      unmatched.push(sanitizeError(entry.error));
    }
  }

  return unmatched;
}

function sanitizeError(message: string): string {
  if (!message) {
    return 'unknown_error';
  }
  const trimmed = message.trim().split('\n')[0] ?? message.trim();
  return trimmed.length > 160 ? `${trimmed.slice(0, 157)}...` : trimmed;
}

function safeNormalize(filePath: string): string {
  try {
    return normalize(resolve(filePath));
  } catch {
    return filePath;
  }
}

function mergeMeta(
  meta: SystemHealthOptions['meta'],
  unmatchedErrors: string[],
  initialized: boolean,
  snapshot: RegistrySnapshot
): Record<string, unknown> | undefined {
  const merged: Record<string, unknown> = { ...(meta || {}) };

  if (merged.registryInitialized === undefined) {
    merged.registryInitialized = initialized;
  } else if (!initialized) {
    merged.registryInitialized = false;
  }

  if (unmatchedErrors.length > 0) {
    merged.orphanErrors = unmatchedErrors;
  }

  merged.registryRev = snapshot.rev;
  merged.registrySource = snapshot.source;
  merged.registryPartial = snapshot.partial;
  merged.registryStale = snapshot.stale;
  if (snapshot.corrupted) {
    merged.registryCorrupted = true;
  }

  return Object.keys(merged).length > 0 ? merged : undefined;
}

function getGitInfo(roots?: string[]): GitInfo | undefined {
  if (cachedGitInfo !== undefined) {
    return cachedGitInfo ?? undefined;
  }

  const envSha =
    process.env.KB_GIT_SHA ||
    process.env.KB_LABS_GIT_SHA ||
    process.env.CI_COMMIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA;
  if (envSha) {
    cachedGitInfo = {
      sha: envSha,
      dirty: ['1', 'true', 'yes'].includes(String(process.env.KB_GIT_DIRTY || process.env.CI_DIRTY || '').toLowerCase()),
    };
    return cachedGitInfo;
  }

  const root = findGitRoot(roots) ?? findGitRoot([process.cwd()]);
  if (!root) {
    cachedGitInfo = null;
    return undefined;
  }

  try {
    const headPath = join(root, '.git', 'HEAD');
    if (!existsSync(headPath)) {
      cachedGitInfo = null;
      return undefined;
    }

    const headContent = readFileSync(headPath, 'utf8').trim();
    let sha = headContent;

    if (headContent.startsWith('ref:')) {
      const ref = headContent.replace('ref:', '').trim();
      const refPath = join(root, '.git', ref);
      if (existsSync(refPath)) {
        sha = readFileSync(refPath, 'utf8').trim();
      }
    }

    let dirty = false;
    try {
      const output = execSync('git status --porcelain', {
        cwd: root,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .toString()
        .trim();
      dirty = output.length > 0;
    } catch {
      dirty = false;
    }

    cachedGitInfo = { sha, dirty };
    return cachedGitInfo;
  } catch {
    cachedGitInfo = null;
    return undefined;
  }
}

function findGitRoot(roots?: string[]): string | null {
  if (!roots || roots.length === 0) {
    return null;
  }

  for (const root of roots) {
    let current = resolve(root);
    let previous = '';
    while (current !== previous) {
      if (existsSync(join(current, '.git'))) {
        return current;
      }
      previous = current;
      current = dirname(current);
    }
  }

  return null;
}

function resolveSnapshotRoot(roots?: readonly string[]): string {
  if (roots && roots.length > 0) {
    try {
      return resolve(roots[0]!);
    } catch {
      return process.cwd();
    }
  }
  return process.cwd();
}

function safeParseInt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.floor(value);
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

