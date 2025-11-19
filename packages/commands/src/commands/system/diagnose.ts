import { defineSystemCommand, type CommandResult, type FlagSchemaDefinition } from '@kb-labs/cli-command-kit';
import { getContextCwd } from '@kb-labs/shared-cli-ui';

type DiagnoseResult = CommandResult & {
  node?: string;
  platform?: string;
  repoRoot?: string;
  cwd?: string;
};

type DiagnoseFlags = {
  json: { type: 'boolean'; description?: string };
};

export const diagnose = defineSystemCommand<DiagnoseFlags, DiagnoseResult>({
  name: 'diagnose',
  description: 'Quick environment & repo diagnosis',
  longDescription: 'Performs a quick diagnosis of the current environment and repository state',
  category: 'system',
  examples: ['kb diagnose'],
  flags: {
    json: { type: 'boolean', description: 'Output in JSON format' },
  },
  analytics: {
    command: 'diagnose',
    startEvent: 'DIAGNOSE_STARTED',
    finishEvent: 'DIAGNOSE_FINISHED',
  },
  async handler(ctx, argv, flags) {
    const cwd = getContextCwd(ctx);
    const repoRoot = (ctx as any)?.repoRoot ?? cwd;
    const nodeVersion = process.version;
    const platform = `${process.platform} ${process.arch}`;

    ctx.logger?.info('Diagnose command executed', { nodeVersion, platform, repoRoot, cwd });

    return {
      ok: true,
      node: nodeVersion,
      platform,
      repoRoot,
      cwd,
    };
  },
  formatter(result, ctx, flags) {
    if (flags.json) { // Type-safe: boolean
      ctx.output?.json(result);
    } else {
      if (!ctx.output) {
        throw new Error('Output not available');
      }

      const summary = ctx.output.ui.keyValue({
        'Node Version': result.node ?? '',
        Platform: result.platform ?? '',
        'Repository Root': result.repoRoot ?? '',
        'Current Directory': result.cwd ?? '',
        Status: ctx.output.ui.colors.success(`${ctx.output.ui.symbols.success} Environment OK`),
      });

      const output = ctx.output.ui.box('Environment Diagnosis', summary);
      ctx.output.write(output);
    }
  },
});
