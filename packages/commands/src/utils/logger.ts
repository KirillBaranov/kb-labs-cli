/**
 * @kb-labs/cli-commands/utils
 * Logging utility with KB_LOG_LEVEL support
 */

import { createCliLogger, initCliLogging } from '@kb-labs/plugin-adapter-cli';

const LOG_LEVELS = ['silent', 'error', 'warn', 'info', 'debug'] as const;
export type LogLevel = typeof LOG_LEVELS[number];

let cachedLogLevel: LogLevel | null = null;
let sharedLogger: ReturnType<typeof createCliLogger> | null = null;

const STATIC_TRACE_ID =
  process.env.KB_TRACE_ID ||
  `cli-shared-${process.pid}-${Math.random().toString(36).slice(2)}`;
const STATIC_REQ_ID = `cli-shared-${process.pid}`;

if (!process.env.KB_TRACE_ID) {
  process.env.KB_TRACE_ID = STATIC_TRACE_ID;
}

export function getLogLevel(): LogLevel {
  if (cachedLogLevel) {return cachedLogLevel;}
  
  const level = (process.env.KB_LOG_LEVEL || 'warn').toLowerCase();
  cachedLogLevel = LOG_LEVELS.includes(level as LogLevel) ? (level as LogLevel) : 'warn';
  return cachedLogLevel;
}

function getLogger(): ReturnType<typeof createCliLogger> {
  if (!sharedLogger) {
    initCliLogging(getLogLevel());
    sharedLogger = createCliLogger('commands', {
      traceId: STATIC_TRACE_ID,
      reqId: STATIC_REQ_ID,
    });
  }
  return sharedLogger;
}

export function log(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
  const currentLevel = getLogLevel();
  const currentIndex = LOG_LEVELS.indexOf(currentLevel);
  const messageIndex = LOG_LEVELS.indexOf(level);
  
  if (messageIndex > currentIndex || currentLevel === 'silent') {
    return;
  }

  const logger = getLogger();
  if (level === 'error') {
    logger.error(message, fields);
    return;
  }
  if (level === 'warn') {
    logger.warn(message, fields);
    return;
  }
  if (level === 'info') {
    logger.info(message, fields);
    return;
  }
  logger.debug(message, fields);
}

export function resetLogLevel(): void {
  cachedLogLevel = null;
  sharedLogger = null;
}