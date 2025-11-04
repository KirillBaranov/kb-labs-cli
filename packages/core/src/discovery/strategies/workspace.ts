/**
 * @module @kb-labs/cli-core/discovery/strategies/workspace
 * Workspace strategy - discover plugins from pnpm/yarn workspaces
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { glob } from 'glob';
import type { DiscoveryStrategy, DiscoveryResult } from '../types.js';
import type { PluginBrief } from '../../registry/plugin-registry.js';

/**
 * Find workspace root by looking for pnpm-workspace.yaml or similar
 */
function findWorkspaceRoot(startDir: string): string | null {
  let current = startDir;
  const root = path.parse(current).root;

  while (current !== root) {
    // Check for workspace files
    const pnpmWorkspace = path.join(current, 'pnpm-workspace.yaml');
    const yarnWorkspace = path.join(current, 'package.json');
    
    if (fs.existsSync(pnpmWorkspace)) {
      return current;
    }
    
    // Check if package.json has workspaces field (yarn/npm)
    if (fs.existsSync(yarnWorkspace)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(yarnWorkspace, 'utf8'));
        if (pkg.workspaces) {
          return current;
        }
      } catch {
        // ignore
      }
    }
    
    current = path.dirname(current);
  }
  
  return null;
}

/**
 * Workspace discovery strategy
 */
export class WorkspaceStrategy implements DiscoveryStrategy {
  name = 'workspace' as const;
  priority = 1;

  async discover(roots: string[]): Promise<DiscoveryResult> {
    const plugins: PluginBrief[] = [];
    const manifests = new Map();
    const errors: Array<{ path: string; error: string }> = [];

    for (const root of roots) {
      const workspaceRoot = findWorkspaceRoot(root);
      if (!workspaceRoot) {
        continue;
      }

      // Read workspace config
      const pnpmWorkspacePath = path.join(workspaceRoot, 'pnpm-workspace.yaml');
      if (!fs.existsSync(pnpmWorkspacePath)) {
        continue;
      }

      try {
        const content = fs.readFileSync(pnpmWorkspacePath, 'utf8');
        const config = parseYaml(content);
        const patterns = config?.packages || [];

        // Find all package.json files matching patterns
        for (const pattern of patterns) {
          const pkgPattern = path.join(workspaceRoot, pattern, 'package.json');
          const pkgFiles = await glob(pkgPattern, { absolute: true });

          for (const pkgFile of pkgFiles) {
            try {
              const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
              
              // Check for manifest in package.json
              if (pkg.kbLabs?.manifest) {
                const manifestPath = path.resolve(path.dirname(pkgFile), pkg.kbLabs.manifest);
                if (fs.existsSync(manifestPath)) {
                  // TODO: Load and parse manifest
                  // For now, create a basic entry
                  plugins.push({
                    id: pkg.name || path.basename(path.dirname(pkgFile)),
                    version: pkg.version || '0.0.0',
                    kind: 'v2',
                    source: {
                      kind: 'workspace',
                      path: manifestPath,
                    },
                    display: {
                      name: pkg.kbLabs?.name || pkg.name,
                      description: pkg.kbLabs?.description || pkg.description,
                    },
                  });
                }
              }
            } catch (error) {
              errors.push({
                path: pkgFile,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        }
      } catch (error) {
        errors.push({
          path: pnpmWorkspacePath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { plugins, manifests, errors };
  }
}

