/**
 * V3 CLI Command Execution
 *
 * Entry point for executing plugin commands via V3 plugin system.
 */

import type { PluginContextDescriptor, UIFacade, PlatformServices } from '@kb-labs/plugin-contracts';
import { runInProcess, runInSubprocess } from '@kb-labs/plugin-runtime/sandbox';

export interface ExecuteCommandV3Options {
  /**
   * Plugin ID (e.g., "@kb-labs/my-plugin")
   */
  pluginId: string;

  /**
   * Plugin version
   */
  pluginVersion: string;

  /**
   * Path to command handler file
   */
  handlerPath: string;

  /**
   * Command arguments
   */
  argv: string[];

  /**
   * Command flags
   */
  flags: Record<string, unknown>;

  /**
   * Plugin configuration
   */
  config?: unknown;

  /**
   * Plugin permissions
   */
  permissions?: PluginContextDescriptor['permissions'];

  /**
   * Working directory
   */
  cwd?: string;

  /**
   * Output directory
   */
  outdir?: string;

  /**
   * Tenant ID
   */
  tenantId?: string;

  /**
   * UI facade for user interaction
   */
  ui: UIFacade;

  /**
   * Platform services
   */
  platform: PlatformServices;

  /**
   * Abort signal
   */
  signal?: AbortSignal;

  /**
   * Development mode (runs in-process for easier debugging)
   */
  devMode?: boolean;

  /**
   * Unix socket path for IPC communication.
   * If not provided, will attempt to get from platform.getSocketPath()
   */
  socketPath?: string;

  /**
   * Resource quotas from manifest
   */
  quotas?: {
    timeoutMs?: number;
    memoryMb?: number;
    cpuMs?: number;
  };
}

/**
 * Execute a plugin command via V3 plugin system
 *
 * @param options Execution options
 * @returns Exit code (0 for success, non-zero for failure)
 *
 * @example
 * ```typescript
 * const exitCode = await executeCommandV3({
 *   pluginId: '@kb-labs/my-plugin',
 *   pluginVersion: '1.0.0',
 *   handlerPath: '/path/to/handler.js',
 *   argv: ['arg1', 'arg2'],
 *   flags: { verbose: true },
 *   ui: cliUIFacade,
 *   platform: platformServices,
 * });
 * ```
 */
export async function executeCommandV3(
  options: ExecuteCommandV3Options
): Promise<number> {
  const {
    pluginId,
    pluginVersion,
    handlerPath,
    argv,
    flags,
    config,
    permissions = {},
    cwd = process.cwd(),
    outdir,
    tenantId,
    ui,
    platform,
    signal,
    devMode = false,
    socketPath,
    quotas,
  } = options;

  // Create plugin context descriptor
  const descriptor: PluginContextDescriptor = {
    host: 'cli',
    pluginId,
    pluginVersion,
    tenantId,
    cwd,
    outdir,
    config,
    permissions,
    hostContext: { host: 'cli', argv, flags },
    parentRequestId: undefined,
    requestId: `cli-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  };

  // Prepare input
  const input = { argv, flags };

  try {
    // Run in appropriate mode
    const result = devMode
      ? await runInProcess({
          descriptor,
          platform,
          ui,
          handlerPath,
          input,
          signal,
        })
      : await runInSubprocess({
          descriptor,
          socketPath: socketPath || '', // Passed from parent or empty string
          handlerPath,
          input,
          timeoutMs: quotas?.timeoutMs, // Pass timeout from manifest quotas
          signal,
        });

    // Return exit code from result
    return result.exitCode;
  } catch (error) {
    // Handle execution errors
    ui.error(error instanceof Error ? error : String(error));
    return 1;
  }
}
