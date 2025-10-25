import type { Command } from "../../types";
import { buildPack } from '@kb-labs/mind-pack';
import { DEFAULT_BUDGET, DEFAULT_PRESET } from '@kb-labs/mind-core';
import { promises as fsp } from 'node:fs';
import { join } from 'node:path';

export const mindPack: Command = {
  name: "pack",
  category: "mind",
  describe: "Build context pack from Mind indexes",
  aliases: ["mind:pack"],
  flags: [
    { 
      name: "cwd", 
      type: "string", 
      default: process.cwd(),
      description: "Working directory" 
    },
    { 
      name: "intent", 
      type: "string", 
      required: true,
      description: "Intent description for the context pack" 
    },
    { 
      name: "product", 
      type: "string", 
      description: "Product identifier (e.g., devlink, aiReview)" 
    },
    { 
      name: "preset", 
      type: "string", 
      default: "balanced",
      description: "Context preset name" 
    },
    { 
      name: "budget", 
      type: "number", 
      default: 8000,
      description: "Total token budget" 
    },
    { 
      name: "stdout", 
      type: "boolean", 
      description: "Output Markdown to stdout only" 
    },
    { 
      name: "with-bundle", 
      type: "boolean", 
      description: "Include bundle information" 
    },
    { 
      name: "json", 
      type: "boolean", 
      description: "Output in JSON format" 
    }
  ],
  examples: [
    "kb mind pack --intent 'implement feature X'",
    "kb mind pack --intent 'fix bug Y' --product devlink --stdout",
    "kb mind pack --intent 'review code' --budget 12000 --json"
  ],

  async run(ctx, argv, flags) {
    const { 
      cwd = process.cwd(), 
      intent, 
      product, 
      preset = "balanced", 
      budget = 8000, 
      stdout = false, 
      withBundle = false, 
      json = false 
    } = flags;

    try {
      const result = await buildPack({
        cwd,
        intent,
        product,
        preset: preset === "balanced" ? DEFAULT_PRESET : undefined,
        budget: {
          ...DEFAULT_BUDGET,
          totalTokens: budget
        },
        withBundle,
        log: (e) => {
          if (e.level === 'error') {
            ctx.presenter.error(`❌ ${e.msg}\n`);
          } else if (e.level === 'warn') {
            ctx.presenter.warn(`⚠️  ${e.msg}\n`);
          }
        }
      });

      if (json) {
        ctx.presenter.json(result.json);
      } else if (stdout) {
        // Output only Markdown to stdout (for piping to Cursor)
        ctx.presenter.write(result.markdown);
      } else {
        // Write to files and show summary
        const packsDir = join(cwd, '.kb', 'mind', 'packs');
        await fsp.mkdir(packsDir, { recursive: true });
        
        await Promise.all([
          fsp.writeFile(join(packsDir, 'last-pack.md'), result.markdown, 'utf8'),
          fsp.writeFile(join(packsDir, 'last-pack.json'), JSON.stringify(result.json, null, 2), 'utf8')
        ]);

        ctx.presenter.success("✅ Context pack generated\n");
        ctx.presenter.write(`   Intent: ${intent}\n`);
        ctx.presenter.write(`   Product: ${product || 'none'}\n`);
        ctx.presenter.write(`   Tokens: ${result.tokensEstimate}\n`);
        ctx.presenter.write(`   Files: .kb/mind/packs/last-pack.{md,json}\n`);
      }
      
      return 0;
    } catch (error: any) {
      ctx.presenter.error(`❌ Failed to build pack: ${error.message}\n`);
      if (error.hint) {
        ctx.presenter.error(`   Hint: ${error.hint}\n`);
      }
      return 1;
    }
  }
};
