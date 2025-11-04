/**
 * @module @kb-labs/cli-core/context/services/logger
 * Logging service with structured logging support
 */

/**
 * Log level type
 */
export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

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
 * Console logger with structured logging support
 */
export class ConsoleLogger implements Logger {
  private readonly levelPriority: Record<LogLevel, number> = {
    silent: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4,
  };

  constructor(private level: LogLevel = 'info') {}

  private shouldLog(level: LogLevel): boolean {
    return this.levelPriority[level] <= this.levelPriority[this.level];
  }

  private formatMeta(meta?: Record<string, unknown>): string {
    if (!meta || Object.keys(meta).length === 0) {
      return '';
    }
    return ' ' + JSON.stringify(meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('info')) {
      console.log(`[INFO] ${message}${this.formatMeta(meta)}`);
    }
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('warn')) {
      console.warn(`[WARN] ${message}${this.formatMeta(meta)}`);
    }
  }

  error(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('error')) {
      console.error(`[ERROR] ${message}${this.formatMeta(meta)}`);
    }
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('debug')) {
      console.debug(`[DEBUG] ${message}${this.formatMeta(meta)}`);
    }
  }

  metric(name: string, value: number, tags?: Record<string, string>): void {
    if (this.shouldLog('debug')) {
      const tagsStr = tags ? ` tags=${JSON.stringify(tags)}` : '';
      console.debug(`[METRIC] ${name}=${value}${tagsStr}`);
    }
  }

  async span<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      this.metric(`${name}.duration`, duration, { status: 'success' });
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.metric(`${name}.duration`, duration, { status: 'error' });
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
export function createLogger(level: LogLevel = 'info'): Logger {
  if (level === 'silent') {
    return new SilentLogger();
  }
  return new ConsoleLogger(level);
}

