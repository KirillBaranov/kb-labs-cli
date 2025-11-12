/**
 * @kb-labs/cli-commands/utils
 * Logging utility with KB_LOG_LEVEL support
 */

const LOG_LEVELS = ['silent', 'error', 'warn', 'info', 'debug'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

type Fields = Record<string, unknown>;

type CliLogger = {
  debug(message: string, fields?: Fields): void;
  info(message: string, fields?: Fields): void;
  warn(message: string, fields?: Fields): void;
  error(message: string, fields?: Fields): void;
};

let cachedLogLevel: LogLevel | null = null;
let sharedLogger: CliLogger | null = null;

const STATIC_TRACE_ID =
  process.env.KB_TRACE_ID ||
  `cli-shared-${process.pid}-${Math.random().toString(36).slice(2)}`;
const STATIC_REQ_ID = `cli-shared-${process.pid}`;

if (!process.env.KB_TRACE_ID) {
  process.env.KB_TRACE_ID = STATIC_TRACE_ID;
}

export function initCliLogging(level: LogLevel = 'info'): void {
  cachedLogLevel = level;
}

export function createCliLogger(_scope: string, _context: Fields): CliLogger {
  const formatFields = (fields?: Fields): string => {
    if (!fields || Object.keys(fields).length === 0) {
      return '';
    }
    try {
      return ` ${JSON.stringify(fields)}`;
    } catch {
      return '';
    }
  };

  return {
    debug(message, fields) {
      console.debug(message + formatFields(fields));
    },
    info(message, fields) {
      console.log(message + formatFields(fields));
    },
    warn(message, fields) {
      console.warn(message + formatFields(fields));
    },
    error(message, fields) {
      console.error(message + formatFields(fields));
    },
  };
}

export function getLogLevel(): LogLevel {
  if (cachedLogLevel) {
    return cachedLogLevel;
  }
  const level = (process.env.KB_LOG_LEVEL || 'warn').toLowerCase();
  cachedLogLevel = LOG_LEVELS.includes(level as LogLevel) ? (level as LogLevel) : 'warn';
  return cachedLogLevel;
}

function getLogger(): CliLogger {
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
