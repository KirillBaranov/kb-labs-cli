/**
 * @module @kb-labs/cli-core/types
 * Public types for CLI core
 */

/**
 * Source kind for discovered plugins
 */
export type SourceKind = 'workspace' | 'pkg' | 'dir' | 'file';

/**
 * Plugin brief information
 */
export interface PluginBrief {
  /** Plugin identifier */
  id: string;
  /** Plugin version */
  version: string;
  /** Manifest kind */
  kind: 'v2';
  /** Source information */
  source: {
    kind: SourceKind;
    path: string;
  };
  /** Display information */
  display?: {
    name?: string;
    description?: string;
  };
}

/**
 * Registry snapshot
 */
export interface RegistrySnapshot {
  /** Registry version */
  version: string;
  /** List of plugins */
  plugins: PluginBrief[];
  /** Timestamp */
  ts: number;
}

/**
 * Registry diff
 */
export interface RegistryDiff {
  /** Added plugins */
  added: PluginBrief[];
  /** Removed plugins */
  removed: PluginBrief[];
  /** Changed plugins */
  changed: Array<{
    from: PluginBrief;
    to: PluginBrief;
  }>;
}

/**
 * Explain result - why a plugin was selected
 */
export interface ExplainResult {
  /** Plugin ID */
  pluginId: string;
  /** Selected version and source */
  selected: {
    version: string;
    source: string;
    path: string;
  };
  /** Other candidates considered */
  candidates: Array<{
    version: string;
    source: string;
    path: string;
    reason: string;
  }>;
  /** Resolution rules applied */
  resolutionRules: string[];
}

/**
 * Discovery options
 */
export interface DiscoveryOptions {
  /** Discovery strategies to use */
  strategies: Array<'workspace' | 'pkg' | 'dir' | 'file'>;
  /** Root directories to search */
  roots?: string[];
  /** Allow downgrading to older versions */
  allowDowngrade?: boolean;
  /** Enable file watching */
  watch?: boolean;
  /** Debounce time for file changes (ms) */
  debounceMs?: number;
}

/**
 * Plugin dependency
 */
export interface PluginDependency {
  /** Dependency plugin ID */
  id: string;
  /** Version range (semver) */
  version: string;
  /** Optional dependency */
  optional?: boolean;
}

/**
 * Execution limits
 */
export interface ExecutionLimits {
  /** Lifecycle hook timeout (ms) */
  lifecycleTimeoutMs: number;
  /** Middleware timeout (ms) */
  middlewareTimeoutMs: number;
  /** Discovery timeout (ms) */
  discoveryTimeoutMs: number;
}

/**
 * Plugin lifecycle interface
 */
export interface PluginLifecycle {
  onLoad?: (ctx: CliContext) => Promise<void>;
  onUnload?: (ctx: CliContext) => Promise<void>;
  onEnable?: (ctx: CliContext) => Promise<void>;
  onDisable?: (ctx: CliContext) => Promise<void>;
}

/**
 * Logger interface
 */
export interface Logger {
  debug(msg: string, meta?: object): void;
  info(msg: string, meta?: object): void;
  warn(msg: string, meta?: object): void;
  error(msg: string, meta?: object): void;
}

/**
 * Config service interface
 */
export interface ConfigService {
  get<T>(key: string): T | undefined;
  set(key: string, value: unknown): Promise<void>;
  has(key: string): boolean;
}

/**
 * Telemetry service interface
 */
export interface TelemetryService {
  track(event: string, props?: object): void;
  flush(): Promise<void>;
}

/**
 * Key-value store interface
 */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}

/**
 * Resource tracker interface
 */
export interface ResourceTracker {
  register(pluginId: string, cleanup: () => Promise<void>): void;
  registerDisposable(pluginId: string, resource: Disposable): void;
  cleanupPlugin(pluginId: string): Promise<void>;
  cleanupAll(): Promise<void>;
  getResourceCount(pluginId: string): number;
}

/**
 * Disposable resource interface
 */
export interface Disposable {
  dispose(): Promise<void> | void;
}

/**
 * CLI Context - unified context for all CLI operations
 */
export interface CliContext {
  /** Logger */
  logger: Logger;
  /** Config service */
  config: ConfigService;
  /** Telemetry */
  telemetry: TelemetryService;
  /** Storage */
  storage: KeyValueStore;
  /** Resource tracker */
  resources: ResourceTracker;
}

/**
 * Context options for creation
 */
export interface ContextOptions {
  logger?: Partial<Logger>;
  config?: Partial<ConfigService>;
  telemetry?: Partial<TelemetryService>;
  storage?: Partial<KeyValueStore>;
  limits?: ExecutionLimits;
}

/**
 * Route reference for handler resolution
 */
export type RouteRef = `${string}:${'GET'|'POST'|'PUT'|'PATCH'|'DELETE'} ${string}`;

/**
 * Handler reference
 */
export interface HandlerRef {
  file: string;
  export: string;
}

