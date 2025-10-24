/**
 * @module @kb-labs/cli-commands/init/workspace
 * kb init workspace command
 */

import type { Command } from '../../types';
import { initWorkspaceConfig, type ProductId, getExitCode, KbError } from '@kb-labs/core-config';

export const setupWorkspace: Command = {
  name: 'workspace',
  category: 'init',
  describe: 'Setup workspace configuration file',
  flags: [
    { name: 'format', type: 'string', choices: ['yaml', 'json'], default: 'yaml' },
    { name: 'products', type: 'string', description: 'Comma-separated product IDs' },
    { name: 'preset', type: 'string', description: 'Preset reference' },
    { name: 'dry-run', type: 'boolean' },
    { name: 'force', type: 'boolean' },
    { name: 'json', type: 'boolean' },
  ],
  
  async run(ctx, argv, flags) {
    const cwd = process.cwd();
    const format = (flags.format as 'yaml' | 'json') || 'yaml';
    const productsStr = flags.products as string | undefined;
    const presetRef = flags.preset as string | undefined;
    const dryRun = flags['dry-run'] as boolean || false;
    const force = flags.force as boolean || false;
    const jsonOutput = flags.json as boolean || false;
    
    const products: ProductId[] | undefined = productsStr
      ? (productsStr.split(',').map(p => p.trim()) as ProductId[])
      : undefined;
    
    try {
      const result = await initWorkspaceConfig({
        cwd,
        format,
        products,
        presetRef: presetRef || null,
        dryRun,
        force,
      });
      
      if (jsonOutput) {
        ctx.presenter.json(result);
      } else {
        if (result.created.length > 0) {
          ctx.presenter.write(`✔ Created ${result.created.join(', ')}\n`);
        }
        if (result.updated.length > 0) {
          ctx.presenter.write(`✔ Updated ${result.updated.join(', ')}\n`);
        }
        if (result.skipped.length > 0) {
          ctx.presenter.write(`⊘ Skipped ${result.skipped.join(', ')}\n`);
        }
        if (result.warnings.length > 0) {
          result.warnings.forEach((w: string) => ctx.presenter.write(`⚠ ${w}\n`));
        }
      }
      
      return result.actions.some((a: any) => a.kind === 'conflict') ? 2 : 0;
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

