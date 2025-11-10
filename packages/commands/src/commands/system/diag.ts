/**
 * diag command - Unified diagnostics command combining all system checks
 */

import type { Command } from "../../types/types.js";
import { registry } from "../../registry/service.js";
import { discoverManifests } from '../../registry/discover.js';
import { loadPluginsState } from '../../registry/plugins-state.js';
import { box, keyValue, safeColors, safeSymbols, formatTiming, TimingTracker } from "@kb-labs/shared-cli-ui";
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { getContextCwd } from "@kb-labs/shared-cli-ui";

const require = createRequire(import.meta.url);

export const diag: Command = {
  name: "diag",
  category: "system",
  describe: "Comprehensive system diagnostics (plugins, cache, environment, versions)",
  flags: [
    {
      name: "json",
      type: "boolean",
      description: "Output in JSON format",
    },
  ],
  examples: [
    "kb diag",
    "kb diag --json",
  ],

  async run(ctx, argv, flags) {
    const jsonMode = !!flags.json;
    const tracker = new TimingTracker();
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
    
    tracker.mark('environment');
    
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
    tracker.mark('discovery');
    
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
    tracker.mark('cache');
    
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
    tracker.mark('state');
    
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
    tracker.mark('versions');
    
    const totalTime = tracker.total();
    
    if (jsonMode) {
      ctx.presenter.json({
        ok: true,
        diagnostics,
        summary: {
          total: diagnostics.length,
          ok: diagnostics.filter(d => d.status === 'ok').length,
          warnings: diagnostics.filter(d => d.status === 'warning').length,
          errors: diagnostics.filter(d => d.status === 'error').length,
        },
        timing: {
          total: totalTime,
          breakdown: tracker.getBreakdown(),
        },
      });
      return diagnostics.filter(d => d.status === 'error').length > 0 ? 1 : 0;
    }
    
    // Text output
    const summary = keyValue({
      'Total Checks': `${diagnostics.length}`,
      'OK': `${diagnostics.filter(d => d.status === 'ok').length}`,
      'Warnings': `${diagnostics.filter(d => d.status === 'warning').length}`,
      'Errors': `${diagnostics.filter(d => d.status === 'error').length}`,
    });
    
    const sections: string[] = [
      safeColors.bold('System Diagnostics:'),
      ...summary,
      '',
      safeColors.bold('Details:'),
      '',
    ];
    
    for (const diag of diagnostics) {
      const icon = diag.status === 'ok' ? safeSymbols.success : 
                   diag.status === 'warning' ? safeSymbols.warning : 
                   safeSymbols.error;
      const color = diag.status === 'ok' ? safeColors.success : 
                    diag.status === 'warning' ? safeColors.warning : 
                    safeColors.error;
      
      sections.push(`${icon} ${color(safeColors.bold(diag.category))}: ${diag.message}`);
      
      if (diag.status === 'warning' && diag.details?.issues) {
        for (const issue of diag.details.issues) {
          sections.push(`   ${safeColors.warning(`→ ${issue.plugin}: requires ${issue.required}, found ${issue.current}`)}`);
        }
      }
      sections.push('');
    }
    
    sections.push(safeColors.bold('Next Steps:'));
    sections.push('');
    
    if (diagnostics.filter(d => d.status === 'error').length > 0) {
      sections.push(`  ${safeColors.info('kb plugins doctor')}  ${safeColors.dim('Diagnose plugin issues')}`);
    }
    if (diagnostics.filter(d => d.status === 'warning').length > 0) {
      sections.push(`  ${safeColors.info('kb plugins ls')}  ${safeColors.dim('List all plugins')}`);
    }
    sections.push(`  ${safeColors.info('kb diagnose')}  ${safeColors.dim('Quick environment check')}`);
    sections.push('');
    sections.push(`${safeColors.dim(`Time: ${formatTiming(totalTime)}`)}`);
    
    const output = box('System Diagnostics', sections);
    ctx.presenter.write(output);
    
    return diagnostics.filter(d => d.status === 'error').length > 0 ? 1 : 0;
  },
};

