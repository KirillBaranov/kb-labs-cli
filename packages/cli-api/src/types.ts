/**
 * @module @kb-labs/cli-api/types
 * Public types for CLI API
 */

import type {
  RegistryDiff,
  RegistrySnapshot as CoreRegistrySnapshot,
  PluginBrief,
  OpenAPISpec,
  StudioRegistry,
  ExplainResult,
  SourceKind,
} from '@kb-labs/cli-core';
import type { ManifestV3, PlatformServices } from '@kb-labs/plugin-contracts';

type ManifestHeadersConfig = ManifestV3 & { headers?: unknown } extends { headers?: infer H } ? H : unknown;

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

  /**
   * Optional platform services injection.
   * When provided, CLI API will use centralized platform adapters
   * (logger, cache, eventBus) instead of its own implementations.
   *
   * @example
   * ```typescript
   * import { getPlatformServices } from '@kb-labs/rest-api';
   *
   * const api = await createCliAPI({
   *   platform: getPlatformServices(),
   * });
   * ```
   */
  platform?: Partial<PlatformServices>;
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
  manifest: ManifestV3;
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
 * Discovery error for failed plugin loads
 */
export interface DiscoveryError {
  /** Plugin path or identifier where error occurred */
  pluginPath: string;
  /** Plugin ID if it could be extracted */
  pluginId?: string;
  /** Error message */
  error: string;
  /** Error code (e.g., 'MANIFEST_NOT_FOUND', 'PARSE_ERROR', 'VALIDATION_ERROR') */
  code?: string;
}

/**
 * Registry snapshot schema exposed by CLI API
 */
export interface RegistrySnapshot extends CoreRegistrySnapshot {
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
  manifests: RegistrySnapshotManifestEntry[];
  /** Discovery errors for plugins that failed to load */
  errors?: DiscoveryError[];
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
  getManifestV2(pluginId: string): Promise<ManifestV3 | null>;
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
  // TODO: Re-enable when workflow-engine is ported to V3
  // /** Run a workflow specification */
  // runWorkflow(input: WorkflowRunParams): Promise<WorkflowRun>;
  // /** List workflow runs */
  // listWorkflowRuns(options?: WorkflowRunsListOptions): Promise<WorkflowRunsListResult>;
  // /** Retrieve a workflow run */
  // getWorkflowRun(runId: string): Promise<WorkflowRun | null>;
  // /** Cancel a workflow run */
  // cancelWorkflowRun(runId: string): Promise<WorkflowRun | null>;
  // /** Stream workflow log events */
  // streamWorkflowLogs(options: WorkflowLogStreamOptions): Promise<void>;
  // /** List workflow presenter events */
  // listWorkflowEvents(options: WorkflowEventsListOptions): Promise<WorkflowEventsListResult>;
  // /** Stream workflow presenter events */
  // streamWorkflowEvents(options: WorkflowEventStreamOptions): Promise<void>;
  // /** Create a workflow worker (caller is responsible for start/stop lifecycle) */
  // createWorkflowWorker(options?: WorkflowWorkerOptions): Promise<WorkflowWorker>;
}

// Re-export selected types for convenience
export type { PluginBrief, ManifestV3, OpenAPISpec, StudioRegistry, ExplainResult, RegistryDiff };
export type { CoreRegistrySnapshot };
export type { RegistrySnapshot as CliRegistrySnapshot };
export type { SystemHealthSnapshot as CliSystemHealthSnapshot };

// TODO: Re-enable when workflow-engine is ported to V3
// /**
//  * Workflow API types
//  */
// export interface WorkflowRunParams {
//   spec: WorkflowSpec;
//   idempotencyKey?: string;
//   concurrencyGroup?: string;
//   metadata?: Record<string, unknown>;
//   trigger?: {
//     type: 'manual' | 'webhook' | 'push' | 'schedule';
//     actor?: string;
//     payload?: Record<string, unknown>;
//   };
//   source?: string;
// }
//
// export interface WorkflowRunsListOptions {
//   status?: string;
//   limit?: number;
// }
//
// export interface WorkflowRunsListResult {
//   runs: WorkflowRun[];
//   total: number;
// }
//
// export interface WorkflowLogEvent {
//   type: string;
//   runId: string;
//   jobId?: string;
//   stepId?: string;
//   payload?: Record<string, unknown>;
//   timestamp?: string;
// }
//
// export interface WorkflowLogStreamOptions {
//   runId: string;
//   follow?: boolean;
//   idleTimeoutMs?: number;
//   signal?: AbortSignal;
//   onEvent: (event: WorkflowLogEvent) => void;
// }
//
// export interface WorkflowEventEnvelope {
//   id: string;
//   type: string;
//   version: string;
//   timestamp: string;
//   payload?: unknown;
//   meta?: Record<string, unknown>;
// }
//
// export interface WorkflowEventsListOptions {
//   runId: string;
//   cursor?: string | null;
//   limit?: number;
// }
//
// export interface WorkflowEventsListResult {
//   events: WorkflowEventEnvelope[];
//   cursor: string | null;
// }
//
// export interface WorkflowEventStreamOptions {
//   runId: string;
//   cursor?: string | null;
//   follow?: boolean;
//   pollIntervalMs?: number;
//   signal?: AbortSignal;
//   onEvent: (event: WorkflowEventEnvelope) => void;
// }
//
// export interface WorkflowWorkerOptions {
//   pollIntervalMs?: number;
//   heartbeatIntervalMs?: number;
//   leaseTtlMs?: number;
//   maxConcurrentJobs?: number;
//   artifactsRoot?: string;
//   defaultWorkspace?: string;
//   redis?: CreateRedisClientOptions;
//   discovery?: {
//     strategies?: Array<'workspace' | 'pkg' | 'dir' | 'file'>;
//     roots?: string[];
//   };
// }


