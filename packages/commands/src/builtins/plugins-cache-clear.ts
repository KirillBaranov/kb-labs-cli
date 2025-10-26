import { promises as fs } from 'node:fs';
import path from 'node:path';

export default {
  name: 'plugins cache clear',
  describe: 'Clear CLI plugin discovery cache',
  async run(ctx: any, argv: string[], flags: Record<string, any>) {
    const cwd = process.cwd();
    const cachePath = path.join(cwd, '.kb', 'cache', 'cli-manifests.json');
    
    try {
      await fs.unlink(cachePath);
      if (flags.json) {
        ctx.presenter.json({ ok: true, action: 'cache:clear', path: cachePath });
      } else {
        ctx.presenter.write(`Cache cleared: ${cachePath}\n`);
      }
      return 0;
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        if (flags.json) {
          ctx.presenter.json({ ok: true, action: 'cache:clear', message: 'No cache to clear' });
        } else {
          ctx.presenter.write('No cache file found\n');
        }
        return 0;
      }
      if (flags.json) {
        ctx.presenter.json({ ok: false, error: err.message });
      } else {
        ctx.presenter.write(`Failed to clear cache: ${err.message}\n`);
      }
      return 1;
    }
  }
};
