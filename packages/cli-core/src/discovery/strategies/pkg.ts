/**
 * @module @kb-labs/cli-core/discovery/strategies/pkg
 * Package strategy - discover plugins from package.json#kbLabs
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ManifestV2 } from '@kb-labs/plugin-manifest';
import { detectManifestVersion } from '@kb-labs/plugin-manifest';
import type { DiscoveryStrategy, DiscoveryResult } from '../types';
import { safeImport, isImportTimeout } from '../utils/safe-import.js';
import type { PluginBrief } from '../../registry/plugin-registry';
import { getLogger } from '@kb-labs/core-sys/logging';

const logger = getLogger('PkgStrategy');

/**
 * Package.json discovery strategy
 */
export class PkgStrategy implements DiscoveryStrategy {
  name = 'pkg' as const;
  priority = 2;

  async discover(roots: string[]): Promise<DiscoveryResult> {
    logger.debug('Starting discovery', { roots });
    const plugins: PluginBrief[] = [];
    const manifests = new Map();
    const errors: Array<{ path: string; error: string }> = [];

    for (const root of roots) {
      logger.debug('Checking root', { root });
      const pkgPath = path.join(root, 'package.json');
      if (!fs.existsSync(pkgPath)) {
        logger.debug('package.json not found', { pkgPath });
        continue;
      }
      logger.debug('Found package.json', { pkgPath });

      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        
        // Check for manifest path in kbLabs.manifest or kb.manifest
        const manifestPathRel = pkg.kbLabs?.manifest || pkg.kb?.manifest;
        const pkgName = pkg.name || path.basename(root);
        logger.debug('Checking package', { pkgName, root });
        if (manifestPathRel) {
          const manifestPath = path.resolve(root, manifestPathRel);
          logger.debug('Found manifest path', { manifestPathRel, manifestPath });
          if (fs.existsSync(manifestPath)) {
            logger.debug('Manifest file exists', { manifestPath });
            try {
              // Load and parse manifest with timeout protection
              logger.debug('Attempting dynamic import', { manifestPath });
              const manifestModule = await safeImport(manifestPath);
              logger.debug('Dynamic import successful', { manifestPath });
              const manifestData: unknown = manifestModule.default || manifestModule.manifest || manifestModule;
              const version = detectManifestVersion(manifestData);
              
              if (version === 'v2') {
                const manifest = manifestData as ManifestV2;
                const pluginId = manifest.id || pkg.name || path.basename(root);
                const pluginDir = path.dirname(manifestPath);

                plugins.push({
                  id: pluginId,
                  version: manifest.version || pkg.version || '0.0.0',
                  kind: 'v2',
                  source: {
                    kind: 'pkg',
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
              const errorMessage = error instanceof Error ? error.message : String(error);

              if (isImportTimeout(error)) {
                logger.warn('Manifest import timed out (skipping)', {
                  manifestPath,
                  timeout: '5s',
                  suggestion: 'This manifest may have circular dependencies or top-level await issues'
                });
              } else {
                logger.error('Error loading manifest', {
                  manifestPath,
                  error: errorMessage,
                  stack: error instanceof Error ? error.stack : undefined
                });
              }

              errors.push({
                path: manifestPath,
                error: errorMessage,
              });
            }
          } else {
            logger.warn('Manifest file not found', { manifestPath });
            errors.push({
              path: manifestPath,
              error: 'Manifest file not found',
            });
          }
        } else {
          logger.debug('No manifest path in package.json', { pkgName });
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
                const pluginManifestPathRel = pluginPkg.kbLabs?.manifest || pluginPkg.kb?.manifest;
                if (pluginManifestPathRel) {
                  const pluginManifestPath = path.resolve(resolvedPath, pluginManifestPathRel);
                  if (fs.existsSync(pluginManifestPath)) {
                    try {
                      // Load and parse manifest with timeout protection
                      logger.debug('Attempting dynamic import (nested plugin)', { pluginManifestPath });
                      const manifestModule = await safeImport(pluginManifestPath);
                      logger.debug('Dynamic import successful (nested plugin)', { pluginManifestPath });
                      const manifestData: unknown = manifestModule.default || manifestModule.manifest || manifestModule;
                      const version = detectManifestVersion(manifestData);
                      
                      if (version === 'v2') {
                        const manifest = manifestData as ManifestV2;
                        const pluginId = manifest.id || pluginPkg.name || path.basename(resolvedPath);
                        const pluginDir = path.dirname(pluginManifestPath);

                        plugins.push({
                          id: pluginId,
                          version: manifest.version || pluginPkg.version || '0.0.0',
                          kind: 'v2',
                          source: {
                            kind: 'pkg',
                            path: pluginDir,
                          },
                          display: {
                            name: manifest.display?.name || pluginPkg.kbLabs?.name || pluginPkg.name,
                            description: manifest.display?.description || pluginPkg.kbLabs?.description || pluginPkg.description,
                          },
                        });
                        
                        // Store manifest
                        manifests.set(pluginId, manifest);
                      }
                    } catch (error) {
                      errors.push({
                        path: pluginManifestPath,
                        error: error instanceof Error ? error.message : String(error),
                      });
                    }
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

