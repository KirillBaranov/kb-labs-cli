/**
 * @module @kb-labs/cli-core/context/services/logger
 * Logging service with structured logging support
 *
 * Wrapper around platform logger for CLI context
 */

import {
  getLogger,
  type Logger as CoreLogger,
} from "../../platform-logger.js";

/**
 * Log level type (backward compatible)
 */
export type LogLevel = "silent" | "error" | "warn" | "info" | "debug";

/**
 * Logger interface for CLI operations with structured logging support
 */
export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;

  // Structured logs for observability
  metric(name: string, value: number, tags?: Record<string, string>): void;
  span<T>(name: string, fn: () => Promise<T>): Promise<T>;
}

/**
 * Adapter wrapper around core logger
 */
class CoreLoggerAdapter implements Logger {
  private coreLogger: CoreLogger;

  constructor(category: string = "cli", level: LogLevel = "info") {
    this.coreLogger = getLogger(`cli:${category}`);

    // Map silent to error level (only errors)
    if (level === "silent") {
      // Silent logger will be handled separately
    }
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.coreLogger.info(message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.coreLogger.warn(message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.coreLogger.error(message, meta);
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.coreLogger.debug(message, meta);
  }

  metric(name: string, value: number, tags?: Record<string, string>): void {
    this.coreLogger.debug(`[METRIC] ${name}=${value}`, { tags });
  }

  async span<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      this.metric(`${name}.duration`, duration, { status: "success" });
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.metric(`${name}.duration`, duration, { status: "error" });
      throw error;
    }
  }
}

/**
 * Silent logger (no output)
 */
export class SilentLogger implements Logger {
  info(): void {}
  warn(): void {}
  error(): void {}
  debug(): void {}
  metric(): void {}
  async span<T>(_name: string, fn: () => Promise<T>): Promise<T> {
    return fn();
  }
}

/**
 * Create logger based on level
 * @param level - Log level
 * @returns Logger instance
 */
export function createLogger(
  level: LogLevel = "info",
  category?: string,
): Logger {
  if (level === "silent") {
    return new SilentLogger();
  }
  return new CoreLoggerAdapter(category, level);
}
