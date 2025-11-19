/**
 * diag command - Unified diagnostics command combining all system checks
 */

import { defineSystemCommand, type CommandResult, type FlagSchemaDefinition } from '@kb-labs/cli-command-kit';
import { registry } from '../../registry/service.js';
import { discoverManifests } from '../../registry/discover.js';
import { loadPluginsState } from '../../registry/plugins-state.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getContextCwd } from '@kb-labs/shared-cli-ui';

type DiagDetails = {
  category: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
  details?: any;
};

type DiagSummary = {
  total: number;
  ok: number;
  warnings: number;
  errors: number;
};

type DiagResult = CommandResult & {
  diagnostics?: DiagDetails[];
  summary?: DiagSummary;
};

type DiagFlags = {
  json: { type: 'boolean'; description?: string };
};

export const diag = defineSystemCommand<DiagFlags, DiagResult>({
  name: 'diag',
  description: 'Comprehensive system diagnostics (plugins, cache, environment, versions)',
  category: 'system',
  examples: ['kb diag', 'kb diag --json'],
  flags: {
    json: { type: 'boolean', description: 'Output in JSON format' },
  },
  analytics: {
    command: 'diag',
    startEvent: 'DIAG_STARTED',
    finishEvent: 'DIAG_FINISHED',
  },
  async handler(ctx, argv, flags) {
    const cwd = getContextCwd(ctx);
    const diagnostics: Array<{
      category: string;
      status: 'ok' | 'warning' | 'error';
      message: string;
      details?: any;
    }> = [];

    // 1. Environment check
    const nodeVersion = process.version;
    const cliVersion = ctx.env?.CLI_VERSION || process.env.CLI_VERSION || '0.1.0';
    const platform = process.platform;
    const arch = process.arch;

    diagnostics.push({
      category: 'environment',
      status: 'ok',
      message: `Node ${nodeVersion}, CLI ${cliVersion}, ${platform}/${arch}`,
      details: { nodeVersion, cliVersion, platform, arch },
    });

    ctx.tracker.checkpoint('environment');
    
    // 2. Plugin discovery check
    try {
      const discovered = await discoverManifests(cwd, false);
      const manifests = registry.listManifests();
      
      const enabled = manifests.filter(m => m.available && !m.shadowed).length;
      const disabled = manifests.filter(m => !m.available).length;
      const shadowed = manifests.filter(m => m.shadowed).length;
      
      diagnostics.push({
        category: 'plugins',
        status: disabled > 0 ? 'warning' : 'ok',
        message: `Found ${discovered.length} packages, ${enabled} enabled, ${disabled} unavailable, ${shadowed} shadowed`,
        details: {
          packages: discovered.length,
          enabled,
          disabled,
          shadowed,
          totalCommands: manifests.length,
        },
      });
    } catch (err: any) {
      diagnostics.push({
        category: 'plugins',
        status: 'error',
        message: `Discovery failed: ${err.message}`,
        details: { error: err.message },
      });
    }
    ctx.tracker.checkpoint('discovery');

    // 3. Cache check
    try {
      const cachePath = path.join(cwd, '.kb', 'cache', 'cli-manifests.json');
      const cacheExists = await fs.access(cachePath).then(() => true).catch(() => false);
      
      if (cacheExists) {
        const cache = JSON.parse(await fs.readFile(cachePath, 'utf8'));
        const age = Date.now() - (cache.timestamp || 0);
        const ageHours = Math.floor(age / (1000 * 60 * 60));
        
        diagnostics.push({
          category: 'cache',
          status: 'ok',
          message: `Cache exists, ${ageHours}h old, ${Object.keys(cache.packages || {}).length} packages cached`,
          details: {
            exists: true,
            ageHours,
            packages: Object.keys(cache.packages || {}).length,
          },
        });
      } else {
        diagnostics.push({
          category: 'cache',
          status: 'ok',
          message: 'No cache found (will be created on next discovery)',
          details: { exists: false },
        });
      }
    } catch (err: any) {
      diagnostics.push({
        category: 'cache',
        status: 'warning',
        message: `Cache check failed: ${err.message}`,
        details: { error: err.message },
      });
    }
    ctx.tracker.checkpoint('cache');

    // 4. Plugins state check
    try {
      const state = await loadPluginsState(cwd);
      const enabledCount = state.enabled.length;
      const disabledCount = state.disabled.length;
      const linkedCount = state.linked.length;
      
      diagnostics.push({
        category: 'plugins-state',
        status: 'ok',
        message: `${enabledCount} enabled, ${disabledCount} disabled, ${linkedCount} linked`,
        details: {
          enabled: enabledCount,
          disabled: disabledCount,
          linked: linkedCount,
          permissions: Object.keys(state.permissions).length,
        },
      });
    } catch (err: any) {
      diagnostics.push({
        category: 'plugins-state',
        status: 'error',
        message: `State check failed: ${err.message}`,
        details: { error: err.message },
      });
    }
    ctx.tracker.checkpoint('state');

    // 5. Version compatibility check
    const versionIssues: Array<{ plugin: string; required: string; current: string }> = [];
    
    try {
      const manifests = registry.listManifests();
      for (const cmd of manifests) {
        const required = cmd.manifest.engine?.kbCli;
        if (required) {
          const requiredParts = required.replace('^', '').split('.');
          const currentParts = cliVersion.split('.');
          if (requiredParts[0] && currentParts[0]) {
            const requiredMajor = parseInt(requiredParts[0], 10);
            const currentMajor = parseInt(currentParts[0], 10);
          
            if (!isNaN(requiredMajor) && !isNaN(currentMajor) && currentMajor < requiredMajor) {
              versionIssues.push({
                plugin: cmd.manifest.package || cmd.manifest.group,
                required,
                current: cliVersion,
              });
            }
          }
        }
      }
      
      if (versionIssues.length > 0) {
        diagnostics.push({
          category: 'versions',
          status: 'warning',
          message: `${versionIssues.length} plugin(s) require newer CLI version`,
          details: { issues: versionIssues },
        });
      } else {
        diagnostics.push({
          category: 'versions',
          status: 'ok',
          message: 'All plugins compatible with current CLI version',
          details: { issues: [] },
        });
      }
    } catch (err: any) {
      diagnostics.push({
        category: 'versions',
        status: 'error',
        message: `Version check failed: ${err.message}`,
        details: { error: err.message },
      });
    }
    ctx.tracker.checkpoint('versions');

    const summary = {
      total: diagnostics.length,
      ok: diagnostics.filter((d) => d.status === 'ok').length,
      warnings: diagnostics.filter((d) => d.status === 'warning').length,
      errors: diagnostics.filter((d) => d.status === 'error').length,
    };

    ctx.logger?.info('Diag command completed', summary);

    const hasErrors = summary.errors > 0;

    return {
      ok: !hasErrors,
      diagnostics,
      summary,
    };
  },
  formatter(result, ctx, flags) {
    if (flags.json) { // Type-safe: boolean
      ctx.output?.json(result);
    } else {
      if (!ctx.output) {
        throw new Error('Output not available');
      }

      if (!result.summary || !result.diagnostics) {
        ctx.output?.error('Invalid diagnostic result');
        return;
      }

      const summary = ctx.output.ui.keyValue({
        'Total Checks': `${result.summary.total}`,
        OK: `${result.summary.ok}`,
        Warnings: `${result.summary.warnings}`,
        Errors: `${result.summary.errors}`,
      });

      const sections: string[] = [
        ctx.output.ui.colors.bold('System Diagnostics:'),
        ...summary,
        '',
        ctx.output.ui.colors.bold('Details:'),
        '',
      ];

      for (const diag of result.diagnostics) {
        const icon =
          diag.status === 'ok'
            ? ctx.output.ui.symbols.success
            : diag.status === 'warning'
              ? ctx.output.ui.symbols.warning
              : ctx.output.ui.symbols.error;
        const color =
          diag.status === 'ok'
            ? ctx.output.ui.colors.success
            : diag.status === 'warning'
              ? ctx.output.ui.colors.warn
              : ctx.output.ui.colors.error;

        sections.push(`${icon} ${color(ctx.output.ui.colors.bold(diag.category))}: ${diag.message}`);

        if (diag.status === 'warning' && diag.details?.issues) {
          for (const issue of diag.details.issues) {
            sections.push(
              `   ${ctx.output.ui.colors.warn(`→ ${issue.plugin}: requires ${issue.required}, found ${issue.current}`)}`,
            );
          }
        }
        sections.push('');
      }

      sections.push(ctx.output.ui.colors.bold('Next Steps:'));
      sections.push('');

      if (result.summary.errors > 0) {
        sections.push(
          `  ${ctx.output.ui.colors.info('kb plugins doctor')}  ${ctx.output.ui.colors.muted('Diagnose plugin issues')}`,
        );
      }
      if (result.summary.warnings > 0) {
        sections.push(
          `  ${ctx.output.ui.colors.info('kb plugins ls')}  ${ctx.output.ui.colors.muted('List all plugins')}`,
        );
      }
      sections.push(
        `  ${ctx.output.ui.colors.info('kb diagnose')}  ${ctx.output.ui.colors.muted('Quick environment check')}`,
      );

      const output = ctx.output.ui.box('System Diagnostics', sections);
      ctx.output.write(output);
    }
  },
});

