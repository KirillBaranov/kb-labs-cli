/**
 * Platform initialization for KB Labs CLI.
 * Loads adapters from kb.config.json and initializes the platform singleton.
 */

import { initPlatform, type PlatformConfig, type PlatformContainer } from '@kb-labs/core-runtime';
import { findNearestConfig, readJsonWithDiagnostics } from '@kb-labs/core-config';
import { getLogger } from '@kb-labs/core-sys/logging';

const logger = getLogger('platform');

export interface PlatformInitResult {
  platform: PlatformContainer; // The initialized platform instance
  platformConfig: PlatformConfig;
  rawConfig?: any; // Full kb.config.json for ctx.config extraction
}

/**
 * Initialize platform adapters from kb.config.json.
 * Falls back to NoOp adapters if config not found.
 * @returns The platform config and raw config that was loaded
 */
export async function initializePlatform(cwd: string): Promise<PlatformInitResult> {
  try {
    // Try to find kb.config.json
    const { path: configPath } = await findNearestConfig({
      startDir: cwd,
      filenames: [
        '.kb/kb.config.json',
        'kb.config.json',
      ],
    });

    if (!configPath) {
      logger.debug('No kb.config.json found, using NoOp adapters');
      // Initialize with empty config (all NoOp adapters)
      const fallbackConfig = { adapters: {} };
      const platform = await initPlatform(fallbackConfig);
      return { platform, platformConfig: fallbackConfig };
    }

    // Read config
    const result = await readJsonWithDiagnostics<{ platform?: PlatformConfig }>(configPath);
    if (!result.ok) {
      logger.warn('Failed to read kb.config.json, using NoOp adapters', {
        errors: result.diagnostics.map(d => d.message),
      });
      const fallbackConfig = { adapters: {} };
      const platform = await initPlatform(fallbackConfig);
      return { platform, platformConfig: fallbackConfig };
    }

    // Extract platform config
    const platformConfig = result.data.platform;
    if (!platformConfig) {
      logger.debug('No platform config in kb.config.json, using NoOp adapters');
      const fallbackConfig = { adapters: {} };
      const platform = await initPlatform(fallbackConfig);
      return { platform, platformConfig: fallbackConfig, rawConfig: result.data };
    }

    // Initialize platform with config
    logger.info('Initializing platform adapters', {
      configPath,
      adapters: Object.keys(platformConfig.adapters ?? {}),
      hasAdapterOptions: !!platformConfig.adapterOptions,
    });

    const platform = await initPlatform(platformConfig, cwd);

    logger.info('Platform adapters initialized', {
      configPath,
      adapters: Object.keys(platformConfig.adapters ?? {}),
    });
    return { platform, platformConfig, rawConfig: result.data };

  } catch (error) {
    logger.warn('Platform initialization failed, using NoOp adapters', {
      error: error instanceof Error ? error.message : String(error),
    });
    // Fallback to NoOp adapters on error
    const fallbackConfig = { adapters: {} };
    const platform = await initPlatform(fallbackConfig);
    return { platform, platformConfig: fallbackConfig };
  }
}
