/**
 * @module @kb-labs/cli-core/generators/studio-registry
 * Studio registry generation for UI consumption
 */

import type { ManifestV2 } from '@kb-labs/plugin-manifest';
import type { PluginBrief } from '../registry/plugin-registry.js';

/**
 * Studio registry entry
 */
export interface StudioRegistryEntry {
  id: string;
  version: string;
  display: {
    name: string;
    description?: string;
    icon?: string;
    category?: string;
  };
  capabilities: {
    hasCommands?: boolean;
    hasRestAPI?: boolean;
    hasUI?: boolean;
    hasJobs?: boolean;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Studio registry (aggregated)
 */
export interface StudioRegistry {
  version: string;
  generated: string;
  plugins: StudioRegistryEntry[];
}

/**
 * Generate studio registry from plugins
 * @param plugins - List of plugin briefs
 * @param manifests - Map of manifests
 * @returns Studio registry
 */
export function generateStudioRegistry(
  plugins: PluginBrief[],
  manifests: Map<string, ManifestV2>
): StudioRegistry {
  const entries: StudioRegistryEntry[] = [];

  for (const plugin of plugins) {
    const manifest = manifests.get(plugin.id);
    
    entries.push({
      id: plugin.id,
      version: plugin.version,
      display: {
        name: plugin.display?.name || plugin.id,
        description: plugin.display?.description,
      },
      capabilities: {
        hasCommands: !!(manifest?.cli?.commands && manifest.cli.commands.length > 0),
        hasRestAPI: !!(manifest?.rest?.routes && manifest.rest.routes.length > 0),
        hasUI: !!(manifest?.studio),
        hasJobs: false,
      },
    });
  }

  return {
    version: '1.0.0',
    generated: new Date().toISOString(),
    plugins: entries.sort((a, b) => a.id.localeCompare(b.id)),
  };
}

