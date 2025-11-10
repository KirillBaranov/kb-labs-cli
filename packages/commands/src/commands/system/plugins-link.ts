/**
 * plugins:link command - Link a local plugin for development
 */

import type { Command } from "../../types/types.js";
import { linkPlugin } from '../../registry/plugins-state.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getContextCwd } from "@kb-labs/shared-cli-ui";

export const pluginsLink: Command = {
  name: "plugins:link",
  category: "system",
  describe: "Link a local plugin for development",
  examples: [
    "kb plugins link ./packages/my-plugin",
    "kb plugins link ../kb-labs-devlink",
  ],

  async run(ctx, argv, flags) {
    if (argv.length === 0) {
      ctx.presenter.error("Please specify a plugin path to link");
      ctx.presenter.info("Usage: kb plugins link <path>");
      return 1;
    }

    const pluginPath = argv[0];
    if (!pluginPath) {
      ctx.presenter.error("Please specify a plugin path to link");
      return 1;
    }
    const cwd = getContextCwd(ctx);
    const absPath = path.resolve(cwd, pluginPath);

    try {
      // Check if path exists and has package.json
      const pkgJsonPath = path.join(absPath, 'package.json');
      await fs.access(pkgJsonPath);
      
      const pkgJson = JSON.parse(await fs.readFile(pkgJsonPath, 'utf8'));
      
      // Check if it's a plugin
      const hasManifest = pkgJson.kb?.commandsManifest || pkgJson.exports?.['./kb/commands'];
      if (!hasManifest) {
        ctx.presenter.warn(`Package ${pkgJson.name || pluginPath} doesn't appear to be a KB CLI plugin`);
        ctx.presenter.info('Add "kb.commandsManifest" or "exports[\\"./kb/commands\\"]" to package.json');
      }
      
      await linkPlugin(cwd, absPath);
      
      ctx.presenter.info(`Linked ${pkgJson.name || pluginPath} from ${absPath}`);
      ctx.presenter.info(`The plugin will be discovered on next CLI run`);
      
      // Also update kb-labs.config.json if it exists
      try {
        const configPath = path.join(cwd, 'kb-labs.config.json');
        const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
        
        if (!config.plugins) {
          config.plugins = {};
        }
        if (!config.plugins.linked) {
          config.plugins.linked = [];
        }
        
        if (!config.plugins.linked.includes(pkgJson.name)) {
          config.plugins.linked.push(pkgJson.name);
          await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
          ctx.presenter.info(`Added ${pkgJson.name} to kb-labs.config.json plugins.linked`);
        }
      } catch {
        // Config doesn't exist or can't update, that's ok
      }
      
      return 0;
    } catch (e: unknown) {
      if ((e as any).code === 'ENOENT') {
        ctx.presenter.error(`Path not found: ${absPath}`);
        ctx.presenter.info("Make sure the path exists and contains a package.json file");
      } else {
        const errorMessage = e instanceof Error ? e.message : String(e);
        ctx.presenter.error(`Failed to link plugin: ${errorMessage}`);
      }
      return 1;
    }
  },
};

