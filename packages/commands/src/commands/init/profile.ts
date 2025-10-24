/**
 * @module @kb-labs/cli-commands/init/profile
 * kb init profile command
 */

import type { Command } from '../../types';
import { initProfile as coreInitProfile } from '@kb-labs/core-profiles';
import { type ProductId, getExitCode, KbError } from '@kb-labs/core-config';

export const setupProfile: Command = {
  name: 'profile',
  category: 'setup',
  describe: 'Setup or link a profile',
  flags: [
    { name: 'profile-key', type: 'string', default: 'default' },
    { name: 'profile-ref', type: 'string', description: 'Profile reference (npm or local path)' },
    { name: 'scaffold-local-profile', type: 'boolean', description: 'Create local profile scaffold' },
    { name: 'products', type: 'string', description: 'Comma-separated product IDs' },
    { name: 'dry-run', type: 'boolean' },
    { name: 'force', type: 'boolean' },
    { name: 'json', type: 'boolean' },
  ],
  
  async run(ctx, argv, flags) {
    const cwd = process.cwd();
    const profileKey = (flags['profile-key'] as string) || 'default';
    const profileRef = flags['profile-ref'] as string | undefined;
    const scaffoldLocalProfile = flags['scaffold-local-profile'] as boolean || false;
    const productsStr = flags.products as string | undefined;
    const dryRun = flags['dry-run'] as boolean || false;
    const force = flags.force as boolean || false;
    const jsonOutput = flags.json as boolean || false;
    
    const products: ProductId[] | undefined = productsStr
      ? (productsStr.split(',').map(p => p.trim()) as ProductId[])
      : undefined;
    
    try {
      const result = await coreInitProfile({
        cwd,
        profileKey,
        profileRef,
        createLocalScaffold: scaffoldLocalProfile,
        products,
        dryRun,
        force,
      });
      
      if (jsonOutput) {
        ctx.presenter.json(result);
      } else {
        if (result.created.length > 0) {
          ctx.presenter.write(`✔ Created ${result.created.length} files\n`);
        }
        if (result.warnings.length > 0) {
          result.warnings.forEach((w: string) => ctx.presenter.write(`⚠ ${w}\n`));
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

