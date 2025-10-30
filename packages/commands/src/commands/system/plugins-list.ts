/**
 * plugins:list command - List all discovered CLI plugins
 */

import type { Command } from "../../types/types";
import type { RegisteredCommand } from '../../registry/types';
import { registry } from "../../utils/registry";
import { box, keyValue, formatTiming, TimingTracker, safeSymbols, safeColors, formatTable, type TableColumn } from "@kb-labs/shared-cli-ui";
import { loadPluginsState, isPluginEnabled } from '../../registry/plugins-state';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const pluginsList: Command = {
  name: "plugins",
  category: "system",
  describe: "List all discovered CLI plugins",
  aliases: ["plugins:list", "list"],
  flags: [
    {
      name: "json",
      type: "boolean",
      description: "Output in JSON format",
    },
  ],
  examples: [
    "kb plugins list",
    "kb plugins list --json",
    "kb plugins --json",
  ],

  async run(ctx, argv, flags) {
    const tracker = new TimingTracker();
    const jsonMode = !!flags.json;
    
    try {
      tracker.checkpoint('discover');
      
      const manifests = registry.listManifests();
      const productGroups = registry.listProductGroups();
      const state = await loadPluginsState(process.cwd());
      
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
              const pkgPath = path.join(process.cwd(), 'node_modules', pkgName, 'package.json');
              const pkgJson = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
              version = pkgJson.version || 'unknown';
            } catch {
              // Try workspace root/packages structure
              try {
                const pkgPath = path.join(process.cwd(), 'packages', namespace.replace('@kb-labs/', '').replace('-cli', ''), 'package.json');
                const pkgJson = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
                version = pkgJson.version || 'unknown';
              } catch {
                // Try finding in parent workspace
                try {
                  const workspaceRoot = path.resolve(process.cwd(), '..');
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
      
      const totalTime = tracker.total();
      
      if (jsonMode) {
        // JSON output with state
        const output = Array.from(packages.values()).map(pkg => ({
          name: pkg.name,
          namespace: pkg.namespace,
          version: pkg.version,
          source: pkg.source,
          enabled: pkg.enabled,
          state: pkg.state,
          commands: pkg.commands.map(cmd => ({
            id: cmd.manifest.id,
            aliases: cmd.manifest.aliases || [],
            describe: cmd.manifest.describe,
            available: cmd.available,
            shadowed: cmd.shadowed,
            ...(cmd.unavailableReason && { reason: cmd.unavailableReason }),
          })),
        }));
        
        ctx.presenter.json({
          ok: true,
          plugins: output,
          total: output.length,
          enabled: output.filter(p => p.enabled).length,
          disabled: output.filter(p => !p.enabled).length,
          products: productGroups.length,
          timing: totalTime,
        });
        return 0;
      }
      
      // Text output - table format with state indicators
      const packageList = Array.from(packages.values()).sort((a, b) => a.name.localeCompare(b.name));
      
      const stateIcons: Record<string, string> = {
        enabled: '✅',
        disabled: '⏸',
        error: '❌',
        outdated: '⚠',
        linked: '🧩',
      };
      
      const summary = keyValue({
        'Total': `${packageList.length} plugins`,
        'Enabled': `${packageList.filter(p => p.enabled).length}`,
        'Disabled': `${packageList.filter(p => !p.enabled).length}`,
        'Linked': `${packageList.filter(p => p.state === 'linked').length}`,
        'Commands': `${manifests.length} total`,
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
      
      const tableRows: string[][] = packageList.map(pkg => {
        const stateIcon = stateIcons[pkg.state] || '❓';
        const name = pkg.name.length > 26 ? pkg.name.substring(0, 23) + '...' : pkg.name;
        // Don't use colors for source to avoid alignment issues
        const sourceLabel = pkg.source === 'workspace' ? 'workspace' : 
                           pkg.source === 'linked' ? 'linked' : 
                           'node_modules';
        const stateDisplay = `${stateIcon} ${pkg.state}`;
        
        return [
          name,
          pkg.namespace,
          pkg.version,
          sourceLabel,
          stateDisplay,
          String(pkg.commands.length),
        ];
      });
      
      const tableLines = formatTable(columns, tableRows, { separator: '─', padding: 2 });
      
      // Add error details below table
      const errorLines: string[] = [];
      for (const pkg of packageList) {
        const hasErrors = pkg.commands.some(c => !c.available || c.shadowed);
        if (hasErrors) {
          for (const cmd of pkg.commands) {
            if (!cmd.available) {
              errorLines.push(`  ${safeColors.dim('  ❌')} ${cmd.manifest.id}: ${cmd.unavailableReason || 'unavailable'}`);
              if (cmd.hint) {
                errorLines.push(`     ${safeColors.warning(`Hint: ${cmd.hint}`)}`);
              }
            }
            if (cmd.shadowed) {
              errorLines.push(`  ${safeColors.dim('  ⚠')} ${cmd.manifest.id}: shadowed`);
            }
          }
        }
      }
      
      if (errorLines.length > 0) {
        tableLines.push('', ...errorLines);
      }
      
      const sections = [
        safeColors.bold('Summary:'),
        ...summary,
        '',
        safeColors.bold('Plugins:'),
        ...tableLines,
        '',
        safeColors.bold('Next Steps:'),
        `  ${safeColors.info('kb plugins enable <name>')}  ${safeColors.dim('Enable a plugin')}`,
        `  ${safeColors.info('kb plugins disable <name>')}  ${safeColors.dim('Disable a plugin')}`,
        `  ${safeColors.info('kb plugins doctor')}  ${safeColors.dim('Diagnose plugin issues')}`,
        `  ${safeColors.info('kb plugins --json')}  ${safeColors.dim('Get machine-readable output')}`,
        '',
        safeColors.dim(`Discovery: ${formatTiming(totalTime)}`),
      ];
      
      const output = box('KB Labs CLI Plugins', sections);
      ctx.presenter.write(output);
      
      return 0;
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      if (jsonMode) {
        ctx.presenter.json({ ok: false, error: errorMessage, timing: tracker.total() });
      } else {
        ctx.presenter.error(errorMessage);
      }
      return 1;
    }
  },
};

