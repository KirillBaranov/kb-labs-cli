/**
 * @module @kb-labs/cli-api/types
 * Public types for CLI API
 */

import type {
  PluginBrief,
  SourceKind,
  OpenAPISpec,
  StudioRegistry,
  ExplainResult,
  RegistrySnapshot as CoreRegistrySnapshot,
  RegistryDiff,
} from '@kb-labs/cli-core';
import type { ManifestV2 } from '@kb-labs/plugin-manifest';

type ManifestHeadersConfig = ManifestV2 & { headers?: unknown } extends { headers?: infer H } ? H : unknown;

/**
 * CLI initialization options
 */
export interface CliInitOptions {
  /** Discovery configuration */
  discovery?: Partial<{
    strategies: Array<'workspace' | 'pkg' | 'dir' | 'file'>;
    roots: string[];
    allowDowngrade: boolean;
    watch: boolean;
    debounceMs: number;
  }>;

  /** Cache configuration */
  cache?: {
    inMemory: boolean;
    ttlMs?: number;
  };

  /** Logger configuration */
  logger?: {
    level: 'silent' | 'error' | 'warn' | 'info' | 'debug';
  };

  /** Snapshot configuration */
  snapshot?: {
    /** Producer writes discovery snapshot; consumer reads existing snapshot */
    mode?: 'producer' | 'consumer';
    /** Optional background refresh interval for producers */
    refreshIntervalMs?: number;
  };

  /** Pub/Sub configuration (optional) */
  pubsub?: {
    redisUrl?: string;
    namespace?: string;
    registryChannel?: string;
    healthChannel?: string;
    reconnect?: {
      /** Initial backoff delay in milliseconds (default 500ms) */
      initialDelayMs?: number;
      /** Maximum backoff delay in milliseconds (default 30s) */
      maxDelayMs?: number;
      /** Jitter factor between 0 and 1 (default 0.2) */
      jitter?: number;
    };
  };
}

/**
 * CLI command parameters
 */
export interface RunCommandParams {
  command: string;
  args?: string[];
  cwd?: string;
}

/**
 * CLI command result
 */
export interface RunCommandResult {
  ok: boolean;
  output?: string;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Registry manifest entry stored in snapshot
 */
export interface RegistrySnapshotManifestEntry {
  pluginId: string;
  manifest: ManifestV2;
  pluginRoot: string;
  source: {
    kind: SourceKind;
    path: string;
  };
  headers?: ManifestHeadersConfig;
}

export interface ErrorEnvelope {
  code: string;
  message: string;
  context?: Record<string, unknown>;
  remediation?: string;
}

export interface RedisStatus {
  enabled: boolean;
  healthy: boolean;
  roles: {
    publisher: string | null;
    subscriber: string | null;
    cache: string | null;
  };
}

/**
 * Registry snapshot schema exposed by CLI API
 */
export interface RegistrySnapshot {
  schema: 'kb.registry/1';
  rev: number;
  generatedAt: string;
  expiresAt?: string;
  ttlMs?: number;
  partial: boolean;
  stale: boolean;
  source: {
    cliVersion: string;
    cwd: string;
  };
  corrupted?: boolean;
  checksum?: string;
  checksumAlgorithm?: 'sha256';
  previousChecksum?: string | null;
  plugins: PluginBrief[];
  manifests: RegistrySnapshotManifestEntry[];
}

/**
 * Health snapshot schema
 */
export interface SystemHealthSnapshot {
  schema: 'kb.health/1';
  ts: string;
  uptimeSec: number;
  version: {
    kbLabs: string;
    cli: string;
    rest: string;
    studio?: string;
    git?: {
      sha: string;
      dirty: boolean;
    };
  };
  registry: {
    total: number;
    withRest: number;
    withStudio: number;
    errors: number;
    generatedAt: string;
    expiresAt?: string;
    partial: boolean;
    stale: boolean;
  };
  status: 'healthy' | 'degraded';
  components: Array<{
    id: string;
    version?: string;
    restRoutes?: number;
    studioWidgets?: number;
    lastError?: string;
  }>;
  meta?: Record<string, unknown>;
}

/**
 * Options for generating system health snapshots
 */
export interface SystemHealthOptions {
  /** Explicit uptime to report (seconds); defaults to process.uptime() */
  uptimeSec?: number;
  /** Override version information */
  version?: Partial<SystemHealthSnapshot['version']>;
  /** Additional metadata to include */
  meta?: Record<string, unknown>;
}

/**
 * CLI API contract
 */
export interface CliAPI {
  /** Initialize API */
  initialize(): Promise<void>;
  /** List brief plugin metadata */
  listPlugins(): Promise<PluginBrief[]>;
  /** Get manifest for plugin */
  getManifestV2(pluginId: string): Promise<ManifestV2 | null>;
  /** Build OpenAPI spec for plugin */
  getOpenAPISpec(pluginId: string): Promise<OpenAPISpec | null>;
  /** Build studio registry aggregate */
  getStudioRegistry(): Promise<StudioRegistry>;
  /** Refresh discovery / snapshot */
  refresh(): Promise<void>;
  /** Run CLI command (future) */
  runCommand(params: RunCommandParams): Promise<RunCommandResult>;
  /** Explain plugin resolution */
  explain(pluginId: string): ExplainResult;
  /** Get registry snapshot */
  snapshot(): RegistrySnapshot;
  /** Subscribe to registry changes */
  onChange(cb: (diff: RegistryDiff) => void): () => void;
  /** Dispose API */
  dispose(): Promise<void>;
  /** Get consolidated system health snapshot */
  getSystemHealth(options?: SystemHealthOptions): Promise<SystemHealthSnapshot>;
  /** Get Redis connectivity status (if configured) */
  getRedisStatus?(): RedisStatus;
}

// Re-export selected types for convenience
export type { PluginBrief, ManifestV2, OpenAPISpec, StudioRegistry, ExplainResult, RegistryDiff };
export type { CoreRegistrySnapshot };
export type { RegistrySnapshot as CliRegistrySnapshot };
export type { SystemHealthSnapshot as CliSystemHealthSnapshot };

