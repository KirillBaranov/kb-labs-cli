/**
 * @module @kb-labs/cli-api
 * Programmatic API for KB Labs CLI
 */

// Types
export type {
  CliAPI,
  CliInitOptions,
  ErrorEnvelope,
  RunCommandParams,
  RunCommandResult,
  SystemHealthSnapshot,
  SystemHealthOptions,
  RegistrySnapshot,
  RegistrySnapshotManifestEntry,
  RedisStatus,

  // TODO: Re-enable when workflow-engine is ported to V3
  // WorkflowRunParams,
  // WorkflowRunsListOptions,
  // WorkflowRunsListResult,
  // WorkflowLogEvent,
  // WorkflowLogStreamOptions,
  // WorkflowEventEnvelope,
  // WorkflowEventsListOptions,
  // WorkflowEventsListResult,
  // WorkflowEventStreamOptions,
  // WorkflowWorkerOptions,
} from './types';

// Factory
export { createCliAPI } from './factory';
// TODO: Re-enable when workflow-engine is ported to V3
// export { WorkflowService } from './workflows';

// Modular components (for future horizontal scaling)
export {
  // Snapshot management
  SnapshotManager,
  type SnapshotManagerOptions,

  // Health aggregation
  HealthAggregator,
  type HealthAggregatorOptions,
  type HealthAggregatorDeps,
  type RegistryError,
  type GitInfo,
  getGitInfo,
  resetGitInfoCache,

  // Logger abstraction
  type CliApiLogger,
  type LogLevel,
  createCliApiLogger,
  createPlatformLogger,
} from './modules/index.js';

// Re-export useful types from core CLI package
export type {
  PluginBrief,
  OpenAPISpec,
  StudioRegistry,
  StudioRegistryEntry,
  ExplainResult,
  SourceKind,
  RegistryDiff,
  // V1 types removed - use V3 plugin system
  // CliContext,
  // CliCommand,
} from '@kb-labs/cli-core';

