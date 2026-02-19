import { platform } from "@kb-labs/core-runtime";
import type { ILogger } from "@kb-labs/core-platform";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "silent";
export type LogContext = Record<string, unknown>;

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown> | Error): void;
  child(bindings: { category?: string; meta?: Record<string, unknown> }): Logger;
}

function toLogger(base: ILogger): Logger {
  return {
    debug: (msg, meta) => base.debug(msg, meta),
    info: (msg, meta) => base.info(msg, meta),
    warn: (msg, meta) => base.warn(msg, meta),
    error: (msg, metaOrError) => {
      if (metaOrError instanceof Error) {
        base.error(msg, metaOrError);
        return;
      }
      base.error(msg, undefined, metaOrError);
    },
    child: (bindings) => {
      const merged: Record<string, unknown> = {};
      if (bindings.category) {
        merged.category = bindings.category;
      }
      if (bindings.meta) {
        Object.assign(merged, bindings.meta);
      }
      return toLogger(base.child(merged));
    },
  };
}

export function getLogger(category = "cli"): Logger {
  return toLogger(
    platform.logger.child({
      layer: "cli",
      category,
    })
  );
}

export function createNoOpLogger(): Logger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    child: () => createNoOpLogger(),
  };
}

export function getLogLevel(): LogLevel {
  const raw = (process.env.KB_LOG_LEVEL ?? process.env.LOG_LEVEL ?? "info").toLowerCase();
  switch (raw) {
    case "trace":
    case "debug":
    case "info":
    case "warn":
    case "error":
    case "silent":
      return raw;
    default:
      return "info";
  }
}
