/**
 * marketplace:update command - Update installed marketplace packages
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit';
import { generateExamples } from '../../../utils/generate-examples';
import { getContextCwd } from '@kb-labs/shared-cli-ui';
import { execa } from 'execa';
import { clearCache } from '../../../registry/plugins-state';

type MarketplaceUpdateFlags = {
  all: { type: 'boolean'; description?: string };
  latest: { type: 'boolean'; description?: string };
  json: { type: 'boolean'; description?: string };
};

type MarketplaceUpdateResult = CommandResult & {
  updated: string[];
  all: boolean;
  latest: boolean;
  stdout?: string;
  stderr?: string;
};

export const marketplaceUpdate = defineSystemCommand<MarketplaceUpdateFlags, MarketplaceUpdateResult>({
  name: 'update',
  description: 'Update marketplace package(s)',
  category: 'marketplace',
  examples: generateExamples('update', 'marketplace', [
    { flags: {} },
    { flags: { all: true } },
    { flags: { latest: true } },
  ]),
  flags: {
    all: { type: 'boolean', description: 'Update all dependencies in current project' },
    latest: { type: 'boolean', description: 'Ignore ranges and update to latest versions' },
    json: { type: 'boolean', description: 'Output in JSON format' },
  },
  analytics: {
    command: 'marketplace:update',
    startEvent: 'MARKETPLACE_UPDATE_STARTED',
    finishEvent: 'MARKETPLACE_UPDATE_FINISHED',
  },
  async handler(ctx, argv, flags) {
    if (!flags.all && argv.length === 0) {
      throw new Error('Specify package(s) to update, or use --all');
    }

    const cwd = getContextCwd(ctx);
    const args = ['up'];
    if (flags.latest) {
      args.push('--latest');
    }
    if (!flags.all) {
      args.push(...argv);
    }

    const result = await execa('pnpm', args, { cwd });
    await clearCache(cwd);

    return {
      ok: true,
      updated: flags.all ? ['*'] : argv,
      all: Boolean(flags.all),
      latest: Boolean(flags.latest),
      stdout: result.stdout,
      stderr: result.stderr,
    };
  },
  formatter(result, ctx, _flags) {
    ctx.ui.success('Marketplace update completed');
    ctx.ui.info(
      result.all
        ? 'Updated all dependencies in current project'
        : `Updated: ${result.updated.join(', ')}`,
    );
    ctx.ui.info("Run 'kb marketplace doctor' to verify plugin health");
  },
});

