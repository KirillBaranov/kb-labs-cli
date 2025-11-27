/**
 * plugins:doctor command - Diagnose plugin issues
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/cli-command-kit';
import { registry } from '../../registry/service.js';
import { formatTiming } from '@kb-labs/shared-cli-ui';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { getContextCwd } from '@kb-labs/shared-cli-ui';

const require = createRequire(import.meta.url);

interface DoctorIssue {
  package: string;
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  fix?: string;
}

type DoctorResult = CommandResult & {
  issues: DoctorIssue[];
  summary: {
    total: number;
    errors: number;
    warnings: number;
    info: number;
  };
};

type PluginsDoctorFlags = {
  json: { type: 'boolean'; description?: string };
};

export const pluginsDoctor = defineSystemCommand<PluginsDoctorFlags, DoctorResult>({
  name: 'doctor',
  description: 'Diagnose plugin issues and suggest fixes',
  category: 'plugins',
  examples: ['kb plugins doctor', 'kb plugins doctor @kb-labs/devlink-cli', 'kb plugins doctor --json'],
  flags: {
    json: { type: 'boolean', description: 'Output in JSON format' },
  },
  analytics: {
    command: 'plugins:doctor',
    startEvent: 'PLUGINS_DOCTOR_STARTED',
    finishEvent: 'PLUGINS_DOCTOR_FINISHED',
  },
  async handler(ctx, argv, flags): Promise<DoctorResult> {
    const targetPlugin = argv[0];
    const cwd = getContextCwd(ctx);
    const manifests = registry.listManifests();
    const issues: DoctorIssue[] = [];

      // Check each plugin
      for (const cmd of manifests) {
        const pkgName = cmd.manifest.package || cmd.manifest.group || '';
        if (!pkgName) { continue; }

        if (targetPlugin && !pkgName.includes(targetPlugin)) {
          continue;
        }

        // Check Node version compatibility
        if (cmd.manifest.engine?.node) {
          const required = cmd.manifest.engine.node;
          const current = process.version;
          // Simple check for >= requirements
          if (required.startsWith('>=')) {
            const requiredVersion = required.replace('>=', '').trim();
            const currentVersionParts = current.split('.');
            const requiredVersionParts = requiredVersion.split('.');
            if (currentVersionParts[0] && requiredVersionParts[0]) {
              const currentMajor = parseInt(currentVersionParts[0].replace('v', ''), 10);
              const requiredMajor = parseInt(requiredVersionParts[0], 10);
              if (!isNaN(currentMajor) && !isNaN(requiredMajor) && currentMajor < requiredMajor) {
                issues.push({
                  package: pkgName,
                  severity: 'error',
                  code: 'NODE_VERSION_MISMATCH',
                  message: `Requires Node ${required}, found ${current}`,
                  fix: `Upgrade Node to ${required} or higher`,
                });
              }
            }
          }
        }

        // Check CLI version compatibility
        if (cmd.manifest.engine?.kbCli) {
          const required = cmd.manifest.engine.kbCli;
          const current = ctx.env?.CLI_VERSION || process.env.CLI_VERSION || '0.1.0';
          // Simple semver check
          if (required.startsWith('^') && current !== '0.1.0') {
            const requiredParts = required.replace('^', '').split('.');
            const currentParts = current.split('.');
            if (requiredParts[0] && currentParts[0]) {
              const requiredMajor = parseInt(requiredParts[0], 10);
              const currentMajor = parseInt(currentParts[0], 10);
              if (!isNaN(requiredMajor) && !isNaN(currentMajor) && currentMajor < requiredMajor) {
                issues.push({
                  package: pkgName,
                  severity: 'error',
                  code: 'CLI_VERSION_MISMATCH',
                  message: `Requires kb-cli ${required}, found ${current}`,
                  fix: `Upgrade kb-cli: pnpm -w update @kb-labs/cli`,
                });
              }
            }
          }
        }

        // Check missing peer dependencies
        if (cmd.manifest.requires) {
          for (const req of cmd.manifest.requires) {
            const parts = req.split('@');
            const pkgNameReq = parts[0];
            if (!pkgNameReq) { continue; }
            try {
              require.resolve(pkgNameReq);
            } catch {
              issues.push({
                package: pkgName,
                severity: 'error',
                code: 'MISSING_PEER_DEP',
                message: `Missing peer dependency: ${req}`,
                fix: `Install: pnpm add ${req}`,
              });
            }
          }
        }

        // Check ESM/CJS module type mismatch
        if (cmd.manifest.engine?.module) {
          const required = cmd.manifest.engine.module;
          const pkgJsonPath = path.join(cmd.pkgRoot || cwd, 'package.json');
          try {
            const pkgJson = JSON.parse(await fs.readFile(pkgJsonPath, 'utf8'));
            const isESM = pkgJson.type === 'module';

            if (required === 'esm' && !isESM) {
              issues.push({
                package: pkgName,
                severity: 'warning',
                code: 'MODULE_TYPE_MISMATCH',
                message: `Plugin declares ESM but package.json doesn't have "type": "module"`,
                fix: `Add "type": "module" to ${pkgName}/package.json`,
              });
            } else if (required === 'cjs' && isESM) {
              issues.push({
                package: pkgName,
                severity: 'warning',
                code: 'MODULE_TYPE_MISMATCH',
                message: `Plugin declares CJS but package.json has "type": "module"`,
                fix: `Remove "type": "module" from ${pkgName}/package.json or use .cjs extension`,
              });
            }
          } catch {
            // Can't check
          }
        }

        // Check unavailable commands
        if (!cmd.available && cmd.unavailableReason) {
          issues.push({
            package: pkgName,
            severity: 'error',
            code: 'UNAVAILABLE',
            message: cmd.unavailableReason,
            fix: cmd.hint || 'Check dependencies and manifest',
          });
        }

        // Check deprecated manifest paths - this check is skipped as manifestPath is not available in RegisteredCommand
        // The path is only available in DiscoveryResult, so we can't check this during doctor
      }

    const summary = {
      total: issues.length,
      errors: issues.filter((i) => i.severity === 'error').length,
      warnings: issues.filter((i) => i.severity === 'warning').length,
      info: issues.filter((i) => i.severity === 'info').length,
    };

    ctx.logger?.info('Plugins doctor completed', summary);

    return {
      ok: summary.errors === 0,
      issues,
      summary,
    };
  },
  formatter(result, ctx, flags) {
    const resultData = result as DoctorResult;

    if (flags.json) {
      ctx.output?.json(resultData);
      return;
    }

    if (!ctx.output) {
      throw new Error('Output not available');
    }

    const { issues, summary } = resultData;

    if (issues.length === 0) {
      ctx.output.info(`${ctx.output.ui.symbols.success} All plugins are healthy!`);
      return;
    }

    const errorCount = summary.errors;
    const warningCount = summary.warnings;

    const summaryItems = [
      `Total Issues: ${issues.length}`,
      `Errors: ${errorCount > 0 ? ctx.output.ui.colors.error(errorCount.toString()) : 'none'}`,
      `Warnings: ${warningCount > 0 ? ctx.output.ui.colors.warn(warningCount.toString()) : 'none'}`,
    ];

    const issueItems: string[] = [];
    const byPackage = new Map<string, DoctorIssue[]>();

    for (const issue of issues) {
      if (!byPackage.has(issue.package)) {
        byPackage.set(issue.package, []);
      }
      byPackage.get(issue.package)!.push(issue);
    }

    for (const [pkg, pkgIssues] of Array.from(byPackage.entries()).sort()) {
      issueItems.push(ctx.output.ui.colors.bold(`${pkg}:`));

      for (const issue of pkgIssues) {
        const icon = issue.severity === 'error' ? ctx.output.ui.symbols.error : ctx.output.ui.symbols.warning;
        const color = issue.severity === 'error' ? ctx.output.ui.colors.error : ctx.output.ui.colors.warn;

        issueItems.push(`  ${icon} ${color(issue.code)}: ${issue.message}`);
        if (issue.fix) {
          issueItems.push(`     ${ctx.output.ui.colors.info(`Fix: ${issue.fix}`)}`);
        }
      }
    }

    const nextStepsItems = [
      `kb plugins enable <name>  ${ctx.output.ui.colors.muted('Enable a disabled plugin')}`,
      `kb plugins clear-cache  ${ctx.output.ui.colors.muted('Clear cache and rediscover')}`,
    ];

    const output = ctx.output.ui.sideBox({
      title: 'Plugin Diagnostics',
      sections: [
        {
          header: 'Summary',
          items: summaryItems,
        },
        {
          header: 'Issues',
          items: issueItems,
        },
        {
          header: 'Next Steps',
          items: nextStepsItems,
        },
      ],
      status: errorCount > 0 ? 'error' : warningCount > 0 ? 'warning' : 'success',
      timing: ctx.tracker.total(),
    });
    ctx.output.write(output);
  },
});

