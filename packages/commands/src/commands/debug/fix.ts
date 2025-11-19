/**
 * fix command - Quick fix for common errors
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/cli-command-kit';
import { listSnapshots, getSuggestions, formatSuggestions } from '@kb-labs/plugin-runtime';
import { getContextCwd } from '@kb-labs/shared-cli-ui';

type FixResult = CommandResult & {
  errorCode?: string;
  suggestions?: Array<{
    step: number;
    text: string;
    command?: string;
  }>;
};

type FixFlags = {
  last: { type: 'boolean'; description?: string };
  json: { type: 'boolean'; description?: string };
};

export const fix = defineSystemCommand<FixFlags, FixResult>({
  name: 'fix',
  description: 'Quick fix for common errors',
  category: 'debug',
  examples: ['kb fix MODULE_NOT_FOUND', 'kb fix --last', 'kb fix PERMISSION_DENIED'],
  flags: {
    last: { type: 'boolean', description: 'Fix last error from snapshot' },
    json: { type: 'boolean', description: 'Output in JSON format' },
  },
  analytics: {
    command: 'fix',
    startEvent: 'FIX_STARTED',
    finishEvent: 'FIX_FINISHED',
  },
  async handler(ctx, argv, flags) {
    const cwd = getContextCwd(ctx);
    let errorCode: string | undefined;

    if (flags.last) {
      const snapshots = await listSnapshots(cwd);
      if (snapshots.length === 0) {
        throw new Error('No snapshots found');
      }
      const [lastSnapshot] = snapshots;
      if (lastSnapshot?.error?.code) {
        errorCode = lastSnapshot.error.code;
      } else {
        throw new Error('Last snapshot has no error');
      }
    } else if (argv.length > 0) {
      const code = argv[0];
      if (typeof code === 'string' && code.length > 0) {
        errorCode = code.toUpperCase();
      }
    } else {
      throw new Error('Please provide error code or use --last flag');
    }

    if (!errorCode) {
      throw new Error('Error code is required');
    }

    const suggestions = getSuggestions(errorCode);

    ctx.logger?.info('Fix suggestions retrieved', { errorCode, suggestionsCount: suggestions.length });

    return {
      ok: true,
      errorCode,
      suggestions: suggestions.map((s) => ({
        step: s.step,
        text: s.text,
        command: s.command,
      })),
    };
  },
  formatter(result, ctx, flags) {
    if (flags.json) { // Type-safe: boolean
      ctx.output?.json(result);
      return;
    }

    const { errorCode, suggestions } = result;

    ctx.output?.info(`Quick fix for: ${errorCode ?? 'unknown'}`);
    ctx.output?.info('');
    if (suggestions) {
      ctx.output?.info(formatSuggestions(suggestions));
    }
    ctx.output?.info('');

    if (errorCode?.includes('MODULE_NOT_FOUND')) {
      ctx.output?.info('Common fixes for MODULE_NOT_FOUND:');
      ctx.output?.info('1. Check if handler path in manifest is correct');
      ctx.output?.info('2. Rebuild the plugin: cd <plugin-dir> && pnpm build');
      ctx.output?.info('3. Verify file exists in dist/ directory');
    } else if (errorCode?.includes('PERMISSION')) {
      ctx.output?.info('Common fixes for PERMISSION_DENIED:');
      ctx.output?.info('1. Add required permissions to manifest.permissions');
      ctx.output?.info(
        '2. Example: permissions: { fs: { mode: "read" }, net: { allowHosts: ["api.example.com"] } }',
      );
    } else if (errorCode?.includes('TIMEOUT')) {
      ctx.output?.info('Common fixes for TIMEOUT:');
      ctx.output?.info('1. Increase timeout in manifest.permissions.quotas.timeoutMs');
      ctx.output?.info('2. Example: permissions: { quotas: { timeoutMs: 120000 } }');
    }
  },
});



