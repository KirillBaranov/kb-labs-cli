import type { Command } from "../../types";
import { buildPack } from '@kb-labs/mind-pack';
import { DEFAULT_BUDGET, DEFAULT_PRESET } from '@kb-labs/mind-core';

export const mindFeed: Command = {
  name: "feed",
  category: "mind",
  describe: "Generate context pack for Cursor (alias to pack --stdout)",
  aliases: ["mind:feed"],
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
      name: "budget", 
      type: "number", 
      default: 8000,
      description: "Total token budget" 
    },
    { 
      name: "with-bundle", 
      type: "boolean", 
      description: "Include bundle information" 
    }
  ],
  examples: [
    "kb mind feed --intent 'implement feature X'",
    "kb mind feed --intent 'fix bug Y' --product devlink | cursor-chat",
    "kb mind feed --intent 'review code' --budget 12000"
  ],

  async run(ctx, argv, flags) {
    const { 
      cwd = process.cwd(), 
      intent, 
      product, 
      budget = 8000, 
      withBundle = false 
    } = flags;

    try {
      const result = await buildPack({
        cwd,
        intent,
        product,
        preset: DEFAULT_PRESET,
        budget: {
          ...DEFAULT_BUDGET,
          totalTokens: budget
        },
        withBundle,
        log: (e) => {
          // Log errors to stderr, not stdout
          if (e.level === 'error') {
            ctx.presenter.error(`❌ ${e.msg}\n`);
          } else if (e.level === 'warn') {
            ctx.presenter.warn(`⚠️  ${e.msg}\n`);
          }
        }
      });

      // Output only Markdown to stdout (for piping to Cursor)
      ctx.presenter.write(result.markdown);
      
      return 0;
    } catch (error: any) {
      ctx.presenter.error(`❌ Failed to generate context: ${error.message}\n`);
      if (error.hint) {
        ctx.presenter.error(`   Hint: ${error.hint}\n`);
      }
      return 1;
    }
  }
};
