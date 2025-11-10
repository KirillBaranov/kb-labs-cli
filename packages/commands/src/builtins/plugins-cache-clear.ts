import { box, keyValue, formatTiming, TimingTracker, safeSymbols, safeColors } from '@kb-labs/shared-cli-ui';
import { clearCache } from '../registry/plugins-state';
import type { Command } from '../types/types';
import { getContextCwd } from "@kb-labs/shared-cli-ui";

export const pluginsCacheClear: Command = {
  name: 'plugins:clear-cache',
  aliases: ['plugins cache clear'],
  describe: 'Clear CLI plugin discovery cache',
  flags: [
    {
      name: 'deep',
      type: 'boolean',
      description: 'Also clear Node.js module cache',
    },
  ],
  async run(ctx: any, argv: string[], flags: Record<string, any>) {
    const tracker = new TimingTracker();
    const jsonMode = !!flags.json;
    const deep = !!flags.deep;
    
    try {
      const cwd = getContextCwd(ctx);
      const result = await clearCache(cwd, { deep });
      const totalTime = tracker.total();
      
      if (jsonMode) {
        ctx.presenter.json({ 
          ok: true, 
          action: 'cache:clear',
          files: result.files,
          modules: result.modules,
          count: result.files.length,
          modulesCount: result.modules?.length || 0,
          timing: totalTime 
        });
      } else {
        const summary = keyValue({
          'Action': 'Cache Cleared',
          'Files Removed': result.files.length > 0 ? result.files.join(', ') : 'none',
          ...(deep && result.modules ? { 'Modules Cleared': result.modules.length.toString() } : {}),
          'Status': result.files.length > 0 ? safeSymbols.success + ' Success' : safeSymbols.info + ' No cache found',
        });
        
        const output = box('Cache Management', [
          ...summary, 
          '',
          result.files.length > 0 ? safeColors.dim(`Removed ${result.files.length} cache file(s)`) : safeColors.dim('No cache files to remove'),
          ...(deep && result.modules && result.modules.length > 0 ? [safeColors.dim(`Cleared ${result.modules.length} module(s) from cache`)] : []),
          '',
          safeColors.dim(`Time: ${formatTiming(totalTime)}`)
        ]);
        ctx.presenter.write(output);
      }
      
      return 0;
    } catch (err: any) {
      const totalTime = tracker.total();
      const errorMessage = err.message || 'Unknown error';
      
      if (jsonMode) {
        ctx.presenter.json({ 
          ok: false, 
          error: errorMessage,
          timing: totalTime 
        });
      } else {
        ctx.presenter.error(errorMessage);
      }
      return 1;
    }
  }
};
