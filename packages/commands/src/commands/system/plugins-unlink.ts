/**
 * plugins:unlink command - Unlink a local plugin
 */

import type { Command } from "../../types/types.js";
import { unlinkPlugin, loadPluginsState } from '../../registry/plugins-state.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const pluginsUnlink: Command = {
  name: "plugins:unlink",
  category: "system",
  describe: "Unlink a local plugin",
  examples: [
    "kb plugins unlink ./packages/my-plugin",
    "kb plugins unlink @kb-labs/devlink-cli",
  ],

  async run(ctx, argv, flags) {
    if (argv.length === 0) {
      ctx.presenter.error("Please specify a plugin path or name to unlink");
      ctx.presenter.info("Usage: kb plugins unlink <path|name>");
      return 1;
    }

    const identifier = argv[0];
    const state = await loadPluginsState(process.cwd());

    try {
      // Try as path first
      let absPath: string;
      try {
        absPath = path.resolve(process.cwd(), identifier);
        await fs.access(absPath);
      } catch {
        // Try to find by package name in linked list
        const matched = state.linked.find(p => p.includes(identifier) || p.endsWith(identifier));
        if (matched) {
          absPath = matched;
        } else {
          ctx.presenter.error(`Plugin not found: ${identifier}`);
          ctx.presenter.info(`Linked plugins: ${state.linked.length > 0 ? state.linked.join(', ') : 'none'}`);
          return 1;
        }
      }

      await unlinkPlugin(process.cwd(), absPath);
      
      ctx.presenter.info(`Unlinked ${identifier}`);
      ctx.presenter.info(`Run 'kb plugins ls' to see updated status`);
      
      return 0;
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      ctx.presenter.error(`Failed to unlink plugin: ${errorMessage}`);
      return 1;
    }
  },
};

