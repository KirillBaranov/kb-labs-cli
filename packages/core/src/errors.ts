export const CLI_ERROR_CODES = {
    E_IO_READ: "E_IO_READ",
    E_IO_WRITE: "E_IO_WRITE",
    E_ENV_MISSING_VAR: "E_ENV_MISSING_VAR",
    E_DISCOVERY_CONFIG: "E_DISCOVERY_CONFIG",
    E_TELEMETRY_EMIT: "E_TELEMETRY_EMIT",
  } as const;
  
export type CliErrorCode = typeof CLI_ERROR_CODES[keyof typeof CLI_ERROR_CODES];

export const EXIT_CODES = {
  GENERIC: 1,      // generic runtime/software error
  IO: 74,          // EX_IOERR per sysexits.h
  SOFTWARE: 70,    // EX_SOFTWARE per sysexits.h
  CONFIG: 78,      // EX_CONFIG per sysexits.h
} as const;

const ERROR_CODE_SET: Set<CliErrorCode> = new Set(
  Object.values(CLI_ERROR_CODES) as CliErrorCode[]
);

export const mapCliErrorToExitCode = (code: CliErrorCode): number => {
  switch (code) {
    case CLI_ERROR_CODES.E_DISCOVERY_CONFIG:
    case CLI_ERROR_CODES.E_ENV_MISSING_VAR:
      return EXIT_CODES.CONFIG;

    case CLI_ERROR_CODES.E_IO_READ:
    case CLI_ERROR_CODES.E_IO_WRITE:
      return EXIT_CODES.IO;

    case CLI_ERROR_CODES.E_TELEMETRY_EMIT:
      // treat as software/runtime unless clearly an IO failure in a sink
      return EXIT_CODES.SOFTWARE;

    default:
      return EXIT_CODES.GENERIC;
  }
};

export class CliError extends Error {
    code: CliErrorCode;
    details?: unknown;
  
    constructor(code: CliErrorCode, message: string, details?: unknown) {
      super(message);
      this.name = "CliError";
      this.code = code;
      this.details = details;
  
      // сохраняем корректный stack при extends Error
      if (Error.captureStackTrace) {
        Error.captureStackTrace(this, CliError);
      }
    }
  }

export function isCliError(err: unknown): err is CliError {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: unknown };
  return typeof e.code === 'string' && ERROR_CODE_SET.has(e.code as CliErrorCode);
}

export function serializeCliError(
  err: unknown,
  opts: { includeStack?: boolean } = {}
): { name: string; message: string; code?: string; details?: unknown; stack?: string } {
  const includeStack = !!opts.includeStack;
  if (isCliError(err)) {
    return {
      name: 'CliError',
      message: err.message,
      code: err.code,
      details: (err as any).details,
      ...(includeStack && err.stack ? { stack: err.stack } : {}),
    } as any;
  }
  const e = err as Error | undefined;
  return {
    name: e?.name || 'Error',
    message: e?.message || String(err),
    ...(includeStack && e?.stack ? { stack: e.stack } : {}),
  } as any;
}