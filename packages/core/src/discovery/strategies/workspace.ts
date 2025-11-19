/**
 * @module @kb-labs/cli-core/discovery/strategies/workspace
 * Workspace strategy - discover plugins from pnpm/yarn workspaces
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { glob } from 'glob';
import type { ManifestV2 } from '@kb-labs/plugin-manifest';
import { detectManifestVersion } from '@kb-labs/plugin-manifest';
import { getLogger } from '@kb-labs/core-sys/logging';
import type { DiscoveryStrategy, DiscoveryResult } from '../types.js';
import type { PluginBrief } from '../../registry/plugin-registry.js';

const logger = getLogger('WorkspaceStrategy');

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
    logger.debug('Starting discovery', { roots });
    const plugins: PluginBrief[] = [];
    const manifests = new Map();
    const errors: Array<{ path: string; error: string }> = [];

    for (const root of roots) {
      logger.debug('Checking root', { root });
      const workspaceRoot = findWorkspaceRoot(root);
      if (!workspaceRoot) {
        logger.debug('No workspace root found', { root });
        continue;
      }
      logger.debug('Found workspace root', { workspaceRoot });

      // Read workspace config
      const pnpmWorkspacePath = path.join(workspaceRoot, 'pnpm-workspace.yaml');
      if (!fs.existsSync(pnpmWorkspacePath)) {
        logger.debug('pnpm-workspace.yaml not found', { pnpmWorkspacePath });
        continue;
      }
      logger.debug('Found pnpm-workspace.yaml', { pnpmWorkspacePath });

      try {
        const content = fs.readFileSync(pnpmWorkspacePath, 'utf8');
        const config = parseYaml(content);
        const patterns = config?.packages || [];

        // Find all package.json files matching patterns
        for (const pattern of patterns) {
          const pkgPattern = path.join(workspaceRoot, pattern, 'package.json');
          const pkgFiles = await glob(pkgPattern, { absolute: true });
          logger.debug('Found package.json files for pattern', { count: pkgFiles.length, pattern });

          for (const pkgFile of pkgFiles) {
            try {
              const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
              const pkgName = pkg.name || path.basename(path.dirname(pkgFile));
              logger.debug('Checking package', { pkgName, pkgFile });
              
              // Check for manifest in package.json (support both kb.manifest and kbLabs.manifest)
              const manifestPathRel = pkg.kbLabs?.manifest || pkg.kb?.manifest;
              if (manifestPathRel) {
                const manifestPath = path.resolve(path.dirname(pkgFile), manifestPathRel);
                logger.debug('Found manifest path', { manifestPathRel, manifestPath });
                if (fs.existsSync(manifestPath)) {
                  logger.debug('Manifest file exists', { manifestPath });
                  try {
                    // Load and parse manifest
                    const manifestModule = await import(manifestPath);
                    const manifestData: unknown = manifestModule.default || manifestModule.manifest || manifestModule;
                    const version = detectManifestVersion(manifestData);
                    
                    if (version === 'v2') {
                      const manifest = manifestData as ManifestV2;
                      const pluginId = manifest.id || pkg.name || path.basename(path.dirname(pkgFile));
                      
                      const pluginDir = path.dirname(manifestPath)

                      plugins.push({
                        id: pluginId,
                        version: manifest.version || pkg.version || '0.0.0',
                        kind: 'v2',
                        source: {
                          kind: 'workspace',
                          path: pluginDir,
                        },
                        display: {
                          name: manifest.display?.name || pkg.kbLabs?.name || pkg.name,
                          description: manifest.display?.description || pkg.kbLabs?.description || pkg.description,
                        },
                      });
                      
                      // Store manifest
                      manifests.set(pluginId, manifest);
                      logger.debug('Successfully loaded manifest for plugin', { pluginId });
                    } else {
                      logger.debug('Manifest is not V2, skipping', { manifestPath });
                    }
                  } catch (error) {
                    logger.error('Error loading manifest', { 
                      manifestPath,
                      error: error instanceof Error ? error.message : String(error),
                      stack: error instanceof Error ? error.stack : undefined
                    });
                    errors.push({
                      path: manifestPath,
                      error: error instanceof Error ? error.message : String(error),
                    });
                  }
                } else {
                  // Manifest path specified but file doesn't exist
                  logger.warn('Manifest file not found', { manifestPath });
                  errors.push({
                    path: manifestPath,
                    error: 'Manifest file not found',
                  });
                }
              } else {
                logger.debug('No manifest path in package.json', { pkgName });
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

