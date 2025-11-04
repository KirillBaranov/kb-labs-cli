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

    // Execute strategies in parallel
    const enabledStrategies = this.opts.strategies
      .map(name => this.strategies.get(name))
      .filter((s): s is DiscoveryStrategy => s !== undefined)
      .sort((a, b) => a.priority - b.priority);

    const results = await Promise.all(
      enabledStrategies.map(strategy => strategy.discover(roots))
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

    return {
      plugins: deduplicated,
      manifests: allManifests,
      errors: allErrors,
    };
  }

  /**
   * Deduplicate plugins by ID with resolution rules:
   * 1. Prefer V2 over V1 (if preferV2 is true)
   * 2. Higher semver wins
   * 3. Source priority: workspace > pkg > dir > file
   * 4. Alphabetical path order
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
        // Rule 1: Prefer V2 over V1
        if (this.opts.preferV2 !== false) {
          if (a.kind === 'v2' && b.kind === 'v1') return -1;
          if (a.kind === 'v1' && b.kind === 'v2') return 1;
        }

        // Rule 2: Higher semver wins
        try {
          const compared = semver.compare(b.version, a.version);
          if (compared !== 0) {
            // Check allowDowngrade flag
            if (!this.opts.allowDowngrade && compared > 0) {
              // b > a, but we don't allow downgrades, so keep a
              return -1;
            }
            return compared;
          }
        } catch {
          // Invalid semver, skip comparison
        }

        // Rule 3: Source priority
        const sourcePriority = { workspace: 1, pkg: 2, dir: 3, file: 4 };
        const aPriority = sourcePriority[a.source.kind];
        const bPriority = sourcePriority[b.source.kind];
        if (aPriority !== bPriority) {
          return aPriority - bPriority;
        }

        // Rule 4: Alphabetical path order
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

