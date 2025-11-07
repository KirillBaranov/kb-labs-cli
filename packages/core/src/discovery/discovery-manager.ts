/**
 * @module @kb-labs/cli-core/discovery/discovery-manager
 * Discovery manager - coordinates all discovery strategies
 */

import * as path from 'node:path';
import * as semver from 'semver';
import type { DiscoveryStrategy, DiscoveryResult } from './types.js';
import type { PluginBrief, DiscoveryOptions } from '../registry/plugin-registry.js';
import { WorkspaceStrategy } from './strategies/workspace.js';
import { PkgStrategy } from './strategies/pkg.js';
import { DirStrategy } from './strategies/dir.js';
import { FileStrategy } from './strategies/file.js';
import type { ManifestV2 } from '@kb-labs/plugin-manifest';

/**
 * Discovery manager - coordinates all strategies with priority
 */
export class DiscoveryManager {
  private strategies: Map<string, DiscoveryStrategy> = new Map();

  constructor(private opts: DiscoveryOptions) {
    // Register strategies
    this.strategies.set('workspace', new WorkspaceStrategy());
    this.strategies.set('pkg', new PkgStrategy());
    this.strategies.set('dir', new DirStrategy());
    this.strategies.set('file', new FileStrategy());
  }

  /**
   * Run discovery across all configured strategies
   */
  async discover(): Promise<DiscoveryResult> {
    const allPlugins: PluginBrief[] = [];
    const allManifests = new Map();
    const allErrors: Array<{ path: string; error: string }> = [];

    // Get roots (default to cwd)
    const roots = this.opts.roots || [process.cwd()];
    console.log(`[DiscoveryManager] Starting discovery with roots: ${roots.join(', ')}`);
    console.log(`[DiscoveryManager] Enabled strategies: ${this.opts.strategies.join(', ')}`);

    // Execute strategies in parallel
    const enabledStrategies = this.opts.strategies
      .map(name => this.strategies.get(name))
      .filter((s): s is DiscoveryStrategy => s !== undefined)
      .sort((a, b) => a.priority - b.priority);

    console.log(`[DiscoveryManager] Found ${enabledStrategies.length} enabled strategies: ${enabledStrategies.map(s => s.name).join(', ')}`);

    const results = await Promise.all(
      enabledStrategies.map(strategy => {
        console.log(`[DiscoveryManager] Executing strategy: ${strategy.name}`);
        return strategy.discover(roots);
      })
    );

    // Merge results
    for (const result of results) {
      allPlugins.push(...result.plugins);
      for (const [id, manifest] of result.manifests) {
        allManifests.set(id, manifest);
      }
      allErrors.push(...result.errors);
    }

    // Deduplicate and resolve conflicts
    const deduplicated = this.deduplicatePlugins(allPlugins);

    // After deduplication, ensure manifests match plugin IDs
    // Create a new map with manifests keyed by deduplicated plugin IDs
    const deduplicatedManifests = new Map<string, ManifestV2>();
    for (const plugin of deduplicated) {
      // Try to find manifest by plugin.id first
      let manifest = allManifests.get(plugin.id);
      if (manifest) {
        deduplicatedManifests.set(plugin.id, manifest);
        console.log(`[DiscoveryManager] Found manifest for plugin ${plugin.id} by plugin.id`);
      } else {
        // If not found by plugin.id, try to find by manifest.id from all manifests
        for (const [id, m] of allManifests) {
          if (m.id === plugin.id) {
            manifest = m;
            deduplicatedManifests.set(plugin.id, m);
            console.log(`[DiscoveryManager] Found manifest for plugin ${plugin.id} by manifest.id (was stored as ${id})`);
            break;
          }
        }
        if (!manifest) {
          console.warn(`[DiscoveryManager] WARNING: No manifest found for plugin ${plugin.id}`);
          console.warn(`[DiscoveryManager] Available manifest IDs: ${Array.from(allManifests.keys()).join(', ')}`);
        }
      }
    }

    return {
      plugins: deduplicated,
      manifests: deduplicatedManifests,
      errors: allErrors,
    };
  }

  /**
   * Deduplicate plugins by ID with resolution rules:
   * 1. Higher semver wins
   * 2. Source priority: workspace > pkg > dir > file
   * 3. Alphabetical path order
   */
  private deduplicatePlugins(plugins: PluginBrief[]): PluginBrief[] {
    const byId = new Map<string, PluginBrief[]>();

    // Group by ID
    for (const plugin of plugins) {
      if (!byId.has(plugin.id)) {
        byId.set(plugin.id, []);
      }
      byId.get(plugin.id)!.push(plugin);
    }

    const result: PluginBrief[] = [];

    // Resolve conflicts for each ID
    for (const [id, candidates] of byId) {
      if (candidates.length === 1) {
        result.push(candidates[0]!);
        continue;
      }

      // Sort candidates by resolution rules
      const sorted = candidates.sort((a, b) => {
        // Rule 1: Higher semver wins
        try {
          const compared = semver.compare(b.version, a.version);
          if (compared !== 0) {
            if (!this.opts.allowDowngrade && compared > 0) {
              return -1;
            }
            return compared;
          }
        } catch {
          // Invalid semver, skip comparison
        }

        // Rule 2: Source priority
        const sourcePriority = { workspace: 1, pkg: 2, dir: 3, file: 4 } as const;
        const aPriority = sourcePriority[a.source.kind];
        const bPriority = sourcePriority[b.source.kind];
        if (aPriority !== bPriority) {
          return aPriority - bPriority;
        }

        // Rule 3: Alphabetical path order
        return a.source.path.localeCompare(b.source.path);
      });

      result.push(sorted[0]!);
    }

    return result;
  }

  /**
   * Normalize path to real path (resolve symlinks)
   */
  private normalizePath(filePath: string): string {
    try {
      return path.resolve(filePath);
    } catch {
      return filePath;
    }
  }
}

