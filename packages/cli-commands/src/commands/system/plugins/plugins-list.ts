/**
 * plugins:list command - List all discovered CLI plugins
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit';
import { generateExamples } from '../../../utils/generate-examples';
import type { RegisteredCommand } from '../../../registry/types';
import { registry } from '../../../registry/service';
import { PluginRegistry } from '@kb-labs/cli-core';
import { formatTable, type TableColumn, type SectionContent, safeColors } from '@kb-labs/shared-cli-ui';
import { loadPluginsState, isPluginEnabled } from '../../../registry/plugins-state';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getContextCwd } from '@kb-labs/shared-cli-ui';

type _PluginInfo = {
  name: string;
  namespace: string;
  version: string;
  source: string;
  enabled: boolean;
  state: 'enabled' | 'disabled' | 'error' | 'outdated' | 'linked';
  commands: Array<{
    id: string;
    aliases: string[];
    describe: string;
    available: boolean;
    shadowed: boolean;
    reason?: string;
  }>;
};

type PluginsListFlags = {
  json: { type: 'boolean'; description?: string };
};

type PluginsListResult = CommandResult & {
  message: string;
  sections: SectionContent[];
  json: {
    plugins: Array<{
      name: string;
      namespace: string;
      version: string;
      source: string;
      enabled: boolean;
      state: string;
      commands: Array<{ id: string; aliases: string[]; describe: string; available: boolean; shadowed: boolean; reason?: string }>;
    }>;
    total: number;
    enabled: number;
    disabled: number;
    products: number;
  };
};

export const pluginsList = defineSystemCommand<PluginsListFlags, PluginsListResult>({
  name: 'list',
  description: 'List all discovered CLI plugins',
  category: 'plugins',
  // Type-safe examples using generateExamples()
  examples: generateExamples('list', 'plugins', [
    { flags: {} },  // kb plugins list
    { flags: { json: true } },  // kb plugins list --json
  ]),
  flags: {
    json: { type: 'boolean', description: 'Output in JSON format' },
  },
  analytics: {
    command: 'plugins:list',
    startEvent: 'PLUGINS_LIST_STARTED',
    finishEvent: 'PLUGINS_LIST_FINISHED',
  },
  async handler(ctx, _argv, _flags) {
    const cwd = getContextCwd(ctx);

      
      // Use new DiscoveryManager via PluginRegistry
      const pluginRegistry = new PluginRegistry({
        strategies: ['workspace', 'pkg', 'dir', 'file'],
        roots: [cwd],
      });
      await pluginRegistry.refresh();
      
      const manifests = registry.listManifests();
      const productGroups = registry.listProductGroups();
      const state = await loadPluginsState(cwd);
      
      // Also get plugins from new registry for comparison
      const _newRegistryPlugins = pluginRegistry.list();
      
      // Group by package name
      const packages = new Map<string, {
        name: string;
        namespace: string;
        version: string;
        source: string;
        enabled: boolean;
        commands: RegisteredCommand[];
        state: 'enabled' | 'disabled' | 'error' | 'outdated' | 'linked';
      }>();
      
      for (const cmd of manifests) {
        const pkgName = cmd.manifest.package || cmd.manifest.group;
        const namespace = cmd.manifest.namespace || cmd.manifest.group;
        
        if (!packages.has(pkgName)) {
          // Try to get version from package.json
          let version = 'unknown';
          // First try from pkgRoot (workspace/linked plugins)
          if (cmd.pkgRoot) {
            try {
              const pkgPath = path.join(cmd.pkgRoot, 'package.json');
              const pkgJson = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
              version = pkgJson.version || 'unknown';
            } catch {}
          }
          
          // If not found, try node_modules
          if (version === 'unknown') {
            try {
              const pkgPath = path.join(cwd, 'node_modules', pkgName, 'package.json');
              const pkgJson = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
              version = pkgJson.version || 'unknown';
            } catch {
              // Try workspace root/packages structure
              try {
                const pkgPath = path.join(cwd, 'packages', namespace.replace('@kb-labs/', '').replace('-cli', ''), 'package.json');
                const pkgJson = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
                version = pkgJson.version || 'unknown';
              } catch {
                // Try finding in parent workspace
                try {
                  const workspaceRoot = path.resolve(cwd, '..');
                  const pkgDirs = await fs.readdir(path.join(workspaceRoot, 'packages'), { withFileTypes: true });
                  for (const dir of pkgDirs) {
                    if (dir.isDirectory()) {
                      try {
                        const pkgPath = path.join(workspaceRoot, 'packages', dir.name, 'package.json');
                        const pkgJson = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
                        if (pkgJson.name === pkgName) {
                          version = pkgJson.version || 'unknown';
                          break;
                        }
                      } catch {}
                    }
                  }
                } catch {}
              }
            }
          }
          
          const enabled = isPluginEnabled(state, pkgName, cmd.source === 'workspace' || cmd.source === 'linked');
          let pluginState: 'enabled' | 'disabled' | 'error' | 'outdated' | 'linked' = enabled ? 'enabled' : 'disabled';
          
          if (cmd.source === 'linked') {
            pluginState = 'linked';
          } else if (!cmd.available) {
            pluginState = 'error';
          }
          
          packages.set(pkgName, {
            name: pkgName,
            namespace,
            version,
            source: cmd.source,
            enabled,
            commands: [],
            state: pluginState,
          });
        }
        
        packages.get(pkgName)!.commands.push(cmd);
      }
      
    const packageList = Array.from(packages.values()).sort((a, b) => a.name.localeCompare(b.name));
    const output = packageList.map((pkg) => ({
      name: pkg.name,
      namespace: pkg.namespace,
      version: pkg.version,
      source: pkg.source,
      enabled: pkg.enabled,
      state: pkg.state,
      commands: pkg.commands.map((cmd) => ({
        id: cmd.manifest.id,
        aliases: cmd.manifest.aliases || [],
        describe: cmd.manifest.describe,
        available: cmd.available,
        shadowed: cmd.shadowed,
        ...(cmd.unavailableReason && { reason: cmd.unavailableReason }),
      })),
    }));

    const totalPlugins = output.length;
    const enabledCount = output.filter((p) => p.enabled).length;
    const disabledCount = output.filter((p) => !p.enabled).length;
    const linkedCount = packageList.filter((p) => p.state === 'linked').length;

    ctx.platform?.logger?.info('Plugins list completed', {
      total: totalPlugins,
      enabled: enabledCount,
      disabled: disabledCount,
      products: productGroups.length,
    });

    // Build sections for modern UI
    const sections: SectionContent[] = [];

    // Summary section
    sections.push({
      header: 'Summary',
      items: [
        `${safeColors.bold('Total')}: ${totalPlugins} plugins`,
        `${safeColors.bold('Enabled')}: ${enabledCount}`,
        `${safeColors.bold('Disabled')}: ${disabledCount}`,
        `${safeColors.bold('Linked')}: ${linkedCount}`,
        `${safeColors.bold('Commands')}: ${manifests.length} total`,
      ],
    });

    // Prepare table data for plugins
    const stateIcons: Record<string, string> = {
      enabled: '✅',
      disabled: '⏸',
      error: '❌',
      outdated: '⚠',
      linked: '🧩',
    };

    const columns: TableColumn[] = [
      { header: 'Plugin', align: 'left' },
      { header: 'NS', align: 'left' },
      { header: 'Version', align: 'left' },
      { header: 'Source', align: 'left' },
      { header: 'State', align: 'left' },
      { header: 'Cmds', align: 'right' },
    ];

    const tableRows: string[][] = packageList.map((pkg) => {
      const stateIcon = stateIcons[pkg.state] || '❓';
      const name = pkg.name.length > 26 ? pkg.name.substring(0, 23) + '...' : pkg.name;
      const sourceLabel =
        pkg.source === 'workspace' ? 'workspace' : pkg.source === 'linked' ? 'linked' : 'node_modules';
      const stateDisplay = `${stateIcon} ${pkg.state}`;

      return [name, pkg.namespace, pkg.version, sourceLabel, stateDisplay, String(pkg.commands.length)];
    });

    const tableLines = formatTable(columns, tableRows, { separator: '─', padding: 2 });

    // Add error details if any
    const errorLines: string[] = [];
    for (const pkg of packageList) {
      const hasErrors = pkg.commands.some((c) => !c.available || c.shadowed);
      if (hasErrors) {
        for (const cmd of pkg.commands) {
          if (!cmd.available) {
            errorLines.push(
              `  ${safeColors.muted('❌')} ${cmd.manifest.id}: ${cmd.unavailableReason || 'unavailable'}`,
            );
            if (cmd.hint) {
              errorLines.push(`     ${safeColors.warning(`Hint: ${cmd.hint}`)}`);
            }
          }
          if (cmd.shadowed) {
            errorLines.push(`  ${safeColors.muted('⚠')} ${cmd.manifest.id}: shadowed`);
          }
        }
      }
    }

    const pluginsItems = [...tableLines];
    if (errorLines.length > 0) {
      pluginsItems.push('', ...errorLines);
    }

    sections.push({
      header: 'Plugins',
      items: pluginsItems,
    });

    // Next Steps section
    sections.push({
      header: 'Next Steps',
      items: [
        `kb plugins enable <name>  ${safeColors.muted('Enable a plugin')}`,
        `kb plugins disable <name>  ${safeColors.muted('Disable a plugin')}`,
        `kb plugins doctor  ${safeColors.muted('Diagnose plugin issues')}`,
        `kb plugins --json  ${safeColors.muted('Get machine-readable output')}`,
      ],
    });

    return {
      ok: true,
      status: 'success',
      message: `Found ${totalPlugins} plugins (${enabledCount} enabled, ${disabledCount} disabled)`,
      sections,
      json: {
        plugins: output,
        total: totalPlugins,
        enabled: enabledCount,
        disabled: disabledCount,
        products: productGroups.length,
      },
    };
  },
  formatter(result, ctx, flags) {
    // Auto-handle JSON mode
    if (flags.json) {
      console.log(JSON.stringify(result.json, null, 2));
    } else {
      ctx.ui.info('KB Labs CLI Plugins', { sections: result.sections });
    }
  },
});

