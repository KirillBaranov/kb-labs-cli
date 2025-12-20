/**
 * @module @kb-labs/cli-api/modules
 * Modular components for CLI API - prepared for future scaling.
 */

export { SnapshotManager, type SnapshotManagerOptions } from './snapshot/index.js';
export {
  HealthAggregator,
  type HealthAggregatorOptions,
  type HealthAggregatorDeps,
  type RegistryError,
  type GitInfo,
  type SystemHealthSnapshot,
  type SystemHealthOptions,
  getGitInfo,
  resetGitInfoCache,
} from './health/index.js';
export {
  type CliApiLogger,
  type LogLevel,
  createCliApiLogger,
  createPlatformLogger,
} from './logger/index.js';
