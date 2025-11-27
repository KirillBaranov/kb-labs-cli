/**
 * @module @kb-labs/cli-contracts
 *
 * Type definitions and contracts for KB Labs CLI framework.
 *
 * This package contains pure TypeScript type definitions with ZERO runtime dependencies.
 * It defines the contracts for:
 * - Commands (CliCommand interface)
 * - Context (CliContext, Profile interfaces)
 * - Presenters (Presenter interface for output)
 *
 * Versioning policy: V1, V2, etc. built into type names for API evolution.
 */

// Command contracts
export type {
  CliCommand,
  CliCommandV1,
  FlagBuilder,
  FlagBuilderV1,
} from './command/index.js';

// Context contracts
export type {
  CliContext,
  CliContextV1,
  Logger,
  LoggerV1,
  Profile,
  ProfileV1,
} from './context/index.js';

// Presenter contracts
export type {
  Presenter,
  PresenterV1,
} from './presenter/index.js';
