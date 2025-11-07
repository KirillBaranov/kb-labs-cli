/**
 * @module @kb-labs/cli-core/context/base-context
 * Base context creation with DI
 */

import type { CliContext, ContextOptions, Logger, ConfigService, TelemetryService, KeyValueStore } from '../types/index.js';
import { FileLogger, ConsoleLogger } from './services/logger.js';
import { JsonConfigService } from './services/config.js';
import { NoOpTelemetry } from './services/telemetry.js';
import { FileKeyValueStore } from './services/storage.js';
import { ResourceTrackerImpl } from '../lifecycle/resource-tracker.js';

function mergeLogger(defaultLogger: Logger, overrides?: Partial<Logger>): Logger {
  return {
    debug: overrides?.debug ?? ((msg, meta) => defaultLogger.debug(msg, meta)),
    info: overrides?.info ?? ((msg, meta) => defaultLogger.info(msg, meta)),
    warn: overrides?.warn ?? ((msg, meta) => defaultLogger.warn(msg, meta)),
    error: overrides?.error ?? ((msg, meta) => defaultLogger.error(msg, meta)),
  };
}

function mergeConfig(defaultConfig: ConfigService, overrides?: Partial<ConfigService>): ConfigService {
  return {
    get: overrides?.get ?? ((key) => defaultConfig.get(key)),
    set: overrides?.set ?? ((key, value) => defaultConfig.set(key, value)),
    has: overrides?.has ?? ((key) => defaultConfig.has(key)),
  };
}

function mergeTelemetry(defaultTelemetry: TelemetryService, overrides?: Partial<TelemetryService>): TelemetryService {
  return {
    track: overrides?.track ?? ((event, props) => defaultTelemetry.track(event, props)),
    flush: overrides?.flush ?? (() => defaultTelemetry.flush()),
  };
}

function mergeStorage(defaultStorage: KeyValueStore, overrides?: Partial<KeyValueStore>): KeyValueStore {
  return {
    get: overrides?.get ?? ((key) => defaultStorage.get(key)),
    set: overrides?.set ?? ((key, value) => defaultStorage.set(key, value)),
    delete: overrides?.delete ?? ((key) => defaultStorage.delete(key)),
    list: overrides?.list ?? ((prefix) => defaultStorage.list(prefix)),
  };
}

/**
 * Create base CLI context with default implementations
 * @param opts - Context options
 * @returns CLI context
 */
export function createBaseContext(opts?: ContextOptions): CliContext {
  const defaultLogger = process.env.NODE_ENV === 'development'
    ? new ConsoleLogger()
    : new FileLogger();

  const defaultConfig = new JsonConfigService();
  const defaultTelemetry = new NoOpTelemetry();
  const defaultStorage = new FileKeyValueStore();

  const logger = mergeLogger(defaultLogger, opts?.logger);
  const config = mergeConfig(defaultConfig, opts?.config);
  const telemetry = mergeTelemetry(defaultTelemetry, opts?.telemetry);
  const storage = mergeStorage(defaultStorage, opts?.storage);
  const resources = new ResourceTrackerImpl();

  return {
    logger,
    config,
    telemetry,
    storage,
    resources,
  };
}

