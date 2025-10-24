/**
 * @module @kb-labs/cli-commands/init/policy
 * kb init policy command
 */

import type { Command } from '../../types';
import { initPolicy as coreInitPolicy } from '@kb-labs/core-policy';
import { getExitCode, KbError } from '@kb-labs/core-config';

export const setupPolicy: Command = {
  name: 'policy',
  category: 'setup',
  describe: 'Add policy scaffold to workspace config',
  flags: [
    { name: 'bundle-name', type: 'string', default: 'default' },
    { name: 'dry-run', type: 'boolean' },
    { name: 'force', type: 'boolean' },
    { name: 'json', type: 'boolean' },
  ],
  
  async run(ctx, argv, flags) {
    const cwd = process.cwd();
    const bundleName = (flags['bundle-name'] as string) || 'default';
    const dryRun = flags['dry-run'] as boolean || false;
    const force = flags.force as boolean || false;
    const jsonOutput = flags.json as boolean || false;
    
    try {
      const result = await coreInitPolicy({
        cwd,
        bundleName,
        scaffoldCommented: true,
        dryRun,
        force,
      });
      
      if (jsonOutput) {
        ctx.presenter.json(result);
      } else {
        if (result.updated.length > 0) {
          ctx.presenter.write(`✔ Added policy scaffold\n`);
        }
        if (result.skipped.length > 0) {
          ctx.presenter.write(`⊘ Policy scaffold already exists or skipped\n`);
        }
        if (result.warnings.length > 0) {
          result.warnings.forEach((w: string) => ctx.presenter.write(`ℹ ${w}\n`));
        }
      }
      
      return 0;
    } catch (error: unknown) {
      if (error instanceof KbError) {
        if (jsonOutput) {
          ctx.presenter.json({ error: { code: error.code, message: error.message } });
        } else {
          ctx.presenter.error(`❌ ${error.message}\n`);
        }
        return getExitCode(error);
      }
      throw error;
    }
  },
};

