/**
 * Platform initialization for KB Labs CLI.
 * Loads adapters from kb.config.json and initializes the platform singleton.
 */

import {
  initPlatform,
  platform,
  type PlatformConfig,
  type PlatformContainer,
  type PlatformLifecycleContext,
  type PlatformLifecycleHooks,
  type PlatformLifecyclePhase,
} from '@kb-labs/core-runtime';
import { findNearestConfig, readJsonWithDiagnostics } from '@kb-labs/core-config';
import path from 'node:path';
import { noopUI } from '@kb-labs/plugin-contracts';
import type { UIFacade } from '@kb-labs/plugin-contracts';
import { createCLIUIFacade } from './ui-facade';

const CLI_LIFECYCLE_HOOK_ID = 'cli-runtime';
let lifecycleHooksRegistered = false;

function lifecycleLogger() {
  return platform.logger.child({
    layer: 'cli',
    service: 'platform-lifecycle',
  });
}

function ensureLifecycleHooksRegistered(): void {
  if (lifecycleHooksRegistered) {
    return;
  }

  const hooks: PlatformLifecycleHooks = {
    onStart: (ctx: PlatformLifecycleContext) => {
      lifecycleLogger().debug('Platform lifecycle: start', {
        app: 'cli',
        cwd: ctx.cwd,
        isChildProcess: ctx.isChildProcess,
      });
    },
    onReady: (ctx: PlatformLifecycleContext) => {
      lifecycleLogger().debug('Platform lifecycle: ready', {
        app: 'cli',
        durationMs: ctx.metadata?.durationMs,
      });
    },
    onShutdown: () => {
      lifecycleLogger().debug('Platform lifecycle: shutdown', { app: 'cli' });
    },
    onError: (error: unknown, phase: PlatformLifecyclePhase) => {
      lifecycleLogger().warn('Platform lifecycle hook error', {
        app: 'cli',
        phase,
        error: error instanceof Error ? error.message : String(error),
      });
    },
  };

  platform.registerLifecycleHooks(CLI_LIFECYCLE_HOOK_ID, hooks);
  lifecycleHooksRegistered = true;
}

/**
 * Create CLI-specific UI provider.
 * Returns rich UI for CLI host, noopUI for other hosts (REST, workflow, etc.)
 */
function createCLIUIProvider(): (hostType: string) => UIFacade {
  return (hostType: string): UIFacade => {
    if (hostType !== 'cli') {
      return noopUI;
    }
    return createCLIUIFacade();
  };
}

export interface PlatformInitResult {
  platform: PlatformContainer; // The initialized platform instance
  platformConfig: PlatformConfig;
  rawConfig?: any; // Full kb.config.json for ctx.config extraction
}

function resolvePlatformRootFromConfigPath(configPath: string): string {
  const configDir = path.dirname(configPath);
  if (path.basename(configDir) === '.kb') {
    return path.dirname(configDir);
  }
  return configDir;
}

/**
 * Initialize platform adapters from kb.config.json.
 * Falls back to NoOp adapters if config not found.
 * @returns The platform config and raw config that was loaded
 */
export async function initializePlatform(cwd: string): Promise<PlatformInitResult> {
  ensureLifecycleHooksRegistered();

  // Create CLI-specific UI provider
  const uiProvider = createCLIUIProvider();

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
      // Initialize with empty config (all NoOp adapters)
      const fallbackConfig = { adapters: {} };
      const platform = await initPlatform(fallbackConfig, cwd, uiProvider);
      platform.logger.debug('No kb.config.json found, using NoOp adapters', {
        layer: 'cli',
        service: 'platform-init',
      });
      return { platform, platformConfig: fallbackConfig };
    }

    // Read config
    const result = await readJsonWithDiagnostics<{ platform?: PlatformConfig }>(configPath);
    const platformRoot = resolvePlatformRootFromConfigPath(configPath);
    if (!result.ok) {
      const fallbackConfig = { adapters: {} };
      const platform = await initPlatform(fallbackConfig, cwd, uiProvider);
      platform.logger.warn('Failed to read kb.config.json, using NoOp adapters', {
        layer: 'cli',
        service: 'platform-init',
        errors: result.diagnostics.map(d => d.message),
      });
      return { platform, platformConfig: fallbackConfig };
    }

    // Extract platform config
    const platformConfig = result.data.platform;
    if (!platformConfig) {
      const fallbackConfig = { adapters: {} };
      const platform = await initPlatform(fallbackConfig, cwd, uiProvider);
      platform.logger.debug('No platform config in kb.config.json, using NoOp adapters', {
        layer: 'cli',
        service: 'platform-init',
      });
      return { platform, platformConfig: fallbackConfig, rawConfig: result.data };
    }

    // Initialize platform with config rooted at config location.
    // This guarantees all relative adapter paths (like ".kb/database/kb.sqlite")
    // resolve to the same monorepo root even when CLI runs from subdirectories.
    const platform = await initPlatform(platformConfig, platformRoot, uiProvider);

    platform.logger.info('Platform adapters initialized', {
      layer: 'cli',
      service: 'platform-init',
      configPath,
      platformRoot,
      adapters: Object.keys(platformConfig.adapters ?? {}),
      hasAdapterOptions: !!platformConfig.adapterOptions,
    });
    return { platform, platformConfig, rawConfig: result.data };

  } catch (error) {
    // Fallback to NoOp adapters on error
    const fallbackConfig = { adapters: {} };
    const platform = await initPlatform(fallbackConfig, cwd, uiProvider);
    platform.logger.warn('Platform initialization failed, using NoOp adapters', {
      layer: 'cli',
      service: 'platform-init',
      error: error instanceof Error ? error.message : String(error),
    });
    return { platform, platformConfig: fallbackConfig };
  }
}
