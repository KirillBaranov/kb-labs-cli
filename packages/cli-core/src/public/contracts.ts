/**
 * @module @kb-labs/cli-core/public/contracts
 * Public type contracts for KB Labs CLI
 *
 * This module re-exports commonly used types from core-sys
 * to provide a stable public API for CLI commands and plugins.
 */

// Re-export Output and Logger types from core-sys
export type { Output } from "@kb-labs/core-sys/output";
export type { Logger } from "@kb-labs/core-sys/logging";

// Re-export other useful types
export type { LogLevel, LogContext } from "@kb-labs/core-sys/logging";
export type {
  OutputMode,
  VerbosityLevel,
  DebugFormat,
} from "@kb-labs/core-sys/output";
