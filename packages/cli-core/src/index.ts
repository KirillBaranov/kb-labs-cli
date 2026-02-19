// Core types and interfaces
export * from "./types/index";
// export * from "./command"; // DELETED - V1 legacy
export * from "./context";
export * from "./flags";
export * from "./platform-logger";

// Error handling
export {
  EXIT_CODES,
  CLI_ERROR_CODES,
  CliError,
  mapCliErrorToExitCode,
} from "./errors";

// I/O and adapters
export * from "./io/types";

// Plugins system
// export * from "./plugins/types"; // DELETED - V1 legacy

// Presenters
export * from "./presenter/types";
export * from "./presenter/text";
export * from "./presenter/json";
export * from "./presenter/colors";
export * from "./presenter/loader";

// Telemetry
export * from "./telemetry/types";

// Registry
// export * from "./registry"; // DELETED - V1 legacy
export {
  PluginRegistry,
  type PluginBrief,
  type RegistrySnapshot,
  type RegistryDiff,
  type ExplainResult,
  type DiscoveryOptions,
  type CacheOptions,
  type RouteRef,
  type HandlerRef,
  type SourceKind,
} from "./registry/plugin-registry";
export { WatchManager } from "./registry/watch-manager";

// Re-export specific functions that are imported by other packages
export { createLoader } from "./presenter/loader";
export { createContext } from "./context";

// Cache
export type { CacheAdapter } from "./cache/cache-adapter";
export { InMemoryCacheAdapter } from "./cache/in-memory-adapter";
export {
  SchemaCache,
  calculateManifestChecksum,
  getSchemaCache,
  resetSchemaCache,
} from "./cache/schema-cache";

// Generators
export {
  generateOpenAPISpec,
  mergeOpenAPISpecs,
  type OpenAPISpec,
} from "./generators/openapi";
export {
  generateStudioRegistry,
  type StudioRegistry,
  type StudioRegistryEntry,
} from "./generators/studio-registry";

// Discovery
export {
  DependencyResolver,
  type PluginDependency,
  type ResolvedGraph,
  type ValidationResult,
} from "./discovery/dependency-resolver";
export { PathValidator } from "./discovery/path-validator";

// Lifecycle
export {
  LifecycleManager,
  type PluginLifecycle,
  type ExecutionLimits,
} from "./lifecycle/lifecycle-manager";

// Layered surface exports (structured access points)
export * as framework from "./public/framework";
export * as presenters from "./public/presenters";
export * as errors from "./public/errors";
export * as publicTypes from "./public/types";

// V3 Plugin System
export * from "./v3/index";
