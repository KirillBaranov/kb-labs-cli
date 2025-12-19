/**
 * V3 Plugin System Adapter
 *
 * Default execution path for V3 plugins with safe fallback to V2.
 */

import type { SystemContext } from '@kb-labs/cli-core';
import { executeCommandV3 } from '@kb-labs/cli-core/v3';
import type { UIFacade, PlatformServices, MessageOptions, Spinner } from '@kb-labs/plugin-contracts';
import { platform } from '@kb-labs/core-runtime';
import { sideBorderBox, safeColors } from '@kb-labs/shared-cli-ui';
import path from 'node:path';
import type { RegisteredCommand } from '@kb-labs/cli-commands/registry';

interface V3ExecutionOptions {
  context: SystemContext;
  commandId: string;
  argv: string[];
  flags: Record<string, unknown>;
  manifestCmd?: RegisteredCommand;
}

/**
 * Try to execute command via V3
 *
 * Returns exitCode if successful, undefined if V3 not available
 */
export async function tryExecuteV3(
  options: V3ExecutionOptions
): Promise<number | undefined> {
  const { context, commandId, argv, flags, manifestCmd } = options;

  // No manifest command info - can't use V3
  if (!manifestCmd) {
    return undefined;
  }

  // Find the CLI command in manifest to get handlerPath
  const manifest = manifestCmd.manifest.manifestV2;
  const cliCommand = manifest?.cli?.commands?.find((c: any) => c.id === commandId);

  // Resolve handler path - V3 commands use handlerPath
  const handlerRelativePath = (cliCommand as any)?.handlerPath;
  if (!handlerRelativePath) {
    return undefined;
  }

  // Use pkgRoot instead of plugin.rootDir
  const pluginRoot = manifestCmd.pkgRoot;
  if (!pluginRoot) {
    return undefined;
  }

  // Handler path should point to dist/ (compiled output)
  const handlerPath = path.resolve(pluginRoot, 'dist', handlerRelativePath);

  try {
    const pluginId = manifest?.id || manifestCmd.manifest.id;
    const pluginVersion = manifest?.version || '0.0.0';

    // Create V3 UI facade from CLI context
    const ui = createUIFacade(context);

    // Create V3 platform services from CLI context
    const platformServices = createPlatformServices(context);

    // Get socket path from platform singleton for IPC
    const socketPath = platform.getSocketPath();

    // Extract quotas from manifest permissions
    const quotas = manifest?.permissions?.quotas;

    // Execute via V3
    const exitCode = await executeCommandV3({
      pluginId,
      pluginVersion,
      handlerPath,
      argv,
      flags,
      ui,
      platform: platformServices,
      socketPath,
      cwd: context.cwd || process.cwd(),
      devMode: process.env.NODE_ENV === 'development', // Use subprocess in production
      quotas, // Pass all quotas from manifest
    });

    return exitCode;

  } catch (error) {
    // Log error but don't fail - let V2 try
    context.logger?.error('[v3-adapter] V3 execution failed, falling back to V2', {
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

/**
 * Create UIFacade from SystemContext
 */
function createUIFacade(context: SystemContext): UIFacade {
  const presenter = (context as any).presenter;

  return {
    // Colors API from shared-cli-ui
    colors: safeColors,

    // Write raw text
    write: (text: string) => {
      process.stdout.write(text);
    },

    info: (msg: string, options?: MessageOptions) => {
      if (options?.sections && options.sections.length > 0) {
        const boxOutput = sideBorderBox({
          title: options.title || 'Info',
          sections: options.sections,
          status: 'info',
          timing: options.timing,
        });
        console.log(boxOutput);
      } else {
        presenter?.info?.(msg) || console.log(msg);
      }
    },
    success: (msg: string, options?: MessageOptions) => {
      if (options?.sections && options.sections.length > 0) {
        const boxOutput = sideBorderBox({
          title: options.title || 'Success',
          sections: options.sections,
          status: 'success',
          timing: options.timing,
        });
        console.log(boxOutput);
      } else {
        presenter?.success?.(msg) || console.log(`✓ ${msg}`);
      }
    },
    warn: (msg: string, options?: MessageOptions) => {
      if (options?.sections && options.sections.length > 0) {
        const boxOutput = sideBorderBox({
          title: options.title || 'Warning',
          sections: options.sections,
          status: 'warning',
          timing: options.timing,
        });
        console.log(boxOutput);
      } else {
        presenter?.warn?.(msg) || console.warn(`⚠ ${msg}`);
      }
    },
    error: (err: Error | string, options?: MessageOptions) => {
      const message = err instanceof Error ? err.message : err;
      if (options?.sections && options.sections.length > 0) {
        const boxOutput = sideBorderBox({
          title: options.title || 'Error',
          sections: options.sections,
          status: 'error',
          timing: options.timing,
        });
        console.error(boxOutput);
      } else {
        presenter?.error?.(message) || console.error(message);
      }
    },
    debug: (msg: string) => {
      presenter?.debug?.(msg) || console.debug(msg);
    },
    spinner: (text: string): Spinner => {
      const spinner = presenter?.spinner?.(text);
      return {
        update: (message: string) => spinner?.update?.(message),
        succeed: (message?: string) => spinner?.succeed?.(message),
        fail: (message?: string) => spinner?.fail?.(message),
        stop: () => spinner?.stop?.(),
      };
    },
    table: (data: Record<string, unknown>[], columns?) => {
      presenter?.table?.(data) || console.table(data);
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
      // For now, return true (non-interactive)
      // TODO: Implement proper confirm via presenter
      return true;
    },
    prompt: async (message: string, options?) => {
      // For now, return empty string (non-interactive)
      // TODO: Implement proper prompt via presenter
      return '';
    },
  };
}

/**
 * Create PlatformServices from platform singleton
 *
 * Platform owns all services, we just pass them through.
 * No wrappers, no adapters - direct passthrough.
 */
function createPlatformServices(_context: SystemContext): PlatformServices {
  return {
    logger: platform.logger,
    llm: platform.llm,
    embeddings: platform.embeddings,
    vectorStore: platform.vectorStore,
    cache: platform.cache,
    storage: platform.storage,
    analytics: platform.analytics,
  };
}
