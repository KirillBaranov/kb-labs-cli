/**
 * plugins:enable command - Enable a plugin
 */

import { defineSystemCommand, type CommandResult, type FlagSchemaDefinition } from '@kb-labs/shared-command-kit';
import { generateExamples } from '../../utils/generate-examples';
import { enablePlugin } from '../../registry/plugins-state';
import { getContextCwd } from '@kb-labs/shared-cli-ui';

type PluginsEnableResult = CommandResult & {
  packageName?: string;
  permissions?: string[];
  message?: string;
};

type PluginsEnableFlags = {
  perm: { type: 'array'; description?: string };
};

export const pluginsEnable = defineSystemCommand<PluginsEnableFlags, PluginsEnableResult>({
  name: 'enable',
  description: 'Enable a plugin',
  category: 'plugins',
  examples: generateExamples('enable', 'plugins', [
    { flags: {} },  // kb plugins enable (will need <package> arg in actual usage)
    { flags: { perm: ['fs.write'] } },  // kb plugins enable --perm fs.write
  ]),
  flags: {
    perm: {
      type: 'array',
      description: 'Grant specific permissions (e.g., --perm fs.write --perm net.fetch)',
    },
  },
  analytics: {
    command: 'plugins:enable',
    startEvent: 'PLUGINS_ENABLE_STARTED',
    finishEvent: 'PLUGINS_ENABLE_FINISHED',
  },
  async handler(ctx, argv, flags) {
    if (argv.length === 0) {
      throw new Error('Please specify a plugin name to enable');
    }

    const packageName = argv[0];
    if (!packageName) {
      throw new Error('Please specify a plugin name to enable');
    }
    const permissions = Array.isArray(flags.perm) ? flags.perm.map(String) : []; // Type-safe: string[]
    const cwd = getContextCwd(ctx);

    ctx.platform?.logger?.info('Enabling plugin', { packageName, permissions });
    await enablePlugin(cwd, packageName);

    if (permissions.length > 0) {
      const { grantPermissions } = await import('../../registry/plugins-state');
      await grantPermissions(cwd, packageName, permissions);
      ctx.platform?.logger?.info('Plugin enabled with permissions', { packageName, permissions });
      return {
        ok: true,
        packageName,
        permissions,
        message: `Enabled ${packageName} with permissions: ${permissions.join(', ')}`,
      };
    } else {
      ctx.platform?.logger?.info('Plugin enabled', { packageName });
      return {
        ok: true,
        packageName,
        message: `Enabled ${packageName}`,
      };
    }
  },
  formatter(result, ctx, flags) {
    ctx.ui.info(result.message ?? 'Plugin enabled');
    ctx.ui.info(`Run 'kb plugins ls' to see updated status`);
  },
});

