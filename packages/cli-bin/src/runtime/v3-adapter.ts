/**
 * V3 Plugin System Adapter
 *
 * Default execution path for V3 plugins with safe fallback to V2.
 */

import type { SystemContext } from '@kb-labs/cli-core';
import { executeCommandV3 } from '@kb-labs/cli-core/v3';
import type { UIFacade, PlatformServices, MessageOptions, Spinner } from '@kb-labs/plugin-contracts';
import { getHandlerPermissions } from '@kb-labs/plugin-contracts';
import type { PlatformContainer } from '@kb-labs/core-runtime';
import { sideBorderBox, safeColors } from '@kb-labs/shared-cli-ui';
import path from 'node:path';
import type { RegisteredCommand } from '@kb-labs/cli-commands/registry';

interface V3ExecutionOptions {
  context: SystemContext;
  commandId: string;
  argv: string[];
  flags: Record<string, unknown>;
  manifestCmd?: RegisteredCommand;
  platform: PlatformContainer; // Pass the correct platform instance
}

/**
 * Try to execute command via V3
 *
 * Returns exitCode if successful, undefined if V3 not available
 */
export async function tryExecuteV3(
  options: V3ExecutionOptions
): Promise<number | undefined> {
  const { context, commandId, argv, flags, manifestCmd, platform } = options;

  // No manifest command info - can't use V3
  if (!manifestCmd) {
    return undefined;
  }

  // Get V3 manifest from clean field (with fallback to legacy manifestV2)
  const v3Manifest = manifestCmd.v3Manifest ?? (manifestCmd.manifest as any).manifestV2;
  if (!v3Manifest) {
    return undefined; // Not a V3 plugin or system command without full manifest
  }

  // Find CLI command definition
  const cliCommand = v3Manifest.cli?.commands?.find((c: any) => c.id === commandId);

  // Resolve handler path - V3 commands use handlerPath
  const handlerRelativePath = cliCommand?.handlerPath;
  if (!handlerRelativePath) {
    return undefined;
  }

  // Use pkgRoot instead of plugin.rootDir
  const pluginRoot = manifestCmd.pkgRoot;
  if (!pluginRoot) {
    return undefined;
  }

  // Handler path should point to dist/ (compiled output)
  // If handlerRelativePath already includes 'dist/', don't add it again
  const handlerPath = handlerRelativePath.startsWith('dist/')
    ? path.resolve(pluginRoot, handlerRelativePath)
    : path.resolve(pluginRoot, 'dist', handlerRelativePath);

  try {
    const pluginId = v3Manifest.id || manifestCmd.manifest.id;
    const pluginVersion = v3Manifest.version || '0.0.0';

    // Create V3 UI facade from CLI context
    const ui = createUIFacade(context);

    // Create V3 platform services from platform container
    const platformServices = createPlatformServices(platform);

    // Get socket path from platform singleton for IPC
    const socketPath = platform.getSocketPath();

    // Get command-specific permissions merged with manifest permissions
    const permissions = getHandlerPermissions(v3Manifest, 'cli', commandId);
    const quotas = permissions?.quotas;

    // Execute via V3 (now uses platform.executionBackend)
    const exitCode = await executeCommandV3({
      pluginId,
      pluginVersion,
      handlerPath,
      argv,
      flags,
      ui,
      platform: platformServices,
      platformContainer: platform, // Pass the container for executionBackend access
      socketPath,
      cwd: context.cwd || process.cwd(),
      devMode: process.env.NODE_ENV === 'development', // Use subprocess in production
      permissions, // Pass all permissions from manifest
      quotas, // Pass all quotas from manifest
      configSection: v3Manifest.configSection, // Pass configSection for useConfig() auto-detection
    });

    // Optional: Log execution mode (useful for debugging)
    context.logger?.debug('[v3-adapter] Command executed via platform.executionBackend', {
      pluginId,
      exitCode,
      hasBackend: !!platform.executionBackend,
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
      if (presenter?.debug) {
        presenter.debug(msg);
      } else {
        console.debug(msg);
      }
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
      if (presenter?.table) {
        presenter.table(data);
      } else {
        console.table(data);
      }
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
 * Create PlatformServices from platform container
 *
 * Platform owns all services, we just pass them through.
 * No wrappers, no adapters - direct passthrough.
 */
function createPlatformServices(platformContainer: PlatformContainer): PlatformServices {
  return {
    logger: platformContainer.logger,
    llm: platformContainer.llm,
    embeddings: platformContainer.embeddings,
    vectorStore: platformContainer.vectorStore,
    cache: platformContainer.cache,
    storage: platformContainer.storage,
    analytics: platformContainer.analytics,
  };
}

/**
 * Create PluginContextV3 for system commands
 *
 * Converts legacy SystemContext → PluginContextV3
 * Used by system commands (hello, version, etc.) to receive pure V3 context
 */
export function createPluginContextV3ForSystemCommand(
  context: SystemContext,
  platform: PlatformContainer
): import('@kb-labs/plugin-contracts').PluginContextV3 {
  const ui = createUIFacade(context);
  const platformServices = createPlatformServices(platform);

  return {
    host: 'cli',
    requestId: `cli-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    pluginId: '@kb-labs/system',
    cwd: context.cwd || process.cwd(),
    ui,
    platform: platformServices,
    runtime: {
      fs: {} as any, // System commands don't use sandboxed fs
      fetch: fetch as any,
      env: (key: string) => process.env[key],
      state: platform.stateBroker as any,
    },
    api: {} as any, // System commands don't use remote API
    trace: {
      traceId: `trace-${Date.now()}`,
      spanId: `span-${Date.now()}`,
    },
  };
}
