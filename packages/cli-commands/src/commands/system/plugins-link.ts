/**
 * plugins:link command - Link a local plugin for development
 */

import { defineSystemCommand, type CommandResult, type FlagSchemaDefinition } from '@kb-labs/shared-command-kit';
import { generateExamples } from '../../utils/generate-examples';
import { linkPlugin } from '../../registry/plugins-state';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getContextCwd } from '@kb-labs/shared-cli-ui';

type PluginsLinkResult = CommandResult & {
  packageName?: string;
  absPath?: string;
  hasManifest?: boolean;
  configUpdated?: boolean;
  message?: string;
};

type PluginsLinkFlags = Record<string, never>;

export const pluginsLink = defineSystemCommand<PluginsLinkFlags, PluginsLinkResult>({
  name: 'link',
  description: 'Link a local plugin for development',
  category: 'plugins',
  examples: generateExamples('link', 'plugins', [
    { flags: {} },  // kb plugins link (requires <path> arg)
  ]),
  flags: {},
  analytics: {
    command: 'plugins:link',
    startEvent: 'PLUGINS_LINK_STARTED',
    finishEvent: 'PLUGINS_LINK_FINISHED',
  },
  async handler(ctx, argv, flags) {
    if (argv.length === 0) {
      throw new Error('Please specify a plugin path to link');
    }

    const pluginPath = argv[0];
    if (!pluginPath) {
      throw new Error('Please specify a plugin path to link');
    }
    const cwd = getContextCwd(ctx);
    const absPath = path.resolve(cwd, pluginPath);

    ctx.platform?.logger?.info('Linking plugin', { pluginPath, absPath });

    // Check if path exists and has package.json
    const pkgJsonPath = path.join(absPath, 'package.json');
    await fs.access(pkgJsonPath);

    const pkgJson = JSON.parse(await fs.readFile(pkgJsonPath, 'utf8'));

    // Check if it's a plugin
    const hasManifest = pkgJson.kb?.commandsManifest || pkgJson.exports?.['./kb/commands'];
    if (!hasManifest) {
      ctx.platform?.logger?.warn('Plugin may not be valid', { packageName: pkgJson.name, pluginPath });
    }

    await linkPlugin(cwd, absPath);

    ctx.platform?.logger?.info('Plugin linked', { packageName: pkgJson.name, absPath });

    // Also update kb.config.json if it exists
    let configUpdated = false;
    try {
      const configPath = path.join(cwd, '.kb', 'kb.config.json');
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
        configUpdated = true;
      }
    } catch {
      // Config doesn't exist or can't update, that's ok
    }

    return {
      ok: true,
      packageName: pkgJson.name || pluginPath,
      absPath,
      hasManifest: !!hasManifest,
      configUpdated,
      message: `Linked ${pkgJson.name || pluginPath} from ${absPath}`,
    };
  },
  formatter(result, ctx, flags) {
    if (!result.hasManifest) {
      ctx.ui.warn(
        `Package ${result.packageName ?? 'unknown'} doesn't appear to be a KB CLI plugin`,
      );
      ctx.ui.info('Add "kb.commandsManifest" or "exports["./kb/commands"]" to package.json');
    }
    ctx.ui.info(result.message ?? 'Plugin linked');
    if (result.configUpdated) {
      ctx.ui.info(`Added ${result.packageName ?? 'unknown'} to kb.config.json plugins.linked`);
    }
    ctx.ui.info(`The plugin will be discovered on next CLI run`);
  },
});

