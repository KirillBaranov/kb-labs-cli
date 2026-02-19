/**
 * @module @kb-labs/cli-core/public/contracts
 * Public type contracts for KB Labs CLI
 *
 * This module re-exports commonly used types from core-sys
 * to provide a stable public API for CLI commands and plugins.
 */

// Re-export Output and Logger types from stable public modules
export type { Output } from "@kb-labs/core-sys/output";
export type { Logger, LogLevel, LogContext } from "../platform-logger";

// Re-export other useful types
export type {
  OutputMode,
  VerbosityLevel,
  DebugFormat,
} from "@kb-labs/core-sys/output";
