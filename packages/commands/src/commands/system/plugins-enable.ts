/**
 * plugins:enable command - Enable a plugin
 */

import type { Command } from "../../types/types.js";
import { enablePlugin, loadPluginsState } from '../../registry/plugins-state.js';
import { safeColors } from "@kb-labs/shared-cli-ui";

export const pluginsEnable: Command = {
  name: "plugins:enable",
  category: "system",
  describe: "Enable a plugin",
  flags: [
    {
      name: "perm",
      type: "array",
      description: "Grant specific permissions (e.g., --perm fs.write --perm net.fetch)",
    },
  ],
  examples: [
    "kb plugins enable @kb-labs/devlink-cli",
    "kb plugins enable @kb-labs/devlink-cli --perm fs.write",
  ],

  async run(ctx, argv, flags) {
    if (argv.length === 0) {
      ctx.presenter.error("Please specify a plugin name to enable");
      return 1;
    }

    const packageName = argv[0];
    if (!packageName) {
      ctx.presenter.error("Please specify a plugin name to enable");
      return 1;
    }
    const permissions = flags.perm as string[] || [];

    try {
      await enablePlugin(process.cwd(), packageName);
      
      if (permissions.length > 0) {
        const { grantPermissions } = await import('../../registry/plugins-state.js');
        await grantPermissions(process.cwd(), packageName, permissions);
        ctx.presenter.info(`Enabled ${packageName} with permissions: ${permissions.join(', ')}`);
      } else {
        ctx.presenter.info(`Enabled ${packageName}`);
      }
      
      ctx.presenter.info(`Run 'kb plugins ls' to see updated status`);
      return 0;
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      ctx.presenter.error(`Failed to enable ${packageName}: ${errorMessage}`);
      return 1;
    }
  },
};

