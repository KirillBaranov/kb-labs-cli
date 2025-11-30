/**
 * CLI Command Contract V1
 *
 * Defines the interface for CLI commands in the KB Labs framework.
 * This is a type-only contract with zero runtime dependencies.
 */

import type { CliContextV1 } from '../context/v1';

/**
 * Function to build command flags (e.g., yargs options)
 */
export type FlagBuilderV1 = (builder: Record<string, unknown>) => void;

/**
 * CLI Command interface
 *
 * Commands are registered with the CLI framework and executed when invoked.
 */
export interface CliCommandV1 {
  /**
   * Dotted/hierarchical command name
   * Examples: "version", "diagnose", "init.profile"
   */
  name: string;

  /** Human-readable description of what the command does */
  description: string;

  /**
   * Optional: Register command-specific flags
   * @param builder - Flag builder function (e.g., yargs builder)
   */
  registerFlags?(builder: FlagBuilderV1): void;

  /**
   * Execute the command
   * @param ctx - CLI context with env, config, logger, etc.
   * @param argv - Positional arguments after the command name
   * @param flags - Parsed flag values
   * @returns Exit code (0 = success, non-zero = error) or void (treated as 0)
   */
  run(
    ctx: CliContextV1,
    argv: string[],
    flags: Record<string, unknown>,
  ): Promise<number | void> | number | void;
}
