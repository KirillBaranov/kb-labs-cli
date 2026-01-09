/**
 * V3 CLI Command Execution
 *
 * Entry point for executing plugin commands via V3 plugin system.
 * Uses unified platform.executionBackend for all execution.
 */

import type { PluginContextDescriptor, UIFacade, PlatformServices, CommandResult } from '@kb-labs/plugin-contracts';
import { wrapCliResult } from '@kb-labs/plugin-runtime';
import type { PlatformContainer } from '@kb-labs/core-runtime';
import type { ExecutionRequest, ExecutionResult } from '@kb-labs/core-platform';
import * as path from 'node:path';

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
   * Platform container (for executionBackend access - internal use only)
   */
  platformContainer: PlatformContainer;

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
    hostType: 'cli',
    pluginId,
    pluginVersion,
    tenantId,
    permissions,
    hostContext: { host: 'cli', argv, flags },
    requestId: `cli-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  };

  // Prepare input
  const input = { argv, flags };

  try {
    // Resolve plugin root (required by ExecutionBackend)
    const pluginRoot = resolvePluginRoot(pluginId, pluginVersion);

    // Build ExecutionRequest for platform.executionBackend
    const request: ExecutionRequest = {
      executionId: descriptor.requestId,
      descriptor,
      pluginRoot,
      handlerRef: handlerPath,
      input,
      timeoutMs: quotas?.timeoutMs,
    };

    // Execute via unified platform.executionBackend
    // Backend respects platform.execution config (in-process, worker-pool, etc.)
    //
    // Use the platformContainer passed from v3-adapter (which got it from bootstrap)
    // This ensures we use the SAME instance that was initialized with ExecutionBackend
    const result: ExecutionResult = await options.platformContainer.executionBackend.execute(request, {
      signal,
    });

    // Handle execution result
    if (!result.ok) {
      ui.error(result.error?.message || 'Execution failed');
      return 1;
    }

    // Wrap result for CLI (preserves backward compatibility)
    const runResult = {
      ok: true,
      data: result.data,
      executionMeta: result.metadata?.executionMeta,
    };
    const cliResult = wrapCliResult(runResult, descriptor);

    // Return exit code from wrapped result
    return cliResult.exitCode;
  } catch (error) {
    // Handle execution errors
    ui.error(error instanceof Error ? error : String(error));
    return 1;
  }
}

/**
 * Resolve plugin root directory from pluginId and version.
 * In CLI context, plugins are installed in workspace node_modules.
 */
function resolvePluginRoot(pluginId: string, _pluginVersion: string): string {
  // For workspace plugins, resolve from node_modules
  const nodeModulesPath = path.resolve(process.cwd(), 'node_modules', pluginId);

  // Fallback: try to resolve via require.resolve (works for both CJS and ESM)
  try {
    const packageJson = require.resolve(`${pluginId}/package.json`, {
      paths: [process.cwd()],
    });
    return path.dirname(packageJson);
  } catch {
    // If not found, return node_modules path (let backend handle the error)
    return nodeModulesPath;
  }
}
