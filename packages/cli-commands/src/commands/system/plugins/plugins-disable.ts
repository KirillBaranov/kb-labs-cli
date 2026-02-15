/**
 * plugins:disable command - Disable a plugin
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit';
import { generateExamples } from '../../../utils/generate-examples';
import { disablePlugin } from '../../../registry/plugins-state';
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
  examples: generateExamples('disable', 'plugins', [
    { flags: {} },  // kb plugins disable (requires <package> arg)
  ]),
  flags: {},
  analytics: {
    command: 'plugins:disable',
    startEvent: 'PLUGINS_DISABLE_STARTED',
    finishEvent: 'PLUGINS_DISABLE_FINISHED',
  },
  async handler(ctx, argv, _flags) {
    if (argv.length === 0) {
      throw new Error('Please specify a plugin name to disable');
    }

    const packageName = argv[0];
    if (!packageName) {
      throw new Error('Please specify a plugin name to disable');
    }

    const cwd = getContextCwd(ctx);
    ctx.platform?.logger?.info('Disabling plugin', { packageName });
    await disablePlugin(cwd, packageName);
    ctx.platform?.logger?.info('Plugin disabled', { packageName });

    return {
      ok: true,
      packageName,
      message: `Disabled ${packageName}`,
    };
  },
  formatter(result, ctx, _flags) {
    ctx.ui.info(result.message ?? 'Plugin disabled');
    ctx.ui.info(`Run 'kb plugins ls' to see updated status`);
  },
});

