import { defineSystemCommand, type CommandOutput } from '@kb-labs/cli-command-kit';
import { generateExamples } from '@kb-labs/plugin-manifest';

type VersionFlags = {
  json: { type: 'boolean'; description?: string };
};

export const version = defineSystemCommand<VersionFlags, CommandOutput>({
  name: 'version',
  description: 'Show CLI version',
  longDescription: 'Displays the current version of the KB Labs CLI',
  category: 'info',
  examples: generateExamples('version', 'kb', [
    { flags: {} },
  ]),
  flags: {
    json: { type: 'boolean', description: 'Output in JSON format' },
  },
  analytics: {
    command: 'version',
    startEvent: 'VERSION_STARTED',
    finishEvent: 'VERSION_FINISHED',
  },
  async handler(ctx, argv, flags) {
    const v = (ctx as any)?.cliVersion ?? (ctx as any)?.env?.CLI_VERSION ?? '0.0.0';
    const cliVersion = String(v);
    const nodeVersion = process.version;
    const platform = `${process.platform} ${process.arch}`;

    ctx.logger?.info('Version command executed', {
      version: cliVersion,
      nodeVersion,
      platform
    });

    // Use new ctx.success() helper for modern UI
    return ctx.success('KB Labs CLI', {
      summary: {
        'CLI Version': cliVersion,
        'Node': nodeVersion,
        'Platform': platform,
      },
      timing: ctx.tracker.total(),
      json: {
        version: cliVersion,
        nodeVersion,
        platform,
      },
    });
  },
  formatter(result, ctx, flags) {
    // Auto-handle JSON mode
    if (flags.json) {
      console.log(JSON.stringify(result.json, null, 2));
    } else {
      console.log(result.human);
    }
  },
});
