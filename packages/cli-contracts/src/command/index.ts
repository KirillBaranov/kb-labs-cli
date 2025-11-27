/**
 * @module @kb-labs/cli-contracts/command
 * Command interface contracts
 */

export type { CliCommandV1, FlagBuilderV1 } from './v1.js';

// Re-export V1 as default version (for convenience)
export type { CliCommandV1 as CliCommand, FlagBuilderV1 as FlagBuilder } from './v1.js';
