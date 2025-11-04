/**
 * @module @kb-labs/cli-core/context/services/logger
 * Logger service implementation
 */

import type { Logger } from '../../types/index.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * File logger implementation
 */
export class FileLogger implements Logger {
  private logPath: string;

  constructor(logPath?: string) {
    this.logPath = logPath || path.join(process.cwd(), '.kb/logs/cli.log');
    
    // Ensure log directory exists
    const logDir = path.dirname(this.logPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  private log(level: string, msg: string, meta?: object): void {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    const logLine = `[${timestamp}] [${level.toUpperCase()}] ${msg}${metaStr}\n`;
    
    try {
      fs.appendFileSync(this.logPath, logLine, 'utf8');
    } catch (error) {
      // Fallback to console if file write fails
      console.error(`Failed to write log: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Also log to console in debug mode
    if (process.env.DEBUG) {
      console.log(logLine.trim());
    }
  }

  debug(msg: string, meta?: object): void {
    this.log('debug', msg, meta);
  }

  info(msg: string, meta?: object): void {
    this.log('info', msg, meta);
  }

  warn(msg: string, meta?: object): void {
    this.log('warn', msg, meta);
  }

  error(msg: string, meta?: object): void {
    this.log('error', msg, meta);
  }
}

/**
 * Console logger implementation (for development)
 */
export class ConsoleLogger implements Logger {
  debug(msg: string, meta?: object): void {
    console.debug(`[DEBUG] ${msg}`, meta || '');
  }

  info(msg: string, meta?: object): void {
    console.info(`[INFO] ${msg}`, meta || '');
  }

  warn(msg: string, meta?: object): void {
    console.warn(`[WARN] ${msg}`, meta || '');
  }

  error(msg: string, meta?: object): void {
    console.error(`[ERROR] ${msg}`, meta || '');
  }
}

