/**
 * Log level resolution helpers
 */

import type { LogLevel } from '@kb-labs/core-sys';

/**
 * Resolve log level from string input
 * Returns 'silent' for invalid or missing values
 */
export function resolveLogLevel(level: unknown): LogLevel {
  if (!level) {
    return 'silent'; // Default: completely silent
  }
  const normalized = String(level).toLowerCase();
  if (
    normalized === 'trace' ||
    normalized === 'debug' ||
    normalized === 'info' ||
    normalized === 'warn' ||
    normalized === 'error' ||
    normalized === 'silent'
  ) {
    return normalized as LogLevel;
  }
  return 'silent'; // Default for invalid values
}
