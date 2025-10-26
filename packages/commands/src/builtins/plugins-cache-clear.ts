import { promises as fs } from 'node:fs';
import path from 'node:path';
import { box, keyValue, formatTiming, TimingTracker, safeSymbols, safeColors } from '@kb-labs/shared-cli-ui';

export default {
  name: 'plugins cache clear',
  describe: 'Clear CLI plugin discovery cache',
  async run(ctx: any, argv: string[], flags: Record<string, any>) {
    const tracker = new TimingTracker();
    const jsonMode = !!flags.json;
    
    try {
      const cwd = process.cwd();
      const cachePath = path.join(cwd, '.kb', 'cache', 'cli-manifests.json');
      
      await fs.unlink(cachePath);
      const totalTime = tracker.total();
      
      if (jsonMode) {
        ctx.presenter.json({ 
          ok: true, 
          action: 'cache:clear', 
          path: cachePath,
          timing: totalTime 
        });
      } else {
        const summary = keyValue({
          'Action': 'Cache Cleared',
          'Path': cachePath,
          'Status': safeSymbols.success + ' Success',
        });
        
        const output = box('Cache Management', [...summary, '', safeColors.dim(`Time: ${formatTiming(totalTime)}`)]);
        ctx.presenter.write(output);
      }
      
      return 0;
    } catch (err: any) {
      const totalTime = tracker.total();
      
      if (err.code === 'ENOENT') {
        if (jsonMode) {
          ctx.presenter.json({ 
            ok: true, 
            action: 'cache:clear', 
            message: 'No cache to clear',
            timing: totalTime 
          });
        } else {
          const summary = keyValue({
            'Action': 'Cache Check',
            'Status': safeSymbols.info + ' No cache found',
            'Message': 'Cache file does not exist',
          });
          
          const output = box('Cache Management', [...summary, '', safeColors.dim(`Time: ${formatTiming(totalTime)}`)]);
          ctx.presenter.write(output);
        }
        return 0;
      }
      
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
