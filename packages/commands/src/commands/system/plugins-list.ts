/**
 * plugins:list command - List all discovered CLI plugins
 */

import { defineSystemCommand, type CommandResult, type FlagSchemaDefinition } from '@kb-labs/cli-command-kit';
import type { RegisteredCommand } from '../../registry/types';
import { registry } from '../../registry/service';
import { PluginRegistry } from '@kb-labs/cli-core';
import { formatTiming, formatTable, type TableColumn } from '@kb-labs/shared-cli-ui';
import { loadPluginsState, isPluginEnabled } from '../../registry/plugins-state';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getContextCwd } from '@kb-labs/shared-cli-ui';

type PluginInfo = {
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

type PluginsListResult = CommandResult & {
  plugins?: PluginInfo[];
  total?: number;
  enabled?: number;
  disabled?: number;
  products?: number;
  packageList?: Array<{
    name: string;
    namespace: string;
    version: string;
    source: string;
    enabled: boolean;
    commands: RegisteredCommand[];
    state: 'enabled' | 'disabled' | 'error' | 'outdated' | 'linked';
  }>;
  manifests?: RegisteredCommand[];
  productGroups?: any[];
};

type PluginsListFlags = {
  json: { type: 'boolean'; description?: string };
};

export const pluginsList = defineSystemCommand<PluginsListFlags, PluginsListResult>({
  name: 'plugins',
  description: 'List all discovered CLI plugins',
  category: 'system',
  aliases: ['plugins:list', 'list'],
  examples: ['kb plugins list', 'kb plugins list --json', 'kb plugins --json'],
  flags: {
    json: { type: 'boolean', description: 'Output in JSON format' },
  },
  analytics: {
    command: 'plugins:list',
    startEvent: 'PLUGINS_LIST_STARTED',
    finishEvent: 'PLUGINS_LIST_FINISHED',
  },
  async handler(ctx, argv, flags) {
    const cwd = getContextCwd(ctx);

    ctx.tracker.checkpoint('discover');
      
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
      const newRegistryPlugins = pluginRegistry.list();
      
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

    ctx.logger?.info('Plugins list completed', {
      total: output.length,
      enabled: output.filter((p) => p.enabled).length,
      disabled: output.filter((p) => !p.enabled).length,
      products: productGroups.length,
    });

    return {
      ok: true,
      plugins: output,
      total: output.length,
      enabled: output.filter((p) => p.enabled).length,
      disabled: output.filter((p) => !p.enabled).length,
      products: productGroups.length,
      packageList,
      manifests,
      productGroups,
    };
  },
  formatter(result, ctx, flags) {
    if (flags.json) { // Type-safe: boolean
      ctx.output?.json({
        ok: true,
        plugins: result.plugins,
        total: result.total,
        enabled: result.enabled,
        disabled: result.disabled,
        products: result.products,
        timing: ctx.tracker.total(),
      });
      return;
    }

    if (!ctx.output || !result.packageList || !result.manifests) {
      throw new Error('Output not available');
    }

    const stateIcons: Record<string, string> = {
      enabled: '✅',
      disabled: '⏸',
      error: '❌',
      outdated: '⚠',
      linked: '🧩',
    };

    const summary = ctx.output.ui.keyValue({
      Total: `${result.packageList.length} plugins`,
      Enabled: `${result.enabled ?? 0}`,
      Disabled: `${result.disabled ?? 0}`,
      Linked: `${result.packageList.filter((p) => p.state === 'linked').length}`,
      Commands: `${result.manifests.length} total`,
    });

    // Prepare table data
    const columns: TableColumn[] = [
      { header: 'Plugin', align: 'left' },
      { header: 'NS', align: 'left' },
      { header: 'Version', align: 'left' },
      { header: 'Source', align: 'left' },
      { header: 'State', align: 'left' },
      { header: 'Cmds', align: 'right' },
    ];

    const tableRows: string[][] = result.packageList.map((pkg) => {
      const stateIcon = stateIcons[pkg.state] || '❓';
      const name = pkg.name.length > 26 ? pkg.name.substring(0, 23) + '...' : pkg.name;
      const sourceLabel =
        pkg.source === 'workspace' ? 'workspace' : pkg.source === 'linked' ? 'linked' : 'node_modules';
      const stateDisplay = `${stateIcon} ${pkg.state}`;

      return [name, pkg.namespace, pkg.version, sourceLabel, stateDisplay, String(pkg.commands.length)];
    });

    const tableLines = formatTable(columns, tableRows, { separator: '─', padding: 2 });

    // Add error details below table
    const errorLines: string[] = [];
    for (const pkg of result.packageList) {
      const hasErrors = pkg.commands.some((c) => !c.available || c.shadowed);
      if (hasErrors) {
        for (const cmd of pkg.commands) {
          if (!cmd.available) {
            errorLines.push(
              `  ${ctx.output.ui.colors.muted('  ❌')} ${cmd.manifest.id}: ${cmd.unavailableReason || 'unavailable'}`,
            );
            if (cmd.hint) {
              errorLines.push(`     ${ctx.output.ui.colors.warn(`Hint: ${cmd.hint}`)}`);
            }
          }
          if (cmd.shadowed) {
            errorLines.push(`  ${ctx.output.ui.colors.muted('  ⚠')} ${cmd.manifest.id}: shadowed`);
          }
        }
      }
    }

    if (errorLines.length > 0) {
      tableLines.push('', ...errorLines);
    }

    const sections = [
      ctx.output.ui.colors.bold('Summary:'),
      ...summary,
      '',
      ctx.output.ui.colors.bold('Plugins:'),
      ...tableLines,
      '',
      ctx.output.ui.colors.bold('Next Steps:'),
      `  ${ctx.output.ui.colors.info('kb plugins enable <name>')}  ${ctx.output.ui.colors.muted('Enable a plugin')}`,
      `  ${ctx.output.ui.colors.info('kb plugins disable <name>')}  ${ctx.output.ui.colors.muted('Disable a plugin')}`,
      `  ${ctx.output.ui.colors.info('kb plugins doctor')}  ${ctx.output.ui.colors.muted('Diagnose plugin issues')}`,
      `  ${ctx.output.ui.colors.info('kb plugins --json')}  ${ctx.output.ui.colors.muted('Get machine-readable output')}`,
      '',
      ctx.output.ui.colors.muted(`Discovery: ${formatTiming(ctx.tracker.total())}`),
    ];

    const output = ctx.output.ui.box('KB Labs CLI Plugins', sections);
    ctx.output.write(output);
  },
});

