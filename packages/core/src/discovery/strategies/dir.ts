/**
 * @module @kb-labs/cli-core/discovery/strategies/dir
 * Directory strategy - discover plugins from .kb/plugins/
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { glob } from 'glob';
import type { DiscoveryStrategy, DiscoveryResult } from '../types.js';
import type { PluginBrief } from '../../registry/plugin-registry.js';

/**
 * Directory discovery strategy (.kb/plugins/)
 */
export class DirStrategy implements DiscoveryStrategy {
  name = 'dir' as const;
  priority = 3;

  async discover(roots: string[]): Promise<DiscoveryResult> {
    const plugins: PluginBrief[] = [];
    const manifests = new Map();
    const errors: Array<{ path: string; error: string }> = [];

    for (const root of roots) {
      const pluginsDir = path.join(root, '.kb', 'plugins');
      if (!fs.existsSync(pluginsDir)) {
        continue;
      }

      try {
        // Find all manifest files in .kb/plugins/
        const manifestFiles = await glob('**/manifest.{js,mjs,cjs,ts}', {
          cwd: pluginsDir,
          absolute: true,
        });

        for (const manifestPath of manifestFiles) {
          try {
            // Extract plugin ID from directory structure
            const relativePath = path.relative(pluginsDir, manifestPath);
            const pluginDir = path.dirname(relativePath);
            const pluginId = pluginDir.replace(/\\/g, '/').replace(/\/manifest\.(js|mjs|cjs|ts)$/, '');

            // Try to find package.json for version info
            const pkgPath = path.join(path.dirname(manifestPath), 'package.json');
            let version = '0.0.0';
            let display: any = {};

            if (fs.existsSync(pkgPath)) {
              const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
              version = pkg.version || '0.0.0';
              display = {
                name: pkg.kbLabs?.name || pkg.name,
                description: pkg.kbLabs?.description || pkg.description,
              };
            }

            plugins.push({
              id: pluginId,
              version,
              kind: 'v2',
              source: {
                kind: 'dir',
                path: manifestPath,
              },
              display,
            });
          } catch (error) {
            errors.push({
              path: manifestPath,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      } catch (error) {
        errors.push({
          path: pluginsDir,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { plugins, manifests, errors };
  }
}

