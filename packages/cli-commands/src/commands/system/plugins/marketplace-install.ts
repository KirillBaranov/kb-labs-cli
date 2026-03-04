/**
 * marketplace:install command - Install package from marketplace
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit';
import { generateExamples } from '../../../utils/generate-examples';
import { getContextCwd } from '@kb-labs/shared-cli-ui';
import { execa } from 'execa';
import { clearCache, enablePlugin } from '../../../registry/plugins-state';

type MarketplaceInstallFlags = {
  dev: { type: 'boolean'; description?: string };
  json: { type: 'boolean'; description?: string };
};

type MarketplaceInstallResult = CommandResult & {
  installed: string[];
  enabled: string[];
  dev: boolean;
  stdout?: string;
  stderr?: string;
};

function extractPackageName(spec: string): string | null {
  if (!spec || spec.startsWith('.') || spec.startsWith('/') || spec.includes(':')) {
    return null;
  }

  if (spec.startsWith('@')) {
    const slashIndex = spec.indexOf('/');
    if (slashIndex === -1) {
      return null;
    }
    const versionSep = spec.lastIndexOf('@');
    return versionSep > slashIndex ? spec.slice(0, versionSep) : spec;
  }

  const versionSep = spec.indexOf('@');
  return versionSep > 0 ? spec.slice(0, versionSep) : spec;
}

export const marketplaceInstall = defineSystemCommand<MarketplaceInstallFlags, MarketplaceInstallResult>({
  name: 'install',
  description: 'Install package(s) from marketplace',
  category: 'marketplace',
  examples: generateExamples('install', 'marketplace', [
    { flags: {} },
    { flags: { dev: true } },
  ]),
  flags: {
    dev: { type: 'boolean', description: 'Install as dev dependency' },
    json: { type: 'boolean', description: 'Output in JSON format' },
  },
  analytics: {
    command: 'marketplace:install',
    startEvent: 'MARKETPLACE_INSTALL_STARTED',
    finishEvent: 'MARKETPLACE_INSTALL_FINISHED',
  },
  async handler(ctx, argv, flags) {
    if (argv.length === 0) {
      throw new Error('Please specify at least one package to install');
    }

    const cwd = getContextCwd(ctx);
    const args = ['add', ...argv];
    if (flags.dev) {
      args.push('--save-dev');
    }

    const result = await execa('pnpm', args, { cwd });

    const enabled: string[] = [];
    for (const spec of argv) {
      const pkgName = extractPackageName(spec);
      if (!pkgName) {
        continue;
      }
      await enablePlugin(cwd, pkgName);
      enabled.push(pkgName);
    }

    await clearCache(cwd);

    return {
      ok: true,
      installed: argv,
      enabled,
      dev: Boolean(flags.dev),
      stdout: result.stdout,
      stderr: result.stderr,
    };
  },
  formatter(result, ctx, _flags) {
    ctx.ui.success('Marketplace install completed');
    ctx.ui.info(`Installed: ${result.installed.join(', ')}`);
    if (result.enabled.length > 0) {
      ctx.ui.info(`Enabled: ${result.enabled.join(', ')}`);
    }
    ctx.ui.info("Run 'kb marketplace list' to verify status");
  },
});

