/**
 * @module @kb-labs/cli-api/modules/logger
 * Logger abstraction that can use platform.logger or standalone.
 */

import type { ILogger } from '@kb-labs/core-platform/adapters';

/**
 * CLI API Logger interface - subset of ILogger for internal use.
 */
export interface CliApiLogger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

/**
 * Create a CLI API logger from platform logger.
 * This is the preferred way - uses centralized platform logging.
 */
export function createPlatformLogger(
  platformLogger: ILogger,
  context: Record<string, unknown>
): CliApiLogger {
  const baseContext = { ...context };

  return {
    debug(message, fields) {
      platformLogger.debug(message, { ...baseContext, ...fields });
    },
    info(message, fields) {
      platformLogger.info(message, { ...baseContext, ...fields });
    },
    warn(message, fields) {
      platformLogger.warn(message, { ...baseContext, ...fields });
    },
    error(message, fields) {
      // ILogger.error signature is (message, error?, meta?)
      // We pass undefined for error and merge context with fields
      platformLogger.error(message, undefined, { ...baseContext, ...fields });
    },
  };
}

/**
 * Create a standalone CLI API logger (for backward compatibility).
 * Uses console with JSON output - can be used when platform is not available.
 */
export function createCliApiLogger(
  level: LogLevel,
  context: Record<string, unknown>
): CliApiLogger {
  const priority: Record<LogLevel, number> = {
    silent: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4,
  };

  const baseContext = { ...context };
  const shouldLog = (target: LogLevel): boolean => priority[target] <= priority[level];

  const emit = (
    target: LogLevel,
    consoleMethod: 'error' | 'warn' | 'info' | 'debug',
    message: string,
    fields?: Record<string, unknown>
  ) => {
    if (!shouldLog(target)) {
      return;
    }
    const payload = {
      level: target,
      message,
      ts: new Date().toISOString(),
      ...baseContext,
      ...(fields ?? {}),
    };
    const line = JSON.stringify(payload);
    if (consoleMethod === 'error') {
      console.error(line);
    } else if (consoleMethod === 'warn') {
      console.warn(line);
    } else if (consoleMethod === 'info') {
      console.info(line);
    } else {
      console.debug(line);
    }
  };

  return {
    debug(message, fields) {
      emit('debug', 'debug', message, fields);
    },
    info(message, fields) {
      emit('info', 'info', message, fields);
    },
    warn(message, fields) {
      emit('warn', 'warn', message, fields);
    },
    error(message, fields) {
      emit('error', 'error', message, fields);
    },
  };
}
