/**
 * @module @kb-labs/cli-core/discovery/strategies/pkg
 * Package strategy - discover plugins from package.json#kbLabs
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DiscoveryStrategy, DiscoveryResult } from '../types.js';
import type { PluginBrief } from '../../registry/plugin-registry.js';

/**
 * Package.json discovery strategy
 */
export class PkgStrategy implements DiscoveryStrategy {
  name = 'pkg' as const;
  priority = 2;

  async discover(roots: string[]): Promise<DiscoveryResult> {
    const plugins: PluginBrief[] = [];
    const manifests = new Map();
    const errors: Array<{ path: string; error: string }> = [];

    for (const root of roots) {
      const pkgPath = path.join(root, 'package.json');
      if (!fs.existsSync(pkgPath)) {
        continue;
      }

      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        
        // Check for manifest path in kbLabs.manifest
        if (pkg.kbLabs?.manifest) {
          const manifestPath = path.resolve(root, pkg.kbLabs.manifest);
          if (fs.existsSync(manifestPath)) {
            plugins.push({
              id: pkg.name || path.basename(root),
              version: pkg.version || '0.0.0',
              kind: 'v2',
              source: {
                kind: 'pkg',
                path: manifestPath,
              },
              display: {
                name: pkg.kbLabs?.name || pkg.name,
                description: pkg.kbLabs?.description || pkg.description,
              },
            });
          }
        }
        
        // Check for inline plugins list
        if (Array.isArray(pkg.kbLabs?.plugins)) {
          for (const pluginPath of pkg.kbLabs.plugins) {
            const resolvedPath = path.resolve(root, pluginPath);
            if (fs.existsSync(resolvedPath)) {
              // Try to find manifest in plugin directory
              const pluginPkgPath = path.join(resolvedPath, 'package.json');
              if (fs.existsSync(pluginPkgPath)) {
                const pluginPkg = JSON.parse(fs.readFileSync(pluginPkgPath, 'utf8'));
                if (pluginPkg.kbLabs?.manifest) {
                  const pluginManifestPath = path.resolve(resolvedPath, pluginPkg.kbLabs.manifest);
                  if (fs.existsSync(pluginManifestPath)) {
                    plugins.push({
                      id: pluginPkg.name || path.basename(resolvedPath),
                      version: pluginPkg.version || '0.0.0',
                      kind: 'v2',
                      source: {
                        kind: 'pkg',
                        path: pluginManifestPath,
                      },
                      display: {
                        name: pluginPkg.kbLabs?.name || pluginPkg.name,
                        description: pluginPkg.kbLabs?.description || pluginPkg.description,
                      },
                    });
                  }
                }
              }
            }
          }
        }
      } catch (error) {
        errors.push({
          path: pkgPath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { plugins, manifests, errors };
  }
}

