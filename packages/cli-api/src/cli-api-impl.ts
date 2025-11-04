/**
 * @module @kb-labs/cli-api/cli-api-impl
 * CLI API implementation
 */

import type { ManifestV2 } from '@kb-labs/plugin-manifest';
import {
  PluginRegistry,
  InMemoryCacheAdapter,
  generateOpenAPISpec,
  mergeOpenAPISpecs,
  generateStudioRegistry,
  type PluginBrief,
  type OpenAPISpec,
  type StudioRegistry,
  type ExplainResult,
  type RegistrySnapshot,
  type RegistryDiff,
} from '@kb-labs/cli-core';
import type { CliAPI, CliInitOptions, RunCommandParams, RunCommandResult } from './types.js';

/**
 * CLI API implementation
 */
export class CliAPIImpl implements CliAPI {
  private registry: PluginRegistry;
  private initialized = false;

  constructor(private opts?: CliInitOptions) {
    // Create plugin registry with options
    const discoveryOpts = {
      strategies: opts?.discovery?.strategies || ['workspace', 'pkg', 'dir', 'file'],
      roots: opts?.discovery?.roots,
      preferV2: opts?.discovery?.preferV2 !== false,
      allowDowngrade: opts?.discovery?.allowDowngrade || false,
      watch: opts?.discovery?.watch || false,
      debounceMs: opts?.discovery?.debounceMs,
    } as const;

    const cacheOpts = opts?.cache?.inMemory
      ? {
          adapter: new InMemoryCacheAdapter(),
          ttlMs: opts.cache.ttlMs,
        }
      : undefined;

    this.registry = new PluginRegistry({
      ...discoveryOpts,
      cache: cacheOpts,
    });
  }

  /**
   * Initialize API (run first discovery)
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.registry.refresh();
    this.initialized = true;
  }

  /**
   * List all plugins
   */
  async listPlugins(): Promise<PluginBrief[]> {
    return this.registry.list();
  }

  /**
   * Get manifest V2 for a plugin
   */
  async getManifestV2(pluginId: string): Promise<ManifestV2 | null> {
    return this.registry.getManifestV2(pluginId);
  }

  /**
   * Get OpenAPI specification for a plugin
   */
  async getOpenAPISpec(pluginId: string): Promise<OpenAPISpec | null> {
    const manifest = this.registry.getManifestV2(pluginId);
    if (!manifest) {
      return null;
    }

    return generateOpenAPISpec(manifest);
  }

  /**
   * Get studio registry (aggregated)
   */
  async getStudioRegistry(): Promise<StudioRegistry> {
    const plugins = this.registry.list();
    const manifests = new Map<string, ManifestV2>();

    for (const plugin of plugins) {
      const manifest = this.registry.getManifestV2(plugin.id);
      if (manifest) {
        manifests.set(plugin.id, manifest);
      }
    }

    return generateStudioRegistry(plugins, manifests);
  }

  /**
   * Refresh plugin discovery
   */
  async refresh(): Promise<void> {
    await this.registry.refresh();
  }

  /**
   * Run a command (optional)
   * Note: This would require integration with plugin-runtime
   */
  async runCommand(params: RunCommandParams): Promise<RunCommandResult> {
    // TODO: Implement command execution
    // This would need to:
    // 1. Resolve command handler from manifest
    // 2. Use @kb-labs/sandbox or plugin-runtime to execute
    // 3. Return result in standardized format
    
    return {
      ok: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Command execution not yet implemented',
      },
    };
  }

  /**
   * Explain why a plugin was selected
   */
  explain(pluginId: string): ExplainResult {
    return this.registry.explain(pluginId);
  }

  /**
   * Get registry snapshot
   */
  snapshot(): RegistrySnapshot {
    return this.registry.snapshot;
  }

  /**
   * Subscribe to registry changes
   */
  onChange(cb: (diff: RegistryDiff) => void): () => void {
    return this.registry.onChange(cb);
  }

  /**
   * Dispose API and cleanup
   */
  async dispose(): Promise<void> {
    await this.registry.dispose();
    this.initialized = false;
  }
}

