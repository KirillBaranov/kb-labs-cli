/**
 * @module @kb-labs/cli-command-kit
 * Command Kit - High-level API and utilities for building CLI commands
 */

import type { CliContext } from '@kb-labs/cli-contracts';
import { TimingTracker } from '@kb-labs/shared-cli-ui';
import { defineFlags, validateFlags, type FlagSchemaDefinition, type InferFlags, FlagValidationError } from './flags/index.js';
import { trackCommand, type TrackingConfig } from './analytics/index.js';
import { formatError } from './errors/index.js';
import type { EnhancedCliContext } from './helpers/context.js';
import { createOutputHelpers } from './output-helpers.js';

// Re-exports
export * from './flags/index.js';
export * from './analytics/index.js';
export * from './errors/index.js';
export * from './helpers/index.js';
export * from './define-system-command.js';
export * from './output-helpers.js';
export type { CommandOutput } from '@kb-labs/shared-cli-ui';

/**
 * Command execution status
 */
export type CommandStatus = 'success' | 'failed' | 'error' | 'cancelled' | 'skipped';

/**
 * Helper types for command results (optional - use when convenient)
 * 
 * These types make it easier to define command results without repeating `CommandResult &`.
 * They are completely optional - you can still use `CommandResult & { ... }` directly.
 * 
 * @example
 * ```typescript
 * // Using helper types (optional)
 * type MyResult = SuccessResult<{ items: Item[]; total: number }>;
 * 
 * // Direct usage (also works)
 * type MyResult = CommandResult & { ok: true; items: Item[]; total: number };
 * ```
 */
export type SuccessResult<T extends Record<string, unknown> = Record<string, never>> = CommandResult & { ok: true } & T;
export type ErrorResult<T extends Record<string, unknown> = Record<string, never>> = CommandResult & { ok: false; error: string } & T;
export type ResultWith<T extends Record<string, unknown>> = CommandResult & T;

/**
 * Base command result contract - all command results must extend this
 * 
 * This defines the minimal contract that every command must fulfill.
 * Every command MUST explicitly declare its result type via generic TResult parameter.
 * 
 * Required fields:
 * - `ok: boolean` - execution success status
 * 
 * Recommended fields:
 * - `error?: string` - error message when ok === false
 * - `status?: CommandStatus` - execution status (auto-inferred if not provided)
 * 
 * Additional fields should be added via generic TResult type parameter.
 * 
 * @example
 * ```typescript
 * // Minimal result (not recommended - use explicit type)
 * type MyResult = CommandResult; // { ok: boolean; error?: string; status?: CommandStatus }
 * 
 * // Extended result with custom fields (RECOMMENDED)
 * type WorkflowRunResult = CommandResult & {
 *   run: WorkflowRun;
 *   timingMs: number;
 * };
 * 
 * type ListResult = CommandResult & {
 *   items: Item[];
 *   total: number;
 * };
 * ```
 */
export type CommandResult = {
  /** Whether the command executed successfully - REQUIRED */
  ok: boolean;
  /** Error message if ok === false - RECOMMENDED for error cases */
  error?: string;
  /** Execution status - automatically inferred from ok if not provided */
  status?: CommandStatus;
};

/**
 * Command handler function signature
 * 
 * TResult must extend CommandResult ({ ok: boolean }) and represents the contract
 * for what the command returns. This ensures type safety and enables future contract
 * validation.
 * 
 * TArgv is optional - by default it's `string[]`, but you can provide a tuple type
 * for strict argument typing if needed.
 * 
 * @example
 * ```typescript
 * // Default: argv is string[]
 * handler: (ctx, argv, flags) => { ... }
 * 
 * // Strict typing: argv is tuple ['workflow-id', ...string[]]
 * handler: (ctx, argv: ['workflow-id', ...string[]], flags) => {
 *   const workflowId = argv[0]; // TypeScript knows it's 'workflow-id'
 * }
 * ```
 */
export type CommandHandler<
  TFlags extends Record<string, unknown> = Record<string, unknown>,
  TResult extends CommandResult = CommandResult,
  TArgv extends readonly string[] = string[]
> = (
  ctx: EnhancedCliContext,
  argv: TArgv,
  flags: TFlags
) => Promise<number | TResult> | number | TResult;

/**
 * Command formatter function
 * 
 * All type parameters are optional with defaults - same as CommandHandler.
 * Use explicit types when you want type safety, skip them for simplicity.
 * 
 * @example
 * ```typescript
 * // Default: argv is string[]
 * formatter: (result, ctx, flags) => { ... }
 * 
 * // Strict typing: argv is tuple ['workflow-id', ...string[]]
 * formatter: (result, ctx, flags, argv: ['workflow-id', ...string[]]) => {
 *   const workflowId = argv[0]; // TypeScript knows it's 'workflow-id'
 * }
 * ```
 */
export type CommandFormatter<
  TFlags extends Record<string, unknown> = Record<string, unknown>,
  TResult extends CommandResult = CommandResult,
  TArgv extends readonly string[] = string[]
> = (
  result: TResult,
  ctx: EnhancedCliContext,
  flags: TFlags,
  argv?: TArgv
) => void;

/**
 * Command configuration
 * 
 * All type parameters are optional with sensible defaults:
 * - TResult defaults to CommandResult (basic { ok: boolean })
 * - TFlags defaults to FlagSchemaDefinition (flags are Record<string, unknown>)
 * - TArgv defaults to string[] (arguments are string[])
 * 
 * Use explicit types when you want better type safety, but everything works without them.
 * 
 * @example
 * ```typescript
 * // Default: argv is string[]
 * const cmd = defineCommand({
 *   handler: (ctx, argv, flags) => { ... }
 * });
 * 
 * // Strict typing: argv is tuple ['workflow-id', ...string[]]
 * const cmd = defineCommand<Flags, Result, ['workflow-id', ...string[]]>({
 *   handler: (ctx, argv, flags) => {
 *     const workflowId = argv[0]; // TypeScript knows it's 'workflow-id'
 *   }
 * });
 * ```
 */
export interface CommandConfig<
  TFlags extends FlagSchemaDefinition = FlagSchemaDefinition,
  TResult extends CommandResult = CommandResult,
  TArgv extends readonly string[] = string[]
> {
  /** Command name (for logging) */
  name?: string;
  /** Flag schema definition */
  flags: TFlags;
  /** Analytics configuration */
  analytics?: Omit<TrackingConfig, 'command'> & { command?: string };
  /** Command handler - must return TResult */
  handler: CommandHandler<InferFlags<TFlags>, TResult, TArgv>;
  /** Optional formatter for output - receives TResult */
  formatter?: CommandFormatter<InferFlags<TFlags>, TResult, TArgv>;
}

/**
 * Define a command with automatic validation, logging, analytics, and error handling
 * 
 * Returns a function with signature `(ctx, argv, flags) => Promise<number>`
 * that can be used as a command handler in manifest.v2.ts
 * 
 * All type parameters are optional - use them when you want type safety, skip them for simplicity.
 * 
 * @example
 * ```typescript
 * // Simple command with basic result
 * export const releaseRunHandler = defineCommand<
 *   { scope: { type: 'string'; required: true } },
 *   CommandResult & { published: number }
 * >({
 *   name: 'release:run',
 *   flags: {
 *     scope: { type: 'string', required: true },
 *     'dry-run': { type: 'boolean', default: false },
 *   },
 *   analytics: {
 *     startEvent: 'RELEASE_RUN_STARTED',
 *     finishEvent: 'RELEASE_RUN_FINISHED',
 *   },
 *   async handler(ctx, argv, flags) {
 *     ctx.logger?.info('Release started', { scope: flags.scope });
 *     ctx.tracker.checkpoint('planning');
 *     // ... business logic
 *     return { ok: true, published: 5 };
 *   },
 * });
 * 
 * // Command with error handling
 * type ReleaseResult = CommandResult & {
 *   published?: number;
 *   skipped?: number;
 * };
 * 
 * export const releaseHandler = defineCommand<
 *   { scope: { type: 'string' } },
 *   ReleaseResult
 * >({
 *   flags: { scope: { type: 'string', required: true } },
 *   async handler(ctx, argv, flags) {
 *     try {
 *       const result = await publish(flags.scope);
 *       return { ok: true, published: result.published, skipped: result.skipped };
 *     } catch (error) {
 *       return { ok: false, error: error.message, status: 'error' };
 *     }
 *   },
 * });
 * ```
 */
export function defineCommand<
  TFlags extends FlagSchemaDefinition,
  TResult extends CommandResult = CommandResult,
  TArgv extends readonly string[] = string[]
>(
  config: CommandConfig<TFlags, TResult, TArgv>
): (ctx: CliContext, argv: string[], rawFlags: Record<string, unknown>) => Promise<number> {
  const { name, flags, analytics, handler, formatter } = config;
  const flagSchema = defineFlags(flags);

  return async function commandHandler(
    ctx: CliContext,
    argv: string[],
    rawFlags: Record<string, unknown>
  ): Promise<number> {
    const tracker = new TimingTracker();
    const jsonMode = Boolean(rawFlags.json);

    // Validate flags
    let validatedFlags: InferFlags<TFlags>;
    try {
      validatedFlags = await validateFlags(rawFlags, flagSchema);
    } catch (error) {
      // Enhance validation error with command name
      if (error instanceof FlagValidationError && name && !error.commandName) {
        (error as { commandName?: string }).commandName = name;
      }

      // Show stack trace only in debug mode
      const showStack = Boolean(rawFlags.debug);
      const formatted = formatError(error, { showStack, jsonMode });

      if (jsonMode) {
        ctx.output?.json(formatted.json);
      } else {
        ctx.output?.error(formatted.message);
      }

      // Return specific exit code for validation errors
      return 3; // EXIT_CODES.INVALID_FLAGS
    }

    // Enhance context with tracker and output helpers
    const outputHelpers = createOutputHelpers();
    const enhancedCtx: EnhancedCliContext = {
      ...ctx,
      tracker,
      success: outputHelpers.success,
      error: outputHelpers.error,
      warning: outputHelpers.warning,
      info: outputHelpers.info,
      result: outputHelpers.result,
    };

    // Setup analytics if configured
    // Note: ctx.analytics may not exist in CliContext, so we pass undefined
    // The trackCommand function will handle the case when analytics is not available
    let analyticsHelper: ReturnType<typeof trackCommand> | null = null;
    if (analytics) {
      analyticsHelper = trackCommand((ctx as { analytics?: unknown }).analytics, {
        command: analytics.command || name || 'unknown',
        startEvent: analytics.startEvent,
        finishEvent: analytics.finishEvent,
        actor: analytics.actor,
        context: analytics.context,
        includeFlags: analytics.includeFlags,
      });
    }

    // Run command within analytics scope (or directly if no analytics)
    const runCommand = async (): Promise<number> => {
      try {
        // Log start
        if (name) {
          ctx.logger?.info(`Command started: ${name}`, {
            flags: analytics?.includeFlags ? validatedFlags : undefined,
          });
        }

        // Emit started event
        if (analyticsHelper) {
          await analyticsHelper.emit('started', {
            ...(analytics?.includeFlags ? validatedFlags : {}),
          });
        }

        tracker.checkpoint('start');

        // Call user handler
        const result = await handler(enhancedCtx, argv as unknown as TArgv, validatedFlags);

        tracker.checkpoint('complete');

        // Handle result
        let exitCode = 0;
        let resultData: TResult & { timingMs?: number } = { ok: true } as TResult & { timingMs?: number };

        if (typeof result === 'number') {
          exitCode = result;
          resultData = { 
            ok: result === 0,
            status: result === 0 ? 'success' : 'failed',
          } as TResult & { timingMs?: number };
        } else if (result && typeof result === 'object' && 'ok' in result) {
          resultData = result as TResult & { timingMs?: number };
          // Ensure status is set if not provided
          if (!resultData.status) {
            resultData.status = resultData.ok ? 'success' : (resultData.error ? 'error' : 'failed');
          }
          exitCode = resultData.ok ? 0 : 1;
        } else {
          resultData = { ok: true, status: 'success' } as TResult & { timingMs?: number };
        }

        // Add timing to result
        resultData.timingMs = tracker.total();

        // Log completion
        if (name) {
          ctx.logger?.info(`Command completed: ${name}`, {
            ok: resultData.ok,
            timingMs: tracker.total(),
          });
        }

        // Emit finished event
        if (analyticsHelper) {
          await analyticsHelper.emit('finished', {
            result: resultData.ok ? 'success' : 'failed',
            timingMs: tracker.total(),
            ...(analytics?.includeFlags ? validatedFlags : {}),
          });
        }

            // Format output
            if (formatter) {
              formatter(resultData, enhancedCtx, validatedFlags, argv as unknown as TArgv);
            } else {
          // Default formatting
          if (jsonMode) {
            ctx.output?.json(resultData);
          } else {
            if (resultData.ok) {
              ctx.output?.write(`✓ ${name || 'Command'} completed`);
            } else {
              ctx.output?.error(`✗ ${name || 'Command'} failed`);
            }
          }
        }

        return exitCode;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Log error
        if (name) {
          ctx.logger?.error(`Command failed: ${name}`, {
            error: errorMessage,
            timingMs: tracker.total(),
          });
        }

        // Emit error event
        if (analyticsHelper) {
          await analyticsHelper.emit('finished', {
            result: 'error',
            error: errorMessage,
            timingMs: tracker.total(),
          });
        }

        // Format error
        const formatted = formatError(error, {
          jsonMode,
          timingMs: tracker.total(),
        });

        if (jsonMode) {
          ctx.output?.json(formatted.json);
        } else {
          ctx.output?.error(formatted.message);
        }

        return 1;
      }
    };

    // Run within analytics scope if available
    if (analyticsHelper) {
      return await analyticsHelper.scope(async () => {
        return await runCommand();
      });
    } else {
      return await runCommand();
    }
  };
}

