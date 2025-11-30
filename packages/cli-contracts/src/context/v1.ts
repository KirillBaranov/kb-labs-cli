/**
 * CLI Context Contract V1
 *
 * Defines the execution context passed to CLI commands.
 * Contains environment info, configuration, and utilities.
 */

import type { PresenterV1 } from '../presenter/v1';

/**
 * Simple logger interface
 *
 * Note: This is a simplified logger contract for cli-contracts.
 * For structured logging, use @kb-labs/core-sys/logging (Logger interface).
 */
export interface LoggerV1 {
  info?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
  debug?: (message: string) => void;
}

/**
 * User profile configuration
 */
export interface ProfileV1 {
  /** Profile name (e.g., "default", "production") */
  name: string;

  /** Profile-specific configuration values */
  [key: string]: any;
}

/**
 * CLI execution context
 *
 * Passed to every command's run() method.
 * Contains environment info, configuration, and utilities.
 */
export interface CliContextV1 {
  /** Repository root directory (detected from .git) */
  repoRoot?: string;

  /** Current working directory */
  cwd: string;

  /**
   * Structured logger interface (from @kb-labs/core-sys)
   * For advanced logging use cases.
   */
  logger?: any; // Using 'any' to avoid dependency on @kb-labs/core-sys

  /**
   * Output interface (from @kb-labs/core-sys)
   * For user-facing messages (recommended over presenter).
   */
  output?: any; // Using 'any' to avoid dependency on @kb-labs/core-sys

  /**
   * @deprecated Use `output` API instead
   * Legacy presenter interface for backward compatibility.
   */
  presenter: PresenterV1;

  /** Environment variables */
  env: NodeJS.ProcessEnv;

  /** Active user profile */
  profile?: ProfileV1;

  /** Global configuration object */
  config?: Record<string, any>;

  /** Diagnostic messages collected during execution */
  diagnostics: string[];

  /** Whether JSON output has been sent (prevents duplicate output) */
  sentJSON?: boolean;
}
