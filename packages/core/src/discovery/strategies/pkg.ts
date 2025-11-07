/**
 * @module @kb-labs/cli-core/discovery/strategies/pkg
 * Package strategy - discover plugins from package.json#kbLabs
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ManifestV2 } from '@kb-labs/plugin-manifest';
import { detectManifestVersion } from '@kb-labs/plugin-manifest';
import type { DiscoveryStrategy, DiscoveryResult } from '../types.js';
import type { PluginBrief } from '../../registry/plugin-registry.js';

/**
 * Package.json discovery strategy
 */
export class PkgStrategy implements DiscoveryStrategy {
  name = 'pkg' as const;
  priority = 2;

  async discover(roots: string[]): Promise<DiscoveryResult> {
    console.log(`[PkgStrategy] Starting discovery with roots: ${roots.join(', ')}`);
    const plugins: PluginBrief[] = [];
    const manifests = new Map();
    const errors: Array<{ path: string; error: string }> = [];

    for (const root of roots) {
      console.log(`[PkgStrategy] Checking root: ${root}`);
      const pkgPath = path.join(root, 'package.json');
      if (!fs.existsSync(pkgPath)) {
        console.log(`[PkgStrategy] package.json not found at ${pkgPath}`);
        continue;
      }
      console.log(`[PkgStrategy] Found package.json at ${pkgPath}`);

      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        
        // Check for manifest path in kbLabs.manifest or kb.manifest
        const manifestPathRel = pkg.kbLabs?.manifest || pkg.kb?.manifest;
        console.log(`[PkgStrategy] Checking package ${pkg.name || path.basename(root)} at ${root}`);
        if (manifestPathRel) {
          const manifestPath = path.resolve(root, manifestPathRel);
          console.log(`[PkgStrategy] Found manifest path: ${manifestPathRel} -> ${manifestPath}`);
          if (fs.existsSync(manifestPath)) {
            console.log(`[PkgStrategy] Manifest file exists: ${manifestPath}`);
            try {
              // Load and parse manifest
              const manifestModule = await import(manifestPath);
              const manifestData: unknown = manifestModule.default || manifestModule.manifest || manifestModule;
              const version = detectManifestVersion(manifestData);
              
              if (version === 'v2') {
                const manifest = manifestData as ManifestV2;
                const pluginId = manifest.id || pkg.name || path.basename(root);
                
                plugins.push({
                  id: pluginId,
                  version: manifest.version || pkg.version || '0.0.0',
                  kind: 'v2',
                  source: {
                    kind: 'pkg',
                    path: manifestPath,
                  },
                  display: {
                    name: manifest.display?.name || pkg.kbLabs?.name || pkg.name,
                    description: manifest.display?.description || pkg.kbLabs?.description || pkg.description,
                  },
                });
                
                // Store manifest
                manifests.set(pluginId, manifest);
                console.log(`[PkgStrategy] Successfully loaded manifest for plugin ${pluginId}`);
              } else {
                console.log(`[PkgStrategy] Manifest is not V2, skipping`);
              }
            } catch (error) {
              console.error(`[PkgStrategy] Error loading manifest from ${manifestPath}:`, error);
              errors.push({
                path: manifestPath,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          } else {
            console.warn(`[PkgStrategy] Manifest file not found: ${manifestPath}`);
            errors.push({
              path: manifestPath,
              error: 'Manifest file not found',
            });
          }
        } else {
          console.log(`[PkgStrategy] No manifest path in package.json for ${pkg.name || path.basename(root)}`);
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
                      // Load and parse manifest
                      const manifestModule = await import(pluginManifestPath);
                      const manifestData: unknown = manifestModule.default || manifestModule.manifest || manifestModule;
                      const version = detectManifestVersion(manifestData);
                      
                      if (version === 'v2') {
                        const manifest = manifestData as ManifestV2;
                        const pluginId = manifest.id || pluginPkg.name || path.basename(resolvedPath);
                        
                        plugins.push({
                          id: pluginId,
                          version: manifest.version || pluginPkg.version || '0.0.0',
                          kind: 'v2',
                          source: {
                            kind: 'pkg',
                            path: pluginManifestPath,
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

