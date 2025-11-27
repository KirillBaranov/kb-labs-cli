import { defineSystemCommand, type CommandResult } from '@kb-labs/cli-command-kit';
import { clearCache } from '../registry/plugins-state';
import { getContextCwd } from '@kb-labs/shared-cli-ui';
import { box, keyValue, safeSymbols, safeColors } from '@kb-labs/shared-cli-ui';

type PluginsCacheClearFlags = {
  deep: { type: 'boolean'; description?: string };
  json: { type: 'boolean'; description?: string };
};

type PluginsCacheClearResult = CommandResult & {
  action?: string;
  files?: string[];
  modules?: string[];
  count?: number;
  modulesCount?: number;
};

export const pluginsCacheClear = defineSystemCommand<PluginsCacheClearFlags, PluginsCacheClearResult>({
  name: 'clear-cache',
  description: 'Clear CLI plugin discovery cache',
  category: 'plugins',
  examples: ['kb plugins clear-cache', 'kb plugins clear-cache --deep'],
  flags: {
    deep: { type: 'boolean', description: 'Also clear Node.js module cache' },
    json: { type: 'boolean', description: 'Output in JSON format' },
  },
  analytics: {
    command: 'plugins:clear-cache',
    startEvent: 'PLUGINS_CACHE_CLEAR_STARTED',
    finishEvent: 'PLUGINS_CACHE_CLEAR_FINISHED',
  },
  async handler(ctx, argv, flags) {
    const deep = flags.deep; // Type-safe: boolean
    const cwd = getContextCwd(ctx);
    const result = await clearCache(cwd, { deep });

    ctx.logger?.info('Cache cleared', {
      filesCount: result.files.length,
      modulesCount: result.modules?.length || 0,
      deep,
    });

    return {
      ok: true,
      action: 'cache:clear',
      files: result.files,
      modules: result.modules,
      count: result.files.length,
      modulesCount: result.modules?.length || 0,
    };
  },
  formatter(result, ctx, flags) {
    if (flags.json) { // Type-safe: boolean
      ctx.output?.json(result);
    } else {
      if (!ctx.output) {
        throw new Error('Output not available');
      }

      const files = result.files ?? [];
      const modules = result.modules ?? [];
      const summary = keyValue({
        Action: 'Cache Cleared',
        'Files Removed': files.length > 0 ? files.join(', ') : 'none',
        ...(flags.deep && modules.length > 0
          ? { 'Modules Cleared': modules.length.toString() }
          : {}),
        Status:
          files.length > 0
            ? safeSymbols.success + ' Success'
            : safeSymbols.info + ' No cache found',
      });

      const output = box('Cache Management', [
        ...summary,
        '',
        files.length > 0
          ? safeColors.dim(`Removed ${files.length} cache file(s)`)
          : safeColors.dim('No cache files to remove'),
        ...(flags.deep && modules.length > 0
          ? [safeColors.dim(`Cleared ${modules.length} module(s) from cache`)]
          : []),
      ]);
      ctx.output.write(output);
    }
  },
});
