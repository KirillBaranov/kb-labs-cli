/**
 * plugins:doctor command - Diagnose plugin issues
 */

import type { Command } from "../../types/types.js";
import { registry } from "../../utils/registry.js";
import { loadPluginsState } from '../../registry/plugins-state.js';
import { discoverManifests } from '../../registry/discover.js';
import { box, keyValue, safeSymbols, safeColors } from "@kb-labs/shared-cli-ui";
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export const pluginsDoctor: Command = {
  name: "plugins:doctor",
  category: "system",
  describe: "Diagnose plugin issues and suggest fixes",
  flags: [
    {
      name: "json",
      type: "boolean",
      description: "Output in JSON format",
    },
  ],
  examples: [
    "kb plugins doctor",
    "kb plugins doctor @kb-labs/devlink-cli",
    "kb plugins doctor --json",
  ],

  async run(ctx, argv, flags) {
    const jsonMode = !!flags.json;
    const targetPlugin = argv[0];

    try {
      const manifests = registry.listManifests();
      const issues: Array<{
        package: string;
        severity: 'error' | 'warning' | 'info';
        code: string;
        message: string;
        fix?: string;
      }> = [];

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
          const current = process.env.CLI_VERSION || '0.1.0';
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
          const pkgJsonPath = path.join(cmd.pkgRoot || process.cwd(), 'package.json');
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

      if (jsonMode) {
        ctx.presenter.json({
          ok: issues.length === 0,
          issues,
          total: issues.length,
          errors: issues.filter(i => i.severity === 'error').length,
          warnings: issues.filter(i => i.severity === 'warning').length,
        });
        return issues.filter(i => i.severity === 'error').length > 0 ? 1 : 0;
      }

      if (issues.length === 0) {
        ctx.presenter.info(`${safeSymbols.success} All plugins are healthy!`);
        return 0;
      }

      const errorCount = issues.filter(i => i.severity === 'error').length;
      const warningCount = issues.filter(i => i.severity === 'warning').length;

      const summary = keyValue({
        'Total Issues': `${issues.length}`,
        'Errors': errorCount > 0 ? `${safeColors.error(errorCount.toString())}` : 'none',
        'Warnings': warningCount > 0 ? `${safeColors.warning(warningCount.toString())}` : 'none',
      });

      const issueLines: string[] = [];
      const byPackage = new Map<string, typeof issues>();

      for (const issue of issues) {
        if (!byPackage.has(issue.package)) {
          byPackage.set(issue.package, []);
        }
        byPackage.get(issue.package)!.push(issue);
      }

      for (const [pkg, pkgIssues] of Array.from(byPackage.entries()).sort()) {
        issueLines.push(safeColors.bold(`\n${pkg}:`));

        for (const issue of pkgIssues) {
          const icon = issue.severity === 'error' ? safeSymbols.error : safeSymbols.warning;
          const color = issue.severity === 'error' ? safeColors.error : safeColors.warning;

          issueLines.push(`  ${icon} ${color(issue.code)}: ${issue.message}`);
          if (issue.fix) {
            issueLines.push(`     ${safeColors.info(`Fix: ${issue.fix}`)}`);
          }
        }
      }

      const sections = [
        safeColors.bold('Plugin Health Check:'),
        ...summary,
        ...issueLines,
        '',
        safeColors.bold('Next Steps:'),
        `  ${safeColors.info('kb plugins enable <name>')}  ${safeColors.dim('Enable a disabled plugin')}`,
        `  ${safeColors.info('kb plugins clear-cache')}  ${safeColors.dim('Clear cache and rediscover')}`,
      ];

      const output = box('Plugin Diagnostics', sections);
      ctx.presenter.write(output);

      return errorCount > 0 ? 1 : 0;
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      if (jsonMode) {
        ctx.presenter.json({ ok: false, error: errorMessage });
      } else {
        ctx.presenter.error(errorMessage);
      }
      return 1;
    }
  },
};

