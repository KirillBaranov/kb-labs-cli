/**
 * @module @kb-labs/cli-core/registry/plugin-registry
 * Plugin registry implementation
 */

import type { CacheAdapter } from '../cache/cache-adapter.js';
import type { ManifestV2, RestRouteDecl } from '@kb-labs/plugin-manifest';
import { WatchManager } from './watch-manager.js';
import semver from 'semver';
import * as path from 'node:path';
import { getLogger } from '@kb-labs/core-sys/logging';

const logger = getLogger('PluginRegistry');

/**
 * Source kind for discovered plugins
 */
export type SourceKind = 'workspace' | 'pkg' | 'dir' | 'file';

/**
 * Plugin brief information
 */
export interface PluginBrief {
  id: string;
  version: string;
  kind: 'v2';
  source: {
    kind: SourceKind;
    path: string;
  };
  display?: {
    name?: string;
    description?: string;
  };
}

/**
 * Registry snapshot
 */
export interface RegistrySnapshot {
  version: string;
  plugins: PluginBrief[];
  ts: number;
}

/**
 * Registry diff
 */
export interface RegistryDiff {
  added: PluginBrief[];
  removed: PluginBrief[];
  changed: Array<{
    from: PluginBrief;
    to: PluginBrief;
  }>;
}

/**
 * Explain result
 */
export interface ExplainResult {
  pluginId: string;
  selected: {
    version: string;
    source: string;
    path: string;
  };
  candidates: Array<{
    version: string;
    source: string;
    path: string;
    reason: string;
  }>;
  resolutionRules: string[];
}

/**
 * Discovery options
 */
export interface DiscoveryOptions {
  strategies: Array<'workspace' | 'pkg' | 'dir' | 'file'>;
  roots?: string[];
  allowDowngrade?: boolean;
  watch?: boolean;
  debounceMs?: number;
}

/**
 * Cache options
 */
export interface CacheOptions {
  adapter: CacheAdapter;
  ttlMs?: number;
}

/**
 * Route reference
 */
export type RouteRef = `${string}:${'GET'|'POST'|'PUT'|'PATCH'|'DELETE'} ${string}`;

/**
 * Handler reference
 */
export type HandlerRef = {
  file: string;
  export: string;
};

type ResolvedRoute = {
  pluginId: string;
  handler: HandlerRef;
  manifest: ManifestV2;
  route: RestRouteDecl;
  pluginRoot: string;
  workdir: string;
  outdir?: string;
};

function parseHandlerRef(handler: string): HandlerRef {
  const [file, exportName] = handler.split('#');
  if (!file || !exportName) {
    throw new Error(`Invalid handler reference: ${handler}`);
  }
  return { file, export: exportName };
}

function normalizeInvokePath(value: string): string {
  if (!value) {
    return '/';
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return '/';
  }
  const prefixed = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return prefixed.endsWith('/') && prefixed !== '/' ? prefixed.slice(0, -1) : prefixed;
}

function resolveRouteFullPath(route: RestRouteDecl, basePath: string, pluginId: string): string {
  const normalizedBase = normalizeInvokePath(basePath || `/v1/plugins/${pluginId}`);
  const rawPath = route.path || '/';

  if (rawPath.startsWith('/v1/plugins/')) {
    const basePrefix = normalizedBase.split('/v1')[0] || '';
    return normalizeInvokePath(rawPath.replace(/^\/v1/, basePrefix + '/v1'));
  }

  if (rawPath.startsWith('/')) {
    return normalizeInvokePath(`${normalizedBase}${rawPath}`);
  }

  return normalizeInvokePath(`${normalizedBase}/${rawPath}`);
}

function pathsEqual(a: string, b: string): boolean {
  return normalizeInvokePath(a) === normalizeInvokePath(b);
}

/**
 * Plugin Registry - manages discovered plugins
 */
export class PluginRegistry {
  private plugins: Map<string, PluginBrief> = new Map();
  private manifests: Map<string, ManifestV2> = new Map();
  private listeners: Array<(diff: RegistryDiff) => void> = [];
  private snapshotVersion: string = '1';
  private lastUpdate: number = 0;
  private lastErrors: Array<{ path: string; error: string }> = [];
  private initialized = false;
  private watchManager?: WatchManager;

  constructor(
    private opts: DiscoveryOptions & { cache?: CacheOptions }
  ) {
    // Initialize watch mode if requested
    if (this.opts.watch) {
      this.initWatchMode();
    }
  }

  /**
   * Initialize file watch mode
   */
  private initWatchMode(): void {
    const roots = this.opts.roots || [process.cwd()];
    
    this.watchManager = new WatchManager({
      roots,
      onChange: async () => {
        await this.refresh();
      },
      debounceMs: 500,
    });

    // Start watching after a short delay (allow initial refresh to complete)
    setTimeout(() => {
      this.watchManager?.start().catch(error => {
        logger.error('Failed to start watch mode', error instanceof Error ? error : new Error(String(error)));
      });
    }, 1000);
  }

  /**
   * Refresh plugin registry (run discovery)
   */
  async refresh(): Promise<void> {
    const start = Date.now();
    
    try {
      const { DiscoveryManager } = await import('../discovery/discovery-manager.js');
      const manager = new DiscoveryManager(this.opts);
      
      const result = await manager.discover();
      
      // Store old plugins for diff
      const oldPlugins = new Map(this.plugins);
      
      // Update registry
      this.plugins.clear();
      this.manifests.clear();
      
      for (const plugin of result.plugins) {
        this.plugins.set(plugin.id, plugin);
      }
      
      for (const [id, manifest] of result.manifests) {
        this.manifests.set(id, manifest);
        logger.debug(`Stored manifest for ${id} (manifest.id=${manifest.id})`);
      }
      
      // Log summary
      logger.debug(`Stored ${this.manifests.size} manifests for ${this.plugins.size} plugins`);
      if (this.plugins.size > 0 && this.manifests.size === 0) {
        logger.warn(`WARNING: Found ${this.plugins.size} plugins but 0 manifests!`);
        logger.warn(`Plugin IDs: ${Array.from(this.plugins.keys()).join(', ')}`);
      }
      
      // Calculate diff
      const diff = this.calculateDiff(oldPlugins, this.plugins);
      
      // Update metadata
      this.lastUpdate = Date.now();
      this.snapshotVersion = String(Number(this.snapshotVersion) + 1);
      this.lastErrors = result.errors;
      this.initialized = true;
      
      const duration = Date.now() - start;
      logger.debug(`[PluginRegistry] Discovery completed in ${duration}ms, found ${this.plugins.size} plugins`);
      
      // Notify listeners
      if (diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0) {
        this.notifyListeners(diff);
      }
    } catch (error) {
      const duration = Date.now() - start;
      logger.error(`Discovery failed after ${duration}ms`, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Calculate diff between old and new plugin sets
   */
  private calculateDiff(
    oldPlugins: Map<string, PluginBrief>,
    newPlugins: Map<string, PluginBrief>
  ): RegistryDiff {
    const added: PluginBrief[] = [];
    const removed: PluginBrief[] = [];
    const changed: Array<{ from: PluginBrief; to: PluginBrief }> = [];

    // Find added and changed
    for (const [id, newPlugin] of newPlugins) {
      const oldPlugin = oldPlugins.get(id);
      if (!oldPlugin) {
        added.push(newPlugin);
      } else if (oldPlugin.version !== newPlugin.version || oldPlugin.source.path !== newPlugin.source.path) {
        changed.push({ from: oldPlugin, to: newPlugin });
      }
    }

    // Find removed
    for (const [id, oldPlugin] of oldPlugins) {
      if (!newPlugins.has(id)) {
        removed.push(oldPlugin);
      }
    }

    return { added, removed, changed };
  }

  /**
   * List all plugins
   */
  list(): PluginBrief[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get manifest V2 for a plugin
   */
  getManifestV2(id: string): ManifestV2 | null {
    return this.manifests.get(id) || null;
  }

  /**
   * Resolve route to handler
   */
  async resolveRoute(pluginId: string, method: string, rawPath: string): Promise<ResolvedRoute | null> {
    const manifest = this.manifests.get(pluginId);
    const plugin = this.plugins.get(pluginId);

    if (!manifest || !plugin?.source?.path || !manifest.rest?.routes?.length) {
      return null;
    }

    const targetMethod = method.toUpperCase();
    const targetPath = normalizeInvokePath(rawPath);
    const basePath = manifest.rest?.basePath || `/v1/plugins/${manifest.id}`;

    for (const route of manifest.rest.routes) {
      if (route.method.toUpperCase() !== targetMethod) {
        continue;
      }

      const routeFullPath = resolveRouteFullPath(route, basePath, manifest.id);
      if (!pathsEqual(routeFullPath, targetPath)) {
        continue;
      }

      try {
        const handlerRef = parseHandlerRef(route.handler);
        return {
          pluginId,
          handler: handlerRef,
          manifest,
          route,
          pluginRoot: plugin.source.path,
          workdir: plugin.source.path,
          outdir: path.join(plugin.source.path, 'out'),
        } satisfies ResolvedRoute;
      } catch (error) {
        logger.warn('Failed to parse handler for route', {
          pluginId,
          handler: route.handler,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    }

    return null;
  }

  /**
   * Get registry snapshot
   */
  get snapshot(): RegistrySnapshot {
    return {
      version: this.snapshotVersion,
      plugins: this.list(),
      ts: this.lastUpdate,
    };
  }

  /**
   * Get errors from last discovery
   */
  get errors(): Array<{ path: string; error: string }> {
    return this.lastErrors;
  }

  /**
   * Check if registry has completed at least one discovery
   */
  get isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Subscribe to registry changes
   */
  onChange(cb: (diff: RegistryDiff) => void): () => void {
    this.listeners.push(cb);
    return () => {
      const index = this.listeners.indexOf(cb);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Explain why a plugin was selected
   */
  explain(pluginId: string): ExplainResult {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      return {
        pluginId,
        selected: { version: 'not-found', source: 'none', path: '' },
        candidates: [],
        resolutionRules: [],
      };
    }

    return {
      pluginId,
      selected: {
        version: plugin.version,
        source: plugin.source.kind,
        path: plugin.source.path,
      },
      candidates: [],
      resolutionRules: [
        'Priority: workspace > pkg > dir > file',
        'Prefer higher semver',
        'Alphabetical path order',
      ],
    };
  }

  /**
   * Dispose registry and cleanup resources
   */
  async dispose(): Promise<void> {
    // Stop watch mode if active
    if (this.watchManager) {
      await this.watchManager.stop();
      this.watchManager = undefined;
    }

    this.plugins.clear();
    this.manifests.clear();
    this.listeners = [];
  }

  /**
   * Notify listeners of changes
   */
  private notifyListeners(diff: RegistryDiff): void {
    for (const listener of this.listeners) {
      try {
        listener(diff);
      } catch (error) {
        logger.error('Registry listener error', {
          error: error instanceof Error ? error.message : String(error),
          diff: { added: diff.added.length, removed: diff.removed.length, changed: diff.changed.length },
        });
      }
    }
  }

  /**
   * Add plugin to registry
   */
  protected addPlugin(brief: PluginBrief, manifest?: ManifestV2): void {
    this.plugins.set(brief.id, brief);
    if (manifest) {
      this.manifests.set(brief.id, manifest);
    }
  }
}

