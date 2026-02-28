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
import { sideBorderBox, safeColors, safeSymbols } from '@kb-labs/shared-cli-ui';
import type { UIFacade, MessageOptions, Spinner } from '@kb-labs/plugin-contracts';
import { noopUI } from '@kb-labs/plugin-contracts';

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
 * Returns beautiful UI for CLI host, noopUI for other hosts (REST, workflow, etc.)
 */
function createCLIUIProvider(): (hostType: string) => UIFacade {
  return (hostType: string): UIFacade => {
    // Only provide rich UI for CLI host
    if (hostType !== 'cli') {
      return noopUI;
    }

    // Create rich CLI UI with sideBorderBox
    return {
      colors: safeColors,
      symbols: safeSymbols,
      write: (text: string) => {
        // Add newline if text doesn't end with one
        const output = text.endsWith('\n') ? text : text + '\n';
        process.stdout.write(output);
      },
      info: (msg: string, options?: MessageOptions) => {
        // Convert OutputSection[] to SectionContent[] for sideBorderBox
        const sections = options?.sections?.map(s => ({
          header: s.header,
          items: s.items
        })) || [{ items: [msg] }];

        const boxOutput = sideBorderBox({
          title: options?.title || 'Info',
          sections,
          status: 'info',
          timing: options?.timing,
        });
        console.log(boxOutput);
      },
      success: (msg: string, options?: MessageOptions) => {
        // Convert OutputSection[] to SectionContent[] for sideBorderBox
        const sections = options?.sections?.map(s => ({
          header: s.header,
          items: s.items
        })) || [{ items: [msg] }];

        const boxOutput = sideBorderBox({
          title: options?.title || 'Success',
          sections,
          status: 'success',
          timing: options?.timing,
        });
        console.log(boxOutput);
      },
      warn: (msg: string, options?: MessageOptions) => {
        // Convert OutputSection[] to SectionContent[] for sideBorderBox
        const sections = options?.sections?.map(s => ({
          header: s.header,
          items: s.items
        })) || [{ items: [msg] }];

        const boxOutput = sideBorderBox({
          title: options?.title || 'Warning',
          sections,
          status: 'warning',
          timing: options?.timing,
        });
        console.log(boxOutput);
      },
      error: (err: Error | string, options?: MessageOptions) => {
        const message = err instanceof Error ? err.message : err;

        // Convert OutputSection[] to SectionContent[] for sideBorderBox
        const sections = options?.sections?.map(s => ({
          header: s.header,
          items: s.items
        })) || [{ items: [message] }];

        const boxOutput = sideBorderBox({
          title: options?.title || 'Error',
          sections,
          status: 'error',
          timing: options?.timing,
        });
        console.error(boxOutput);
      },
      debug: (msg: string) => {
        console.debug(msg);
      },
      spinner: (_text: string): Spinner => {
        // No spinner for now, return no-op
        return {
          update: () => {},
          succeed: () => {},
          fail: () => {},
          stop: () => {},
        };
      },
      table: (data: Record<string, unknown>[], _columns?) => {
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
        const boxOutput = sideBorderBox({
          title: options.title,
          sections: options.sections ?? [],
          status: options.status,
          timing: options.timing,
        });
        console.log(boxOutput);
      },
      confirm: async (_message: string) => {
        return true;
      },
      prompt: async (_message: string, _options?) => {
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

    // Initialize platform with config
    const platform = await initPlatform(platformConfig, cwd, uiProvider);

    platform.logger.info('Platform adapters initialized', {
      layer: 'cli',
      service: 'platform-init',
      configPath,
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
