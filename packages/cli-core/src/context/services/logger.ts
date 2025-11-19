/**
 * @module @kb-labs/cli-core/context/services/logger
 * Logger service implementation
 * 
 * Wrapper around @kb-labs/core-sys/logging for CLI context
 */

import type { Logger } from '../../types/index.js';
import { getLogger, createFileSink, configureLogger, addSink } from '@kb-labs/core-sys/logging';
import * as path from 'node:path';

let fileSinkAdded = false;
const logger = getLogger('cli:logger-service');

/**
 * File logger implementation using new logging system
 */
export class FileLogger implements Logger {
  private coreLogger: ReturnType<typeof getLogger>;

  constructor(logPath?: string) {
    const defaultPath = logPath || path.join(process.cwd(), '.kb/logs/cli.jsonl');
    
    // Add file sink if not already added
    if (!fileSinkAdded) {
      try {
        const fileSink = createFileSink({
          path: defaultPath,
          maxSize: '100MB',
          maxAge: '7d',
        });
        addSink(fileSink);
        fileSinkAdded = true;
      } catch (error) {
        logger.error('Failed to create file sink', {
          error: error instanceof Error ? error.message : String(error),
          path: defaultPath,
        });
      }
    }
    
    this.coreLogger = getLogger('cli:file');
  }

  debug(msg: string, meta?: object): void {
    this.coreLogger.debug(msg, meta as Record<string, unknown> | undefined);
  }

  info(msg: string, meta?: object): void {
    this.coreLogger.info(msg, meta as Record<string, unknown> | undefined);
  }

  warn(msg: string, meta?: object): void {
    this.coreLogger.warn(msg, meta as Record<string, unknown> | undefined);
  }

  error(msg: string, meta?: object): void {
    this.coreLogger.error(msg, meta as Record<string, unknown> | undefined);
  }
}

/**
 * Console logger implementation (for development)
 * Uses new logging system
 */
export class ConsoleLogger implements Logger {
  private coreLogger: ReturnType<typeof getLogger>;

  constructor() {
    this.coreLogger = getLogger('cli:console');
  }

  debug(msg: string, meta?: object): void {
    this.coreLogger.debug(msg, meta as Record<string, unknown> | undefined);
  }

  info(msg: string, meta?: object): void {
    this.coreLogger.info(msg, meta as Record<string, unknown> | undefined);
  }

  warn(msg: string, meta?: object): void {
    this.coreLogger.warn(msg, meta as Record<string, unknown> | undefined);
  }

  error(msg: string, meta?: object): void {
    this.coreLogger.error(msg, meta as Record<string, unknown> | undefined);
  }
}

