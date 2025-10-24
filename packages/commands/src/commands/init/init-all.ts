/**
 * @module @kb-labs/cli-commands/init/init-all
 * Main kb init command
 */

import type { Command } from '../../types';
import { initAll as coreInitAll, type ProductId } from '@kb-labs/core-bundle';
import { getExitCode, KbError } from '@kb-labs/core-config';

export const setupAll: Command = {
  name: 'setup',
  category: 'init',
  describe: 'Setup KB Labs workspace with config, profiles, and lockfile',
  longDescription: 'Sets up a complete KB Labs workspace with configuration file, profile scaffold, policy template, and lockfile',
  flags: [
    { name: 'yes', type: 'boolean', description: 'Use defaults without prompts' },
    { name: 'dry-run', type: 'boolean', description: 'Show what would be created without making changes' },
    { name: 'force', type: 'boolean', description: 'Overwrite existing files' },
    { name: 'format', type: 'string', choices: ['yaml', 'json'], default: 'yaml', description: 'Config file format' },
    { name: 'profile-key', type: 'string', default: 'default', description: 'Profile key in workspace config' },
    { name: 'profile-ref', type: 'string', description: 'Profile reference (npm package or local path)' },
    { name: 'products', type: 'string', description: 'Comma-separated product IDs (e.g., aiReview,devlink)' },
    { name: 'preset', type: 'string', description: 'Preset reference to extend' },
    { name: 'policy-bundle', type: 'string', description: 'Policy bundle name' },
    { name: 'json', type: 'boolean', description: 'Output in JSON format' },
  ],
  examples: [
    'kb setup --yes',
    'kb setup --format json --products aiReview,devlink',
    'kb setup --profile-ref @kb-labs/profile-node-ts@^1.0.0',
    'kb setup --dry-run',
  ],
  
  async run(ctx, argv, flags) {
    const cwd = process.cwd();
    const yes = flags.yes as boolean || false;
    const dryRun = flags['dry-run'] as boolean || false;
    const force = flags.force as boolean || false;
    const format = (flags.format as 'yaml' | 'json') || 'yaml';
    const profileKey = (flags['profile-key'] as string) || 'default';
    const profileRef = flags['profile-ref'] as string | undefined;
    const productsStr = flags.products as string | undefined;
    const presetRef = flags.preset as string | undefined;
    const policyBundle = flags['policy-bundle'] as string | undefined;
    const jsonOutput = flags.json as boolean || false;
    
    // Parse products
    const products: ProductId[] = productsStr
      ? (productsStr.split(',').map(p => p.trim()) as ProductId[])
      : ['aiReview'];
    
    // With --yes, enable scaffoldLocalProfile by default
    const scaffoldLocalProfile = yes || (!profileRef || profileRef.startsWith('./'));
    
    try {
      const result = await coreInitAll({
        cwd,
        format,
        products,
        profileKey,
        profileRef: profileRef || (scaffoldLocalProfile ? 'node-ts-lib' : undefined),
        presetRef: presetRef || null,
        scaffoldLocalProfile,
        policyBundle: policyBundle || null,
        dryRun,
        force,
      });
      
      if (jsonOutput) {
        // JSON output
        ctx.presenter.json({
          schemaVersion: '1.0',
          ...result,
        });
      } else {
        // Human-friendly output
        if (dryRun) {
          ctx.presenter.write('🔍 Dry run - no files will be modified\n\n');
        }
        
        // Show actions
        if (result.workspace.created.length > 0) {
          ctx.presenter.write('✔ workspace config created\n');
        } else if (result.workspace.updated.length > 0) {
          ctx.presenter.write('✔ workspace config updated\n');
        } else if (result.workspace.skipped.length > 0) {
          ctx.presenter.write('⊘ workspace config unchanged\n');
        }
        
        if (result.profile.created.length > 0) {
          ctx.presenter.write('✔ profile scaffold created\n');
        } else if (result.profile.updated.length > 0) {
          ctx.presenter.write('✔ profile updated\n');
        } else if (result.profile.skipped.length > 0) {
          ctx.presenter.write('⊘ profile unchanged\n');
        }
        
        if (result.policy.updated.length > 0) {
          ctx.presenter.write('ℹ policy scaffold added\n');
        } else if (result.policy.skipped.length > 0) {
          ctx.presenter.write('ℹ policy scaffold skipped\n');
        }
        
        if (result.lockfile.created.length > 0) {
          ctx.presenter.write('✔ lockfile created\n');
        } else if (result.lockfile.updated.length > 0) {
          ctx.presenter.write('ℹ lockfile updated\n');
        }
        
        // Show warnings
        const allWarnings = [
          ...result.workspace.warnings,
          ...result.profile.warnings,
          ...result.policy.warnings,
          ...result.lockfile.warnings,
        ];
        
        if (allWarnings.length > 0) {
          ctx.presenter.write('\n');
          for (const warning of allWarnings) {
            ctx.presenter.write(`⚠ ${warning}\n`);
          }
        }
        
        // Show conflicts
        const conflicts = [
          ...result.workspace.actions.filter((a: any) => a.kind === 'conflict'),
          ...result.profile.actions.filter((a: any) => a.kind === 'conflict'),
          ...result.policy.actions.filter((a: any) => a.kind === 'conflict'),
          ...result.lockfile.actions.filter((a: any) => a.kind === 'conflict'),
        ];
        
        if (conflicts.length > 0) {
          ctx.presenter.write('\n❌ Conflicts detected:\n');
          for (const conflict of conflicts) {
            ctx.presenter.write(`   ${conflict.path}\n`);
            if (conflict.previewDiff) {
              ctx.presenter.write(`\n${conflict.previewDiff}\n\n`);
            }
          }
          ctx.presenter.write('Use --force to overwrite\n');
          return 2;
        }
        
        // Summary
        ctx.presenter.write('\n');
        ctx.presenter.write(
          `Summary: created ${result.stats.created}, updated ${result.stats.updated}, ` +
          `skipped ${result.stats.skipped}, conflicts ${result.stats.conflicts}\n`
        );
        
        // Next steps
        if (!dryRun && result.stats.conflicts === 0) {
          ctx.presenter.write('\nNext:\n');
          ctx.presenter.write('  • kb bundle print --product aiReview\n');
        }
      }
      
      return 0;
    } catch (error: unknown) {
      if (error instanceof KbError) {
        if (jsonOutput) {
          ctx.presenter.json({
            error: {
              code: error.code,
              message: error.message,
              hint: error.hint,
              meta: error.meta,
            },
          });
        } else {
          ctx.presenter.error(`❌ ${error.message}\n`);
          if (error.hint) {
            ctx.presenter.error(`   Hint: ${error.hint}\n`);
          }
        }
        return getExitCode(error);
      }
      
      // Unknown error
      if (jsonOutput) {
        ctx.presenter.json({
          error: {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          },
        });
      } else {
        ctx.presenter.error(`❌ ${error instanceof Error ? error.message : String(error)}\n`);
      }
      return 1;
    }
  },
};

