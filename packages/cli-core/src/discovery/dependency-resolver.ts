/**
 * @module @kb-labs/cli-core/discovery/dependency-resolver
 * Dependency resolution and validation
 */

import * as semver from 'semver';
import type { PluginBrief } from '../registry/plugin-registry';
import type { ManifestV2 } from '@kb-labs/plugin-manifest';

/**
 * Plugin dependency
 */
export interface PluginDependency {
  id: string;
  version: string; // semver range
  optional?: boolean;
}

/**
 * Resolved dependency graph
 */
export interface ResolvedGraph {
  plugins: PluginBrief[];
  dependencies: Map<string, PluginDependency[]>;
  loadOrder: PluginBrief[]; // topo-sorted
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: Array<{
    pluginId: string;
    error: string;
    remediation?: string;
  }>;
  warnings: Array<{
    pluginId: string;
    warning: string;
  }>;
}

/**
 * Dependency resolver
 */
export class DependencyResolver {
  private plugins: Map<string, PluginBrief>;
  private manifests: Map<string, ManifestV2>;
  private graph: Map<string, Set<string>> = new Map();

  constructor(
    plugins: PluginBrief[],
    manifests: Map<string, ManifestV2>
  ) {
    this.plugins = new Map(plugins.map(p => [p.id, p]));
    this.manifests = manifests;
    this.buildGraph();
  }

  /**
   * Build dependency graph
   */
  private buildGraph(): void {
    for (const plugin of this.plugins.values()) {
      const manifest = this.manifests.get(plugin.id);
      if (!manifest?.dependencies) {
        continue;
      }

      const deps = new Set<string>();
      for (const dep of manifest.dependencies) {
        deps.add(dep.id);
      }
      this.graph.set(plugin.id, deps);
    }
  }

  /**
   * Resolve full graph
   */
  resolveGraph(): ResolvedGraph {
    const plugins = Array.from(this.plugins.values());
    const dependencies = new Map<string, PluginDependency[]>();

    for (const plugin of plugins) {
      const manifest = this.manifests.get(plugin.id);
      if (manifest?.dependencies) {
        dependencies.set(plugin.id, manifest.dependencies);
      }
    }

    const loadOrder = this.topoSort();

    return {
      plugins,
      dependencies,
      loadOrder,
    };
  }

  /**
   * Validate dependencies
   */
  validate(): ValidationResult {
    const errors: ValidationResult['errors'] = [];
    const warnings: ValidationResult['warnings'] = [];

    // Check for cycles
    const cycles = this.detectCycles();
    for (const cycle of cycles) {
      errors.push({
        pluginId: cycle[0] || 'unknown',
        error: `Circular dependency detected: ${cycle.join(' → ')}`,
        remediation: 'Remove circular dependencies from plugin manifests',
      });
    }

    // Check missing dependencies
    for (const plugin of this.plugins.values()) {
      const manifest = this.manifests.get(plugin.id);
      if (!manifest?.dependencies) {
        continue;
      }

      for (const dep of manifest.dependencies) {
        const depPlugin = this.plugins.get(dep.id);
        
        if (!depPlugin) {
          if (dep.optional) {
            warnings.push({
              pluginId: plugin.id,
              warning: `Optional dependency ${dep.id} not found`,
            });
          } else {
            errors.push({
              pluginId: plugin.id,
              error: `Required dependency ${dep.id} not found`,
              remediation: `Install ${dep.id}@${dep.version}`,
            });
          }
          continue;
        }

        // Validate semver
        if (!semver.satisfies(depPlugin.version, dep.version)) {
          errors.push({
            pluginId: plugin.id,
            error: `Dependency ${dep.id}@${depPlugin.version} does not satisfy ${dep.version}`,
            remediation: `Update ${dep.id} to version ${dep.version}`,
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Topological sort for load order
   */
  topoSort(): PluginBrief[] {
    const visited = new Set<string>();
    const temp = new Set<string>();
    const result: PluginBrief[] = [];

    const visit = (id: string) => {
      if (temp.has(id)) {
        // Cycle detected, skip
        return;
      }
      if (visited.has(id)) {
        return;
      }

      temp.add(id);

      const deps = this.graph.get(id);
      if (deps) {
        for (const depId of deps) {
          visit(depId);
        }
      }

      temp.delete(id);
      visited.add(id);

      const plugin = this.plugins.get(id);
      if (plugin) {
        result.push(plugin);
      }
    };

    for (const id of this.plugins.keys()) {
      if (!visited.has(id)) {
        visit(id);
      }
    }

    return result;
  }

  /**
   * Detect circular dependencies
   */
  private detectCycles(): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const path: string[] = [];

    const dfs = (id: string): boolean => {
      visited.add(id);
      recStack.add(id);
      path.push(id);

      const deps = this.graph.get(id);
      if (deps) {
        for (const depId of deps) {
          if (!visited.has(depId)) {
            if (dfs(depId)) {
              return true;
            }
          } else if (recStack.has(depId)) {
            // Cycle found
            const cycleStart = path.indexOf(depId);
            const cycle = path.slice(cycleStart);
            cycle.push(depId);
            cycles.push(cycle);
            return true;
          }
        }
      }

      path.pop();
      recStack.delete(id);
      return false;
    };

    for (const id of this.plugins.keys()) {
      if (!visited.has(id)) {
        dfs(id);
      }
    }

    return cycles;
  }
}

