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
} from './types.js';

// Factory
export { createCliAPI } from './factory.js';

// Re-export useful types from cli-core
export type {
  PluginBrief,
  OpenAPISpec,
  StudioRegistry,
  StudioRegistryEntry,
} from '@kb-labs/cli-core';

