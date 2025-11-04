/**
 * @module @kb-labs/cli-core/context/base-context
 * Base context creation with DI
 */

import type { CliContext, ContextOptions } from '../types/index.js';
import { FileLogger, ConsoleLogger } from './services/logger.js';
import { JsonConfigService } from './services/config.js';
import { NoOpTelemetry } from './services/telemetry.js';
import { FileKeyValueStore } from './services/storage.js';
import { ResourceTrackerImpl } from '../lifecycle/resource-tracker.js';

/**
 * Create base CLI context with default implementations
 * @param opts - Context options
 * @returns CLI context
 */
export function createBaseContext(opts?: ContextOptions): CliContext {
  // Use console logger in dev mode, file logger otherwise
  const defaultLogger = process.env.NODE_ENV === 'development'
    ? new ConsoleLogger()
    : new FileLogger();

  const logger = opts?.logger
    ? { ...defaultLogger, ...opts.logger }
    : defaultLogger;

  const config = opts?.config
    ? { ...new JsonConfigService(), ...opts.config }
    : new JsonConfigService();

  const telemetry = opts?.telemetry
    ? { ...new NoOpTelemetry(), ...opts.telemetry }
    : new NoOpTelemetry();

  const storage = opts?.storage
    ? { ...new FileKeyValueStore(), ...opts.storage }
    : new FileKeyValueStore();

  const resources = new ResourceTrackerImpl();

  return {
    logger,
    config,
    telemetry,
    storage,
    resources,
  };
}

