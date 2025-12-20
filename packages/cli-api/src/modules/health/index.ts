/**
 * @module @kb-labs/cli-api/modules/health
 * Health aggregation module.
 */

export {
  HealthAggregator,
  type HealthAggregatorDeps,
  type HealthAggregatorOptions,
  type RegistryError,
} from './health-aggregator.js';
export type { GitInfo, SystemHealthSnapshot, SystemHealthOptions } from './types.js';
export { findGitRoot, getGitInfo, resetGitInfoCache } from './git-info.js';
