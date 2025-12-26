/**
 * Platform initialization for KB Labs CLI.
 * Loads adapters from kb.config.json and initializes the platform singleton.
 */

import { initPlatform, type PlatformConfig, type PlatformContainer } from '@kb-labs/core-runtime';
import { findNearestConfig, readJsonWithDiagnostics } from '@kb-labs/core-config';
import { getLogger } from '@kb-labs/core-sys/logging';
import { sideBorderBox, safeColors } from '@kb-labs/shared-cli-ui';
import type { UIFacade, HostType, MessageOptions, Spinner } from '@kb-labs/plugin-contracts';
import { noopUI } from '@kb-labs/plugin-contracts';

const logger = getLogger('platform');

/**
 * Create CLI-specific UI provider.
 * Returns beautiful UI for CLI host, noopUI for other hosts (REST, workflow, etc.)
 */
function createCLIUIProvider(): (hostType: HostType) => UIFacade {
  return (hostType: HostType): UIFacade => {
    // Only provide rich UI for CLI host
    if (hostType !== 'cli') {
      return noopUI;
    }

    // Create rich CLI UI with sideBorderBox
    return {
      colors: safeColors,
      write: (text: string) => {
        process.stdout.write(text);
      },
      info: (msg: string, options?: MessageOptions) => {
        const boxOutput = sideBorderBox({
          title: options?.title || 'Info',
          sections: options?.sections || [{ items: [msg] }],
          status: 'info',
          timing: options?.timing,
        });
        console.log(boxOutput);
      },
      success: (msg: string, options?: MessageOptions) => {
        const boxOutput = sideBorderBox({
          title: options?.title || 'Success',
          sections: options?.sections || [{ items: [msg] }],
          status: 'success',
          timing: options?.timing,
        });
        console.log(boxOutput);
      },
      warn: (msg: string, options?: MessageOptions) => {
        const boxOutput = sideBorderBox({
          title: options?.title || 'Warning',
          sections: options?.sections || [{ items: [msg] }],
          status: 'warning',
          timing: options?.timing,
        });
        console.log(boxOutput);
      },
      error: (err: Error | string, options?: MessageOptions) => {
        const message = err instanceof Error ? err.message : err;
        const boxOutput = sideBorderBox({
          title: options?.title || 'Error',
          sections: options?.sections || [{ items: [message] }],
          status: 'error',
          timing: options?.timing,
        });
        console.error(boxOutput);
      },
      debug: (msg: string) => {
        console.debug(msg);
      },
      spinner: (text: string): Spinner => {
        // No spinner for now, return no-op
        return {
          update: () => {},
          succeed: () => {},
          fail: () => {},
          stop: () => {},
        };
      },
      table: (data: Record<string, unknown>[], columns?) => {
        console.table(data);
      },
      json: (data: unknown) => {
        console.log(JSON.stringify(data, null, 2));
      },
      newline: () => {
        console.log();
      },
      divider: () => {
        console.log('─'.repeat(process.stdout.columns || 80));
      },
      box: (content: string, title?: string) => {
        const boxOutput = sideBorderBox({
          title: title || '',
          sections: [{ items: content.split('\n') }],
          status: 'info',
        });
        console.log(boxOutput);
      },
      sideBox: (options) => {
        const boxOutput = sideBorderBox(options);
        console.log(boxOutput);
      },
      confirm: async (message: string) => {
        return true;
      },
      prompt: async (message: string, options?) => {
        return '';
      },
    };
  };
}

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
      logger.debug('No kb.config.json found, using NoOp adapters');
      // Initialize with empty config (all NoOp adapters)
      const fallbackConfig = { adapters: {} };
      const platform = await initPlatform(fallbackConfig, cwd, uiProvider);
      return { platform, platformConfig: fallbackConfig };
    }

    // Read config
    const result = await readJsonWithDiagnostics<{ platform?: PlatformConfig }>(configPath);
    if (!result.ok) {
      logger.warn('Failed to read kb.config.json, using NoOp adapters', {
        errors: result.diagnostics.map(d => d.message),
      });
      const fallbackConfig = { adapters: {} };
      const platform = await initPlatform(fallbackConfig, cwd, uiProvider);
      return { platform, platformConfig: fallbackConfig };
    }

    // Extract platform config
    const platformConfig = result.data.platform;
    if (!platformConfig) {
      logger.debug('No platform config in kb.config.json, using NoOp adapters');
      const fallbackConfig = { adapters: {} };
      const platform = await initPlatform(fallbackConfig, cwd, uiProvider);
      return { platform, platformConfig: fallbackConfig, rawConfig: result.data };
    }

    // Initialize platform with config
    logger.info('Initializing platform adapters', {
      configPath,
      adapters: Object.keys(platformConfig.adapters ?? {}),
      hasAdapterOptions: !!platformConfig.adapterOptions,
    });

    const platform = await initPlatform(platformConfig, cwd, uiProvider);

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
    const platform = await initPlatform(fallbackConfig, cwd, uiProvider);
    return { platform, platformConfig: fallbackConfig };
  }
}
