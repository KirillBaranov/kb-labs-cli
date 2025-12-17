/**
 * V3 Plugin System Adapter
 *
 * Provides opt-in V3 execution with safe fallback to V2.
 * Enable with: KB_PLUGIN_VERSION=3
 */

import type { CliContext } from '@kb-labs/cli-core';
import { executeCommandV3 } from '@kb-labs/cli-core/v3';
import type { UIFacade, PlatformServices } from '@kb-labs/plugin-contracts-v3';
import { platform } from '@kb-labs/core-runtime';
import path from 'node:path';

interface V3ExecutionOptions {
  context: CliContext;
  commandId: string;
  argv: string[];
  flags: Record<string, unknown>;
  manifestCmd?: {
    plugin: {
      id: string;
      version: string;
      rootDir: string;
    };
    manifest: {
      handler?: string;
      handlerPath?: string;
    };
  };
}

/**
 * Check if V3 execution is enabled
 */
export function isV3Enabled(): boolean {
  return process.env.KB_PLUGIN_VERSION === '3';
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

  console.log('[v3-adapter] tryExecuteV3 called', { KB_PLUGIN_VERSION: process.env.KB_PLUGIN_VERSION });

  // V3 not enabled
  if (!isV3Enabled()) {
    console.log('[v3-adapter] V3 not enabled, returning undefined');
    return undefined;
  }

  console.log('[v3-adapter] V3 enabled, checking manifestCmd');

  // No manifest command info - can't use V3
  if (!manifestCmd) {
    console.log('[v3-adapter] No manifestCmd, falling back to V2');
    context.logger?.warn('[v3-adapter] No manifest command info, falling back to V2');
    return undefined;
  }

  // Find the CLI command in ManifestV2 to get handlerPath
  const manifestV2 = manifestCmd.manifest.manifestV2;
  const cliCommand = manifestV2?.cli?.commands?.find((c: any) => c.id === commandId);

  console.log('[v3-adapter] manifestCmd found:', {
    id: manifestCmd.manifest.id,
    hasManifestV2: !!manifestV2,
    hasCliCommand: !!cliCommand,
    hasHandlerPath: !!(cliCommand as any)?.handlerPath,
    hasHandler: !!(cliCommand as any)?.handler,
    handler: (cliCommand as any)?.handler,
    handlerPath: (cliCommand as any)?.handlerPath,
  });

  // Resolve handler path - V3 commands use handlerPath
  const handlerRelativePath = (cliCommand as any)?.handlerPath;
  if (!handlerRelativePath) {
    console.log('[v3-adapter] No handlerPath in V2 manifest, falling back to V2');
    context.logger?.warn('[v3-adapter] No handler path in manifest, falling back to V2');
    return undefined;
  }

  console.log('[v3-adapter] handlerRelativePath:', handlerRelativePath);
  console.log('[v3-adapter] manifestCmd structure:', {
    hasPlugin: !!manifestCmd.plugin,
    hasPkgRoot: !!manifestCmd.pkgRoot,
    pkgRoot: manifestCmd.pkgRoot,
  });

  // Use pkgRoot instead of plugin.rootDir
  const pluginRoot = manifestCmd.pkgRoot;
  if (!pluginRoot) {
    console.log('[v3-adapter] No pkgRoot, falling back to V2');
    context.logger?.warn('[v3-adapter] No pkgRoot in manifestCmd, falling back to V2');
    return undefined;
  }

  // Handler path should point to dist/ (compiled output)
  const handlerPath = path.resolve(pluginRoot, 'dist', handlerRelativePath);

  try {
    const pluginId = manifestV2?.id || manifestCmd.manifest.id;
    const pluginVersion = manifestV2?.version || '0.0.0';

    console.log('[v3-adapter] Executing via V3', {
      pluginId,
      pluginVersion,
      commandId,
      handlerPath,
    });

    // Create V3 UI facade from CLI context
    const ui = createUIFacade(context);

    // Create V3 platform services from CLI context
    const platformServices = createPlatformServices(context);

    // Get socket path from platform singleton for IPC
    const socketPath = platform.getSocketPath();

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
    });

    console.log('[v3-adapter] V3 execution completed with exitCode:', exitCode);
    return exitCode;

  } catch (error) {
    // Log error but don't fail - let V2 try
    console.error('[v3-adapter] V3 execution failed:', error);
    context.logger?.error('[v3-adapter] V3 execution failed, falling back to V2', {
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

/**
 * Create UIFacade from CLI context
 */
function createUIFacade(context: CliContext): UIFacade {
  const presenter = (context as any).presenter;

  return {
    info: (msg: string) => presenter?.info?.(msg) || console.log(msg),
    success: (msg: string) => presenter?.success?.(msg) || console.log(`✓ ${msg}`),
    warn: (msg: string) => presenter?.warn?.(msg) || console.warn(`⚠ ${msg}`),
    error: (err: Error | string) => {
      const message = err instanceof Error ? err.message : err;
      presenter?.error?.(message) || console.error(message);
    },
    spinner: {
      start: (text?: string) => {
        const spinner = presenter?.spinner?.(text);
        return {
          stop: () => spinner?.stop?.(),
          succeed: (text?: string) => spinner?.succeed?.(text),
          fail: (text?: string) => spinner?.fail?.(text),
        };
      },
    },
    progress: {
      start: (options: { total: number; initial?: number }) => {
        const progress = presenter?.progress?.(options);
        return {
          update: (current: number, text?: string) => progress?.update?.(current, text),
          stop: () => progress?.stop?.(),
        };
      },
    },
    table: (data: unknown) => presenter?.table?.(data) || console.table(data),
    section: (title: string, content: string) => {
      presenter?.section?.(title, content) || console.log(`\n${title}\n${content}\n`);
    },
    confirm: async (message: string) => {
      // For now, return true (non-interactive)
      // TODO: Implement proper confirm via presenter
      return true;
    },
    prompt: async (message: string) => {
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
function createPlatformServices(_context: CliContext): PlatformServices {
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
