import { box, keyValue, formatTiming, TimingTracker, safeSymbols, safeColors } from '@kb-labs/shared-cli-ui';
import { clearCache } from '../registry/plugins-state';
import { Command } from '../types/types';

export const pluginsCacheClear: Command = {
  name: 'plugins:clear-cache',
  aliases: ['plugins cache clear'],
  describe: 'Clear CLI plugin discovery cache',
  async run(ctx: any, argv: string[], flags: Record<string, any>) {
    const tracker = new TimingTracker();
    const jsonMode = !!flags.json;
    
    try {
      const cwd = process.cwd();
      const cleared = await clearCache(cwd);
      const totalTime = tracker.total();
      
      if (jsonMode) {
        ctx.presenter.json({ 
          ok: true, 
          action: 'cache:clear',
          cleared: cleared,
          count: cleared.length,
          timing: totalTime 
        });
      } else {
        const summary = keyValue({
          'Action': 'Cache Cleared',
          'Files Removed': cleared.length > 0 ? cleared.join(', ') : 'none',
          'Status': cleared.length > 0 ? safeSymbols.success + ' Success' : safeSymbols.info + ' No cache found',
        });
        
        const output = box('Cache Management', [
          ...summary, 
          '',
          cleared.length > 0 ? safeColors.dim(`Removed ${cleared.length} cache file(s)`) : safeColors.dim('No cache files to remove'),
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
