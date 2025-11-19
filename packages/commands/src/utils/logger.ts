/**
 * @kb-labs/cli-commands/utils
 * Logging utility - re-exports from unified logging system
 * 
 * @deprecated Use getLogger() from @kb-labs/core-sys/logging directly
 * This file is kept for backward compatibility
 */

import { getLogger as getCoreLogger, getLogLevel as getCoreLogLevel, type LogLevel as CoreLogLevel } from '@kb-labs/core-sys/logging';

// Re-export for backward compatibility
export { getLogger, getLogLevel } from '@kb-labs/core-sys/logging';
export type { LogLevel } from '@kb-labs/core-sys/logging';

// Map old LogLevel type to new one (for compatibility)
const LOG_LEVELS = ['silent', 'error', 'warn', 'info', 'debug'] as const;
type OldLogLevel = (typeof LOG_LEVELS)[number];

const LEVEL_MAP: Record<OldLogLevel, CoreLogLevel> = {
  silent: 'error', // silent = only error
  error: 'error',
  warn: 'warn',
  info: 'info',
  debug: 'debug',
};

/**
 * @deprecated Use getLogger() from @kb-labs/core-sys/logging directly
 */
export function log(level: OldLogLevel, message: string, fields?: Record<string, unknown>): void {
  const currentLevel = getCoreLogLevel();
  const currentIndex = LOG_LEVELS.indexOf(level);
  const coreLevel = LEVEL_MAP[level];
  
  // Map current level to old levels for comparison
  const currentCoreIndex = LOG_LEVELS.indexOf(
    currentLevel === 'debug' || currentLevel === 'trace' ? 'debug' :
    currentLevel === 'info' ? 'info' :
    currentLevel === 'warn' ? 'warn' :
    'error'
  );
  
  // Skip if level is too low or silent
  if (currentIndex > currentCoreIndex || level === 'silent') {
    return;
  }

  const logger = getCoreLogger('commands');
  
  if (coreLevel === 'error') {
    logger.error(message, fields);
  } else if (coreLevel === 'warn') {
    logger.warn(message, fields);
  } else if (coreLevel === 'info') {
    logger.info(message, fields);
  } else {
    logger.debug(message, fields);
  }
}

/**
 * @deprecated No longer needed - logging is initialized globally
 */
export function initCliLogging(_level: OldLogLevel = 'info'): void {
  // No-op - logging is initialized globally via initLogging()
}

/**
 * @deprecated Use getLogger() from @kb-labs/core-sys/logging directly
 */
export function createCliLogger(scope: string, context: Record<string, unknown>): ReturnType<typeof getCoreLogger> {
  return getCoreLogger(`cli:${scope}`).child({
    meta: {
      layer: 'cli',
      ...context,
    },
  });
}

/**
 * @deprecated No longer needed
 */
export function resetLogLevel(): void {
  // No-op - use setLogLevel() from @kb-labs/core-sys/logging if needed
}
