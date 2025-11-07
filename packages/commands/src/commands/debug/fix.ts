/**
 * fix command - Quick fix for common errors
 */

import type { Command } from '../../types/types';
import { listSnapshots, getSuggestions, formatSuggestions } from '@kb-labs/plugin-runtime';
import type { CliContext } from '@kb-labs/cli-core';
import { getContextCwd } from '../../utils/context';

export const fix: Command = {
  name: 'fix',
  category: 'debug',
  describe: 'Quick fix for common errors',
  flags: [
    {
      name: 'last',
      type: 'boolean',
      description: 'Fix last error from snapshot',
    },
    {
      name: 'json',
      type: 'boolean',
      description: 'Output in JSON format',
    },
  ],
  examples: [
    'kb fix MODULE_NOT_FOUND',
    'kb fix --last',
    'kb fix PERMISSION_DENIED',
  ],

  async run(ctx: CliContext, argv: string[], flags: Record<string, unknown>) {
    const jsonMode = Boolean(flags.json);
    const cwd = getContextCwd(ctx as Partial<CliContext> & { cwd?: string });
    let errorCode: string | undefined;

    if (flags.last) {
      const snapshots = await listSnapshots(cwd);
      if (snapshots.length === 0) {
        ctx.presenter.error('No snapshots found');
        return 1;
      }
      const [lastSnapshot] = snapshots;
      if (lastSnapshot?.error?.code) {
        errorCode = lastSnapshot.error.code;
      } else {
        ctx.presenter.error('Last snapshot has no error');
        return 1;
      }
    } else if (argv.length > 0) {
      const code = argv[0];
      if (typeof code === 'string' && code.length > 0) {
        errorCode = code.toUpperCase();
      }
    } else {
      ctx.presenter.error('Please provide error code or use --last flag');
      ctx.presenter.info('Examples:');
      ctx.presenter.info('  kb fix MODULE_NOT_FOUND');
      ctx.presenter.info('  kb fix --last');
      return 1;
    }

    if (!errorCode) {
      ctx.presenter.error('Error code is required');
      return 1;
    }

    const suggestions = getSuggestions(errorCode);

    if (jsonMode) {
      ctx.presenter.json({
        ok: true,
        errorCode,
        suggestions: suggestions.map((s) => ({
          step: s.step,
          text: s.text,
          command: s.command,
        })),
      });
      return 0;
    }

    ctx.presenter.info(`Quick fix for: ${errorCode}`);
    ctx.presenter.info('');
    ctx.presenter.info(formatSuggestions(suggestions));
    ctx.presenter.info('');

    if (errorCode.includes('MODULE_NOT_FOUND')) {
      ctx.presenter.info('Common fixes for MODULE_NOT_FOUND:');
      ctx.presenter.info('1. Check if handler path in manifest is correct');
      ctx.presenter.info('2. Rebuild the plugin: cd <plugin-dir> && pnpm build');
      ctx.presenter.info('3. Verify file exists in dist/ directory');
    } else if (errorCode.includes('PERMISSION')) {
      ctx.presenter.info('Common fixes for PERMISSION_DENIED:');
      ctx.presenter.info('1. Add required permissions to manifest.permissions');
      ctx.presenter.info('2. Example: permissions: { fs: { mode: "read" }, net: { allowHosts: ["api.example.com"] } }');
    } else if (errorCode.includes('TIMEOUT')) {
      ctx.presenter.info('Common fixes for TIMEOUT:');
      ctx.presenter.info('1. Increase timeout in manifest.permissions.quotas.timeoutMs');
      ctx.presenter.info('2. Example: permissions: { quotas: { timeoutMs: 120000 } }');
    }

    return 0;
  },
};



