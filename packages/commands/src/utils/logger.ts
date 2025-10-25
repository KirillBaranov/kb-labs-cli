/**
 * @kb-labs/cli-commands/utils
 * Logging utility with KB_LOG_LEVEL support
 */

const LOG_LEVELS = ['silent', 'error', 'warn', 'info', 'debug'] as const;
export type LogLevel = typeof LOG_LEVELS[number];

let cachedLogLevel: LogLevel | null = null;

export function getLogLevel(): LogLevel {
  if (cachedLogLevel) return cachedLogLevel;
  
  const level = (process.env.KB_LOG_LEVEL || 'warn').toLowerCase();
  cachedLogLevel = LOG_LEVELS.includes(level as LogLevel) ? (level as LogLevel) : 'warn';
  return cachedLogLevel;
}

export function log(level: LogLevel, message: string): void {
  const currentLevel = getLogLevel();
  const currentIndex = LOG_LEVELS.indexOf(currentLevel);
  const messageIndex = LOG_LEVELS.indexOf(level);
  
  if (messageIndex <= currentIndex && currentLevel !== 'silent') {
    // All diagnostic output goes to stderr
    process.stderr.write(`[${level.toUpperCase()}] ${message}\n`);
  }
}

export function resetLogLevel(): void {
  cachedLogLevel = null;
}

