/**
 * plugins:discovery-test command - Test new DiscoveryManager with debug logs
 */

import { defineSystemCommand, type CommandResult, type FlagSchemaDefinition } from '@kb-labs/cli-command-kit';
import { PluginRegistry } from '@kb-labs/cli-core';
import { getContextCwd } from '@kb-labs/shared-cli-ui';

type PluginsDiscoveryTestResult = CommandResult & {
  plugins?: Array<{
    id: string;
    version: string;
    source: any;
    display: string;
  }>;
  manifests?: Array<{
    id: string;
    manifestId: string;
    version: string;
  }>;
  total?: number;
};

type PluginsDiscoveryTestFlags = {
  json: { type: 'boolean'; description?: string };
};

export const pluginsDiscoveryTest = defineSystemCommand<PluginsDiscoveryTestFlags, PluginsDiscoveryTestResult>({
  name: 'plugins:discovery-test',
  description: 'Test new DiscoveryManager with debug logs',
  category: 'system',
  examples: ['kb plugins:discovery-test', 'kb plugins:discovery-test --json', 'kb plugins:discovery-test --debug'],
  flags: {
    json: { type: 'boolean', description: 'Output in JSON format' },
  },
  analytics: {
    command: 'plugins:discovery-test',
    startEvent: 'PLUGINS_DISCOVERY_TEST_STARTED',
    finishEvent: 'PLUGINS_DISCOVERY_TEST_FINISHED',
  },
  async handler(ctx, argv, flags) {
    const cwd = getContextCwd(ctx);

    ctx.logger?.info('Plugins discovery test started', { cwd });

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

    ctx.logger?.info('Plugins discovery test completed', {
      pluginsCount: plugins.length,
      manifestsCount: manifestEntries.length,
    });

    return {
      ok: true,
      plugins: plugins.map((p) => ({
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
    };
  },
  formatter(result, ctx, flags) {
    if (flags.json) { // Type-safe: boolean
      ctx.output?.json(result);
    } else {
      const plugins = result.plugins ?? [];
      const manifests = result.manifests ?? [];

      ctx.output?.write(`Found ${plugins.length} plugins via new DiscoveryManager:\n`);
      for (const plugin of plugins) {
        ctx.output?.write(`  • ${plugin.id} v${plugin.version} (${plugin.source?.kind ?? 'unknown'}: ${plugin.source?.path ?? 'unknown'})\n`);
      }

      ctx.output?.write(`\nFound ${manifests.length} manifests:\n`);
      for (const manifest of manifests) {
        ctx.output?.write(`  • ${manifest.id} → manifest.id=${manifest.manifestId}\n`);
      }
    }
  },
});

