/**
 * plugins:list command - List all discovered CLI plugins
 */

import type { Command } from "../../types/types.js";
import { registry } from "../../utils/registry.js";
import { colors } from "@kb-labs/cli-core";

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
    const manifests = registry.listManifests();
    const productGroups = registry.listProductGroups();
    
    if (flags.json) {
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
      });
      return 0;
    }
    
    // Text output - grouped by products
    const lines: string[] = [];
    
    lines.push(colors.cyan(colors.bold("🔍 KB Labs CLI Plugins Discovery")));
    lines.push("");
    
    // Summary section
    const available = manifests.filter(c => c.available && !c.shadowed).length;
    const unavailable = manifests.filter(c => !c.available).length;
    const shadowed = manifests.filter(c => c.shadowed).length;
    const total = manifests.length;
    
    lines.push(colors.bold("Summary:"));
    lines.push(`  Total: ${total} commands in ${productGroups.length} products`);
    lines.push(`  ${colors.green(`✓ Available: ${available}`)}`);
    if (unavailable > 0) {
      lines.push(`  ${colors.red(`✗ Unavailable: ${unavailable}`)}`);
    }
    if (shadowed > 0) {
      lines.push(`  ${colors.yellow(`⚠ Shadowed: ${shadowed}`)}`);
    }
    lines.push("");
    
    // Products section
    lines.push(colors.bold("📦 Products:"));
    lines.push("");
    
    // Emoji map for products
    const emojiMap: Record<string, string> = {
      'devlink': '🔗',
      'profiles': '📋',
      'mind': '🧠',
      'bundle': '📦',
      'init': '🚀',
    };
    
    for (const product of productGroups.sort((a, b) => a.name.localeCompare(b.name))) {
      const emoji = emojiMap[product.name] || '📦';
      const availableCount = product.commands.filter(c => c.available && !c.shadowed).length;
      const unavailableCount = product.commands.filter(c => !c.available || c.shadowed).length;
      
      lines.push(`  ${emoji} ${colors.cyan(colors.bold(product.name))}`);
      lines.push(`    ${colors.green(`✓ ${availableCount} available`)}${unavailableCount > 0 ? colors.dim(` | ✗ ${unavailableCount} unavailable`) : ''}`);
      
      // Show commands for this product (deduplicate by ID)
      const uniqueCommands = new Map<string, RegisteredCommand>();
      for (const cmd of product.commands) {
        if (!uniqueCommands.has(cmd.manifest.id)) {
          uniqueCommands.set(cmd.manifest.id, cmd);
        }
      }
      
      const sortedCmds = Array.from(uniqueCommands.values()).sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
      
      for (const cmd of sortedCmds) {
        const status = cmd.available && !cmd.shadowed ? colors.green("✓") : 
                       cmd.shadowed ? colors.yellow("⚠") : 
                       colors.red("✗");
        
        const statusText = cmd.shadowed ? " (shadowed)" : "";
        const sourceBadge = colors.dim(`[${cmd.source}]`);
        
        lines.push(`    ${status} ${colors.cyan(cmd.manifest.id.padEnd(25))} ${sourceBadge} ${statusText}`);
        
        // Show reason for unavailable/shadowed
        if (!cmd.available && cmd.unavailableReason) {
          lines.push(`      ${colors.red(`Reason: ${cmd.unavailableReason}`)}`);
          if (cmd.hint) {
            lines.push(`      ${colors.yellow(`Hint: ${cmd.hint}`)}`);
          }
        }
        if (cmd.shadowed && cmd.source === 'node_modules') {
          lines.push(`      ${colors.dim(`Shadowed by workspace version`)}`);
        }
      }
      
      lines.push("");
    }
    
    // Next Steps
    lines.push(colors.bold("Next Steps:"));
    lines.push("");
    lines.push(`  ${colors.cyan("kb <product> --help")}  ${colors.dim("Explore product commands")}`);
    lines.push(`  ${colors.cyan("kb plugins --json")}  ${colors.dim("Get machine-readable output")}`);
    lines.push("");
    
    ctx.presenter.write(lines.join("\n"));
    
    return 0;
  },
};

