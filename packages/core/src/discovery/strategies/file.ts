/**
 * @module @kb-labs/cli-core/discovery/strategies/file
 * File strategy - discover plugins from explicit file paths
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
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
        // Extract plugin ID from filename or parent directory
        const filename = path.basename(manifestPath, path.extname(manifestPath));
        const pluginDir = path.dirname(manifestPath);
        const pluginId = filename === 'manifest' || filename === 'index'
          ? path.basename(pluginDir)
          : filename;

        // Try to find package.json for version info
        const pkgPath = path.join(pluginDir, 'package.json');
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
            kind: 'file',
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

    return { plugins, manifests, errors };
  }
}

