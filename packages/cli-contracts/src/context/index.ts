/**
 * @module @kb-labs/cli-contracts/context
 * Context and profile interface contracts
 */

export type { CliContextV1, LoggerV1, ProfileV1 } from './v1.js';

// Re-export V1 as default version (for convenience)
export type {
  CliContextV1 as CliContext,
  LoggerV1 as Logger,
  ProfileV1 as Profile,
} from './v1.js';
