/**
 * @module @kb-labs/cli-api/types
 * Public types for CLI API
 */

import type { ManifestV2 } from '@kb-labs/plugin-manifest';
import type {
  PluginBrief,
  DiscoveryOptions,
  OpenAPISpec,
  StudioRegistry,
  ExplainResult,
  RegistrySnapshot,
  RegistryDiff,
} from '@kb-labs/cli-core';

/**
 * CLI initialization options
 */
export interface CliInitOptions {
  /** Discovery configuration */
  discovery?: Partial<DiscoveryOptions>;
  
  /** Cache configuration */
  cache?: {
    inMemory: boolean;
    ttlMs?: number;
  };
  
  /** Logger configuration */
  logger?: {
    level: 'silent' | 'error' | 'warn' | 'info' | 'debug';
  };
}

/**
 * Error envelope for API responses
 */
export interface ErrorEnvelope {
  code: string;
  message: string;
  context?: Record<string, unknown>;
  remediation?: string;
}

/**
 * Command execution parameters
 */
export interface RunCommandParams {
  /** Plugin ID */
  pluginId: string;
  /** Command ID */
  commandId: string;
  /** Input data */
  input?: unknown;
  /** Execution context (partial) */
  ctx?: {
    requestId?: string;
    workdir?: string;
    outdir?: string;
    debug?: boolean;
  };
}

/**
 * Command execution result
 */
export interface RunCommandResult {
  /** Success flag */
  ok: boolean;
  /** Result data (if success) */
  data?: unknown;
  /** Error (if failure) */
  error?: ErrorEnvelope;
}

/**
 * CLI API interface
 */
export interface CliAPI {
  /**
   * List all discovered plugins
   * @returns Array of plugin briefs
   */
  listPlugins(): Promise<PluginBrief[]>;

  /**
   * Get manifest V2 for a specific plugin
   * @param pluginId - Plugin identifier
   * @returns Manifest or null if not found
   */
  getManifestV2(pluginId: string): Promise<ManifestV2 | null>;

  /**
   * Get OpenAPI specification for a plugin
   * @param pluginId - Plugin identifier
   * @returns OpenAPI spec or null if not found
   */
  getOpenAPISpec(pluginId: string): Promise<OpenAPISpec | null>;

  /**
   * Get studio registry (aggregated data for UI)
   * @returns Studio registry
   */
  getStudioRegistry(): Promise<StudioRegistry>;

  /**
   * Refresh plugin discovery
   * @returns Promise that resolves when refresh is complete
   */
  refresh(): Promise<void>;

  /**
   * Run a command (optional, for executing commands programmatically)
   * @param params - Command parameters
   * @returns Command result
   */
  runCommand?(params: RunCommandParams): Promise<RunCommandResult>;

  /**
   * Explain why a plugin was selected
   * @param pluginId - Plugin identifier
   * @returns Explanation of selection
   */
  explain(pluginId: string): ExplainResult;

  /**
   * Get registry snapshot
   * @returns Current registry snapshot
   */
  snapshot(): RegistrySnapshot;

  /**
   * Subscribe to registry changes
   * @param cb - Callback to invoke on changes
   * @returns Unsubscribe function
   */
  onChange(cb: (diff: RegistryDiff) => void): () => void;

  /**
   * Dispose API and cleanup resources
   */
  dispose(): Promise<void>;
}

// Re-export types for convenience
export type { ExplainResult, RegistrySnapshot, RegistryDiff };

