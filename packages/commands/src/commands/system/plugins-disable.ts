/**
 * plugins:disable command - Disable a plugin
 */

import { defineSystemCommand, type CommandResult, type FlagSchemaDefinition } from '@kb-labs/cli-command-kit';
import { disablePlugin } from '../../registry/plugins-state.js';
import { getContextCwd } from '@kb-labs/shared-cli-ui';

type PluginsDisableResult = CommandResult & {
  packageName?: string;
  message?: string;
};

type PluginsDisableFlags = Record<string, never>;

export const pluginsDisable = defineSystemCommand<PluginsDisableFlags, PluginsDisableResult>({
  name: 'disable',
  description: 'Disable a plugin',
  category: 'plugins',
  examples: ['kb plugins disable @kb-labs/devlink-cli'],
  flags: {},
  analytics: {
    command: 'plugins:disable',
    startEvent: 'PLUGINS_DISABLE_STARTED',
    finishEvent: 'PLUGINS_DISABLE_FINISHED',
  },
  async handler(ctx, argv, flags) {
    if (argv.length === 0) {
      throw new Error('Please specify a plugin name to disable');
    }

    const packageName = argv[0];
    if (!packageName) {
      throw new Error('Please specify a plugin name to disable');
    }

    const cwd = getContextCwd(ctx);
    ctx.logger?.info('Disabling plugin', { packageName });
    await disablePlugin(cwd, packageName);
    ctx.logger?.info('Plugin disabled', { packageName });

    return {
      ok: true,
      packageName,
      message: `Disabled ${packageName}`,
    };
  },
  formatter(result, ctx, flags) {
    ctx.output?.info(result.message ?? 'Plugin disabled');
    ctx.output?.info(`Run 'kb plugins ls' to see updated status`);
  },
});

