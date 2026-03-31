/**
 * marketplace:install command - Install package from marketplace
 *
 * Installs via pnpm, loads manifest, computes integrity, and writes
 * to .kb/marketplace.lock — the single source of truth for discovery.
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit';
import { generateExamples } from '../../../utils/generate-examples';
import { getContextCwd } from '@kb-labs/shared-cli-ui';
import { execa } from 'execa';
import {
  addToMarketplaceLock,
  createMarketplaceEntry,
  extractEntityKinds,
  loadManifest,
  DiagnosticCollector,
} from '@kb-labs/core-discovery';
import { computePackageIntegrity, enablePlugin } from '@kb-labs/core-registry';
import * as path from 'node:path';

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
    if (slashIndex === -1) return null;
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

    // 1. Install via pnpm
    const result = await execa('pnpm', args, { cwd, timeout: 5 * 60 * 1000 });

    const enabled: string[] = [];

    for (const spec of argv) {
      const pkgName = extractPackageName(spec);
      if (!pkgName) continue;

      // 2. Resolve installed package path
      const pkgRoot = path.join(cwd, 'node_modules', pkgName);

      // 3. Load manifest & compute integrity
      const diag = new DiagnosticCollector();
      const manifest = await loadManifest(pkgRoot, diag);

      // 4. Compute integrity hash
      const integrity = await computePackageIntegrity(pkgRoot);

      // 5. Extract entity kinds
      const provides = manifest ? extractEntityKinds(manifest) : ['plugin' as const];

      // 6. Read version from package.json
      let version = '0.0.0';
      try {
        const pkg = JSON.parse(
          await (await import('node:fs/promises')).readFile(path.join(pkgRoot, 'package.json'), 'utf-8'),
        );
        version = pkg.version ?? version;
      } catch { /* use default */ }

      // 7. Write to marketplace.lock
      const entry = createMarketplaceEntry({
        version,
        integrity,
        resolvedPath: `./node_modules/${pkgName}`,
        source: 'marketplace',
        provides,
      });
      await addToMarketplaceLock(cwd, pkgName, entry);

      // 8. Enable plugin
      await enablePlugin(cwd, pkgName);
      enabled.push(pkgName);
    }

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
    ctx.ui.info('Entries written to .kb/marketplace.lock');
  },
});
