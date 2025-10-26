/**
 * plugins:list command - List all discovered CLI plugins
 */

import type { Command } from "../../types/types.js";
import type { RegisteredCommand } from '../../registry/types.js';
import { registry } from "../../utils/registry.js";
import { box, keyValue, formatTiming, TimingTracker, safeSymbols, safeColors } from "@kb-labs/shared-cli-ui";

export const pluginsList: Command = {
  name: "plugins",
  category: "system",
  describe: "List all discovered CLI plugins",
  aliases: ["plugins:list", "list"],
  flags: [
    {
      name: "json",
      type: "boolean",
      description: "Output in JSON format",
    },
  ],
  examples: [
    "kb plugins list",
    "kb plugins list --json",
    "kb plugins --json",
  ],

  async run(ctx, argv, flags) {
    const tracker = new TimingTracker();
    const jsonMode = !!flags.json;
    
    try {
      tracker.checkpoint('discover');
      
      const manifests = registry.listManifests();
      const productGroups = registry.listProductGroups();
      
      const totalTime = tracker.total();
      
      if (jsonMode) {
        // JSON output with all fields
        const output = manifests.map(cmd => ({
          id: cmd.manifest.id,
          aliases: cmd.manifest.aliases || [],
          group: cmd.manifest.group,
          describe: cmd.manifest.describe,
          source: cmd.source,
          shadowed: cmd.shadowed,
          available: cmd.available,
          ...(cmd.unavailableReason && { reason: cmd.unavailableReason }),
          ...(cmd.hint && { hint: cmd.hint }),
        }));
        
        ctx.presenter.json({
          ok: true,
          commands: output,
          total: output.length,
          available: output.filter(c => c.available).length,
          unavailable: output.filter(c => !c.available).length,
          shadowed: output.filter(c => c.shadowed).length,
          products: productGroups.length,
          timing: totalTime,
        });
        return 0;
      }
      
      // Text output - grouped by products
      const available = manifests.filter(c => c.available && !c.shadowed).length;
      const unavailable = manifests.filter(c => !c.available).length;
      const shadowed = manifests.filter(c => c.shadowed).length;
      const total = manifests.length;
      
      // Summary section
      const summary = keyValue({
        'Total': `${total} commands in ${productGroups.length} products`,
        'Available': `${available}`,
        'Unavailable': unavailable > 0 ? `${unavailable}` : 'none',
        'Shadowed': shadowed > 0 ? `${shadowed}` : 'none',
      });
      
      // Products section
      const productLines: string[] = [];
      
      // Emoji map for products
      const emojiMap: Record<string, string> = {
        'devlink': '🔗',
        'profiles': '📋',
        'mind': '🧠',
        'bundle': '📦',
        'init': '🚀',
        'policy': '📜',
      };
      
      for (const product of productGroups.sort((a, b) => a.name.localeCompare(b.name))) {
        const emoji = emojiMap[product.name] || '📦';
        const availableCount = product.commands.filter(c => c.available && !c.shadowed).length;
        const unavailableCount = product.commands.filter(c => !c.available || c.shadowed).length;
        
        productLines.push(`${emoji} ${safeColors.info(safeColors.bold(product.name))}`);
        productLines.push(`  ${availableCount > 0 ? safeSymbols.success : safeSymbols.error} ${availableCount} available${unavailableCount > 0 ? safeColors.dim(` | ${safeSymbols.error} ${unavailableCount} unavailable`) : ''}`);
        
        // Show commands for this product (deduplicate by ID)
        const uniqueCommands = new Map<string, RegisteredCommand>();
        for (const cmd of product.commands) {
          if (!uniqueCommands.has(cmd.manifest.id)) {
            uniqueCommands.set(cmd.manifest.id, cmd);
          }
        }
        
        const sortedCmds = Array.from(uniqueCommands.values()).sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
        
        for (const cmd of sortedCmds) {
          const status = cmd.available && !cmd.shadowed ? safeSymbols.success : 
                         cmd.shadowed ? safeSymbols.warning : 
                         safeSymbols.error;
          
          const statusText = cmd.shadowed ? safeColors.dim(' (shadowed)') : '';
          const sourceBadge = safeColors.dim(`[${cmd.source}]`);
          
          productLines.push(`    ${status} ${safeColors.info(cmd.manifest.id.padEnd(25))} ${sourceBadge}${statusText}`);
          
          // Show reason for unavailable/shadowed
          if (!cmd.available && cmd.unavailableReason) {
            productLines.push(`      ${safeColors.error(`Reason: ${cmd.unavailableReason}`)}`);
            if (cmd.hint) {
              productLines.push(`      ${safeColors.warning(`Hint: ${cmd.hint}`)}`);
            }
          }
          if (cmd.shadowed && cmd.source === 'node_modules') {
            productLines.push(`      ${safeColors.dim('Shadowed by workspace version')}`);
          }
        }
        
        productLines.push('');
      }
      
      const sections = [
        safeColors.bold('Summary:'),
        ...summary,
        '',
        safeColors.bold('Products:'),
        ...productLines,
        safeColors.bold('Next Steps:'),
        `  ${safeColors.info('kb <product> --help')}  ${safeColors.dim('Explore product commands')}`,
        `  ${safeColors.info('kb plugins --json')}  ${safeColors.dim('Get machine-readable output')}`,
        '',
        safeColors.dim(`Discovery: ${formatTiming(totalTime)}`),
      ];
      
      const output = box('KB Labs CLI Plugins', sections);
      ctx.presenter.write(output);
      
      return 0;
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      if (jsonMode) {
        ctx.presenter.json({ ok: false, error: errorMessage, timing: tracker.total() });
      } else {
        ctx.presenter.error(errorMessage);
      }
      return 1;
    }
  },
};

