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

  WorkflowRunParams,
  WorkflowRunsListOptions,
  WorkflowRunsListResult,
  WorkflowLogEvent,
  WorkflowLogStreamOptions,
  WorkflowEventEnvelope,
  WorkflowEventsListOptions,
  WorkflowEventsListResult,
  WorkflowEventStreamOptions,
  WorkflowWorkerOptions,
} from './types.js';

// Factory
export { createCliAPI } from './factory.js';
export { WorkflowService } from './workflows.js';

// Re-export useful types from core CLI package
export type {
  PluginBrief,
  OpenAPISpec,
  StudioRegistry,
  StudioRegistryEntry,
  ExplainResult,
  SourceKind,
  RegistryDiff,
  CliContext,
  CliCommand,
} from '@kb-labs/cli-core';

