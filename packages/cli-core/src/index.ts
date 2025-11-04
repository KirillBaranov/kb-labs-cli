/**
 * @module @kb-labs/cli-core
 * Core domain logic for KB Labs CLI
 */

// Types
export type {
  SourceKind,
  PluginBrief,
  RegistrySnapshot,
  RegistryDiff,
  ExplainResult,
  DiscoveryOptions,
  PluginDependency,
  ExecutionLimits,
  PluginLifecycle,
  Logger,
  ConfigService,
  TelemetryService,
  KeyValueStore,
  ResourceTracker,
  Disposable,
  CliContext,
  ContextOptions,
  RouteRef,
  HandlerRef,
} from './types/index.js';

// Cache
export type { CacheAdapter } from './cache/cache-adapter.js';
export { InMemoryCacheAdapter } from './cache/in-memory-adapter.js';

// Context
export { createBaseContext } from './context/base-context.js';

// Will be added in next steps:
// - PluginRegistry
// - Discovery strategies
// - Lifecycle management
// - Resource tracking
// - Generators

