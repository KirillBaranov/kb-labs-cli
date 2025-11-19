import { defineSystemCommand, type CommandResult, type FlagSchemaDefinition } from '@kb-labs/cli-command-kit';

type VersionResult = CommandResult & {
  version?: string;
  nodeVersion?: string;
  platform?: string;
};

type VersionFlags = {
  json: { type: 'boolean'; description?: string };
};

export const version = defineSystemCommand<VersionFlags, VersionResult>({
  name: 'version',
  description: 'Show CLI version',
  longDescription: 'Displays the current version of the KB Labs CLI',
  category: 'system',
  examples: ['kb version'],
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
    const version = String(v);
    const nodeVersion = process.version;
    const platform = `${process.platform} ${process.arch}`;

    ctx.logger?.info('Version command executed', { version, nodeVersion, platform });

    return { ok: true, version, nodeVersion, platform };
  },
  formatter(result, ctx, flags) {
    if (flags.json) { // Type-safe: boolean
      ctx.output?.json(result);
    } else {
      const summary = ctx.output?.ui.keyValue({
        Version: result.version ?? '',
        Node: result.nodeVersion ?? '',
        Platform: result.platform ?? '',
      }) || [];

      const output = ctx.output?.ui.box('KB Labs CLI', summary);
      ctx.output?.write(output);
    }
  },
});
