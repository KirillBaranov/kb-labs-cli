/**
 * plugins:disable command - Disable a plugin
 */

import type { Command } from "../../types/types.js";
import { disablePlugin } from '../../registry/plugins-state.js';

export const pluginsDisable: Command = {
  name: "plugins:disable",
  category: "system",
  describe: "Disable a plugin",
  examples: [
    "kb plugins disable @kb-labs/devlink-cli",
  ],

  async run(ctx, argv, flags) {
    if (argv.length === 0) {
      ctx.presenter.error("Please specify a plugin name to disable");
      return 1;
    }

    const packageName = argv[0];

    try {
      await disablePlugin(process.cwd(), packageName);
      ctx.presenter.info(`Disabled ${packageName}`);
      ctx.presenter.info(`Run 'kb plugins ls' to see updated status`);
      return 0;
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      ctx.presenter.error(`Failed to disable ${packageName}: ${errorMessage}`);
      return 1;
    }
  },
};

