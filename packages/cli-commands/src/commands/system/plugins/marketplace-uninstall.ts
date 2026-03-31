/**
 * marketplace:uninstall command - Remove a package from marketplace
 *
 * Removes from .kb/marketplace.lock and optionally from node_modules.
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit';
import { generateExamples } from '../../../utils/generate-examples';
import { getContextCwd } from '@kb-labs/shared-cli-ui';
import { execa } from 'execa';
import {
  removeFromMarketplaceLock,
  readMarketplaceLock,
  DiagnosticCollector,
} from '@kb-labs/core-discovery';
import { disablePlugin } from '@kb-labs/core-registry';

type MarketplaceUninstallFlags = {
  'keep-package': { type: 'boolean'; description?: string };
  json: { type: 'boolean'; description?: string };
};

type MarketplaceUninstallResult = CommandResult & {
  removed: string[];
  removedFromDisk: boolean;
};

export const marketplaceUninstall = defineSystemCommand<MarketplaceUninstallFlags, MarketplaceUninstallResult>({
  name: 'uninstall',
  description: 'Remove package(s) from marketplace',
  category: 'marketplace',
  examples: generateExamples('uninstall', 'marketplace', [
    { flags: {} },
    { flags: { 'keep-package': true } },
  ]),
  flags: {
    'keep-package': { type: 'boolean', description: 'Only remove from lock file, keep node_modules' },
    json: { type: 'boolean', description: 'Output in JSON format' },
  },
  analytics: {
    command: 'marketplace:uninstall',
    startEvent: 'MARKETPLACE_UNINSTALL_STARTED',
    finishEvent: 'MARKETPLACE_UNINSTALL_FINISHED',
  },
  async handler(ctx, argv, flags) {
    if (argv.length === 0) {
      throw new Error('Please specify at least one package to uninstall');
    }

    const cwd = getContextCwd(ctx);
    const removed: string[] = [];
    const keepPackage = flags['keep-package'];

    for (const pkgName of argv) {
      // 1. Remove from marketplace.lock
      const wasRemoved = await removeFromMarketplaceLock(cwd, pkgName);
      if (wasRemoved) {
        removed.push(pkgName);
      }

      // 2. Disable plugin
      await disablePlugin(cwd, pkgName);
    }

    // 3. Remove from node_modules (unless --keep-package)
    let removedFromDisk = false;
    if (!keepPackage && removed.length > 0) {
      try {
        await execa('pnpm', ['remove', ...removed], { cwd });
        removedFromDisk = true;
      } catch {
        // pnpm remove failed — non-fatal (local links can't be removed)
      }
    }

    return { ok: true, removed, removedFromDisk };
  },
  formatter(result, ctx, _flags) {
    if (result.removed.length === 0) {
      ctx.ui.warn('No packages found in marketplace.lock');
      return;
    }
    ctx.ui.success(`Removed: ${result.removed.join(', ')}`);
    if (result.removedFromDisk) {
      ctx.ui.info('Also removed from node_modules');
    }
  },
});
