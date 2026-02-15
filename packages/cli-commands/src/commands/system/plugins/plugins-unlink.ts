/**
 * plugins:unlink command - Unlink a local plugin
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit';
import { generateExamples } from '../../../utils/generate-examples';
import { unlinkPlugin, loadPluginsState } from '../../../registry/plugins-state';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getContextCwd } from '@kb-labs/shared-cli-ui';

type PluginsUnlinkResult = CommandResult & {
  identifier?: string;
  absPath?: string;
  message?: string;
};

type PluginsUnlinkFlags = Record<string, never>;

export const pluginsUnlink = defineSystemCommand<PluginsUnlinkFlags, PluginsUnlinkResult>({
  name: 'unlink',
  description: 'Unlink a local plugin',
  category: 'plugins',
  examples: generateExamples('unlink', 'plugins', [
    { flags: {} },  // kb plugins unlink (requires <path-or-name> arg)
  ]),
  flags: {},
  analytics: {
    command: 'plugins:unlink',
    startEvent: 'PLUGINS_UNLINK_STARTED',
    finishEvent: 'PLUGINS_UNLINK_FINISHED',
  },
  async handler(ctx, argv, _flags) {
    if (argv.length === 0) {
      throw new Error('Please specify a plugin path or name to unlink');
    }

    const identifier = argv[0];
    if (!identifier) {
      throw new Error('Please specify a plugin path or name to unlink');
    }
    const cwd = getContextCwd(ctx);
    const state = await loadPluginsState(cwd);

    ctx.platform?.logger?.info('Unlinking plugin', { identifier });

    // Try as path first
    let absPath: string | undefined;
    try {
      absPath = path.resolve(cwd, identifier);
      await fs.access(absPath);
    } catch {
      // Try to find by package name in linked list
      const matched = state.linked.find((p) => p.includes(identifier) || p.endsWith(identifier));
      if (matched) {
        absPath = matched;
      } else {
        ctx.platform?.logger?.warn('Plugin not found', { identifier, linkedPlugins: state.linked });
        throw new Error(`Plugin not found: ${identifier}`);
      }
    }

    if (!absPath) {
      ctx.platform?.logger?.warn('Plugin not found', { identifier });
      throw new Error(`Plugin not found: ${identifier}`);
    }

    await unlinkPlugin(cwd, absPath);

    ctx.platform?.logger?.info('Plugin unlinked', { identifier, absPath });

    return {
      ok: true,
      identifier,
      absPath,
      message: `Unlinked ${identifier}`,
    };
  },
  formatter(result, ctx, _flags) {
    ctx.ui.info(result.message ?? 'Plugin unlinked');
    ctx.ui.info(`Run 'kb plugins ls' to see updated status`);
  },
});

