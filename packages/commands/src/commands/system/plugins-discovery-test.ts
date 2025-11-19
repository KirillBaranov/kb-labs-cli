/**
 * plugins:discovery-test command - Test new DiscoveryManager with debug logs
 */

import type { Command } from "../../types/types";
import { PluginRegistry } from "@kb-labs/cli-core";
import { getContextCwd } from "@kb-labs/shared-cli-ui";

export const pluginsDiscoveryTest: Command = {
  name: "plugins:discovery-test",
  category: "system",
  describe: "Test new DiscoveryManager with debug logs",
  flags: [
    {
      name: "json",
      type: "boolean",
      description: "Output in JSON format",
    },
  ],
  examples: [
    "kb plugins:discovery-test",
    "kb plugins:discovery-test --json",
    "kb plugins:discovery-test --debug",
  ],

  async run(ctx, argv, flags) {
    const cwd = getContextCwd(ctx);
    const jsonMode = !!flags.json;
    
    try {
      // Create PluginRegistry with new DiscoveryManager
      const pluginRegistry = new PluginRegistry({
        strategies: ['workspace', 'pkg', 'dir', 'file'],
        roots: [cwd],
      });
      
      // Refresh will trigger DiscoveryManager.discover() which uses our new logging
      await pluginRegistry.refresh();
      
      const plugins = pluginRegistry.list();
      
      // Get manifests by iterating plugins
      const manifestEntries: Array<[string, any]> = [];
      for (const plugin of plugins) {
        const manifest = pluginRegistry.getManifestV2(plugin.id);
        if (manifest) {
          manifestEntries.push([plugin.id, manifest]);
        }
      }
      
      if (jsonMode) {
        ctx.presenter.json({
          ok: true,
          plugins: plugins.map(p => ({
            id: p.id,
            version: p.version,
            source: p.source,
            display: p.display,
          })),
          manifests: manifestEntries.map(([id, manifest]) => ({
            id,
            manifestId: manifest.id,
            version: manifest.version,
          })),
          total: plugins.length,
        });
        return 0;
      }
      
      ctx.presenter.write(`Found ${plugins.length} plugins via new DiscoveryManager:\n`);
      for (const plugin of plugins) {
        ctx.presenter.write(`  • ${plugin.id} v${plugin.version} (${plugin.source.kind}: ${plugin.source.path})\n`);
      }
      
      ctx.presenter.write(`\nFound ${manifestEntries.length} manifests:\n`);
      for (const [id, manifest] of manifestEntries) {
        ctx.presenter.write(`  • ${id} → manifest.id=${manifest.id}\n`);
      }
      
      return 0;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (jsonMode) {
        ctx.presenter.json({ ok: false, error: errorMessage });
      } else {
        ctx.presenter.error(errorMessage);
      }
      return 1;
    }
  },
};

