/**
 * @module @kb-labs/cli-core/discovery/strategies/file
 * File strategy - discover plugins from explicit file paths
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ManifestV2 } from '@kb-labs/plugin-manifest';
import { detectManifestVersion } from '@kb-labs/plugin-manifest';
import type { DiscoveryStrategy, DiscoveryResult } from '../types.js';
import type { PluginBrief } from '../../registry/plugin-registry.js';

/**
 * File discovery strategy (explicit paths)
 */
export class FileStrategy implements DiscoveryStrategy {
  name = 'file' as const;
  priority = 4;

  async discover(roots: string[]): Promise<DiscoveryResult> {
    const plugins: PluginBrief[] = [];
    const manifests = new Map();
    const errors: Array<{ path: string; error: string }> = [];

    for (const manifestPath of roots) {
      // Only process if it looks like a file path
      if (!fs.existsSync(manifestPath) || !fs.statSync(manifestPath).isFile()) {
        continue;
      }

      try {
        // Load and parse manifest
        const manifestModule = await import(manifestPath);
        const manifestData: unknown = manifestModule.default || manifestModule.manifest || manifestModule;
        const version = detectManifestVersion(manifestData);
        
        if (version === 'v2') {
          const manifest = manifestData as ManifestV2;
          const pluginId = manifest.id || path.basename(path.dirname(manifestPath));
          
          // Try to find package.json for additional info
          const pluginDir = path.dirname(manifestPath);
          const pkgPath = path.join(pluginDir, 'package.json');
          let display: any = {};

          if (fs.existsSync(pkgPath)) {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            display = {
              name: manifest.display?.name || pkg.kbLabs?.name || pkg.name,
              description: manifest.display?.description || pkg.kbLabs?.description || pkg.description,
            };
          } else {
            display = {
              name: manifest.display?.name,
              description: manifest.display?.description,
            };
          }

          plugins.push({
            id: pluginId,
            version: manifest.version || '0.0.0',
            kind: 'v2',
            source: {
              kind: 'file',
              path: manifestPath,
            },
            display,
          });
          
          // Store manifest
          manifests.set(pluginId, manifest);
        }
      } catch (error) {
        errors.push({
          path: manifestPath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { plugins, manifests, errors };
  }
}

