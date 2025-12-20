/**
 * @module @kb-labs/cli-api/cli-api-impl
 * CLI API implementation using modular components.
 */

import type { ManifestV3, CliCommandDecl } from '@kb-labs/plugin-contracts';
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
} from './types.js';
import type { RedisClientType, RedisClientOptions } from 'redis';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';

// Import modules
import {
  SnapshotManager,
  HealthAggregator,
  type CliApiLogger,
  createCliApiLogger,
  createPlatformLogger,
  getGitInfo,
} from './modules/index.js';
import { cloneValue, safeParseInt } from './modules/snapshot/utils.js';

// Version is injected at build time by tsup define
declare const __CLI_API_VERSION__: string;
const CLI_VERSION = typeof __CLI_API_VERSION__ !== 'undefined' ? __CLI_API_VERSION__ : '0.0.0';

const DEFAULT_RECONNECT_INITIAL_DELAY_MS = 500;
const DEFAULT_RECONNECT_MAX_DELAY_MS = 30_000;
const DEFAULT_RECONNECT_JITTER = 0.2;

type Mode = 'producer' | 'consumer';
type RedisRole = 'publisher' | 'subscriber' | 'cache';

type RedisClient = RedisClientType;
type RedisFactory = (options?: RedisClientOptions) => RedisClient;

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

/**
 * CLI API implementation
 */
export class CliAPIImpl implements CliAPI {
  private registry: PluginRegistry;
  private initialized = false;
  private lastSnapshot: RegistrySnapshot | null = null;
  private snapshotManifestMap = new Map<string, RegistrySnapshotManifestEntry>();
  private readonly snapshotManager: SnapshotManager;
  private readonly healthAggregator: HealthAggregator;
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
  private readonly logger: CliApiLogger;

  constructor(private opts?: CliInitOptions) {
    const discoveryOpts = {
      strategies: opts?.discovery?.strategies || ['workspace', 'pkg', 'dir', 'file'],
      roots: opts?.discovery?.roots,
      allowDowngrade: opts?.discovery?.allowDowngrade || false,
      watch: opts?.discovery?.watch || false,
      debounceMs: opts?.discovery?.debounceMs,
    } as const;

    // Create logger (prefer platform logger if available)
    const isDebug = process.env.DEBUG_SANDBOX === '1' || process.env.NODE_ENV === 'development';
    const defaultLevel = isDebug ? 'debug' : 'silent';
    const logLevel = opts?.logger?.level ?? defaultLevel;
    this.traceId = resolveTraceId();

    const logContext = {
      traceId: this.traceId,
      component: 'cli-api',
      pid: process.pid,
    };

    if (opts?.platform?.logger) {
      this.logger = createPlatformLogger(opts.platform.logger, logContext);
    } else {
      this.logger = createCliApiLogger(logLevel, logContext);
    }

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

    const snapshotRoot = resolveSnapshotRoot(discoveryOpts.roots);

    // Initialize SnapshotManager
    this.snapshotManager = new SnapshotManager({
      root: snapshotRoot,
      ttlMs: opts?.cache?.ttlMs,
      cliVersion: CLI_VERSION,
      logger: this.logger,
      cache: opts?.platform?.cache,
      redisSnapshotKey: this.redisSnapshotKey ?? undefined,
    });

    // Initialize HealthAggregator
    this.healthAggregator = new HealthAggregator({
      deps: {
        getSnapshot: () => this.snapshot(),
        listPlugins: () => this.listPlugins(),
        getRegistryErrors: () => this.getRegistryErrors(),
        getManifest: (pluginId) => this.registry.getManifestV3(pluginId) ?? undefined,
        getSnapshotManifestEntry: (pluginId) => this.snapshotManifestMap.get(pluginId),
        isRegistryInitialized: () => this.isRegistryInitialized(),
        mode: this.mode,
        discoveryRoots: opts?.discovery?.roots,
        cliVersion: CLI_VERSION,
      },
    });

    // Load initial snapshot from disk
    this.lastSnapshot = this.snapshotManager.loadFromDisk();
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
      this.lastSnapshot = await this.snapshotManager.loadFromCache();
    }

    if (this.mode === 'consumer') {
      if (!this.lastSnapshot) {
        this.lastSnapshot = this.snapshotManager.createEmpty(true);
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
      void this.refresh().catch((error) => {
        this.logger.warn('Initial refresh failed', {
          error: toErrorMeta(error),
          traceId: this.traceId,
        });
      });
    }

    if (this.refreshIntervalMs && this.refreshIntervalMs > 0) {
      this.snapshotTimer = setInterval(() => {
        void this.refresh().catch((error) => {
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
  async getManifestV2(pluginId: string): Promise<ManifestV3 | null> {
    if (this.mode === 'consumer') {
      const entry = this.snapshotManifestMap.get(pluginId);
      return entry ? cloneValue(entry.manifest) : null;
    }
    return this.registry.getManifestV3(pluginId);
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
    const manifests = new Map<string, ManifestV3>();

    if (this.mode === 'consumer') {
      for (const entry of this.snapshotManifestMap.values()) {
        manifests.set(entry.pluginId, cloneValue(entry.manifest));
      }
    } else {
      for (const plugin of plugins) {
        const manifest = this.registry.getManifestV3(plugin.id);
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
      let snapshot = this.snapshotManager.loadFromDisk();
      if (!snapshot) {
        snapshot = await this.snapshotManager.loadFromCache();
      }
      if (!snapshot) {
        snapshot = this.snapshotManager.createEmpty(true);
      }
      this.lastSnapshot = this.snapshotManager.ensureStaleness(snapshot);
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
    await this.snapshotManager.persist(snapshot);
    this.emitSnapshotChange();
    await this.publishRegistryChange(snapshot);
    await this.publishHealthChange();
  }

  /**
   * Run a command (optional)
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
      const plugin = this.lastSnapshot?.plugins.find((p) => p.id === pluginId);
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
      this.lastSnapshot = this.snapshotManager.createEmpty(true);
    }

    const refreshed = this.snapshotManager.ensureStaleness(this.lastSnapshot);
    this.lastSnapshot = refreshed;
    this.updateSnapshotCaches(refreshed);

    return {
      ...refreshed,
      plugins: [...refreshed.plugins],
      manifests: refreshed.manifests.map((entry) => ({
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
    return this.healthAggregator.getSystemHealth(options);
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
        : activeStates.every((state) => state !== null && healthyStates.has(state)));
    return {
      enabled,
      healthy,
      roles,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private methods
  // ═══════════════════════════════════════════════════════════════════════════

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
    const ttlMs = this.snapshotManager.getTtlMs();
    const expiresAt = new Date(Date.parse(generatedAt) + ttlMs).toISOString();
    const plugins = this.registry.list();
    const manifests: RegistrySnapshotManifestEntry[] = [];

    for (const plugin of plugins) {
      const manifest = this.registry.getManifestV3(plugin.id);
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

    return this.snapshotManager.normalizeSnapshot(
      {
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
          cwd: this.snapshotManager.getRoot(),
        },
        corrupted: false,
        plugins,
        manifests,
        ts: coreSnapshot.ts,
      },
      { previousChecksum: this.lastSnapshot?.checksum ?? null }
    );
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
}
